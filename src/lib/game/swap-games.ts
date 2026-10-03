import { fisherYates } from './shuffle';
import type { SquareItem } from '@/types/card';

/**
 * Mid-round game swap: the night moved on from one game (Rocket League) to
 * another (Modern Warfare), and the squares still tied to the old game can
 * never be hit. These helpers replace them in place. Pure: no store, no
 * Supabase, so every rule here is covered by Vitest.
 */

/** Two ways the library decides "same item": its id, or trimmed case-insensitive text. */
function itemKeys(item: SquareItem): string[] {
  const keys: string[] = [];
  if (item.libraryItemId) keys.push(`id:${item.libraryItemId}`);
  const text = (item.text ?? '').trim().toLowerCase();
  if (text) keys.push(`text:${text}`);
  return keys;
}

/**
 * Every game with at least one real square across the round's cards, in the
 * order first seen. The FREE square and squares with no game are ignored, so
 * a legacy card with no games yields [] and the swap control never shows.
 */
export function gamesOnCards(cards: readonly (readonly SquareItem[])[]): string[] {
  const seen: string[] = [];
  for (const card of cards) {
    for (const item of card) {
      if (item.isFreeSpace || !item.gameTagId) continue;
      if (!seen.includes(item.gameTagId)) seen.push(item.gameTagId);
    }
  }
  return seen;
}

/**
 * The one identity a swap mapping is keyed by: the library item id when the
 * square came from the library (every saved card's squares do), else its
 * trimmed lower-case text (legacy template items have no id). Matches the
 * first key itemKeys gives, so "same item" means the same thing everywhere.
 */
export function swapItemKey(item: SquareItem): string {
  return item.libraryItemId
    ? `id:${item.libraryItemId}`
    : `text:${(item.text ?? '').trim().toLowerCase()}`;
}

/** Dropped item key → the target-game item the host chose for it. */
export type SwapReplacements = Readonly<Record<string, SquareItem>>;

/** Does this pool item belong to the target game and have something to show? */
function isCandidate(item: SquareItem, targetGameTagId: string): boolean {
  return !item.isFreeSpace && item.gameTagId === targetGameTagId && !!(item.text?.trim() || item.imageUrl);
}

export interface SwapPlanInput {
  /** Every card in the round with the marks its player has made. */
  cards: readonly { card: readonly SquareItem[]; marks: readonly number[] }[];
  pool: readonly SquareItem[];
  dropGameTagId: string;
  targetGameTagId: string;
  /** Drives the "Pick For Me" suggestion, so it is the same draw every time the dialog opens. */
  rng: () => number;
}

export interface SwapPlan {
  /** Dropped-game items still unmarked on at least one card, once each, first-seen order. */
  dropped: SquareItem[];
  /** Target-game items on no card yet, once each, in pool order. */
  candidates: SquareItem[];
  /** A seeded random pick of min(dropped, candidates) candidates. */
  suggested: SquareItem[];
}

/**
 * What the host's swap picker shows. A card built in the library is one shared
 * set, so every card holds the same dropped items; a legacy pool card draws a
 * subset per player, so `dropped` is the union across cards. Candidates leave
 * out anything on ANY card, so a chosen item can go onto every card without
 * ever repeating a square.
 */
export function planSwap({ cards, pool, dropGameTagId, targetGameTagId, rng }: SwapPlanInput): SwapPlan {
  const dropped: SquareItem[] = [];
  const droppedKeys = new Set<string>();
  const onCards = new Set<string>();

  for (const { card, marks } of cards) {
    const marked = new Set(marks);
    card.forEach((item, index) => {
      for (const key of itemKeys(item)) onCards.add(key);
      if (item.isFreeSpace || item.gameTagId !== dropGameTagId || marked.has(index)) return;
      const key = swapItemKey(item);
      if (droppedKeys.has(key)) return;
      droppedKeys.add(key);
      dropped.push({ ...item });
    });
  }

  const candidates: SquareItem[] = [];
  const seen = new Set(onCards);
  for (const item of pool) {
    if (!isCandidate(item, targetGameTagId)) continue;
    const keys = itemKeys(item);
    // The template pool and the library overlap; the first copy (the pool's,
    // which carries originalIndex) wins.
    if (keys.some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    candidates.push({ ...item });
  }

  const suggested = fisherYates(candidates, rng).slice(0, Math.min(dropped.length, candidates.length));
  return { dropped, candidates, suggested };
}

/**
 * Pair the host's picks with the dropped items in order: the first pick
 * replaces the first dropped item, and so on. Extra picks are ignored; a short
 * list leaves the rest to the seeded fallback.
 */
export function pairReplacements(dropped: readonly SquareItem[], picks: readonly SquareItem[]): Record<string, SquareItem> {
  const replacements: Record<string, SquareItem> = {};
  dropped.forEach((item, index) => {
    if (picks[index]) replacements[swapItemKey(item)] = { ...picks[index] };
  });
  return replacements;
}

export interface SwapInput {
  card: readonly SquareItem[];
  /** Grid indexes this player has marked. Marks are positions, so an in-place swap keeps them valid. */
  marks: readonly number[];
  /** Everything the swap may draw from. Items of other games are ignored here. */
  pool: readonly SquareItem[];
  dropGameTagId: string;
  targetGameTagId: string;
  rng: () => number;
  /**
   * The host's picks, keyed by swapItemKey of the dropped item. Applied first
   * and identically on every card; anything it does not cover falls back to
   * the seeded draw.
   */
  replacements?: SwapReplacements;
}

export interface SwapResult {
  card: SquareItem[];
  /** Squares that now hold a target-game item. */
  swapped: number;
  /** Dropped-game squares left as they were because the target game ran out. */
  skipped: number;
}

/**
 * Replace every unmarked square of `dropGameTagId` with a target-game item
 * that is not already on this card.
 *
 * Why unmarked only: a marked square already counts toward a line; changing
 * its text under the player would rewrite history. Why in place: marks and
 * win detection are index-based, so keeping every other square's position
 * keeps the player's progress exactly as it was.
 */
export function swapGameSquares({
  card,
  marks,
  pool,
  dropGameTagId,
  targetGameTagId,
  rng,
  replacements = {},
}: SwapInput): SwapResult {
  const marked = new Set(marks);
  const next = card.map((item) => ({ ...item }));
  const swappable = (index: number) =>
    !next[index].isFreeSpace && !marked.has(index) && next[index].gameTagId === dropGameTagId;

  // Keys of what is already on the card, so a swapped-in item never repeats one.
  const taken = new Set(card.flatMap(itemKeys));

  let swapped = 0;
  let skipped = 0;
  const done = new Set<number>();

  // Pass 1: the host's mapping, X becomes Y on every card. Indexes are what
  // the fallback must skip, so they are tracked rather than re-detected.
  for (let index = 0; index < next.length; index++) {
    if (!swappable(index)) continue;
    const pick = replacements[swapItemKey(next[index])];
    if (!pick || !isCandidate(pick, targetGameTagId)) continue;
    const keys = itemKeys(pick);
    if (keys.some((key) => taken.has(key))) continue;
    for (const key of keys) taken.add(key);
    next[index] = { ...pick };
    done.add(index);
    swapped++;
  }

  // Every chosen item is reserved even on a card where its dropped item is
  // missing or marked: the fallback must not hand a host's pick to a
  // different square, or one item would replace two different originals.
  for (const pick of Object.values(replacements)) for (const key of itemKeys(pick)) taken.add(key);

  // Candidate order is the random part; the pool's own order must not decide
  // which Modern Warfare items everyone gets.
  const candidates = fisherYates(
    pool.filter((item) => isCandidate(item, targetGameTagId)),
    rng,
  );
  let cursor = 0;

  // Pass 2: whatever the mapping did not cover gets today's seeded draw.
  for (let index = 0; index < next.length; index++) {
    if (done.has(index) || !swappable(index)) continue;

    // Next candidate not already on the card (including ones just swapped in,
    // and duplicates between the template pool and the library).
    let pick: SquareItem | undefined;
    while (cursor < candidates.length) {
      const candidate = candidates[cursor++];
      const keys = itemKeys(candidate);
      if (keys.some((key) => taken.has(key))) continue;
      pick = candidate;
      break;
    }

    if (!pick) {
      skipped++;
      continue;
    }
    for (const key of itemKeys(pick)) taken.add(key);
    next[index] = { ...pick };
    swapped++;
  }

  return { card: next, swapped, skipped };
}
