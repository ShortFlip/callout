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

Full detail (broadcast list, identity, seeded cards, win detection): `docs/architecture.md`. Where things live: `docs/project-structure.md`.

- No server code runs in the game loop. A win is whatever the claimant's tab detects (decision 0002).
- The host is the source of truth for game progression: only the host calls items and resets rounds.
- Realtime lives on `room:{roomCode}`; only `useRealtimeRoom` owns the channel, and broadcast payload types live there.
- The schema is `supabase/migrations/` plus the generated `src/lib/supabase/types.ts`; a **night is a room** (`game_nights` is unused).
- Styling is Tailwind v4 with the theme in `globals.css` (`@theme inline`); there is no `tailwind.config.ts`.

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

A push to `master` deploys to Cloudflare Workers through `.github/workflows/deploy.yml`; PRs run the same gates plus a dry run. Never Cloudflare Pages, and never a local `cf:deploy` without `keep_vars` in `wrangler.toml`. Details: README "Deployment".

---

## Testing

- `npm test` (Vitest) gates every PR; pages and components have no tests. Coverage list: README "Tests".
- Every visual check runs on `npm run dev:mock` (:3123, fake Supabase, anonymous play on); plain `npm run dev` hits the LIVE project behind the Discord wall.
- Live gates run two real browser contexts through `.playwright-mcp/pw.cjs`, printing `GATE <name>: PASS/FAIL`.

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

## Known gaps

Tracked as GitHub Issues (`gh issue list`); none block a game night. RLS and client-side wins are #1 (decision 0002).
