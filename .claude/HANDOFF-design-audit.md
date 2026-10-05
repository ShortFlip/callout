# Handoff — design audit workstream (2026-10-05)

Separate from `.claude/HANDOFF.md`, which belongs to another workstream. Do not
read, edit or commit that file, `.claude/PUNCHLIST.md`, `.claude/archive/` or
`squares-list.*` in the main checkout: they are another session's uncommitted
work. Work in your own worktree.

## Where things stand

- All 16 tweaks from `docs/design-audit-2026-10-04.md` shipped, four per PR:
  #55 (Title Case labels, radius cap, Swap dialog, skeletons + the fake
  Supabase), #57 (Undo on Remove, Home gutter, copy), #58 (mono for codes only,
  one icon stroke, no raw error toast, CLAUDE.md fonts), #59 (11px square floor,
  ground lift, dab-only marks, Latte line). All on origin/master (08d9691);
  every CI deploy green.
- Status table: `.design/AUDIT-PUNCHLIST.md`. Rules: `docs/decisions/0005`.
- Realtime teardown recursion found during the build was fixed in its own
  session (#56).
- Main checkout sits on master at 17b4225 (behind origin), left alone because
  of the other session's files. No worktrees of this workstream remain.

## Decisions (do not relitigate)

- Settled by him 2026-10-05: mono only for room/claim codes; fonts Outfit +
  Plus Jakarta Sans (NOT Inter); square text floor 11px; neon/glass kept with a
  lifted ground; bingo banner is the one loud moment; Latte stays a theme.
- Remove a saved card: acts at once with Undo on the toast; the confirm dialog
  is gone (his call).
- Midnight's base colour stays oklch(0.18); no further lift (his "no"
  2026-10-05). The lift is the 22% vignette on a wider ellipse only.
- The win headline stays uppercase: the one loud moment, stylised headlines
  allowed.
- In-button spinners stay; only detached spinners became skeletons.
- Screenshots: before = a second worktree at origin/master running the mock on
  ports 3124 / 54398 (`MOCK_NEXT_PORT=3124`, `.env.mock` URL edited to 54398);
  after = `npm run dev:mock` on 3123 / 54399. Never `npm run dev` for visual
  checks: it signs in anonymously against his LIVE Supabase.

## Unverified

- Skeleton rows never seen on screen (the mock answers too fast). A delay
  option in the mock would show them.
- Board logos never seen under the mock: `safeLogo` in
  `src/lib/library/legend.ts` accepts only https and the mock serves http.
  Library shows logos fine on Latte.
- The Library card-open failure path (LibraryError-only message) not exercised.
- 11px square text breaks "quickscope", "disconnects", "Teammate" mid-word in a
  670px-tall window (below the 1280×800 minimum; 10px already broke two).

## Next actions

1. **Wider layout, Home first** (audit item 5, rule 24/25). Feature: grey
   wireframe of real-app patterns first (design rule 79), no styling, no code
   in `src/`. Ask his vision before sketching (rule 78). Audit's suggestion:
   bento with Your Cards beside Host and Join. Then History, Leaderboard,
   Lobby (`max-w-3xl` / `2xl` / `lg` columns today). **Needs him**: vision,
   then go on the wireframe.
2. **Game Over "Round 0" on a cold load** (small fix, he said yes):
   `GameOver` reads round number and winners from the in-memory game store,
   which a finished room never fills after a refresh. Load the latest round
   and winners from the database. Reproduce on the mock at `/room/ENDED2`.
3. Optional: dev-only `safeLogo` allowance for `http://127.0.0.1` so board
   logos render under the mock.

## Pointers

- Fake Supabase: `scripts/mock-supabase/README.md` (room codes QUEUE2 lobby,
  GAME22 in game + Swap, CHAMP2 win, ENDED2 Game Over, FRDAY2 canceled round;
  `?state=` harness in `src/lib/dev-state.ts`).
- Worktree needs a `node_modules` junction to the main checkout's; remove the
  junction with `cmd /c rmdir` before `git worktree remove`, or the removal can
  follow it.
- Theme key in localStorage: `squares:theme` (`midnight`, `latte`, …).
- Playwright MCP saves only inside the session's working directory; stitch
  pairs with ImageMagick `magick a.png b.png -resize 50% +append pair.png`.
