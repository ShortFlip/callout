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
- Supabase — Postgres, Auth (anonymous), Storage, and Realtime (broadcast +
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
