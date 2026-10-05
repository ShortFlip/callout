'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BookmarkMinus, Library, Pencil } from 'lucide-react';
import Link from 'next/link';
import { usePlayer } from '@/hooks/usePlayer';
import { LibraryError, loadSavedCards, unsaveCard } from '@/lib/library/api';
import { cardSplit } from '@/lib/library/hosting';
import { Button, buttonVariants } from '@/components/ui/button';
import { CardSplitWords } from '@/components/library/CardSplitWords';
import { ConfirmDialog } from '@/components/library/TagDialogs';
import type { CardTemplate } from '@/types/card';
import { SkeletonRows } from '@/components/ui/skeleton-rows';

// A 150ms colour transition (the owner's motion rule); the Button primitive now carries it too.
const BTN = 'transition-colors duration-150';

/**
 * The landing's Saved Cards: every card saved from the library (saved = true),
 * newest first. Cards are built and edited on /library; this list opens them
 * there and can take one off the list.
 *
 * Remove never deletes. Past nights read their card through rooms.template_id
 * for its name, style and legend, so Remove only sets saved = false and
 * History keeps drawing the night exactly as it was played.
 *
 * (The file and export keep their old name; the landing is the only caller.)
 */
export function TemplateList() {
  const { player } = usePlayer();
  const [cards, setCards] = useState<CardTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Kept after the dialog closes so its title does not blank out mid fade.
  const [removeTarget, setRemoveTarget] = useState<CardTemplate | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

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

  async function remove(card: CardTemplate) {
    try {
      await unsaveCard(card.id, card.name);
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      toast.success(`Removed “${card.name}” from Saved Cards`);
    } catch (error) {
      toast.error(error instanceof LibraryError ? error.message : `Could not remove “${card.name}”.`);
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
        className="grid grid-cols-2 gap-3 space-y-0"
        rowClassName="h-[120px] rounded-xl"
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="saved-cards">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Saved Cards</h2>
        {/* The empty state carries its own Open Library, so the header's would be a second copy. */}
        {cards.length > 0 && openLibrary}
      </div>

      {cards.length === 0 ? (
        <div className="space-y-3 rounded-xl border border-dashed border-border p-8 text-center">
          <div className="space-y-1">
            <p className="text-sm font-medium">No saved cards yet</p>
            <p className="text-[13px] text-muted-foreground">Build one in the Library and hit Save Card.</p>
          </div>
          {openLibrary}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {cards.map((card) => (
            <li
              key={card.id}
              data-saved-card={card.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-semibold">{card.name}</p>
                  <span className="shrink-0 font-mono text-[13px] text-muted-foreground">
                    {card.board_size}×{card.board_size}
                  </span>
                </div>
                <p className="text-[13px] text-muted-foreground" data-testid="saved-card-split">
                  <CardSplitWords split={cardSplit(card)} />
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/library?card=${card.id}`}
                  className={buttonVariants({ variant: 'outline', className: `${BTN} flex-1` })}
                >
                  <Pencil strokeWidth={1.75} />
                  Edit
                </Link>
                <Button
                  variant="outline"
                  className={`${BTN} text-destructive hover:border-destructive hover:text-destructive active:bg-destructive/15`}
                  onClick={() => { setRemoveTarget(card); setRemoveOpen(true); }}
                >
                  <BookmarkMinus strokeWidth={1.75} />
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={`Remove “${removeTarget?.name ?? ''}” from Saved Cards?`}
        body="Past nights keep it."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => { if (removeTarget) await remove(removeTarget); }}
      />
    </div>
  );
}
