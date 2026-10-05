'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { usePlayer } from '@/hooks/usePlayer';
import { BingoBoard } from '@/components/board/BingoBoard';
import { BoardLegend } from '@/components/board/BoardLegend';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { formatPattern } from '@/lib/achievements';
import { cardLegend } from '@/lib/library/legend';
import { cn } from '@/lib/utils';
import { PILL } from '@/lib/pill';
import type { SquareItem, CardStyles } from '@/types/card';
import { SECTION_LABEL } from '@/lib/label';

/** One player's card in one round. */
interface RoundPlayer {
  rowId: string;
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  marks: number;
  total: number;
  won: boolean;
  finishPosition: number | null;
  /** Only kept for my own row — the snapshot below the round. */
  card: SquareItem[] | null;
  markIndices: number[];
}

interface Round {
  gameId: string;
  roundNumber: number;
  status: string;
  winPattern: string | null;
  startedAt: string;
  players: RoundPlayer[];
}

/** A night is a room: every round played in it, in order. */
interface Night {
  roomId: string;
  title: string;
  templateName: string | null;
  boardSize: number;
  styles: CardStyles;
  date: string;
  rounds: Round[];
  /** Everyone who played any round of this night. */
  roster: { playerId: string; displayName: string; avatarUrl: string | null }[];
  winners: string[];
}

// The shape PostgREST hands back for the embedded game -> room -> template chain.
interface GameEmbed {
  id: string;
  round_number: number;
  status: string;
  win_pattern: string | null;
  started_at: string;
  room_id: string;
  rooms: {
    name: string | null;
    join_code: string;
    card_templates: {
      name: string;
      board_size: number;
      styles: unknown;
      free_space: boolean;
    } | null;
  } | null;
}

// Separated into its own component because useSearchParams() requires a Suspense boundary
function HistoryPageContent() {
  const { player, isLoading: playerLoading } = usePlayer();
  const searchParams = useSearchParams();
  // `?night=<room id>` comes from Game Over's Tonight's Results: open that night
  // straight away instead of making the player hunt for it.
  const linkedNightId = searchParams.get('night');
  const [nights, setNights] = useState<Night[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(linkedNightId);

  useEffect(() => {
    if (!player) return;
    const myId = player.id;

    async function load() {
      const supabase = createClient();

      // 1. Which rooms have I played in? A room is a night.
      const { data: mine, error: mineError } = await supabase
        .from('game_players')
        .select('games!game_players_game_id_fkey (room_id)')
        .eq('player_id', myId);

      if (mineError) { console.error(mineError); setIsLoading(false); return; }

      const roomIds = Array.from(new Set(
        (mine ?? [])
          .map((row) => (row.games as { room_id: string } | null)?.room_id)
          .filter((id): id is string => !!id),
      ));

      if (roomIds.length === 0) { setNights([]); setIsLoading(false); return; }

      // 2. Every row from every round of those rooms — mine and everyone
      //    else's — in one go. `!inner` is what makes the room filter apply to
      //    the parent row instead of merely nulling the embed.
      const { data: rows, error } = await supabase
        .from('game_players')
        .select(`
          id, player_id, marks, card_data, won, finish_position,
          games!inner (
            id, round_number, status, win_pattern, started_at, room_id,
            rooms!games_room_id_fkey (
              name, join_code,
              card_templates!rooms_template_id_fkey (
                name, board_size, styles, free_space
              )
            )
          ),
          players!game_players_player_id_fkey ( id, display_name, avatar_url )
        `)
        .in('games.room_id', roomIds);

      if (error) { console.error(error); setIsLoading(false); return; }

      const byRoom = new Map<string, Night>();
      const roundsByGame = new Map<string, Round>();

      (rows ?? []).forEach((row) => {
        const game = row.games as unknown as GameEmbed | null;
        const p = row.players as unknown as
          { id: string; display_name: string; avatar_url: string | null } | null;
        if (!game || !p) return;

        const template = game.rooms?.card_templates ?? null;
        const card = (row.card_data as SquareItem[]) ?? [];
        const markIndices = (row.marks as number[]) ?? [];

        let night = byRoom.get(game.room_id);
        if (!night) {
          night = {
            roomId: game.room_id,
            title: game.rooms?.name || game.rooms?.join_code || 'Game night',
            templateName: template?.name ?? null,
            boardSize: template?.board_size ?? 5,
            styles: (template?.styles as CardStyles) ?? ({} as CardStyles),
            date: game.started_at,
            rounds: [],
            roster: [],
            winners: [],
          };
          byRoom.set(game.room_id, night);
        }

        // A night is dated by its first round, not by whichever row arrived first.
        if (game.started_at && game.started_at < night.date) night.date = game.started_at;

        if (!night.roster.some((r) => r.playerId === p.id)) {
          night.roster.push({ playerId: p.id, displayName: p.display_name, avatarUrl: p.avatar_url });
        }
        if (row.won && !night.winners.includes(p.display_name)) {
          night.winners.push(p.display_name);
        }

        let round = roundsByGame.get(game.id);
        if (!round) {
          round = {
            gameId: game.id,
            roundNumber: game.round_number,
            status: game.status,
            winPattern: game.win_pattern,
            startedAt: game.started_at,
            players: [],
          };
          roundsByGame.set(game.id, round);
          night.rounds.push(round);
        }

        round.players.push({
          rowId: row.id,
          playerId: p.id,
          displayName: p.display_name,
          avatarUrl: p.avatar_url,
          marks: markIndices.length,
          total: card.length,
          won: row.won,
          finishPosition: row.finish_position,
          card: p.id === myId ? card : null,
          markIndices,
        });
      });

      const list = [...byRoom.values()];
      list.forEach((night) => {
        night.rounds.sort((a, b) => a.roundNumber - b.roundNumber);
        // Winners first, then everyone else alphabetically — the eye should go
        // to the result, not to whatever order the query returned.
        night.rounds.forEach((r) =>
          r.players.sort((a, b) => {
            if (a.won !== b.won) return a.won ? -1 : 1;
            if (a.won && b.won) return (a.finishPosition ?? 9) - (b.finishPosition ?? 9);
            return a.displayName.localeCompare(b.displayName);
          }),
        );
      });
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setNights(list);
      setIsLoading(false);
    }

    load();
  }, [player?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (playerLoading || isLoading) {
    return (
      <main className="min-h-screen px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div className="space-y-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
            Home
          </Link>
          <h1 className="font-display text-3xl font-black">Game History</h1>
          <p className="text-muted-foreground text-sm">
            Every night you have played, newest first.
          </p>
        </div>

        {nights.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center space-y-1">
            <p className="font-display font-bold">No Nights Yet</p>
            <p className="text-muted-foreground text-sm">
              Your game nights show up here after the first one.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {nights.map((night) => (
              <NightCard
                key={night.roomId}
                night={night}
                myId={player!.id}
                isExpanded={expandedId === night.roomId}
                onToggle={() =>
                  setExpandedId(expandedId === night.roomId ? null : night.roomId)
                }
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <HistoryPageContent />
    </Suspense>
  );
}

function NightCard({
  night,
  myId,
  isExpanded,
  onToggle,
}: {
  night: Night;
  myId: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const date = night.date ? new Date(night.date) : null;
  const iWon = night.rounds.some((r) => r.players.some((p) => p.playerId === myId && p.won));

  return (
    <li
      data-night={night.roomId}
      className={cn(
        'rounded-xl border bg-card overflow-hidden transition-colors',
        iWon ? 'border-accent/40' : 'border-border',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="font-medium text-sm truncate">
            {night.title}
            {night.templateName && (
              <span className="text-muted-foreground font-normal"> · {night.templateName}</span>
            )}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {date && date.toLocaleDateString()}
            {' · '}
            <span className="font-mono">{night.rounds.length}</span>
            {night.rounds.length === 1 ? ' round' : ' rounds'}
            {night.winners.length > 0 && ` · Won by ${night.winners.join(', ')}`}
          </p>
        </div>

        {/* Avatar stack — who was there */}
        <div className="flex -space-x-2 shrink-0">
          {night.roster.slice(0, 5).map((r) => (
            <div key={r.playerId} className="ring-2 ring-card rounded-full">
              <PlayerAvatar
                playerId={r.playerId}
                displayName={r.displayName}
                avatarUrl={r.avatarUrl}
                size="xs"
              />
            </div>
          ))}
        </div>

        {isExpanded
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
        }
      </button>

      {isExpanded && (
        <div className="border-t border-border divide-y divide-border">
          {night.rounds.map((round) => (
            <RoundRow key={round.gameId} round={round} night={night} myId={myId} />
          ))}
        </div>
      )}
    </li>
  );
}

function RoundRow({ round, night, myId }: { round: Round; night: Night; myId: string }) {
  // A round the host abandoned by starting the next one. It counts for nobody.
  const cancelled = round.status === 'cancelled';
  const me = round.players.find((p) => p.playerId === myId);

  return (
    <div className={cn('px-4 py-3 space-y-2', cancelled && 'opacity-60')}>
      <div className="flex items-center justify-between">
        <p className={SECTION_LABEL}>
          Round <span className="font-mono">{round.roundNumber}</span>
        </p>
        {cancelled && <span className="text-[13px] text-muted-foreground">No Winner</span>}
      </div>

      <ul className="space-y-1">
        {round.players.map((p) => (
          <li key={p.rowId} className="flex items-center gap-2 text-sm">
            <PlayerAvatar
              playerId={p.playerId}
              displayName={p.displayName}
              avatarUrl={p.avatarUrl}
              size="xs"
            />
            <span className={cn('truncate', p.playerId === myId && 'font-medium')}>
              {p.displayName}
            </span>

            {p.won && !cancelled && (
              <>
                <span
                  className={cn(PILL, 'shrink-0')}
                  style={{
                    color: 'var(--gold)',
                    backgroundColor: 'color-mix(in oklab, var(--gold) 18%, transparent)',
                  }}
                >
                  {p.finishPosition === 2 ? '2ND' : '1ST'}
                </span>
                {round.winPattern && (
                  <span className="text-[13px] text-muted-foreground">
                    {formatPattern(round.winPattern)}
                  </span>
                )}
              </>
            )}

            <span className="ml-auto font-mono text-[13px] text-muted-foreground">
              {p.marks}/{p.total}
            </span>
          </li>
        ))}
      </ul>

      {me?.card && me.card.length > 0 && <CardSnapshot entry={me} night={night} />}
    </div>
  );
}

/**
 * Mini read-only BingoBoard showing the player's card with their marks overlaid.
 * card_data from the DB already has FREE flagged at the square where it landed.
 */
function CardSnapshot({ entry, night }: { entry: RoundPlayer; night: Night }) {
  const raw = entry.card ?? [];
  // card_data is the full grid with FREE flagged where it landed (centre on
  // 5×5+, anywhere on 3×3/4×4), so BingoBoard gets it as-is.
  const items = raw;
  const markedIndices = new Set(entry.markIndices);
  // The same key the game screen shows above the hero board: only the games
  // with a square on this card. A legacy card has none, and keeps the plain label.
  const games = cardLegend(night.styles.legend, raw);

  return (
    <div className="pt-2">
      {games.length > 0 ? (
        <div className="mb-2 flex max-w-[480px] items-center justify-between gap-3">
          <p className={SECTION_LABEL}>Your Card</p>
          <BoardLegend games={games} />
        </div>
      ) : (
        <p className={cn(SECTION_LABEL, 'mb-2')}>Your Card</p>
      )}
      {/* pointer-events-none prevents interaction with the snapshot */}
      <div className="pointer-events-none">
        {/* The same text sizing as the hero board in GameView, at a width that
            gives it the ~92px squares that sizing needs. At the old 320px the
            squares were ~60px and the fluid size floored at 9.6px, so a word
            like "leaderboard" no longer fitted and broke mid-word. */}
        <BingoBoard
          items={items}
          boardSize={night.boardSize}
          styles={night.styles}
          markedIndices={markedIndices}
          calledIndices={markedIndices}
          className="max-w-[480px]"
          squareClassName={cn(
            'rounded-[6px]',
            night.boardSize >= 6
              ? 'text-[clamp(10px,12cqw,11px)]'
              : 'text-[clamp(10px,13cqw,12px)]',
          )}
        />
      </div>
    </div>
  );
}
