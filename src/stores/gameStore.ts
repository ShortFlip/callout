import { create } from 'zustand';
import type { SquareItem, CardStyles } from '@/types/card';
import type { WinPattern, GameMode } from '@/types/game';
import { resolveGameStartedAt } from '@/lib/game/restore';

/**
 * Another player in this round, as far as this client knows.
 *
 * `synced: false` means we know they are here (presence) but have not yet read
 * their `game_players` row — their card and marks are unknown, which the UI
 * must show as "syncing" rather than as a real 0/25 score (DESIGN.md: "Them
 * showing 0/25 after a refresh is not [tolerable]").
 */
export interface OtherPlayer {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  card: SquareItem[];
  marks: number[];
  won: boolean;
  finishPosition: number | null;
  synced: boolean;
}

export interface GameWinner {
  playerId: string;
  displayName: string;
  pattern: WinPattern;
  // 1 for first place, 2 for second. Optional because a legacy broadcast
  // omits it; when known it decides the order, not the order of arrival.
  finishPosition?: number;
  // Date.now() when this tab first heard of the win. Lets the DB replay tell a
  // win whose row write has not landed yet (keep it) from one the DB has since
  // dropped (a retraction this tab missed). Optional: set by addWinner.
  heardAt?: number;
}

interface GameState {
  // Set on game_started
  gameId: string | null;
  seed: string | null;
  roundNumber: number;
  callList: number[];      // ordered item indices — the full call sequence
  calledCount: number;     // how many items have been called so far
  templateItems: SquareItem[];
  boardSize: number;
  freeSpace: boolean;
  shuffleMode: 'full' | 'column';
  winPatterns: WinPattern[];
  gameMode: GameMode;
  cardStyles: CardStyles;

  // Player's card (generated from seed + playerId on game_started)
  myCard: SquareItem[];
  // Grid indices the current player has marked
  myMarks: number[];
  // Has the current player already claimed bingo this round?
  hasClaimed: boolean;
  // ISO timestamp of when the game started — used to compute bingo_time_ms
  gameStartedAt: string | null;

  winners: GameWinner[];

  // Every other player in the round, keyed by player ID. Fed by loadGamePlayers
  // (DB truth) and by mark_updated broadcasts (live deltas).
  others: Record<string, OtherPlayer>;

  // Actions
  initGame: (params: {
    gameId: string;
    seed: string;
    roundNumber: number;
    callList: number[];
    templateItems: SquareItem[];
    boardSize: number;
    freeSpace: boolean;
    shuffleMode: 'full' | 'column';
    winPatterns: WinPattern[];
    gameMode?: GameMode; // legacy game_started payloads omit it → 'honor'
    cardStyles?: CardStyles;
    // games.started_at. Optional only because a legacy game_started payload
    // omits it; every current path passes the DB value.
    startedAt?: string | null;
  }) => void;
  setMyCard: (card: SquareItem[]) => void;
  /** The host's mid-game Style switch: redraws every board without touching cards or marks. */
  setCardStyles: (styles: CardStyles) => void;
  setCalledCount: (count: number) => void;
  toggleMark: (gridIndex: number) => void;
  addWinner: (winner: GameWinner) => void;
  removeWinner: (playerId: string) => void;
  setMyMarks: (marks: number[]) => void;
  setHasClaimed: (claimed: boolean) => void;
  setOthers: (list: OtherPlayer[]) => void;
  addPlaceholders: (list: OtherPlayer[]) => void;
  setOtherMarks: (playerId: string, marks: number[]) => void;
  resetGame: () => void;
}

const initial: Omit<GameState, keyof { initGame: unknown; setMyCard: unknown; setCardStyles: unknown; setCalledCount: unknown; toggleMark: unknown; addWinner: unknown; removeWinner: unknown; setMyMarks: unknown; setHasClaimed: unknown; setOthers: unknown; addPlaceholders: unknown; setOtherMarks: unknown; resetGame: unknown }> = {
  gameId: null,
  seed: null,
  roundNumber: 0,
  callList: [],
  calledCount: 0,
  templateItems: [],
  boardSize: 5,
  freeSpace: true,
  shuffleMode: 'full',
  winPatterns: ['row', 'column', 'diagonal'],
  gameMode: 'honor' as GameMode,
  cardStyles: {},
  myCard: [],
  myMarks: [],
  hasClaimed: false,
  gameStartedAt: null,
  winners: [],
  others: {},
};

export const useGameStore = create<GameState>((set, get) => ({
  ...initial,

  initGame: ({ startedAt, ...params }) =>
    set({
      ...params,
      gameMode: params.gameMode ?? 'honor',
      cardStyles: params.cardStyles ?? {},
      calledCount: 0,
      myCard: [],
      myMarks: [],
      hasClaimed: false,
      // The round's real start from the DB, not the moment this tab heard
      // about it — a refresh used to restart the clock and record impossibly
      // fast bingo times.
      gameStartedAt: resolveGameStartedAt(startedAt),
      winners: [],
      // A new round means everyone's old board is meaningless; loadGamePlayers
      // repopulates this once the fresh game_players rows exist.
      others: {},
    }),

  setMyCard: (myCard) => set({ myCard }),

  setCardStyles: (cardStyles) => set({ cardStyles }),

  setCalledCount: (calledCount) => set({ calledCount }),

  toggleMark: (gridIndex) => {
    const { myMarks } = get();
    const already = myMarks.includes(gridIndex);
    set({ myMarks: already ? myMarks.filter((i) => i !== gridIndex) : [...myMarks, gridIndex] });
  },

  /**
   * Idempotent by player: the same win reaches a tab up to three times (the
   * claimant adds itself at claim time, the self-echoed broadcast, and the DB
   * replay in loadGamePlayers), and the win sequence in GameView fires on
   * `winners.length`, so a second copy must never grow the list.
   *
   * A replay can also arrive out of order (second place's broadcast before a
   * DB read that includes first place), so a winner with a known
   * finishPosition is slotted ahead of any later-placed winner.
   */
  addWinner: (winner) => {
    const { winners } = get();
    if (winners.some((w) => w.playerId === winner.playerId)) return;
    const pos = winner.finishPosition;
    const at = pos === undefined
      ? -1
      : winners.findIndex((w) => w.finishPosition !== undefined && w.finishPosition > pos);
    const next = [...winners];
    const entry = { ...winner, heardAt: winner.heardAt ?? Date.now() };
    if (at === -1) next.push(entry);
    else next.splice(at, 0, entry);
    set({ winners: next });
  },

  /**
   * Undo a win: the winner unmarked a square so no pattern holds any more (an
   * early bingo backed off). Everyone placed after them moves up one place, so
   * second becomes first. Idempotent like addWinner — the retracting tab, its
   * self-echoed broadcast and the DB replay can all ask for the same removal.
   */
  removeWinner: (playerId) => {
    const { winners } = get();
    const gone = winners.find((w) => w.playerId === playerId);
    if (!gone) return;
    const pos = gone.finishPosition;
    set({
      winners: winners
        .filter((w) => w.playerId !== playerId)
        .map((w) => (pos !== undefined && w.finishPosition !== undefined && w.finishPosition > pos
          ? { ...w, finishPosition: w.finishPosition - 1 }
          : w)),
    });
  },

  setMyMarks: (myMarks) => set({ myMarks }),

  setHasClaimed: (hasClaimed) => set({ hasClaimed }),

  /**
   * Replace the DB-backed view of other players.
   *
   * Unsynced entries (created by presence, or by a mark_updated broadcast that
   * beat the fetch) are preserved when the incoming list doesn't mention them —
   * otherwise a fetch that races a join would erase someone from the rail.
   */
  setOthers: (list) => {
    const { others } = get();
    const next: Record<string, OtherPlayer> = {};
    for (const [id, entry] of Object.entries(others)) {
      if (!entry.synced) next[id] = entry;
    }
    for (const entry of list) next[entry.playerId] = entry;
    set({ others: next });
  },

  /**
   * Presence-only merge: add an unsynced entry for each player we have no entry
   * for, and leave every existing entry alone. Presence knows who is here, not
   * what their board looks like, so it must never replace a board the DB or a
   * broadcast already filled in (setOthers would drop synced entries it isn't
   * handed — the mid-round join that blanked the rail).
   */
  addPlaceholders: (list) => {
    const { others } = get();
    const fresh = list.filter((entry) => !others[entry.playerId]);
    if (fresh.length === 0) return;
    const next = { ...others };
    for (const entry of fresh) next[entry.playerId] = entry;
    set({ others: next });
  },

  /**
   * Apply a live mark_updated broadcast. Creates a placeholder entry if the
   * broadcast arrives before the fetch, so no mark is ever dropped; the card
   * fills in when loadGamePlayers lands.
   */
  setOtherMarks: (playerId, marks) => {
    const { others } = get();
    const existing = others[playerId];
    set({
      others: {
        ...others,
        [playerId]: existing
          ? { ...existing, marks }
          : {
              playerId,
              displayName: 'Player',
              avatarUrl: null,
              card: [],
              marks,
              won: false,
              finishPosition: null,
              synced: true,
            },
      },
    });
  },

  resetGame: () => set({ ...initial }),
}));
