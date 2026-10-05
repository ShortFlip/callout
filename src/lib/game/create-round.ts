import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import type { GameStartedPayload } from '@/types/game';
import type { GameSetup } from './game-setup';

/**
 * Insert a round's games row and build the game_started payload for it.
 * Shared by Start Game (round 1) and New Round (next number from the DB) so
 * the row and the broadcast can never drift apart between the two. Everything
 * around it differs on purpose and stays with each caller: closing out the
 * last round, when the room flips to 'playing', and how failures are shown.
 *
 * Throws on a failed insert.
 */
export async function createRound(
  supabase: SupabaseClient<Database>,
  roomId: string,
  roundNumber: number,
  setup: GameSetup,
): Promise<Required<GameStartedPayload>> {
  const { data: game, error } = await supabase
    .from('games')
    .insert({
      room_id: roomId,
      round_number: roundNumber,
      call_list: setup.callList,
      calls_made: 0,
      seed: setup.seed,
      status: 'active',
    })
    .select()
    .single();
  if (error || !game) throw error ?? new Error('Failed to create game');

  return {
    gameId: game.id,
    seed: setup.seed,
    roundNumber: game.round_number,
    callList: setup.callList,
    templateItems: setup.items,
    boardSize: setup.boardSize,
    freeSpace: setup.freeSpace,
    shuffleMode: setup.shuffleMode,
    winPatterns: setup.winPatterns,
    gameMode: setup.gameMode,
    cardStyles: setup.cardStyles,
    // The DB's start time, so bingo times match what a refreshed tab restores.
    startedAt: game.started_at,
  };
}
