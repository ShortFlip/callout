import { fisherYates } from './shuffle';
import type { SquareItem } from '@/types/card';
import type { CardMix, LibraryItem, MixLane } from '@/types/library';

/*
 * Pure maths behind the library's card pane: how many squares each game gets,
 * which items fill them, and swapping one item out. No Supabase, no React, so
 * the rules are unit-tested (src/lib/game/__tests__/card-builder.test.ts) and
 * the UI only renders what these return.
 *
 * Vocabulary:
 * - A lane is one game in the mix, keyed by gameTagId; null is the No Game lane.
 *   A pool item's lane is its own gameTagId.
 * - Lane counts are whole squares, never percent: a board cannot hold half an
 *   item, so the slider snaps to squares and shows percent as a label only.
 */

/** A lane key: a game tag id, or null for the No Game lane. */
export type LaneKey = string | null;

/** allocateMix's answer: the real split once caps are applied. */
export interface MixAllocation {
  /** The input lanes in order (duplicates merged), count = squares allocated. */
  lanes: MixLane[];
  /** Lanes that asked for more squares than they have items. Drives "Only 4 Rocket League items". */
  capped: LaneKey[];
  /** Squares no lane could fill because the lanes ran out of items. */
  shortBy: number;
}

/** buildCardSet's answer. */
export interface CardSet {
  /** Pins first (in pin order), then the drawn items lane by lane. */
  set: SquareItem[];
  /**
   * The split actually used: pins win over the requested counts, caps apply,
   * and a pinned item's lane that was missing from the mix is appended. This is
   * what the slider should snap to ("pinning 8 RL with the slider at 5 moves
   * the slider to 8").
   */
  mix: CardMix;
  /** Lanes that asked for more squares than they have items. */
  capped: LaneKey[];
  /** Squares left empty because the pool is too small; 0 when the card is full. */
  shortBy: number;
}

/**
 * How many real items a card needs: N², minus one when the FREE square takes
 * the centre. generateCard puts FREE at floor(N²/2) on every size, even ones
 * with no true centre, so it always costs exactly one slot.
 */
export function slotsFor(boardSize: number, freeSpace: boolean): number {
  return boardSize * boardSize - (freeSpace ? 1 : 0);
}

/**
 * Two-lane slider: turn the first lane's percent into whole squares.
 * 20% of 24 → [5, 19]; 30% of 24 → [7, 17].
 *
 * Rounds to nearest, and an exact half goes to the first lane. For two lanes
 * that is the same answer largest remainder gives, so the slider label and
 * allocateMix never disagree. (p * slots) / 100 rather than p / 100 * slots so
 * whole-number percents stay exact in floating point.
 */
export function splitFromPercent(percentFirst: number, slots: number): [number, number] {
  const total = Math.max(0, Math.floor(slots));
  const percent = Math.min(100, Math.max(0, Number.isFinite(percentFirst) ? percentFirst : 0));
  const first = Math.min(total, Math.round((percent * total) / 100));
  return [first, total - first];
}

/**
 * Split `total` whole units across `weights` in proportion, by largest
 * remainder: everyone gets the floor of their exact share, and the units left
 * over go to the biggest fractional remainders (ties to the earlier lane, so
 * the result is deterministic). A zero weight never receives anything. Integer
 * arithmetic throughout, so 7.2 vs 16.8 can never be mis-ranked by float error.
 */
function largestRemainder(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);

  const shares = weights.map((w) => Math.floor((w * total) / sum));
  const remainders = weights.map((w) => (w * total) % sum);
  let left = total - shares.reduce((a, b) => a + b, 0);

  const order = weights
    .map((_, i) => i)
    .sort((a, b) => remainders[b] - remainders[a] || a - b);
  for (const i of order) {
    if (left <= 0) break;
    shares[i]++;
    left--;
  }
  return shares;
}

/** A lane count as a usable weight: whole, finite, never negative. */
function toWeight(count: number): number {
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

/**
 * Merge lanes that share a gameTagId (keeping first-seen order and summing
 * their counts). A mix should never repeat a lane, but if one slips through,
 * two lanes drawing from the same items would double-book them.
 */
function mergeLanes(lanes: MixLane[]): { keys: LaneKey[]; weights: number[] } {
  const keys: LaneKey[] = [];
  const weights: number[] = [];
  for (const lane of lanes) {
    const key = lane.gameTagId ?? null;
    const at = keys.indexOf(key);
    if (at === -1) {
      keys.push(key);
      weights.push(toWeight(lane.count));
    } else {
      weights[at] += toWeight(lane.count);
    }
  }
  return { keys, weights };
}

/**
 * Cap each lane at the items it has, then hand the shortfall to lanes that
 * still have items. Returns the final counts and which lanes were cut.
 *
 * The shortfall goes to open lanes in proportion to their weight. Only when
 * every weighted lane is full does it spill into zero-weight lanes (such as a
 * No Game lane left at 0%), shared evenly: a full card beats an exact split,
 * because a short card cannot be saved or hosted (build plan, finding 2).
 */
function fillLanes(
  targets: number[],
  weights: number[],
  available: number[],
  slots: number,
): { counts: number[]; capped: boolean[] } {
  const capped = targets.map((t, i) => t > available[i]);
  const counts = targets.map((t, i) => Math.min(t, available[i]));
  let short = slots - counts.reduce((a, b) => a + b, 0);

  // Each pass either places the whole shortfall or fills at least one more lane
  // to its cap (closing it), so this ends after at most one pass per lane.
  while (short > 0) {
    const open = counts.map((_, i) => i).filter((i) => counts[i] < available[i]);
    if (open.length === 0) break;

    const weighted = open.filter((i) => weights[i] > 0);
    const group = weighted.length > 0 ? weighted : open;
    const extra = largestRemainder(
      group.map((i) => (weighted.length > 0 ? weights[i] : 1)),
      short,
    );
    group.forEach((laneIndex, g) => {
      counts[laneIndex] = Math.min(available[laneIndex], counts[laneIndex] + extra[g]);
    });
    short = slots - counts.reduce((a, b) => a + b, 0);
  }

  return { counts, capped };
}

/** Items per lane in a pool. Handy for the UI's "Only 4 Rocket League items". */
export function countByLane(pool: LibraryItem[]): Map<LaneKey, number> {
  const counts = new Map<LaneKey, number>();
  for (const item of pool) {
    const key = item.gameTagId ?? null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Turn the mix's requested counts into counts that sum to `slots`.
 *
 * The requested counts are treated as proportions (a mix saved for 24 slots
 * still works on a 16-slot card) and rounded by largest remainder. Each lane is
 * then capped at the items it has, and the shortfall moves to lanes that still
 * have items. `available` maps a lane to its item count; a missing lane has 0.
 */
export function allocateMix(
  lanes: MixLane[],
  slots: number,
  available: ReadonlyMap<LaneKey, number>,
): MixAllocation {
  const total = Math.max(0, Math.floor(slots));
  const { keys, weights } = mergeLanes(lanes);
  const caps = keys.map((key) => available.get(key) ?? 0);

  const targets = largestRemainder(weights, total);
  const { counts, capped } = fillLanes(targets, weights, caps, total);

  return {
    lanes: keys.map((gameTagId, i) => ({ gameTagId, count: counts[i] })),
    capped: keys.filter((_, i) => capped[i]),
    shortBy: total - counts.reduce((a, b) => a + b, 0),
  };
}

/** A library item as a card square. gameTagId is omitted, not null, for No Game. */
function toSquare(item: LibraryItem): SquareItem {
  return item.gameTagId
    ? { text: item.text, libraryItemId: item.id, gameTagId: item.gameTagId }
    : { text: item.text, libraryItemId: item.id };
}

/** Plain code-unit string order: locale-free, so every browser sorts the same way. */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Stable order for drawing: by id, so the same seed gives the same set however the DB ordered the rows. */
function byId(a: LibraryItem, b: LibraryItem): number {
  return compareStrings(a.id, b.id);
}

/** Lane order for an empty mix: games by id, No Game last. */
function compareLaneKeys(a: LaneKey, b: LaneKey): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compareStrings(a, b);
}

/**
 * Pin-adjusted targets. A lane whose pins exceed its proportional share is
 * fixed at its pin count, and the slots left over are re-split across the
 * other lanes by largest remainder. Fixing a lane shrinks the others, which can
 * push another lane under its pins, so repeat until nothing changes (at most
 * one pass per lane).
 */
function pinnedTargets(weights: number[], pins: number[], slots: number): number[] {
  const fixed = weights.map(() => false);
  for (;;) {
    const free = weights.map((_, i) => i).filter((i) => !fixed[i]);
    const reserved = pins.reduce((sum, p, i) => (fixed[i] ? sum + p : sum), 0);
    const shares = largestRemainder(
      free.map((i) => weights[i]),
      slots - reserved,
    );

    const targets = pins.slice();
    let changed = false;
    free.forEach((laneIndex, f) => {
      if (shares[f] < pins[laneIndex]) {
        fixed[laneIndex] = true;
        changed = true;
      } else {
        targets[laneIndex] = shares[f];
      }
    });
    if (!changed) return targets;
  }
}

/**
 * Build a card's set of items from the library.
 *
 * 1. Pins go in first and count against their lane. Pins not in the pool are
 *    ignored (there is nothing to put on the square), and pins beyond `slots`
 *    are dropped, since the board cannot hold them.
 * 2. A lane whose pins exceed its count grows to fit them; the other lanes
 *    shrink by largest remainder. A pinned item whose lane is not in the mix
 *    gets a lane of its own, appended with no weight of its own.
 * 3. Lanes are capped at their items and the shortfall moves to lanes that
 *    still have items (see allocateMix).
 * 4. The rest of each lane is drawn with the seeded rng, never repeating an
 *    item. The pool is sorted by id first so the result depends only on the
 *    items and the seed, not on the order the database returned them in.
 *
 * An empty or null mix means "no preference": every lane in the pool joins,
 * weighted by how many items it has, which is an even draw across the whole
 * pool. That is how a legacy card (mix null) loads as a pool.
 */
export function buildCardSet({
  pool,
  slots,
  mix,
  pinnedIds,
  rng,
}: {
  pool: LibraryItem[];
  slots: number;
  /** null (a legacy card's mix column) behaves like an empty mix. */
  mix: CardMix | null;
  pinnedIds: string[];
  rng: () => number;
}): CardSet {
  const total = Math.max(0, Math.floor(slots));

  // One entry per id, sorted, so a duplicated row can never land twice.
  const byItemId = new Map<string, LibraryItem>();
  for (const item of [...pool].sort(byId)) {
    if (!byItemId.has(item.id)) byItemId.set(item.id, item);
  }
  const items = [...byItemId.values()];

  const pinned: LibraryItem[] = [];
  const pinnedSet = new Set<string>();
  for (const id of pinnedIds) {
    const item = byItemId.get(id);
    if (!item || pinnedSet.has(id) || pinned.length >= total) continue;
    pinned.push(item);
    pinnedSet.add(id);
  }

  // Lanes: the mix's, or (empty mix) every lane in the pool weighted by size,
  // No Game last. Then any pinned lane the mix left out.
  let lanes: MixLane[] = mix?.lanes ?? [];
  if (lanes.length === 0) {
    lanes = [...countByLane(items).entries()]
      .sort(([a], [b]) => compareLaneKeys(a, b))
      .map(([gameTagId, count]) => ({ gameTagId, count }));
  }
  const { keys, weights } = mergeLanes(lanes);
  for (const item of pinned) {
    const key = item.gameTagId ?? null;
    if (!keys.includes(key)) {
      keys.push(key);
      weights.push(0);
    }
  }

  const laneItems = keys.map((key) => items.filter((item) => (item.gameTagId ?? null) === key));
  const pins = keys.map((key) => pinned.filter((item) => (item.gameTagId ?? null) === key).length);
  const caps = laneItems.map((list) => list.length);

  const targets = pinnedTargets(weights, pins, total);
  const { counts, capped } = fillLanes(targets, weights, caps, total);

  // Pins can never be cut: a lane's target is at least its pins, and its cap
  // (the lane's items) includes the pins, so counts[i] >= pins[i] always.
  const drawn: SquareItem[] = [];
  laneItems.forEach((list, i) => {
    const candidates = list.filter((item) => !pinnedSet.has(item.id));
    const need = counts[i] - pins[i];
    for (const item of fisherYates(candidates, rng).slice(0, need)) drawn.push(toSquare(item));
  });

  const set = [...pinned.map(toSquare), ...drawn];
  return {
    set,
    mix: { lanes: keys.map((gameTagId, i) => ({ gameTagId, count: counts[i] })) },
    capped: keys.filter((_, i) => capped[i]),
    shortBy: total - set.length,
  };
}

/** Case-insensitive, trimmed text key: how the library decides two items are the same. */
