'use client';

import { GameMark } from './GameMark';
import { cn } from '@/lib/utils';
import type { BoardGame } from '@/lib/library/legend';
import type { SquareItem, CardStyles } from '@/types/card';

interface BingoSquareProps {
  item: SquareItem;
  isFreeSpace?: boolean;
  styles?: CardStyles;
  isMarked?: boolean;
  isCalled?: boolean;
  onMark?: () => void;
  /** The square's game from the card's legend; null or absent draws it plain. */
  game?: BoardGame | null;
  /** Per-board overrides (radius, text size, hot-lane wash). Merged last. */
  className?: string;
}

/**
 * A square's game: its icon in the game's colour, alone in the top-left
 * corner — no wash, bar or tab (DESIGN.md Part 2 Rulings, 2026-09-24). The
 * square's face is left exactly as it is, so a marked square's amber stays
 * the only fill on the board, and the marker rides on top of it unchanged.
 *
 * 16px, stepping down only where it would reach the centred text (three
 * lines, 37.5px at the 10px floor, measured on the page):
 * - under 88px wide, 14px — 6×6 under the win banner at 1280×800 (80px), the
 *   History snapshot at 6×6: there three lines start ~21px down, and a 16px
 *   icon at 4px in would reach 21;
 * - under 78px, 12px, and the text is centred in the space below the icon
 *   (SMALL_SQUARE_TEXT, on the square) — 6×6 under the banner in a 670px-tall
 *   window leaves 60px squares, where even a 12px icon meets the top line.
 * The cell around each square is an @container, so each step follows the
 * square's own width wherever the board is drawn. pointer-events-none so a
 * click on the icon still marks the square.
 */
function GameMarker({ game }: { game: BoardGame }) {
  return (
    <GameMark
      icon={game.icon}
      color={game.color}
      logoUrl={game.logoUrl}
      className="pointer-events-none absolute left-1 top-1 size-4 @max-[88px]:size-3.5 @max-[78px]:size-3"
    />
  );
}

/** Below 78px the text moves under the 12px marker (4px in + 12px + 2px gap). */
const SMALL_SQUARE_TEXT = '@max-[78px]:pt-[18px]';

export function BingoSquare({
  item,
  isFreeSpace = false,
  styles,
  isMarked = false,
  isCalled = false,
  onMark,
  game = null,
  className,
}: BingoSquareProps) {
  // Whether custom color overrides are active — disables conflicting Tailwind classes
  const hasCustomColors = !!(styles?.squareBg || styles?.squareBgMarked);

  const base = cn(
    'relative flex items-center justify-center p-[4%]',
    // Fluid font size: 12cqw = 12% of the cell width — scales with board size
    'text-center font-medium',
    'text-[clamp(0.6rem,12cqw,1.1rem)]',
    // Only what a mark, a call, a hover or the hot lane changes. The dab and
    // the breathing glow are keyframe animations (.sq-marked) and need no
    // transition; transition-all also eased padding and the fitted font
    // size whenever the board resized under the win banner.
    'border border-grid-line transition-[background-color,border-color,color,box-shadow] duration-150',
    'aspect-square w-full overflow-hidden',
  );

  // Shared inline style for text + border color (the free space uses it too)
  const baseInlineStyle = {
    borderColor: styles?.gridLine,
    color: styles?.textColor,
  };

  // FREE SPACE — non-interactive
  if (isFreeSpace) {
    return (
      <div
        style={{
          ...baseInlineStyle,
          backgroundColor: styles?.squareBgFree,
        }}
        className={cn(
          base,
          // Only use the violet bloom treatment when no custom override
          !styles?.squareBgFree && 'sq-free bg-primary/15',
          'select-none',
          className,
        )}
      >
        <span
          style={{ color: styles?.textColor }}
          className={cn(
            'font-display font-bold text-[13px]',
            !styles?.textColor && 'text-primary',
          )}
        >
          Free
        </span>
      </div>
    );
  }

  // A playable square: mark on click, glow when marked.
  // The pulse keyframes read --sq-glow, so a custom marked color drives the
  // animation too. The static box-shadow below is byte-identical to the
  // keyframes' 0%/100% frame, so the glow settles without a visible jump.
  const customGlow = styles?.squareBgMarked;
  const gameStyle = {
    ...baseInlineStyle,
    ...(hasCustomColors && {
      backgroundColor: isMarked ? styles?.squareBgMarked : styles?.squareBg,
      ...(isMarked && customGlow
        ? {
            '--sq-glow': customGlow,
            boxShadow: `0 0 0 2px ${customGlow}, 0 0 14px color-mix(in oklab, ${customGlow} 35%, transparent)`,
          }
        : {}),
    }),
  } as React.CSSProperties;

  return (
    <button
      type="button"
      onClick={onMark}
      style={gameStyle}
      className={cn(
        base,
        'cursor-pointer select-none',
        // 150ms dab + amber breathing pulse that settles. Applied for custom
        // palettes too — the keyframes pick up --sq-glow from the inline style.
        isMarked && 'sq-marked',
        // Default Tailwind colors only when no custom override
        !hasCustomColors && isMarked && [
          // No ring-* here: the 2px ring is baked into the shadow below so it
          // matches the pulse keyframes exactly.
          'bg-accent/25 text-foreground',
          'shadow-[0_0_0_2px_var(--accent),0_0_14px_color-mix(in_oklab,var(--accent)_35%,transparent)]',
        ],
        !hasCustomColors && isCalled && !isMarked && 'bg-primary/10 text-foreground',
        !hasCustomColors && !isMarked && !isCalled && 'hover:bg-primary/5',
        game && SMALL_SQUARE_TEXT,
        className,
      )}
    >
      {game && <GameMarker game={game} />}
      {/* The line height lives on the text itself, not on the square. Every
          caller hands the square a text-size class (squareClassName), and
          cn()/tailwind-merge treats a text size as overriding any leading-*
          before it, so a leading-tight on the square was silently dropped and
          the text fell back to the body's 1.5. Here nothing is merged into it,
          so three lines stay 1.25 tall wherever the board is drawn. */}
      <span className="break-words line-clamp-3 leading-tight">{item.text}</span>
    </button>
  );
}
