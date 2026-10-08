'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { getBrowserId, setBrowserId } from '@/lib/utils/browser-id';
import { usePlayerStore } from '@/stores/playerStore';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { DisplayNameDialog } from './DisplayNameDialog';
import { ProfileModal } from './ProfileModal';
import { getSavedTheme, applyTheme } from '@/lib/theme';
import { ServerUnreachable } from '@/components/layout/ServerUnreachable';
import { withRetry } from '@/lib/utils/retry';
import type { Player } from '@/types/player';

// Identity gates every page, so it retries briefly (~3.5 s) before admitting
// the server is unreachable, rather than the rejoin path's ~15 s.
const IDENTITY_RETRY_DELAYS_MS = [500, 1000, 2000];

interface PlayerProviderProps {
  children: React.ReactNode;
}

/**
 * Resolves player identity on mount and gates the app behind a display
 * name prompt if this is the user's first visit.
 *
 * Flow:
 * 1. Ensure we have a Supabase auth session — sign in anonymously if not
 * 2. Apply a ?claim= link if there is one, then get (or create) the browser
 *    UUID from localStorage
 * 3. Look up existing player record by browser_id
 * 4. If found → load into store, done
 * 5. If not found → show DisplayNameDialog → create player → load into store
 * 6. If the lookup itself failed → show ServerUnreachable with a retry. A
 *    failed read is NOT "not found": prompting a returning friend for a name
 *    would then hit the unique browser_id on insert and loop on an error.
 */
export function PlayerProvider({ children }: PlayerProviderProps) {
  const { player, setPlayer, setLoading } = usePlayerStore();
  const [needsName, setNeedsName] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    // Restore saved theme on every page load
    applyTheme(getSavedTheme());
    initPlayer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function initPlayer() {
    const supabase = createClient();

    // Ensure we always have a Supabase auth session.
    // Anonymous sessions give us an auth.uid() for RLS without requiring sign-up.
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.error('Anonymous sign-in failed:', error.message);
      } else {
        session = data.session;
      }
    }

    // A claim link (?claim=CODE) has to run before the browserId is read, so a
    // friend who clicks it lands as their own player and never sees the name
    // prompt, which would otherwise leave a throwaway player row behind.
    await applyClaimLink(supabase);
    const browserId = getBrowserId();

    // Look for an existing player tied to this browser. `error` and "no row"
    // are separate answers — see step 6 above. Through an RPC because
    // browser_id and claim_code are not readable on the table (migration
    // 20261007000000): knowing your browser_id is what proves the row is yours.
    const lookup = await withRetry<Player | null>(async () => {
      const { data, error } = await supabase
        .rpc('get_my_player', { p_browser_id: browserId })
        .maybeSingle();
      if (error) {
        console.error('Failed to look up player:', error);
        return { ok: false };
      }
      return { ok: true, value: data };
    }, IDENTITY_RETRY_DELAYS_MS);

    if (!lookup.ok) {
      // isLoading stays true so no page acts on a missing player meanwhile.
      setUnreachable(true);
      return;
    }
    setUnreachable(false);
    const player = lookup.value;

    if (player) {
      // If the player was created before anonymous auth was enabled their
      // auth_id will be null. Backfill it now so RLS ownership checks work.
      if (!player.auth_id && session?.user.id) {
        const { error: backfillError } = await supabase
          .from('players')
          .update({ auth_id: session.user.id })
          .eq('id', player.id);
        // Not fatal — the player can still play; the backfill retries next load.
        if (backfillError) console.error('Failed to backfill auth_id:', backfillError);
        setPlayer({ ...player, auth_id: session.user.id });
      } else {
        setPlayer(player);
      }
    } else {
      // First visit — stop the loading spinner and show the name prompt
      setLoading(false);
      setNeedsName(true);
    }
  }

  /**
   * Point this browser at the player whose claim code is in the URL, the same
   * read-only re-point ProfileModal's Claim does, then drop the param so a
   * refresh or a copied address bar never re-claims.
   */
  async function applyClaimLink(supabase: ReturnType<typeof createClient>) {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('claim')?.trim().toUpperCase();
    if (!code) return;

    url.searchParams.delete('claim');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);

    try {
      const { data, error } = await supabase
        .from('players')
        .select('browser_id, display_name')
        .eq('claim_code', code)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.error('That link’s code didn’t match a player');
        return;
      }
      setBrowserId(data.browser_id);
      toast.success(`Welcome back, ${data.display_name}`);
    } catch (err) {
      // Fall through to whoever this browser already is; the code still works
      // by hand in the Profile modal.
      console.error('Claim link failed:', err);
      toast.error('Could not check that link. Try again.');
    }
  }

  async function handleNameSubmit(displayName: string) {
    const supabase = createClient();
    const browserId = getBrowserId();

    // Get auth_id from the session we created in initPlayer
    const { data: { session } } = await supabase.auth.getSession();

    // No .select() on the insert: returning '*' would need SELECT on
    // browser_id and claim_code, which the table no longer grants. The new row
    // (with the claim code its trigger filled) comes back through the RPC.
    const { error } = await supabase
      .from('players')
      .insert({
        browser_id: browserId,
        auth_id: session?.user.id ?? null,
        display_name: displayName,
      });

    if (error) throw error; // caught by DisplayNameDialog and shown to user

    const { data: player, error: readError } = await supabase
      .rpc('get_my_player', { p_browser_id: browserId })
      .single();

    if (readError) throw readError;

    setPlayer(player);
    setNeedsName(false);
  }

  // Replaces the page rather than overlaying it: every page below needs a
  // player, and none of them has anything useful to show without one.
  if (unreachable) return <ServerUnreachable onRetry={initPlayer} />;

  return (
    <>
      <DisplayNameDialog open={needsName} onSubmit={handleNameSubmit} />
      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />

      {/* Floating profile button — top-right on every page */}
      {player && (
        <button
          onClick={() => setProfileOpen(true)}
          className="fixed top-3 right-4 z-40 rounded-full ring-2 ring-border hover:ring-primary transition-shadow duration-150"
          aria-label="Edit profile"
        >
          <PlayerAvatar
            playerId={player.id}
            displayName={player.display_name}
            avatarUrl={player.avatar_url}
            size="sm"
          />
        </button>
      )}

      {children}
    </>
  );
}
