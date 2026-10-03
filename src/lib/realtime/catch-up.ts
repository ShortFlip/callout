import { RETRY_DELAYS_MS } from '@/lib/utils/retry';

/**
 * How often a live round rereads every player's row as a catch-up for a
 * missed `mark_updated` broadcast (a throttled background tab, a half-dead
 * socket that never raised CHANNEL_ERROR). 5 s because the room is 3–5 players
 * and the read is one small select of their rows: about 12 requests a minute
 * per tab is nothing for Supabase, and a friend's mark that went missing shows
 * up before anyone on the call has finished saying "I've got that one".
 */
export const CATCH_UP_INTERVAL_MS = 5000;

/**
 * How long after a live `mark_updated` for a player a catch-up read must have
 * STARTED before its copy of that player's marks may replace the live ones.
 * The DB lags a broadcast by the sender's 500 ms write debounce plus the
 * request itself (and longer on a slow link), so a read that began just after
 * the broadcast can still return the marks from before it. 3 s covers the
 * debounce and a slow round trip with room to spare; a broadcast that really
 * was missed is only held back until the next tick after that.
 */
export const MARK_REWIND_WINDOW_MS = 3000;

/**
 * How long a winner heard live is safe from being dropped by a catch-up read,
 * and how long a heard retraction blocks a read from re-adding that winner.
 * A win or retraction write rides withRetry (~15.5 s of backoff), so the DB can
 * disagree with the broadcast for that long. Shorter than this and a poll could
 * drop a real fresh win, then re-add it when the write lands, which plays the
 * fanfare twice (GameView announces on every rise in `winners.length`).
 */
export const CATCH_UP_WINNER_GRACE_MS =
  RETRY_DELAYS_MS.reduce((total, delay) => total + delay, 0) + 5000;

/**
 * Live-event times a catch-up read is checked against, so it never rewinds
 * something a broadcast already moved forward. The maps are live refs: a
 * broadcast that lands while the read is in flight still counts.
 */
export interface CatchUpGuard {
  /** Date.now() when the read was sent. */
  startedAt: number;
  /** playerId → when this tab last applied a `mark_updated` for them. */
  markHeardAt: ReadonlyMap<string, number>;
  /** playerId → when this tab last heard a `bingo_retracted` for them. */
  retractHeardAt: ReadonlyMap<string, number>;
}

/**
 * May a DB read that started at `readStartedAt` overwrite state a live event
 * set at `liveAt`? Only when the read began at least `windowMs` after that
 * event; anything earlier may carry the DB's older copy. A player with no live
 * event on record always applies: the read is all we know about them.
 */
export function readMayOverwrite(
  readStartedAt: number,
  liveAt: number | undefined,
  windowMs: number = MARK_REWIND_WINDOW_MS,
): boolean {
  if (liveAt === undefined) return true;
  return readStartedAt >= liveAt + windowMs;
}
