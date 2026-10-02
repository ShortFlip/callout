'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Dices, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { allocateMix, slotsFor } from '@/lib/game/card-builder';
import { CARD_PRESETS } from '@/lib/card-styles';
import { sameName } from '@/lib/library/api';
import { laneKeysFor, mixForBuild } from '@/lib/library/card-draft';
import { cardHeat } from '@/lib/library/heat';
import { hostCardFor, type HostCard } from '@/lib/library/hosting';
import { notify } from '@/lib/library/notify';
import { cn } from '@/lib/utils';
import { emptySlots, fillableCounts, poolFor, useLibraryStore } from '@/stores/libraryStore';
import { BTN, BTN_PRIMARY, GameGlyph, HOVER_CONTROL } from './GameGlyph';
import { heatColor } from './HeatMeter';
import { MixControl } from './MixControl';
import { ConfirmDialog } from './TagDialogs';
import { CreateRoomDialog } from '@/components/game/CreateRoomDialog';
import type { SquareItem } from '@/types/card';
import type { Tag } from '@/types/library';

const SIZES = [3, 4, 5, 6] as const;
const SIZE_ITEMS: Record<string, string> = Object.fromEntries(SIZES.map((n) => [String(n), `${n}×${n}`]));
const STYLE_ITEMS: Record<string, string> = Object.fromEntries(CARD_PRESETS.map((p) => [p.id, p.label]));

/**
 * The right pane: the card as a numbered list of squares he fills
 * (decision 0004). Add on the left puts an item in the next empty square, ✕
 * here empties one, and Fill Empty is the only random step. Everything here
 * edits the draft in the library store; only Save writes to the database.
 */
export function CardPane() {
  const items = useLibraryStore((s) => s.items);
  const tags = useLibraryStore((s) => s.tags);
  const draft = useLibraryStore((s) => s.draft);
  const capped = useLibraryStore((s) => s.capped);
  const savedCards = useLibraryStore((s) => s.savedCards);
  const heat = useLibraryStore((s) => s.heat);
  const store = useLibraryStore.getState;

  const [replaceTarget, setReplaceTarget] = useState<{ id: string; name: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [saving, setSaving] = useState(false);
  // The card handed to Create Room, frozen at the click so the dialog's summary
  // cannot shift under it. Kept after close so the dialog does not flip to the
  // saved-card list while it fades out.
  const [hostCard, setHostCard] = useState<HostCard | null>(null);
  const [hostOpen, setHostOpen] = useState(false);

  const games = useMemo(() => tags.filter((t) => t.kind === 'game'), [tags]);
  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const pool = useMemo(() => poolFor(items, draft), [items, draft]);
  const lanes = useMemo(() => laneKeysFor(pool, tags), [pool, tags]);
  const fillable = useMemo(() => fillableCounts(items, draft), [items, draft]);
  // How playable the card is, judged by past rounds.
  const setHeat = useMemo(() => cardHeat(draft.set, items, heat), [draft.set, items, heat]);

  const slots = slotsFor(draft.boardSize, draft.freeSpace);
  const filled = draft.set.length;
  const empty = emptySlots(draft);
  const short = empty > 0;
  const nameBlank = draft.name.trim().length === 0;
  const canFill = empty > 0 && [...fillable.values()].some((n) => n > 0);

  // What the next Fill would draw per game: the mix read as proportions over
  // the empty squares, capped at what each game has left. The sliders show this.
  const fillPreview = useMemo(() => {
    const plan = allocateMix(mixForBuild(draft.mix, lanes).lanes, empty, fillable);
    return new Map(plan.lanes.map((lane) => [lane.gameTagId, lane.count]));
  }, [draft.mix, lanes, empty, fillable]);

  // "How does what I pick on the left get over here?" A single square added
  // from the left lights up and scrolls into view. A Fill adds many at once,
  // so it doesn't flash.
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null);
  const prevIds = useRef(draft.set.map((s) => s.libraryItemId));
  useEffect(() => {
    const ids = draft.set.map((s) => s.libraryItemId);
    const added = ids.filter((id) => id && !prevIds.current.includes(id));
    prevIds.current = ids;
    if (added.length !== 1) return;
    const id = added[0]!;
    setFlash((f) => ({ id, n: (f?.n ?? 0) + 1 }));
    document.querySelector(`[data-library-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [draft.set]);

  async function save(targetId: string | null) {
    setSaving(true);
    const name = draft.name.trim();
    const ok = await store().saveCard(targetId);
    setSaving(false);
    if (ok) notify.success(`Saved “${name}”`);
  }

  function onSave() {
    if (short || nameBlank) return;
    const match = savedCards.find((card) => sameName(card.name, draft.name));
    if (!match) {
      void save(null); // a new name: a new saved card, even when this draft was loaded from another
    } else if (match.id === draft.templateId) {
      void save(match.id); // the loaded card under its own name: update it
    } else {
      setReplaceTarget({ id: match.id, name: match.name });
    }
  }

  /**
   * A saved card shown exactly as saved is hosted by its id; anything else
   * (unsaved, edited, a pool draw, a topped-up legacy card) is inserted first
   * as its own saved = false row. hostCardFor decides.
   */
  function onHost() {
    if (short) return;
    const savedCard = draft.templateId ? savedCards.find((card) => card.id === draft.templateId) : undefined;
    setHostCard(hostCardFor(draft, tags, savedCard));
    setHostOpen(true);
  }

  return (
    <section aria-label="Card" className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <h2 className="font-display text-lg font-bold">Card</h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" className={BTN} onClick={() => store().newCard()}>
            <Plus strokeWidth={1.75} />
            New Card
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="secondary" className={BTN} />}>
              Load Saved
              <ChevronDown strokeWidth={1.75} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-64">
              {savedCards.length === 0 && <DropdownMenuItem disabled>No Saved Cards Yet</DropdownMenuItem>}
              {savedCards.map((card) => (
                <DropdownMenuItem
                  key={card.id}
                  onClick={() => store().loadCard(card)}
                  className="justify-between gap-3"
                >
                  <span className="truncate">{card.name}</span>
                  <span className="shrink-0 text-[13px] font-medium text-muted-foreground tabular-nums">
                    {card.board_size}×{card.board_size}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="space-y-3 border-b px-4 pb-4">
        <Input
          value={draft.name}
          onChange={(e) => store().setName(e.target.value)}
          placeholder="Card Name"
          aria-label="Card Name"
          maxLength={60}
          className="h-9 text-sm"
        />

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            Size
            <Select
              items={SIZE_ITEMS}
              value={String(draft.boardSize)}
              onValueChange={(value) => { if (value) store().setBoardSize(Number(value)); }}
            >
              <SelectTrigger className="w-20 text-sm text-foreground transition-colors duration-150 hover:bg-muted/40" aria-label="Size">
                <SelectValue className="font-medium tabular-nums" />
              </SelectTrigger>
              <SelectContent>
                {SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)} className="font-medium tabular-nums">
                    {n}×{n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-[13px] whitespace-nowrap text-muted-foreground">
            <Switch checked={draft.freeSpace} onCheckedChange={(on) => store().setFreeSpace(on)} aria-label="Free Space" className={HOVER_CONTROL} />
            Free Space
          </label>

          <label className="ml-auto flex items-center gap-2 text-[13px] text-muted-foreground">
            Style
            <Select
              items={STYLE_ITEMS}
              value={draft.stylePreset}
              onValueChange={(value) => { if (value) store().setStylePreset(value); }}
            >
              <SelectTrigger className="w-28 text-sm text-foreground transition-colors duration-150 hover:bg-muted/40" aria-label="Style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CARD_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
      </div>

      <div className="space-y-2.5 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px]" data-testid="set-count">
            <span className="font-semibold tabular-nums">{filled}</span>
            <span className="text-muted-foreground"> of </span>
            <span className="font-semibold tabular-nums">{slots}</span> Squares
          </p>
          {setHeat.rate !== null && (
            <p className="text-[13px] text-muted-foreground" title="Average Hit Rate Of This Card's Items In Past Rounds" data-testid="card-heat">
              Card Heat{' '}
              <span className="font-semibold tabular-nums" style={{ color: heatColor(setHeat.rate) }}>
                {Math.round(setHeat.rate * 100)}%
              </span>
              {/* Say how much of the card the number stands on, so a few hot items cannot pass for the whole card. */}
              {setHeat.withData < setHeat.total && (
                <> (<span className="tabular-nums text-foreground">{setHeat.withData}</span> of <span className="tabular-nums text-foreground">{setHeat.total}</span>)</>
              )}
            </p>
          )}
        </div>
        {/* Fill progress: amber while short, green once every square is taken. */}
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className={cn('h-full rounded-full transition-[width] duration-300', short ? 'bg-accent' : 'bg-success')}
            style={{ width: `${slots > 0 ? (filled / slots) * 100 : 0}%` }}
          />
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto border-t" aria-label="Card Squares" data-testid="card-set">
        {filled === 0 && (
          <li className="px-4 pt-3 pb-1 text-[13px] text-muted-foreground" data-testid="card-hint">
            Add items from the library, or fill the card at random below.
          </li>
        )}
        {draft.set.map((square, index) => (
          <SquareRow
            key={square.libraryItemId ?? `text-${index}-${square.text}`}
            number={index + 1}
            square={square}
            game={square.gameTagId ? gameById.get(square.gameTagId) ?? null : null}
            onRemove={() => store().removeSquare(index)}
            flash={flash && flash.id === square.libraryItemId ? flash.n : 0}
          />
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <li key={`empty-${i}`} className="flex h-10 items-center gap-2.5 border-b border-border/60 pr-2 pl-4" data-testid="empty-square">
            <span className="w-5 shrink-0 text-right text-[13px] text-muted-foreground tabular-nums">{filled + i + 1}</span>
            <span className="mr-9 flex h-7 flex-1 items-center rounded-md border-[1.5px] border-dashed border-border px-2.5 text-[13px] text-muted-foreground">
              Empty
            </span>
          </li>
        ))}
      </ul>

      <div className="space-y-3 border-t px-4 py-3">
        {draft.poolIds && (
          <p className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
            <span>
              Filling From This Card&rsquo;s <span className="tabular-nums text-foreground">{draft.poolIds.length}</span> Items
            </span>
            <Button variant="link" className={cn(BTN, 'h-auto px-0 text-[13px]')} onClick={() => store().useWholeLibrary()}>
              Use Whole Library
            </Button>
          </p>
        )}

        <div className="flex items-center gap-2">
          {/* Split button: the face fills, the caret opens the game mix. Amber,
              because it is the one control that changes squares on its own. */}
          <div className="flex min-w-0 flex-1">
            <Button
              className={cn(BTN, 'min-w-0 flex-1 rounded-r-none bg-accent/20 text-accent hover:bg-accent/30')}
              onClick={() => store().fillEmpty()}
              disabled={!canFill}
              data-testid="fill-empty"
            >
              <Dices strokeWidth={1.75} />
              {empty > 0 ? (
                <span className="truncate">
                  Fill <span className="tabular-nums">{empty}</span> Empty Randomly
                </span>
              ) : (
                'Card Is Full'
              )}
            </Button>
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    className={cn(BTN, 'ml-0.5 rounded-l-none bg-accent/20 px-2.5 text-accent hover:bg-accent/30')}
                    disabled={!canFill}
                    aria-label="Choose The Game Mix"
                    data-testid="fill-mix"
                  />
                }
              >
                <ChevronDown strokeWidth={1.75} />
              </PopoverTrigger>
              {/* Wide enough that "Modern Warfare 2019" and "Rocket League" sit on the split slider untruncated. */}
              <PopoverContent className="w-[26rem] space-y-2">
                <MixControl
                  lanes={lanes}
                  games={games}
                  counts={fillPreview}
                  available={fillable}
                  capped={capped}
                  slots={empty}
                  onChange={(next) => store().setMix(next)}
                />
                <p className="text-[13px] text-muted-foreground">
                  Only the empty squares change. Everything already on the card stays put.
                </p>
              </PopoverContent>
            </Popover>
          </div>
          <Button variant="ghost" className={cn(BTN, 'text-muted-foreground')} disabled={filled === 0} onClick={() => setConfirmClear(true)}>
            Clear Card
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-[13px] text-muted-foreground" data-testid="save-hint">
            {short ? (
              <>
                <span className="tabular-nums text-foreground">{empty}</span> {empty === 1 ? 'Square' : 'Squares'} To Go
              </>
            ) : nameBlank ? (
              'Name The Card To Save It'
            ) : null}
          </p>
          {/* One primary action: hosting is what a finished card is for. Save
              Card sits beside it as the secondary, at the same height. */}
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" className={BTN} disabled={short || nameBlank || saving} onClick={onSave}>
              {saving && <Loader2 className="animate-spin" />}
              Save Card
            </Button>
            <Button className={BTN_PRIMARY} disabled={short} onClick={onHost}>
              Host This Card
            </Button>
          </div>
        </div>
      </div>

      {hostCard && <CreateRoomDialog open={hostOpen} onOpenChange={setHostOpen} card={hostCard} />}

      <ConfirmDialog
        open={replaceTarget !== null}
        onOpenChange={(open) => { if (!open) setReplaceTarget(null); }}
        title={`Replace “${replaceTarget?.name ?? ''}”?`}
        body="Your saved card with this name is overwritten by this one."
        confirmLabel="Replace"
        onConfirm={async () => { if (replaceTarget) await save(replaceTarget.id); }}
      />
      {/* Clearing throws away hand-picked squares in one click, so it asks once. */}
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear the card?"
        body={`All ${filled} squares come off. Your library is not touched.`}
        confirmLabel="Clear Card"
        destructive
        onConfirm={() => store().clearCard()}
      />
    </section>
  );
}

function SquareRow({
  number,
  square,
  game,
  onRemove,
  flash = 0,
}: {
  number: number;
  square: SquareItem;
  game: Tag | null;
  onRemove: () => void;
  /** Non-zero right after this item is added from the left; a new number replays the fade. */
  flash?: number;
}) {
  return (
    <li
      className="relative isolate flex h-10 items-center gap-2.5 border-b border-border/60 pr-2 pl-4 transition-colors duration-150 hover:bg-muted/40"
      data-library-id={square.libraryItemId}
    >
      {flash > 0 && <span key={flash} aria-hidden className="item-flash pointer-events-none absolute inset-0 -z-10" />}
      <span className="w-5 shrink-0 text-right text-[13px] text-muted-foreground tabular-nums">{number}</span>
      <GameGlyph game={game} />
      <span className="min-w-0 flex-1 truncate text-sm" title={square.text}>
        {square.text}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn(BTN, 'text-muted-foreground hover:bg-destructive/20 hover:text-destructive')}
        onClick={onRemove}
        aria-label={`Remove ${square.text}`}
        title="Remove From Card"
      >
        <X strokeWidth={1.75} />
      </Button>
    </li>
  );
}
