# Squares UI Upgrade — Plan

Written 2026-09-08 by the orchestrator session (Fable, medium). Phases run as
Opus subagents; the orchestrator verifies every phase against the diff, the
build and Playwright screenshots, never the subagent's summary.

- **Source of truth on conflict:** `DESIGN.md` Part 1 wins over everything.
  `.design/mockups/SPEC.md` (extracted from the approved canvas) wins over
  CLAUDE.md for geometry, copy and colour. CLAUDE.md wins for conventions.
- **Shipping rule:** one squash-merged PR per phase via `/ship`. Each phase
  leaves master runnable and deployable (push to master deploys).
- **Screenshots:** Playwright MCP only, 1280×800, saved into
  `.playwright-mcp/` (gitignored). Never the Browser pane.
- **Settled, do not reopen:** Scoreboard over Arena. Desktop only. No
  signup/auth. No fullscreen win modal.

## Pre-flight findings

| # | Finding | Recommendation |
|---|---|---|
| 1 | No test runner exists (no vitest, no tests). | Add vitest in Phase 1; tests for `shuffle`, `win-detection`, the new `bestLine`, and the import parser. |
| 2 | `useRealtimeRoom` handles only `SUBSCRIBED`; `isConnected` never returns to false. There is no reconnecting state to render. | Phase 1 adds `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` handling with resubscribe and a `connection` value the UI can show. |
| 3 | Other players' marks live only in hook memory. Each player already writes their own `marks` to `game_players` (500 ms debounce), so nobody needs to persist others' marks. What is missing is reading everyone's rows. | Phase 1 fetches all `game_players` rows for the game on join and reconnect, into a new `others` store slice (card + marks + won). |
| 4 | Nobody fetches other players' `card_data`, but the rail miniature needs it. Select on `game_players` is open, so it is readable. | Same fetch as #3. Miniature renders `card_data` + `marks`. |
| 5 | Mockups use inline oklch literals, no CSS variables. globals.css already has the same values as tokens except **gold**. | Phase 2 adds `--color-gold` (and per-theme overrides). Subagent maps every SPEC.md colour to an existing token; no new literals. |
| 6 | Mockups draw **no reconnecting or syncing state**. DESIGN.md requires both. | Design call, see Question A. |
| 7 | `bestLineCompletion` is a private function in `GameView.tsx`, duplicates win-detection math, and ignores free space. | Phase 2 lifts it into `win-detection.ts` as `bestLine()` with free-space handling and tests. |
| 8 | Grain layer is `z-index: 9999`, above every overlay. | Fine: the win banner is in-flow, not an overlay. Keep grain on top. |
| 9 | There is no `/profile` page; profile is `ProfileModal`. | Claim code lives in `ProfileModal`. |
| 10 | Six app themes already exist (`src/lib/theme.ts`, picker in `ProfileModal`). Handoff listed "themes" as a phase. | Treat themes as done. Phase 5 only adds the gold token to each theme block. No new themes unless Ryann asks. |
| 11 | `game_nights` table is dead. History has no concept of a night. | Night = room. Do not touch `game_nights`. |
| 12 | Leaderboard has no "friend group" concept; it aggregates every row in the table and counts cancelled games. | See Question B. |
| 13 | Claim code needs a column and a re-link mechanism. | See Question C. |
| 14 | RLS on `game_players`, `games`, `rooms`, `players` is `true` for insert/update. Wins are verified client-side; the Edge Function CLAUDE.md describes does not exist. | Out of scope for this upgrade (three friends). Logged so nobody assumes otherwise. |
| 15 | `navigator.clipboard.writeText` is unguarded in `RoomCodeDisplay`. Copy link is only in the lobby, not the game header. | Phase 2 adds the header "Copy link" pill with a try/catch and a toast fallback showing the URL. |
| 16 | Editor `items` array is pinned to `boardSize²`; `bulkFill` drops surplus lines; the surplus draw in `shuffle.ts` is unreachable. Save gate is a floor only. | Phase 4 decouples the pool from the grid. |
| 17 | Play Again and the `postgres_changes` recover path have never been exercised live. | Phase 1 gate exercises refresh-recover across two Playwright contexts. Play Again is exercised in Phase 3. |

### Questions for Ryann (one recommendation each)

- **A. Reconnecting and syncing look.** Recommend: a 3 px amber bar fixed
  under the header spanning full width, with a mono `RECONNECTING` label at
  the right edge, replacing the `Live` pill while dropped. A rail card whose
  marks have not arrived renders its miniature at 45 % opacity with a mono
  `SYNCING` pill where the `N / 25` score goes. Both respect reduced motion.
- **B. Leaderboard scope.** Recommend: "friend group" = every player who has
  shared at least one room with you (co-players), computed client-side from
  the rooms you have played in. Cancelled games excluded from games played
  and win rate. No group table.
- **C. Claim code mechanics.** Recommend: `players.claim_code` (8 chars,
  same unambiguous alphabet as room codes, unique, backfilled). Entering it
  on a new PC looks up the row and writes that row's `browser_id` into the
  new PC's localStorage. No DB write, both machines stay linked.
- **D. Confirm** the RLS and client-side win verification stay as they are.
- **E. Confirm** themes are treated as done (gold token only).

## Phase map

| Phase | Scope | Model / Effort | Run as | PR branch |
|---|---|---|---|---|
| 1 | Rejoin + connection truth: vitest, channel status, everyone's boards in store, last-room chip | Opus / medium | subagent | `feat/rejoin-state` |
| 2 | Scoreboard game screen: header, hero board, rail miniatures, best line, reconnecting/syncing states, copy link | Opus / medium | subagent | `feat/scoreboard` |
| 3 | Win sequence: banner, confetti, gold miniature, board stays live, retire `WinOverlay` | Opus / medium | subagent | `feat/bingo-moment` |
| 4 | Import + templates: item pool, comma split, dedupe, counts, save gate | Opus / medium | subagent | `feat/item-pool` |
| 5 | History per night, scoped leaderboard, claim code, gold per theme | Opus / medium | subagent | `feat/nights-and-claim` |
| 6 | Prune + docs: CLAUDE.md, DESIGN.md Part 2 "still to specify" filled from what shipped, memory | Opus / low | subagent | `chore/upgrade-docs` |

Order: data first (1) so the UI (2, 3) never renders against fake state;
the biggest surface split into screen (2) and moment (3); editor (4) and
aftermath (5) are independent of the game screen and could swap; docs last.

---

## Phase 1 — Rejoin + connection truth

**Why first:** the rail, the syncing state and the reconnecting bar all need
real data and a real connection signal. Building the UI before this means
painting twice.

**Build:**

A. Add vitest (`npm i -D vitest`, `"test": "vitest run"`). Tests for
   `generateCard` (deterministic for same seed+player, surplus pool draws
   N² and differs by player), `checkWin` (each pattern, free space), and
   `generateCallList`.
B. `useRealtimeRoom`: handle every channel status. Return
   `connection: 'connecting' | 'live' | 'reconnecting'`. On
   `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` set `reconnecting`, unsubscribe,
   resubscribe with backoff (1 s, 2 s, 4 s, cap 8 s). On regaining
   `SUBSCRIBED`, run the same refetch as D. Keep `isConnected` as an alias
   for `connection === 'live'` until Phase 2 removes it.
C. `gameStore`: add
   ```ts
   interface OtherPlayer {
     playerId: string; displayName: string; avatarUrl: string | null;
     card: SquareItem[]; marks: number[]; won: boolean;
     finishPosition: number | null; synced: boolean;
   }
   others: Record<string, OtherPlayer>;
   setOthers(list: OtherPlayer[]): void;
   setOtherMarks(playerId: string, marks: number[]): void;
   ```
   `resetGame` clears it. `mark_updated` broadcasts now write to the store
   (`synced: true`), not hook-local state. Remove the hook's `playerMarks`.
D. Refetch helper `loadGamePlayers(gameId)` in `src/lib/game/game-players.ts`:
   selects `player_id, card_data, marks, won, finish_position,
   players(display_name, avatar_url)` for the game, excludes self, calls
   `setOthers`. Called on: room mount when `playing`, `game_started`
   receipt (after own upsert), reconnect. A player present in presence but
   with no row yet gets an entry with `synced: false` and an empty card.
E. Last room: `src/lib/utils/last-room.ts` with key `squares:last_room`,
   value `{ code, name, savedAt }`. Write on entering a room page. Clear
   when the room reaches `finished`. Landing (`src/app/page.tsx`) reads it,
   checks `rooms.status !== 'finished'` and `savedAt` within 18 h, and
   shows a chip **above** the join box: `Rejoin {name or code}` with the
   mono code, one click to `/room/CODE`. Copy: "Rejoin" and "You were in
   {CODE}". Hidden otherwise. Existing lobby and game UI untouched.
F. Verify: `npm test`, `npm run build`, `npm run lint` (no new warnings).
   Grep `playerMarks` in `src/` → zero hits.

**Done (orchestrator verifies):** tests pass; build passes; diff of
`useRealtimeRoom.ts`, `gameStore.ts`, `game-players.ts`, `last-room.ts`
read in full. Playwright: two browser contexts in one room, one marks three
squares, the other reloads; after reload the store shows the first
player's three marks (checked via a DEV-only `window.__squares` store
handle, absent from production build). Landing screenshot shows the
Rejoin chip after visiting a room.

## Phase 2 — Scoreboard game screen

**Why here:** the primary surface, built once against real data.

**Build:** rebuild `GameView.tsx` to `Main.dc.html` per `SPEC.md`; extract
sizes and copy, rebuild with tokens, do not port markup.

A. Tokens: add `--color-gold: oklch(0.82 0.16 88)` to `:root`, `.dark` and
   every `[data-theme]` block; expose as `--color-gold` in `@theme inline`.
   Glass recipe from SPEC.md becomes a `.glass` utility in globals.css
   (the existing `.call-glass` stays).
B. `bestLine(marks: Set<number>, boardSize, freeSpace)` in
   `win-detection.ts` returning
   `{ kind: 'row'|'column'|'diagonal', index: number, remaining: number } | null`
   plus `bestLineLabel()` producing exactly: `Row 3 — one away`,
   `Column 2 — two away`, `No line yet`, `Bingo — column 2`. Delete
   `bestLineCompletion` from `GameView.tsx`. Tests.
C. Layout at 1280×800: 56 px glass header (Squares · divider · mono room
   code with violet glow · `Copy link` pill · right: `Round N` · `Live`
   pill · mute icon). Body `flex gap-5 p-5`: hero panel with 608 px grid,
   115 px rows, 8 px gap, header strip (avatar, name, `YOUR BOARD` pill,
   best-line label, `N / 25` mono); rail 300 px wide, scrolls, header
   `EVERYONE ELSE` / `{n} playing`.
D. `MiniBoard.tsx` (`src/components/board/`): 20 px tiles, 2 px gap, 6 px
   padding, radius 6; `.mt-on` amber with glow, `.mt-free` violet, `.mt-line`
   emerald 1 px outline on every tile of the best line. Props: `card`,
   `marks`, `boardSize`, `freeSpace`, `size` (108 default, 90 for Phase 3),
   `winner?: boolean` (no-op until Phase 3).
E. `RailCard.tsx` (`src/components/game/`): MiniBoard + avatar/name,
   `N / 25` mono, 4 px progress bar (emerald when one away, amber otherwise),
   status line from `bestLineLabel`. `synced: false` → miniature 45 %
   opacity and a mono `SYNCING` pill in place of the score.
F. Reconnecting: when `connection !== 'live'`, the `Live` pill is replaced
   by a 3 px amber bar under the header with mono `RECONNECTING` at the
   right. Board stays markable. (Question A; adjust if Ryann changes it.)
G. Copy link pill: `navigator.clipboard.writeText(location.href)` in
   try/catch; success toast `Link copied`; failure toast shows the URL.
   Reuse in `RoomCodeDisplay`.
H. Dense state: 6×6 keeps the 608 px grid (rows ≈ 95 px); rail scrolls.
   Caller panel and called items (traditional mode) move into the rail
   above the players, same glass card; do not redesign them.
I. Dev harness: `?state=reconnecting|syncing|dense` on the room page,
   DEV-guarded, verified absent from the production build output.
J. Verify: test, build, lint. Grep `bestLineCompletion` → zero hits.

**Done:** Playwright screenshots of the game screen at 1280×800 with five
players (seeded via two contexts plus the harness), `?state=reconnecting`,
`?state=syncing`, 6×6. `/visual-verdict` against `Main.dc.html` served over
localhost, iterate to 90+. Ryann sees the passing capture before ship.

## Phase 3 — Win sequence

**Why here:** the one loud moment, built on the finished screen.

**Build:** `BingoMoment.dc.html` per SPEC.md.

A. Retire `WinOverlay` as a modal: delete the file, remove the import.
   Grep `WinOverlay` → zero hits.
B. `WinBanner.tsx`: in-flow glass banner between header and body
   (`mx-[22px] mt-[14px]`, ≈78 px, radius 16, gold border and glow,
   gradient per SPEC). Left: trophy tile, headline `{NAME} GOT BINGO`
   (Outfit 38/800, gold text glow), subline `{Pattern} — Round {n}. Board
   stays live; play on for second place.` Right: pills `1ST — {NAME}` (gold
   fill) and `2ND — OPEN` (outline) → `2ND — {NAME}` when a second winner
   lands. Host controls (`New Round`, `End Game Night`) move into the
   banner's right side, after the pills, ghost buttons; non-hosts see
   nothing there.
C. When the banner is visible the hero grid shrinks to 520 px (98 px rows,
   11 px text), miniatures to 90 px. 300 ms panel transition.
D. Sequence, on `bingo_confirmed`: `playBingo()` → banner slides in from
   top (300 ms) → canvas-confetti burst (two cannons from the top corners,
   colours violet, amber, gold, pink, 1.5 s) → winner's RailCard gets
   `winner` (gold border and glow, mono `1ST` pill beside name, gold
   progress fill, status `Bingo — column 2`, MiniBoard outlines the winning
   line in gold). Reduced motion: no slide, no confetti, banner appears.
E. Board stays interactive after a win. Second winner gets `2ND` pill and
   gold treatment; banner headline stays on the first winner.
F. Round over: on `game_started` play `playRoundStart()` and flip the hero
   grid (reuse `call-flip` timing) to the new card. No dialog. Banner
   leaves with the flip.
G. Dev harness: `?state=won|won2` renders the banner with fake winners.
H. Verify: test, build, lint.

**Done:** Playwright captures of `?state=won` and `?state=won2` scored
against `BingoMoment.dc.html` (90+). Live check: two contexts, one wins,
the other's board still accepts a mark and the banner shows on both.
Play Again from Game Over exercised across the two contexts (closes the
Phase 1 "unverified" item).

## Phase 4 — Import + templates

**Why here:** independent of the game screen; the surplus draw already
works, only the editor blocks it.

**Build:**

A. `editorStore`: `items` becomes an unbounded pool `SquareItem[]` (no
   empty placeholders). Derived: `needed = boardSize² − (freeSpace ? 1 : 0)`,
   `surplus = max(0, items.length − needed)`. Grid editing view maps the
   first `needed` items onto the grid for preview only; editing a cell
   edits that pool entry. Extra items list below the grid as removable
   chips.
B. Parser `parseImport(text: string): string[]` in
   `src/lib/game/import.ts`: split on newlines; if the result is one line,
   split on commas; trim; drop empties; dedupe case-insensitive keeping
   first spelling. Tests.
C. Copy: count line `{items.length} items, {needed} per card` when
   surplus ≥ 0; `{needed} needed, {items.length} so far` when short. Bulk
   dialog button `Add {n} items`. Save button disabled when short, with
   the count line in rose next to it.
D. Save writes the whole pool to `card_templates.items`. `buildGameSetup`
   and `generateCard` already draw from a pool; add a test proving two
   rounds with different seeds draw different subsets from a 40-item pool.
E. Migration none. Existing templates (exactly N² items, blanks at the
   free-space index) load unchanged: strip blank items on load.
F. Verify: test, build, lint. `/create` screenshot in short, exact and
   surplus states.

**Done:** three `/create` screenshots showing the three count states; a
40-item template played for two rounds in Playwright yields different
cards.

## Phase 5 — History per night, scoped leaderboard, claim code

**Build:**

A. Migration `20260908000000_claim_codes.sql`: `players.claim_code text
   unique`, generated by a SQL function using the room-code alphabet
   (8 chars), default on insert, backfill existing rows.
   `npx supabase db push`.
B. `ProfileModal`: section `Claim code` showing the mono code, copy
   button, helper `Enter this on another PC to be you again.` Below it an
   input `Have a code?` → lookup by `claim_code`, write that row's
   `browser_id` to localStorage, reload. Toasts for not found.
C. `/history`: one query for rooms the player has a `game_players` row in;
   group by room (night). Night card: room name, date, template, player
   avatars. Expand → rounds list: round number, every player with
   `N / 25`, winner(s) with gold pill and pattern, cancelled rounds shown
   muted as `No winner`. `CardSnapshot` stays for your own board.
D. `/leaderboard`: co-player set from the history query; filter
   `game_players` to those players and `games.status !== 'cancelled'`.
   Same columns as now.
E. Gold token added to every theme block (if Phase 2 missed any).
F. Verify: test, build, lint; screenshots of `/history` and
   `/leaderboard` with seeded data.

**Done:** screenshots; a cancelled round visibly excluded from games
played; claim code round-trips between two Playwright contexts (second
context ends up with the first's display name).

## Phase 6 — Prune + docs (Opus low)

A. CLAUDE.md: architecture tree (new files), remove references to
   `WinOverlay`, Edge Function verification, `game_nights`, `/profile`
   page; add version-history row and per-phase PR numbers.
B. DESIGN.md Part 2 "Still to specify": fill from what shipped (type
   scale, radius language, bingo sequence beats, miniature language,
   reconnecting/syncing indicators). Themes: list the six.
C. Delete dead code found along the way (`isConnected` alias, unused
   exports). Lint clean.
D. Memory file `project_supabase_pause.md` updated by the orchestrator.

**Done:** diff read; build passes.

---

## Decision log

| Date | Decision | By |
|---|---|---|
| 2026-09-07 | Scoreboard over Arena; no fullscreen win modal; desktop only; no signup | Ryann |
| 2026-09-08 | Plan written; six phases; themes treated as done; RLS out of scope | Orchestrator (pending Ryann on A–E) |
| 2026-09-08 | Questions A–E accepted as recommended ("go"): amber reconnecting bar + SYNCING pill; friend group = co-players, cancelled excluded; claim code sets localStorage browser_id, no DB write; RLS and client-side win verification unchanged; themes done, gold token only | Ryann |
| 2026-09-08 | Phase 1 built; vitest (20 tests), channel backoff + `connection` state, `others` store slice fed from `game_players`, last-room Rejoin chip; `playerMarks` gone | Opus subagent |
| 2026-09-08 | Phase 1 gate passed live (refresh-recover across two contexts: guest 3/24 survives host reload; Rejoin chip shown). Screenshots `.playwright-mcp/gate1-*.png`. Playwright MCP profile was held by another session; gates run via `.playwright-mcp/pw.cjs` over CDP instead | Orchestrator |
| 2026-09-08 | Phase 2 built; Scoreboard game screen — glass header with room code + copy link, 608px hero board with hot lane, 300px rail of live miniatures, `bestLine`/`bestLineLabel` in win-detection, amber reconnecting bar, SYNCING rail state, `--color-gold` in every theme, `?state=` dev harness verified absent from production chunks | Opus subagent |
| 2026-09-08 | Phase 2 visual verdict: 88 → hero panel stretched full width; fixed to hug the grid (w-fit, 648px, centered) and pass. Captures `.playwright-mcp/p2-*.png`, reference `ref-main.png` | Orchestrator |
| 2026-09-08 | Phase 3 built; `WinOverlay` deleted for an in-flow gold `WinBanner` (host New Round / End Night inside it), hero grid shrinks 608→520 with the board still markable, per-winner `playBingo` + two-cannon confetti, gold rail cards with `1ST`/`2ND` pills and a gold winning line, `call-flip` on the new round, `?state=won|won2` harness | Opus subagent |
| 2026-09-08 | Phase 3 visual verdict 93 pass against BingoMoment artboard (`ref-bingo.png`). Live: guest row bingo, host still marks after win, End Night → Play Again returns both contexts to a new gameId | Orchestrator |
| 2026-09-08 | Phase 4 built; editor `items` is now an unbounded pool (no blank placeholders), `parseImport` splits newlines then commas and dedupes case-insensitively, bulk import appends and reports `Added N items, skipped M duplicates`, count line + Save gate replace the old "Squares filled" widget, surplus items list as removable chips, legacy N²-with-blank templates load stripped | Opus subagent |
| 2026-09-08 | Phase 4 gate passed: `p4-short/exact/surplus.png`; live two-round proof in room F4ZXP9, host and guest cards differ between rounds from a 40-item pool | Orchestrator |
| 2026-09-08 | Phase 5 built; `players.claim_code` (8 chars, room-code alphabet, trigger + backfill) with a Claim code section in ProfileModal that re-points localStorage at an existing player, `/history` grouped into nights (room = night) with expandable rounds and cancelled rounds shown as `No winner`, `/leaderboard` scoped to co-players with cancelled rounds excluded (same exclusion added to PlayerStats); `--gold` already present in all six theme blocks | Opus subagent |
| 2026-09-08 | Phase 5 gate passed: history shows rounds 1–3 with round 2 as No winner; leaderboard scoped to two co-players at 2 games each (cancelled excluded); claim code 7X6TTPBV round-tripped into a third context. Migration applied live, 35 players backfilled, 0 null. Gap found: no host controls after a winnerless round (New Round / End Night live only in WinBanner) → Phase 6 must add a host control outside the banner and cancel the active round on End Night | Orchestrator |
| 2026-09-08 | Phase 6 built; host controls in header, End Night cancels a winnerless round, docs updated | Opus subagent |
| 2026-09-08 | Phase 6 gate passed (room 4TPZJM): host header shows New Round / End Night, guest does not; New Round and End Night both cancel a winnerless round. Parked: Crimson and Obsidian themes inherit the violet accent (theme.ts advertises rose for Crimson); one-line globals.css fix if wanted | Orchestrator |
