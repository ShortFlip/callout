import type { Database } from '@/lib/supabase/types';
import type { SquareItem, CardStyles } from '@/types/card';

export type Room = Database['public']['Tables']['rooms']['Row'];

export type Game = Database['public']['Tables']['games']['Row'];

// Win patterns supported by the win-detection engine
export type WinPattern = 'row' | 'column' | 'diagonal' | 'four_corners' | 'blackout' | 'custom';

// How squares get marked during a game:
// - 'honor':       no caller — players mark squares themselves as things happen
//                  (the group's default: play on until ~2 people win)
// - 'traditional': host calls items one at a time; players can only mark called squares
export type GameMode = 'honor' | 'traditional';

// Per-room game settings stored in rooms.settings
export interface RoomSettings {
  winPatterns: WinPattern[];
  gameMode?: GameMode; // absent on legacy rooms → treat as 'honor'
}

// The game_started broadcast. The last three are optional for receivers because
// a payload from an older build may omit them; senders use
// Required<GameStartedPayload> and always fill them.
export interface GameStartedPayload {
  gameId: string;
  seed: string;
  roundNumber: number;
  callList: number[];
  templateItems: SquareItem[];
  boardSize: number;
  freeSpace: boolean;
  shuffleMode: 'full' | 'column';
  winPatterns: WinPattern[];
  gameMode?: GameMode;
  cardStyles?: CardStyles;
  // games.started_at, so every tab times bingos from the same instant. Legacy
  // payloads omit it and fall back to "now".
  startedAt?: string;
}
