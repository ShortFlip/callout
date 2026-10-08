# Build findings (2026-09-07 audit)

> Moved out of DESIGN.md. All of this shipped; it is history, not a rule.

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
