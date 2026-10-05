# Design audit punch list

Source: `docs/design-audit-2026-10-04.md`, checked against
`~/.claude/docs/design-preferences.md` (rule numbers refer to it). Kept apart
from `.design/PUNCHLIST.md` and `.claude/PUNCHLIST.md`, which belong to other
workstreams.

## 2026-10-05 — his brief, verbatim

Settled (he accepted all of the audit's deviation recommendations on 2026-10-05):
- Mono: keep it for the room code only (read aloud; O/0 and I/1 must be clear). Scores move to the body font with tabular figures; pills move to the body font in Title Case ("Live", "1st").
- Fonts: keep the "NOT Inter" choice. Outfit and Plus Jakarta Sans are what actually load; remove Clash Display and Satoshi from CLAUDE.md.
- Square text: keep the sized-to-fit exemption, but try 11px as the floor.
- Neon and glass: keep, but lift the ground (vignette to about 22%, or Midnight's documented oklch(0.18)).
- The bingo banner is the one loud moment; trim the three-pulse glow on marked squares.
- Latte stays as a picker choice. Fix the white game logos that vanish on Latte, and remove DESIGN.md's "nobody plays on Latte" line.

Violations, four per batch, in the audit's ranking order:
- All-caps tracked labels → Title Case, 13px+ (rules 9, 10).
- Radius: cap rounded-xl/2xl at 10/8/6 (rule 36).
- The 11–12px uppercase headers in the swap dialog (rules 1, 10).
- Detached spinners → skeletons or progress on the control (rule 61).
- Then the rest: the 2px gutter misalignment, "Profile Saved" status case, Undo on removing a saved card, "cancelled"→"canceled", the raw error.message toast, and mixed icon strokes.
- The narrow centred column (max-w-3xl, 2xl, lg) → a wider layout is a feature. Grey wireframe first, then wait for his go.

## Triage

Visual proof: every screen renders against a local fake Supabase (`npm run dev:mock`,
scripts/mock-supabase/), so no screenshot run can reach his live project.

| # | Item | Size | Batch | Status |
|---|---|---|---|---|
| 1 | All-caps tracked labels → Title Case, 13px+ (audit 1) | Tweak | 1 | Shipped (batch 1) |
| 2 | Radius cap: panels 10, cards 8, controls 6 (audit 3) | Tweak | 1 | Shipped (batch 1) |
| 3 | Swap dialog 11–12px uppercase headers → 13px Title Case (audit 2) | Tweak | 1 | Shipped (batch 1) |
| 4 | Detached spinners → skeletons / progress on the control (audit 4) | Tweak | 1 | Shipped (batch 1) |
| 5 | 2px gutter misalignment on Home (audit 6) | Tweak | 2 | Shipped (batch 2) |
| 6 | Status lines as sentences: "Profile saved.", "Loading your cards…" (audit 7) | Tweak | 2 | Shipped (batch 2) |
| 7 | Undo on removing a saved card (audit 8) | Tweak | 2 | Shipped (batch 2) |
| 8 | "cancelled" → "canceled" (audit 9) | Tweak | 2 | Shipped (batch 2) |
| 9 | Raw `error.message` toast in Library → friendly fallback (audit 11) | Tweak | 3 | Shipped (batch 3) |
| 10 | One icon stroke, 1.75 (audit 12) | Tweak | 3 | Shipped (batch 3) |
| 11 | Mono only for the room code; scores tabular body font, pills body Title Case | Tweak | 3 | Shipped (batch 3) |
| 12 | CLAUDE.md fonts: drop Clash Display and Satoshi | Tweak | 3 | Shipped (batch 3) |
| 13 | Square text floor 10 → 11px | Tweak | 4 | Shipped (batch 4) |
| 14 | Lift the ground (vignette ~22% or oklch 0.18) | Tweak | 4 | Shipped (batch 4) |
| 15 | Marked-square glow: keep the dab, drop the three breaths (audit 10) | Tweak | 4 | Shipped (batch 4) |
| 16 | Latte: white game logos visible; drop "nobody plays on Latte" | Tweak | 4 | Shipped (batch 4) |
| 17 | Wider layout for Home, History, Leaderboard, Lobby (audit 5) | Feature | — | Grey wireframe first, then wait for go |
