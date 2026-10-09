'use client';

import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

/**
 * Leave for Discord and come back to this same page. PlayerProvider finishes
 * the sign-in on return (the browser client swaps ?code= for a session) and
 * finds or links the player. Resolves only on failure, with the toast already
 * shown; on success the browser is navigating away.
 *
 * Kept apart from discord.ts so that file stays pure and testable without a
 * Supabase client.
 */
export async function signInWithDiscord(): Promise<void> {
  const { error } = await createClient().auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: window.location.href },
  });
  if (error) {
    console.error('Discord sign-in failed:', error);
    toast.error(`Discord sign-in failed: ${error.message}`);
  }
}
