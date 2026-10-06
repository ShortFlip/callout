import { createClient } from '@/lib/supabase/client';
import type { LeaderboardRecord } from '@/lib/game/stats';
import { readAllPagesIn } from '@/lib/supabase/paging';

/**
 * The rooms a player has played at least one round in. A room is a night, so
 * this is step one of every "my nights" read: History, the leaderboard and
 * the library heat map. Throws on a failed read.
 */
export async function loadMyRoomIds(
  supabase: ReturnType<typeof createClient>,
  playerId: string,
): Promise<string[]> {
  const { data: mine, error } = await supabase
    .from('game_players')
    .select('games!game_players_game_id_fkey (room_id)')
    .eq('player_id', playerId);
  if (error) throw error;

  return Array.from(new Set(
    (mine ?? [])
      .map((row) => (row.games as { room_id: string } | null)?.room_id)
      .filter((id): id is string => !!id),
  ));
}

/**
 * Every game_players row from every round of every room I have played in,
 * unwrapped. The friend group is everyone who has shared a room with me
 * (Decision B), so this one read feeds the leaderboard and Home's crew,
 * last-night and champ tiles.
 *
 * Throws on a failed read; callers decide how to show it.
 */
export async function loadCoPlayerRecords(myId: string): Promise<LeaderboardRecord[]> {
  const supabase = createClient();

  // Step one: my rooms. Step two: every row from every round of those rooms.
  // `!inner` makes the room filter apply to the parent row rather than merely
  // nulling the embed.
  const roomIds = await loadMyRoomIds(supabase, myId);
  if (roomIds.length === 0) return [];

  // Paged: a plain read stops at 1,000 rows without an error, and a group
  // that plays every week passes that within a year.
  const data = await readAllPagesIn(roomIds, (ids, from, to) =>
    supabase
      .from('game_players')
      .select(`
        player_id, won, bingo_time_ms,
        games!inner ( id, room_id, status, started_at ),
        players!game_players_player_id_fkey (
          display_name, avatar_url
        )
      `)
      .in('games.room_id', ids)
      .order('id', { ascending: true })
      .range(from, to),
  );

  const records: LeaderboardRecord[] = [];
  for (const record of data) {
    const p = record.players as { display_name: string; avatar_url: string | null } | null;
    if (!p) continue;
    const g = record.games as unknown as { id: string; room_id: string; status: string; started_at: string | null } | null;
    records.push({
      playerId: record.player_id,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
      won: record.won,
      bingoTimeMs: record.bingo_time_ms,
      gameStatus: g?.status ?? null,
      gameId: g?.id,
      roomId: g?.room_id,
      startedAt: g?.started_at ?? null,
    });
  }
  return records;
}
