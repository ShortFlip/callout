import type { Database } from '@/lib/supabase/types';
import type { LegendEntry } from '@/types/library';

export type CardTemplate = Database['public']['Tables']['card_templates']['Row'];

// A single item on a bingo card — at least one of text or imageUrl must be set
export interface SquareItem {
  text?: string;
  imageUrl?: string;
  clue?: string;       // optional hint shown to host when calling this item
  // Set by generateCard on the FREE centre square. Never in a template's items,
  // but game_players.card_data stores it, and restore/History read it back.
  isFreeSpace?: boolean;
  originalIndex?: number;  // original position in the template item pool — used for call verification
  libraryItemId?: string;  // the library item this square came from — lets a saved card reload without matching by text
  gameTagId?: string;      // the item's game, frozen into the card so a later library edit cannot re-tint a past night
}

// Per-template visual customization stored in card_templates.styles
export interface CardStyles {
  preset?: string;         // which named preset is active
  cardBg?: string;         // board container background
  squareBg?: string;       // unmarked square background
  squareBgMarked?: string; // marked square background
  squareBgFree?: string;   // free space background
  gridLine?: string;       // square border color
  textColor?: string;      // square text color
  // The games on this card (name, colour, icon). Rides in styles because every
  // path that draws a card (GameView via buildGameSetup, History via its
  // template embed) already reads styles, so no query has to change.
  legend?: LegendEntry[];
}
