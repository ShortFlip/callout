// Item Library domain types. Shapes are settled in
// docs/plans/item-library-build.md ("Settled data shapes"); change them there first.

/** 'game' = the one game an item belongs to (tint + icon); 'tag' = an extra filter label. */
export type TagKind = 'game' | 'tag';

/** Keys into GAME_COLORS. The DB stores the key, never raw CSS, so a colour retune never needs a data migration. */
export type GameColorKey = 'sky' | 'cyan' | 'rose' | 'orange' | 'pink';

/** Keys into GAME_ICONS. Lookalike icons only; never real game logos (the repo is public). */
export type GameIconKey =
  | 'flame' | 'crosshair' | 'car' | 'target' | 'swords' | 'gamepad' | 'skull' | 'bomb';

/** A row of `tags`. color and icon are set on game tags only. */
export interface Tag {
  id: string;
  ownerId: string;
  name: string;
  kind: TagKind;
  color: GameColorKey | null;
  icon: GameIconKey | null;
  /** Game tags only: public URL of an uploaded 128px logo. Null draws the icon in the colour. */
  logoUrl: string | null;
}

/** A row of `library_items` with its extra tags joined in. gameTagId null = No Game. */
export interface LibraryItem {
  id: string;
  text: string;
  gameTagId: string | null;
  tagIds: string[];
}

/** One lane of the mix. gameTagId null is the No Game lane. count is squares, not percent. */
export interface MixLane {
  gameTagId: string | null;
  count: number;
}

/** How a card's squares split across games; stored in `card_templates.mix`. */
export interface CardMix {
  lanes: MixLane[];
}

/** What the board needs to draw a game's tint and icon, frozen into the card. */
export interface LegendEntry {
  gameTagId: string;
  name: string;
  color: GameColorKey;
  icon: GameIconKey;
  /** Copied from the game when the card was saved; absent on cards saved before logos. */
  logoUrl?: string;
}
