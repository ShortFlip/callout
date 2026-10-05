'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BookmarkMinus, Library, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePlayer } from '@/hooks/usePlayer';
import { LibraryError, loadSavedCards, restoreCard, unsaveCard } from '@/lib/library/api';
import { cardSplit } from '@/lib/library/hosting';
import { squareGame } from '@/lib/library/legend';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { CardSplitWords } from '@/components/library/CardSplitWords';
import type { CardStyles, CardTemplate, SquareItem } from '@/types/card';
import { SkeletonRows } from '@/components/ui/skeleton-rows';

// A 150ms colour transition (the owner's motion rule); the Button primitive now carries it too.
const BTN = 'transition-colors duration-150';

// Uniform columns that add more as the window widens instead of stretching
// each card (design rules 25 and 34).
const CARD_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(188px,1fr))] gap-3';

interface TemplateListProps {
  /** The card picked for the Host rail, outlined here. */
  selectedId: string | null;
  onHost: (card: CardTemplate) => void;
}

/**
 * The landing's Saved Cards: every card saved from the library (saved = true),
 * newest first. Cards are built and edited on /library; this list opens them
 * there and can take one off the list.
 *
 * Remove never deletes. Past nights read their card through rooms.template_id
 * for its name, style and legend, so Remove only sets saved = false and
 * History keeps drawing the night exactly as it was played.
 *
 * Home's main panel since the wide layout (2026-10-05): each card is drawn as
 * a miniature in its own game colours, and Host This hands it to the Host
 * rail, so the night's setup reads check card → host.
 *
 * (The file and export keep their old name; the landing is the only caller.)
 */
export function TemplateList({ selectedId, onHost }: TemplateListProps) {
  const { player } = usePlayer();
  const [cards, setCards] = useState<CardTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!player) return;
    let cancelled = false;
    loadSavedCards(player.id)
      .then((saved) => {
        if (!cancelled) setCards(saved);
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(error instanceof LibraryError ? error.message : 'Could not load your saved cards.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [player?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remove acts at once and offers Undo, the way Gmail does, instead of asking
  // first (design rule 77, 2026-10-04 audit). Nothing is lost either way:
  // Remove only sets saved = false, so Undo flips it back.
  async function remove(card: CardTemplate) {
    const index = cards.findIndex((c) => c.id === card.id);
    try {
      await unsaveCard(card.id, card.name);
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      toast.success(`Removed “${card.name}” from Saved Cards.`, {
        action: { label: 'Undo', onClick: () => void undoRemove(card, index) },
      });
    } catch (error) {
      toast.error(error instanceof LibraryError ? error.message : `Could not remove “${card.name}”.`);
    }
  }

  async function undoRemove(card: CardTemplate, index: number) {
    try {
      await restoreCard(card.id, card.name);
      // Back where it was, not at the end, so the grid looks as it did.
      setCards((prev) => {
        if (prev.some((c) => c.id === card.id)) return prev;
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, card);
        return next;
      });
    } catch (error) {
      toast.error(error instanceof LibraryError ? error.message : `Could not bring back “${card.name}”.`);
    }
  }

  const openLibrary = (
    <Link href="/library" className={buttonVariants({ variant: 'outline', className: BTN })}>
      <Library strokeWidth={1.75} />
      Open Library
    </Link>
  );

  if (isLoading) {
    return (
      <SkeletonRows
        count={4}
        label="Loading your cards"
        className={cn(CARD_GRID, 'space-y-0')}
        rowClassName="h-[300px] rounded-xl"
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-4" data-testid="saved-cards">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Your Cards</h2>
        {/* The empty state carries its own Open Library, so the header's would be a second copy. */}
        {cards.length > 0 && openLibrary}
      </div>

      {cards.length === 0 ? (
        <div className="grid flex-1 place-content-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
          <div className="space-y-1">
            <p className="text-sm font-medium">No saved cards yet</p>
            <p className="text-[13px] text-muted-foreground">Build one in the Library and hit Save Card.</p>
          </div>
          <div>{openLibrary}</div>
        </div>
      ) : (
        // More cards than fit scroll inside the panel, so the page itself never
        // scrolls at 1280×800 (his reject line for this layout).
        <ul className={cn(CARD_GRID, 'min-h-0 flex-1 content-start overflow-y-auto')}>
          {cards.map((card) => {
            const selected = card.id === selectedId;
            return (
              <li
                key={card.id}
                data-saved-card={card.id}
                className={cn(
                  'flex flex-col gap-3 rounded-xl border bg-card p-3 transition-colors duration-150',
                  selected ? 'border-primary ring-1 ring-primary' : 'border-border',
                )}
              >
                <CardPreview card={card} />
                <div className="min-w-0 space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm font-semibold">{card.name}</p>
                    <span className="shrink-0 tabular-nums text-[13px] text-muted-foreground">
                      {card.board_size}×{card.board_size}
                    </span>
                  </div>
                  <p className="truncate text-[13px] text-muted-foreground" data-testid="saved-card-split">
                    <CardSplitWords split={cardSplit(card)} />
                  </p>
                </div>
                {/* No icon on Host This: three buttons must fit the 188px column. */}
                <div className="mt-auto flex gap-1.5">
                  <Button
                    variant={selected ? 'default' : 'outline'}
                    className={`${BTN} min-w-0 flex-1`}
                    onClick={() => onHost(card)}
                    aria-pressed={selected}
                  >
                    Host This
                  </Button>
                  <Link
                    href={`/library?card=${card.id}`}
                    aria-label={`Edit ${card.name}`}
                    title="Edit"
                    className={buttonVariants({ variant: 'outline', size: 'icon', className: BTN })}
                  >
                    <Pencil strokeWidth={1.75} />
                  </Link>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={`Remove ${card.name}`}
                    title="Remove"
                    className={`${BTN} text-destructive hover:border-destructive hover:text-destructive active:bg-destructive/15`}
                    onClick={() => void remove(card)}
                  >
                    <BookmarkMinus strokeWidth={1.75} />
                  </Button>
                </div>
              </li>
            );
          })}
          <li>
            <Link
              href="/library"
              className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-semibold text-muted-foreground transition-colors duration-150 hover:border-primary/50 hover:text-foreground"
            >
              <Plus className="size-5" strokeWidth={1.75} />
              New Card
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}

/**
 * A saved card at a glance: one tile per square, tinted in its game's colour.
 * No text and no glow: amber and glow mean "marked" in a game, and a card on
 * Home has no marks. Items fill the squares in order around the centre FREE
 * (odd sizes only: even sizes place FREE at random when the round starts, so
 * a fixed spot here would be a lie).
 */
function CardPreview({ card }: { card: CardTemplate }) {
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
      className="grid aspect-square rounded-md border border-white/[0.07] bg-black/30 p-1.5"
      style={{ gridTemplateColumns: `repeat(${size}, 1fr)`, gap: 3 }}
      aria-hidden
    >
      {tiles.map((tile, i) => (
        <div key={i} className={cn('rounded-[2px]', tile.className)} style={{ backgroundColor: tile.color }} />
      ))}
    </div>
  );
}
