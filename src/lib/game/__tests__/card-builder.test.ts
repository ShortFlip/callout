import { describe, it, expect } from 'vitest';
import {
  allocateMix,
  buildCardSet,
  slotsFor,
  splitFromPercent,
  type LaneKey,
} from '../card-builder';
import { seededRng } from '../seed-rng';
import type { SquareItem } from '@/types/card';
import type { LibraryItem, MixLane } from '@/types/library';

const RL = 'game-rl';
const COD = 'game-cod';
const APEX = 'game-apex';

/** n library items in one lane, ids zero-padded so id order is the obvious order. */
function lane(prefix: string, gameTagId: string | null, n: number): LibraryItem[] {
  return Array.from({ length: n }, (_, i) => {
    const num = String(i + 1).padStart(2, '0');
    return { id: `${prefix}-${num}`, text: `${prefix} item ${num}`, gameTagId, tagIds: [] };
  });
}

/** The usual night: 20 Rocket League, 30 Call of Duty, 10 with no game. */
const POOL: LibraryItem[] = [...lane('rl', RL, 20), ...lane('cod', COD, 30), ...lane('ng', null, 10)];

const mix = (...lanes: Array<[string | null, number]>) => ({
  lanes: lanes.map(([gameTagId, count]): MixLane => ({ gameTagId, count })),
});

const counts = (lanes: MixLane[]) => lanes.map((l) => l.count);
const ids = (set: SquareItem[]) => set.map((s) => s.libraryItemId);
const inLane = (set: SquareItem[], key: LaneKey) =>
  set.filter((s) => (s.gameTagId ?? null) === key);
const available = (entries: Array<[LaneKey, number]>) => new Map<LaneKey, number>(entries);

describe('slotsFor', () => {
  it('is N² without free space and N² − 1 with it', () => {
    expect(slotsFor(5, true)).toBe(24);
    expect(slotsFor(5, false)).toBe(25);
    expect(slotsFor(3, true)).toBe(8);
    expect(slotsFor(6, false)).toBe(36);
  });

  it('still costs one slot on an even board, where generateCard puts FREE at floor(N²/2)', () => {
    expect(slotsFor(4, true)).toBe(15);
  });
});

describe('splitFromPercent', () => {
  it('snaps the slider to whole squares', () => {
    expect(splitFromPercent(20, 24)).toEqual([5, 19]);
    expect(splitFromPercent(30, 24)).toEqual([7, 17]);
  });

  it('handles the ends and clamps out-of-range input', () => {
    expect(splitFromPercent(0, 24)).toEqual([0, 24]);
    expect(splitFromPercent(100, 24)).toEqual([24, 0]);
    expect(splitFromPercent(-10, 24)).toEqual([0, 24]);
    expect(splitFromPercent(150, 24)).toEqual([24, 0]);
  });

  it('gives an exact half to the first lane, as largest remainder does', () => {
    expect(splitFromPercent(50, 25)).toEqual([13, 12]);
    expect(allocateMix(mix([RL, 50], [COD, 50]).lanes, 25, available([[RL, 99], [COD, 99]])).lanes.map((l) => l.count)).toEqual([13, 12]);
  });
});

describe('allocateMix', () => {
  const plenty = available([[RL, 99], [COD, 99], [APEX, 99], [null, 99]]);

  it('rounds by largest remainder: 30/70 of 24 is 7/17', () => {
    const result = allocateMix(mix([RL, 30], [COD, 70]).lanes, 24, plenty);
    expect(counts(result.lanes)).toEqual([7, 17]);
    expect(result.capped).toEqual([]);
    expect(result.shortBy).toBe(0);
  });

  it('keeps counts that already sum to the slots exactly', () => {
    expect(counts(allocateMix(mix([RL, 5], [COD, 19]).lanes, 24, plenty).lanes)).toEqual([5, 19]);
  });

  it('rescales a mix saved for another board size', () => {
    // 12/12 saved on a 5×5 with free space, reused on a 4×4 with free space (15 slots).
    expect(counts(allocateMix(mix([RL, 12], [COD, 12]).lanes, 15, plenty).lanes)).toEqual([8, 7]);
  });

  it('breaks an even three-way tie toward the earlier lane', () => {
    expect(counts(allocateMix(mix([RL, 1], [COD, 1], [APEX, 1]).lanes, 25, plenty).lanes)).toEqual([9, 8, 8]);
  });

  it('caps a lane at its items and moves the shortfall to a lane that still has items', () => {
    const result = allocateMix(mix([RL, 12], [COD, 12]).lanes, 24, available([[RL, 4], [COD, 50]]));
    expect(counts(result.lanes)).toEqual([4, 20]);
    expect(result.capped).toEqual([RL]);
    expect(result.shortBy).toBe(0);
  });

  it('splits the shortfall across the open lanes by weight, skipping lanes with no items', () => {
    const result = allocateMix(
      mix([RL, 8], [COD, 8], [APEX, 8]).lanes,
      24,
      available([[RL, 2], [COD, 50]]), // APEX has no items at all
    );
    expect(counts(result.lanes)).toEqual([2, 22, 0]);
    expect(result.capped).toEqual([RL, APEX]);
  });

  it('keeps a 0% lane empty while weighted lanes can take the shortfall', () => {
    const result = allocateMix(mix([RL, 12], [COD, 12], [null, 0]).lanes, 24, available([[RL, 4], [COD, 50], [null, 50]]));
    expect(counts(result.lanes)).toEqual([4, 20, 0]);
  });

  it('fills from a 0% lane only when every weighted lane is out of items', () => {
    const result = allocateMix(mix([RL, 12], [COD, 12], [null, 0]).lanes, 24, available([[RL, 4], [COD, 6], [null, 50]]));
    expect(counts(result.lanes)).toEqual([4, 6, 14]);
    expect(result.capped).toEqual([RL, COD]);
    expect(result.shortBy).toBe(0);
  });

  it('reports shortBy when every lane runs out', () => {
    const result = allocateMix(mix([RL, 12], [COD, 12]).lanes, 24, available([[RL, 4], [COD, 6]]));
    expect(counts(result.lanes)).toEqual([4, 6]);
    expect(result.shortBy).toBe(14);
  });

  it('merges a lane listed twice instead of double-booking its items', () => {
    const result = allocateMix(mix([RL, 6], [COD, 12], [RL, 6]).lanes, 24, plenty);
    expect(result.lanes).toEqual([
      { gameTagId: RL, count: 12 },
      { gameTagId: COD, count: 12 },
    ]);
  });
});

describe('buildCardSet', () => {
  const build = (overrides: Partial<Parameters<typeof buildCardSet>[0]> = {}) =>
    buildCardSet({
      pool: POOL,
      slots: 24,
      mix: mix([RL, 12], [COD, 12]),
      pinnedIds: [],
      rng: seededRng('night-1'),
      ...overrides,
    });

  it('fills every slot from the mix, 30/70 of 24 as 7 RL and 17 CoD', () => {
    const result = build({ mix: mix([RL, 30], [COD, 70]) });
    expect(result.set).toHaveLength(24);
    expect(result.shortBy).toBe(0);
    expect(inLane(result.set, RL)).toHaveLength(7);
    expect(inLane(result.set, COD)).toHaveLength(17);
    expect(counts(result.mix.lanes)).toEqual([7, 17]);
  });

  it('writes the text, library id and game onto each square', () => {
    const [first] = build().set;
    const source = POOL.find((item) => item.id === first.libraryItemId);
    expect(source).toBeDefined();
    expect(first).toEqual({ text: source!.text, libraryItemId: source!.id, gameTagId: source!.gameTagId });
  });

  it('never repeats an item, across many seeds', () => {
    for (let seed = 0; seed < 50; seed++) {
      const { set } = build({ rng: seededRng(`seed-${seed}`), mix: mix([RL, 8], [COD, 8], [null, 8]) });
      expect(new Set(ids(set)).size).toBe(set.length);
      expect(new Set(set.map((s) => s.text)).size).toBe(set.length);
    }
  });

  it('draws a No Game lane and leaves gameTagId off those squares', () => {
    const { set } = build({ mix: mix([null, 6], [COD, 18]) });
    const noGame = inLane(set, null);
    expect(noGame).toHaveLength(6);
    expect(noGame.every((s) => !('gameTagId' in s))).toBe(true);
    expect(inLane(set, COD)).toHaveLength(18);
  });

  it('places pins first and counts them against their lane', () => {
    const pins = ['rl-03', 'rl-07', 'rl-11'];
    const { set, mix: used } = build({ pinnedIds: pins });
    expect(ids(set.slice(0, 3))).toEqual(pins);
    expect(inLane(set, RL)).toHaveLength(12); // 3 pinned + 9 drawn, not 3 + 12
    expect(inLane(set, COD)).toHaveLength(12);
    expect(counts(used.lanes)).toEqual([12, 12]);
  });

  it('grows a lane whose pins exceed its count and shrinks the other', () => {
    // Slider at 5 RL / 19 CoD, then 8 RL items pinned: the real split is 8 / 16.
    const pins = POOL.filter((item) => item.gameTagId === RL).slice(0, 8).map((item) => item.id);
    const { set, mix: used } = build({ mix: mix([RL, 5], [COD, 19]), pinnedIds: pins });
    expect(counts(used.lanes)).toEqual([8, 16]);
    expect(ids(inLane(set, RL)).sort()).toEqual([...pins].sort());
    expect(set).toHaveLength(24);
  });

  it('shrinks the other lanes by largest remainder when pins take the space', () => {
    // 8 RL / 9 CoD / 7 No Game, then 12 RL pinned: 12 slots left split 9:7 → 6.75 / 5.25 → 7 / 5.
    const pins = POOL.filter((item) => item.gameTagId === RL).slice(0, 12).map((item) => item.id);
    const { mix: used } = build({ mix: mix([RL, 8], [COD, 9], [null, 7]), pinnedIds: pins });
    expect(counts(used.lanes)).toEqual([12, 7, 5]);
  });

  it('gives a pinned item whose game is not in the mix a lane of its own', () => {
    const { set, mix: used } = build({ pinnedIds: ['ng-01', 'ng-02'] });
    expect(used.lanes).toEqual([
      { gameTagId: RL, count: 11 },
      { gameTagId: COD, count: 11 },
      { gameTagId: null, count: 2 },
    ]);
    expect(ids(inLane(set, null))).toEqual(['ng-01', 'ng-02']);
  });

  it('ignores pins that are not in the pool or repeated, and drops pins beyond the slots', () => {
    expect(ids(build({ pinnedIds: ['nope', 'rl-01', 'rl-01'] }).set.slice(0, 1))).toEqual(['rl-01']);

    const tooMany = POOL.slice(0, 10).map((item) => item.id);
    const { set } = build({ slots: 8, pinnedIds: tooMany });
    expect(ids(set)).toEqual(tooMany.slice(0, 8));
  });

  it('caps a lane at its items and fills the rest from the other lane', () => {
    const pool = [...lane('rl', RL, 4), ...lane('cod', COD, 30)];
    const result = build({ pool });
    expect(counts(result.mix.lanes)).toEqual([4, 20]);
    expect(result.capped).toEqual([RL]);
    expect(result.set).toHaveLength(24);
  });

  it('reports shortBy when the whole pool is too small', () => {
    const pool = [...lane('rl', RL, 4), ...lane('cod', COD, 6)];
    const result = build({ pool });
    expect(result.set).toHaveLength(10);
    expect(result.shortBy).toBe(14);
    expect(new Set(ids(result.set)).size).toBe(10);
  });

  it('gives the same set for the same seed and a different set for a different seed', () => {
    const a = build({ rng: seededRng('night-1') });
    const b = build({ rng: seededRng('night-1') });
    const c = build({ rng: seededRng('night-2') });
    expect(ids(a.set)).toEqual(ids(b.set));
    expect(ids(a.set)).not.toEqual(ids(c.set));
  });

  it('does not depend on the order the pool arrives in', () => {
    const a = build({ rng: seededRng('night-1') });
    const b = build({ rng: seededRng('night-1'), pool: [...POOL].reverse() });
    expect(ids(a.set)).toEqual(ids(b.set));
  });

  it('keeps pins through a reshuffle and re-rolls the rest', () => {
    const pins = ['rl-01', 'cod-05'];
    const a = build({ pinnedIds: pins, rng: seededRng('roll-1') });
    const b = build({ pinnedIds: pins, rng: seededRng('roll-2') });
    expect(ids(a.set.slice(0, 2))).toEqual(pins);
    expect(ids(b.set.slice(0, 2))).toEqual(pins);
    expect(ids(a.set.slice(2))).not.toEqual(ids(b.set.slice(2)));
  });

  it('treats a null or empty mix as an even draw over the whole pool', () => {
    // 20 : 30 : 10 of 24 → 8 / 12 / 4, games first and No Game last.
    for (const noMix of [null, { lanes: [] }]) {
      const result = build({ mix: noMix });
      expect(result.set).toHaveLength(24);
      expect(result.mix.lanes).toEqual([
        { gameTagId: COD, count: 12 },
        { gameTagId: RL, count: 8 },
        { gameTagId: null, count: 4 },
      ]);
    }
  });
});
