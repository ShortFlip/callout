'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BTN_PRIMARY } from '@/components/library/GameGlyph';
import { CardPane } from '@/components/library/CardPane';
import { ImportDialog } from '@/components/library/ImportDialog';
import { ItemsPane } from '@/components/library/ItemsPane';
import { LoadError } from '@/components/layout/LoadError';
import { usePlayer } from '@/hooks/usePlayer';
import { LibraryError, loadCard } from '@/lib/library/api';
import { notify } from '@/lib/library/notify';
import { useLibraryStore } from '@/stores/libraryStore';

/**
 * /library — every bingo item the player has written, and a card built from
 * them. Owner only: everything is read and written for the current player's
 * id. Two panes at 1280×800, each scrolling on its own so the card's Save
 * button never leaves the screen.
 */
function LibraryPageContent() {
  const { player, isLoading: playerLoading } = usePlayer();
  const router = useRouter();
  const searchParams = useSearchParams();
  // `?card=<id>` opens a saved card in the card pane (Saved Cards' Edit links here).
  const linkedCardId = searchParams.get('card');

  const loaded = useLibraryStore((s) => s.loaded && s.ownerId === player?.id);
  const loadFailed = useLibraryStore((s) => s.loadFailed);
  const [importOpen, setImportOpen] = useState(false);
  // One init per player: the store is global, so a re-render must not reload over edits.
  const initFor = useRef<string | null>(null);

  // The first load, and what Try Again re-runs after it failed. Outside the
  // effect because initFor (rightly) stops the effect from running it twice.
  const init = useCallback(async (ownerId: string) => {
    const store = useLibraryStore.getState();
    if (!(await store.load(ownerId))) return;
    store.restoreDraft();

    if (linkedCardId) {
      try {
        const card =
          useLibraryStore.getState().savedCards.find((c) => c.id === linkedCardId) ??
          (await loadCard(ownerId, linkedCardId));
        if (card) useLibraryStore.getState().loadCard(card);
        else notify.error('That card could not be found.');
      } catch (error) {
        notify.error(error instanceof LibraryError ? error.message : 'Could not open that card.');
      }
      // Drop the param so a refresh keeps the edits instead of reloading the card over them.
      router.replace('/library');
    }
  }, [linkedCardId, router]);

  useEffect(() => {
    if (!player || initFor.current === player.id) return;
    initFor.current = player.id;
    void init(player.id);
  }, [player, init]);

  // A failed load gets its own state; the skeleton is only for "still loading".
  if (!playerLoading && player && !loaded && loadFailed) {
    return (
      <main className="flex h-screen flex-col gap-5 px-6 pt-5 pb-6">
        <header className="space-y-1">
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground active:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="size-3.5" strokeWidth={1.75} />
            Home
          </Link>
          <h1 className="font-display text-3xl font-black">Library</h1>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_440px] gap-5">
          <div className="flex items-start justify-center rounded-2xl border bg-card p-8">
            <LoadError
              title="Couldn't Load Your Library"
              onRetry={() => init(player.id)}
              className="w-full max-w-sm"
            />
          </div>
          <div aria-hidden className="rounded-2xl border bg-card" />
        </div>
      </main>
    );
  }

  if (playerLoading || !loaded) {
    return (
      <main className="flex h-screen flex-col gap-5 px-6 py-6">
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_440px] gap-5">
          <div className="animate-pulse rounded-2xl border bg-card" />
          <div className="animate-pulse rounded-2xl border bg-card" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col gap-5 px-6 pt-5 pb-6">
      <header className="flex items-end justify-between gap-6">
        <div className="space-y-1">
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground active:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="size-3.5" strokeWidth={1.75} />
            Home
          </Link>
          <h1 className="font-display text-3xl font-black">Library</h1>
          <p className="text-sm text-muted-foreground">
            Every bingo item you&apos;ve written. Build a card on the right.
          </p>
        </div>
        <Button size="lg" className={`${BTN_PRIMARY} px-4`} onClick={() => setImportOpen(true)}>
          <ClipboardList strokeWidth={1.75} />
          Import List
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_440px] gap-5">
        <ItemsPane />
        <CardPane />
      </div>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </main>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LibraryPageContent />
    </Suspense>
  );
}
