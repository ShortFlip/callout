/**
 * Supabase keepalive ping, run by the Worker's daily Cron Trigger
 * (`custom-worker.ts`).
 *
 * Why it exists: a free-tier Supabase project auto-pauses after about a week
 * with no API traffic, and a paused project means no game night.
 * `.github/workflows/keepalive.yml` pings twice a week, but GitHub switches
 * scheduled workflows off after 60 days without repo activity — exactly the
 * quiet stretch in which the project would also go to sleep. The Cron Trigger
 * is the second, independent pinger that doesn't depend on commits.
 *
 * Deliberately pure: no Next.js, no Supabase client and no `@/` path alias.
 * It is bundled straight into the Worker entry by wrangler, outside the Next
 * build, and the fetch function is injected so vitest can drive it without a
 * network.
 */

/** The slice of `fetch` this module needs, so tests can pass a fake. */
export type KeepaliveFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface KeepaliveOptions {
  /** Project URL, e.g. https://abcd.supabase.co. Undefined when the Worker var is not set. */
  supabaseUrl: string | undefined;
  /** Public anon key. Undefined when the Worker var is not set. */
  anonKey: string | undefined;
  fetchFn: KeepaliveFetch;
  /**
   * Abort the request after this long. A paused or wedged project can hang
   * rather than answer, and a hung ping would sit on the Cron invocation until
   * the platform limit instead of failing quickly and visibly.
   */
  timeoutMs?: number;
}

/** Matches keepalive.yml's `curl -m 30`. */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Run one real REST query against Supabase so the project counts as active.
 *
 * Throws on missing config, on a timeout and on any non-2xx response. The
 * throw is the point: the Cron Trigger's Past Events table records a rejected
 * `waitUntil` promise as a failure, which is the only signal we'll get that the
 * project is asleep or the vars were wiped.
 *
 * @returns the HTTP status, for the success log line.
 */
export async function pingSupabase({
  supabaseUrl,
  anonKey,
  fetchFn,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: KeepaliveOptions): Promise<number> {
  if (!supabaseUrl || !anonKey) {
    // Name the missing var(s) but never echo a value: Cron logs are readable
    // by anyone with dashboard access, and the fix is always the same.
    const missing = [!supabaseUrl && 'SUPABASE_URL', !anonKey && 'SUPABASE_ANON_KEY']
      .filter(Boolean)
      .join(' and ');
    throw new Error(
      `Supabase keepalive is not configured: ${missing} missing. ` +
        'They are set by the master deploy in .github/workflows/deploy.yml (wrangler deploy --var).',
    );
  }

  // Tolerate a trailing slash on the stored URL so we never request `//rest`.
  const baseUrl = supabaseUrl.replace(/\/+$/, '');

  // Same lightweight query keepalive.yml runs: players has a public read
  // policy, so the anon key is enough, and limit=1 keeps the response tiny.
  // Only `id`: browser_id and claim_code are not granted to anon (migration
  // 20261007000000), so `select=*` here would fail the ping.
  const response = await fetchFn(`${baseUrl}/rest/v1/players?select=id&limit=1`, {
    method: 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    // A short slice of the body usually says why (paused project, bad key)
    // without flooding the log. Reading it can itself fail on a broken
    // connection, which shouldn't hide the status we already have.
    const detail = (await response.text().catch(() => '')).slice(0, 200);
    throw new Error(
      `Supabase keepalive failed: HTTP ${response.status}${detail ? ` — ${detail}` : ''}`,
    );
  }

  return response.status;
}
