'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Play } from 'lucide-react';
import { RoomCodeDisplay } from '@/components/layout/RoomCodeDisplay';
import { PlayerList } from './PlayerList';
import { createClient } from '@/lib/supabase/client';
import { buildGameSetup } from '@/lib/game/game-setup';
import { Button } from '@/components/ui/button';
import type { Room, WinPattern, GameMode } from '@/types/game';
import type { PresencePlayer, ConnectionState } from '@/hooks/useRealtimeRoom';
import type { CardStyles } from '@/types/card';

interface GameLobbyProps {
  room: Room;
  currentPlayerId: string;
  presentPlayers: PresencePlayer[];
  connection: ConnectionState;
  onStartGame: (payload: {
    gameId: string;
    seed: string;
    roundNumber: number;
    callList: number[];
    templateItems: { text?: string; imageUrl?: string; clue?: string }[];
    boardSize: number;
    freeSpace: boolean;
    shuffleMode: 'full' | 'column';
    winPatterns: WinPattern[];
    gameMode: GameMode;
    cardStyles: CardStyles;
    startedAt: string;
  }) => Promise<void>;
}

export function GameLobby({
  room,
  currentPlayerId,
  presentPlayers,
  connection,
  onStartGame,
}: GameLobbyProps) {
  const [isStarting, setIsStarting] = useState(false);
  const isHost = currentPlayerId === room.host_id;

  async function handleStartGame() {
    if (!room.template_id) {
      toast.error('This room has no card template set.');
      return;
    }
    setIsStarting(true);
    try {
      const supabase = createClient();

      // Fetch the card template to get items, board config
      const { data: template, error: templateError } = await supabase
        .from('card_templates')
        .select('*')
        .eq('id', room.template_id)
        .single();

      if (templateError || !template) throw templateError ?? new Error('Template not found');

      // Shared bootstrap: item filter + settings parse + call list (see game-setup.ts)
      const setup = buildGameSetup(template, room.settings);
      const { seed, items, callList } = setup;

      // Create the game record in the DB
      const { data: game, error: gameError } = await supabase
        .from('games')
        .insert({
          room_id: room.id,
          round_number: 1,
          call_list: callList,
          calls_made: 0,
          seed,
          status: 'active',
        })
        .select()
        .single();

      if (gameError || !game) throw gameError ?? new Error('Failed to create game');

      // Update room status to 'playing'. Clients transition via the game_started
      // broadcast below; a client that missed it (slept tab) also picks the
      // status change up from the postgres_changes fallback in useRealtimeRoom.
      const { error: roomError } = await supabase.from('rooms').update({ status: 'playing' }).eq('id', room.id);
      if (roomError) throw roomError;

      // Broadcast game_started — all clients (including host via self:true) initialize state
      await onStartGame({
        gameId: game.id,
        seed,
        roundNumber: 1,
        callList,
        templateItems: items,
        boardSize: setup.boardSize,
        freeSpace: setup.freeSpace,
        shuffleMode: setup.shuffleMode,
        winPatterns: setup.winPatterns,
        gameMode: setup.gameMode,
        cardStyles: setup.cardStyles,
        // The DB's start time, so bingo times match what a refreshed tab restores.
        startedAt: game.started_at,
      });
    } catch (err) {
      console.error('Failed to start game:', err);
      toast.error('Could not start the game. Try again.');
      setIsStarting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-8">

        {/* Room code */}
        <div className="text-center space-y-1">
          {room.name && (
            <p className="text-[15px] font-medium text-muted-foreground">{room.name}</p>
          )}
          <RoomCodeDisplay code={room.join_code} />
        </div>

        {/* Connection dot */}
        <div className="flex justify-center">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <span className={`w-2 h-2 rounded-full ${connection === 'live' ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`} />
            {connection === 'live' ? 'Connected' : 'Connecting…'}
          </div>
        </div>

        {/* Players */}
        <div className="bg-card/50 rounded-xl border border-border p-5">
          {presentPlayers.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">
              Waiting for players to join…
            </p>
          ) : (
            <PlayerList players={presentPlayers} hostId={room.host_id} />
          )}
        </div>

        {/* Start / waiting */}
        <div className="flex flex-col items-center gap-3">
          {isHost ? (
            <>
              <Button
                size="lg"
                className="w-full max-w-xs gap-2"
                onClick={handleStartGame}
                disabled={isStarting || presentPlayers.length < 2}
              >
                {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {isStarting ? 'Starting…' : 'Start Game'}
              </Button>
              {presentPlayers.length < 2 && (
                <p className="text-[13px] text-muted-foreground">Need at least one other player</p>
              )}
            </>
          ) : (
            // A breathing dot rather than a spinner: nothing is loading, the
            // room is just live and waiting on a person (design rule 61).
            <div className="flex items-center gap-2 text-muted-foreground" role="status">
              <span className="size-2 rounded-full bg-success animate-pulse motion-reduce:animate-none" aria-hidden />
              <span className="text-sm">Waiting for the host to start…</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
