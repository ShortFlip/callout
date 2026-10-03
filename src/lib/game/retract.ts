import { checkWin } from './win-detection';
import type { WinPattern } from '@/types/game';

/**
 * How long a winner this tab has just heard about is safe from the DB replay.
 * A bingo_confirmed broadcast (or our own claim) can reach the store before
 * the winner's `won = true` write commits; a replay that reads in that gap
 * must not mistake "not written yet" for "retracted". A normal write lands in
 * well under a second, and two of withRetry's short retries fit inside this.
 */
export const RETRACT_REPLAY_GRACE_MS = 5000;

/**
 * Should my win be retracted after a mark change? Yes when I am a winner and my
 * marks no longer hold any enabled pattern — the early bingo that backed off.
 * Unmarking a square that leaves another line intact keeps the win.
 */
export function shouldRetractWin(params: {
  isWinner: boolean;
  marks: readonly number[];
  boardSize: number;
  winPatterns: WinPattern[];
  freeIndex: number | null;
}): boolean {
  if (!params.isWinner) return false;
  return checkWin(new Set(params.marks), params.boardSize, params.winPatterns, params.freeIndex) === null;
}

/**
 * Which winners in the store the DB no longer has as won, so the replay in
 * loadGamePlayers should drop them (a bingo_retracted this tab missed).
 *
 * Kept, even though the DB disagrees:
 * - a win heard within the grace window, whose row write may still be landing;
 * - my own win while my marks still make a pattern — my write is pending or
 *   failed, and my board is the truth for my win.
 */
export function staleWinnerIds(params: {
  winners: readonly { playerId: string; heardAt?: number }[];
  dbWonIds: ReadonlySet<string>;
  selfPlayerId: string;
  selfStillWins: boolean;
  now: number;
  graceMs?: number;
}): string[] {
  const grace = params.graceMs ?? RETRACT_REPLAY_GRACE_MS;
  return params.winners
    .filter((w) => !params.dbWonIds.has(w.playerId))
    .filter((w) => w.heardAt === undefined || params.now - w.heardAt >= grace)
    .filter((w) => !(w.playerId === params.selfPlayerId && params.selfStillWins))
    .map((w) => w.playerId);
}
