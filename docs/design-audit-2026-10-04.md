# Squares design audit, 2026-10-04

Audited against `~/.claude/docs/design-preferences.md`. Read-only. Copied into the repo on 2026-10-05 by the fixes session; the screenshots named below stayed in the auditing worktree.
Live captures: Home in Midnight (dark) and Latte (light). History, Leaderboard and Library would not load past their spinners, because I blocked anonymous sign-in so the audit wrote nothing to his Supabase. The board, lobby, Game Over and win banner need a live room, so findings for those screens come from the source code only (marked **src**). DESIGN.md says "desktop only, no mobile work, ever", so the phone captures are for reference only and are not scored.

**Summary:** 11 violations: 3 high, 5 medium, 3 low. Plus 6 deliberate deviations to decide on.

| # | Rule | Where | What he'd see | Suggested fix | Size |
|---|---|---|---|---|---|
| 1 | 10, 9 all-caps labels | `CallerPanel.tsx:56`, `PlayerList.tsx:17`, `RoomCodeDisplay.tsx:47`, `GameOver.tsx:42`, `ProfileModal.tsx:237`, `ThemePicker.tsx:25`, `PlayerStats.tsx:160,185`, `history/page.tsx:368`, `leaderboard/page.tsx:114` (header row), `GameLobby.tsx:120` (**src**) | Small letter-spaced captions such as "CALLER PANEL", "PLAYERS (4)", "ROOM CODE", "THEME", "BADGES" | Use Title Case at 13–15px with normal tracking, bold or accent colour for hierarchy | small |
| 2 | 1 type floor, 10 | `SwapPicker.tsx:179,211` (11px uppercase headers), `:215,252` (11–12px), host Swap dialog (**src**) | The one dialog still below 13px, two years after the floor was set app-wide | Raise to 13px and use Title Case | tweak |
| 3 | 36 radius 6–10 | `--radius` 8px, so `rounded-xl` = 11.2px and `rounded-2xl` = 14.4px: 31 uses (Home cards, panels, rail cards, popover, win banner) | Home cards and game panels read rounder than his 6–10 range | Cap panels at 10 and cards at 8, and keep the size ladder (10 / 8 / 6 / 2) | small |
| 4 | 61 progress on the control | Detached spinners: `leaderboard/page.tsx:103`, `CallerPanel.tsx:107`, `TemplateList.tsx:75`, `SwapPicker.tsx:155`, `GameLobby.tsx:163`; "Loading Your Cards…" on Home | A lone spinning ring and the word "Loading…" | Use skeleton rows (as History and Library already do) or a fill on the control itself. In-button spinners on Save and Create can stay for now | small |
| 5 | 24, 25 dense, edge to edge | Home `page.tsx:88` `max-w-3xl`, Leaderboard and History `max-w-2xl`, Lobby `max-w-lg` | A narrow 768px column centred on a 1440 screen, with large empty sides | Widen Home into a bento layout that puts Your Cards beside Host and Join, and give Leaderboard and History real width | feature |
| 6 | 26 alignment | Home: top cards span 336–712 / 728–1104, bottom tiles span 336–714 / 726–1104 | The two rows of cards miss each other by 2px at the middle gutter | Put both rows on one grid with one gap | tweak |
| 7 | 9 descriptions stay sentences | "Loading Your Cards…" (Home), "Profile Saved" toast (`ProfileModal.tsx:155`), "No Winner" status (`history/page.tsx:371`) | Status lines in Title Case | "Loading your cards…", "Profile saved." Keep "No Winner" if it is meant as a pill | tweak |
| 8 | 77 Undo on destructive actions | `TemplateList.tsx:55-59` remove saved card | The card vanishes with only a toast, and there is no way back | Add an Undo action to the toast. The pattern is already in 4 other places | small |
| 9 | 71 US spelling | `leaderboard/page.tsx:97` "cancelled rounds" | British spelling in UI copy | Change to "canceled" | tweak |
| 10 | 63, 62 animate only for a reason | `globals.css:335` `.sq-marked`: a scale dab followed by three 2s glow breaths on every mark | With several marks in quick succession the board keeps pulsing, a smaller second loud moment | Keep the 150ms dab and drop the breaths, or limit them to one | tweak |
| 11 | 75 human errors | `library/page.tsx:53` shows `error.message` for any Error | A raw Supabase or JS string can reach a toast | Use the friendly fallback unless the error is a `LibraryError` (as `CreateRoomDialog` does) | tweak |
| 12 | 58 matched icons | 46 icons at stroke 1.75, 9 at 2, plus every lucide icon that sets no width (default 2) | Slightly mixed icon weights | Set one stroke globally (1.75) | tweak |
| 13 | 18 content never blurred | `dialog.tsx:34` `backdrop-blur-xs` on the dialog overlay | The page blurs behind the name prompt | Low priority: this is a modal scrim, close to the "glass backdrop" exception. Keep it unless he dislikes it | — |

Severity: high = 1, 3, 5. Medium = 2, 4, 6, 8, 10. Low = 7, 9, 11 (12 and 13 are notes).

## Deliberate deviations: keep or align?
- **Mono for room code, scores and pills (JetBrains Mono loaded).** Room code: **keep**. It is read aloud over a call, and mono rules out O/0 and I/1 confusion; that is a real design choice. Scores (`N / 25`): **align** to Plus Jakarta Sans with `tabular-nums`, which lines digits up just as well. Pills (`LIVE`, `YOUR BOARD`, `1ST`…): **align** to the body face in Title Case ("Live", "Your Board", "1st"). These are labels, not codes, and they also break rules 9 and 10. The Home join input's mono "ABC123" placeholder follows the room code, so keep it.
- **"NOT Inter"; Outfit, Clash Display and Satoshi named.** **Keep.** What actually loads: Outfit (display), Plus Jakarta Sans (body, neutral on the list), JetBrains Mono. Clash Display and Satoshi are not loaded, so trim them from CLAUDE.md. (Geist showed in `document.fonts`, but it comes from the Next dev overlay, not the app.)
- **Square text down to 10px (fitted).** **Keep the exemption, but raise its floor to 11px.** Fitting text to the square is legitimate, and a 6×6 card needs it. 10px is where he has called type "ridiculously small", though, so try 11px on the smallest squares first and check that long words still fit.
- **Neon on black and glass over gradient on a vignetted ground.** **Keep, and lift the ground a step.** The ground has a glow, so rule 14 passes on paper, but it measures near-black (L\* about 5) and the 14% violet vignette is faint. Push the vignette to about 22% or use the documented Midnight `oklch(0.18…)`. The glass has no blur and is a 2–5% white tint, so text stays readable, and menus already use opaque `bg-popover`. Rule 16 is met in spirit.
- **One loud moment (the bingo banner).** **Confirmed: only one.** The fanfare, banner and confetti are a single sequence, and a second winner is a quieter echo of it. Confetti respects reduced motion (`disableForReducedMotion`) and the CSS block covers the banner and marks. The only rival is the marked-square glow from row 10, so trim it.
- **Light treated as a theme (Latte).** **Align, partly.** Latte looks good on Home (screenshot below), so keep it as a picker choice. But DESIGN.md accepts white game logos vanishing on Latte because "nobody plays on Latte". Rule 13 says light ships good, so fix logo contrast on Latte and drop that line. Following the OS theme is optional for a party game.

## Passes
Muted text contrast (L\* 67 on L\* 5, about 7:1). Opaque menus. Matched line icons. Lucide only. No hover lift or scale. No Mac glyphs or keycaps. Reduced motion respected. Title Case on buttons and headings. Human error fallbacks in most places. Six themes palette-only. Fonts vendored locally.

## Screenshots (`C:\Users\ryann\Projects\voxal\.claude\worktrees\reverent-feistel-f161ca\.playwright-mcp\`)
- `sq-home-desktop-dark-nodialog.png` (best overall: Home in Midnight with the name prompt removed)
- `sq-home-desktop-light.png`: Latte
- `sq-home-desktop-dark.png`: first run, with the name prompt over the blurred page
- `sq-leaderboard-desktop-dark.png`: stuck at the detached "Loading…" spinner
- `sq-{home,history,leaderboard,library}-{desktop,phone}-{dark,light}.png`: the rest. History and Library show skeletons only. The phone shots are reference only (the app is desktop only)
