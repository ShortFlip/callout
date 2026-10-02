'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GAME_COLORS, GAME_COLOR_KEYS, GAME_ICONS, GAME_ICON_KEYS } from '@/lib/game-colors';
import { sameName } from '@/lib/library/api';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/stores/libraryStore';
import { BTN, BTN_PRIMARY, GameGlyph } from './GameGlyph';
import type { GameColorKey, GameIconKey, Tag } from '@/types/library';

const titleCase = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

/** The clash message, shown before the insert so the DB's unique index is only the backstop. */
function useNameClash(name: string): string | null {
  const tags = useLibraryStore((s) => s.tags);
  const clash = tags.find((tag) => sameName(tag.name, name));
  return clash ? `You already have a tag called “${clash.name}”.` : null;
}

interface TagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new tag after it is created (the dialog closes itself). */
  onCreated?: (tag: Tag) => void;
}

/** New Game: name, colour and icon, all three required. */
export function NewGameDialog({ open, onOpenChange, onCreated }: TagDialogProps) {
  const createTag = useLibraryStore((s) => s.createTag);
  const [name, setName] = useState('');
  const [color, setColor] = useState<GameColorKey | null>(null);
  const [icon, setIcon] = useState<GameIconKey | null>(null);
  const [busy, setBusy] = useState(false);
  const clash = useNameClash(name);
  const ready = name.trim().length > 0 && !!color && !!icon && !clash;

  function reset() {
    setName('');
    setColor(null);
    setIcon(null);
  }

  async function submit() {
    if (!ready) return;
    setBusy(true);
    const tag = await createTag({ name, kind: 'game', color, icon });
    setBusy(false);
    if (!tag) return;
    reset();
    onOpenChange(false);
    onCreated?.(tag);
  }

  // A live preview of the game as it will read in the list.
  const preview: Tag | null = color && icon
    ? { id: 'preview', ownerId: '', name, kind: 'game', color, icon, logoUrl: null }
    : null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold">New Game</DialogTitle>
          <DialogDescription>A game gives its items a colour and an icon on the board.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
        >
          <div className="space-y-2">
            <Label htmlFor="new-game-name">Name</Label>
            <Input
              id="new-game-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Rocket League"
              maxLength={40}
              autoFocus
              aria-invalid={!!clash}
            />
            {clash && <p className="text-[13px] text-destructive">{clash}</p>}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium" id="new-game-colour">Colour</p>
            <div className="flex gap-2.5" role="radiogroup" aria-labelledby="new-game-colour">
              {GAME_COLOR_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={color === key}
                  aria-label={titleCase(key)}
                  title={titleCase(key)}
                  onClick={() => setColor(key)}
                  className={cn(
                    'size-8 rounded-full outline-none transition-[box-shadow,transform] duration-150',
                    'ring-offset-2 ring-offset-popover hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-50',
                    'focus-visible:ring-3 focus-visible:ring-ring/60',
                    color === key && 'ring-2 ring-foreground',
                  )}
                  style={{ backgroundColor: GAME_COLORS[key] }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium" id="new-game-icon">Icon</p>
            <div className="flex gap-2" role="radiogroup" aria-labelledby="new-game-icon">
              {GAME_ICON_KEYS.map((key) => {
                const Icon = GAME_ICONS[key];
                const label = key === 'gamepad' ? 'Gamepad' : titleCase(key);
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={icon === key}
                    aria-label={label}
                    title={label}
                    onClick={() => setIcon(key)}
                    className={cn(
                      'grid size-10 place-items-center rounded-md border outline-none transition-colors duration-150',
                      'focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
                      icon === key
                        ? 'border-primary bg-primary/15'
                        : 'border-border hover:bg-muted/60 active:bg-muted',
                    )}
                  >
                    <Icon
                      strokeWidth={1.75}
                      className="size-4"
                      style={{ color: color ? GAME_COLORS[color] : undefined }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex h-6 items-center gap-2 text-sm text-muted-foreground">
            {preview && name.trim() ? (
              <>
                <GameGlyph game={preview} />
                <span className="text-foreground">{name.trim()}</span>
              </>
            ) : (
              <span className="text-[13px]">Name it, pick a colour and an icon.</span>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" className={BTN} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className={BTN_PRIMARY} disabled={!ready || busy}>
              {busy && <Loader2 className="animate-spin" />}
              Create Game
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** New Tag: a name only. Extra tags filter the library; they never show on the board. */
export function NewTagDialog({ open, onOpenChange, onCreated }: TagDialogProps) {
  const createTag = useLibraryStore((s) => s.createTag);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const clash = useNameClash(name);
  const ready = name.trim().length > 0 && !clash;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    const tag = await createTag({ name, kind: 'tag' });
    setBusy(false);
    if (!tag) return;
    setName('');
    onOpenChange(false);
    onCreated?.(tag);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) setName(''); onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold">New Tag</DialogTitle>
          <DialogDescription>Tags like Mechanics or Clutch filter your library.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="space-y-2">
            <Label htmlFor="new-tag-name">Name</Label>
            <Input
              id="new-tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mechanics"
              maxLength={40}
              autoFocus
              aria-invalid={!!clash}
            />
            {clash && <p className="text-[13px] text-destructive">{clash}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className={BTN} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className={BTN_PRIMARY} disabled={!ready || busy}>
              {busy && <Loader2 className="animate-spin" />}
              Create Tag
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A plain yes/no for the two destructive moments: deleting items and replacing a saved card. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold">{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className={BTN} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            className={destructive ? BTN : BTN_PRIMARY}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
              onOpenChange(false);
            }}
          >
            {busy && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
