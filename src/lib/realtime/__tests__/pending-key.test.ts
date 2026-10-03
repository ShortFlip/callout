import { describe, it, expect } from 'vitest';
import { enqueuePending, pendingKey, type PendingBroadcast } from '../pending-key';

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
