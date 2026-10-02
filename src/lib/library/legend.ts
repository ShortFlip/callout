import type { LucideIcon } from 'lucide-react';
import { GAME_COLORS, GAME_ICONS, isGameColorKey, isGameIconKey } from '@/lib/game-colors';
import type { SquareItem } from '@/types/card';
import type { LegendEntry } from '@/types/library';

/**
 * A game as the board draws it: the colour already resolved to CSS and the
 * icon to its component, so a square never touches the key tables itself.
 */
export interface BoardGame {
  gameTagId: string;
  name: string;
  /** A CSS colour from GAME_COLORS, never the stored key. */
  color: string;
  icon: LucideIcon;
  /** An uploaded logo, drawn instead of the icon. Null on cards saved before logos. */
  logoUrl: string | null;
}

/** Only an https URL is drawn: the legend is unchecked JSON, and anything else falls back to the icon. */
function safeLogo(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('https://') ? value : null;
}

/**
 * The legend arrives from `card_templates.styles`, a JSON column: the type says
 * LegendEntry[], but nothing enforces it. Anything malformed — a missing name,
 * a colour or icon key this build does not know — resolves to null, so an odd
 * row draws a plain square rather than throwing mid-game.
 */
function resolveEntry(entry: unknown): BoardGame | null {
  if (!entry || typeof entry !== 'object') return null;
  const { gameTagId, name, color, icon, logoUrl } = entry as Partial<Record<keyof LegendEntry, unknown>>;
  if (typeof gameTagId !== 'string' || typeof name !== 'string') return null;
  if (!isGameColorKey(color) || !isGameIconKey(icon)) return null;
  return { gameTagId, name, color: GAME_COLORS[color], icon: GAME_ICONS[icon], logoUrl: safeLogo(logoUrl) };
}

/**
 * The game one square belongs to, or null when it should draw plain: the
 * free space, a square with no game, a card with no legend (every legacy
 * card), or a game id the legend does not list.
 */
export function squareGame(
  legend: readonly LegendEntry[] | null | undefined,
  gameTagId: string | null | undefined,
  isFreeSpace = false,
): BoardGame | null {
  if (isFreeSpace || !gameTagId || !Array.isArray(legend)) return null;
  const entry = legend.find(
    (candidate: unknown) =>
      !!candidate && typeof candidate === 'object' && (candidate as LegendEntry).gameTagId === gameTagId,
  );
  return resolveEntry(entry);
}

/**
 * The legend row for one card: only the games that actually have a square on
 * it, in legend order. A saved card's legend lists every game in its set, but
 * a legacy pool card draws a subset per player, so a game can be in the legend
 * and missing from this board — naming it would promise a colour that is not there.
 */
export function cardLegend(
  legend: readonly LegendEntry[] | null | undefined,
  items: readonly SquareItem[],
): BoardGame[] {
  if (!Array.isArray(legend)) return [];
  const present = new Set(
    items.filter((item) => !item.isFreeSpace && item.gameTagId).map((item) => item.gameTagId),
  );
  const games: BoardGame[] = [];
  for (const entry of legend as readonly unknown[]) {
    const game = resolveEntry(entry);
    if (!game || !present.has(game.gameTagId)) continue;
    if (games.some((seen) => seen.gameTagId === game.gameTagId)) continue;
    games.push(game);
  }
  return games;
}
