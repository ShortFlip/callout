import { toast } from 'sonner';
import { useGameStore, type OtherPlayer } from '@/stores/gameStore';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import type { WinPattern } from '@/types/game';
import { checkWin, freeIndexOf } from './win-detection';
import { staleWinnerIds } from './retract';
import { CATCH_UP_WINNER_GRACE_MS, readMayOverwrite, type CatchUpGuard } from '@/lib/realtime/catch-up';

/**
 * Read every player's row for a round out of the database and push it into
 * the store: other players' boards into `others`, and every winner (ourselves
 * included) into `winners`.
 *
 * Other players' marks arrive live over `mark_updated` broadcasts, but a
 * broadcast is fire-and-forget: a client that joined late, refreshed, or lost
 * the socket never saw the earlier ones. DESIGN.md treats "their miniature
 * shows 0/25 after a refresh" as an unacceptable failure, so the DB — which
 * every client writes its own marks to on a 500 ms debounce — is the recovery
 * source. The same goes for `bingo_confirmed`: a missed bingo announcement is
 * not tolerated either, so the won rows are replayed as winners here — and a
 * winner the DB no longer has as won (a missed `bingo_retracted`) is dropped.
 * Called on mount, after the local upsert that follows `game_started`, every
 * time the channel regains SUBSCRIBED, and as useRealtimeRoom's catch-up read
 * (every few seconds in a live round, and when the tab wakes up).
 *
 * `includeMyCard` also replaces my own card with my row's card_data. Only the
 * mid-round game swap rewrites a card after the round starts, so only its
 * broadcast and the reconnect replay (which may have missed that broadcast)
 * ask for it; every other caller already built my card from the same row.
 * Marks are untouched: they are grid indexes and the swap keeps positions.
 *
 * `catchUp` marks the periodic catch-up read in useRealtimeRoom. It runs every
 * few seconds, so it lands right beside live broadcasts far more often than the
 * other callers do, and must never rewind them: a player whose `mark_updated`
 * arrived after (or just before) the read started keeps their live marks, a
 * winner heard live gets the full win-write retry span before a read may drop
 * them, and a heard retraction is not undone by a row whose `won = false`
 * write is still landing. Without it every field is taken from the DB.
 *
 * Returns false when the read failed, so a caller that must not act on a
 * partial picture (the rejoin path, before it restores marks) can retry.
 */
export async function loadGamePlayers(
  supabase: SupabaseClient<Database>,
  gameId: string,
  selfPlayerId: string,
  {
    quiet = false,
    includeMyCard = false,
    catchUp,
  }: { quiet?: boolean; includeMyCard?: boolean; catchUp?: CatchUpGuard } = {},
): Promise<boolean> {
  // The FK hint disambiguates the join: game_players references players twice
  // is not the case today, but naming the constraint keeps this stable if it
  // ever gains a second player reference. `games(win_pattern)` rides along so
  // replayed winners get the round's pattern without a second query.
  const { data, error } = await supabase
    .from('game_players')
    .select('player_id, card_data, marks, won, finish_position, players!game_players_player_id_fkey(display_name, avatar_url), games!game_players_game_id_fkey(win_pattern)')
    .eq('game_id', gameId);

  if (error) {
    console.error('Failed to load other players:', error);
    // Generic copy — never surface raw DB error text. The store is left as it
    // was so a transient failure doesn't wipe boards we already have. A caller
    // that retries passes `quiet` and does its own single warning.
    if (!quiet) toast.error("Couldn't load other boards");
    return false;
  }

  const store = useGameStore.getState();
  // A slow read can land after the host has already started the next round;
  // its boards and winners belong to the old round and must not leak in.
  if (store.gameId !== gameId) return true;

  const rows = data ?? [];

  // Winners first, in finishing order, so the rail's gold cards and the banner
  // agree with the DB even for a tab that missed every bingo_confirmed.
  // addWinner is idempotent, so a winner we already heard about is a no-op.
  const wonRows = rows
    .filter((row) => row.won)
    .sort((a, b) => (a.finish_position ?? Infinity) - (b.finish_position ?? Infinity));

  // A win can be taken back (bingo_retracted), and a tab that missed that
  // broadcast still holds the winner. Drop any winner the DB no longer has as
  // won — except one heard moments ago whose own write may not have landed,
  // and my own win while my marks still make it (see staleWinnerIds).
  const dbWonIds = new Set(wonRows.map((row) => row.player_id));
  const selfStillWins = checkWin(
    new Set(store.myMarks),
    store.boardSize,
    store.winPatterns,
    store.freeSpace ? freeIndexOf(store.myCard) : null,
  ) !== null;
  for (const playerId of staleWinnerIds({
    winners: store.winners,
    dbWonIds,
    selfPlayerId,
    selfStillWins,
    now: Date.now(),
    // The catch-up read fires every few seconds, so it would otherwise meet a
    // win whose write is still retrying and drop it (then re-add it, replaying
    // the fanfare). The other callers keep the original short grace.
    graceMs: catchUp ? CATCH_UP_WINNER_GRACE_MS : undefined,
  })) {
    store.removeWinner(playerId);
    // My win gone from the DB (another tab of mine retracted it): a later real
    // win here must be free to auto-claim again.
    if (playerId === selfPlayerId) store.setHasClaimed(false);
  }
  // A retraction this tab heard live, whose `won = false` write has not landed
  // yet: the row still says won, and re-adding it would replay the fanfare.
  const retractionPending = (playerId: string) =>
    catchUp !== undefined
    && !readMayOverwrite(catchUp.startedAt, catchUp.retractHeardAt.get(playerId), CATCH_UP_WINNER_GRACE_MS);
  for (const row of wonRows) {
    if (retractionPending(row.player_id)) continue;
    // My own row still says won but my marks no longer make a pattern: I took
    // the win back and that write is still landing (my retraction's echo may
    // not have reached this tab). My board is the truth for my win.
    if (catchUp && row.player_id === selfPlayerId && !selfStillWins) continue;
    const profile = row.players as { display_name: string } | null;
    const game = row.games as { win_pattern: string | null } | null;
    store.addWinner({
      playerId: row.player_id,
      displayName: profile?.display_name ?? 'Player',
      // Only the first winner's pattern is stored on the game — close enough
      // for the banner label after a replay.
      pattern: (game?.win_pattern as WinPattern | null) ?? 'row',
      finishPosition: row.finish_position ?? undefined,
    });
    // Our own win in the DB means the auto-claim must not fire again and
    // rewrite finish_position when our marks are restored.
    if (row.player_id === selfPlayerId) store.setHasClaimed(true);
  }

  const others: OtherPlayer[] = rows
    .filter((row) => row.player_id !== selfPlayerId)
    .map((row) => {
      const profile = row.players as { display_name: string; avatar_url: string | null } | null;
      const existing = store.others[row.player_id];
      // A live mark_updated newer than this read: its marks win over the DB's
      // (which lag it by the sender's write debounce). Never rewind a board.
      const keepLiveMarks = catchUp !== undefined
        && existing !== undefined
        && !readMayOverwrite(catchUp.startedAt, catchUp.markHeardAt.get(row.player_id));
      const keepLiveWin = existing !== undefined && retractionPending(row.player_id);
      return {
        playerId: row.player_id,
        displayName: profile?.display_name ?? 'Player',
        avatarUrl: profile?.avatar_url ?? null,
        card: (row.card_data ?? []) as OtherPlayer['card'],
        marks: keepLiveMarks ? existing.marks : (row.marks ?? []) as number[],
        won: keepLiveWin ? existing.won : row.won,
        finishPosition: keepLiveWin ? existing.finishPosition : row.finish_position,
        synced: true,
      };
    });

  store.setOthers(others);

  if (includeMyCard) {
    const own = rows.find((row) => row.player_id === selfPlayerId);
    const ownCard = own?.card_data as OtherPlayer['card'] | null | undefined;
    // An empty or missing row is "not written yet", never "my card is blank".
    if (Array.isArray(ownCard) && ownCard.length > 0) store.setMyCard(ownCard);
  }
  return true;
}
