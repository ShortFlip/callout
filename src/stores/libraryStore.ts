import { create } from 'zustand';
import { notify } from '@/lib/library/notify';
import { countByLane, slotsFor, type LaneKey } from '@/lib/game/card-builder';
import { seededRng } from '@/lib/game/seed-rng';
import { CARD_PRESETS } from '@/lib/card-styles';
import * as api from '@/lib/library/api';
import { computeHeat, type HeatMap } from '@/lib/library/heat';
import {
  cardStyles,
  fillEmptySquares,
  itemsForSave,
  laneKeysFor,
  matchCardItems,
  mixForBuild,
  mixFromSet,
  squareFrom,
} from '@/lib/library/card-draft';
import type { CardStyles, CardTemplate, SquareItem } from '@/types/card';
import type { CardMix, GameColorKey, GameIconKey, LibraryItem, MixLane, Tag, TagKind } from '@/types/library';

/*
 * State for /library: the owner's items and tags, the items pane's filter,
 * search and selection, and the card being built in the card pane.
 *
 * The card is a list he fills (decision 0004): Add puts one item in the next
 * empty square, Remove empties one, and Fill Empty is the only random step.
 * Nothing else reorders or redraws the card: not the size, not the mix, not a
 * library edit (which only drops a deleted item's square or relabels one).
 *
 * The card draft (not the library) is saved to localStorage under
 * squares:card-draft, so a refresh or a trip to the landing page does not lose
 * a half-built card. Storage can be blocked (private mode, site data off):
 * every read and write is wrapped so the page works without it.
 */

/** 'all', 'none' (No Game), or a tag id (a game or an extra tag). */
export type LibraryFilter = 'all' | 'none' | string;

export interface CardDraft {
  /** Who this draft belongs to; a draft from another player on this browser is ignored. */
  ownerId: string | null;
  /** The saved card this draft was loaded from (or last saved as), if any. */
  templateId: string | null;
  name: string;
  boardSize: number;
  freeSpace: boolean;
  stylePreset: string;
  /** The split Fill Empty draws with, as proportions. Empty lanes = an even split across the games. */
  mix: CardMix;
  /** The card's real split, squares per game. What Save stores. */
  builtMix: CardMix;
  /** The squares, in order. Shorter than the slots while the card has empty squares. */
  set: SquareItem[];
  /**
   * A loaded card that holds more items than its slots fills from its own
   * items only (null = the whole library).
   */
  poolIds: string[] | null;
  /** Changed since it was loaded or saved. Host This Card hosts an unchanged saved card by its id (hostCardFor). */
  dirty: boolean;
}

const DRAFT_KEY = 'squares:card-draft';

function blankDraft(ownerId: string | null): CardDraft {
  return {
    ownerId,
    templateId: null,
    name: '',
    boardSize: 5,
    freeSpace: true,
    stylePreset: 'default',
    mix: { lanes: [] },
    builtMix: { lanes: [] },
    set: [],
    poolIds: null,
    dirty: false,
  };
}

function readStoredDraft(ownerId: string): CardDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CardDraft>;
    if (parsed.ownerId !== ownerId || !Array.isArray(parsed.set)) return null;
    // Spread over a blank so a draft written by an older build still has every field.
    return { ...blankDraft(ownerId), ...parsed, ownerId };
  } catch {
    return null;
  }
}

function writeStoredDraft(draft: CardDraft): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Blocked or full storage only costs the draft surviving a refresh.
  }
}

/** A fresh seed per Fill, so filling a cleared card again never repeats itself. */
function freshRng(): () => number {
  return seededRng(crypto.randomUUID());
}

/** Toast a LibraryError's human message; anything else gets a generic one. */
function toastError(error: unknown, fallback: string): void {
  notify.error(error instanceof api.LibraryError ? error.message : fallback);
  if (!(error instanceof api.LibraryError) && process.env.NODE_ENV !== 'production') {
    console.error('[library]', error);
  }
}

interface LibraryState {
  ownerId: string | null;
  items: LibraryItem[];
  tags: Tag[];
  loaded: boolean;
  /** Item id → marks and appearances from past rounds. Empty until loaded, or if it failed. */
  heat: HeatMap;
  savedCards: CardTemplate[];

  filter: LibraryFilter;
  search: string;
  selectedIds: string[];
  /**
   * The game picked in the Add an Item row's select for the current filter
   * (null = none picked, so the row follows addItemDefaults). Every filter
   * change clears it, so a new view starts on its own default again.
   */
  addPick: { gameTagId: string | null } | null;
  /** The game last picked in the Add an Item row: its default under All. Memory only, for this session. */
  addLastGame: string | null;

  draft: CardDraft;
  /** Lanes that asked for more squares than they have items, from the last build. */
  capped: LaneKey[];

  // ── Library ──
  load: (ownerId: string) => Promise<boolean>;
  refreshSavedCards: () => Promise<void>;
  /** Load item heat. Separate from load() so a failure only costs the heat, never the library. */
  loadHeat: () => Promise<void>;
  setFilter: (filter: LibraryFilter) => void;
  setSearch: (search: string) => void;
  toggleSelected: (id: string) => void;
  setSelected: (ids: string[]) => void;
  clearSelection: () => void;
  /** Pick the Add an Item row's game (null = No Game); remembered as the row's default under All. */
  pickAddGame: (gameTagId: string | null) => void;
  /** Add texts through importItems. `failMessage` replaces the list wording in the error toast. */
  importList: (
    texts: string[],
    gameTagId: string | null,
    tagIds: string[],
    failMessage?: string,
  ) => Promise<{ added: number; skipped: number } | null>;
  renameItem: (id: string, text: string) => Promise<boolean>;
  setGameFor: (ids: string[], gameTagId: string | null) => Promise<boolean>;
  addTagTo: (ids: string[], tagId: string) => Promise<boolean>;
  removeTagFrom: (ids: string[], tagId: string) => Promise<boolean>;
  deleteItems: (ids: string[]) => Promise<boolean>;
  createTag: (input: { name: string; kind: TagKind; color?: GameColorKey | null; icon?: GameIconKey | null }) => Promise<Tag | null>;

  // ── Card ──
  /** The draft saved in this browser, or a fresh 5×5 from an even mix of the owner's games. */
  restoreDraft: () => void;
  newCard: () => void;
  loadCard: (card: CardTemplate) => void;
  setName: (name: string) => void;
  setBoardSize: (size: number) => void;
  setFreeSpace: (on: boolean) => void;
  setStylePreset: (preset: string) => void;
  setMix: (lanes: MixLane[]) => void;
  /** Put an item in the next empty square. False when the card is full or the item is already on it. */
  addItem: (itemId: string) => boolean;
  /** Take an item off the card, leaving its square empty. */
  removeItem: (itemId: string) => void;
  removeSquare: (index: number) => void;
  /** Fill every empty square at random from the mix. Never touches a square already there. */
  fillEmpty: () => void;
  clearCard: () => void;
  useWholeLibrary: () => void;
  saveCard: (targetId: string | null) => Promise<boolean>;
}

/** The items Fill Empty may draw from: the whole library, or a loaded pool card's own items. */
export function poolFor(items: LibraryItem[], draft: CardDraft): LibraryItem[] {
  if (!draft.poolIds) return items;
  const allowed = new Set(draft.poolIds);
  return items.filter((item) => allowed.has(item.id));
}

/** Squares on the card with nothing in them yet. */
export function emptySlots(draft: CardDraft): number {
  return Math.max(0, slotsFor(draft.boardSize, draft.freeSpace) - draft.set.length);
}

/** Items Fill Empty can still draw, per lane: the pool minus what is already on the card. */
export function fillableCounts(items: LibraryItem[], draft: CardDraft): Map<LaneKey, number> {
  const onCard = new Set(draft.set.map((square) => square.libraryItemId));
  return countByLane(poolFor(items, draft).filter((item) => !onCard.has(item.id)));
}

export const useLibraryStore = create<LibraryState>((set, get) => {
  /** Replace the card's squares: Save stores the real split, and the draft is now an edit. */
  function setSquares(next: SquareItem[]): void {
    set({ draft: { ...get().draft, set: next, builtMix: mixFromSet(next), dirty: true } });
  }

  /**
   * Bring the card in line with the library without moving a square: a
   * deleted item's square empties (an edit), and a square follows its item's
   * game (not an edit). Text-only squares (no libraryItemId) are left alone.
   */
  function syncSquares(): void {
    const { items, draft } = get();
    const byId = new Map(items.map((item) => [item.id, item]));
    const next: SquareItem[] = [];
    for (const square of draft.set) {
      const item = square.libraryItemId ? byId.get(square.libraryItemId) : undefined;
      if (!square.libraryItemId) next.push(square);
      // Keep the square's own text (a loaded card's spelling); take the item's current game.
      else if (item) next.push({ ...squareFrom(item), text: square.text });
    }
    const relabelled = next.some((square, i) => square.gameTagId !== draft.set[i]?.gameTagId);
    const dropped = next.length !== draft.set.length;
    if (!dropped && !relabelled) return;
    set({ draft: { ...draft, set: next, builtMix: mixFromSet(next), dirty: draft.dirty || dropped } });
  }

  /** Apply a library change locally, then let the card catch up. */
  function afterLibraryChange(items: LibraryItem[]): void {
    set({ items });
    syncSquares();
  }

  /** Cut squares from the bottom when the card gets smaller, and say how many went. */
  function resize(patch: Pick<Partial<CardDraft>, 'boardSize' | 'freeSpace'>): void {
    const draft = { ...get().draft, ...patch };
    const slots = slotsFor(draft.boardSize, draft.freeSpace);
    const cut = Math.max(0, draft.set.length - slots);
    const next = cut > 0 ? draft.set.slice(0, slots) : draft.set;
    set({ draft: { ...draft, set: next, builtMix: mixFromSet(next), dirty: true } });
    if (cut > 0) notify.info(`Removed the last ${cut} ${cut === 1 ? 'square' : 'squares'} to fit`);
  }

  return {
    ownerId: null,
    items: [],
    tags: [],
    loaded: false,
    heat: {},
    savedCards: [],
    filter: 'all',
    search: '',
    selectedIds: [],
    addPick: null,
    addLastGame: null,
    draft: blankDraft(null),
    capped: [],

    async load(ownerId) {
      try {
        const [{ items, tags }, savedCards] = await Promise.all([
          api.loadLibrary(ownerId),
          api.loadSavedCards(ownerId),
        ]);
        set({ ownerId, items, tags, savedCards, loaded: true, selectedIds: [] });
        // Not awaited: heat is a nice-to-have and must not hold the page up.
        void get().loadHeat();
        return true;
      } catch (error) {
        toastError(error, 'Could not load your library.');
        return false;
      }
    },

    async loadHeat() {
      const { ownerId } = get();
      if (!ownerId) return;
      try {
        const rows = await api.loadHeatRows(ownerId);
        // Computed against the items as they stand now, so a text-only square
        // from an old round still finds the item it became.
        set({ heat: computeHeat(get().items, rows) });
      } catch (error) {
        set({ heat: {} });
        toastError(error, 'Could not load item heat.');
      }
    },

    async refreshSavedCards() {
      const { ownerId } = get();
      if (!ownerId) return;
      try {
        set({ savedCards: await api.loadSavedCards(ownerId) });
      } catch (error) {
        toastError(error, 'Could not load your saved cards.');
      }
    },

    // A new filter hides rows, so a selection made under the old one is cleared
    // rather than left to be bulk-edited unseen. The Add an Item row's pick is
    // cleared too, so the row starts on the new view's default.
    setFilter: (filter) => set({ filter, selectedIds: [], addPick: null }),
    pickAddGame: (gameTagId) => set({ addPick: { gameTagId }, addLastGame: gameTagId }),
    setSearch: (search) => set({ search }),
    toggleSelected: (id) =>
      set((s) => ({
        selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id],
      })),
    setSelected: (ids) => set({ selectedIds: ids }),
    clearSelection: () => set({ selectedIds: [] }),

    async importList(texts, gameTagId, tagIds, failMessage) {
      const { ownerId } = get();
      if (!ownerId) return null;
      try {
        const result = await api.importItems(ownerId, texts, gameTagId, tagIds, failMessage);
        afterLibraryChange([...result.items, ...get().items]);
        return { added: result.added, skipped: result.skipped };
      } catch (error) {
        toastError(error, failMessage ?? 'Could not import that list.');
        // An import can fail halfway (items in, tags not), so re-read rather
        // than guess what landed. Quietly: the toast above already spoke.
        try {
          afterLibraryChange((await api.loadLibrary(ownerId)).items);
        } catch {
          // Still out of sync; the next page load fixes it.
        }
        return null;
      }
    },

    async renameItem(id, text) {
      try {
        const next = await api.updateItemText(id, text);
        afterLibraryChange(get().items.map((item) => (item.id === id ? { ...item, text: next } : item)));
        // A square on the card follows the library's spelling while it is a draft.
        const { draft } = get();
        if (draft.set.some((square) => square.libraryItemId === id)) {
          set({
            draft: {
              ...draft,
              set: draft.set.map((square) => (square.libraryItemId === id ? { ...square, text: next } : square)),
              dirty: true,
            },
          });
        }
        return true;
      } catch (error) {
        toastError(error, 'Could not rename that item.');
        return false;
      }
    },

    async setGameFor(ids, gameTagId) {
      if (ids.length === 0) return true;
      try {
        await api.setGame(ids, gameTagId);
        const touched = new Set(ids);
        afterLibraryChange(get().items.map((item) => (touched.has(item.id) ? { ...item, gameTagId } : item)));
        return true;
      } catch (error) {
        toastError(error, 'Could not change the game.');
        return false;
      }
    },

    async addTagTo(ids, tagId) {
      const targets = get().items.filter((item) => ids.includes(item.id) && !item.tagIds.includes(tagId)).map((item) => item.id);
      if (targets.length === 0) return true;
      try {
        await api.addTag(targets, tagId);
        const touched = new Set(targets);
        set({ items: get().items.map((item) => (touched.has(item.id) ? { ...item, tagIds: [...item.tagIds, tagId] } : item)) });
        return true;
      } catch (error) {
        toastError(error, 'Could not add that tag.');
        return false;
      }
    },

    async removeTagFrom(ids, tagId) {
      // Only items that carry the tag: removeTag expects every one back.
      const targets = get().items.filter((item) => ids.includes(item.id) && item.tagIds.includes(tagId)).map((item) => item.id);
      if (targets.length === 0) return true;
      try {
        await api.removeTag(targets, tagId);
        const touched = new Set(targets);
        set({ items: get().items.map((item) => (touched.has(item.id) ? { ...item, tagIds: item.tagIds.filter((t) => t !== tagId) } : item)) });
        return true;
      } catch (error) {
        toastError(error, 'Could not remove that tag.');
        return false;
      }
    },

    async deleteItems(ids) {
      try {
        await api.deleteItems(ids);
        const gone = new Set(ids);
        set({ selectedIds: get().selectedIds.filter((id) => !gone.has(id)) });
        afterLibraryChange(get().items.filter((item) => !gone.has(item.id)));
        return true;
      } catch (error) {
        toastError(error, 'Could not delete those items.');
        return false;
      }
    },

    async createTag(input) {
      const { ownerId } = get();
      if (!ownerId) return null;
      try {
        const tag = await api.createTag(ownerId, input);
        set({ tags: [...get().tags, tag] });
        return tag;
      } catch (error) {
        toastError(error, 'Could not create that tag.');
        return null;
      }
    },

    restoreDraft() {
      const { ownerId } = get();
      if (!ownerId) return;
      const stored = readStoredDraft(ownerId);
      // Restoring is not editing: only an item deleted since then marks it.
      set({ draft: stored ?? blankDraft(ownerId), capped: [] });
      syncSquares();
    },

    // A new card starts empty: he fills it by hand, with Fill Empty, or both.
    newCard: () => set({ draft: blankDraft(get().ownerId), capped: [] }),

    loadCard(card) {
      const styles = (card.styles ?? {}) as CardStyles;
      const preset = CARD_PRESETS.some((p) => p.id === styles.preset) ? styles.preset! : 'default';
      const { squares } = matchCardItems((card.items ?? []) as SquareItem[], get().items);
      const slots = slotsFor(card.board_size, card.free_space);

      const base: CardDraft = {
        ...blankDraft(get().ownerId),
        templateId: card.id,
        name: card.name,
        boardSize: card.board_size,
        freeSpace: card.free_space,
        stylePreset: preset,
      };

      if (squares.length > slots) {
        // A pool card (a legacy card with more items than squares): draw the
        // slots from its own items once. Text-only items cannot be drawn, so
        // they sit this round out. Fill Empty keeps drawing from this pool
        // until Use Whole Library.
        const poolIds = squares.map((s) => s.libraryItemId).filter((id): id is string => !!id);
        // Weight each lane by its share of the card's items: an even draw
        // across the pool, the way the room used to deal it. (The page's
        // default would leave No Game at 0%, and a legacy card is mostly No Game.)
        const mix = mixFromSet(squares);
        const allowed = new Set(poolIds);
        const pool = get().items.filter((item) => allowed.has(item.id));
        const result = fillEmptySquares({ current: [], pool, slots, mix, rng: freshRng() });
        set({ draft: { ...base, poolIds, set: result.set, mix, builtMix: mixFromSet(result.set) }, capped: result.capped });
      } else {
        // Load exactly, gaps and all: a short legacy card shows its empty squares.
        const own = mixFromSet(squares);
        set({ draft: { ...base, set: squares, mix: own, builtMix: own }, capped: [] });
      }
    },

    setName: (name) => set((s) => ({ draft: { ...s.draft, name, dirty: true } })),
    setBoardSize: (boardSize) => resize({ boardSize }),
    setFreeSpace: (freeSpace) => resize({ freeSpace }),
    setStylePreset: (stylePreset) => set((s) => ({ draft: { ...s.draft, stylePreset, dirty: true } })),
    // The mix only steers the next Fill Empty. It changes no square, so it is not an edit.
    setMix: (lanes) => set((s) => ({ draft: { ...s.draft, mix: { lanes } } })),

    addItem(itemId) {
      const { draft, items } = get();
      const item = items.find((i) => i.id === itemId);
      if (!item || draft.set.some((square) => square.libraryItemId === itemId)) return false;
      if (emptySlots(draft) === 0) {
        notify.info('The card is full. Remove a square first.');
        return false;
      }
      setSquares([...draft.set, squareFrom(item)]);
      return true;
    },

    removeItem(itemId) {
      setSquares(get().draft.set.filter((square) => square.libraryItemId !== itemId));
    },

    removeSquare(index) {
      setSquares(get().draft.set.filter((_, i) => i !== index));
    },

    fillEmpty() {
      const { draft, items, tags } = get();
      const pool = poolFor(items, draft);
      const result = fillEmptySquares({
        current: draft.set,
        pool,
        slots: slotsFor(draft.boardSize, draft.freeSpace),
        mix: mixForBuild(draft.mix, laneKeysFor(pool, tags)),
        rng: freshRng(),
      });
      set({ capped: result.capped });
      if (result.added > 0) setSquares(result.set);
      if (result.shortBy > 0) {
        notify.info(`Ran out of items: ${result.shortBy} ${result.shortBy === 1 ? 'square is' : 'squares are'} still empty`);
      }
    },

    clearCard() {
      setSquares([]);
      set({ capped: [] });
    },

    useWholeLibrary: () => set((s) => ({ draft: { ...s.draft, poolIds: null } })),

    async saveCard(targetId) {
      const { draft, tags, ownerId } = get();
      if (!ownerId) return false;
      const styles = cardStyles(draft.stylePreset, draft.set, tags);
      try {
        const id = await api.saveCard({
          id: targetId,
          ownerId,
          name: draft.name,
          boardSize: draft.boardSize,
          freeSpace: draft.freeSpace,
          styles,
          items: itemsForSave(draft.set),
          mix: draft.builtMix,
        });
        set({ draft: { ...get().draft, templateId: id, name: draft.name.trim(), dirty: false } });
        await get().refreshSavedCards();
        return true;
      } catch (error) {
        toastError(error, 'Could not save that card.');
        return false;
      }
    },
  };
});

// Persist the card draft (never the library) whenever it changes.
if (typeof window !== 'undefined') {
  useLibraryStore.subscribe((state, prev) => {
    if (state.draft !== prev.draft && state.draft.ownerId) writeStoredDraft(state.draft);
  });
}

/** Items per lane in the pool the card draws from. */
export function laneCounts(items: LibraryItem[], draft: CardDraft): Map<LaneKey, number> {
  return countByLane(poolFor(items, draft));
}
