# The original phase plan is history, not spec

- **Date:** undated (written before the 2026-04-10 scaffold)
- **Symptom:** Phase 1.7 promises a "BINGO!" button and Edge Function verification; the build auto-claims with no button and verifies nothing server-side.
- **Measurement:** none recorded
- **Rule:** Where this plan disagrees with the code or CLAUDE.md's Architecture section, the code wins. Ask before building a plan item that has not shipped.
- **Code site:** none (plan only); the 2026-09 upgrade plan is archived at `.claude/archive/UPGRADE-PLAN.md`

## Original note (moved verbatim from CLAUDE.md, 2026-09-22)

## Phase Plan

### Phase 1: Core MVP — "Let's Play Bingo"
Everything needed for a functional game night.

**1.1 — Project scaffold**
- `npx create-next-app@latest squares --typescript --tailwind --app --src-dir`
- Install deps: `@supabase/supabase-js`, `@supabase/ssr`, `zustand`, `canvas-confetti`
- Init shadcn/ui: `npx shadcn@latest init`
- Add shadcn components: button, input, dialog, card, badge, tooltip, dropdown-menu, separator, select, label, textarea, tabs
- Set up Tailwind config with design tokens (colors, fonts)
- Set up Supabase client (browser + server)
- Set up root layout with font loading + theme provider

**1.2 — Database schema**
- Create Supabase project
- Write and run migration `001_initial_schema.sql`
- Set up RLS policies
- Generate TypeScript types with `supabase gen types`

**1.3 — Player identity**
- `browser-id.ts` — generate/retrieve UUID from localStorage
- `usePlayer` hook — resolve current player (anonymous or authed)
- Auto-create player record on first visit
- Display name prompt on first visit (stored in DB)

**1.4 — Card template creator**
- Board size selector (3x3 through 6x6)
- Text entry per square (click to edit)
- Bulk paste word list (auto-fills grid)
- Free space toggle
- Shuffle mode toggle (full vs. column-locked)
- Card title input
- Preview mode (see a shuffled version)
- Save template to DB

**1.5 — Room creation + join flow**
- Host creates room → selects template → gets 6-char room code
- Join page: enter room code → enter display name → enter lobby
- Lobby shows connected players, host can start game
- Shareable URL: `/room/[code]`

**1.6 — Real-time game engine**
- `useRealtimeRoom` hook — subscribe to room channel
- Host caller panel: ordered call list, "Call Next" button, called items display
- Player board: shuffled card generated from seed, click to mark squares
- Real-time events: `item_called`, `square_marked`, `bingo_claimed`
- Call history visible to all players

**1.7 — Win detection + verification**
- Client-side win check on each mark (for instant feedback)
- "BINGO!" button appears when win detected
- Server-side verification via Edge Function (regenerate card from seed, validate marks against calls)
- Winner announcement broadcast to all players
- Confetti cannon animation

**1.8 — Round management**
- Host can start new round (reshuffles all cards, resets marks)
- Round counter visible in room
- Game results saved to DB after each round

**1.9 — Landing page**
- Clean, inviting landing page
- Two CTAs: "Create a Game" and "Join a Game"
- Room code input for joining
- Brief explanation of what Squares is

---

### Phase 2: Customization Engine
- Custom background images (upload to Supabase Storage)
- Custom square colors (called, uncalled, marked, free space)
- Custom grid line color, width, style
- Google Fonts picker + font color
- Text shadow/outline toggle
- Images per square (drag-and-drop)
- Text + image combo per square
- Save/load card templates
- Dark/light mode toggle

### Phase 3: Competitive Features
- All-time leaderboard (wins, win rate, games played, streaks)
- Game night history (date, participants, per-round results)
- Card snapshots (screenshot of winning card)
- Player profiles with stats dashboard
- Achievement badges

### Phase 4: Power Features
- Auto-caller with configurable interval
- Text-to-speech for called items
- Full-screen caller display
- Custom win pattern builder (visual editor)
- Game modes: Standard, Speed, Blackout, Pattern, Multi-winner
- In-game chat/reactions
- Sound effects
- Spectator mode
- Room passwords
- QR code to join
- Print support (PDF export)

### Phase 5: Social & Polish
- Share game results as images
- Rematch button
- Recurring game night scheduling
- PWA support
- WCAG 2.1 AA accessibility
- Mobile-optimized interactions
