import { describe, it, expect } from 'vitest';
import { shouldRetractWin, staleWinnerIds, RETRACT_REPLAY_GRACE_MS } from '../retract';

// 5x5, no FREE: row 0 is grid indexes 0-4.
const base = { boardSize: 5, winPatterns: ['row', 'column', 'diagonal'] as const, freeIndex: null };

describe('shouldRetractWin', () => {
  it('retracts a winner whose marks no longer make a pattern', () => {
    expect(shouldRetractWin({ ...base, winPatterns: [...base.winPatterns], isWinner: true, marks: [0, 1, 2, 3] })).toBe(true);
  });

  it('keeps the win when another line still holds', () => {
    // Row 0 broken, column 0 (0,5,10,15,20) still complete.
    const marks = [1, 2, 3, 4, 0, 5, 10, 15, 20].filter((i) => i !== 1);
    expect(shouldRetractWin({ ...base, winPatterns: [...base.winPatterns], isWinner: true, marks })).toBe(false);
  });

  it('never retracts someone who is not a winner', () => {
    expect(shouldRetractWin({ ...base, winPatterns: [...base.winPatterns], isWinner: false, marks: [] })).toBe(false);
  });
});

describe('staleWinnerIds', () => {
  const now = 100_000;
  const old = now - RETRACT_REPLAY_GRACE_MS - 1;

  it('drops a winner the DB no longer has as won', () => {
    expect(staleWinnerIds({
      winners: [{ playerId: 'amy', heardAt: old }, { playerId: 'bob', heardAt: old }],
      dbWonIds: new Set(['bob']),
      selfPlayerId: 'me',
      selfStillWins: false,
      now,
    })).toEqual(['amy']);
  });

  it('keeps a win heard moments ago whose row write may not have landed', () => {
    expect(staleWinnerIds({
      winners: [{ playerId: 'amy', heardAt: now - 200 }],
      dbWonIds: new Set(),
      selfPlayerId: 'me',
      selfStillWins: false,
      now,
    })).toEqual([]);
  });

  it('keeps my own win while my marks still make it, drops it once they do not', () => {
    const params = { winners: [{ playerId: 'me', heardAt: old }], dbWonIds: new Set<string>(), selfPlayerId: 'me', now };
    expect(staleWinnerIds({ ...params, selfStillWins: true })).toEqual([]);
    expect(staleWinnerIds({ ...params, selfStillWins: false })).toEqual(['me']);
  });
});
