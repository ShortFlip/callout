import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, type OtherPlayer } from '../gameStore';

function other(playerId: string, overrides: Partial<OtherPlayer> = {}): OtherPlayer {
  return {
    playerId,
    displayName: playerId,
    avatarUrl: null,
    card: [],
    marks: [],
    won: false,
    finishPosition: null,
    synced: false,
    ...overrides,
  };
}

const card: OtherPlayer['card'] = [{ text: 'A' }];

beforeEach(() => {
  useGameStore.getState().resetGame();
});

describe('addPlaceholders', () => {
  it('keeps a synced board when presence lists that player again', () => {
    // The mid-round join bug: presence used setOthers, which dropped every
    // synced entry it wasn't handed, so the rail fell back to SYNCING.
    const store = useGameStore.getState();
    store.setOthers([other('bob', { synced: true, card, marks: [0, 6, 12] })]);
    store.addPlaceholders([other('bob'), other('cat')]);

    const { others } = useGameStore.getState();
    expect(others.bob).toMatchObject({ synced: true, marks: [0, 6, 12] });
    expect(others.bob.card).toHaveLength(1);
    expect(others.cat).toMatchObject({ synced: false, marks: [] });
  });

  it('leaves every existing entry untouched when a newcomer joins', () => {
    const store = useGameStore.getState();
    store.setOthers([
      other('bob', { synced: true, marks: [1] }),
      other('dan', { synced: true, marks: [2, 3] }),
    ]);
    const before = useGameStore.getState().others;
    store.addPlaceholders([other('cat')]);
    const after = useGameStore.getState().others;

    expect(after.bob).toBe(before.bob);
    expect(after.dan).toBe(before.dan);
    expect(Object.keys(after).sort()).toEqual(['bob', 'cat', 'dan']);
  });

  it('is a no-op when nobody is new', () => {
    const store = useGameStore.getState();
    store.setOthers([other('bob', { synced: true })]);
    const before = useGameStore.getState().others;
    store.addPlaceholders([other('bob')]);
    expect(useGameStore.getState().others).toBe(before);
  });
});

describe('addWinner', () => {
  it('adds a player once however many times the win arrives', () => {
    // Claim-time add, self-echo broadcast, then the DB replay: one winner.
    const store = useGameStore.getState();
    const win = { playerId: 'bob', displayName: 'Bob', pattern: 'row' as const, finishPosition: 1 };
    store.addWinner(win);
    store.addWinner(win);
    store.addWinner({ ...win, pattern: 'column' });
    expect(useGameStore.getState().winners).toHaveLength(1);
    expect(useGameStore.getState().winners[0].pattern).toBe('row');
  });

  it('orders by finish position, not arrival', () => {
    // Second place's broadcast can beat a DB read that includes first place.
    const store = useGameStore.getState();
    store.addWinner({ playerId: 'cat', displayName: 'Cat', pattern: 'row', finishPosition: 2 });
    store.addWinner({ playerId: 'bob', displayName: 'Bob', pattern: 'row', finishPosition: 1 });
    expect(useGameStore.getState().winners.map((w) => w.playerId)).toEqual(['bob', 'cat']);
  });

  it('appends a winner with no known position', () => {
    const store = useGameStore.getState();
    store.addWinner({ playerId: 'bob', displayName: 'Bob', pattern: 'row', finishPosition: 1 });
    store.addWinner({ playerId: 'cat', displayName: 'Cat', pattern: 'row' });
    expect(useGameStore.getState().winners.map((w) => w.playerId)).toEqual(['bob', 'cat']);
  });
});

describe('initGame', () => {
  const base = {
    gameId: 'g1',
    seed: 's',
    roundNumber: 1,
    callList: [],
    templateItems: [],
    boardSize: 5,
    freeSpace: true,
    shuffleMode: 'full' as const,
    winPatterns: ['row' as const],
  };

  it('times the round from the DB start, not from when this tab initialised', () => {
    // The refresh bug: a rejoin restarted the clock, so the next bingo looked
    // impossibly fast on the leaderboard.
    useGameStore.getState().initGame({ ...base, startedAt: '2026-09-23T19:45:00+00:00' });
    expect(useGameStore.getState().gameStartedAt).toBe('2026-09-23T19:45:00+00:00');
  });

  it('falls back to now for a legacy payload without startedAt', () => {
    const before = Date.now();
    useGameStore.getState().initGame(base);
    const stamped = new Date(useGameStore.getState().gameStartedAt!).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
  });

  it('does not leak startedAt into the store as its own field', () => {
    useGameStore.getState().initGame({ ...base, startedAt: '2026-09-23T19:45:00+00:00' });
    expect('startedAt' in useGameStore.getState()).toBe(false);
  });
});

describe('removeWinner', () => {
  const win = (playerId: string, finishPosition: number) => ({ playerId, displayName: playerId, pattern: 'row' as const, finishPosition });

  it('moves every later winner up one place', () => {
    const store = useGameStore.getState();
    store.addWinner(win('amy', 1));
    store.addWinner(win('bob', 2));
    store.addWinner(win('cat', 3));
    useGameStore.getState().removeWinner('amy');
    expect(useGameStore.getState().winners.map((w) => [w.playerId, w.finishPosition])).toEqual([['bob', 1], ['cat', 2]]);
  });

  it('leaves earlier winners where they are', () => {
    const store = useGameStore.getState();
    store.addWinner(win('amy', 1));
    store.addWinner(win('bob', 2));
    useGameStore.getState().removeWinner('bob');
    expect(useGameStore.getState().winners.map((w) => [w.playerId, w.finishPosition])).toEqual([['amy', 1]]);
  });

  it('is idempotent: a second removal (echo, DB replay) changes nothing', () => {
    const store = useGameStore.getState();
    store.addWinner(win('amy', 1));
    store.addWinner(win('bob', 2));
    store.removeWinner('amy');
    const after = useGameStore.getState().winners;
    useGameStore.getState().removeWinner('amy');
    expect(useGameStore.getState().winners).toBe(after);
    expect(after.map((w) => w.finishPosition)).toEqual([1]);
  });

  it('lets the same player win again afterwards', () => {
    const store = useGameStore.getState();
    store.addWinner(win('amy', 1));
    store.removeWinner('amy');
    useGameStore.getState().addWinner(win('amy', 1));
    expect(useGameStore.getState().winners.map((w) => w.playerId)).toEqual(['amy']);
  });
});
