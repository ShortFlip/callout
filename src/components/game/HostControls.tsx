'use client';

import { useState } from 'react';
import { Check, ChevronDown, LoaderCircle, Palette } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SwapPicker, type SwapSide } from './SwapPicker';
import { CARD_PRESETS } from '@/lib/card-styles';
import { cn } from '@/lib/utils';
import type { SwapPlan, SwapReplacements } from '@/lib/game/swap-games';

/** A game the round's cards actually use, named (and marked) from the card's legend. */
export type SwapGameOption = SwapSide;

/** The host request in flight, if any. Owned by RoomClient, so header and banner agree. */
export type HostAction = 'new-round' | 'end-night';

interface HostControlsProps {
  onNewRound: () => void;
  onEndGame: () => void;
  /** Which of New Round / End Night is in flight: that one spins, both are disabled. */
  hostAction?: HostAction | null;
  /**
   * Games on this round's cards. Two or more turns on the swap control; the
   * header passes it, the win banner does not (see GameView).
   */
  swapGames?: SwapGameOption[];
  onSwapGames?: (dropGameTagId: string, targetGameTagId: string, replacements: SwapReplacements) => Promise<void>;
  /** Loads what the swap picker lists. Required alongside onSwapGames. */
  onLoadSwapPlan?: (dropGameTagId: string, targetGameTagId: string) => Promise<SwapPlan>;
  /** The card style every board shows now. With onSetStyle, turns on the Style menu (header only). */
  stylePreset?: string;
  onSetStyle?: (stylePreset: string) => Promise<void>;
}

const HOST_BTN =
  'rounded-md px-3 py-1.5 text-[13px] font-semibold border border-white/12 hover:bg-white/8 hover:text-foreground transition-colors duration-150';

/**
 * The host's ways to move the night along.
 *
 * Rendered in two places — the win banner (when someone has won) and the game
 * header (when nobody has) — so a round that nobody wins is not a dead end.
 * One implementation so the pair can never drift apart in copy or styling.
 *
 * New Round and End Night are one click, no confirm: DESIGN.md — "Never make
 * me confirm a mark, a reset, or a rejoin." The game swap is the exception: it
 * rewrites every player's card mid-round and cannot be undone, so it opens a
 * picker where the host chooses the replacements (or lets Pick For Me draw).
 */
export function HostControls({
  onNewRound,
  onEndGame,
  hostAction = null,
  swapGames,
  onSwapGames,
  onLoadSwapPlan,
  stylePreset,
  onSetStyle,
}: HostControlsProps) {
  const [pending, setPending] = useState<{ drop: SwapGameOption; target: SwapGameOption } | null>(null);
  const games = swapGames ?? [];
  const canSwap = !!onSwapGames && !!onLoadSwapPlan && games.length >= 2;

  // Every ordered pair: with three games the host picks which one to drop and
  // which to fill from in a single menu choice rather than two pickers.
  const pairs = games.flatMap((drop) =>
    games.filter((target) => target.gameTagId !== drop.gameTagId).map((target) => ({ drop, target })),
  );

  return (
    <>
      {canSwap && games.length === 2 && (
        <button
          type="button"
          onClick={() => setPending({ drop: games[0], target: games[1] })}
          className={cn(HOST_BTN, 'text-foreground/85')}
        >
          Swap {games[0].name} → {games[1].name}
        </button>
      )}
      {canSwap && games.length > 2 && (
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(HOST_BTN, 'inline-flex items-center gap-1.5 text-foreground/85 outline-none')}>
            Swap Games
            <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.75} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {pairs.map(({ drop, target }) => (
              <DropdownMenuItem
                key={`${drop.gameTagId}>${target.gameTagId}`}
                onClick={() => setPending({ drop, target })}
              >
                {drop.name} → {target.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {/* One click, no confirm: a style is cosmetic and switching back is one more click. */}
      {onSetStyle && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(HOST_BTN, 'inline-flex items-center gap-1.5 text-foreground/85 outline-none')}
            data-testid="host-style"
          >
            <Palette className="size-3.5 opacity-70" strokeWidth={1.75} />
            Style
            <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.75} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {CARD_PRESETS.map((preset) => (
              <DropdownMenuItem
                key={preset.id}
                onClick={() => { if (preset.id !== stylePreset) void onSetStyle(preset.id); }}
                className="justify-between"
              >
                {preset.label}
                {preset.id === stylePreset && <Check className="size-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <HostButton
        label="New Round"
        busyLabel="Starting…"
        busy={hostAction === 'new-round'}
        disabled={hostAction !== null}
        onClick={onNewRound}
        className="text-foreground/85"
      />
      <HostButton
        label="End Night"
        busyLabel="Ending…"
        busy={hostAction === 'end-night'}
        disabled={hostAction !== null}
        onClick={onEndGame}
        className="text-muted-foreground"
      />

      {onSwapGames && onLoadSwapPlan && (
        <SwapPicker
          pending={pending}
          onClose={() => setPending(null)}
          onLoadPlan={onLoadSwapPlan}
          onSwap={onSwapGames}
        />
      )}
    </>
  );
}

interface HostButtonProps {
  label: string;
  busyLabel: string;
  /** This button's request is in flight: spinner and the -ing label. */
  busy: boolean;
  /** Any host request is in flight, this one's or its sibling's. */
  disabled: boolean;
  onClick: () => void;
  className: string;
}

/**
 * New Round / End Night. A click used to give no sign it landed (the ref
 * guard in RoomClient dropped repeat clicks silently), so the clicked button
 * now spins in place, the one place a spinner is allowed (decision 0005),
 * and its sibling dims so the host cannot fire the other one meanwhile.
 */
function HostButton({ label, busyLabel, busy, disabled, onClick, className }: HostButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      className={cn(
        HOST_BTN,
        'inline-flex items-center gap-1.5 disabled:pointer-events-none',
        // The busy one stays bright so the eye finds what is happening.
        busy ? 'text-foreground' : cn(className, 'disabled:opacity-60'),
      )}
    >
      {busy && <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.75} />}
      {busy ? busyLabel : label}
    </button>
  );
}
