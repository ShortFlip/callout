'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { getBrowserId, setBrowserId } from '@/lib/utils/browser-id';
import { discordProfile, takeOAuthError, type DiscordProfile } from '@/lib/auth/discord';
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
 * 1. Get (or create) the browser UUID from localStorage
 * 2. Ensure we have a Supabase auth session — sign in anonymously if not.
 *    A Discord session goes to resolveDiscordPlayer instead (by login, not
 *    by browser) and skips the steps below.
 * 3. Look up existing player record by browser_id
 * 4. If found → load into store, done
 * 5. If not found → show DisplayNameDialog → create player → load into store
 * 6. If the lookup itself failed → show ServerUnreachable with a retry. A
 *    failed read is NOT "not found": prompting a returning friend for a name
 *    would then hit the unique browser_id on insert and loop on an error.
 */
export function PlayerProvider({ children }: PlayerProviderProps) {
  const { player, setPlayer, setLoading, linkedAs, setLinkedAs } = usePlayerStore();
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
    const browserId = getBrowserId();

    // A cancelled or misconfigured Discord sign-in lands back here with error
    // params instead of a code. Say what Discord/Supabase said (the setup
    // rounds need the exact text) and clean the URL so a reload is quiet.
    const oauthError = takeOAuthError(new URL(window.location.href));
    if (oauthError) {
      window.history.replaceState(window.history.state, '', oauthError.cleaned);
      toast.error(`Discord sign-in failed: ${oauthError.message}`);
    }

    // Ensure we always have a Supabase auth session. getSession() also finishes
    // a Discord sign-in: the browser client swaps the ?code= for a session.
    // Anonymous sessions give us an auth.uid() for RLS without requiring sign-up.
    let { data: { session } } = await supabase.auth.getSession();
    const discord = discordProfile(session?.user);
    if (discord && session) {
      await resolveDiscordPlayer(session.user.id, discord);
      return;
    }
    if (!session) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.error('Anonymous sign-in failed:', error.message);
      } else {
        session = data.session;
      }
    }

    // Look for an existing player tied to this browser. `error` and "no row"
    // are separate answers — see step 6 above.
    const lookup = await withRetry<Player | null>(async () => {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('browser_id', browserId)
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
   * Identity for a Discord session: the login, not the browser, finds the row.
   *
   * 1. A row whose auth_id is this login → that's you, on any PC.
   * 2. Else the row this browser already plays as → hand it to the login
   *    (link_player). This is the one-time link on the PC you already use.
   * 3. Else (new browser, or this browser's row belongs to another Discord
   *    login) → ask for a claim code or a new name.
   */
  async function resolveDiscordPlayer(userId: string, discord: DiscordProfile) {
    const supabase = createClient();
    setLinkedAs(discord.name);

    const byLogin = await withRetry<Player | null>(async () => {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('auth_id', userId)
        // No unique index on auth_id yet: oldest row wins if two ever exist.
        .order('created_at')
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error('Failed to look up player by login:', error);
        return { ok: false };
      }
      return { ok: true, value: data };
    }, IDENTITY_RETRY_DELAYS_MS);
    if (!byLogin.ok) {
      setUnreachable(true);
      return;
    }
    setUnreachable(false);

    let player = byLogin.value;
    if (!player) {
      const { data: here, error } = await supabase
        .from('players')
        .select('*')
        .eq('browser_id', getBrowserId())
        .maybeSingle();
      if (error) {
        console.error('Failed to look up player by browser:', error);
        setUnreachable(true);
        return;
      }
      if (here && (await linkPlayer(here.id))) player = { ...here, auth_id: userId };
    }

    if (!player) {
      setLoading(false);
      setNeedsName(true);
      return;
    }

    // Keep this browser pointed at the row too, so the anonymous fallback and
    // the Rejoin chip agree with the login if the session is ever lost.
    if (player.browser_id !== getBrowserId()) setBrowserId(player.browser_id);

    // Linked players always wear their Discord avatar (his call: uniform with
    // Discord). Refreshed on each load from the last sign-in's metadata.
    if (discord.avatarUrl && discord.avatarUrl !== player.avatar_url) {
      const { error } = await supabase
        .from('players')
        .update({ avatar_url: discord.avatarUrl })
        .eq('id', player.id);
      if (error) console.error('Failed to sync Discord avatar:', error);
      else player = { ...player, avatar_url: discord.avatarUrl };
    }
    setPlayer(player);
  }

  /** Hand a player row to the signed-in Discord login. False when refused. */
  async function linkPlayer(playerId: string): Promise<boolean> {
    const { data, error } = await createClient().rpc('link_player', { p_player_id: playerId });
    if (error) {
      console.error('link_player failed:', error);
      return false;
    }
    return data === true;
  }

  /**
   * Claim-code path of the first-sign-in prompt: the code names the row, the
   * login takes it. Returns a message for the dialog, or null on success.
   */
  async function handleCodeSubmit(code: string): Promise<string | null> {
    const { data, error } = await createClient()
      .from('players')
      .select('id')
      .eq('claim_code', code)
      .maybeSingle();
    if (error) return 'Could not check that code. Try again.';
    if (!data) return 'No player has that code.';
    if (!(await linkPlayer(data.id))) return 'That player is already signed in with another Discord account.';
    setNeedsName(false);
    await initPlayer();
    return null;
  }

  async function handleNameSubmit(displayName: string) {
    const supabase = createClient();

    // Get auth_id from the session we created in initPlayer
    const { data: { session } } = await supabase.auth.getSession();

    // A new Discord player may be on a browser whose browser_id another
    // player's row already holds (unique), so give them a fresh one.
    let browserId = getBrowserId();
    if (discordProfile(session?.user)) {
      browserId = crypto.randomUUID();
      setBrowserId(browserId);
    }

    const { data: player, error } = await supabase
      .from('players')
      .insert({
        browser_id: browserId,
        auth_id: session?.user.id ?? null,
        display_name: displayName,
      })
      .select()
      .single();

    if (error) throw error; // caught by DisplayNameDialog and shown to user

    setPlayer(player);
    setNeedsName(false);
  }

  // Replaces the page rather than overlaying it: every page below needs a
  // player, and none of them has anything useful to show without one.
  if (unreachable) return <ServerUnreachable onRetry={initPlayer} />;

  return (
    <>
      <DisplayNameDialog
        open={needsName}
        onSubmit={handleNameSubmit}
        // Only a Discord login can take a row over, so only it gets the code field.
        onCode={linkedAs ? handleCodeSubmit : undefined}
      />
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
