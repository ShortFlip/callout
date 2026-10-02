import { generateCallList } from './call-list';
import { withStylePreset } from '@/lib/card-styles';
import type { SquareItem, CardStyles } from '@/types/card';
import type { WinPattern, GameMode } from '@/types/game';

/** The shape of a card_templates row that game bootstrap actually reads. */
export interface TemplateLike {
  items: unknown;
  board_size: number;
  free_space: boolean;
  shuffle_mode: string;
  styles: unknown;
}

export interface GameSetup {
  seed: string;
  items: SquareItem[];
  callList: number[];
  boardSize: number;
  freeSpace: boolean;
  shuffleMode: 'full' | 'column';
  winPatterns: WinPattern[];
  gameMode: GameMode;
  cardStyles: CardStyles;
}

/**
 * Single source of truth for turning a card template + room settings into the
 * values every game-start path needs (lobby start, host "new round", and the
 * reconnect rebuild).
 *
 * Why it exists: the empty-item filter, the settings parse and the call-list
 * generation used to be copy-pasted in three places. If the filter drifts in
 * one of them, item indices stop lining up between the card and the call list
 * and players see the wrong squares light up.
 *
 * @param seed - Pass the existing game's seed when rebuilding state for a game
 *   that already exists (reconnect); omit to mint a new one for a new round.
 */
export function buildGameSetup(
  template: TemplateLike,
  roomSettings: unknown,
  seed: string = crypto.randomUUID(),
): GameSetup {
  // Filter out empty pool slots — handles both new templates (empty center slot
  // when free space is on) and legacy templates saved before the April-10 fix.
  // generateCard applies the same content filter, so the card and the call list
  // stay index-aligned.
  const items = (template.items as SquareItem[]).filter(
    (item) => item.text?.trim() || item.imageUrl,
  );

  const settings =
    (roomSettings as { winPatterns?: WinPattern[]; gameMode?: GameMode; stylePreset?: string } | null) ?? {};

  return {
    seed,
    items,
    callList: generateCallList(items.length, seed),
    boardSize: template.board_size,
    freeSpace: template.free_space,
    shuffleMode: template.shuffle_mode as 'full' | 'column',
    winPatterns: settings.winPatterns ?? ['row', 'column', 'diagonal'],
    gameMode: settings.gameMode ?? 'honor',
    // The host's mid-game Style pick (rooms.settings.stylePreset) wins over the
    // card's own colours, so New Round and a rejoin keep it for the night.
    cardStyles: withStylePreset((template.styles as CardStyles) ?? {}, settings.stylePreset),
  };
}
