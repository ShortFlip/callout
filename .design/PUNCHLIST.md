# Punch list

## 2026-09-26 — after the first game night on the Item Library

> I used this last night and the one thing that's a little confusing is being able to, how to add, different items to different cards. Like in the library section, I feel like the pinning thing, it makes sense, but I'm a little confused about how to make sure what I'm picking on the left goes over the other side, you know what I mean? Other than that, the board worked well. I think what we need also for if we're going to have the free space on a smaller grid than a 5x5, we need to have the free space in random areas because it was generating, it was put in the same spot for all of our cards, which is not a problem, but, I think that needs to be a thing as well. Also, when we were playing Rocket League last night, it was very hard to obtain any of those things we got, so maybe we just like, here's what I'm envisioning. When we're playing a game, we are, we usually start with Rocket League and then we'll go and jump to Modern Warfare, but then we still have like, say if we have two squares that are Rocket League-esque on the board. We'll never hit those. I was thinking, if we don't hit those, give us an option like mid-match to like, re-roll or get remove the Rocket League ones, just to add other ones back in that are actually Modern Warfare. Those are just my takeaways from last night.

| # | Item | Size | Status |
|---|------|------|--------|
| 1 | Library: unclear how picking on the left reaches the card on the right | Tweak | Shipped #36 (not seen live) |
| 2 | Free space in a random spot per card (grids under 5×5) | Feature | Shipped #39 (not seen live) |
| 3 | Mid-round swap of one game's squares for the other game's | Feature | Shipped #37 (test next game night) |
| 4 | Item hit-rate heatmap from past rounds | Feature | Shipped #38 (not seen live) |

### 1 — Library left→right flow (tweak)
The card auto-fills from the Mix; `+` on the left pins an item into it, bumping an unpinned square. Nothing on screen says that. Fix: one hint line under the `24 / 24` count ("Mix fills the card · + on the left pins an item in, bumping an unpinned square"), and a brief amber flash on the square that landed on the right. ui-pass round with before/after screenshots.

### 2 — Random free-space position (feature)
- **What:** each player's FREE square lands at a seeded random index instead of the fixed centre.
- **Data shape:** no schema change — position is already implicit in `card_data` (`isFreeSpace`). Win detection and `bestLine` currently hard-code `floor(N²/2)`; they must read the index from the card instead.
- **Layout call:** random on every size, or only under 5×5 (5×5 keeps the classic centre)? Recommend: only under 5×5, since the centre is the tradition on 5×5 and 3×3/4×4 have no true centre anyway.
- **Model:** Opus 5.5 · **Effort:** medium
- **Done:** two players on a 4×4 get FREE in different spots; a line through each FREE wins; Vitest covers win detection with an off-centre FREE.

### 3 — Mid-round game swap (feature)
- **What:** a host button in the game header — "Swap Rocket League → Modern Warfare" — that replaces every **unmarked** square of one game on every card with fresh items from the other game, mid-round.
- **Data shape:** rewrites `game_players.card_data` for each player; new broadcast `cards_swapped` so tabs reload cards. Marked squares stay put. No schema change.
- **Layout call:** host-only, in `HostControls`, appears only when the card has 2+ games.
- **Model:** Opus 5.5 · **Effort:** high (new write path across every player's card mid-round)
- **Done:** two browser contexts; host swaps; both boards show no unmarked Rocket League squares, marks intact, no reload needed.

### 4 — Item hit-rate heatmap (feature)
> "a bunch of ones … picked more often than others … we usually get one bingo and then we get 75% of the way on the second one and we never get a second one … a heat map distribution of what items were called … based on the historical playthroughs"
- **What:** per item, hit rate = times marked ÷ times it was on a card, over every past round. Shown as a heat column/badge in the Library item list (cold blue → hot amber), sortable, plus a "Card Heat" estimate on the card builder (average hit rate of the drawn set).
- **Data shape:** no new table — every round already stores `game_players.card_data` + `marks`. Compute from those (match by `libraryItemId`, fall back to lower-cased text for pre-library rounds). Cache later only if it gets slow.
- **Layout call:** heat lives in the Library row (thin bar + %), not a separate page — it's used while building a card.
- **Model:** Opus 5.5 · **Effort:** medium
- **Done:** Library rows show hit % that matches a hand count from the DB for 3 items; sorting by heat works; card builder shows the set's average.

## 2026-10-03 — after the game night on #43–#46

> Last night we played another round or a couple rounds of squares. It worked pretty well. I noticed that there was some syncing issues. Like when I'm looking on my card and then I see my friend's cards, they're telling me that there's different, they're seeing something checked, but I don't. I'd have to refresh the page for it to show. That was weird and it happened to them as well, so they had to refresh in order to see. Then secondly, one of my friends hit the bingo too early, and then he backed off, and then the banner stayed persistent the whole time. Is there a way to fix that issue or is that just kind of how it is? Also, let's generate a logo for squares. Something, I don't care, all my settings and my preferences and everything, so just generate something. Maybe a couple batches, so I can see potential ideas. Also, I think the swap thing did work in mid-game, but I think it'd be better if, when I hit the swap button, it comes up with a prompt and asks me which ones I want to replace the two Rocket League or squares with.

| # | Item | Size | Status |
|---|------|------|--------|
| 1 | Friends' marks don't show until refresh | Tweak | Go given 2026-10-03 (I misread "no big deal" as parked); building on `marks-catch-up` |
| 2 | Early bingo, then backed off: banner stayed all round | Feature | Shipped #48 (two-context gate passed; not seen on a game night) |
| 3 | Squares logo, a couple of batches | Feature (`/logo`) | Shipped #49: 1F (grid, blue to magenta, seamless) as the tab icon |
| 4 | Swap asks which items replace the dropped squares | Feature | Shipped #50 (two-context gate passed; not used on a game night) |

### 1 — Marks don't show until refresh (tweak)
Marks travel only as a `mark_updated` broadcast. A tab that misses one (socket half-asleep behind a game, no error raised) never hears it again: the DB fallback covers `rooms` and `games`, not `game_players`, and `loadGamePlayers` only reruns on a resubscribe. That is why a refresh fixed it. Fix: reread `game_players` on a short interval while a round is live and whenever the tab regains focus, never rewinding a mark newer than the read. No migration, no new broadcast.
- **Model:** Opus 5.5 · **Effort:** medium
- **Done:** two browser contexts; drop B's `mark_updated` handler; A marks; B's rail shows it within the interval with no reload.

### 2 — Retract an early bingo (feature)
- **What:** a winner who unmarks so no pattern holds is un-won everywhere: banner, gold rail card, placing.
- **Data shape:** no schema change. `game_players` back to `won = false`, `finish_position`/`bingo_time_ms` null; `games.status` back to `active` when no winner is left; new broadcast `bingo_retracted`; `removeWinner` in the store; later winners move up a place. `loadGamePlayers` must drop a winner the DB no longer has.
- **Layout call:** silent retraction, no confirm (DESIGN.md: never confirm a mark). Confetti does not replay if they win again by the same line within the round? Recommend: it replays, a real win is a real win.
- **Model:** Opus 5.5 · **Effort:** medium
- **Done:** two contexts; A wins, B sees the banner; A unmarks; banner and gold card clear on both within a second, DB row shows `won = false`; A re-wins and places first again.

### 4 — Swap asks which items go in (feature)
- **What:** the Swap confirm becomes a picker: it lists the target game's unused items (round pool + library) and the host ticks which ones go in; unticked = today's random draw.
- **Data shape:** `handleSwapGames` gains an optional `chosenItemIds: string[]`; `swapGameSquares` uses the chosen items first, then the seeded draw. No schema change, same `cards_swapped` broadcast.
- **Layout call (his answer, 2026-10-03):** every card holds the same items, so the leftover Rocket League squares are the same ones for everybody. "If I hit swap these cards out, it would come up and say which two modern Warfare squares is what you want in their places." So the prompt lists the dropped items and the host picks exactly that many replacements; each dropped item maps to the same replacement on every card. A player who already marked a dropped square keeps it.
- **Model:** Opus 5.5 · **Effort:** medium
- **Done:** two contexts; host picks 3 items; every unmarked dropped square on both boards is one of those 3 (or a random fill once they run out); marks intact; Vitest covers chosen-first order.
