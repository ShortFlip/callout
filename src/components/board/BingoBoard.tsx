'use client';

import { cn } from '@/lib/utils';
import { BingoSquare } from './BingoSquare';
import { squareGame } from '@/lib/library/legend';
import type { SquareItem, CardStyles } from '@/types/card';

/** Frame padding that matches each grid gap (literal classes, so Tailwind keeps them). */
const FRAME_PADDING: Record<string, string> = { 'gap-1': 'p-1', 'gap-1.5': 'p-1.5', 'gap-2': 'p-2', 'gap-3': 'p-3' };

// Pre-declare all grid sizes so Tailwind includes them in the build
const GRID_COLS: Record<number, string> = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

interface BingoBoardProps {
  items: SquareItem[];
  boardSize: number;
  styles?: CardStyles;
  className?: string;
  // game props
  markedIndices?: Set<number>;
  calledIndices?: Set<number>;
  onMarkSquare?: (gridIndex: number) => void;
  /** Grid gap utility. The game screen runs an 8px gap; everything else stays at 4px. */
  gapClass?: string;
  /** Extra classes for every square — lets a caller set radius and text size. */
  squareClassName?: string;
  /**
   * The unmarked cells of the player's best line. They get a flat amber wash
   * so the line you are closest to reads from across the room.
   */
  laneIndices?: Set<number>;
}

export function BingoBoard({
  items,
  boardSize,
  styles,
  className,
  markedIndices,
  calledIndices,
  onMarkSquare,
  gapClass = 'gap-1',
  squareClassName,
  laneIndices,
}: BingoBoardProps) {
  const total = boardSize * boardSize;

  return (
    // @container enables cqw units inside BingoSquare for fluid font sizing
    <div
      style={{ backgroundColor: styles?.cardBg }}
      className={cn(
        '@container grid w-full',
        gapClass,
        // A style with its own card colour frames the squares on all four sides
        // with the same width as the gaps. Without it the colour only showed
        // between squares and the outer row read as cut off ("kind of
        // truncated"). Styles without a card colour stay edge to edge.
        styles?.cardBg && (FRAME_PADDING[gapClass] ?? 'p-1'),
        styles?.cardBg && 'rounded-xl',
        GRID_COLS[boardSize] ?? 'grid-cols-5',
        className,
      )}
    >
      {Array.from({ length: total }, (_, gridIndex) => {
        // `items` is always a full generated card with FREE flagged in place.
        // FREE is wherever that flag is — 3×3/4×4 put it at a random square,
        // so the old positional centre insert would draw it in the wrong spot.
        const isFreeSpace = items[gridIndex]?.isFreeSpace === true;

        const item = isFreeSpace
          ? { text: 'FREE', isFreeSpace: true }
          : (items[gridIndex] ?? { text: '' });

        return (
          // Each cell is its own @container so cqw units inside BingoSquare
          // are relative to the cell width, not the whole board
          <div key={gridIndex} className="@container">
            <BingoSquare
              index={gridIndex}
              item={item}
              isFreeSpace={isFreeSpace}
              styles={styles}
              isMarked={markedIndices?.has(gridIndex) ?? false}
              isCalled={calledIndices?.has(gridIndex) ?? false}
              onMark={() => onMarkSquare?.(gridIndex)}
              // The card's legend (styles.legend) names each game; a card
              // without one — every legacy card — resolves to null and draws
              // exactly as before.
              game={squareGame(styles?.legend, item.gameTagId, isFreeSpace)}
              className={cn(squareClassName, laneIndices?.has(gridIndex) && 'lane')}
            />
          </div>
        );
      })}
    </div>
  );
}
