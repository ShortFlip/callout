import type { User } from '@supabase/supabase-js';

/*
 * Sign in with Discord. A Discord login is the same on every PC, so it is the
 * identity that cannot drift the way a localStorage browser_id did (five rows
 * for one person by the Callout rename). The player row is found by auth_id;
 * public.link_player hands an existing row to the login the first time.
 */

/** What Callout shows and syncs from a Discord login. */
export interface DiscordProfile {
  /** Discord display name, falling back to the username. */
  name: string;
  /** Discord CDN avatar, or null when the user has Discord's default one. */
  avatarUrl: string | null;
}

/**
 * The Discord profile behind this session, or null for an anonymous one.
 *
 * Supabase copies Discord's fields into user_metadata on every sign-in, so the
 * avatar here is as fresh as the last sign-in. `custom_claims.global_name` is
 * the display name people see in Discord; `full_name`/`name` are the username,
 * which older accounts carry with a `#0` discriminator.
 */
export function discordProfile(user: User | null | undefined): DiscordProfile | null {
  if (!user || user.is_anonymous) return null;
  const providers: unknown = user.app_metadata?.providers;
  const isDiscord =
    user.app_metadata?.provider === 'discord' ||
    (Array.isArray(providers) && providers.includes('discord'));
  if (!isDiscord) return null;

  const meta = user.user_metadata ?? {};
  const raw =
    meta.custom_claims?.global_name ?? meta.full_name ?? meta.name ?? 'Discord user';
  const avatar = meta.avatar_url ?? meta.picture ?? null;
  return {
    name: String(raw).replace(/#0$/, ''),
    avatarUrl: typeof avatar === 'string' && avatar ? avatar : null,
  };
}

/**
 * A failed OAuth round-trip comes back as error params on our own URL (query
 * for the PKCE flow, hash for some provider errors). Supabase ignores them when
 * there is no code, so read them here, strip them so a reload does not repeat
 * the toast, and return the human-readable part.
 */
export function takeOAuthError(url: URL): { message: string; cleaned: string } | null {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const read = (key: string) => url.searchParams.get(key) ?? hash.get(key);
  const error = read('error') ?? read('error_code');
  if (!error) return null;

  const message = read('error_description') ?? error;
  for (const key of ['error', 'error_code', 'error_description']) {
    url.searchParams.delete(key);
    hash.delete(key);
  }
  const rest = hash.toString();
  url.hash = rest ? `#${rest}` : '';
  return { message: message.replace(/\+/g, ' '), cleaned: url.toString() };
}
