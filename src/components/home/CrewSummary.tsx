'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, History, Trophy } from 'lucide-react';
import { usePlayer } from '@/hooks/usePlayer';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { loadCoPlayerRecords } from '@/lib/game/co-players';
import { buildLeaderboard, lastNight, type LastNight, type LeaderboardRow } from '@/lib/game/stats';
import { cn } from '@/lib/utils';

interface Crew {
  members: { playerId: string; displayName: string; avatarUrl: string | null }[];
  night: LastNight | null;
  champ: LeaderboardRow | null;
}

// Past this many avatars the row gets a "+N" instead of growing.
const MAX_AVATARS = 6;

/** One read for the hero's crew row and both stat tiles, so they agree. */
function useCrew(): Crew | null | 'failed' {
  const { player } = usePlayer();
  const [crew, setCrew] = useState<Crew | null | 'failed'>(null);

  useEffect(() => {
    if (!player) return;
    let cancelled = false;
    loadCoPlayerRecords(player.id)
      .then((records) => {
        if (cancelled) return;
        // Me first, then everyone else in the order the rows came back.
        const members = new Map<string, Crew['members'][number]>();
        members.set(player.id, { playerId: player.id, displayName: player.display_name, avatarUrl: player.avatar_url });
        for (const r of records) {
          if (!members.has(r.playerId)) {
            members.set(r.playerId, { playerId: r.playerId, displayName: r.displayName, avatarUrl: r.avatarUrl });
          }
        }
        const champ = buildLeaderboard(records)[0] ?? null;
        setCrew({
          members: [...members.values()],
          night: lastNight(records),
          champ: champ && champ.wins > 0 ? champ : null,
        });
      })
      .catch((error: unknown) => {
        // Quiet: the tiles are aftermath, and Host/Join still work without them.
        console.error('Failed to load the crew summary:', error);
        if (!cancelled) setCrew('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [player?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return crew;
}

/**
 * The hero's live half: who you play with, who won last night, and who leads
 * all-time. These replace the old History and Leaderboard link cards, so they
 * keep their colour identity (violet History, gold Leaderboard, no glow:
 * the glow belongs to the win).
 *
 * A hook rather than a component because the crew row and the tiles sit in
 * different spots of the hero but must come from one read.
 */
export function useCrewSummary() {
  const crew = useCrew();
  const ready = crew !== null && crew !== 'failed';

  return {
    crewRow: ready && crew.members.length > 1 ? <CrewRow members={crew.members} /> : null,
    tiles: (
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          href={ready && crew.night ? `/history?night=${crew.night.roomId}` : '/history'}
          icon={<History className="size-5 text-primary" strokeWidth={1.75} />}
          plate="border-primary/40 bg-primary/15"
          // `!` because `.glass` is unlayered CSS and would otherwise beat the utility.
          hover="hover:border-primary/45!"
          label={ready && crew.night ? `Last Night · ${formatNight(crew.night.startedAt)}` : 'Last Night'}
          loading={crew === null}
          person={ready && crew.night?.winner ? crew.night.winner : null}
          detail={
            ready && crew.night?.winner
              ? `Won ${crew.night.winner.wins} of ${plural(crew.night.rounds, 'round')}`
              : 'No nights played yet'
          }
        />
        <StatTile
          href="/leaderboard"
          icon={<Trophy className="size-5 text-gold" strokeWidth={1.75} />}
          plate="border-gold/40 bg-gold/15"
          hover="hover:border-gold/45!"
          label="All-Time Champ"
          loading={crew === null}
          person={ready ? crew.champ : null}
          detail={ready && crew.champ ? plural(crew.champ.wins, 'win') : 'Nobody on the board yet'}
        />
      </div>
    ),
  };
}

function CrewRow({ members }: { members: Crew['members'] }) {
  const shown = members.slice(0, MAX_AVATARS);
  const extra = members.length - shown.length;
  const names = shown.map((m) => m.displayName.split(' ')[0]).join(', ');
  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2">
        {shown.map((m) => (
          <PlayerAvatar
            key={m.playerId}
            playerId={m.playerId}
            displayName={m.displayName}
            avatarUrl={m.avatarUrl}
            size="sm"
            className="ring-2 ring-background"
          />
        ))}
      </div>
      <p className="truncate text-sm text-muted-foreground">
        {names}
        {extra > 0 && ` +${extra}`} · your crew
      </p>
    </div>
  );
}

interface StatTileProps {
  href: string;
  icon: React.ReactNode;
  plate: string;
  hover: string;
  label: string;
  loading: boolean;
  person: { playerId: string; displayName: string; avatarUrl: string | null } | null;
  detail: string;
}

function StatTile({ href, icon, plate, hover, label, loading, person, detail }: StatTileProps) {
  return (
    <Link
      href={href}
      className={cn(
        'glass glass-tile group flex flex-col gap-3 rounded-xl p-4 transition-colors duration-150',
        hover,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg border', plate)}>{icon}</span>
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-muted-foreground">{label}</p>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-colors duration-150 group-hover:text-foreground" />
      </div>
      {loading ? (
        <div aria-hidden className="h-10 animate-pulse rounded-md bg-muted/40" />
      ) : (
        <div className="flex items-center gap-3">
          {person && (
            <PlayerAvatar playerId={person.playerId} displayName={person.displayName} avatarUrl={person.avatarUrl} size="md" />
          )}
          <div className="min-w-0">
            {person && <p className="truncate font-display text-lg font-bold leading-tight">{person.displayName}</p>}
            <p className="truncate text-[13px] text-muted-foreground tabular-nums">{detail}</p>
          </div>
        </div>
      )}
    </Link>
  );
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function formatNight(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
