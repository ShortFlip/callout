'use client';

import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Camera, Loader2, Copy, KeyRound, LogIn, BadgeCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { usePlayerStore } from '@/stores/playerStore';
import { setBrowserId } from '@/lib/utils/browser-id';
import { copyText } from '@/lib/utils/copy-link';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ThemePicker } from './ThemePicker';
import { PlayerStats } from '@/components/stats/PlayerStats';
import { SECTION_LABEL } from '@/lib/label';

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { player, updatePlayer, linkedAs } = usePlayerStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(player?.display_name ?? '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [claimInput, setClaimInput] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // The modal is also opened from the header, which flips `open` without going
  // through handleOpen — and identity resolves after first render, so the
  // useState initializer above sees a null player. Without this the name field
  // opens blank. (Seen live after a claim-code swap.)
  useEffect(() => {
    if (!open) return;
    setDisplayName(player?.display_name ?? '');
  }, [open, player?.display_name]);

  // Reset local state when modal opens
  function handleOpen(nextOpen: boolean) {
    if (nextOpen) {
      setDisplayName(player?.display_name ?? '');
      setPreviewUrl(null);
      setPendingFile(null);
      setClaimInput('');
    }
    onOpenChange(nextOpen);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show an instant local preview before uploading
    setPreviewUrl(URL.createObjectURL(file));
    setPendingFile(file);
  }

  /**
   * Become an existing player on this machine.
   *
   * Deliberately read-only against the database: we look the row up by code and
   * point THIS browser's localStorage at its browser_id (Decision C). The other
   * machine keeps working, and nothing can be broken by a mistyped code.
   */
  async function handleClaim() {
    if (!player) return;
    const code = claimInput;
    if (code.length !== 8) return;

    setIsClaiming(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('players')
        .select('id, browser_id, display_name')
        .eq('claim_code', code)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast.error('No player has that code');
        return;
      }
      if (data.id === player.id) {
        toast('That’s already you');
        return;
      }

      setBrowserId(data.browser_id);
      toast.success(`Welcome back, ${data.display_name}`);
      // Identity is resolved once on mount, so a reload is the honest way to
      // swap it — every store and every open subscription starts over.
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      console.error('Claim failed:', err);
      toast.error('Could not check that code. Try again.');
    } finally {
      setIsClaiming(false);
    }
  }

  /**
   * Leave for Discord and come back to this same page. PlayerProvider finishes
   * the sign-in on return and links this browser's player to the login.
   */
  async function handleDiscordSignIn() {
    setIsSigningIn(true);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: window.location.href },
    });
    // On success the browser is already navigating away; only a failure stays.
    if (error) {
      console.error('Discord sign-in failed:', error);
      toast.error(`Discord sign-in failed: ${error.message}`);
      setIsSigningIn(false);
    }
  }

  async function handleSave() {
    if (!player) return;
    if (!displayName.trim()) {
      toast.error('Display name cannot be empty.');
      return;
    }

    setIsSaving(true);
    try {
      const supabase = createClient();
      let avatarUrl = player.avatar_url;

      // Upload new avatar if one was selected
      if (pendingFile) {
        const ext = pendingFile.name.split('.').pop() ?? 'jpg';
        // Use player ID as filename so re-uploads replace the old file
        const path = `${player.id}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, pendingFile, { upsert: true, contentType: pendingFile.type });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(path);

        // Bust the CDN cache by appending a timestamp query param
        avatarUrl = `${publicUrl}?t=${Date.now()}`;
      }

      // Persist to DB
      const { error: dbError } = await supabase
        .from('players')
        .update({ display_name: displayName.trim(), avatar_url: avatarUrl })
        .eq('id', player.id);

      if (dbError) throw dbError;

      // Reflect changes in the store immediately — no page reload needed
      updatePlayer({ display_name: displayName.trim(), avatar_url: avatarUrl });
      toast.success('Profile saved.');
      onOpenChange(false);
    } catch (err) {
      console.error('Profile save failed:', err);
      toast.error('Could not save profile. Try again.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!player) return null;

  const currentAvatarUrl = previewUrl ?? player.avatar_url;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      {/* Taller than a 1280×800 window once the stats and badges render, and
          the dialog is centred with no scroll of its own, so its top and its
          badges were cut off. Capped at the viewport, it scrolls instead, with
          the rail's thin scrollbar rather than the bright default. */}
      <DialogContent className="sm:max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.18)_transparent]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Your Profile</DialogTitle>
          <DialogDescription>
            Update your name and photo — your friends will see this in the lobby and game.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">

          {/* Avatar picker */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative group">
              <PlayerAvatar
                playerId={player.id}
                displayName={displayName || player.display_name}
                avatarUrl={currentAvatarUrl}
                size="xl"
              />
              {/* Camera overlay on hover. Linked players wear their Discord
                  avatar (synced every load), so an upload would be overwritten. */}
              {!linkedAs && <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Change Photo"
              >
                <Camera className="w-6 h-6 text-white" />
              </button>}
            </div>
            {linkedAs ? (
              <p className="text-[13px] text-muted-foreground">Photo comes from Discord</p>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[13px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                {currentAvatarUrl ? 'Change Photo' : 'Add a Photo'}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Display name */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Display Name</Label>
            <Input
              id="profile-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={32}
              placeholder="How your friends see you"
            />
          </div>

          {/* Theme */}
          <ThemePicker />

          {/* Discord — the identity that is the same on every PC */}
          <div className="space-y-2">
            <p className={SECTION_LABEL}>Discord</p>
            {linkedAs ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                <BadgeCheck className="w-4 h-4 text-success" strokeWidth={1.75} />
                <span>Linked as <span className="font-semibold">{linkedAs}</span></span>
              </div>
            ) : (
              <>
                <Button className="w-full" onClick={handleDiscordSignIn} disabled={isSigningIn}>
                  {isSigningIn
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <LogIn className="w-4 h-4 mr-2" strokeWidth={1.75} />}
                  Sign in with Discord
                </Button>
                <p className="text-[13px] text-muted-foreground">
                  Be this player on every PC, stats included.
                </p>
              </>
            )}
          </div>

          {/* Claim code — carry this identity to another machine */}
          <div className="space-y-2">
            <p className={SECTION_LABEL}>
              Claim Code
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
              <span className="flex-1 font-mono text-[20px] font-bold tracking-[0.12em]">
                {player.claim_code}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyText(player.claim_code, 'Claim Code Copied')}
                aria-label="Copy Claim Code"
              >
                <Copy className="w-4 h-4" strokeWidth={1.75} />
              </Button>
            </div>
            <p className="text-[13px] text-muted-foreground">
              Enter this on another PC to be you again.
            </p>

            {/* A signed-in browser is found by its Discord login, never by
                browser_id, so pointing it at another row would do nothing. */}
            {!linkedAs && <div className="pt-3 border-t border-border space-y-2">
              <Label htmlFor="claim-input" className="text-sm font-medium">Have a Code?</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="claim-input"
                  value={claimInput}
                  // Same normalization as the room code input: uppercase and
                  // drop the characters the alphabet never produces.
                  onChange={(e) =>
                    setClaimInput(e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 8))
                  }
                  placeholder="XXXXXXXX"
                  className="font-mono tracking-[0.12em] uppercase"
                  maxLength={8}
                />
                <Button
                  variant="outline"
                  onClick={handleClaim}
                  disabled={isClaiming || claimInput.length !== 8}
                >
                  {isClaiming
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <KeyRound className="w-4 h-4 mr-2" strokeWidth={1.75} />}
                  Use Code
                </Button>
              </div>
            </div>}
          </div>

          {/* Stats */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Your Stats</p>
            <PlayerStats
              playerId={player.id}
              displayName={player.display_name}
              avatarUrl={player.avatar_url}
              compact
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !displayName.trim()}>
              {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : 'Save'}
            </Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
