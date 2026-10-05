import { squareGame } from '@/lib/library/legend';
import { cn } from '@/lib/utils';
import type { CardStyles, CardTemplate, SquareItem } from '@/types/card';

/**
 * A saved card at a glance: one tile per square, tinted in its game's colour.
 * No text and no glow: amber and glow mean "marked" in a game, and a card on
 * Home or in the Lobby has no marks. Items fill the squares in order around
 * the centre FREE (odd sizes only: even sizes place FREE at random when the
 * round starts, so a fixed spot here would be a lie).
 */
export function CardPreview({ card, className }: { card: CardTemplate; className?: string }) {
  const size = card.board_size;
  const items = Array.isArray(card.items) ? (card.items as unknown as SquareItem[]) : [];
  const legend = (card.styles as CardStyles | null)?.legend;
  const freeAt = card.free_space && size % 2 === 1 ? Math.floor((size * size) / 2) : -1;

  let next = 0;
  const tiles = Array.from({ length: size * size }, (_, i) => {
    if (i === freeAt) return { className: 'mt-free', color: undefined };
    const item = items[next++];
    if (!item) return { className: 'mt', color: undefined };
    const game = squareGame(legend, item.gameTagId);
    return game
      ? { className: '', color: `color-mix(in oklab, ${game.color} 60%, transparent)` }
      : { className: 'bg-foreground/15', color: undefined };
  });

  return (
    <div
      className={cn('grid aspect-square rounded-md border border-white/[0.07] bg-black/30 p-1.5', className)}
      style={{ gridTemplateColumns: `repeat(${size}, 1fr)`, gap: 3 }}
      aria-hidden
    >
      {tiles.map((tile, i) => (
        <div key={i} className={cn('rounded-[2px]', tile.className)} style={{ backgroundColor: tile.color }} />
      ))}
    </div>
  );
}
