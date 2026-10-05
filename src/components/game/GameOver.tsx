'use client';

import { Trophy, Home, RotateCcw, History } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { useGameStore, type GameWinner } from '@/stores/gameStore';
import type { Room } from '@/types/game';
import type { PresencePlayer } from '@/hooks/useRealtimeRoom';
import { SECTION_LABEL } from '@/lib/label';

interface GameOverProps {
  room: Room;
  currentPlayerId: string;
  presentPlayers: PresencePlayer[];
  onNewRound?: () => Promise<void>;
  // The last round as read from the database, for a cold load where the store
  // was never filled. The store wins when it has a round (this tab was there).
  finishedRound?: { roundNumber: number; winners: GameWinner[] } | null;
}

export function GameOver({ room, currentPlayerId, presentPlayers, onNewRound, finishedRound }: GameOverProps) {
  const router = useRouter();
  const store = useGameStore();
  const fromStore = store.roundNumber > 0;
  const roundNumber = fromStore ? store.roundNumber : finishedRound?.roundNumber;
  const winners = fromStore ? store.winners : finishedRound?.winners ?? [];
  const isHost = currentPlayerId === room.host_id;
  const winner = winners[0];

  // Find the winner's presence info for their avatar
  const winnerPresence = presentPlayers.find((p) => p.playerId === winner?.playerId);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="space-y-8 max-w-sm w-full">

        {/* Trophy */}
        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-full bg-accent/20 ring-4 ring-accent/30 flex items-center justify-center">
            <Trophy className="w-10 h-10 text-accent" />
          </div>
        </div>

        {/* Winner info */}
        <div className="space-y-3">
          <p className={SECTION_LABEL}>
            {/* No round number until the read lands, rather than "Round 0". */}
            {roundNumber ? `Round ${roundNumber} — Game Over` : 'Game Over'}
          </p>
          {winner ? (
            <div className="space-y-3">
              <h2 className="font-display text-5xl font-black">BINGO!</h2>
              <div className="flex items-center justify-center gap-3">
                {winnerPresence && (
                  <PlayerAvatar
                    playerId={winner.playerId}
                    displayName={winner.displayName}
                    avatarUrl={winnerPresence.avatarUrl}
                    size="md"
                  />
                )}
                <div className="text-left">
                  <p className="font-semibold text-lg">{winner.displayName}</p>
                  <p className="text-sm text-muted-foreground capitalize">{winner.pattern} — first place</p>
                </div>
              </div>
              {winners.length > 1 && (
                <p className="text-sm text-muted-foreground">
                  +{winners.length - 1} other winner{winners.length > 2 ? 's' : ''}
                </p>
              )}
            </div>
          ) : (
            <h2 className="font-display text-4xl font-black">Game Over</h2>
          )}
        </div>

        {/* Actions — all one size so the stack reads as a set. */}
        <div className="flex flex-col gap-3">
          {isHost && onNewRound && (
            <Button size="lg" className="w-full gap-2" onClick={onNewRound}>
              <RotateCcw className="w-4 h-4" />
              Play Again
            </Button>
          )}
          {!isHost && (
            <p className="text-sm text-muted-foreground">Waiting for the host to start a new game…</p>
          )}
          {/* Everyone gets this, not just the host: the night is over, so the
              no-history-on-the-game-screen rule no longer applies. Linking by
              room id (a night is a room) opens exactly this night in /history. */}
          <Link
            href={`/history?night=${room.id}`}
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full gap-2')}
          >
            <History className="w-4 h-4" />
            Tonight&apos;s Results
          </Link>
          <Button variant="outline" size="lg" className="w-full gap-2" onClick={() => router.push('/')}>
            <Home className="w-4 h-4" />
            Back to Home
          </Button>
        </div>

      </div>
    </div>
  );
}
