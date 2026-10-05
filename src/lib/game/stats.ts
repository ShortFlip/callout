/**
 * Shared rules for turning game_players rows into stats, so the leaderboard
 * and the profile stats card can never disagree about what counts.
 */

/**
 * Only a round somebody actually won is a played round.
 *
 * `cancelled` is a round the host closed with no winner, and `active` is one
 * nobody closed at all (the host shut the tab instead of ending the night).
 * Counting either as "played" drags every win rate down for rounds that never
 * finished, so both are excluded.
 */
export function isScoredRound(status: string | null | undefined): boolean {
  return status === 'won';
}

/** One game_players row as the leaderboard query returns it, already unwrapped. */
export interface LeaderboardRecord {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  won: boolean;
  bingoTimeMs: number | null;
  gameStatus: string | null;
  // Which round and night the row belongs to. Optional because the profile
  // stats card does not read them; Home's last-night tile does.
  gameId?: string;
  roomId?: string;
  startedAt?: string | null;
}

export interface LastNight {
  roomId: string;
  /** When the night's latest round started (ISO). */
  startedAt: string;
  /** Rounds somebody won that night. */
  rounds: number;
  /** Most wins that night; ties go to whoever reached it in the leaderboard order. */
  winner: LeaderboardRow | null;
}

/**
 * The most recent night (a night is a room) with at least one won round, and
 * who won the most rounds in it. Cancelled and unfinished rounds don't count,
 * the same rule as the leaderboard, so the two can never disagree.
 */
export function lastNight(records: LeaderboardRecord[]): LastNight | null {
  const scored = records.filter((r) => isScoredRound(r.gameStatus) && r.roomId && r.startedAt);
  if (scored.length === 0) return null;
  const latest = scored.reduce((a, b) => (b.startedAt! > a.startedAt! ? b : a));
  const night = scored.filter((r) => r.roomId === latest.roomId);
  const winner = buildLeaderboard(night)[0] ?? null;
  return {
    roomId: latest.roomId!,
    startedAt: latest.startedAt!,
    rounds: new Set(night.map((r) => r.gameId)).size,
    winner: winner && winner.wins > 0 ? winner : null,
  };
}

export interface LeaderboardRow {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  wins: number;
  games: number;
  winRate: number;
  bestTimeMs: number | null;
}

/**
 * Aggregate per player, then rank: most wins, then best win rate, then the
 * fastest best time.
 */
export function buildLeaderboard(records: LeaderboardRecord[]): LeaderboardRow[] {
  const map = new Map<string, LeaderboardRow>();

  for (const record of records) {
    if (!isScoredRound(record.gameStatus)) continue;

    let row = map.get(record.playerId);
    if (!row) {
      row = {
        playerId: record.playerId,
        displayName: record.displayName,
        avatarUrl: record.avatarUrl,
        wins: 0,
        games: 0,
        winRate: 0,
        bestTimeMs: null,
      };
      map.set(record.playerId, row);
    }

    row.games++;
    if (record.won) {
      row.wins++;
      if (record.bingoTimeMs !== null) {
        row.bestTimeMs = row.bestTimeMs === null
          ? record.bingoTimeMs
          : Math.min(row.bestTimeMs, record.bingoTimeMs);
      }
    }
  }

  return [...map.values()]
    .map((r) => ({ ...r, winRate: r.games > 0 ? Math.round((r.wins / r.games) * 100) : 0 }))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (a.bestTimeMs !== null && b.bestTimeMs !== null) return a.bestTimeMs - b.bestTimeMs;
      return 0;
    });
}
