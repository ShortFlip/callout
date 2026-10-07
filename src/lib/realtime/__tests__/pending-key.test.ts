import { describe, it, expect } from 'vitest';
import { enqueuePending, pendingKey, shouldFlushPending, type PendingBroadcast } from '../pending-key';

describe('pendingKey', () => {
  it('gives a win and its retraction the same key per player', () => {
    expect(pendingKey('bingo_confirmed', { playerId: 'amy' })).toBe(pendingKey('bingo_retracted', { playerId: 'amy' }));
    expect(pendingKey('bingo_confirmed', { playerId: 'amy' })).not.toBe(pendingKey('bingo_retracted', { playerId: 'bob' }));
  });

  it('keeps one-off events unique', () => {
    expect(pendingKey('game_started', {})).not.toBe(pendingKey('game_started', {}));
  });
});

describe('enqueuePending', () => {
  it('lets only the latest of win / retraction replay, after older queued events', () => {
    let queue: PendingBroadcast[] = [];
    queue = enqueuePending(queue, 'bingo_confirmed', { playerId: 'amy' });
    queue = enqueuePending(queue, 'mark_updated', { playerId: 'amy', marks: [1] });
    queue = enqueuePending(queue, 'bingo_retracted', { playerId: 'amy' });
    expect(queue.map((p) => p.event)).toEqual(['mark_updated', 'bingo_retracted']);

    // A re-win after the retraction replaces it again.
    queue = enqueuePending(queue, 'bingo_confirmed', { playerId: 'amy' });
    expect(queue.map((p) => p.event)).toEqual(['mark_updated', 'bingo_confirmed']);
  });

  it('never coalesces two players’ wins', () => {
    let queue: PendingBroadcast[] = [];
    queue = enqueuePending(queue, 'bingo_confirmed', { playerId: 'amy' });
    queue = enqueuePending(queue, 'bingo_retracted', { playerId: 'bob' });
    expect(queue).toHaveLength(2);
  });
});

describe('shouldFlushPending', () => {
  const entry = (event: string, payload: Record<string, unknown>): PendingBroadcast => ({ key: 'k', event, payload });
  const onRound = { gameId: 'g1', gameStartedAt: '2026-10-07T20:00:00.000Z' };
  const lobby = { gameId: null, gameStartedAt: null };

  it('sends anything for the round we are on, or untagged', () => {
    expect(shouldFlushPending(entry('mark_updated', { gameId: 'g1' }), onRound)).toBe(true);
    expect(shouldFlushPending(entry('room_closed', {}), onRound)).toBe(true);
  });

  it('drops a mark or win for a round we have left', () => {
    expect(shouldFlushPending(entry('mark_updated', { gameId: 'g0' }), onRound)).toBe(false);
    expect(shouldFlushPending(entry('bingo_confirmed', { gameId: 'g0' }), lobby)).toBe(false);
  });

  it('keeps a queued game_started when the store has no round (the lobby)', () => {
    // The host's Start went out mid-drop: dropping it stranded the room in the lobby.
    expect(shouldFlushPending(entry('game_started', { gameId: 'g1', startedAt: '2026-10-07T20:00:00.000Z' }), lobby)).toBe(true);
    expect(shouldFlushPending(entry('game_started', { gameId: 'g1' }), lobby)).toBe(true);
  });

  it('keeps a game_started newer than the round we are on, drops an older one', () => {
    expect(shouldFlushPending(entry('game_started', { gameId: 'g2', startedAt: '2026-10-07T20:30:00.000Z' }), onRound)).toBe(true);
    expect(shouldFlushPending(entry('game_started', { gameId: 'g0', startedAt: '2026-10-07T19:30:00.000Z' }), onRound)).toBe(false);
  });

  it('keeps the current round when the two cannot be ordered', () => {
    expect(shouldFlushPending(entry('game_started', { gameId: 'g2' }), onRound)).toBe(false);
  });
});
