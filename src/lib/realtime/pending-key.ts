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
