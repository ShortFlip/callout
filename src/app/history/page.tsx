'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { loadMyRoomIds } from '@/lib/game/co-players';
import { readAllPagesIn } from '@/lib/supabase/paging';
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
import { SkeletonRows } from '@/components/ui/skeleton-rows';

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
  const [selectedId, setSelectedId] = useState<string | null>(linkedNightId);

  useEffect(() => {
    if (!player) return;
    const myId = player.id;

    async function load() {
      const supabase = createClient();

      // 1. Which rooms have I played in? A room is a night.
      let roomIds: string[];
      try {
        roomIds = await loadMyRoomIds(supabase, myId);
      } catch (mineError) {
        console.error(mineError); setIsLoading(false); return;
      }

      if (roomIds.length === 0) { setNights([]); setIsLoading(false); return; }

      // 2. Every row from every round of those rooms — mine and everyone
      //    else's, paged past the 1,000-row cap. `!inner` is what makes the
      //    room filter apply to the parent row instead of merely nulling the embed.
      let rows;
      try {
        rows = await readAllPagesIn(roomIds, (ids, from, to) =>
          supabase
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
            .in('games.room_id', ids)
            .order('id', { ascending: true })
            .range(from, to),
        );
      } catch (error) {
        console.error(error); setIsLoading(false); return;
      }

      const byRoom = new Map<string, Night>();
      const roundsByGame = new Map<string, Round>();

      rows.forEach((row) => {
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

  // The open night: the one a `?night=` link names, else the newest. A stale
  // link (a night not in my list) falls back to the newest rather than nothing.
  const selected = nights.find((n) => n.roomId === selectedId) ?? nights[0] ?? null;

  if (playerLoading || isLoading) {
    return (
      <main className="grid h-screen min-h-[720px] grid-cols-[330px_1fr] gap-5 px-10 pt-14 pb-7">
        <SkeletonRows count={5} label="Loading your nights" className="glass rounded-2xl p-4" rowClassName="h-[60px]" />
        <div aria-hidden className="glass rounded-2xl" />
      </main>
    );
  }

  // Wide layout (2026-10-05): a master–detail split. The nights list stays on
  // the left and the open night fills the right, one round at a time, so a
  // night no longer stacks every round's card down the page. Fixed to the
  // window height; only the nights list scrolls.
  return (
    <main className="grid h-screen min-h-[720px] grid-cols-[330px_1fr] gap-5 px-10 pt-14 pb-7">
      <section className="glass flex min-h-0 flex-col gap-4 rounded-2xl p-4">
        <div className="space-y-1 px-1">
          <Link
            href="/"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
            Home
          </Link>
          <h1 className="font-display text-3xl font-black">Game History</h1>
          <p className="text-sm text-muted-foreground">Every night you have played, newest first.</p>
        </div>

        {nights.length === 0 ? (
          <div className="space-y-1 rounded-xl border border-dashed border-border p-8 text-center">
            <p className="font-display font-bold">No Nights Yet</p>
            <p className="text-sm text-muted-foreground">Your game nights show up here after the first one.</p>
          </div>
        ) : (
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {nights.map((night) => (
              <NightButton
                key={night.roomId}
                night={night}
                myId={player!.id}
                isSelected={selected?.roomId === night.roomId}
                onSelect={() => setSelectedId(night.roomId)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="glass flex min-h-0 flex-col rounded-2xl p-5">
        {/* Keyed by night so the round tab resets to Round 1 on every switch. */}
        {selected && <NightDetail key={selected.roomId} night={selected} myId={player!.id} />}
      </section>
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

function formatNightDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function NightButton({
  night,
  myId,
  isSelected,
  onSelect,
}: {
  night: Night;
  myId: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const iWon = night.rounds.some((r) => r.players.some((p) => p.playerId === myId && p.won));

  return (
    <li data-night={night.roomId}>
      <button
        type="button"
        onClick={onSelect}
        aria-current={isSelected ? 'true' : undefined}
        className={cn(
          'w-full space-y-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150',
          isSelected
            ? 'border-primary bg-primary/10'
            : cn('bg-card hover:bg-muted/40', iWon ? 'border-accent/40' : 'border-border'),
        )}
      >
        <p className="truncate text-sm font-medium">
          {night.title}
          {night.templateName && <span className="font-normal text-muted-foreground"> · {night.templateName}</span>}
        </p>
        <p className="truncate text-[13px] text-muted-foreground">
          {night.date && formatNightDate(night.date)}
          {' · '}
          <span className="tabular-nums">{night.rounds.length}</span>
          {night.rounds.length === 1 ? ' round' : ' rounds'}
          {' · '}
          {night.winners.length > 0 ? night.winners.join(', ') : 'No winner'}
        </p>
      </button>
    </li>
  );
}

/** What a round's tab says: who won it, or why nobody did. */
function roundOutcome(round: Round): string {
  if (round.status === 'cancelled') return 'No Winner';
  const first = round.players.find((p) => p.won && (p.finishPosition ?? 1) === 1);
  return first ? first.displayName : 'Unfinished';
}

function NightDetail({ night, myId }: { night: Night; myId: string }) {
  const [roundIndex, setRoundIndex] = useState(0);
  const round = night.rounds[roundIndex] ?? night.rounds[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate font-display text-2xl font-bold">{night.title}</h2>
          <p className="truncate text-[13px] text-muted-foreground">
            {[night.templateName, night.date && formatNightDate(night.date), `${night.roster.length} players`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 -space-x-2">
          {night.roster.slice(0, 6).map((r) => (
            <PlayerAvatar
              key={r.playerId}
              playerId={r.playerId}
              displayName={r.displayName}
              avatarUrl={r.avatarUrl}
              size="sm"
              className="ring-2 ring-card"
            />
          ))}
        </div>
      </div>

      <div role="tablist" aria-label="Rounds" className="flex gap-1 overflow-x-auto border-b border-border">
        {night.rounds.map((r, i) => (
          <button
            key={r.gameId}
            type="button"
            role="tab"
            aria-selected={i === roundIndex}
            onClick={() => setRoundIndex(i)}
            className={cn(
              '-mb-px shrink-0 rounded-t-md border border-b-0 px-3.5 py-2 text-sm font-semibold transition-colors duration-150',
              i === roundIndex
                ? 'border-border bg-muted/50 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            Round <span className="tabular-nums">{r.roundNumber}</span> · {roundOutcome(r)}
          </button>
        ))}
      </div>

      {round && <RoundPanel round={round} night={night} myId={myId} />}
    </div>
  );
}

function RoundPanel({ round, night, myId }: { round: Round; night: Night; myId: string }) {
  // A round the host abandoned by starting the next one. It counts for nobody.
  const cancelled = round.status === 'cancelled';
  const me = round.players.find((p) => p.playerId === myId);

  return (
    <div role="tabpanel" className={cn('flex min-h-0 flex-1 flex-col gap-3', cancelled && 'opacity-60')}>
      {/* Podium strip: everyone on one line, winners first in gold. It replaced
          a row per player that pushed the card below the fold. */}
      <ul className="flex flex-wrap items-center gap-2">
        {round.players.map((p) => {
          const placed = p.won && !cancelled;
          return (
            <li
              key={p.rowId}
              className={cn(
                'flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm',
                placed ? 'border-gold/60' : 'border-border',
              )}
              style={placed ? { backgroundColor: 'color-mix(in oklab, var(--gold) 10%, transparent)' } : undefined}
            >
              <PlayerAvatar playerId={p.playerId} displayName={p.displayName} avatarUrl={p.avatarUrl} size="xs" />
              <span className={cn(p.playerId === myId && 'font-semibold')}>{p.displayName}</span>
              {placed && (
                <span
                  className={PILL}
                  style={{
                    color: 'var(--gold)',
                    backgroundColor: 'color-mix(in oklab, var(--gold) 18%, transparent)',
                  }}
                >
                  {p.finishPosition === 2 ? '2nd' : '1st'}
                </span>
              )}
              {/* Only the first winner's pattern is stored on the game. */}
              {placed && p.finishPosition !== 2 && round.winPattern && (
                <span className="text-[13px] text-muted-foreground">{formatPattern(round.winPattern)}</span>
              )}
              <span className="tabular-nums text-[13px] text-muted-foreground">
                {p.marks}/{p.total}
              </span>
            </li>
          );
        })}
      </ul>

      {me?.card && me.card.length > 0 && <CardSnapshot entry={me} night={night} />}
    </div>
  );
}

/**
 * Read-only BingoBoard showing the player's card with their marks overlaid.
 * card_data from the DB already has FREE flagged at the square where it landed.
 */
function CardSnapshot({ entry, night }: { entry: RoundPlayer; night: Night }) {
  const raw = entry.card ?? [];
  const markedIndices = new Set(entry.markIndices);
  // The same key the game screen shows above the hero board: only the games
  // with a square on this card. A legacy card has none, and keeps the plain label.
  const games = cardLegend(night.styles.legend, raw);

  return (
    // The board is as tall as the pane allows, capped at 480px: the ruling
    // (2026-09-24) that keeps the hero board's ~92px squares so words fit
    // whole. At 1280×800 the pane leaves it the full 480.
    <div className="mx-auto flex min-h-0 w-full flex-1 flex-col items-center">
      <div className="flex h-full max-h-[512px] min-h-0 flex-col" style={{ aspectRatio: '480 / 512' }}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className={SECTION_LABEL}>Your Card</p>
          {games.length > 0 && <BoardLegend games={games} />}
        </div>
        {/* pointer-events-none prevents interaction with the snapshot */}
        <div className="pointer-events-none">
          <BingoBoard
            items={raw}
            boardSize={night.boardSize}
            styles={night.styles}
            markedIndices={markedIndices}
            calledIndices={markedIndices}
            squareClassName={cn(
              'rounded-[6px]',
              night.boardSize >= 6
                ? 'text-[clamp(11px,12cqw,11px)]'
                : 'text-[clamp(11px,13cqw,12px)]',
            )}
          />
        </div>
      </div>
    </div>
  );
}
