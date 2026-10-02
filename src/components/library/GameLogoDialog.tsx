'use client';

import { useRef, useState } from 'react';
import { ImageUp, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toLogoPng } from '@/lib/library/logo-image';
import { notify } from '@/lib/library/notify';
import { useLibraryStore } from '@/stores/libraryStore';
import { BTN, BTN_PRIMARY, GameGlyph } from './GameGlyph';
import type { Tag } from '@/types/library';

/** The sizes the logo is really drawn at: chip, library row, board square. */
const PREVIEW_SIZES = [14, 16, 32] as const;

/**
 * Upload or remove one game's logo. The preview shows the logo at the sizes
 * it is actually drawn, on the panel colour, so a logo that turns to mush at
 * 16px is caught here and not on game night.
 */
export function GameLogoDialog({ game, open, onOpenChange }: { game: Tag; open: boolean; onOpenChange: (open: boolean) => void }) {
  const setGameLogo = useLibraryStore((s) => s.setGameLogo);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy('upload');
    try {
      const logo = await toLogoPng(file);
      if (await setGameLogo(game.id, logo)) notify.success(`${game.name} logo saved`);
    } catch {
      notify.error('Could not read that image. Try a PNG or JPG.');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = ''; // so picking the same file again still fires
    }
  }

  async function onRemove() {
    setBusy('remove');
    if (await setGameLogo(game.id, null)) notify.success(`${game.name} logo removed`);
    setBusy(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold">{game.name} Logo</DialogTitle>
          <DialogDescription>
            Shows everywhere {game.name} does: the library, the card, the board and History. A square image works best.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-6 rounded-xl bg-muted/50 px-5 py-4" data-testid="logo-preview">
          {PREVIEW_SIZES.map((size) => (
            <div key={size} className="flex flex-col items-center gap-2">
              <div className="flex size-10 items-center justify-center">
                <GameGlyph game={game} size={size} />
              </div>
              <span className="text-[13px] text-muted-foreground tabular-nums">{size}px</span>
            </div>
          ))}
          <p className="ml-auto self-center text-[13px] text-muted-foreground">
            {game.logoUrl ? 'Current Logo' : 'No Logo Yet'}
          </p>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => void onPick(e.target.files?.[0])}
        />

        <DialogFooter>
          {game.logoUrl && (
            <Button variant="ghost" className={BTN} disabled={busy !== null} onClick={() => void onRemove()}>
              {busy === 'remove' ? <Loader2 className="animate-spin" /> : <Trash2 strokeWidth={1.75} />}
              Remove Logo
            </Button>
          )}
          <Button className={BTN_PRIMARY} disabled={busy !== null} onClick={() => fileRef.current?.click()}>
            {busy === 'upload' ? <Loader2 className="animate-spin" /> : <ImageUp strokeWidth={1.75} />}
            {game.logoUrl ? 'Replace Logo' : 'Upload Logo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
