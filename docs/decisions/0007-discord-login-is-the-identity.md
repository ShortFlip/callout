# A Discord login is the identity; the browser is the fallback

- **Date:** 2026-10-07
- **Symptom:** Identity was a localStorage `browser_id` plus an anonymous session, so every new PC, cleared cache or origin change made a new `players` row. By the Callout rename (#70) Ryann had five rows; a manual SQL merge collapsed them to three players.
- **Measurement:** 5 rows for one person before the 2026-10-07 merge.
- **Rule:** A Discord session finds its player by `players.auth_id`, never by `browser_id`. A row changes hands only through `public.link_player`, which refuses anonymous callers, callers who already own a row, and rows owned by another real login. Linked players always wear their Discord avatar. Sign-in is optional until all three friends are linked; then a follow-up makes it required, removes the claim-code UI and adds a unique index on `players.auth_id` (approved 2026-10-07).
- **Code site:** `src/components/game/PlayerProvider.tsx` (`resolveDiscordPlayer`), `src/lib/auth/discord.ts`, `src/components/game/ProfileModal.tsx`, `src/components/game/DisplayNameDialog.tsx`, `supabase/migrations/20261007000000_link_player.sql`

## Note

The obvious shape, `linkIdentity` on the existing anonymous user, does not work here: after the rename most rows are owned by anonymous sessions on the old origin that nobody holds, and "players: owner can update" lets only the current owner change a row. So the browser signs in to Discord as a fresh user and `link_player` (security definer, its own guards) hands the row over. Supabase's "manual linking" setting is not needed.

The anonymous claim code still only repoints `browser_id`, so a claimed browser cannot edit Library items it owns until it signs in with Discord. That is the fix, not a claim-code change.
