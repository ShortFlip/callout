import type { Database } from '@/lib/supabase/types';

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
  autoCall: boolean;
  callInterval: number; // seconds between auto-calls
}
