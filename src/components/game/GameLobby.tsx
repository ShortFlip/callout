'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Play } from 'lucide-react';
import { RoomCodeDisplay } from '@/components/layout/RoomCodeDisplay';
import { CardPreview } from '@/components/board/CardPreview';
import { CardSplitWords } from '@/components/library/CardSplitWords';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { createClient } from '@/lib/supabase/client';
import { buildGameSetup } from '@/lib/game/game-setup';
import { createRound } from '@/lib/game/create-round';
import { loadCoPlayerRecords } from '@/lib/game/co-players';
import { cardSplit } from '@/lib/library/hosting';
import { formatPattern } from '@/lib/achievements';
import { PILL } from '@/lib/pill';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Room, RoomSettings, GameStartedPayload } from '@/types/game';
import type { PresencePlayer, ConnectionState } from '@/hooks/useRealtimeRoom';
import type { CardTemplate } from '@/types/card';

interface GameLobbyProps {
  room: Room;
  currentPlayerId: string;
  presentPlayers: PresencePlayer[];
  connection: ConnectionState;
  onStartGame: (payload: Required<GameStartedPayload>) => Promise<void>;
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
  const [template, setTemplate] = useState<CardTemplate | null>(null);
  const [crew, setCrew] = useState<Omit<SeatInfo, 'present'>[]>([]);

  // Tonight's card for the preview and the Rules board line. Start re-reads it
  // anyway, so a card edited while everyone waits still plays as edited.
  useEffect(() => {
    if (!room.template_id) return;
    let cancelled = false;
    createClient()
      .from('card_templates')
      .select('*')
      .eq('id', room.template_id)
      .single()
      .then(({ data, error }) => {
        if (error) console.error('Failed to load the lobby card:', error);
        else if (!cancelled) setTemplate(data);
      });
    return () => { cancelled = true; };
  }, [room.template_id]);

  // The usual crew, so the seats show who we are waiting on. Quiet on failure:
  // the seats then show only who is here, which is what the lobby used to do.
  useEffect(() => {
    let cancelled = false;
    loadCoPlayerRecords(currentPlayerId)
      .then((records) => {
        if (cancelled) return;
        const seen = new Map<string, Omit<SeatInfo, 'present'>>();
        for (const r of records) {
          if (!seen.has(r.playerId)) {
            seen.set(r.playerId, { playerId: r.playerId, displayName: r.displayName, avatarUrl: r.avatarUrl });
          }
        }
        setCrew([...seen.values()]);
      })
      .catch((error: unknown) => console.error('Failed to load the crew for the lobby:', error));
    return () => { cancelled = true; };
  }, [currentPlayerId]);

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
      const payload = await createRound(supabase, room.id, 1, setup);

      // Update room status to 'playing'. Clients transition via the game_started
      // broadcast below; a client that missed it (slept tab) also picks the
      // status change up from the postgres_changes fallback in useRealtimeRoom.
      const { error: roomError } = await supabase.from('rooms').update({ status: 'playing' }).eq('id', room.id);
      if (roomError) throw roomError;

      // Broadcast game_started — all clients (including host via self:true) initialize state
      await onStartGame(payload);
    } catch (err) {
      console.error('Failed to start game:', err);
      toast.error('Could not start the game. Try again.');
      setIsStarting(false);
    }
  }

  const seats = buildSeats(presentPlayers, crew, room.host_id);
  const missing = seats.filter((s) => !s.present);
  const settings = room.settings as Partial<RoomSettings> | null;
  const patterns = settings?.winPatterns ?? [];

  // Wide layout (2026-10-05): the code, invite and Start in a left column; who
  // is here, tonight's card and the rules on the right. Fixed to the window
  // height so nothing scrolls at 1280×800.
  return (
    <main className="grid h-screen min-h-[720px] grid-cols-[400px_1fr] gap-5 px-10 pt-14 pb-7">
      <section className="glass flex min-h-0 flex-col items-center gap-5 rounded-2xl p-7 text-center">
        {room.name && <p className="text-[15px] font-medium text-muted-foreground">{room.name}</p>}
        <RoomCodeDisplay code={room.join_code} />
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span className={`w-2 h-2 rounded-full ${connection === 'live' ? 'bg-success animate-pulse motion-reduce:animate-none' : 'bg-muted-foreground'}`} />
          {connection === 'live' ? 'Connected' : 'Connecting…'}
        </div>

        {/* Start sits at the bottom, under a line naming who is still out. */}
        <div className="mt-auto flex w-full flex-col items-center gap-3">
          {isHost ? (
            <Button
              size="lg"
              className="h-12 w-full gap-2 text-base"
              onClick={handleStartGame}
              disabled={isStarting || presentPlayers.length < 2}
            >
              {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isStarting ? 'Starting…' : 'Start Game'}
            </Button>
          ) : (
            // A breathing dot rather than a spinner: nothing is loading, the
            // room is just live and waiting on a person (design rule 61).
            <div className="flex items-center gap-2 text-muted-foreground" role="status">
              <span className="size-2 rounded-full bg-success animate-pulse motion-reduce:animate-none" aria-hidden />
              <span className="text-sm">Waiting for the host to start…</span>
            </div>
          )}
          <p className="text-[13px] text-muted-foreground">
            {isHost && presentPlayers.length < 2
              ? 'Need at least one other player'
              : `${presentPlayers.length} of ${seats.length} here${missing.length > 0 ? ` · waiting on ${nameList(missing)}` : ''}`}
          </p>
        </div>
      </section>

      <div className="grid min-h-0 grid-rows-[1fr_auto] gap-5">
        <section className="glass flex min-h-0 flex-col gap-4 rounded-2xl p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-bold">Players</h2>
            <span className="tabular-nums text-[13px] text-muted-foreground">{presentPlayers.length} here</span>
          </div>
          {/* Fixed-height seats centred in the panel: a row of people on a
              stage, not columns stretched to fill it. */}
          <ul className="flex min-h-0 flex-1 flex-wrap content-center justify-center gap-3 overflow-y-auto">
            {seats.map((seat) => (
              <Seat key={seat.playerId} seat={seat} isHost={seat.playerId === room.host_id} />
            ))}
          </ul>
        </section>

        <div className="grid grid-cols-2 gap-5">
          <section className="glass flex gap-4 rounded-2xl p-5">
            {template ? (
              <>
                <CardPreview card={template} className="size-[148px] shrink-0" />
                <div className="min-w-0 space-y-1">
                  <h2 className="font-display text-lg font-bold">Tonight&apos;s Card</h2>
                  <p className="truncate text-sm font-semibold">{template.name}</p>
                  <p className="text-[13px] text-muted-foreground">
                    <CardSplitWords split={cardSplit(template)} />
                  </p>
                </div>
              </>
            ) : (
              <div aria-hidden className="h-[148px] w-full animate-pulse rounded-md bg-muted/40" />
            )}
          </section>

          <section className="glass space-y-3 rounded-2xl p-5">
            <h2 className="font-display text-lg font-bold">Rules</h2>
            <dl className="grid grid-cols-[88px_1fr] items-center gap-x-3 gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">Mode</dt>
              <dd className="font-semibold">{settings?.gameMode === 'traditional' ? 'Traditional' : 'Honor System'}</dd>
              <dt className="text-muted-foreground">Board</dt>
              <dd className="font-semibold tabular-nums">
                {template
                  ? `${template.board_size}×${template.board_size} · ${template.free_space ? 'Free center' : 'No free space'}`
                  : '—'}
              </dd>
              <dt className="text-muted-foreground">Wins on</dt>
              <dd className="flex flex-wrap gap-1.5">
                {patterns.map((p) => (
                  <span key={p} className={cn(PILL, 'bg-muted text-foreground')}>{formatPattern(p)}</span>
                ))}
              </dd>
            </dl>
          </section>
        </div>
      </div>
    </main>
  );
}

interface SeatInfo {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  present: boolean;
}

/**
 * Host first, then whoever is here in join order, then the rest of the usual
 * crew dimmed. Anyone new who joins gets a seat too, so the grid is "who we
 * play with" plus "who turned up", never a bare presence list.
 */
function buildSeats(present: PresencePlayer[], crew: Omit<SeatInfo, 'present'>[], hostId: string): SeatInfo[] {
  const seats = new Map<string, SeatInfo>();
  const here = [...present].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  for (const p of here) {
    seats.set(p.playerId, { playerId: p.playerId, displayName: p.displayName, avatarUrl: p.avatarUrl, present: true });
  }
  for (const c of crew) {
    if (!seats.has(c.playerId)) seats.set(c.playerId, { ...c, present: false });
  }
  return [...seats.values()].sort((a, b) => Number(b.playerId === hostId) - Number(a.playerId === hostId));
}

function nameList(seats: SeatInfo[]): string {
  const names = seats.map((s) => s.displayName);
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

function Seat({ seat, isHost }: { seat: SeatInfo; isHost: boolean }) {
  return (
    <li
      className={cn(
        'flex h-[196px] w-[136px] flex-col items-center justify-center gap-2.5 rounded-xl border p-3 text-center transition-colors duration-150',
        seat.present ? 'border-border bg-card' : 'border-dashed border-border/70',
      )}
    >
      <PlayerAvatar
        playerId={seat.playerId}
        displayName={seat.displayName}
        avatarUrl={seat.avatarUrl}
        size="lg"
        className={cn('size-20 text-xl', !seat.present && 'opacity-35 grayscale')}
      />
      <p className={cn('max-w-full truncate font-display text-lg font-bold', !seat.present && 'text-muted-foreground')}>
        {seat.displayName}
      </p>
      {isHost && seat.present ? (
        <span className={cn(PILL, 'bg-primary/15 text-primary')}>Host</span>
      ) : (
        <span className="text-[13px] text-muted-foreground">{seat.present ? 'Here' : 'Not here yet'}</span>
      )}
    </li>
  );
}
