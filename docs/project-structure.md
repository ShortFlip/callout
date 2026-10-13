# Project structure — Callout

Moved verbatim from CLAUDE.md on 2026-10-12 so it stops loading every turn.

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
