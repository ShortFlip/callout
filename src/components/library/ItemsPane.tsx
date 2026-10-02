'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Flame, Plus, Search, Tag as TagIcon, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { slotsFor } from '@/lib/game/card-builder';
import { matchesFilter, revealFor } from '@/lib/library/add-item';
import { textKey } from '@/lib/library/card-draft';
import { hitRate } from '@/lib/library/heat';
import { notify } from '@/lib/library/notify';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/stores/libraryStore';
import { AddItemRow } from './AddItemRow';
import { BTN, GameGlyph, HOVER_CONTROL, chipClass } from './GameGlyph';
import { PickMenu } from './GameMenu';
import { ItemRow } from './ItemRow';
import { ConfirmDialog, NewGameDialog, NewTagDialog } from './TagDialogs';
import { GameLogoDialog } from './GameLogoDialog';
import type { LibraryItem, Tag } from '@/types/library';

/** Extra-tag chips shown in the filter row; the rest go behind More Tags. */
const VISIBLE_TAG_CHIPS = 6;

/** How long a row stays lit after Add an Item lands on it; matches .item-flash in globals.css. */
const FLASH_MS = 1200;

/** The left pane: filter chips, search, the bulk bar, Add an Item, and every item. */
export function ItemsPane() {
  const items = useLibraryStore((s) => s.items);
  const tags = useLibraryStore((s) => s.tags);
  const filter = useLibraryStore((s) => s.filter);
  const search = useLibraryStore((s) => s.search);
  const selectedIds = useLibraryStore((s) => s.selectedIds);
  const draft = useLibraryStore((s) => s.draft);
  const heat = useLibraryStore((s) => s.heat);
  // Local UI state: a view preference, not something the card or the DB cares about.
  const [hottestFirst, setHottestFirst] = useState(false);
  const hasHeat = Object.keys(heat).length > 0;
  const setFilter = useLibraryStore((s) => s.setFilter);
  const setSearch = useLibraryStore((s) => s.setSearch);
  const toggleSelected = useLibraryStore((s) => s.toggleSelected);
  const setSelected = useLibraryStore((s) => s.setSelected);
  const clearSelection = useLibraryStore((s) => s.clearSelection);
  const renameItem = useLibraryStore((s) => s.renameItem);
  const setGameFor = useLibraryStore((s) => s.setGameFor);
  const addTagTo = useLibraryStore((s) => s.addTagTo);
  const removeTagFrom = useLibraryStore((s) => s.removeTagFrom);
  const deleteItems = useLibraryStore((s) => s.deleteItems);
  const addItem = useLibraryStore((s) => s.addItem);
  const removeItem = useLibraryStore((s) => s.removeItem);

  const [newGameOpen, setNewGameOpen] = useState(false);
  const [logoOpen, setLogoOpen] = useState(false);
  const [newTagOpen, setNewTagOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The row Add an Item just landed on; n restarts the fade when the same row lights twice.
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const games = useMemo(() => tags.filter((t) => t.kind === 'game'), [tags]);
  const extraTags = useMemo(() => tags.filter((t) => t.kind === 'tag'), [tags]);
  const gameIds = useMemo(() => new Set(games.map((g) => g.id)), [games]);
  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const activeGame = gameById.get(filter) ?? null;

  const gameCounts = useMemo(() => {
    const counts = new Map<string | null, number>();
    for (const item of items) counts.set(item.gameTagId, (counts.get(item.gameTagId) ?? 0) + 1);
    return counts;
  }, [items]);

  const visible = useMemo(() => {
    const needle = textKey(search);
    const shown = items.filter(
      (item) => matchesFilter(item, filter, gameIds) && (!needle || textKey(item.text).includes(needle)),
    );
    if (!hottestFirst || !hasHeat) return shown;
    // Hot first; items with no history sink to the bottom (unknown is not cold).
    // More appearances breaks a tie, since that rate is the better-founded one.
    // Array.sort is stable, so equal items keep the library's own order.
    return [...shown].sort((a, b) => {
      const ra = hitRate(heat[a.id]);
      const rb = hitRate(heat[b.id]);
      if (ra === null || rb === null) return ra === rb ? 0 : ra === null ? 1 : -1;
      return rb - ra || (heat[b.id]?.appearances ?? 0) - (heat[a.id]?.appearances ?? 0);
    });
  }, [items, filter, search, gameIds, hottestFirst, hasHeat, heat]);

  const onCard = useMemo(
    () => new Set(draft.set.map((s) => s.libraryItemId).filter((id): id is string => !!id)),
    [draft.set],
  );
  const cardFull = draft.set.length >= slotsFor(draft.boardSize, draft.freeSpace);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = useMemo(() => items.filter((i) => selected.has(i.id)), [items, selected]);
  const visibleSelected = visible.filter((i) => selected.has(i.id)).length;
  const allVisibleSelected = visible.length > 0 && visibleSelected === visible.length;

  // Stable callbacks so memoised rows only re-render when their own item changes.
  const onSetGame = useCallback((id: string, gameTagId: string | null) => { void setGameFor([id], gameTagId); }, [setGameFor]);
  // One button per row: it adds the item, or takes it back off when it is already on the card.
  const onToggleCard = useCallback(
    (id: string, on: boolean) => { if (on) removeItem(id); else addItem(id); },
    [addItem, removeItem],
  );

  // Make an item Add an Item just saved (or found as a duplicate) visible:
  // drop a search that hides it, go back to All if the filter hides it (he
  // picked another game than the view's), then light its row.
  const reveal = useCallback(
    (item: LibraryItem) => {
      const state = useLibraryStore.getState();
      const plan = revealFor(item, state.filter, state.search, gameIds);
      if (plan.clearSearch) setSearch('');
      if (plan.showAll) setFilter('all');
      setFlash((current) => ({ id: item.id, n: (current?.n ?? 0) + 1 }));
    },
    [gameIds, setSearch, setFilter],
  );

  // After the list has rendered the lit row: bring it into view, and let it go after FLASH_MS.
  useEffect(() => {
    if (!flash) return;
    listRef.current?.querySelector(`[data-item-id="${flash.id}"]`)?.scrollIntoView({ block: 'nearest' });
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const shownTags = extraTags.slice(0, VISIBLE_TAG_CHIPS);
  const moreTags = extraTags.slice(VISIBLE_TAG_CHIPS);
  const activeHiddenTag = moreTags.find((t) => t.id === filter);
  const untagged = gameCounts.get(null) ?? 0;

  async function bulkSetGame(game: Tag | null) {
    const ids = [...selectedIds];
    if (await setGameFor(ids, game?.id ?? null)) {
      notify.success(`${ids.length} ${ids.length === 1 ? 'item' : 'items'} moved to ${game ? game.name : 'No Game'}`);
    }
  }

  const tagsOnSelection = extraTags.filter((t) => selectedItems.some((i) => i.tagIds.includes(t.id)));

  return (
    <section
      aria-label="Items"
      className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card"
    >
      <div className="space-y-3 border-b px-4 pt-4 pb-3">
        {/* Filter chips: All, each game, No Game, then extra tags */}
        <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Filter">
          <button type="button" aria-pressed={filter === 'all'} className={chipClass(filter === 'all')} onClick={() => setFilter('all')}>
            All
          </button>
          {games.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={filter === g.id}
              className={chipClass(filter === g.id)}
              onClick={() => setFilter(g.id)}
            >
              <GameGlyph game={g} size={14} />
              {g.name}
              <span className="font-mono text-muted-foreground">{gameCounts.get(g.id) ?? 0}</span>
            </button>
          ))}
          <button type="button" aria-pressed={filter === 'none'} className={chipClass(filter === 'none')} onClick={() => setFilter('none')}>
            No Game
            <span className="font-mono text-muted-foreground">{untagged}</span>
          </button>

          {shownTags.length > 0 && <span aria-hidden className="w-2" />}
          {shownTags.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={filter === t.id}
              className={cn(chipClass(filter === t.id), 'border-dashed', filter === t.id && 'border-solid')}
              onClick={() => setFilter(t.id)}
            >
              <TagIcon className="size-3.5" strokeWidth={1.75} />
              {t.name}
            </button>
          ))}
          {moreTags.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(chipClass(!!activeHiddenTag), 'border-dashed')}>
                <TagIcon className="size-3.5" strokeWidth={1.75} />
                {activeHiddenTag ? activeHiddenTag.name : 'More Tags'}
                <ChevronDown className="size-3.5" strokeWidth={1.75} />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-72 w-56">
                <DropdownMenuRadioGroup value={activeHiddenTag?.id ?? ''} onValueChange={(id: string) => setFilter(id)}>
                  {moreTags.map((t) => (
                    <DropdownMenuRadioItem key={t.id} value={t.id}>
                      {t.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Search, count, and either the toolbar actions or the bulk bar */}
        <div className="flex h-8 items-center gap-3">
          <Checkbox
            checked={allVisibleSelected}
            indeterminate={visibleSelected > 0 && !allVisibleSelected}
            disabled={visible.length === 0}
            onCheckedChange={() =>
              setSelected(allVisibleSelected ? selectedIds.filter((id) => !visible.some((i) => i.id === id)) : [...new Set([...selectedIds, ...visible.map((i) => i.id)])])
            }
            aria-label="Select All Shown"
            className={HOVER_CONTROL}
          />
          {/* The search narrows while the bulk bar is up so every bulk action fits at 1280. */}
          <div className={cn('relative shrink-0', selectedIds.length > 0 ? 'w-32' : 'w-56')}>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Items"
              aria-label="Search Items"
              className="pl-8 text-sm"
            />
          </div>

          {selectedIds.length > 0 ? (
            <div className="flex min-w-0 flex-1 items-center gap-1.5" data-testid="bulk-bar">
              <span className="shrink-0 text-sm font-medium">
                <span className="font-mono">{selectedIds.length}</span> Selected
              </span>
              <div className="flex-1" />
              <PickMenu
                label="Set Game"
                options={games}
                empty="No Games Yet"
                render={(g) => (
                  <>
                    <GameGlyph game={g} />
                    {g.name}
                  </>
                )}
                onPick={(g) => void bulkSetGame(g)}
                extra={{
                  label: (
                    <>
                      <GameGlyph game={null} />
                      No Game
                    </>
                  ),
                  onPick: () => void bulkSetGame(null),
                }}
              />
              <PickMenu
                label="Add Tag"
                options={extraTags}
                empty="No Tags Yet"
                render={(t) => t.name}
                onPick={(t) => void addTagTo([...selectedIds], t.id)}
              />
              <PickMenu
                label="Remove Tag"
                options={tagsOnSelection}
                empty="No Tags On These"
                render={(t) => t.name}
                onPick={(t) => void removeTagFrom([...selectedIds], t.id)}
              />
              <Button variant="destructive" className={BTN} onClick={() => setConfirmDelete(true)}>
                <Trash2 strokeWidth={1.75} />
                Delete
              </Button>
              {/* Icon-only so all six bulk controls fit on one line at 1280. */}
              <Button
                variant="ghost"
                size="icon"
                className={BTN}
                onClick={clearSelection}
                aria-label="Clear Selection"
                title="Clear Selection"
              >
                <X strokeWidth={1.75} />
              </Button>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <p className="text-[13px] text-muted-foreground" data-testid="item-count">
                {visible.length === items.length ? (
                  <><span className="font-mono text-foreground">{items.length}</span> {items.length === 1 ? 'Item' : 'Items'}</>
                ) : (
                  <><span className="font-mono text-foreground">{visible.length}</span> of <span className="font-mono text-foreground">{items.length}</span> Items</>
                )}
              </p>
              <div className="flex-1" />
              {/* Only once there is history to sort by; before that it would do nothing. */}
              {hasHeat && (
                <Button
                  variant={hottestFirst ? 'secondary' : 'outline'}
                  className={BTN}
                  aria-pressed={hottestFirst}
                  onClick={() => setHottestFirst((on) => !on)}
                  title="Sort By How Often Each Item Gets Marked"
                >
                  <Flame strokeWidth={1.75} />
                  Hottest First
                </Button>
              )}
              {/* With a game's chip picked, its logo is one click away. */}
              {activeGame && (
                <Button variant="outline" className={BTN} onClick={() => setLogoOpen(true)} data-testid="game-logo">
                  <GameGlyph game={activeGame} />
                  {activeGame.logoUrl ? 'Change Logo' : 'Add Logo'}
                </Button>
              )}
              <Button variant="outline" className={BTN} onClick={() => setNewGameOpen(true)}>
                <Plus strokeWidth={1.75} />
                New Game
              </Button>
              {/* Hidden until a tag exists: with none, it's a button nothing on the page uses.
                  Import's Extra Tags still creates the first one. */}
              {extraTags.length > 0 && (
                <Button variant="outline" className={BTN} onClick={() => setNewTagOpen(true)}>
                  <Plus strokeWidth={1.75} />
                  New Tag
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <AddItemRow games={games} onReveal={reveal} />

      {items.length === 0 ? (
        <div className="grid flex-1 place-items-center p-8">
          <div className="space-y-1 text-center" data-testid="empty-library">
            <p className="font-display text-lg font-bold">Your library is empty</p>
            <p className="text-sm text-muted-foreground">Add one above, or paste a list with Import List.</p>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="grid flex-1 place-items-center p-8">
          <p className="text-sm text-muted-foreground">No items match. Try another filter or search.</p>
        </div>
      ) : (
        // Keyed by filter so a new filter starts at the top, not mid-scroll.
        <ul key={filter} ref={listRef} className="min-h-0 flex-1 overflow-y-auto" aria-label="Library Items">
          {visible.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              heat={heat[item.id]}
              game={item.gameTagId ? gameById.get(item.gameTagId) ?? null : null}
              games={games}
              extraTags={extraTags}
              selected={selected.has(item.id)}
              onCard={onCard.has(item.id)}
              cardFull={cardFull}
              onToggleSelected={toggleSelected}
              onRename={renameItem}
              onSetGame={onSetGame}
              onToggleCard={onToggleCard}
              flash={flash?.id === item.id ? flash.n : 0}
            />
          ))}
        </ul>
      )}

      <NewGameDialog open={newGameOpen} onOpenChange={setNewGameOpen} />
      {activeGame && <GameLogoDialog game={activeGame} open={logoOpen} onOpenChange={setLogoOpen} />}
      <NewTagDialog open={newTagOpen} onOpenChange={setNewTagOpen} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${selectedIds.length} ${selectedIds.length === 1 ? 'item' : 'items'}?`}
        body="Saved cards keep their own copies."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const count = selectedIds.length;
          if (await deleteItems([...selectedIds])) {
            notify.success(`Deleted ${count} ${count === 1 ? 'item' : 'items'}`);
          }
        }}
      />
    </section>
  );
}
