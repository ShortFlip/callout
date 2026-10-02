import { describe, it, expect } from 'vitest';
import {
  cardSplit,
  cardSplitText,
  chooseDefaultCard,
  draftSplit,
  hostCardFor,
  hostCardName,
  hostDraftFrom,
  type HostableDraft,
} from '../hosting';
import { cardStyles } from '../card-draft';
import type { SquareItem } from '@/types/card';
import type { LegendEntry, Tag } from '@/types/library';

const RL = 'game-rl';
const COD = 'game-cod';

const TAGS: Tag[] = [
  { id: RL, ownerId: 'me', name: 'Rocket League', kind: 'game', color: 'sky', icon: 'flame', logoUrl: null },
  { id: COD, ownerId: 'me', name: 'Call of Duty', kind: 'game', color: 'orange', icon: 'crosshair', logoUrl: null },
];

const LEGEND: LegendEntry[] = [
  { gameTagId: RL, name: 'Rocket League', color: 'sky', icon: 'flame' },
  { gameTagId: COD, name: 'Call of Duty', color: 'orange', icon: 'crosshair' },
];

function squares(prefix: string, gameTagId: string | null, n: number): SquareItem[] {
  return Array.from({ length: n }, (_, i) => {
    const base = { text: `${prefix} ${i + 1}`, libraryItemId: `${prefix}-${i + 1}` };
    return gameTagId ? { ...base, gameTagId } : base;
  });
}

/** A 5×5, free-space card built in the library: 5 RL + 19 CoD. */
const SET_5_19 = [...squares('rl', RL, 5), ...squares('cod', COD, 19)];

function draftOf(overrides: Partial<HostableDraft> = {}): HostableDraft {
  return {
    templateId: null,
    name: '',
    boardSize: 5,
    freeSpace: true,
    stylePreset: 'neon',
    builtMix: { lanes: [{ gameTagId: RL, count: 5 }, { gameTagId: COD, count: 19 }] },
    set: SET_5_19,
    poolIds: null,
    dirty: false,
    ...overrides,
  };
}

function row(id: string, items: SquareItem[], extra: Partial<{ board_size: number; free_space: boolean; styles: unknown; mix: unknown }> = {}) {
  return { id, items, board_size: 5, free_space: true, styles: {}, mix: null, ...extra };
}

describe('cardSplit / cardSplitText', () => {
  it('counts each game against the legend, in the mix lane order', () => {
    const split = cardSplit({
      items: [...SET_5_19].reverse(), // CoD appears first in the items; the mix still says RL first
      board_size: 5,
      free_space: true,
      styles: { legend: [LEGEND[1], LEGEND[0]] },
      mix: { lanes: [{ gameTagId: RL, count: 5 }, { gameTagId: COD, count: 19 }] },
    });
    expect(cardSplitText(split)).toBe('5 Rocket League · 19 Call of Duty');
    expect(split.draws).toBeNull();
  });

  it('falls back to legend order when there is no mix', () => {
    const split = cardSplit({ items: SET_5_19, board_size: 5, free_space: true, styles: { legend: [LEGEND[1], LEGEND[0]] } });
    expect(cardSplitText(split)).toBe('19 Call of Duty · 5 Rocket League');
  });

  it('counts items with no game, or a game the legend lacks, as No Game, last', () => {
    const items = [...squares('rl', RL, 5), ...squares('ng', null, 2), ...squares('x', 'game-gone', 1), ...squares('cod', COD, 16)];
    const split = cardSplit({ items, board_size: 5, free_space: true, styles: { legend: LEGEND } });
    expect(cardSplitText(split)).toBe('5 Rocket League · 16 Call of Duty · 3 No Game');
  });

  it('skips the FREE marker and blank slots', () => {
    const items: SquareItem[] = [...SET_5_19, { text: 'FREE', isFreeSpace: true }, { text: '   ' }];
    expect(cardSplitText(cardSplit({ items, board_size: 5, free_space: true, styles: { legend: LEGEND } }))).toBe(
      '5 Rocket League · 19 Call of Duty',
    );
  });

  it('reads a card with no legend as N Items', () => {
    const items = squares('old', null, 24).map(({ text }) => ({ text }));
    expect(cardSplitText(cardSplit({ items, board_size: 5, free_space: true, styles: { preset: 'neon' } }))).toBe('24 Items');
    expect(cardSplitText(cardSplit({ items: items.slice(0, 1), board_size: 3, free_space: false, styles: null }))).toBe('1 Item');
  });

  it('reads a legacy card larger than its slots as a draw', () => {
    const items = squares('old', null, 30).map(({ text }) => ({ text }));
    const split = cardSplit({ items, board_size: 5, free_space: true, styles: {} });
    expect(split.draws).toBe(24);
    expect(cardSplitText(split)).toBe('Draws 24 From 30 Items');
    // Without free space the same card fills 25.
    expect(cardSplitText(cardSplit({ items, board_size: 5, free_space: false, styles: {} }))).toBe('Draws 25 From 30 Items');
  });

  it('survives a malformed row', () => {
    expect(cardSplitText(cardSplit({ items: null, board_size: 5, free_space: true, styles: { legend: 'nope' } }))).toBe('0 Items');
  });
});

describe('hostDraftFrom', () => {
  it('builds the styles exactly as Save Card does, and saves text + links only', () => {
    const draft = draftOf({ name: '  Thursday Mix ', set: [{ ...SET_5_19[0], originalIndex: 4 }, ...SET_5_19.slice(1)] });
    const host = hostDraftFrom(draft, TAGS);
    expect(host.styles).toEqual(cardStyles('neon', draft.set, TAGS));
    expect(host.styles.preset).toBe('neon');
    expect(host.styles.legend?.map((l) => l.name)).toEqual(['Rocket League', 'Call of Duty']);
    expect(host.items).toHaveLength(24);
    expect(host.items[0]).toEqual({ text: 'rl 1', libraryItemId: 'rl-1', gameTagId: RL });
    expect(host.mix).toEqual(draft.builtMix);
    expect(host.boardSize).toBe(5);
    expect(host.freeSpace).toBe(true);
    expect(draftSplit(host)).toEqual(cardSplit({ items: SET_5_19, board_size: 5, free_space: true, styles: { legend: LEGEND }, mix: draft.builtMix }));
  });

  it('names a nameless card Custom Card', () => {
    expect(hostCardName('')).toBe('Custom Card');
    expect(hostCardName('   ')).toBe('Custom Card');
    expect(hostCardName(' Thursday Mix ')).toBe('Thursday Mix');
  });
});

describe('hostCardFor', () => {
  const saved = row('card-1', SET_5_19);

  it('hosts an unchanged saved card by its id', () => {
    expect(hostCardFor(draftOf({ templateId: 'card-1' }), TAGS, saved)).toEqual({ kind: 'saved', templateId: 'card-1' });
  });

  it('matches the saved squares ignoring order and case', () => {
    const shuffled = [...SET_5_19].reverse().map((s, i) => (i === 0 ? { ...s, text: s.text!.toUpperCase() } : s));
    expect(hostCardFor(draftOf({ templateId: 'card-1', set: shuffled }), TAGS, saved).kind).toBe('saved');
  });

  it('inserts a draft when there is no saved card, or it is dirty', () => {
    expect(hostCardFor(draftOf(), TAGS, undefined).kind).toBe('draft');
    expect(hostCardFor(draftOf({ templateId: 'card-1', dirty: true }), TAGS, saved).kind).toBe('draft');
  });

  it('inserts a draft when the saved card is not in the saved list (removed, or another card)', () => {
    expect(hostCardFor(draftOf({ templateId: 'card-1' }), TAGS, undefined).kind).toBe('draft');
    expect(hostCardFor(draftOf({ templateId: 'card-1' }), TAGS, row('card-2', SET_5_19)).kind).toBe('draft');
  });

  it('inserts a draft for a pool card: the 24 on screen, not a fresh draw per player', () => {
    const pool = row('legacy', [...SET_5_19, ...squares('extra', null, 6)]);
    expect(hostCardFor(draftOf({ templateId: 'legacy', poolIds: ['x'] }), TAGS, pool).kind).toBe('draft');
  });

  it('inserts a draft for a short legacy card topped up from the library', () => {
    const short = row('legacy', SET_5_19.slice(0, 20));
    expect(hostCardFor(draftOf({ templateId: 'legacy' }), TAGS, short).kind).toBe('draft');
  });

  it('inserts a draft when the board settings differ from the row', () => {
    expect(hostCardFor(draftOf({ templateId: 'card-1' }), TAGS, row('card-1', SET_5_19, { free_space: false })).kind).toBe('draft');
  });

  it('carries the built draft on the draft path', () => {
    const result = hostCardFor(draftOf({ name: 'Tonight' }), TAGS, undefined);
    expect(result.kind === 'draft' && result.draft.name).toBe('Tonight');
    expect(result.kind === 'draft' && result.draft.items).toHaveLength(24);
  });
});

describe('chooseDefaultCard', () => {
  const a = { id: 'a', saved: true };
  const b = { id: 'b', saved: true };
  const copy = { id: 'copy', saved: false };

  it('preselects the latest room card when it is saved', () => {
    expect(chooseDefaultCard([a, b], b)).toEqual({ lastUnsaved: null, selectedId: 'b' });
  });

  it('lists an unsaved latest card first and preselects it', () => {
    expect(chooseDefaultCard([a, b], copy)).toEqual({ lastUnsaved: copy, selectedId: 'copy' });
    expect(chooseDefaultCard([], copy)).toEqual({ lastUnsaved: copy, selectedId: 'copy' });
  });

  it('falls back to the newest saved card when the latest room has no card', () => {
    expect(chooseDefaultCard([a, b], null)).toEqual({ lastUnsaved: null, selectedId: 'a' });
  });

  it('falls back when the latest card is saved but not one of mine', () => {
    expect(chooseDefaultCard([a, b], { id: 'theirs', saved: true })).toEqual({ lastUnsaved: null, selectedId: 'a' });
  });

  it('selects nothing when there are no cards at all', () => {
    expect(chooseDefaultCard([], null)).toEqual({ lastUnsaved: null, selectedId: null });
  });
});
