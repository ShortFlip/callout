# Callout

A real-time multiplayer bingo app for small friend groups. A host builds a custom
card template, starts a room, and friends join with a six-character code. Everyone
gets their own deterministically shuffled card, marks squares live, and wins are
announced to the whole room.

Desktop-first — this is a personal project for a recurring game night, not a
product.

## Stack

- Next.js (App Router) + React + TypeScript (strict)
- Tailwind CSS + shadcn/ui, sonner for toasts
- Zustand for game state
- Supabase — Postgres, Auth (Discord login), Storage, and Realtime (broadcast +
  postgres_changes fallback)
- Cloudflare Workers (via OpenNext) for hosting

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000, against the LIVE Supabase project
npm run dev:mock     # http://localhost:3123, against a local fake Supabase (scripts/mock-supabase)
npm test             # Vitest
npx tsc --noEmit     # type check
npm run lint
```

## Environment variables

Create `.env.local` with:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |

## Database

Migrations live in `supabase/migrations/` and are applied manually against the
Supabase project (`supabase db push`, or pasted into the SQL editor). They are
ordered by filename timestamp.

Merging to `master` deploys at once, so a PR that carries a migration ships in
this order:

1. Apply the migration in the SQL editor (paste the whole file). Do it right
   before merging: a migration that tightens access breaks the deployed build
   until the new one is live (the file's header says when that applies).
2. Regenerate `src/lib/supabase/types.ts`
   (`supabase gen types typescript --linked`), or hand-edit it in the
   generated shape.
3. Re-mark `players.Insert.claim_code` optional (decision 0003).
4. Merge.

Tip: copy a migration to the clipboard from PowerShell with
`Get-Content -Raw "<path>" | Set-Clipboard`, then paste it into the SQL editor.

## Deployment

Deploys are automatic: pushing to `master` runs the GitHub Actions workflow that
tests, type-checks, lints, builds with OpenNext and publishes to **Cloudflare
Workers with Assets**. Pull requests run the same checks plus a
`wrangler deploy --dry-run`, without deploying. Do not use Cloudflare Pages or
`wrangler pages deploy` — this project is a Worker.

Two independent pingers keep the free-tier Supabase project from being paused
for inactivity: a scheduled GitHub workflow twice a week, and a daily Cloudflare
Cron Trigger on the Worker itself (`custom-worker.ts`).

### Worker details

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

## Tests

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
