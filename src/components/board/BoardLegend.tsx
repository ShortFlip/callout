'use client';

import { GameMark } from './GameMark';
import { cn } from '@/lib/utils';
import type { BoardGame } from '@/lib/library/legend';

interface BoardLegendProps {
  /** The games on this card, in legend order (see cardLegend). Empty renders nothing. */
  games: BoardGame[];
  /**
   * False keeps the icons and drops the names, for a row too narrow to hold
   * them; each name stays as the chip's tooltip and for screen readers.
   */
  showNames?: boolean;
  className?: string;
}

/**
 * The key to a card's game marks: each game's icon in its colour, then its
 * name. Plain icon-and-word chips with no pill chrome — they share the hero
 * name row with the player's name, the best-line note and the score, and a
 * pill border would cost width the row does not have. The name is muted so
 * the legend reads as a key, not as more news beside the note.
 */
export function BoardLegend({ games, showNames = true, className }: BoardLegendProps) {
  if (games.length === 0) return null;

  return (
    <ul aria-label="Games on this card" className={cn('flex items-center gap-2.5', className)}>
      {games.map((game) => {
        return (
          <li
            key={game.gameTagId}
            title={showNames ? undefined : game.name}
            className="flex items-center gap-[5px] text-[13px] font-medium text-muted-foreground"
          >
            <GameMark icon={game.icon} color={game.color} logoUrl={game.logoUrl} className="size-3.5" />
            {showNames ? (
              // data-legend-name: useLegendNamesFit measures these to know
              // how much width the names need when it has to put them back.
              <span data-legend-name className="whitespace-nowrap">{game.name}</span>
            ) : (
              <span className="sr-only">{game.name}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
