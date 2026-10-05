'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Loader2, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GameMark } from '@/components/board/GameMark';
import { BTN, BTN_PRIMARY } from '@/components/library/GameGlyph';
import { pairReplacements, swapItemKey, type SwapPlan, type SwapReplacements } from '@/lib/game/swap-games';
import { cn } from '@/lib/utils';
import { SECTION_LABEL } from '@/lib/label';
import type { BoardGame } from '@/lib/library/legend';
import type { SquareItem } from '@/types/card';

/** One side of a swap: the game's id and name, plus its mark when the legend can draw one. */
export interface SwapSide {
  gameTagId: string;
  name: string;
  game?: BoardGame;
}

interface SwapPickerProps {
  /** The direction the host chose; null keeps the dialog closed. */
  pending: { drop: SwapSide; target: SwapSide } | null;
  onClose: () => void;
  onLoadPlan: (dropGameTagId: string, targetGameTagId: string) => Promise<SwapPlan>;
  onSwap: (dropGameTagId: string, targetGameTagId: string, replacements: SwapReplacements) => Promise<void>;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; plan: SwapPlan };

/**
 * Both lists scroll inside the dialog: a 5×5 card can drop 14 squares, and at
 * 800px tall an unbounded list pushes the footer off screen. The thin
 * translucent bar is the rail's, so no white native scrollbar on the glass.
 */
const LIST_SCROLL =
  'max-h-[min(340px,calc(100dvh-340px))] overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.18)_transparent]';

/** A square's label in a list: its text, or "Image" for a picture-only square. */
function itemLabel(item: SquareItem): string {
  return item.text?.trim() || 'Image';
}

function Mark({ side }: { side: SwapSide }) {
  if (!side.game) return null;
  return <GameMark icon={side.game.icon} color={side.game.color} logoUrl={side.game.logoUrl} className="size-4" />;
}

/**
 * The host's swap, as a choice rather than a dice roll: "which Modern Warfare
 * squares go in place of the Rocket League ones?" The dropped items are the
 * same on every card (one shared set per night), so the host picks once and
 * each pick lands on every card holding that item.
 *
 * The plan is loaded each time the dialog opens, never cached: a mark made a
 * second ago takes its item out of the list, and the library may have grown
 * since the last swap.
 */
export function SwapPicker({ pending, onClose, onLoadPlan, onSwap }: SwapPickerProps) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  // Keys in pick order: the first pick replaces the first dropped item.
  const [picks, setPicks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // The loader is a fresh function on every RoomClient render (each mark
  // re-renders it). Read through a ref so a render mid-pick never reloads the
  // plan and wipes the host's picks.
  const loadPlanRef = useRef(onLoadPlan);
  useEffect(() => { loadPlanRef.current = onLoadPlan; }, [onLoadPlan]);

  const dropId = pending?.drop.gameTagId;
  const targetId = pending?.target.gameTagId;

  useEffect(() => {
    if (!dropId || !targetId) return;
    // A stale answer (the host closed and reopened another direction) must not
    // land in the new dialog.
    let current = true;
    setLoad({ status: 'loading' });
    setPicks([]);
    loadPlanRef.current(dropId, targetId).then(
      (plan) => { if (current) setLoad({ status: 'ready', plan }); },
      (error: unknown) => {
        console.error('Failed to load the swap picker:', error);
        if (current) setLoad({ status: 'error' });
      },
    );
    return () => { current = false; };
  }, [dropId, targetId, attempt]);

  const plan = load.status === 'ready' ? load.plan : null;
  // Fewer candidates than dropped items: the host picks all there are and the
  // rest stay as they are (the swap's "couldn't be swapped" toast says so).
  const need = plan ? Math.min(plan.dropped.length, plan.candidates.length) : 0;
  const byKey = new Map((plan?.candidates ?? []).map((item) => [swapItemKey(item), item]));
  const pickedItems = picks.flatMap((key) => byKey.get(key) ?? []);

  const toggle = useCallback(
    (key: string) => {
      setPicks((current) => {
        if (current.includes(key)) return current.filter((k) => k !== key);
        if (current.length >= need) return current;
        return [...current, key];
      });
    },
    [need],
  );

  async function confirm() {
    if (!pending || !plan || busy) return;
    setBusy(true);
    try {
      await onSwap(pending.drop.gameTagId, pending.target.gameTagId, pairReplacements(plan.dropped, pickedItems));
    } finally {
      setBusy(false);
      onClose();
    }
  }

  const drop = pending?.drop;
  const target = pending?.target;

  return (
    <Dialog open={!!pending} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_24px_60px_-20px_rgba(0,0,0,0.9)] sm:max-w-2xl" data-testid="swap-picker">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-lg font-bold">
            Swap
            {drop && <Mark side={drop} />}
            {drop?.name}
            <ArrowRight className="size-4 opacity-60" />
            {target && <Mark side={target} />}
            {target?.name}
          </DialogTitle>
          <DialogDescription>
            {drop && target
              ? `Pick the ${target.name} squares that take each ${drop.name} square's place. Every card gets the same swap; marked squares and Free stay put.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        {load.status === 'loading' && (
          // Skeleton rows in the two lists' shape, not a lone spinner: the dialog
          // keeps its size while the squares load (design rule 61).
          <div
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-4"
            data-testid="swap-loading"
            aria-busy="true"
            aria-label={`Loading ${target?.name ?? ''} squares`}
          >
            {[0, 1].map((col) => (
              <div key={col} className="flex flex-col gap-1">
                <div className="mb-2 h-[18px] w-24 rounded-sm bg-muted animate-pulse" />
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="h-[34px] rounded-md bg-muted animate-pulse" />
                ))}
              </div>
            ))}
          </div>
        )}

        {load.status === 'error' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center" data-testid="swap-error">
            <p className="text-sm text-destructive">Couldn&apos;t load the squares to swap.</p>
            <Button variant="outline" className={BTN} onClick={() => setAttempt((n) => n + 1)}>
              Try Again
            </Button>
          </div>
        )}

        {plan && plan.dropped.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">
            Nothing to swap — every {drop?.name} square is already marked.
          </p>
        )}

        {plan && plan.dropped.length > 0 && (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-4">
            {/* Left: what goes, and what each one becomes as the picks fill in. */}
            <section className="min-w-0">
              <h3 className={cn(SECTION_LABEL, 'mb-2')}>
                Replacing
              </h3>
              <ul className={cn('flex flex-col gap-1', LIST_SCROLL)} data-testid="swap-dropped">
                {plan.dropped.map((item, index) => {
                  const pick = pickedItems[index];
                  return (
                    <li
                      key={swapItemKey(item)}
                      data-item={itemLabel(item)}
                      className="flex items-center gap-2 rounded-md border border-white/8 bg-white/[0.03] px-2.5 py-1.5"
                    >
                      {drop && <Mark side={drop} />}
                      <span className="min-w-0 flex-1 truncate">{itemLabel(item)}</span>
                      <ArrowRight className="size-3.5 shrink-0 opacity-50" />
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate',
                          pick ? 'font-medium text-foreground' : 'italic text-muted-foreground/70',
                        )}
                      >
                        {pick ? itemLabel(pick) : index < need ? 'Pick One' : 'Stays As Is'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Right: the target game's items, none of which is on any card yet. */}
            <section className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className={SECTION_LABEL}>
                  {target?.name} Squares
                </h3>
                <span
                  className={cn('text-[13px] tabular-nums', picks.length === need ? 'text-emerald-400' : 'text-muted-foreground')}
                  data-testid="swap-count"
                >
                  {picks.length} of {need} Picked
                </span>
              </div>
              {plan.candidates.length === 0 ? (
                <p className="rounded-md border border-dashed border-white/12 px-3 py-6 text-center text-muted-foreground">
                  No {target?.name} squares left that aren&apos;t already on a card. Add more in the Library.
                </p>
              ) : (
                <ul className={cn('flex flex-col gap-1', LIST_SCROLL)} data-testid="swap-candidates">
                  {plan.candidates.map((item) => {
                    const key = swapItemKey(item);
                    const order = picks.indexOf(key);
                    const picked = order >= 0;
                    const full = !picked && picks.length >= need;
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          aria-pressed={picked}
                          data-item={itemLabel(item)}
                          disabled={full || busy}
                          onClick={() => toggle(key)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors duration-150 outline-none',
                            'focus-visible:ring-2 focus-visible:ring-ring',
                            picked
                              ? 'border-primary/60 bg-primary/15 text-foreground shadow-[0_0_12px_-4px_var(--color-primary)]'
                              : 'border-white/8 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.07] active:bg-white/10',
                            'disabled:cursor-not-allowed disabled:opacity-40',
                          )}
                        >
                          {target && <Mark side={target} />}
                          <span className="min-w-0 flex-1 truncate">{itemLabel(item)}</span>
                          {picked ? (
                            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold tabular-nums text-primary-foreground">
                              {order + 1}
                            </span>
                          ) : (
                            <Check className="size-4 shrink-0 opacity-0" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            className={cn(BTN, 'gap-1.5')}
            disabled={!plan || need === 0 || busy}
            onClick={() => plan && setPicks(plan.suggested.map(swapItemKey))}
            data-testid="swap-pick-for-me"
          >
            <Shuffle className="size-3.5" />
            Pick For Me
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" className={BTN} disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              className={BTN_PRIMARY}
              disabled={!plan || need === 0 || picks.length !== need || busy}
              onClick={() => { void confirm(); }}
              data-testid="swap-confirm"
            >
              {busy && <Loader2 className="animate-spin" />}
              Swap Squares
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
