/**
 * Our own Supabase Storage, and nothing else.
 *
 * players.avatar_url and a card legend's logoUrl are rows anyone can write, and
 * both are drawn as <img> (and a logo as a CSS mask) on every friend's screen.
 * An outside URL there would make each friend's browser call that host and
 * hand it their IP address. So an image is drawn only when it is a public
 * object in one of our buckets; anything else falls back to initials or the
 * game's icon.
 */

export type StorageBucket = 'avatars' | 'game-logos';

/**
 * The URL itself when it is a public object in `bucket` of our Supabase
 * project, else null. `base` defaults to NEXT_PUBLIC_SUPABASE_URL, which under
 * `npm run dev:mock` is the mock's loopback origin, so its fixtures pass too.
 * Read at call time (not module load) so tests can stub it.
 */
export function ownStorageUrl(
  value: unknown,
  bucket: StorageBucket,
  base: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  if (typeof value !== 'string' || !base) return null;
  let url: URL;
  let project: URL;
  try {
    url = new URL(value);
    project = new URL(base);
  } catch {
    return null;
  }
  // Compare parsed origins, not string prefixes: "https://x.supabase.co.evil.com"
  // starts with "https://x.supabase.co", and URL() also folds any "../" out of
  // the path before the bucket check below.
  if (url.origin !== project.origin) return null;
  if (!url.pathname.startsWith(`/storage/v1/object/public/${bucket}/`)) return null;
  return value;
}

/**
 * The URL itself when it is a Discord CDN user avatar, else null.
 *
 * Linked players wear their Discord avatar (decision 0007). Drawing it makes
 * each friend's browser call Discord's CDN, an exception to the rule above
 * accepted because all three already run Discord, so it learns nothing new.
 * The path is pinned to /avatars/<user id>/<hash>.<ext> so a planted
 * attachment URL on the same host is still refused.
 */
export function discordAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.origin !== 'https://cdn.discordapp.com') return null;
  if (!/^\/avatars\/\d+\/(a_)?[0-9a-f]+\.(png|webp|gif|jpg)$/.test(url.pathname)) return null;
  return value;
}

/** Where a player's avatar lives: their own folder (the storage policy's owner check) and one fixed name. */
export function avatarPath(playerId: string): string {
  return `${playerId}/avatar`;
}

/** Where a game's logo lives: the owner's folder, named by the tag so a re-upload replaces it. */
export function gameLogoPath(ownerPlayerId: string, tagId: string): string {
  return `${ownerPlayerId}/${tagId}.png`;
}
