import { describe, it, expect } from 'vitest';
import { gamesOnCards, pairReplacements, planSwap, swapGameSquares, swapItemKey } from '../swap-games';
import { seededRng } from '../seed-rng';
import { checkWin } from '../win-detection';
import type { SquareItem } from '@/types/card';

const RL = 'rl';
const MW = 'mw';

/** A 3×3 card: FREE in the centre, RL squares at 0, 1, 2 and 6, MW elsewhere. */
function card(): SquareItem[] {
  return [
    { text: 'Rl 1', gameTagId: RL, libraryItemId: 'r1' },
    { text: 'Rl 2', gameTagId: RL, libraryItemId: 'r2' },
    { text: 'Rl 3', gameTagId: RL, libraryItemId: 'r3' },
    { text: 'Mw 1', gameTagId: MW, libraryItemId: 'm1' },
    { text: 'FREE', isFreeSpace: true },
    { text: 'Mw 2', gameTagId: MW, libraryItemId: 'm2' },
    { text: 'Rl 4', gameTagId: RL, libraryItemId: 'r4' },
    { text: 'Mw 3', gameTagId: MW, libraryItemId: 'm3' },
    { text: 'Mw 4', gameTagId: MW, libraryItemId: 'm4' },
  ];
}

function mwPool(n: number, start = 1): SquareItem[] {
  return Array.from({ length: n }, (_, i) => ({
    text: `Mw ${start + i}`,
    gameTagId: MW,
    libraryItemId: `m${start + i}`,
  }));
}

describe('gamesOnCards', () => {
  it('lists each game once in first-seen order, ignoring FREE and untagged squares', () => {
    expect(gamesOnCards([card(), [{ text: 'x' }, { text: 'y', gameTagId: 'z' }]])).toEqual([RL, MW, 'z']);
    expect(gamesOnCards([[{ text: 'a' }, { text: 'FREE', isFreeSpace: true }]])).toEqual([]);
  });
});

describe('swapGameSquares', () => {
  it('changes only unmarked squares of the dropped game and never FREE', () => {
    const before = card();
    const marks = [1, 4]; // Rl 2 marked, FREE marked
    const result = swapGameSquares({
      card: before,
      marks,
      pool: mwPool(10),
      dropGameTagId: RL,
      targetGameTagId: MW,
      rng: seededRng('t'),
    });
    expect(result.swapped).toBe(3);
    expect(result.skipped).toBe(0);
    for (const i of [0, 2, 6]) expect(result.card[i].gameTagId).toBe(MW);
    // Marked RL square and every non-RL square untouched.
    for (const i of [1, 3, 4, 5, 7, 8]) expect(result.card[i]).toEqual(before[i]);
    expect(result.card[4].isFreeSpace).toBe(true);
  });

  it('never puts an item on the card twice, by id or by text', () => {
    const pool = [...mwPool(8), { text: '  mw 7 ', gameTagId: MW }, { text: 'Mw 8', gameTagId: MW, libraryItemId: 'm8' }];
    const result = swapGameSquares({
      card: card(),
      marks: [],
      pool,
      dropGameTagId: RL,
      targetGameTagId: MW,
      rng: seededRng('dupes'),
    });
    const texts = result.card.map((s) => (s.text ?? '').trim().toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('skips what it cannot fill when the target game runs short', () => {
    // m1..m4 are already on the card, so only m5 is new.
    const result = swapGameSquares({
      card: card(),
      marks: [],
      pool: mwPool(5),
      dropGameTagId: RL,
      targetGameTagId: MW,
      rng: seededRng('short'),
    });
    expect(result.swapped).toBe(1);
    expect(result.skipped).toBe(3);
    expect(result.card.filter((s) => s.gameTagId === RL)).toHaveLength(3);
    expect(result.card.filter((s) => s.text === 'Mw 5')).toHaveLength(1);
  });

  it('ignores pool items of other games', () => {
    const result = swapGameSquares({
      card: card(),
      marks: [],
      pool: [{ text: 'Other', gameTagId: 'other' }, { text: 'Rl 9', gameTagId: RL }],
      dropGameTagId: RL,
      targetGameTagId: MW,
      rng: seededRng('x'),
    });
    expect(result.swapped).toBe(0);
    expect(result.skipped).toBe(4);
  });

  it('is deterministic for the same rng and varies with a different one', () => {
    const run = (seed: string) =>
      swapGameSquares({
        card: card(),
        marks: [],
        pool: mwPool(30),
        dropGameTagId: RL,
        targetGameTagId: MW,
        rng: seededRng(seed),
      }).card.map((s) => s.text);
    expect(run('same')).toEqual(run('same'));
    expect(run('same')).not.toEqual(run('other'));
  });

  it('does not mutate the input card', () => {
    const before = card();
    const snapshot = JSON.parse(JSON.stringify(before));
    swapGameSquares({ card: before, marks: [], pool: mwPool(10), dropGameTagId: RL, targetGameTagId: MW, rng: seededRng('m') });
    expect(before).toEqual(snapshot);
  });

  it('keeps win detection working: a swapped-in square can complete a line', () => {
    const result = swapGameSquares({
      card: card(),
      marks: [1],
      pool: mwPool(10),
      dropGameTagId: RL,
      targetGameTagId: MW,
      rng: seededRng('win'),
    });
    // Top row: 0 and 2 were swapped, 1 was marked before. Marking the new ones wins.
    expect(result.card[0].gameTagId).toBe(MW);
    expect(checkWin(new Set([1]), 3, ['row'], 4)).toBeNull();
    expect(checkWin(new Set([0, 1, 2]), 3, ['row'], 4)).toBe('row');
  });
});

/** Same items as card(), shuffled into other positions: one shared set, a second player's order. */
function otherCard(): SquareItem[] {
  const c = card();
  return [c[6], c[3], c[0], c[1], c[4], c[8], c[2], c[5], c[7]];
}

describe('swapItemKey', () => {
  it('uses the library id, else the normalised text', () => {
    expect(swapItemKey({ text: 'Rl 1', libraryItemId: 'r1' })).toBe('id:r1');
    expect(swapItemKey({ text: '  Rl 1 ' })).toBe('text:rl 1');
  });
});

describe('planSwap', () => {
  it('lists dropped items once across cards and leaves out ones marked everywhere', () => {
    // Rl 2 is marked on both cards; Rl 1 is marked on only the second.
    const plan = planSwap({
      cards: [
        { card: card(), marks: [1] },
        { card: otherCard(), marks: [3, 2] },
      ],
      pool: mwPool(8),
      dropGameTagId: RL,
      targetGameTagId: MW,
      rng: seededRng('plan'),
    });
    expect(plan.dropped.map((s) => s.text)).toEqual(['Rl 1', 'Rl 3', 'Rl 4']);
    // m1..m4 are already on the cards.
    expect(plan.candidates.map((s) => s.text)).toEqual(['Mw 5', 'Mw 6', 'Mw 7', 'Mw 8']);
    expect(plan.suggested).toHaveLength(3);
    for (const s of plan.suggested) expect(plan.candidates).toContainEqual(s);
  });

  it('suggests only as many as exist when candidates run short', () => {
    const plan = planSwap({ cards: [{ card: card(), marks: [] }], pool: mwPool(5), dropGameTagId: RL, targetGameTagId: MW, rng: seededRng('s') });
    expect(plan.dropped).toHaveLength(4);
    expect(plan.suggested.map((s) => s.text)).toEqual(['Mw 5']);
  });
});

describe("swapGameSquares with the host's picks", () => {
  const picks = [
    { text: 'Mw 9', gameTagId: MW, libraryItemId: 'm9' },
    { text: 'Mw 10', gameTagId: MW, libraryItemId: 'm10' },
    { text: 'Mw 11', gameTagId: MW, libraryItemId: 'm11' },
    { text: 'Mw 12', gameTagId: MW, libraryItemId: 'm12' },
  ];
  const dropped = card().filter((s) => s.gameTagId === RL);

  it('applies the same item-to-item mapping on two cards', () => {
    const replacements = pairReplacements(dropped, picks);
    const run = (c: SquareItem[], seed: string) =>
      swapGameSquares({ card: c, marks: [], pool: mwPool(30), dropGameTagId: RL, targetGameTagId: MW, rng: seededRng(seed), replacements });
    const a = run(card(), 'a');
    const b = run(otherCard(), 'b');
    // Rl n became Mw (8 + n) on both cards, wherever that card had it.
    const mapped = (c: SquareItem[], orig: SquareItem[]) =>
      orig.flatMap((s, i) => (s.gameTagId === RL ? [[s.text, c[i].text]] : []));
    const expected = new Map([['Rl 1', 'Mw 9'], ['Rl 2', 'Mw 10'], ['Rl 3', 'Mw 11'], ['Rl 4', 'Mw 12']]);
    for (const [from, to] of mapped(a.card, card())) expect(to).toBe(expected.get(from!));
    for (const [from, to] of mapped(b.card, otherCard())) expect(to).toBe(expected.get(from!));
    expect(a.swapped).toBe(4);
    expect(b.swapped).toBe(4);
  });

  it('keeps a marked dropped square as it was', () => {
    const result = swapGameSquares({
      card: card(), marks: [1], pool: mwPool(30), dropGameTagId: RL, targetGameTagId: MW,
      rng: seededRng('m'), replacements: pairReplacements(dropped, picks),
    });
    expect(result.card[1]).toEqual(card()[1]);
    // Mw 10 was Rl 2's pick; it is reserved, never handed to another square.
    expect(result.card.some((s) => s.text === 'Mw 10')).toBe(false);
    expect(result.swapped).toBe(3);
  });

  it('falls back to the seeded draw for what the mapping does not cover', () => {
    const replacements = pairReplacements(dropped, picks.slice(0, 2));
    const result = swapGameSquares({
      card: card(), marks: [], pool: mwPool(30), dropGameTagId: RL, targetGameTagId: MW,
      rng: seededRng('fb'), replacements,
    });
    expect(result.card[0].text).toBe('Mw 9');
    expect(result.card[1].text).toBe('Mw 10');
    // Rl 3 and Rl 4 were drawn: target-game items new to the card, not the picks.
    for (const i of [2, 6]) {
      expect(result.card[i].gameTagId).toBe(MW);
      expect(['Mw 9', 'Mw 10', 'Mw 1', 'Mw 2', 'Mw 3', 'Mw 4']).not.toContain(result.card[i].text);
    }
    expect(result.swapped).toBe(4);
    expect(result.skipped).toBe(0);
  });

  it('skips the rest when the mapping is short and nothing is left to draw', () => {
    // The pool is exactly the picks: the dialog's short case, so 2 squares stay put.
    const result = swapGameSquares({
      card: card(), marks: [], pool: picks.slice(0, 2), dropGameTagId: RL, targetGameTagId: MW,
      rng: seededRng('short'), replacements: pairReplacements(dropped, picks.slice(0, 2)),
    });
    expect(result.swapped).toBe(2);
    expect(result.skipped).toBe(2);
    expect(result.card[2].text).toBe('Rl 3');
  });
});
