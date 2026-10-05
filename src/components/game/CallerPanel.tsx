'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useGameStore } from '@/stores/gameStore';
import type { SquareItem } from '@/types/card';
import { SECTION_LABEL } from '@/lib/label';

interface CallerPanelProps {
  gameId: string;
  onCallNext: (callsMade: number) => Promise<void>;
}

export function CallerPanel({ gameId, onCallNext }: CallerPanelProps) {
  const { callList, calledCount, templateItems } = useGameStore();
  const [isCalling, setIsCalling] = useState(false);

  const totalItems = callList.length;
  const allCalled = calledCount >= totalItems;
  const currentItemIndex = calledCount > 0 ? callList[calledCount - 1] : null;
  const currentItem: SquareItem | null =
    currentItemIndex !== null ? (templateItems[currentItemIndex] ?? null) : null;
  const nextItemIndex = !allCalled ? callList[calledCount] : null;
  const nextItem: SquareItem | null =
    nextItemIndex !== null ? (templateItems[nextItemIndex] ?? null) : null;

  async function handleCallNext() {
    if (allCalled || isCalling) return;
    setIsCalling(true);
    try {
      const newCount = calledCount + 1;

      // Persist the new call count to the DB so late joiners can catch up
      const supabase = createClient();
      const { error } = await supabase
        .from('games')
        .update({ calls_made: newCount })
        .eq('id', gameId);

      if (error) throw error;

      await onCallNext(newCount);
    } catch (err) {
      console.error('Failed to call next item:', err);
      toast.error('Could not call the next item.');
    } finally {
      setIsCalling(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className={SECTION_LABEL}>
          Caller Panel
        </p>
        <span className="font-mono text-[13px] text-muted-foreground">
          {calledCount}/{totalItems}
        </span>
      </div>

      {/* Current item display — 3D flip on each new call.
          perspective lives on the wrapper so the inner card rotates in depth. */}
      <div style={{ perspective: '900px' }}>
        <div
          // Keying on calledCount remounts the card, which restarts the
          // flip animation — no state or effect needed.
          key={calledCount}
          className="call-flip call-glass rounded-xl p-5 min-h-[96px] flex items-center justify-center text-center"
        >
          {currentItem ? (
            <p className="font-display text-xl font-bold leading-snug">
              {currentItem.text}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Hit &ldquo;Call Next&rdquo; to start the game
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-[width] duration-300 rounded-full"
          style={{ width: totalItems ? `${(calledCount / totalItems) * 100}%` : '0%' }}
        />
      </div>

      {/* Next item preview */}
      {nextItem && (
        <p className="text-[13px] text-muted-foreground text-center">
          Up next: <span className="text-foreground font-medium">{nextItem.text}</span>
        </p>
      )}

      <Button
        size="lg"
        className="w-full gap-2"
        onClick={handleCallNext}
        disabled={allCalled || isCalling}
      >
        {isCalling ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
        {allCalled ? 'All Items Called' : 'Call Next'}
      </Button>
    </div>
  );
}
