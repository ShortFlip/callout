'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { usePlayer } from '@/hooks/usePlayer';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { formatTime } from '@/lib/achievements';
import { cn } from '@/lib/utils';
import { buildLeaderboard, type LeaderboardRow } from '@/lib/game/stats';
import { loadCoPlayerRecords } from '@/lib/game/co-players';
import { SkeletonRows } from '@/components/ui/skeleton-rows';
import { LoadError } from '@/components/layout/LoadError';
import { retryRead } from '@/lib/utils/retry';

export default function LeaderboardPage() {
  const { player } = usePlayer();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // A failed read is its own state, never "No One on the Board Yet".
  const [loadFailed, setLoadFailed] = useState(false);

  // Also what Try Again re-runs, so it lives outside the effect.
  const load = useCallback(async (myId: string) => {
    try {
      // Only won rounds count (isScoredRound inside buildLeaderboard), so
      // this board and the profile stats card can never disagree.
      setRows(buildLeaderboard(await retryRead(() => loadCoPlayerRecords(myId))));
      setLoadFailed(false);
    } catch (error) {
      console.error(error);
      setLoadFailed(true);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!player) return;
    // load() only sets state after its read resolves, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(player.id);
  }, [player?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div className="space-y-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Home
          </Link>
          <h1 className="font-display text-3xl font-black">Leaderboard</h1>
          <p className="text-muted-foreground text-sm">
            Everyone who has played a night with you. Unfinished and canceled rounds don&apos;t count.
          </p>
        </div>

        {isLoading ? (
          <SkeletonRows count={5} label="Loading the leaderboard" rowClassName="h-[52px]" />
        ) : loadFailed ? (
          <LoadError title="Couldn't Load The Leaderboard" onRetry={() => load(player!.id)} />
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="font-display font-bold">No One on the Board Yet</p>
          </div>
        ) : (
          <>
            {/* Column headers. At 13px, GAMES needs ~52px, so its column is
                3.5rem (it was 3rem, sized for 11px); the rows share the template. */}
            <div className="grid grid-cols-[2rem_1fr_3rem_3.5rem_4rem_5rem] gap-3 items-center px-4 text-[13px] font-semibold text-muted-foreground">
              <span>#</span>
              <span>Player</span>
              <span className="text-right">Wins</span>
              <span className="text-right">Games</span>
              <span className="text-right">Win %</span>
              <span className="text-right">Best Time</span>
            </div>

            <ul className="space-y-2">
              {rows.map((row, i) => {
                const rank = i + 1;
                const isMe = row.playerId === player?.id;
                const medal =
                  rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;

                return (
                  <li
                    key={row.playerId}
                    className={cn(
                      'grid grid-cols-[2rem_1fr_3rem_3.5rem_4rem_5rem] gap-3 items-center',
                      'rounded-xl border px-4 py-3 transition-colors',
                      isMe
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border bg-card',
                    )}
                  >
                    {/* Rank */}
                    <span className="text-sm tabular-nums font-bold text-muted-foreground">
                      {medal ?? `${rank}`}
                    </span>

                    {/* Player */}
                    <div className="flex items-center gap-2 min-w-0">
                      <PlayerAvatar
                        playerId={row.playerId}
                        displayName={row.displayName}
                        avatarUrl={row.avatarUrl}
                        size="xs"
                      />
                      <span className="text-sm font-medium truncate">
                        {row.displayName}
                        {isMe && (
                          <span className="text-muted-foreground text-[13px] font-normal ml-1">(you)</span>
                        )}
                      </span>
                    </div>

                    {/* Wins */}
                    <span className="text-right font-display font-bold text-primary">
                      {row.wins}
                    </span>

                    {/* Games */}
                    <span className="text-right text-sm text-muted-foreground">
                      {row.games}
                    </span>

                    {/* Win % */}
                    <span className="text-right text-sm text-muted-foreground">
                      {row.winRate}%
                    </span>

                    {/* Best time */}
                    <span className="text-right text-sm tabular-nums text-muted-foreground">
                      {formatTime(row.bestTimeMs)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
