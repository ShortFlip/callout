'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { parseImport } from '@/lib/game/import';
import { planImport } from '@/lib/library/card-draft';
import { notify } from '@/lib/library/notify';
import { sameName } from '@/lib/library/api';
import { useLibraryStore } from '@/stores/libraryStore';
import { BTN, BTN_PRIMARY, GameGlyph, chipClass } from './GameGlyph';
import { NewGameDialog } from './TagDialogs';

// Select values are strings; these two stand in for "no game" and the
// "New Game…" action so they can never collide with a tag's uuid.
const NO_GAME = '__none';
const NEW_GAME = '__new';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Import List: paste → parseImport → a game and extra tags for everything
 * pasted → "22 added, 2 already in your library". The count updates as you
 * type, checked against the library already loaded on the page.
 */
export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const items = useLibraryStore((s) => s.items);
  const tags = useLibraryStore((s) => s.tags);
  const importList = useLibraryStore((s) => s.importList);
  const createTag = useLibraryStore((s) => s.createTag);

  const [text, setText] = useState('');
  const [game, setGame] = useState<string>(NO_GAME);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [newGameOpen, setNewGameOpen] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tagName, setTagName] = useState('');
  const [busy, setBusy] = useState(false);

  const games = tags.filter((t) => t.kind === 'game');
  const extraTags = tags.filter((t) => t.kind === 'tag');

  const parsed = useMemo(() => parseImport(text), [text]);
  const plan = useMemo(() => planImport(parsed, items.map((i) => i.text)), [parsed, items]);

  const selectItems = useMemo(() => {
    const map: Record<string, string> = { [NO_GAME]: 'No Game', [NEW_GAME]: 'New Game…' };
    for (const g of games) map[g.id] = g.name;
    return map;
  }, [games]);

  function reset() {
    setText('');
    setGame(NO_GAME);
    setTagIds([]);
    setAddingTag(false);
    setTagName('');
  }

  function close(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function addInlineTag() {
    const name = tagName.trim();
    if (!name) return;
    const existing = tags.find((t) => sameName(t.name, name));
    if (existing) {
      if (existing.kind === 'tag') setTagIds((ids) => (ids.includes(existing.id) ? ids : [...ids, existing.id]));
      else notify.error(`You already have a tag called “${existing.name}”.`);
      setTagName('');
      setAddingTag(false);
      return;
    }
    const tag = await createTag({ name, kind: 'tag' });
    if (!tag) return;
    setTagIds((ids) => [...ids, tag.id]);
    setTagName('');
    setAddingTag(false);
  }

  async function submit() {
    if (plan.fresh.length === 0) return;
    setBusy(true);
    const result = await importList(parsed, game === NO_GAME ? null : game, tagIds);
    setBusy(false);
    if (!result) return;
    notify.success(
      result.skipped > 0
        ? `${result.added} added, ${result.skipped} already in your library`
        : `${result.added} added`,
    );
    close(false);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold">Import List</DialogTitle>
          <DialogDescription>Anything already in your library is skipped.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Textarea
              aria-label="Items To Import"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="One item per line, or separated by commas"
              className="min-h-40 max-h-64 overflow-y-auto text-sm"
              autoFocus
            />
            <p className="text-[13px] text-muted-foreground" data-testid="import-count">
              <span className="tabular-nums text-foreground">{parsed.length}</span> Items Found
              {plan.skipped > 0 && (
                <>
                  {' · '}
                  <span className="tabular-nums text-foreground">{plan.skipped}</span> Already In Your Library
                </>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Game</Label>
            <Select
              items={selectItems}
              value={game}
              onValueChange={(value) => {
                if (value === NEW_GAME) setNewGameOpen(true);
                else if (typeof value === 'string') setGame(value);
              }}
            >
              <SelectTrigger className="w-60 transition-colors duration-150 hover:bg-muted/40" aria-label="Game">
                <SelectValue>
                  {(value: string) => {
                    const tag = games.find((g) => g.id === value);
                    return (
                      <>
                        <GameGlyph game={tag} />
                        {tag ? tag.name : 'No Game'}
                      </>
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GAME}>
                  <GameGlyph game={null} />
                  No Game
                </SelectItem>
                {games.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    <GameGlyph game={g} />
                    {g.name}
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value={NEW_GAME}>
                  <Plus className="size-4" strokeWidth={1.75} />
                  New Game…
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Extra Tags</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {extraTags.map((t) => {
                const on = tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    className={chipClass(on)}
                    onClick={() => setTagIds((ids) => (on ? ids.filter((x) => x !== t.id) : [...ids, t.id]))}
                  >
                    {on && <Check className="size-3.5" strokeWidth={1.75} />}
                    {t.name}
                  </button>
                );
              })}
              {addingTag ? (
                <form
                  className="flex items-center gap-1.5"
                  onSubmit={(e) => { e.preventDefault(); void addInlineTag(); }}
                >
                  <Input
                    value={tagName}
                    onChange={(e) => setTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        // Close the inline field, not the whole dialog.
                        e.stopPropagation();
                        setAddingTag(false);
                        setTagName('');
                      }
                    }}
                    placeholder="Tag Name"
                    aria-label="New Tag Name"
                    className="h-8 w-36 rounded-full text-[13px]"
                    maxLength={40}
                    autoFocus
                  />
                  <Button type="submit" variant="outline" className={`${BTN} h-8 rounded-full`} disabled={!tagName.trim()}>
                    Add
                  </Button>
                </form>
              ) : (
                <button type="button" className={chipClass(false)} onClick={() => setAddingTag(true)}>
                  <Plus className="size-3.5" strokeWidth={1.75} />
                  New Tag
                </button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className={BTN} onClick={() => close(false)}>
            Cancel
          </Button>
          <Button className={BTN_PRIMARY} disabled={plan.fresh.length === 0 || busy} onClick={() => void submit()}>
            {busy && <Loader2 className="animate-spin" />}
            Import
          </Button>
        </DialogFooter>

        {/* Nested so choosing "New Game…" layers over this dialog instead of closing it. */}
        <NewGameDialog
          open={newGameOpen}
          onOpenChange={setNewGameOpen}
          onCreated={(tag) => setGame(tag.id)}
        />
      </DialogContent>
    </Dialog>
  );
}
