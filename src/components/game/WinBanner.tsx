'use client';

import { Trophy } from 'lucide-react';
import { HostControls } from './HostControls';
import { cn } from '@/lib/utils';
import { PILL } from '@/lib/pill';
import type { GameWinner } from '@/stores/gameStore';

interface WinBannerProps {
  winners: GameWinner[];
  /** How the first winner's line reads: `Column 2`, `Diagonal`, `Blackout`. */
  patternLabel: string;
  roundNumber: number;
  isHost: boolean;
  onNewRound: () => void;
  onEndGame: () => void;
}

/**
 * The one loud moment in the app.
 *
 * It is a band between the header and the body, never an overlay: the round is
 * still live and the board underneath has to stay markable so second place can
 * still happen (DESIGN.md — "Never cover my board with a modal I have to
 * dismiss while the round is still live").
 */
export function WinBanner({
  winners,
  patternLabel,
  roundNumber,
  isHost,
  onNewRound,
  onEndGame,
}: WinBannerProps) {
  const first = winners[0];
  const second = winners[1];
  if (!first) return null;

  // Once both places are taken there is nothing left to play for, so the
  // subline stops inviting people to keep going and points at the host.
  const subline = second
    ? `${patternLabel} — Round ${roundNumber}. Two winners; host can start the next round.`
    : `${patternLabel} — Round ${roundNumber}. Board stays live; play on for second place.`;

  return (
    <div
      className={cn(
        'win-banner relative z-10 shrink-0 mx-[22px] mt-[14px] rounded-2xl px-[26px] py-[14px]',
        'flex items-center gap-[18px]',
        // The banner only ever mounts when a win lands, so the entrance can be
        // unconditional; reduced motion cancels it in globals.css.
        'win-banner-enter',
      )}
      role="status"
      aria-live="polite"
    >
      {/* Trophy tile: the only place gold is used as a fill at this size. */}
      <span
        className="shrink-0 w-[46px] h-[46px] rounded-xl flex items-center justify-center"
        style={{
          backgroundColor: 'color-mix(in oklab, var(--gold) 22%, transparent)',
          border: '1px solid color-mix(in oklab, var(--gold) 60%, transparent)',
        }}
      >
        <Trophy className="w-[26px] h-[26px]" strokeWidth={1.75} style={{ color: 'var(--gold)' }} />
      </span>

      <div className="min-w-0 flex-1">
        <p
          className="font-display text-[38px] font-extrabold leading-none uppercase truncate"
          style={{ textShadow: '0 0 30px color-mix(in oklab, var(--gold) 55%, transparent)' }}
        >
          {first.displayName} got bingo
        </p>
        <p className="mt-1 text-[13px] leading-tight font-medium text-muted-foreground truncate">
          {subline}
        </p>
      </div>

      <div className="shrink-0 flex items-center gap-2.5">
        <span
          className={cn(PILL, 'text-background')}
          style={{ backgroundColor: 'var(--gold)' }}
        >
          1st — {first.displayName}
        </span>

        {second ? (
          <span
            className={PILL}
            style={{
              color: 'var(--gold)',
              border: '1px solid color-mix(in oklab, var(--gold) 60%, transparent)',
            }}
          >
            2nd — {second.displayName}
          </span>
        ) : (
          <span
            className={cn(PILL, 'text-muted-foreground')}
            style={{ border: '1px solid rgba(255,255,255,0.14)' }}
          >
            2nd — Open
          </span>
        )}

        {/* Only the host can move the night along, so only the host sees the
            controls — everyone else gets no dead buttons to wonder about. */}
        {isHost && <HostControls onNewRound={onNewRound} onEndGame={onEndGame} />}
      </div>
    </div>
  );
}
