import { describe, it, expect } from 'vitest';
import { addItemDefaults, matchesFilter, revealFor } from '../add-item';
import type { LibraryItem, Tag } from '@/types/library';

const RL = 'game-rl';
const COD = 'game-cod';
const MECH = 'tag-mechanics';

const TAGS: Tag[] = [
  { id: RL, ownerId: 'me', name: 'Rocket League', kind: 'game', color: 'sky', icon: 'car', logoUrl: null },
  { id: COD, ownerId: 'me', name: 'Call of Duty', kind: 'game', color: 'orange', icon: 'crosshair', logoUrl: null },
  { id: MECH, ownerId: 'me', name: 'Mechanics', kind: 'tag', color: null, icon: null, logoUrl: null },
];
const GAME_IDS = new Set([RL, COD]);

function item(text: string, gameTagId: string | null, tagIds: string[] = []): LibraryItem {
  return { id: `item-${text}`, text, gameTagId, tagIds };
}

describe('addItemDefaults', () => {
  it('preselects the filtered game, with no extra tag', () => {
    expect(addItemDefaults(RL, TAGS, COD)).toEqual({ gameTagId: RL, tagIds: [] });
    expect(addItemDefaults(COD, TAGS, null)).toEqual({ gameTagId: COD, tagIds: [] });
  });

  it('starts on No Game under the No Game filter, whatever was picked last', () => {
    expect(addItemDefaults('none', TAGS, RL)).toEqual({ gameTagId: null, tagIds: [] });
  });

  it('starts on No Game and carries the tag under an extra-tag filter', () => {
    expect(addItemDefaults(MECH, TAGS, RL)).toEqual({ gameTagId: null, tagIds: [MECH] });
  });

  it('follows the last game picked in the row under All, starting on No Game', () => {
    expect(addItemDefaults('all', TAGS, null)).toEqual({ gameTagId: null, tagIds: [] });
    expect(addItemDefaults('all', TAGS, COD)).toEqual({ gameTagId: COD, tagIds: [] });
  });

  it('drops a last pick that is no longer one of his games', () => {
    expect(addItemDefaults('all', TAGS, 'game-deleted')).toEqual({ gameTagId: null, tagIds: [] });
    // An extra tag's id is not a game either.
    expect(addItemDefaults('all', TAGS, MECH)).toEqual({ gameTagId: null, tagIds: [] });
  });

  it('starts on No Game with no tag for a filter id that matches no tag', () => {
    expect(addItemDefaults('tag-gone', TAGS, RL)).toEqual({ gameTagId: null, tagIds: [] });
  });

  it('returns a fresh tag list each call, so a caller cannot mutate the defaults', () => {
    const a = addItemDefaults(MECH, TAGS, null);
    a.tagIds.push('x');
    expect(addItemDefaults(MECH, TAGS, null).tagIds).toEqual([MECH]);
  });
});

describe('matchesFilter', () => {
  const rl = item('Flip Reset', RL, [MECH]);
  const loose = item('Snack Break', null);

  it('shows everything under All', () => {
    expect(matchesFilter(rl, 'all', GAME_IDS)).toBe(true);
    expect(matchesFilter(loose, 'all', GAME_IDS)).toBe(true);
  });

  it('shows only No Game items under No Game', () => {
    expect(matchesFilter(loose, 'none', GAME_IDS)).toBe(true);
    expect(matchesFilter(rl, 'none', GAME_IDS)).toBe(false);
  });

  it('matches a game filter on the game, and a tag filter on the tags', () => {
    expect(matchesFilter(rl, RL, GAME_IDS)).toBe(true);
    expect(matchesFilter(rl, COD, GAME_IDS)).toBe(false);
    expect(matchesFilter(rl, MECH, GAME_IDS)).toBe(true);
    expect(matchesFilter(loose, MECH, GAME_IDS)).toBe(false);
  });
});

describe('revealFor', () => {
  const added = item('Musty Flick Double Touch', RL);

  it('changes nothing when the item already shows', () => {
    expect(revealFor(added, RL, '', GAME_IDS)).toEqual({ clearSearch: false, showAll: false });
    expect(revealFor(added, 'all', 'musty', GAME_IDS)).toEqual({ clearSearch: false, showAll: false });
  });

  it('clears a search the item does not contain, ignoring case and outer spaces', () => {
    expect(revealFor(added, 'all', 'kill', GAME_IDS).clearSearch).toBe(true);
    expect(revealFor(added, 'all', '  DOUBLE TOUCH ', GAME_IDS).clearSearch).toBe(false);
    // A search of only spaces hides nothing.
    expect(revealFor(added, 'all', '   ', GAME_IDS).clearSearch).toBe(false);
  });

  it('goes back to All when he picked a game the filter hides', () => {
    expect(revealFor(added, COD, '', GAME_IDS).showAll).toBe(true);
    expect(revealFor(added, 'none', '', GAME_IDS).showAll).toBe(true);
  });

  it('keeps a tag filter when the item carries that tag, whatever its game', () => {
    const tagged = item('Wall Clear', COD, [MECH]);
    expect(revealFor(tagged, MECH, '', GAME_IDS)).toEqual({ clearSearch: false, showAll: false });
  });
});
