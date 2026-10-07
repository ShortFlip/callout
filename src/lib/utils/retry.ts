/**
 * Short backoff for a single Supabase read or write that must not be given up
 * on after one blip. Total wait is ~15 s: long enough to ride out a Wi-Fi hiccup
 * or a reconnecting socket, short enough that "try refreshing" still arrives
 * while the player is looking at the screen.
 */
export const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

export type Attempt<T> = { ok: true; value: T } | { ok: false };

/**
 * Run `attempt` until it reports ok, sleeping through `delays` between tries.
 * Returns the last result, so the caller decides what "gave up" means — for a
 * rejoin that is "never write", for a win it is "tell the player".
 *
 * `onFirstFailure` fires once, so a caller can warn without a toast per retry.
 */
export async function withRetry<T>(
  attempt: () => Promise<Attempt<T>>,
  delays: readonly number[] = RETRY_DELAYS_MS,
  onFirstFailure?: () => void,
): Promise<Attempt<T>> {
  // supabase-js reports failures as `{ error }`, but a fetch can still throw
  // (offline, aborted); a throw is just another failed attempt here.
  const run = async (): Promise<Attempt<T>> => {
    try {
      return await attempt();
    } catch (err) {
      console.error('Retryable call threw:', err);
      return { ok: false };
    }
  };
  let result = await run();
  for (let i = 0; !result.ok && i < delays.length; i++) {
    if (i === 0) onFirstFailure?.();
    await new Promise((resolve) => setTimeout(resolve, delays[i]));
    result = await run();
  }
  return result;
}

/**
 * A page's own read gets one more try before it says "couldn't load". Only
 * one, and short: supabase-js already retries a GET three times (~7 s) on a
 * 503/520 or a network error, so this layer only covers what it does not
 * (a 500, a throw outside the fetch). More here would multiply the wait
 * before the Try Again button appears.
 */
export const READ_RETRY_DELAYS_MS = [500];

/** Thrown by retryRead once every try has failed; the first failure's cause is logged by withRetry. */
export class ReadFailedError extends Error {
  constructor() {
    super('Read failed after retrying');
    this.name = 'ReadFailedError';
  }
}

/**
 * withRetry for a read that throws on failure (the shape every library and
 * co-player loader already has). Resolves with the value, or throws
 * ReadFailedError so the caller's catch shows its error state — never the
 * empty one.
 */
export async function retryRead<T>(
  read: () => Promise<T>,
  delays: readonly number[] = READ_RETRY_DELAYS_MS,
): Promise<T> {
  const result = await withRetry<T>(async () => ({ ok: true, value: await read() }), delays);
  if (!result.ok) throw new ReadFailedError();
  return result.value;
}
