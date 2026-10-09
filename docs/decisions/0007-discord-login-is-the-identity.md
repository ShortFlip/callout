# A Discord login is the identity; the browser is the fallback

- **Date:** 2026-10-07
- **Symptom:** Identity was a localStorage `browser_id` plus an anonymous session, so every new PC, cleared cache or origin change made a new `players` row. By the Callout rename (#70) Ryann had five rows; a manual SQL merge collapsed them to three players.
- **Measurement:** 5 rows for one person before the 2026-10-07 merge.
- **Rule:** A Discord session finds its player by `players.auth_id` (`get_login_player`), never by `browser_id`. A row changes hands only through `public.link_player`, the one exception to #72's write-once `auth_id` (the trigger now refuses only the API roles); it refuses anonymous callers, callers who already own a row, and rows owned by another real login. Linked players always wear their Discord avatar, and `discordAvatarUrl` lets exactly `cdn.discordapp.com/avatars/...` past the own-storage image rule. Sign-in is required (#74 made it optional; the follow-up on 2026-10-09 added `SignInWall`, removed the profile's claim-code section and added a unique index on `players.auth_id`). A `?claim=` link still runs before the wall, and the first-sign-in prompt keeps a claim-code field, as the way back for a browser that forgot its player. Anonymous play exists only behind `NEXT_PUBLIC_ALLOW_ANONYMOUS`, which only `.env.mock` sets.
- **Code site:** `src/components/game/PlayerProvider.tsx` (`resolveDiscordPlayer`), `src/lib/auth/discord.ts`, `src/components/game/ProfileModal.tsx`, `src/components/game/DisplayNameDialog.tsx`, `supabase/migrations/20261007000001_link_player.sql`, `src/lib/storage-url.ts`, `src/components/layout/SignInWall.tsx`, `supabase/migrations/20261009000000_unique_login.sql`

## Note

The obvious shape, `linkIdentity` on the existing anonymous user, does not work here: after the rename most rows are owned by anonymous sessions on the old origin that nobody holds, and "players: owner can update" lets only the current owner change a row. So the browser signs in to Discord as a fresh user and `link_player` (security definer, its own guards) hands the row over. Supabase's "manual linking" setting is not needed.

The anonymous claim code still only repoints `browser_id`, so a claimed browser cannot edit Library items it owns until it signs in with Discord. That is the fix, not a claim-code change.
