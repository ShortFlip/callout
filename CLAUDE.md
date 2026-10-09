# CLAUDE.md — Callout

> A real-time multiplayer bingo platform for small friend groups.

**Callout** is a web-hosted, real-time multiplayer bingo app. A host creates a custom bingo card template, starts a game room, and friends join via a short room code. The host calls items from a caller panel, players mark squares on their synced boards, and the system detects/verifies wins. Game history, leaderboards, and stats persist across sessions. You sign in with Discord: the login is the identity, so you are one player on every PC. No email or passwords.

**Target audience:** 3-5 friends playing recurring bingo nights.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.x — read `AGENTS.md` first |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| UI Components | shadcn/ui | latest |
| State Management | Zustand | 5.x |
| Database | Supabase (PostgreSQL) | - |
| Real-time | Supabase Realtime (WebSocket channels) | - |
| Auth | Supabase Auth (Discord login, required; anonymous only on the mock; no email) | - |
| File Storage | Supabase Storage (images) | - |
| Testing | Vitest | 3.x |
| Hosting | Cloudflare Workers (OpenNext), deployed by GitHub Actions on push to `master` | - |

Versions follow `package.json`; the reasons for the stack are in the decision index below.

---

**Before writing or changing any interface code — read `DESIGN.md`.**
If a request conflicts with DESIGN.md, say so before building.
Part 2 is intentionally incomplete. Do not fill the gap with framework
defaults; follow its guardrails and ask.

## Design Direction

"Arcade Lounge": a neon-lit bowling alley meets game night, playful but polished. Not corporate SaaS, not kiddy. `DESIGN.md` is the binding design system. Colors live in `src/app/globals.css` (oklch theme blocks, six app themes in `src/lib/theme.ts`); do not copy hex values here.

- **Type:** Outfit for display, Plus Jakarta Sans for body and UI (numbers use `tabular-nums`, never mono), JetBrains Mono only for room and claim codes (O/0, I/1).
- **Components:** shadcn/ui as the base; radius caps at 10 (panels 10, cards 8, controls 6); 4px spacing scale; every interactive element has hover, active, focus and disabled states.
- **Motion:** 150ms micro-interactions, 300ms panels and modals. A marked square dabs once and then glows steadily; the bingo banner is the one loud moment. Confetti and sound are non-negotiable.
- **Mode:** dark is the default, light is supported.

---

## Architecture

### Data Flow
```
Browser (Player) ←→ Supabase Realtime Channel ←→ Browser (Host)
                          ↕
                    Supabase PostgreSQL
```

No server code runs in the game loop. Win verification is **client-side**: the
claimant's own tab detects the pattern, claims it, and the claim is broadcast to
everyone. There is no Edge Function and no server authority over the result.
That is a deliberate call for a three-friend honor-system game — see "Next Up".

### Real-time Game Sync
Each game room subscribes to a Supabase Realtime channel: `room:{roomCode}`.
Broadcasts are sent from `RoomClient.tsx` and received in `useRealtimeRoom`:
`game_started`, `item_called`, `mark_updated`, `bingo_confirmed` (sent by the
winner's own tab), `bingo_retracted` (the winner unmarked), `cards_swapped`,
`style_changed`, `room_closed`. Join/leave is Presence `sync`. A
`postgres_changes` subscription on `rooms` and `games` replays a missed broadcast.
The payload types live in `useRealtimeRoom.ts`.

**Authority model:** Host is the source of truth for game progression. Only the host can call items and reset rounds.

### Identity, cards, wins
- Identity is a Discord login: the player is found by `auth_id`, and anyone
  not signed in sees `SignInWall`. A browser's first sign-in links the row its
  `browserId` (or a `?claim=` link) points at; after that the browser does not
  matter. Anonymous play survives only behind `NEXT_PUBLIC_ALLOW_ANONYMOUS`,
  which `.env.mock` sets for the mock (decision 0007).
- **Seed-based RNG:** Use a seeded PRNG (e.g., `mulberry32`) so each player's card is reproducible from `(templateId, gameSeed, playerId)`. Every round draws N² items from the template's pool (Fisher-Yates, or column-locked); the card is also stored in `game_players.card_data`.

### Win Detection
Runs in the browser on every mark (`src/lib/game/win-detection.ts`). Checks the
player's marks against each enabled pattern:
- **Row / Column / Diagonal / Four Corners / Blackout**; `custom` is typed but
  matches nothing yet (`matchesPattern` returns false)
- `bestLine()` returns the closest incomplete line, which drives the "one away"
  label, the hot lane on my board, and every rail miniature's status

A detected win auto-claims — there is no BINGO button. The round keeps running
so second place can still happen.

The schema is `supabase/migrations/` plus the generated `src/lib/supabase/types.ts`.

---

## Project Structure

Directories, plus a note only where the filename does not say it. Tests sit in
`__tests__/` beside the code they cover.

```
callout/
├── src/
│   ├── app/                      # Pages: / (create, join, Rejoin chip), /library,
│   │                             #   /room/[code], /history, /leaderboard; error.tsx
│   │                             #   and not-found.tsx; globals.css = tokens, themes, utilities
│   ├── components/
│   │   ├── board/                # BingoBoard (grid, hot lane), BingoSquare, MiniBoard (rail), GameMark
│   │   ├── game/                 # RoomClient = room state machine + all Supabase writes;
│   │   │                         #   GameLobby, GameView (hero board + rail), WinBanner, GameOver;
│   │   │                         #   CallerPanel/CalledItems are traditional mode only;
│   │   │                         #   PlayerProvider resolves identity at the app root
│   │   ├── home/  library/  stats/
│   │   ├── layout/               # StatusPage (offline/no-room/error screens), SignInWall, LoadError
│   │   │                         #   (failed read + Try Again), CalloutMark (logo)
│   │   └── ui/                   # shadcn primitives + PlayerAvatar, skeleton-rows
│   ├── lib/
│   │   ├── supabase/             # client, server, generated types, paging.ts (reads past 1,000 rows)
│   │   ├── game/                 # Pure rules: shuffle, win-detection, game-setup, restore, retract,
│   │   │                         #   stats, swap-games; own-row.ts = this player's game_players row
│   │   ├── library/  realtime/   # realtime: drop-channel (0006), catch-up reads, send queue key
│   │   ├── auth/discord.ts       # Discord profile from a session (0007)
│   │   ├── auth/sign-in.ts       # signInWithDiscord, shared by the wall and the profile
│   │   ├── utils/                # browser-id, last-room, copy-link, player-color, retry
│   │   ├── storage-url.ts        # Only our own Storage URLs get drawn as images
│   │   ├── keepalive.ts          # Supabase ping for the Worker Cron Trigger (pure, no Next)
│   │   └── dev-state.ts          # `?state=` harness, DEV-only, stripped from prod
│   ├── stores/                   # Zustand: gameStore, playerStore, libraryStore
│   ├── hooks/                    # useRealtimeRoom (the only channel owner), useGameState, usePlayer
│   └── types/
├── supabase/migrations/          # Timestamped SQL, applied by hand (README "Database")
├── scripts/mock-supabase/        # Fake Supabase behind `npm run dev:mock`
├── docs/                         # decisions/ (the index below), audits/, plans/, spec/
├── .design/                      # AUDIT-PUNCHLIST.md, mockups/ (tracked); refs/ gitignored
├── .github/workflows/            # deploy.yml (PR gates, master deploy), keepalive.yml
├── custom-worker.ts              # Worker entry: OpenNext fetch + keepalive Cron handler
└── DESIGN.md, README.md, wrangler.toml, open-next.config.ts, next.config.ts, vitest.config.ts
```

Styling is Tailwind v4 — the theme lives in `globals.css` (`@theme inline`), so
there is no `tailwind.config.ts`. The `game_nights` table exists in the schema
but is unused: a **night is a room**, and `/history` groups by room.

---

## Code Conventions

### General
- **TypeScript strict mode** — no `any` unless absolutely unavoidable (and comment why)
- **Functional components only** — no class components
- **Named exports** — no default exports except for Next.js pages/layouts
- **No barrel files** — import each component from its own file (`@/components/game/GameView`); no `index.ts` exists under `src/`
- **Comments** — explain the "why", not the "what". Add comments for non-obvious logic, game rules, and algorithm choices

### File Naming
- Components: `PascalCase.tsx`
- Utilities/hooks/stores: `camelCase.ts`
- Types: `camelCase.ts` (colocated with feature or in `types/`)

### Component Pattern
`'use client'` when interactive, a named export with a typed `Props` interface, classes merged with `cn()` from `@/lib/utils` (worked example in `docs/spec/component-pattern-example.md`).

### State Management
- **Zustand stores** for game state, editor state, player identity
- **React state** for component-local UI state (modals, inputs, hover)
- **Supabase Realtime** for cross-client sync — events update Zustand stores
- Never put Supabase Realtime subscriptions in components directly — always go through `useRealtimeRoom` hook

### Supabase Patterns
- Use `@supabase/ssr` for server-side operations
- Browser client: `createClient()` in `lib/supabase/client.ts`
- Server client: `createClient()` (async) in `lib/supabase/server.ts`
- Always handle Supabase errors explicitly — never swallow them
- Use generated types from `supabase gen types typescript`

### Error Handling
- Wrap all Supabase calls in try/catch
- Show user-facing errors via toast (shadcn/ui toast or sonner)
- Log errors to console in development
- Never expose raw database errors to users

---

## Environment Variables

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Running locally, type check, lint and migrations: `README.md`.

---

## Deployment

Every PR into `master` runs `.github/workflows/deploy.yml`'s gates (`npm test`,
`tsc --noEmit`, lint, `cf:build`, `wrangler deploy --dry-run`); a push to
`master` runs the same gates and then `wrangler deploy` onto **Cloudflare
Workers**. The `NEXT_PUBLIC_*` Supabase values are repo secrets, baked in at
build time. The Worker entry is `custom-worker.ts`, which wraps OpenNext's
generated `.open-next/worker.js` and adds a daily Cron Trigger that pings
Supabase (`src/lib/keepalive.ts`); its `SUPABASE_URL`/`SUPABASE_ANON_KEY` are
runtime vars passed with `--var` on the master deploy, never committed, and
`keep_vars` stops a local `cf:deploy` from wiping them. There
is no Docker image and nothing runs on Sanctuary — the plan to self-host behind
a Cloudflare tunnel was dropped in favour of Workers.

---

## Testing Strategy

- **Unit tests (in place, gate every PR):** `npm test` runs Vitest over card
  generation and shuffling, game setup, win detection and `bestLine`, the call
  list, the import parser, the card builder, restore, retract, stats, game
  swaps, the player's own `game_players` row (`own-row`), card styles, the
  library (add-item, drafts, heat, hosting, legend, logos), the realtime channel
  drop/catch-up/queue key, retry, paging past the 1,000-row cap, Storage URL
  checks, Discord login parsing, the game and library stores and the keepalive
  ping. Pages and components have none.
- **Screenshots without his live data:** `npm run dev:mock` serves the app on
  :3123 against a local fake Supabase (scripts/mock-supabase/README.md has the
  room codes for Lobby, game, Swap, win and Game Over). Every visual check uses
  it, with anonymous play switched on (`.env.mock`), since the mock has no OAuth;
  a plain `npm run dev` shows the Discord sign-in wall against the LIVE project.
- **Live gates (in place, not in CI):** each phase is proved against two real
  browser contexts via `.playwright-mcp/pw.cjs` (a CDP driver) pointed at the dev
  server, printing `GATE <name>: PASS/FAIL` lines.
- **Not done:** component tests, and a scripted end-to-end run in CI.

---

## Notes

- The name is **Callout** (renamed from Squares, along with the Worker URL, repo and `callout:*` storage keys).
- This is a personal project for 3-5 friends. No need for rate limiting, abuse prevention, or enterprise features in MVP.
- Sound effects and confetti are non-negotiable. They make the game.
- **Desktop only.** Callout lives on a second monitor beside Discord while the
  main monitor is playing something else. Assume ~1280×800 minimum. No mobile work.

---

## Decisions

Read the file before changing the code it names. Each keeps the original text verbatim.

- Stay on Next.js + Supabase Realtime + Zustand + shadcn/ui — no custom socket server, no Redux; versions come from `package.json` — docs/decisions/0001-stack-choices.md
- A win is whatever the claimant's tab detects; no Edge Function, RLS open, and that must change before outsiders join — docs/decisions/0002-client-side-win-verification.md
- Every room keeps a `template_id` (unsaved cards are `saved = false` rows; Remove unsaves, never deletes); owner-only writes check the returned row count; after regenerating types, re-mark `players.Insert.claim_code` optional — docs/decisions/0003-item-library.md
- The card is a list he fills: new cards start empty, Add never evicts, Fill Empty is the only random step, and nothing else moves a square — docs/decisions/0004-card-is-a-list-he-fills.md
- Design audit rulings: captions are Title Case via SECTION_LABEL, radius caps at 10 (panels 10, cards 8, controls 6), loading lists use SkeletonRows and spinners live only in their button — docs/decisions/0005-design-audit-2026-10-04.md
- Discord sign-in is required (anonymous only on the mock); a session finds its player by `auth_id`, never `browser_id`; rows change hands only via `link_player`; one row per login; linked players wear their Discord avatar — docs/decisions/0007-discord-login-is-the-identity.md
- Never call `removeChannel` inside that channel's own status callback; a dropped channel goes through `createChannelDropper` (once, on a microtask) and only its first report moves the backoff — docs/decisions/0006-dropped-channel-removed-once.md

### Plans

- Item Library: built in PRs #25–#29 (tagged items, saved cards, one shared set per night, game icon markers); the build plan's decision log wins over the spec — docs/plans/item-library.md, docs/plans/item-library-build.md

### Original spec

The first-written plan, kept verbatim in `docs/spec/`. Where it disagrees with the code, the code wins.

- Identity is `browserId` + anonymous session + `claim_code`; there is no account, login or merge path — docs/spec/identity-without-login.md
- Cards stay seed-reproducible but `card_data` is what the app reads; `custom` win patterns are unimplemented — docs/spec/seeded-cards-and-win-patterns.md
- The migrations and `types.ts` are the schema, not the planned table list; RLS is open, `game_nights` unused — docs/spec/database-schema-as-planned.md
- The Phase 1–5 plan is history: where it disagrees with the code, the code wins; ask before building a plan item — docs/spec/original-phase-plan.md
- Import `cn` from `@/lib/utils`, never `@/lib/utils/cn` (the old example's path does not exist) — docs/spec/component-pattern-example.md

---

## Next Up

Known gaps, deliberate or otherwise. None of these block a game night.

- **Reconnect backoff has met a dropped socket only on the mock.** Killing the
  mock Supabase under a room exercised the 1–2–4–8s backoff end to end (0006);
  a real Supabase outage has not been seen yet.
- **RLS is wide open and win verification is client-side.** Insert and update
  are `true` for every game table, and a win is whatever the claimant's browser
  says it is. Deliberate — three friends on a voice call, no adversary. It is
  also the one thing that must change before anyone else is invited in.
- **Traditional caller mode was restyled, not redesigned.** `CallerPanel` and
  `CalledItems` were dropped into rail glass cards and left alone. Honor-system
  play is the real mode.
- **The light theme's glass inversion has never been reviewed on a real game
  screen.** Latte was checked on the landing page only; the header, banner and
  rail all assume white-on-dark translucency.
