# CLAUDE.md — Squares

> A real-time multiplayer bingo platform for small friend groups.

**Squares** is a web-hosted, real-time multiplayer bingo app. A host creates a custom bingo card template, starts a game room, and friends join via a short room code. The host calls items from a caller panel, players mark squares on their synced boards, and the system detects/verifies wins. Game history, leaderboards, and stats persist across sessions — no account required (but optionally supported).

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
| Auth | Supabase Auth (anonymous; email/Google not built) | - |
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

### Aesthetic: "Arcade Lounge"
Think neon-lit bowling alley meets modern game night — playful but polished. NOT corporate SaaS, NOT kiddy/classroom.

### Design Tokens
- **Background:** Deep charcoal (`#0f0f14`) with subtle noise texture
- **Surface:** Slightly lighter (`#1a1a24`) for cards, panels, modals
- **Primary accent:** Electric violet (`#7c3aed`) — used sparingly for CTAs, active states, winner effects
- **Secondary accent:** Warm amber (`#f59e0b`) — marked squares, highlights
- **Success:** Emerald (`#10b981`) — bingo confirmation, win states
- **Danger:** Rose (`#f43f5e`) — errors, destructive actions
- **Text primary:** `#f1f5f9`
- **Text secondary:** `#94a3b8`
- **Grid lines:** `#2d2d3a` default, customizable per card template

### Typography
- **Display/Headers:** Outfit — bold and characterful; NOT Inter, NOT Roboto
- **Body/UI:** Plus Jakarta Sans; numbers use `tabular-nums`, never mono
- **Monospace (codes only):** JetBrains Mono, for the room and claim codes read aloud or typed (O/0, I/1)

### Key Visual Elements
- Squares glow subtly when marked (a 150ms dab, then a steady glow; no pulse — the bingo banner is the one loud moment)
- Winner gets a confetti cannon animation + board highlight
- Caller panel has a "now calling" card flip animation
- Room code displayed large and bold — easy to read aloud over a call
- Dark mode is default; light mode supported

### Component Patterns
- Use shadcn/ui as the base — customize colors/radius to match tokens
- Border radius: `rounded-lg` (8px) for cards, `rounded-md` (6px) for buttons
- Consistent 4px spacing scale (Tailwind default)
- All interactive elements need hover, active, focus, and disabled states
- Transitions: 150ms ease for micro-interactions, 300ms for panel/modal transitions

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
- Identity is a `localStorage` `browserId` plus a Supabase anonymous session; a
  new PC re-points at an existing player with `players.claim_code`.
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

```
squares/
├── src/
│   ├── app/                          # Next.js App Router pages
│   │   ├── layout.tsx                # Root layout (fonts, theme, player provider)
│   │   ├── globals.css               # Tokens, theme blocks, glass + animation utilities
│   │   ├── page.tsx                  # Landing — create, join, Rejoin chip
│   │   ├── library/page.tsx          # Library — items pane + card builder
│   │   ├── room/[code]/page.tsx      # Game room — lobby → playing → game over
│   │   ├── history/page.tsx          # Nights (one per room) + per-round drill-down
│   │   └── leaderboard/page.tsx      # Co-player rankings
│   │
│   ├── components/
│   │   ├── board/
│   │   │   ├── BingoBoard.tsx        # The NxN grid — marking, hot lane, called wash
│   │   │   ├── BingoSquare.tsx       # One square — text, image, marked/called state
│   │   │   ├── MiniBoard.tsx         # Someone else's board at ~90–108px, glanceable
│   │   │   ├── CardPreview.tsx       # A saved card's tiles in game colours (Home, Lobby)
│   │   │   ├── BoardLegend.tsx       # Key to the card's game marks: icon, colour, name
│   │   │   ├── GameMark.tsx          # One game's mark: uploaded logo, else its icon
│   │   │   └── BoardSkeleton.tsx     # N×N outline while the card loads (no spinner)
│   │   ├── game/
│   │   │   ├── RoomClient.tsx        # Room state machine + all Supabase writes
│   │   │   ├── GameLobby.tsx         # Pre-game room — code, crew seats, card, rules
│   │   │   ├── GameView.tsx          # The Scoreboard screen: header, hero board, rail
│   │   │   ├── RailCard.tsx          # One other player in the rail — mini + progress
│   │   │   ├── WinBanner.tsx         # In-flow gold win band (never an overlay)
│   │   │   ├── HostControls.tsx      # New Round / End Night — used by header AND banner
│   │   │   ├── GameOver.tsx          # Night over — Play Again (host) or waiting copy
│   │   │   ├── CallerPanel.tsx       # Traditional mode only — call list, next button
│   │   │   ├── CalledItems.tsx       # Traditional mode only — call history
│   │   │   ├── SwapPicker.tsx        # Host's mid-round game swap, picked not rolled
│   │   │   ├── GameSkeleton.tsx      # GameView's frame before the card is ready
│   │   │   ├── CreateRoomDialog.tsx  # Name + template + settings
│   │   │   ├── TemplateList.tsx      # Saved templates on the landing page
│   │   │   ├── DisplayNameDialog.tsx # First-visit name prompt
│   │   │   ├── PlayerProvider.tsx    # Identity resolution at the app root
│   │   │   ├── ProfileModal.tsx      # Name, avatar, theme, claim code (no /profile page)
│   │   │   └── ThemePicker.tsx       # The six app themes
│   │   ├── home/CrewSummary.tsx      # Home's crew avatars row
│   │   ├── layout/                   # RoomCodeDisplay, SquaresMark (logo), ServerUnreachable
│   │   ├── library/                  # Library panes, import, mix control
│   │   ├── stats/PlayerStats.tsx
│   │   └── ui/                       # shadcn/ui primitives + PlayerAvatar
│   │
│   ├── lib/
│   │   ├── supabase/{client,server,types}.ts
│   │   ├── supabase/paging.ts        # readAllPages(In): every row past the 1,000 cap
│   │   ├── game/
│   │   │   ├── shuffle.ts            # Fisher-Yates + column-locked; draws N² from the pool
│   │   │   ├── win-detection.ts      # checkWin + bestLine/bestLineLabel
│   │   │   ├── seed-rng.ts           # Seeded PRNG (mulberry32 behind seededRng)
│   │   │   ├── room-code.ts          # 6-char codes, unambiguous alphabet
│   │   │   ├── call-list.ts          # Randomized call order (traditional mode)
│   │   │   ├── game-setup.ts         # Shared round bootstrap: seed, items, call list
│   │   │   ├── game-players.ts       # loadGamePlayers — everyone's cards + marks
│   │   │   ├── create-round.ts       # Insert a round + build its game_started payload
│   │   │   ├── co-players.ts         # My rooms + every co-player row (leaderboard, Home)
│   │   │   ├── card-builder.ts       # Squares per game on the library's card pane
│   │   │   ├── restore.ts            # Which card a rejoining player sees
│   │   │   ├── retract.ts            # Undoing a win when the winner unmarks
│   │   │   ├── stats.ts              # Shared rules turning rows into stats
│   │   │   ├── swap-games.ts         # Mid-round game swap
│   │   │   ├── import.ts             # parseImport — newlines then commas, dedupe
│   │   │   └── __tests__/            # Vitest for most of the above
│   │   ├── library/                  # Library API, card draft, hosting, legend
│   │   ├── realtime/                 # drop-channel (0006), catch-up reads, send queue key
│   │   ├── utils/
│   │   │   ├── browser-id.ts         # localStorage UUID identity
│   │   │   ├── last-room.ts          # Remembers the last room for the Rejoin chip
│   │   │   ├── copy-link.ts          # Guarded clipboard write + toast fallback
│   │   │   ├── player-color.ts       # Deterministic avatar color + initials
│   │   │   └── retry.ts              # Short backoff for a read/write that must land
│   │   ├── utils.ts                  # cn() — clsx + tailwind-merge
│   │   ├── theme.ts                  # The six app themes
│   │   ├── card-styles.ts            # Card style presets
│   │   ├── sound.ts                  # Web Audio synthesis — no audio files
│   │   ├── win-confetti.ts           # The two-cannon burst and the second-place burst
│   │   ├── achievements.ts           # Badges derived from stats
│   │   ├── hero-fit.ts               # Hero board sizing (GameView + its skeleton)
│   │   ├── label.ts / pill.ts        # SECTION_LABEL caption and the pill scale
│   │   ├── game-colors.ts            # Game colour keys → colours
│   │   ├── keepalive.ts              # Supabase ping for the Worker Cron Trigger (pure, no Next)
│   │   └── dev-state.ts              # `?state=` harness, DEV-only, stripped from prod
│   │
│   ├── stores/                       # Zustand: gameStore, playerStore
│   │   └── libraryStore.ts           # Library items, tags, filter and the card draft
│   ├── hooks/                        # useRealtimeRoom, useGameState, usePlayer, useLegendNamesFit
│   └── types/                        # game.ts, card.ts, player.ts, library.ts
│
├── supabase/migrations/              # 0001 schema → RLS fixes → avatars →
│                                     # enable_realtime → claim_codes →
│                                     # unique_round_number → item_library → game_logos
├── .design/                          # AUDIT-PUNCHLIST.md, mockups/ (tracked); refs/ gitignored
├── .github/workflows/deploy.yml      # PR: gates + bundle dry run. master: gates + deploy
├── .github/workflows/keepalive.yml   # Twice-weekly Supabase ping (one of two pingers)
├── custom-worker.ts                  # Worker entry: OpenNext fetch + keepalive Cron handler
├── public/                           # Static SVGs only — sounds are synthesized
├── CLAUDE.md                         # ← You are here
├── DESIGN.md                         # Design intent; Part 1 binding
├── vitest.config.ts
├── next.config.ts
├── open-next.config.ts
├── wrangler.toml
├── tsconfig.json
├── components.json
└── README.md
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
- **Barrel exports** — `index.ts` in each component directory (not followed yet: no `index.ts` exists under `src/components/` — ask before adding or dropping)
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
- Browser client: `createBrowserClient()` in `lib/supabase/client.ts`
- Server client: `createServerClient()` in `lib/supabase/server.ts`
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
  swaps, card styles, the library (drafts, heat, hosting, legend, logos), the
  realtime channel drop/catch-up/queue, retry, the game store and the
  keepalive ping. Pages and components have none.
- **Screenshots without his live data:** `npm run dev:mock` serves the app on
  :3123 against a local fake Supabase (scripts/mock-supabase/README.md has the
  room codes for Lobby, game, Swap, win and Game Over). Every visual check uses
  it; a plain `npm run dev` signs in anonymously against the LIVE project.
- **Live gates (in place, not in CI):** each phase is proved against two real
  browser contexts via `.playwright-mcp/pw.cjs` (a CDP driver) pointed at the dev
  server, printing `GATE <name>: PASS/FAIL` lines.
- **Not done:** component tests, and a scripted end-to-end run in CI.

---

## Notes

- The name "Squares" is a working title and may change. It's only referenced in `package.json` `name` field, the root layout `<title>`, and any logo/branding components.
- This is a personal project for 3-5 friends. No need for rate limiting, abuse prevention, or enterprise features in MVP.
- Sound effects and confetti are non-negotiable. They make the game.
- **Desktop only.** Squares lives on a second monitor beside Discord while the
  main monitor is playing something else. Assume ~1280×800 minimum. No mobile work.

---

## Decisions

Read the file before changing the code it names. Each keeps the original text verbatim.

- Stay on Next.js + Supabase Realtime + Zustand + shadcn/ui — no custom socket server, no Redux; versions come from `package.json` — docs/decisions/0001-stack-choices.md
- A win is whatever the claimant's tab detects; no Edge Function, RLS open, and that must change before outsiders join — docs/decisions/0002-client-side-win-verification.md
- Every room keeps a `template_id` (unsaved cards are `saved = false` rows; Remove unsaves, never deletes); owner-only writes check the returned row count; after regenerating types, re-mark `players.Insert.claim_code` optional — docs/decisions/0003-item-library.md
- The card is a list he fills: new cards start empty, Add never evicts, Fill Empty is the only random step, and nothing else moves a square — docs/decisions/0004-card-is-a-list-he-fills.md
- Design audit rulings: captions are Title Case via SECTION_LABEL, radius caps at 10 (panels 10, cards 8, controls 6), loading lists use SkeletonRows and spinners live only in their button — docs/decisions/0005-design-audit-2026-10-04.md
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
