import { describe, it, expect } from 'vitest';
import { buildLeaderboard, isScoredRound, lastNight, type LeaderboardRecord } from '../stats';

const rec = (
  playerId: string,
  gameStatus: string | null,
  won = false,
  bingoTimeMs: number | null = null,
): LeaderboardRecord => ({
  playerId,
  displayName: playerId.toUpperCase(),
  avatarUrl: null,
  won,
  bingoTimeMs,
  gameStatus,
});

describe('isScoredRound', () => {
  it('counts only won rounds', () => {
    expect(isScoredRound('won')).toBe(true);
    expect(isScoredRound('active')).toBe(false);
    expect(isScoredRound('cancelled')).toBe(false);
    expect(isScoredRound(null)).toBe(false);
    expect(isScoredRound(undefined)).toBe(false);
  });
});

describe('buildLeaderboard', () => {
  it('ignores abandoned (active) and cancelled rounds for games played', () => {
    const rows = buildLeaderboard([
      rec('a', 'won', true, 60_000),
      rec('a', 'active'),     // host closed the tab instead of ending the night
      rec('a', 'cancelled'),  // host ended a round nobody won
      rec('b', 'won'),
      rec('b', 'active'),
    ]);
    const a = rows.find((r) => r.playerId === 'a')!;
    const b = rows.find((r) => r.playerId === 'b')!;
    expect(a).toMatchObject({ games: 1, wins: 1, winRate: 100, bestTimeMs: 60_000 });
    expect(b).toMatchObject({ games: 1, wins: 0, winRate: 0 });
  });

  it('leaves out a player whose only rounds never finished', () => {
    expect(buildLeaderboard([rec('c', 'active'), rec('c', 'cancelled')])).toEqual([]);
  });

  it('ranks by wins, then win rate, then fastest best time', () => {
    const rows = buildLeaderboard([
      // a: 2 wins in 3
      rec('a', 'won', true, 50_000), rec('a', 'won', true, 70_000), rec('a', 'won'),
      // b: 2 wins in 2
      rec('b', 'won', true, 90_000), rec('b', 'won', true, 80_000),
      // c and d: 1 win in 1, c faster
      rec('c', 'won', true, 30_000),
      rec('d', 'won', true, 40_000),
    ]);
    expect(rows.map((r) => r.playerId)).toEqual(['b', 'a', 'c', 'd']);
    expect(rows[0].bestTimeMs).toBe(80_000);
    expect(rows[1].winRate).toBe(67);
  });
});

describe('lastNight', () => {
  // One row per player per round: room, round id, start time.
  const row = (playerId: string, won: boolean, roomId: string, gameId: string, startedAt: string, status = 'won') =>
    ({ ...rec(playerId, status, won), roomId, gameId, startedAt });

  it('picks the latest room and its top winner, counting only won rounds', () => {
    const night = lastNight([
      row('a', true, 'old', 'g1', '2026-10-01T20:00:00Z'),
      row('b', false, 'old', 'g1', '2026-10-01T20:00:00Z'),
      row('a', true, 'new', 'g2', '2026-10-03T20:00:00Z'),
      row('b', false, 'new', 'g2', '2026-10-03T20:00:00Z'),
      row('a', false, 'new', 'g3', '2026-10-03T20:30:00Z'),
      row('b', true, 'new', 'g3', '2026-10-03T20:30:00Z'),
      row('b', true, 'new', 'g4', '2026-10-03T21:00:00Z'),
      // A cancelled last round neither counts nor moves the date.
      row('a', false, 'new', 'g5', '2026-10-03T22:00:00Z', 'cancelled'),
    ]);
    expect(night?.roomId).toBe('new');
    expect(night?.rounds).toBe(3);
    expect(night?.winner?.playerId).toBe('b');
    expect(night?.winner?.wins).toBe(2);
    expect(night?.startedAt).toBe('2026-10-03T21:00:00Z');
  });

  it('is null with no won rounds at all', () => {
    expect(lastNight([row('a', false, 'r', 'g', '2026-10-03T20:00:00Z', 'cancelled')])).toBeNull();
  });
});
