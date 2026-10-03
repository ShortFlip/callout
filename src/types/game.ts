import type { Database } from '@/lib/supabase/types';

export type Room = Database['public']['Tables']['rooms']['Row'];
export type RoomInsert = Database['public']['Tables']['rooms']['Insert'];
export type RoomUpdate = Database['public']['Tables']['rooms']['Update'];

export type Game = Database['public']['Tables']['games']['Row'];
export type GameInsert = Database['public']['Tables']['games']['Insert'];
export type GameUpdate = Database['public']['Tables']['games']['Update'];

export type GamePlayer = Database['public']['Tables']['game_players']['Row'];
export type GamePlayerInsert = Database['public']['Tables']['game_players']['Insert'];
export type GamePlayerUpdate = Database['public']['Tables']['game_players']['Update'];

export type GameNight = Database['public']['Tables']['game_nights']['Row'];

// Room status progression
export type RoomStatus = 'waiting' | 'playing' | 'finished';

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

// Realtime broadcast event payloads — keep these in sync with useRealtimeRoom
export type RealtimeEvent =
  | { type: 'item_called'; itemIndex: number; callsMade: number }
  | { type: 'square_marked'; playerId: string; squareIndex: number }
  | { type: 'bingo_claimed'; playerId: string; marks: number[] }
  | { type: 'bingo_confirmed'; playerId: string; pattern: WinPattern }
  // The winner unmarked so no pattern holds: their win is undone everywhere
  | { type: 'bingo_retracted'; gameId: string; playerId: string }
  | { type: 'round_reset'; newSeed: string; roundNumber: number }
  | { type: 'player_joined'; playerId: string; displayName: string }
  | { type: 'player_left'; playerId: string };
