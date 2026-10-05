import { allocateMix, buildCardSet, countByLane, type LaneKey } from '@/lib/game/card-builder';
import { CARD_PRESETS } from '@/lib/card-styles';
import type { CardStyles, SquareItem } from '@/types/card';
import type { CardMix, LegendEntry, LibraryItem, MixLane, Tag } from '@/types/library';

/*
 * Pure helpers behind the library page's card pane. They sit on top of
 * card-builder.ts (which owns the maths: lane counts, pins, caps, drawing) and
 * add what the page needs around it: keeping a card stable while it is being
 * edited, reading a saved card back into the library's terms, and the legend a
 * saved card carries. No Supabase and no React, so all of it is unit-tested in
 * src/lib/library/__tests__/card-draft.test.ts.
 */

/** Trimmed, case-insensitive text key: how the library decides two items are the same. */
export function textKey(text: string | undefined | null): string {
  return (text ?? '').trim().toLowerCase();
}

/**
 * Split a parsed paste into what to insert and how many to skip.
 *
 * Skips blanks, repeats within the paste, and anything the owner already has
 * (trimmed, case-insensitive: the same rule as the DB's unique index on
 * (owner_id, lower(text))). Keeps the first spelling typed, trimmed, because
 * that is the one that ends up on the card.
 */
export function planImport(
  texts: string[],
  existingTexts: Iterable<string>,
): { fresh: string[]; skipped: number } {
  const seen = new Set<string>();
  for (const text of existingTexts) seen.add(textKey(text));

  const fresh: string[] = [];
  let skipped = 0;
  for (const raw of texts) {
    const text = raw.trim();
    if (!text) continue;
    const key = textKey(text);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    fresh.push(text);
  }
  return { fresh, skipped };
}

/**
 * The mix lanes the page offers: every game that has items (in tag order, so
 * the first game created sits on the left of the split slider), then No Game
 * when there are untagged items.
 */
export function laneKeysFor(pool: LibraryItem[], tags: Tag[]): LaneKey[] {
  const counts = countByLane(pool);
  const games = tags
    .filter((tag) => tag.kind === 'game' && (counts.get(tag.id) ?? 0) > 0)
    .map((tag) => tag.id);
  return counts.has(null) ? [...games, null] : games;
}

/**
 * The mix a card uses before anyone has touched the slider: an even split
 * across the games, with No Game at 0% (spec: "No Game can join the mix as its
 * own lane, default 0%"). A library with no games at all splits across No Game,
 * so a fresh, untagged library still fills its card.
 */
export function defaultMix(lanes: LaneKey[]): CardMix {
  const hasGame = lanes.some((lane) => lane !== null);
  return {
    lanes: lanes.map((gameTagId) => ({
      gameTagId,
      count: gameTagId === null && hasGame ? 0 : 1,
    })),
  };
}

/** The requested mix, or the default when it is empty (nobody has moved a slider yet). */
export function mixForBuild(requested: CardMix, lanes: LaneKey[]): CardMix {
  return requested.lanes.length > 0 ? requested : defaultMix(lanes);
}

/**
 * The real split of a set: squares per lane, counting only squares that came
 * from the library (a text-only square has no lane). First-seen order.
 */
export function mixFromSet(set: SquareItem[]): CardMix {
  const lanes: MixLane[] = [];
  for (const square of set) {
    if (!square.libraryItemId) continue;
    const key = square.gameTagId ?? null;
    const lane = lanes.find((l) => l.gameTagId === key);
    if (lane) lane.count++;
    else lanes.push({ gameTagId: key, count: 1 });
  }
  return { lanes };
}

/**
 * Three-or-more-lane sliders: set one lane to `value` and share what is left
 * across the others in proportion to what they hold now, by largest remainder
 * (allocateMix), capped at the items each has. When every other lane is at 0
 * the rest is shared evenly. The result always totals `slots` unless the
 * library cannot fill it.
 */
export function rebalanceLanes(
  lanes: MixLane[],
  index: number,
  value: number,
  slots: number,
  available: ReadonlyMap<LaneKey, number>,
): MixLane[] {
  const total = Math.max(0, Math.floor(slots));
  const own = Math.min(total, Math.max(0, Math.round(value)));
  const others = lanes.filter((_, i) => i !== index);
  const shared = allocateMix(others, total - own, available).lanes;

  return lanes.map((lane, i) =>
    i === index
      ? { gameTagId: lane.gameTagId, count: own }
      : { gameTagId: lane.gameTagId, count: shared.find((s) => s.gameTagId === lane.gameTagId)?.count ?? 0 },
  );
}

/** A library item as a square: gameTagId omitted, not null, for No Game (same as card-builder). */
export function squareFrom(item: LibraryItem): SquareItem {
  return item.gameTagId
    ? { text: item.text, libraryItemId: item.id, gameTagId: item.gameTagId }
    : { text: item.text, libraryItemId: item.id };
}

export interface FillResult {
  /** The card as it was, with the drawn squares appended. */
  set: SquareItem[];
  /** How many squares the draw added. */
  added: number;
  /** Lanes that asked for more squares than they had items left. */
  capped: LaneKey[];
  /** Squares still empty because the library ran out of items. */
  shortBy: number;
}

/**
 * Fill a card's empty squares at random, never touching what is already on
 * it. This is the card builder's only random step (decision 0004): the card is
 * a list he fills, and randomness happens only when he presses Fill.
 *
 * - The draw skips every item already on the card, and any library item whose
 *   text matches a text-only square (a saved card's item the library lost).
 * - `mix` is read as proportions (allocateMix), so the split he set applies to
 *   just the empty squares: 2:1 over 6 empty squares draws 4 and 2.
 */
export function fillEmptySquares({
  current,
  pool,
  slots,
  mix,
  rng,
}: {
  current: SquareItem[];
  pool: LibraryItem[];
  slots: number;
  mix: CardMix;
  rng: () => number;
}): FillResult {
  const empty = Math.max(0, Math.floor(slots) - current.length);
  if (empty === 0) return { set: current, added: 0, capped: [], shortBy: 0 };

  const onCard = new Set(current.map((square) => square.libraryItemId).filter((id): id is string => !!id));
  const textOnly = new Set(current.filter((square) => !square.libraryItemId).map((square) => textKey(square.text)));
  const usable = pool.filter((item) => !onCard.has(item.id) && !textOnly.has(textKey(item.text)));

  const built = buildCardSet({ pool: usable, slots: empty, mix, pinnedIds: [], rng });
  return {
    set: [...current, ...built.set],
    added: built.set.length,
    capped: built.capped,
    shortBy: Math.max(0, empty - built.set.length),
  };
}

/**
 * Read a saved card's items back in library terms, so a card saved before the
 * library existed still pins, swaps and shows its games.
 *
 * Each item is matched by its libraryItemId when that item still exists, else
 * by trimmed, case-insensitive text. A match takes the library item's id and
 * current game and keeps the card's own spelling. No match keeps the text only.
 */
export function matchCardItems(
  items: SquareItem[],
  library: LibraryItem[],
): { squares: SquareItem[]; unmatched: number } {
  const byId = new Map(library.map((item) => [item.id, item]));
  const byText = new Map<string, LibraryItem>();
  for (const item of library) {
    const key = textKey(item.text);
    if (!byText.has(key)) byText.set(key, item);
  }

  const used = new Set<string>();
  const squares: SquareItem[] = [];
  let unmatched = 0;
  for (const raw of items) {
    if (raw.isFreeSpace) continue;
    const text = raw.text?.trim();
    if (!text) continue;

    const direct = raw.libraryItemId ? byId.get(raw.libraryItemId) : undefined;
    const item = direct ?? byText.get(textKey(text));
    if (item && !used.has(item.id)) {
      used.add(item.id);
      squares.push({ ...squareFrom(item), text });
    } else {
      unmatched++;
      squares.push({ text });
    }
  }
  return { squares, unmatched };
}

/**
 * The legend a saved card carries: one entry per game on the card, in the
 * order the games first appear. Only game tags with a known colour and icon
 * make it in; a tag that lost either would draw nothing on the board anyway.
 */
export function buildLegend(set: SquareItem[], tags: Tag[]): LegendEntry[] {
  const legend: LegendEntry[] = [];
  for (const square of set) {
    const id = square.gameTagId;
    if (!id || legend.some((entry) => entry.gameTagId === id)) continue;
    const tag = tags.find((t) => t.id === id);
    if (!tag || tag.kind !== 'game' || !tag.color || !tag.icon) continue;
    legend.push({
      gameTagId: tag.id,
      name: tag.name,
      color: tag.color,
      icon: tag.icon,
      // Only when there is one, so a card without logos saves byte-for-byte as before.
      ...(tag.logoUrl ? { logoUrl: tag.logoUrl } : {}),
    });
  }
  return legend;
}

/**
 * The styles a card built on the library page carries: its preset's colours,
 * the preset id, and the legend of the games on it. Save Card and Host This
 * Card both write exactly this, so a hosted copy looks the same as a saved one.
 * An unknown preset id falls back to the first preset (Default).
 */
export function cardStyles(presetId: string, set: SquareItem[], tags: Tag[]): CardStyles {
  const preset = CARD_PRESETS.find((p) => p.id === presetId) ?? CARD_PRESETS[0];
  return { ...preset.styles, preset: preset.id, legend: buildLegend(set, tags) };
}

/** What Save writes into card_templates.items: text plus the library link, nothing else. */
export function itemsForSave(set: SquareItem[]): SquareItem[] {
  return set.map((square) => ({
    text: square.text,
    ...(square.libraryItemId ? { libraryItemId: square.libraryItemId } : {}),
    ...(square.gameTagId ? { gameTagId: square.gameTagId } : {}),
  }));
}
