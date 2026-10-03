'use client';

import { useState } from 'react';
import { Check, ChevronDown, Palette } from 'lucide-react';
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

interface HostControlsProps {
  onNewRound: () => void;
  onEndGame: () => void;
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
                {preset.id === stylePreset && <Check className="size-4 text-primary" strokeWidth={2} />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <button type="button" onClick={onNewRound} className={cn(HOST_BTN, 'text-foreground/85')}>
        New Round
      </button>
      <button type="button" onClick={onEndGame} className={cn(HOST_BTN, 'text-muted-foreground')}>
        End Night
      </button>

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
