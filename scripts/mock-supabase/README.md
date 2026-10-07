# Mock Supabase

A local, in-memory fake of the Supabase endpoints Callout calls, so every
screen can be opened and screenshotted without touching the live project.

## Why

Every page load runs `supabase.auth.signInAnonymously()`
(`src/components/game/PlayerProvider.tsx`). Against the live project, each
headless browser would create a real anonymous user. There is no Docker here,
so `supabase start` is not an option. This server answers the same calls on
`127.0.0.1:54399` and keeps everything in memory.

## Run

```sh
npm run dev:mock
```

That starts the mock (`scripts/mock-supabase/server.mjs`) and
`next dev --webpack -p 3123`, both stopped together by Ctrl+C. Open
<http://localhost:3123>.

- In a worktree, `node_modules` must exist first. Make it a junction to the
  main checkout's (from the worktree root:
  `cmd /c mklink /J node_modules ..\..\..\node_modules`), never `npm install`.
- `--webpack`, not Turbopack: Turbopack refuses a `node_modules` that is a
  junction pointing outside the project.
- Mock only: `node scripts/mock-supabase/server.mjs`.
- Reset the data without restarting: `curl -X POST http://127.0.0.1:54399/__mock/reset`.
  Dump it: `http://127.0.0.1:54399/__mock/state`.
- Live-gate hooks (opt-in, nothing changes unless a gate calls them):
  - `POST /__mock/fail` with `{"method":"POST","table":"game_players","count":1}`
    makes the next `count` matching REST requests answer 503, like a blip.
    `{"count":0}` clears every staged failure.
  - `POST /__mock/drop` with `{"presenceKey":"<player id>","holdMs":8000}`
    terminates that player's realtime sockets and refuses their channel joins
    for `holdMs`, so the tab misses everything sent meanwhile and then
    reconnects through the app's own backoff.

Options (environment variables for `npm run dev:mock`):

| Variable | Default | Effect |
|---|---|---|
| `MOCK_ADOPT` | `ryann` | An unknown browser opens as this fixture player. `none` shows the first-visit name prompt. |
| `MOCK_FRIENDS_ONLINE` | `1` | Dan, Jess and Marco show as present in every live room. `0` leaves rooms empty. |
| `MOCK_NEXT_PORT` | `3123` | Port for `next dev`. |

To be a friend instead of Ryann, set `localStorage['callout:browser_id']` on
`localhost:3123` to `mock-browser-dan`, `mock-browser-jess` or
`mock-browser-marco` and reload. Ryann is `mock-browser-ryann`.

## Screens

| Screen | URL | Notes |
|---|---|---|
| Home | `/` | Saved cards: Chaos Mix, Valorant Ranked, Friday Squad Night |
| History | `/history` | Four nights: two finished (FRDAY2 has a cancelled round 3), plus the two live rooms |
| Leaderboard | `/leaderboard` | Ryann and Dan on 2 wins, Marco and Jess on 1 |
| Library | `/library` | 54 items across four games (Valorant has an uploaded one-colour logo), two extra tags, heat from past rounds |
| Lobby | `/room/QUEUE2` | Waiting, Ryann hosts, three friends present |
| In game | `/room/GAME22` | Round 1 active, everyone has marks, Ryann hosts |
| Host Swap dialog | `/room/GAME22`, then click **Swap Call of Duty → Rocket League** | Six spare Rocket League items to pick from. Swapping writes to the mock only. |
| Win banner | `/room/CHAMP2` | Real data: Dan won row 3 |
| Game Over | `/room/ENDED2` | Room status `finished` |

The DEV harness in `src/lib/dev-state.ts` works on any in-game room:
`/room/GAME22?state=won`, `won2`, `dense`, `syncing`, `reconnecting`,
`tinted`, `tinted6` (the tinted states also take `&won=1` and `&called=1`).

## What it fakes

- **Auth**: `/auth/v1/signup` (anonymous), `/token` (refresh), `/user`, `/logout`.
  Tokens are JWT-shaped and never verified.
- **PostgREST** `/rest/v1/<table>`: `select` with embeds (`games!inner(...)`,
  FK hints like `players!game_players_player_id_fkey(...)`, one-to-many
  arrays), filters `eq neq gt gte lt lte in is like ilike cs` and `not.`,
  filters on embedded columns (`games.room_id=in.(...)`), `order` with
  nulls first/last, `limit`/`offset`, `.single()`, inserts, upserts
  (`on_conflict`, ignore or merge duplicates), updates and deletes, unique
  constraints as `23505`. Not supported: `or=` filters and embed-level
  order/limit (a request using them gets a clear 400).
- **RPC**: `generate_claim_code`.
- **Storage**: public reads, uploads and removes, in memory.
- **Realtime** (protocol 2.0.0, using `ws` already in `node_modules`): join,
  heartbeat, broadcast relay with acks, presence, and `postgres_changes`
  for writes made through the mock.

Data lives in `fixtures.mjs` (IDs and room codes are fixed). Every request is
logged to stdout as `[mock-supabase hh:mm:ss.mmm] METHOD path -> status`.

## Safety

- `npm run dev:mock` copies `.env.mock` into the process environment before
  `next dev` starts. Next never overrides a variable that is already set, so
  `.env.local` (the live project) is never read for these two values.
- The launcher refuses to start unless `NEXT_PUBLIC_SUPABASE_URL` is a
  loopback address.
- The mock binds `127.0.0.1` only and makes no outbound requests.
- `.env.mock` holds only a dummy key and is committed (`!.env.mock` in
  `.gitignore`).

## Known gaps

- On the board, a game's uploaded logo falls back to its icon:
  `safeLogo` in `src/lib/library/legend.ts` accepts only `https://` URLs and the
  mock serves `http://`. The Library page (GameGlyph) shows the logo.
- Game Over on a cold load reads "Round 0" with no winners: `GameOver` takes
  both from the in-memory game store, which a finished room never fills.
