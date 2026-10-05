'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Loader2, LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { generateRoomCode } from '@/lib/game/room-code';
import { insertUnsavedCard, LibraryError, loadCard, loadHostChoices } from '@/lib/library/api';
import {
  cardSplit,
  chooseDefaultCard,
  draftSplit,
  hostCardName,
  type CardSplit,
  type HostCard,
  type HostDraft,
} from '@/lib/library/hosting';
import { usePlayer } from '@/hooks/usePlayer';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { CardSplitWords } from '@/components/library/CardSplitWords';
import type { CardTemplate } from '@/types/card';
import type { GameMode } from '@/types/game';
import { SkeletonRows } from '@/components/ui/skeleton-rows';

// Mode picker copy — kept next to the type so adding a mode forces updating both
const GAME_MODES: { value: GameMode; label: string; description: string }[] = [
  {
    value: 'honor',
    label: 'Honor System',
    description: 'No caller — everyone marks squares themselves as things happen.',
  },
  {
    value: 'traditional',
    label: 'Traditional',
    description: 'Host calls items one at a time; only called squares can be marked.',
  },
];

// A 150ms colour transition (the owner's motion rule). The Button primitive
// now carries it too, so BTN only restates it; the primary one also gets a
// hover it otherwise only has when it renders as a link.
const BTN = 'transition-colors duration-150';
const BTN_PRIMARY = 'transition-colors duration-150 hover:bg-primary/85 active:bg-primary/75';

/** A selectable tile (game mode, a card): one look for both pickers. */
function tileClass(selected: boolean): string {
  return cn(
    'w-full rounded-lg border px-3 py-2.5 text-left outline-none transition-colors duration-150',
    'focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
    selected
      ? 'border-primary bg-primary/10 text-foreground'
      : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40 active:bg-muted',
  );
}

/** A card as one summary: name, size and the game split. */
interface CardSummary {
  name: string;
  boardSize: number;
  split: CardSplit;
}

function summaryOfRow(card: CardTemplate): CardSummary {
  return { name: card.name, boardSize: card.board_size, split: cardSplit(card) };
}

function summaryOfDraft(draft: HostDraft): CardSummary {
  return { name: hostCardName(draft.name), boardSize: draft.boardSize, split: draftSplit(draft) };
}

/** What the landing's picker lists: the last card when it is an unsaved copy, then my saved cards. */
interface Choices {
  saved: CardTemplate[];
  lastUnsaved: CardTemplate | null;
}

interface CreateRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Host this card (the library's Host This Card). The dialog then shows it as
   * a summary instead of the card list. Omit it (the landing) to pick from the
   * saved cards, with the last hosted card preselected.
   */
  card?: HostCard;
}

export function CreateRoomDialog({ open, onOpenChange, card }: CreateRoomDialogProps) {
  const router = useRouter();
  const { player } = usePlayer();

  const [choices, setChoices] = useState<Choices | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The saved card behind a { kind: 'saved' } prop, read for its summary.
  const [hostedRow, setHostedRow] = useState<CardTemplate | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [gameMode, setGameMode] = useState<GameMode>('honor');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // A draft's card_templates row, once inserted. If the room insert then
  // fails, Create Room again reuses it rather than leaving a second copy.
  const insertedDraft = useRef<{ draft: HostDraft; id: string } | null>(null);

  const savedId = card?.kind === 'saved' ? card.templateId : null;

  // Read what the dialog shows each time it opens: saved cards can change
  // between opens (Save Card, Remove), and so can the last hosted room.
  useEffect(() => {
    if (!open || !player) return;
    if (card?.kind === 'draft') return; // everything needed is in the prop

    let cancelled = false;
    const ownerId = player.id;
    (async () => {
      setIsLoading(true);
      setLoadFailed(false);
      try {
        if (savedId) {
          const row = await loadCard(ownerId, savedId);
          if (cancelled) return;
          setHostedRow(row);
          if (!row) {
            setLoadFailed(true);
            toast.error('That card could not be found.');
          }
        } else {
          const { saved, lastRoomCard } = await loadHostChoices(ownerId);
          if (cancelled) return;
          const choice = chooseDefaultCard(saved, lastRoomCard);
          setChoices({ saved, lastUnsaved: choice.lastUnsaved });
          setSelectedId(choice.selectedId);
        }
      } catch (error) {
        if (cancelled) return;
        setLoadFailed(true);
        toast.error(error instanceof LibraryError ? error.message : 'Could not load your cards.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, player, card?.kind, savedId]);

  const fixedSummary = useMemo<CardSummary | null>(() => {
    if (card?.kind === 'draft') return summaryOfDraft(card.draft);
    if (card?.kind === 'saved' && hostedRow?.id === card.templateId) return summaryOfRow(hostedRow);
    return null;
  }, [card, hostedRow]);

  const options = choices ? [...(choices.lastUnsaved ? [choices.lastUnsaved] : []), ...choices.saved] : [];
  const isEmpty = !card && !isLoading && choices !== null && options.length === 0;
  const canCreate = card ? fixedSummary !== null && !loadFailed : selectedId !== null;

  /** The template_id the room gets: the saved card's, or a fresh saved = false row for a draft. */
  async function templateIdFor(ownerId: string): Promise<string | null> {
    if (card?.kind === 'saved') return card.templateId;
    if (card?.kind === 'draft') {
      if (insertedDraft.current?.draft === card.draft) return insertedDraft.current.id;
      const id = await insertUnsavedCard(ownerId, card.draft);
      insertedDraft.current = { draft: card.draft, id };
      return id;
    }
    return selectedId;
  }

  async function handleCreate() {
    if (!player || !canCreate) return;

    setIsCreating(true);
    try {
      const templateId = await templateIdFor(player.id);
      if (!templateId) throw new Error('No card selected');

      const supabase = createClient();

      // Generate a unique room code — retry on the rare collision
      let joinCode = generateRoomCode();
      const { data: existing } = await supabase
        .from('rooms')
        .select('id')
        .eq('join_code', joinCode)
        .maybeSingle();
      if (existing) joinCode = generateRoomCode(); // one retry is statistically sufficient

      const { data: room, error } = await supabase
        .from('rooms')
        .insert({
          host_id: player.id,
          join_code: joinCode,
          name: roomName.trim() || null,
          template_id: templateId,
          status: 'waiting',
          settings: {
            winPatterns: ['row', 'column', 'diagonal'],
            gameMode,
          },
        })
        .select()
        .single();

      if (error) throw error;

      onOpenChange(false);
      router.push(`/room/${room.join_code}`);
    } catch (err) {
      console.error('Failed to create room:', err);
      toast.error(err instanceof LibraryError ? err.message : 'Could not create room. Please try again.');
      setIsCreating(false);
    }
  }

  const buildLink = (
    <Link
      href="/library"
      onClick={() => onOpenChange(false)}
      className="inline-flex items-center gap-1 rounded-sm text-[13px] font-medium text-primary outline-none transition-colors duration-150 hover:text-primary/80 hover:underline active:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Plus className="size-4" strokeWidth={1.75} />
      Build a Card
    </Link>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Create a Room</DialogTitle>
          <DialogDescription>
            {card
              ? 'You’ll get a room code to share with your crew.'
              : 'Pick a saved card. You’ll get a room code to share.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">

          {/* Optional room name */}
          <div className="space-y-1.5">
            <Label htmlFor="room-name">
              Room Name <span className="text-muted-foreground">(Optional)</span>
            </Label>
            <Input
              id="room-name"
              placeholder="Friday Night Bingo"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              maxLength={60}
            />
          </div>

          {/* Game mode picker */}
          <div className="space-y-1.5">
            <Label>Game Mode</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {GAME_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  aria-pressed={gameMode === mode.value}
                  onClick={() => setGameMode(mode.value)}
                  className={tileClass(gameMode === mode.value)}
                >
                  <p className="text-sm font-medium">{mode.label}</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{mode.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* The card: a summary when one was handed in, else the saved-card picker */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label id="card-picker-label">Card</Label>
              {!card && !isEmpty && buildLink}
            </div>

            {card ? (
              fixedSummary ? (
                <div
                  data-testid="card-summary"
                  className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm font-medium">{fixedSummary.name}</p>
                    <span className="shrink-0 tabular-nums text-[13px] text-muted-foreground">
                      {fixedSummary.boardSize}×{fixedSummary.boardSize}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    <CardSplitWords split={fixedSummary.split} />
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  {loadFailed ? (
                    'Could not load this card.'
                  ) : (
                    <SkeletonRows count={1} label="Loading the card" className="w-full" rowClassName="h-[58px]" />
                  )}
                </div>
              )
            ) : isLoading || choices === null ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                {loadFailed ? (
                  'Could not load your cards.'
                ) : (
                  <SkeletonRows count={3} label="Loading your cards" className="w-full" rowClassName="h-[58px]" />
                )}
              </div>
            ) : isEmpty ? (
              <div className="space-y-3 rounded-lg border border-dashed border-border py-6 text-center">
                <LayoutGrid className="mx-auto size-8 text-muted-foreground" strokeWidth={1.75} />
                <p className="text-sm font-medium">No saved cards yet</p>
                <Link
                  href="/library"
                  onClick={() => onOpenChange(false)}
                  className={buttonVariants({ variant: 'outline', className: BTN })}
                >
                  <Plus strokeWidth={1.75} />
                  Build a Card
                </Link>
              </div>
            ) : (
              <ul
                role="radiogroup"
                aria-labelledby="card-picker-label"
                className="max-h-56 space-y-1.5 overflow-y-auto"
              >
                {options.map((option) => {
                  const isLast = option.id === choices.lastUnsaved?.id;
                  const summary = summaryOfRow(option);
                  const selected = selectedId === option.id;
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        data-card-option={option.id}
                        data-last-unsaved={isLast || undefined}
                        onClick={() => setSelectedId(option.id)}
                        className={tileClass(selected)}
                      >
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-sm font-medium">
                            {isLast ? 'Last Card (Unsaved)' : summary.name}
                          </span>
                          <span className="shrink-0 tabular-nums text-[13px] text-muted-foreground">
                            {summary.boardSize}×{summary.boardSize}
                          </span>
                        </span>
                        {isLast && (
                          <span className="mt-0.5 block truncate text-[13px] text-foreground/85">
                            {summary.name}
                          </span>
                        )}
                        <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                          <CardSplitWords split={summary.split} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" className={BTN} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className={BTN_PRIMARY}
              onClick={handleCreate}
              disabled={!canCreate || isCreating || isLoading}
            >
              {isCreating ? (
                <><Loader2 className="mr-2 size-4 animate-spin" /> Creating…</>
              ) : (
                'Create Room'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
