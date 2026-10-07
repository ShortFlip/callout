import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json, TablesUpdate } from '@/lib/supabase/types';
import type { SquareItem } from '@/types/card';

/**
 * This player's own `game_players` row: created when a round starts, then
 * written on every marks save and every win. Each function here is ONE
 * attempt; callers wrap it in `withRetry` so a blip is ridden out on the
 * shared backoff.
 *
 * Why this exists (audit 2026-10-07, High): the row used to be created by a
 * single upsert, and every later write was `.update().match()`, which reports
 * success when it matches 0 rows. One failed create meant every marks save and
 * the win write silently landed nowhere; a refresh then rebuilt the board from
 * nothing and the other tabs dropped the bingo after their catch-up grace.
 */

export interface OwnRowKey {
  gameId: string;
  playerId: string;
}

/**
 * True when an update that asked for `.select()` actually touched a row.
 * PostgREST answers a 0-row update with `[]` and no error, so an empty list
 * is a failure the caller must recover from, not a success.
 */
export function rowsLanded(data: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(data) && data.length > 0;
}

/**
 * Create my row if it does not exist yet. Insert-only (ignoreDuplicates): an
 * existing row's marks and win must survive a rejoin or a replayed
 * game_started, never be reset to [] / false.
 *
 * Refuses an empty card: a row with no card_data would make the rejoin path
 * regenerate a card under the saved marks, which is the board loss this file
 * exists to prevent. In practice the card is set in the same tick as the
 * round, so this only guards a programming slip.
 */
export async function ensureOwnRow(
  supabase: SupabaseClient<Database>,
  { gameId, playerId }: OwnRowKey,
  card: readonly SquareItem[],
): Promise<boolean> {
  if (card.length === 0) return false;
  const { error } = await supabase.from('game_players').upsert(
    {
      game_id: gameId,
      player_id: playerId,
      card_data: card as unknown as Json,
      marks: [],
      won: false,
    },
    { onConflict: 'game_id,player_id', ignoreDuplicates: true },
  );
  if (error) {
    console.error('Failed to create own game_players row:', error);
    return false;
  }
  return true;
}

type UpdateOutcome = 'landed' | 'missing' | 'error';

async function updateOwnRow(
  supabase: SupabaseClient<Database>,
  { gameId, playerId }: OwnRowKey,
  patch: TablesUpdate<'game_players'>,
): Promise<UpdateOutcome> {
  const { data, error } = await supabase
    .from('game_players')
    .update(patch)
    .match({ game_id: gameId, player_id: playerId })
    // Ask for the touched rows back: without it a 0-row update is
    // indistinguishable from a successful one.
    .select('player_id');
  if (error) {
    console.error('Failed to write own game_players row:', error);
    return 'error';
  }
  return rowsLanded(data) ? 'landed' : 'missing';
}

/**
 * Apply `patch` to my row and prove it landed. If no row matched, the row was
 * never created: create it (insert-only, with the card) and apply the patch
 * again. The patch is applied as an update after the create, never folded into
 * the insert, so a row that appeared in between (another path raced us) keeps
 * everything the patch does not name.
 *
 * Resolves false on any error or if the row still cannot be found, so the
 * caller's retry tries again.
 */
export async function writeOwnRow(
  supabase: SupabaseClient<Database>,
  key: OwnRowKey,
  patch: TablesUpdate<'game_players'>,
  card: readonly SquareItem[],
): Promise<boolean> {
  const first = await updateOwnRow(supabase, key, patch);
  if (first !== 'missing') return first === 'landed';
  if (!(await ensureOwnRow(supabase, key, card))) return false;
  return (await updateOwnRow(supabase, key, patch)) === 'landed';
}
