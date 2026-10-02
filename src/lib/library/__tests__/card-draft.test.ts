import { describe, it, expect } from 'vitest';
import {
  buildLegend,
  defaultMix,
  itemsForSave,
  laneKeysFor,
  matchCardItems,
  mixForBuild,
  mixFromSet,
  planImport,
  rebalanceLanes,
  fillEmptySquares,
  textKey,
} from '../card-draft';
import { buildCardSet, countByLane, type LaneKey } from '@/lib/game/card-builder';
import { seededRng } from '@/lib/game/seed-rng';
import type { SquareItem } from '@/types/card';
import type { CardMix, LibraryItem, Tag } from '@/types/library';

const RL = 'game-rl';
const COD = 'game-cod';

function lane(prefix: string, gameTagId: string | null, n: number): LibraryItem[] {
  return Array.from({ length: n }, (_, i) => {
    const num = String(i + 1).padStart(2, '0');
    return { id: `${prefix}-${num}`, text: `${prefix} item ${num}`, gameTagId, tagIds: [] };
  });
}

const POOL: LibraryItem[] = [...lane('rl', RL, 20), ...lane('cod', COD, 30), ...lane('ng', null, 3)];

const TAGS: Tag[] = [
  { id: RL, ownerId: 'me', name: 'Rocket League', kind: 'game', color: 'sky', icon: 'flame', logoUrl: null },
  { id: COD, ownerId: 'me', name: 'Call of Duty', kind: 'game', color: 'orange', icon: 'crosshair', logoUrl: null },
  { id: 'tag-mech', ownerId: 'me', name: 'Mechanics', kind: 'tag', color: null, icon: null, logoUrl: null },
];

const mix = (...lanes: Array<[string | null, number]>): CardMix => ({
  lanes: lanes.map(([gameTagId, count]) => ({ gameTagId, count })),
});
const ids = (set: SquareItem[]) => set.map((s) => s.libraryItemId);
const inLane = (set: SquareItem[], key: LaneKey) => set.filter((s) => (s.gameTagId ?? null) === key);
const rng = (seed = 'seed') => seededRng(seed);

/** A full 24-slot card at a 7/17 split, the way Fill Empty fills an empty card. */
function card717(): SquareItem[] {
  return fillEmptySquares({ current: [], pool: POOL, slots: 24, mix: mix([RL, 7], [COD, 17]), rng: rng() }).set;
}

describe('textKey / planImport', () => {
  it('trims and lower-cases', () => {
    expect(textKey('  Kill Trade ')).toBe('kill trade');
    expect(textKey(undefined)).toBe('');
  });

  it('skips repeats within the paste and anything already in the library', () => {
    const plan = planImport(['Kill Trade', ' kill trade ', 'Demo', 'Aerial Goal', ''], ['DEMO']);
    expect(plan.fresh).toEqual(['Kill Trade', 'Aerial Goal']);
    expect(plan.skipped).toBe(2);
  });
});

describe('lanes and the default mix', () => {
  it('offers games that have items in tag order, then No Game', () => {
    expect(laneKeysFor(POOL, TAGS)).toEqual([RL, COD, null]);
    expect(laneKeysFor(lane('rl', RL, 2), TAGS)).toEqual([RL]);
  });

  it('splits evenly across games with No Game at 0', () => {
    expect(defaultMix([RL, COD, null])).toEqual(mix([RL, 1], [COD, 1], [null, 0]));
    const built = buildCardSet({ pool: POOL, slots: 24, mix: defaultMix([RL, COD, null]), pinnedIds: [], rng: rng() });
    expect(built.mix.lanes.map((l) => l.count)).toEqual([12, 12, 0]);
  });

  it('splits across No Game when there are no games at all', () => {
    expect(defaultMix([null])).toEqual(mix([null, 1]));
  });

  it('uses the requested mix once one exists', () => {
    expect(mixForBuild(mix([RL, 5]), [RL, COD])).toEqual(mix([RL, 5]));
    expect(mixForBuild({ lanes: [] }, [RL, COD])).toEqual(mix([RL, 1], [COD, 1]));
  });

  it('reads the real split off a set, ignoring text-only squares', () => {
    const set: SquareItem[] = [...card717(), { text: 'Legacy square' }];
    expect(mixFromSet(set)).toEqual(mix([RL, 7], [COD, 17]));
  });
});

describe('rebalanceLanes', () => {
  const avail = countByLane(POOL);

  it('keeps the total at the slots when one lane moves', () => {
    const next = rebalanceLanes(mix([RL, 8], [COD, 8], [null, 8]).lanes, 0, 12, 24, avail);
    expect(next.map((l) => l.count).reduce((a, b) => a + b, 0)).toBe(24);
    expect(next[0].count).toBe(12);
  });

  it('shares the rest in proportion to what the other lanes hold', () => {
    // No Game only has 3 items, so it is capped and Call of Duty takes the rest.
    const next = rebalanceLanes(mix([RL, 12], [COD, 12], [null, 0]).lanes, 0, 7, 24, avail);
    expect(next.map((l) => l.count)).toEqual([7, 17, 0]);
  });

  it('shares evenly when the other lanes are all at 0', () => {
    const next = rebalanceLanes(mix([RL, 24], [COD, 0], [null, 0]).lanes, 0, 18, 24, avail);
    expect(next.map((l) => l.count)).toEqual([18, 3, 3]);
  });
});

describe('fillEmptySquares', () => {
  const four: SquareItem[] = [
    { text: 'rl-01', libraryItemId: 'rl-01', gameTagId: RL },
    { text: 'cod-01', libraryItemId: 'cod-01', gameTagId: COD },
    { text: 'cod-02', libraryItemId: 'cod-02', gameTagId: COD },
    { text: 'Old Square' },
  ];

  it('fills only the empty squares and never touches what is there', () => {
    const { set, added } = fillEmptySquares({ current: four, pool: POOL, slots: 24, mix: mix([RL, 1], [COD, 1]), rng: rng() });
    expect(set).toHaveLength(24);
    expect(added).toBe(20);
    expect(set.slice(0, 4)).toEqual(four);
  });

  it('never draws an item already on the card', () => {
    const { set } = fillEmptySquares({ current: four, pool: POOL, slots: 24, mix: mix([RL, 1], [COD, 1]), rng: rng() });
    const drawn = ids(set).filter(Boolean);
    expect(new Set(drawn).size).toBe(drawn.length);
  });

  it('never draws the twin of a text-only square', () => {
    const pool = [...POOL, { id: 'ng-old', text: 'old square', gameTagId: null, tagIds: [] }];
    const { set } = fillEmptySquares({ current: four, pool, slots: 24, mix: mix([null, 1]), rng: rng() });
    expect(ids(set)).not.toContain('ng-old');
  });

  it('reads the mix as proportions over the empty squares', () => {
    const { set } = fillEmptySquares({ current: [], pool: POOL, slots: 6, mix: mix([RL, 2], [COD, 1]), rng: rng() });
    expect(inLane(set, RL)).toHaveLength(4);
    expect(inLane(set, COD)).toHaveLength(2);
  });

  it('does nothing on a full card', () => {
    const full = card717();
    const result = fillEmptySquares({ current: full, pool: POOL, slots: 24, mix: mix([RL, 1]), rng: rng() });
    expect(result.set).toBe(full);
    expect(result.added).toBe(0);
  });

  it('reports the shortfall when the library runs out', () => {
    const { set, shortBy } = fillEmptySquares({ current: [], pool: lane('rl', RL, 5), slots: 8, mix: mix([RL, 1]), rng: rng() });
    expect(set).toHaveLength(5);
    expect(shortBy).toBe(3);
  });

  it('is deterministic for a seed', () => {
    const a = fillEmptySquares({ current: four, pool: POOL, slots: 24, mix: mix([RL, 1], [COD, 1]), rng: rng('x') });
    const b = fillEmptySquares({ current: four, pool: POOL, slots: 24, mix: mix([RL, 1], [COD, 1]), rng: rng('x') });
    expect(ids(a.set)).toEqual(ids(b.set));
  });
});

describe('matchCardItems', () => {
  it('matches by library id first, then by trimmed case-insensitive text', () => {
    const items: SquareItem[] = [
      { text: 'Whatever It Was Called', libraryItemId: 'cod-02' },
      { text: '  RL ITEM 05 ' },
      { text: 'Not In The Library' },
      { text: 'FREE', isFreeSpace: true },
    ];
    const { squares, unmatched } = matchCardItems(items, POOL);
    expect(squares).toEqual([
      { text: 'Whatever It Was Called', libraryItemId: 'cod-02', gameTagId: COD },
      { text: 'RL ITEM 05', libraryItemId: 'rl-05', gameTagId: RL },
      { text: 'Not In The Library' },
    ]);
    expect(unmatched).toBe(1);
  });

  it('never links two squares to one library item', () => {
    const { squares } = matchCardItems([{ text: 'rl item 01' }, { text: 'RL item 01' }], POOL);
    expect(squares[0].libraryItemId).toBe('rl-01');
    expect(squares[1].libraryItemId).toBeUndefined();
  });
});

describe('buildLegend / itemsForSave', () => {
  it('lists each game on the card once, in order of first appearance', () => {
    const set: SquareItem[] = [
      { text: 'a', libraryItemId: 'cod-01', gameTagId: COD },
      { text: 'b', libraryItemId: 'ng-01' },
      { text: 'c', libraryItemId: 'rl-01', gameTagId: RL },
      { text: 'd', libraryItemId: 'cod-02', gameTagId: COD },
    ];
    expect(buildLegend(set, TAGS)).toEqual([
      { gameTagId: COD, name: 'Call of Duty', color: 'orange', icon: 'crosshair' },
      { gameTagId: RL, name: 'Rocket League', color: 'sky', icon: 'flame' },
    ]);
  });

  it('leaves out a game whose tag is gone', () => {
    expect(buildLegend([{ text: 'x', gameTagId: 'deleted' }], TAGS)).toEqual([]);
  });

  it('saves text and the library link only', () => {
    expect(itemsForSave([
      { text: 'a', libraryItemId: 'rl-01', gameTagId: RL, originalIndex: 3 },
      { text: 'b' },
    ])).toEqual([
      { text: 'a', libraryItemId: 'rl-01', gameTagId: RL },
      { text: 'b' },
    ]);
  });
});
