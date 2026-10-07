# DESIGN.md — Callout

Design intent for the Squares bingo app. Part 1 is settled and binding. Part 2
is deliberately incomplete: follow its guardrails, do not fill gaps with
framework defaults, and ask before inventing.

Written 2026-09-07 from Ryann's own description of game night. Where something
below is a guess rather than his words, it is marked *(guess)*.

---

## Part 1 — UX

### The moment

Three to five friends in a Discord call, playing Call of Duty or Rocket League
on the main monitor. Callout lives in a browser window on the **second
monitor, always visible**, possibly sharing that monitor with Discord. Nobody
is looking at it most of the time. When something on the card happens, someone
calls it out on voice, everyone glances over, marks the square, and goes back
to the game. The mouse hand is busy; the glance is a second or two.

Design consequences:

- The window is **glanceable, not studied**. State must read from across the
  room: whose square just lit, who is close, who won.
- Every interaction is **one click, no confirm**. Nothing may steal focus from
  the game or demand a decision.
- The app is **desktop only**. No mobile work, ever. Assume ~1280×800 minimum
  and a window that may be half a monitor wide.

### Primary verb

**Mark a square.** Everything else (creating cards, resetting, history,
leaderboard) is setup or aftermath. When two things compete for space or
prominence, the board wins.

### Frequencies

| Action | How often | Treatment |
|---|---|---|
| Mark a square | Many times per night, a few seconds each | Big targets, instant feedback, no confirmation |
| Glance at who is close | Constantly, passively | Ambient, always on screen, no click |
| Someone hits bingo | A few times per night, "usually someone gets there quick" | The one moment allowed to be loud |
| Reset for a new round | Right after each bingo | One click for the host, zero for everyone else |
| Join a room | Once per night per person | Paste a link or type a code; no account, no friction |
| Rejoin after a refresh or crash | Occasionally, mid-round | Automatic; land back on the same board with marks intact |
| Create or edit a card | Rarely; before the night, or reused | Can live behind a click |
| History / leaderboard | Rarely | Aftermath; off the game screen entirely |

### Opening state

- **First visit:** name prompt, then the landing. This already exists and is fine.
- **Returning during a night:** the landing must show a **Rejoin** chip for
  the last room you were in, above the join box. One click back into the game.
  Today this does not exist; the landing has no memory of the last room.
- **Arriving via a link:** `/room/CODE` already skips code entry. The host
  screen must offer a **copy link** button, not just the bare code, so pasting
  into Discord is the normal join path.

### Success definition

A friend who just got kicked out of their browser is back on their board, with
their marks, in under five seconds and without asking the host anything.
Everyone can see everyone's board without asking anyone to verify. When
someone hits bingo the whole window makes it obvious, and play continues to the
second winner without the host doing anything.

### Tolerated failures

- A mark lost in the last half-second before a crash is fine. Losing the
  whole board is not.
- Other players' boards being a second or two stale is fine. Them showing
  0/25 after a refresh is not.
- A missed sound effect is fine. A missed bingo announcement is not.

### "Never make me"

- Never make me confirm a mark, a reset, or a rejoin.
- Never cover my board with a modal I have to dismiss while the round is still
  live. A win is a banner and a fanfare, not a wall.
- Never make me type a room code I was already in.
- Never make me verify someone else's bingo by asking them to screenshot.
- Never show me history or leaderboard chrome on the game screen.

### Structure decision

Two genuinely different structures were considered.

**A. Scoreboard (chosen; confirmed by Ryann 2026-09-07 from the mockup canvas).** My board is the hero, filling most of the window.
A rail on the right holds every other player's board as a live miniature,
readable at a glance (marked squares as filled tiles, best line highlighted),
plus name and progress. The rail is the "everyone's board on one sheet"
request. A win is a full-width banner across the top plus confetti and the
winner's miniature getting a gold treatment; the board stays playable
underneath so the second winner can still happen.

**B. Arena (rejected).** Every board the same size in a grid, mine outlined.
Feels like a spectator view and makes the primary verb worse: my squares shrink
to fit four other boards, and marking becomes fiddly at half-monitor width.
Looking at other boards is passive and constant; marking is active and
frequent. Active wins the pixels.

Also rejected: keeping today's fullscreen win overlay. It blocks the board
until the host clicks, which contradicts the play-to-two-winners rule already
in use.

### State coverage

Every screen must handle all of these, not just the happy path:

| State | Where | Behavior |
|---|---|---|
| Empty | Lobby with one player | Big room code + copy link, "waiting for friends" with the invite as the only CTA |
| Loading | Room page on refresh | Skeleton of the board shape, not a spinner; marks pop in when restored |
| Reconnecting | Realtime dropped | Thin amber bar at the top, board still markable, syncs on return |
| Partial | A player's marks not yet received | Their miniature shows a dim "syncing" state, never 0/25 |
| Error | A write failed | Toast, board unaffected, retry silently |
| Dense | 6×6 card, 5 players | Rail scrolls; board never shrinks below a markable size |
| Won | One bingo, round live | Banner + confetti + gold miniature; board stays interactive |
| Round over | Host reset | Board flips to the new card with the round-start sound, no dialog |
| Night over | Host ended | Game Over with Play Again (host) or waiting copy (others) |

### Rejoin, specifically

What is restored today: the card, my marks, calls, winners. What is lost:
other players' marks (broadcast only), the round start time, and the landing
page has no memory of the room. The upgrade persists other players' marks
from the database on reconnect and adds the last-room chip. These are UX
requirements, not polish.

---

## Part 2 — Visual

**Status: specified.** The guardrails below were written first and still bind;
"Specified by the build" further down records what the upgrade (PRs #7-#12)
actually settled, and is the reference for anything added next. The palette and
fonts in CLAUDE.md ("Arcade Lounge") stand. Anything still not covered gets
asked about, not filled in with a framework default.

### Direction in his words

"Gamify it. Gamer aesthetic. A little flashy, not over the top." The bingo
sites he has used are "very bare-bones." He wants themes and colors, and a
moment when someone hits bingo.

### Guardrails (known now)

- **Dark-first, always.** Deep charcoal ground. Light mode is a theme, not the
  default.
- **Neon on black, not gray on gray.** Accent glows are the signature: marked
  squares, the winner, the live indicator. Everything not glowing is quiet so
  the glow reads. No flat gray surfaces; use translucent glass over the ground
  with a 1px lit edge.
- **One loud moment.** The bingo banner is allowed to be over the top for two
  seconds. Nothing else is. If everything glows, nothing does.
- **Themes are palettes, not layouts.** A theme swaps ground, accent, and glow
  color. The structure never changes between themes. Card presets and app
  themes are separate things and should stay separate.
- **Readable from across the room.** Player names, progress, and the room code
  in display size. Monospace for the code and any numbers.
- **Motion:** 150ms micro, 300ms panel, one long celebratory sequence. Every
  animation respects reduced-motion.
- **Glass over gradient.** Panels are translucent with a subtle top highlight,
  sitting on a vignetted ground, not opaque cards on a flat color.

### References that fit (Mobbin, 2026-09-07)

Local copies in `.design/refs/` (gitignored): `canva-lobby.webp`,
`suno-rail.webp`, `neon-snake-board.webp`, `codecademy-win.webp`. The Mobbin
links need a logged-in Mobbin session; the local files do not.

- [Canva Live](https://mobbin.com/screens/cfe8b2c6-9b1a-4cf7-bb9b-ce4917a10d2e): the giant join code with "visit X and enter code" as the whole
  screen. That is the lobby.
- [Suno Radio](https://mobbin.com/screens/72ebb179-c187-41e5-9caf-0eb6f7567c9e): glass panels over a vivid blurred backdrop, live activity in a
  side column. That is the rail.
- [Neon Snake](https://mobbin.com/screens/2584fa5d-dd69-4543-bbb7-ea1efb656eb1) (Google AI Studio): glowing marks on a dark grid with a
  leaderboard overlay. That is the board.
- [Codecademy course-complete](https://mobbin.com/screens/c827145c-7d03-4771-908c-6a6c4be2abc7): full-bleed dark celebration with confetti and
  one gold object. That is the bingo banner.

### Mockups

The approved game-screen mockups — Scoreboard, Arena (kept for comparison) and
Bingo Moment — were built from the real globals.css tokens. The durable copy
lives in **`.design/mockups/`**: the artboards themselves plus `SPEC.md`, the
extracted geometry, copy and colour that the build was scored against. That
folder is the reference to read; the canvas is the same work, live and
subject to disappearing:
https://claude.ai/code/artifact/0fd2c5cf-42bb-4202-bfe9-ed36ee460cbb

### Specified by the build (2026-09-08)

These were open questions when Part 2 was written. They are now answered by
what shipped in PRs #7–#12 — this section describes the app as built, and is
the reference for anything added next.

**Type scale.** Three families, each with a job. Nothing he reads is under
13px (ruled 2026-09-23, applied 2026-09-25); the only exemption is text sized
by measurement, below the table.

| Role | Face | Size |
|---|---|---|
| Win headline | Display, 800 | 38 |
| Player name (hero) | Display, 700 | 20 |
| Player name (rail) | Display, 700 | 17 |
| Wordmark, rail and panel labels | Display, 700–800, Title Case | 14–15 |
| Section labels (`SECTION_LABEL` in `src/lib/label.ts`) | Body, 600, Title Case, normal tracking | 14 |
| Room code | Mono, 700, `0.14em` | 26 |
| My score `N / 25` | Body, 700, tabular figures | 15 |
| Rail score `N / 25` | Body, 700, tabular figures | 13 |
| Pills — `Live`, `Your Board`, `1st`/`2nd`, `1st — Name`, `2nd — Open`, `Syncing`, History's placing; `Reconnecting` and `Offline` in the same type without the box | Body, 700, Title Case, tabular figures, line height 1, padding 3 × 8 (`PILL` in `src/lib/pill.ts`) | 13 |
| Body, status lines, buttons, labels, captions, table text, chips, avatar initials | Body, 500–600 | 13 minimum |
| Square text *(exempt: fitted)* | Body, 500, line height 1.25 | 12, 11 under the banner, on 6×6 and on small squares (floor 11, 2026-10-05) |

Square text is sized by measurement (`clamp(11px, 12–13cqw, 11–12px)` against
the square's own width), so it is the one exemption from the floor, with the
`FREE` label inside the free square and the text-less miniature tiles. Its line
height is 1.25, set on the text itself in BingoSquare, because a caller's
text-size class makes `cn` drop any `leading-*` on the square. A pill is 19px
tall (21px with a border), the height the 10px pills had, so raising the type
did not raise any row. Every number a player compares against another number
uses tabular figures, so digits line up down the rail. Mono is for the room
and claim codes only (2026-10-05, docs/decisions/0005).

**Radius language.** Radius encodes size, not decoration.

| Radius | Where |
|---|---|
| 10 (`rounded-2xl`) | Panels, the rail cards' parent, the win banner |
| 8 (`rounded-xl`, `rounded-lg`) | Rail cards, Home cards, the banner's trophy tile |
| 6 | Board squares, the miniature's frame |
| 2 | Miniature tiles |
| 999 (`rounded-full`) | Every pill, and avatars |

Buttons stay at 6 (`rounded-md`), which puts them in the same family as a
board square rather than as a panel.

**Theme set.** Six, all in `src/lib/theme.ts`, all palette-only — no theme
changes a layout, a size or a radius. Each swaps the ground, and each carries
its own gold so the win moment reads as metal against that particular ground.

| Theme | Ground | Accent (primary) | Gold |
|---|---|---|---|
| Midnight (default) | `oklch(0.18 0.016 275)` blue-charcoal | Violet `oklch(0.62 0.26 278)` | `oklch(0.82 0.16 88)` |
| Obsidian | `oklch(0.085 0.01 275)` near-black | Violet (inherited) | `oklch(0.84 0.16 88)` |
| Forest | `oklch(0.15 0.03 152)` | Emerald `oklch(0.65 0.22 152)` | `oklch(0.83 0.15 92)` warmer, to clear the emerald |
| Ocean | `oklch(0.15 0.03 220)` | Sky `oklch(0.65 0.18 210)` | `oklch(0.84 0.15 90)` |
| Crimson | `oklch(0.15 0.03 18)` | Rose `oklch(0.65 0.22 15)` | `oklch(0.85 0.15 95)` pushed yellow, to clear the red ground |
| Latte (light) | `oklch(0.96 0.012 80)` cream | Violet `oklch(0.52 0.26 278)` | `oklch(0.60 0.14 82)` darkened to survive on cream |

Amber stays fixed at `oklch(0.77 0.175 70)` in every theme: a marked square
must mean the same thing everywhere. Card style presets are a separate axis
and do not follow the app theme.

**The bingo sequence, beat by beat.** One loud moment, roughly two seconds.

1. `playBingo()` — the fanfare fires first, because it is what pulls a head
   away from the other monitor.
2. The banner slides down from the top of the body over **300 ms**, in flow
   between the header and the board — never over it. The hero grid transitions
   608 → 520 px and the miniatures 108 → 90 px in the same 300 ms, so the
   banner takes its space from the layout rather than covering it.
3. Two confetti cannons fire from the top corners for **1.5 s** — violet,
   amber, gold, pink.
4. The winner's rail card turns gold: gold border and glow, a mono `1ST`
   beside the score, gold progress fill, and the miniature outlines the winning
   line in gold instead of emerald.

The board stays interactive the whole time. A **second winner** is a quieter
echo of the same shape: the fanfare again, a single centre burst, a `2ND` pill,
gold on their card; the banner's headline stays with the first winner and only
the `2ND — OPEN` pill fills in.

**Reduced motion:** the banner simply appears — no slide, no confetti. The
fanfare still plays; a sound is not motion. Nothing else is cancelled.

**The miniature board.** Someone else's whole board, readable without a click.
20 px tiles at the 108 px default, 16.4 px at the 90 px size the win banner
forces; 2 px gaps, 6 px frame padding, radius 6 on the frame and 2 on a tile.

| Tile | Meaning |
|---|---|
| Amber fill + glow | Marked |
| Violet fill | Free space |
| Emerald 1 px outline | On their best line |
| Gold 1 px outline | The line that won it |

A rail card pairs the miniature with the name, a mono `N / 25`, a 4 px progress
bar (emerald when they are one away, amber otherwise) and the same best-line
sentence my own board uses: `Row 3 — one away`, `Column 2 — two away`,
`No line yet`, `Bingo — column 2`. The name has its line to itself — no avatar
circle — because beside the miniature the column is 134px (152px under the
banner) and a real name at 17px ("Asian Baby Boi", 116px) did not fit after a
26px avatar; the `1ST`/`2ND` pill sits beside the score. At 13px the sentence
may take two balanced lines inside the miniature's height.

**Reconnecting and syncing.** Both are ambient; neither takes a click or
covers the board.

- **Reconnecting.** The `LIVE` pill is replaced by a 3 px amber bar spanning
  the full width under the header, glowing, with a mono `RECONNECTING` at the
  right edge. The board stays markable and catches up when the channel returns.
- **Syncing.** A player whose marks have not arrived renders their miniature at
  45 % opacity with a mono `SYNCING` pill where the score goes — never `0 / 25`,
  which would be a lie about someone's board. They also sort to the bottom of
  the rail: an unknown board must not outrank a known one.

### Rulings

One line each, dated, so they are not relitigated.

- **Landing History and Leaderboard tiles (2026-09-24).** Colour identity, no
  glow: a tinted icon plate per link (violet History, gold Leaderboard),
  display-face title at 16, subtitle at 13. They stay smaller than Host/Join,
  because they are aftermath. Rejected: promoting them to peer cards with a
  glow, since the glow belongs to the win.
- **Game Over links to tonight's history (2026-09-24).** Everyone gets a
  Tonight's Results button between Play Again and Back to Home. It opens
  `/history?night=<room id>` with that night expanded. The "no history chrome
  on the game screen" rule covers live play, not Game Over.
- **History text floor and card snapshot (2026-09-24).** Nothing on History
  is under 13px except the `1ST`/`2ND` pill, which follows the app-wide pill
  scale. The Your Card snapshot is 480px wide with the hero board's square
  text sizing, so every word fits whole; it must not shrink back to thumbnail
  size, where long words broke mid-word.
- **Latte landing tiles are flat (2026-09-24).** On Latte the History and
  Leaderboard tiles drop the glass drop shadow (`.glass-tile`) to match the
  flat Host/Join cards above them. Latte glass everywhere else is unchanged.
- **Game marker (2026-09-24).** A square on a card with games carries its
  game's icon alone in the top-left corner, in the game colour, stroke 1.75:
  16px, 14px on squares under 88px, 12px under 78px (the text then sits below
  it). The square's face is untouched, so marked amber, the hot lane and the
  called wash read as before, and a marked square keeps its marker. The legend
  (icon + name at 13, only the games on that card) sits in the hero name row,
  where it takes the Your Board pill's place, and above the History snapshot;
  the names fall back to icons when the row cannot hold them. Rail miniatures
  stay plain. The `car` key draws the front-view car. Rejected: a 12% wash (a
  Call of Duty square on the hot lane was 0.02–0.03 OKLab from marked amber),
  a 3px edge bar plus the icon ("too much going on"), a solid corner tab
  (busier still).
- **Game palette (2026-09-24).** Sky `oklch(0.64 0.15 240)`, cyan
  `oklch(0.61 0.11 200)`, rose `oklch(0.62 0.22 8)`, orange
  `oklch(0.66 0.19 38)`, pink `oklch(0.66 0.21 345)`. Each is at least 3:1 on
  the Latte square (sky 2.9:1 on the bare Latte ground) and 4.2:1 on the
  Midnight square, with hues clear of amber, gold, emerald and violet; orange
  is darker and redder than amber (0.145 apart in OKLab, was 0.097). The DB
  stores the keys, so the values can move without a migration. Icon keys also
  offer Skull and Bomb.
- **Type floor (2026-09-25).** 13px floor applied app-wide; pills 13px; square
  text stays fitted and exempt; square line height 1.25. The pill scale is one
  constant (`src/lib/pill.ts`) with tracking cut from 0.10em to 0.04em so 13px
  does not shout. The rail card drops its avatar and moves the placing pill
  beside the score so real names show whole; the profile dialog scrolls inside
  the window instead of running off it.
- **Card builder is a list he fills (2026-10-01).** New cards start empty;
  library rows toggle Add / Added (quiet) / Remove (on hover); the card is a
  numbered list with dashed Empty rows and ✕ per square; Fill Empty (amber
  split button, mix in its menu) is the only random step. Pins, Swap and
  Reshuffle are gone. Rejected: the random deal with holds ("the most
  confusing thing ever"). See docs/decisions/0004.
- **Game logos (2026-10-02).** A game can carry an uploaded logo (chip →
  Add Logo); it replaces the coloured icon on every surface. His picks are
  one-colour white marks (the MW wordmark, the Rocket League car) because
  they "don't detract from the square itself". Rejected: full-colour box-art
  icons (mush at 16px) and the coloured shield/badge emblems. White marks
  vanish on Latte. (2026-10-05: the silhouette amendment below already draws
  them in the game colour on every theme, Latte included; Latte stays a
  theme he can pick and must look right.)
  Amended the same day: on Classic's white squares the white marks vanished
  entirely, so a one-colour logo is now drawn as a silhouette in the game's
  colour (MW orange, RL blue). Only a logo uploaded as full colour keeps its
  own pixels.
- **Card frame and styles (2026-10-02).** A style with its own card colour
  frames the squares on all four sides at the gap width, with rounded
  corners; before, the colour showed only between squares and the outer row
  "looked truncated". Styles cut to four: Default, Classic, Neon, Slate
  (Ocean, Sunset, Forest and Retro removed).

---

## Build findings (2026-09-07 audit, feed into the plan)

Ryann's asks after approving the mockups: persistent identity without
signup, history of games played, and a review of import + randomize.

**Identity.** Anchor is a localStorage UUID matched to `players.browser_id`.
Same browser a week later works, avatar included (Supabase Storage,
public URL on the player row). Cleared site data, a new browser, or a new
PC silently creates a new player and orphans all history. The anonymous
auth session exists but is never used as a lookup key. Requirement: a
short **claim code** on the profile ("Enter this on another PC to be you
again") that re-links `browser_id` to the existing row. Three friends, no
signup, so this is the whole recovery story.

**History.** History shows only your own rows: card, room, round, win
badge, your board. It does not show who else played or who won.
Leaderboard fetches every `game_players` row for everyone and counts
cancelled games as played. `game_nights` table is dead. Requirement:
history is per **night** (room), lists every player and the winner per
round; leaderboard is scoped to the friend group and ignores cancelled
games.

**Import + randomize.** Parser splits on newlines only, no commas, no
dedup. Fisher-Yates + mulberry32 are correct; each player gets a
different card per round from seed + playerId. Two real bugs:

- Pasting more lines than squares **silently truncates** at import. The
  surplus-pool logic in `shuffle.ts` (different random subset per round)
  exists but is unreachable because templates cap at N². Requirement:
  templates hold the whole list; each round draws N² (or N²−1 with free
  space) from it per player. This is the feature he thinks he built.
- Pasting fewer lines than squares renders a short board. Requirement:
  block save with a clear count ("24 needed, 10 so far").

Also: accept commas as separators when a paste has no newlines, dedupe
case-insensitively, and show the surplus count ("40 items, 24 per card").
