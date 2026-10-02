'use client';

import { GameMark } from '@/components/board/GameMark';
import { GAME_COLORS, GAME_ICONS } from '@/lib/game-colors';
import { cn } from '@/lib/utils';
import type { Tag } from '@/types/library';

interface GameGlyphProps {
  /** The item's game tag; null or undefined draws an empty slot of the same size. */
  game: Tag | null | undefined;
  /** 16 in rows and panes, 14 inside chips (the icon rule); larger only in the logo preview. */
  size?: number;
  className?: string;
}

/**
 * A game's lookalike icon in its colour. With no game it still takes up the
 * same square, so the text beside it starts at the same x on every row.
 */
export function GameGlyph({ game, size = 16, className }: GameGlyphProps) {
  if (!game?.icon) {
    return <span aria-hidden className={cn('inline-block shrink-0', className)} style={{ width: size, height: size }} />;
  }
  return (
    <GameMark
      icon={GAME_ICONS[game.icon]}
      color={game.color ? GAME_COLORS[game.color] : undefined}
      logoUrl={game.logoUrl}
      grow
      className={className}
      style={{ width: size, height: size }}
    />
  );
}

/** Shared chip look for the filter row and the import dialog's tag toggles. */
export const chipClass = (active: boolean) =>
  cn(
    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium outline-none select-none',
    'transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50',
    'disabled:pointer-events-none disabled:opacity-50',
    active
      ? 'border-primary/70 bg-primary/15 text-foreground active:bg-primary/25'
      : 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground active:bg-muted',
  );

/**
 * A 150ms colour transition for every Button on this page (the owner's motion
 * rule). The Button primitive now carries the same one, so this only restates it.
 */
export const BTN = 'transition-colors duration-150';

/**
 * The primitive's default (primary) variant only darkens on hover when it
 * renders as a link, so a primary <button> would have no hover state at all.
 */
export const BTN_PRIMARY = 'transition-colors duration-150 hover:bg-primary/85 active:bg-primary/75';

/** Hover for the Checkbox and Switch primitives, which ship without one. */
export const HOVER_CONTROL = 'hover:border-ring hover:brightness-110';
