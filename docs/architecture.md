# Architecture — Callout

Moved verbatim from CLAUDE.md on 2026-10-12 so it stops loading every turn. The rules stay in CLAUDE.md.

## Data Flow
```
Browser (Player) ←→ Supabase Realtime Channel ←→ Browser (Host)
                          ↕
                    Supabase PostgreSQL
```

No server code runs in the game loop. Win verification is **client-side**: the
claimant's own tab detects the pattern, claims it, and the claim is broadcast to
everyone. There is no Edge Function and no server authority over the result.
That is a deliberate call for a three-friend honor-system game — see decision 0002 and issue #1.

## Real-time Game Sync
Each game room subscribes to a Supabase Realtime channel: `room:{roomCode}`.
Broadcasts are sent from `RoomClient.tsx` and received in `useRealtimeRoom`:
`game_started`, `item_called`, `mark_updated`, `bingo_confirmed` (sent by the
winner's own tab), `bingo_retracted` (the winner unmarked), `cards_swapped`,
`style_changed`, `room_closed`. Join/leave is Presence `sync`. A
`postgres_changes` subscription on `rooms` and `games` replays a missed broadcast.
The payload types live in `useRealtimeRoom.ts`.

**Authority model:** Host is the source of truth for game progression. Only the host can call items and reset rounds.

## Identity, cards, wins
- Identity is a Discord login: the player is found by `auth_id`, and anyone
  not signed in sees `SignInWall`. A browser's first sign-in links the row its
  `browserId` (or a `?claim=` link) points at; after that the browser does not
  matter. Anonymous play survives only behind `NEXT_PUBLIC_ALLOW_ANONYMOUS`,
  which `.env.mock` sets for the mock (decision 0007).
- **Seed-based RNG:** Use a seeded PRNG (e.g., `mulberry32`) so each player's card is reproducible from `(templateId, gameSeed, playerId)`. Every round draws N² items from the template's pool (Fisher-Yates, or column-locked); the card is also stored in `game_players.card_data`.

## Win Detection
Runs in the browser on every mark (`src/lib/game/win-detection.ts`). Checks the
player's marks against each enabled pattern:
- **Row / Column / Diagonal / Four Corners / Blackout**; `custom` is typed but
  matches nothing yet (`matchesPattern` returns false)
- `bestLine()` returns the closest incomplete line, which drives the "one away"
  label, the hot lane on my board, and every rail miniature's status

A detected win auto-claims — there is no BINGO button. The round keeps running
so second place can still happen.

The schema is `supabase/migrations/` plus the generated `src/lib/supabase/types.ts`.
