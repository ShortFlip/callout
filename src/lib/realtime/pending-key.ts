/**
 * The coalescing key for a broadcast that could not be sent and waits in the
 * reconnect queue. Two queued broadcasts with the same key never both go out:
 * the newer one replaces the older and moves to the back of the queue.
 *
 * - Marks and call progress are "latest wins".
 * - A player's win and its retraction share ONE key, so whichever happened
 *   last is the only one replayed. Two keys would let a queued confirm and a
 *   queued retraction flush in the wrong order (or a stale confirm flush after
 *   the retraction was sent), leaving every other tab showing a win that was
 *   taken back.
 * - Everything else (a new round, the night closing) is a one-off that must
 *   be delivered as-is, so it gets a unique key.
 */
export function pendingKey(event: string, payload: Record<string, unknown>): string {
  if (event === 'mark_updated') return `${event}:${String(payload.playerId)}`;
  if (event === 'bingo_confirmed' || event === 'bingo_retracted') return `bingo:${String(payload.playerId)}`;
  if (event === 'item_called') return event;
  return `${event}:${Date.now()}:${Math.random()}`;
}

/** A broadcast waiting in the reconnect queue. */
export interface PendingBroadcast {
  key: string;
  event: string;
  payload: Record<string, unknown>;
}

/**
 * Queue a broadcast, replacing any older copy under the same key rather than
 * stacking them. The new copy goes to the back, so a retraction queued after
 * a confirm (or a re-win after a retraction) is what flushes, in send order
 * relative to everything else still queued.
 */
export function enqueuePending(queue: readonly PendingBroadcast[], event: string, payload: Record<string, unknown>): PendingBroadcast[] {
  const key = pendingKey(event, payload);
  return [...queue.filter((p) => p.key !== key), { key, event, payload }];
}

/** The store's view of the round, as far as the reconnect flush cares. */
export interface FlushRound {
  gameId: string | null;
  gameStartedAt: string | null;
}

/**
 * Should a queued broadcast still go out on reconnect?
 *
 * Anything tagged with a round other than the one in the store is stale and
 * dropped — a receiver would ignore it anyway. The exception is game_started:
 * it carries the NEXT round, so it naturally differs from the store's (null in
 * the lobby). Dropping it left a host whose Start went out mid-drop, and every
 * tab waiting on it, in the lobby (audit 2026-10-07). It goes out unless it is
 * older than the round we are on; "no round" counts as older than any round.
 */
export function shouldFlushPending(entry: PendingBroadcast, round: FlushRound): boolean {
  const forGame = entry.payload.gameId;
  if (typeof forGame !== 'string' || forGame === round.gameId) return true;
  if (entry.event !== 'game_started') return false;
  if (!round.gameId) return true;
  const queuedAt = Date.parse(String(entry.payload.startedAt ?? ''));
  const currentAt = Date.parse(round.gameStartedAt ?? '');
  // Without both start times we cannot order the two rounds; sending a stale
  // start would drag every tab back a round, so keep the round we are on.
  if (Number.isNaN(queuedAt) || Number.isNaN(currentAt)) return false;
  return queuedAt > currentAt;
}
