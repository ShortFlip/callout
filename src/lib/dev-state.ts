'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type { OtherPlayer, GameWinner } from '@/stores/gameStore';
import type { CardStyles, SquareItem } from '@/types/card';
import type { LegendEntry } from '@/types/library';
import { CARD_PRESETS } from '@/lib/card-styles';

/**
 * Overrides the game screen renders instead of the store, so the states that
 * are hard to stage live — a dropped connection, a board that has not synced,
 * a full 6x6 room — can be screenshotted deterministically.
 */
export interface DevOverrides {
  forceReconnecting: boolean;
  others?: OtherPlayer[];
  card?: SquareItem[];
  marks?: number[];
  boardSize?: number;
  freeSpace?: boolean;
  /** Stands in for the store's winners so the win moment can be captured. */
  winners?: GameWinner[];
  /** Stands in for the card's styles — the tinted states carry a legend in them. */
  styles?: CardStyles;
  /** Squares shown as called, to check the called wash beside a game marker (`&called=1`). */
  called?: number[];
}

/**
 * Reads `?state=reconnecting|syncing|dense|won|won2|tinted|tinted6` — development only.
 * The tinted states also read `&won=1` and `&called=1`.
 *
 * The whole body is behind a NODE_ENV check so the fake players and their
 * names are dead code in a production build and get dropped by the minifier.
 * The query string is read from `window.location` rather than
 * `useSearchParams` so the room page needs no Suspense boundary.
 */
export function useDevState(): DevOverrides | null {
  // The query string never changes without a navigation, so there is nothing
  // to subscribe to — this is only here to read it after hydration without
  // tripping a server/client mismatch.
  const search = useSyncExternalStore(
    noopSubscribe,
    () => window.location.search,
    () => '',
  );

  return useMemo(() => buildOverrides(new URLSearchParams(search)), [search]);
}

function noopSubscribe(): () => void {
  return () => {};
}

function buildOverrides(params: URLSearchParams): DevOverrides | null {
  if (process.env.NODE_ENV === 'production') return null;
  const state = params.get('state');
  if (!state) return null;

  if (state === 'tinted' || state === 'tinted6') {
    return tintedOverrides(state === 'tinted6' ? 6 : 5, params);
  }

  if (state === 'reconnecting') {
    return { forceReconnecting: true };
  }

  if (state === 'syncing') {
    return { forceReconnecting: false, others: fakeFive().slice(0, 4) };
  }

  // The win moment: Dan has taken column 2. Everyone is synced, because the
  // banner and the gold rail card are what is being looked at.
  if (state === 'won') {
    return {
      forceReconnecting: false,
      others: wonRail(),
      winners: [{ playerId: 'dev-dan', displayName: 'Dan', pattern: 'column' }],
    };
  }

  // Both places taken: the subline changes and `2ND — OPEN` becomes a name.
  if (state === 'won2') {
    return {
      forceReconnecting: false,
      others: wonRail(true),
      winners: [
        { playerId: 'dev-dan', displayName: 'Dan', pattern: 'column' },
        { playerId: 'dev-jess', displayName: 'Jess', pattern: 'row' },
      ],
    };
  }

  if (state === 'dense') {
    // 6x6 with five players — the densest room the design has to survive.
    const size = 6;
    return {
      forceReconnecting: false,
      boardSize: size,
      // The fake card carries no free-space item, so the label must not count
      // one either — otherwise the note disagrees with the board.
      freeSpace: false,
      card: fakeCard(size),
      marks: [0, 1, 2, 4, 7, 9, 13, 15, 19, 20, 26, 28, 31, 33],
      others: denseRail(size),
    };
  }

  return null;
}

/** All five fake players on a size×size card, with scattered marks. */
function denseRail(size: number): OtherPlayer[] {
  return fakeFive().map((p, i) => ({
    ...p,
    card: fakeCard(size),
    marks: scatter(size * size, 7 + i * 4, i + 1),
  }));
}

/** The two games of the tinted states, as a library card's styles.legend holds them. */
const TINT_LEGEND: LegendEntry[] = [
  { gameTagId: 'dev-game-rl', name: 'Rocket League', color: 'sky', icon: 'car' },
  { gameTagId: 'dev-game-cod', name: 'Call of Duty', color: 'orange', icon: 'crosshair' },
];

/** The FAKE_SQUARES that read as Rocket League; the other 17 are Call of Duty. */
const RL_SQUARES = [
  'Someone rage quits', 'Forfeit vote', 'Reverse boost fail', 'Whiffed open net',
  'Controller disconnects', 'Calls a bad play', 'Own goal',
];

/**
 * Where each game sits on the tinted cards. Hand-placed so every state the
 * markers must survive is on one screen: marked squares of both games, and
 * a hot lane crossing one square of each (5×5: row 2 two away, lane 7 and 9;
 * 6×6: row 3 three away, lane 12, 15 and 17). `called` is only drawn with
 * `&called=1` — honor play never shows the called wash.
 */
const TINT_LAYOUT: Record<5 | 6, { free?: number; rl: number[]; marks: number[]; called: number[] }> = {
  5: { free: 12, rl: [1, 6, 7, 13, 16, 21, 23], marks: [2, 5, 6, 8, 15, 19, 21, 23], called: [11, 13] },
  6: {
    rl: [1, 4, 8, 13, 15, 20, 22, 27, 30, 34],
    marks: [0, 3, 8, 13, 14, 16, 22, 25, 29, 33],
    called: [11, 27],
  },
};

/**
 * `?state=tinted` (5×5) and `?state=tinted6`: a card built the way the library
 * builds one — every square carrying its game, the legend in styles — so the
 * game markers and the legend can be captured on the real board. `&won=1`
 * puts the win banner up (the 520px board), `&called=1` adds two called squares.
 */
function tintedOverrides(size: 5 | 6, params: URLSearchParams): DevOverrides {
  const layout = TINT_LAYOUT[size];
  const [rl, cod] = TINT_LEGEND;
  const codSquares = FAKE_SQUARES.filter((text) => !RL_SQUARES.includes(text));
  let nextRl = 0;
  let nextCod = 0;
  const card: SquareItem[] = Array.from({ length: size * size }, (_, i) => {
    if (i === layout.free) return { text: 'FREE', isFreeSpace: true };
    // A 6×6 card needs more squares than there are fake texts; repeats are fine here.
    return layout.rl.includes(i)
      ? { text: RL_SQUARES[nextRl++ % RL_SQUARES.length], gameTagId: rl.gameTagId, originalIndex: i }
      : { text: codSquares[nextCod++ % codSquares.length], gameTagId: cod.gameTagId, originalIndex: i };
  });

  const won = params.get('won') === '1';
  return {
    forceReconnecting: false,
    boardSize: size,
    freeSpace: layout.free !== undefined,
    card,
    marks: layout.marks,
    // &preset=<id> draws the card in one of the card styles; &logo_rl= and
    // &logo_cod= put uploaded logo URLs in the legend, so every style can be
    // captured with real logos on it.
    styles: {
      ...(CARD_PRESETS.find((p) => p.id === params.get('preset'))?.styles ?? {}),
      legend: TINT_LEGEND.map((entry) => {
        const logo = params.get(entry.gameTagId === rl.gameTagId ? 'logo_rl' : 'logo_cod');
        return logo ? { ...entry, logoUrl: logo } : entry;
      }),
    },
    called: params.get('called') === '1' ? layout.called : undefined,
    others: size === 6 ? denseRail(size) : won ? wonRail() : fakeFive().slice(0, 4),
    // An empty list, not undefined, without &won=1: the harness may run in a room
    // whose real round has already been won, and that banner would shrink the board.
    winners: won ? [{ playerId: 'dev-dan', displayName: 'Dan', pattern: 'column' }] : [],
  };
}

/**
 * Deterministic pseudo-marks so a screenshot of the same URL is the same image.
 * A seeded shuffle of every index, sliced — a modular walk can cycle short and
 * never fill the quota.
 */
function scatter(total: number, count: number, salt: number): number[] {
  const cells = Array.from({ length: total }, (_, i) => i);
  let seed = salt * 2654435761;
  for (let i = cells.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const j = seed % (i + 1);
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, Math.min(count, total));
}

/**
 * The four rail players with the win already landed: Dan holds a complete
 * column 2, and — for `won2` — Jess holds a complete row 1. Nobody is left
 * unsynced here; an unread board next to a confirmed winner would only muddy
 * what the gold treatment is saying.
 */
function wonRail(jessWins = false): OtherPlayer[] {
  const base = fakeFive().slice(0, 4).map((p) =>
    p.synced ? p : { ...p, synced: true, card: fakeCard(5), marks: [1, 5, 9, 13, 16, 18, 20, 23] },
  );
  return base.map((p) => {
    // Column 2 = indices 1, 6, 11, 16, 21 — the column the canvas shows Dan
    // one away from, now completed.
    if (p.playerId === 'dev-dan') {
      return { ...p, marks: [1, 2, 3, 6, 8, 9, 10, 11, 16, 18, 21, 22], won: true, finishPosition: 1 };
    }
    // Row 1 = indices 0 through 4.
    if (p.playerId === 'dev-jess') {
      return jessWins
        ? { ...p, marks: [0, 1, 2, 3, 4, 5, 6, 9, 13, 14, 17, 21, 23], won: true, finishPosition: 2 }
        : p;
    }
    return p;
  });
}

function fakeCard(boardSize: number): SquareItem[] {
  return Array.from({ length: boardSize * boardSize }, (_, i) => ({
    text: FAKE_SQUARES[i % FAKE_SQUARES.length],
    originalIndex: i,
  }));
}

const FAKE_SQUARES = [
  'Someone rage quits', 'Teammate goes 0-10', 'Hit marker no kill', 'Blames lag',
  'Nobody revives', 'Forfeit vote', 'Killed by a camper', 'Mic feedback squeal',
  'Someone joins late', 'Shot through a wall', 'Killcam roast', 'Reverse boost fail',
  'Whiffed open net', 'Controller disconnects', 'Calls a bad play', 'Sniper quickscope',
  'Own goal', 'Lobby disbands', 'Someone eats on mic', 'Clutches a 1v3',
  'Goes AFK', 'Blame the servers', 'Melee kill', 'Double XP reminder',
];

/**
 * The four rail players from the design canvas, plus a fifth for the dense
 * state. Marks are hand-picked so the labels cover the range: two players one
 * away, one unsynced, one nowhere near.
 */
function fakeFive(): OtherPlayer[] {
  return [
    {
      playerId: 'dev-dan',
      displayName: 'Dan',
      avatarUrl: null,
      card: fakeCard(5),
      // Column 2, one away.
      marks: [1, 2, 3, 6, 8, 9, 10, 16, 18, 21, 22],
      won: false,
      finishPosition: null,
      synced: true,
    },
    {
      playerId: 'dev-marcus',
      displayName: 'Marcus',
      avatarUrl: null,
      card: [],
      marks: [],
      won: false,
      finishPosition: null,
      // The syncing state: present in the room, board not read yet.
      synced: false,
    },
    {
      playerId: 'dev-jess',
      displayName: 'Jess',
      avatarUrl: null,
      card: fakeCard(5),
      // Row 1, one away.
      marks: [0, 1, 2, 3, 5, 6, 9, 13, 14, 17, 19, 21, 23],
      won: false,
      finishPosition: null,
      synced: true,
    },
    {
      playerId: 'dev-tyler',
      displayName: 'Tyler',
      avatarUrl: null,
      card: fakeCard(5),
      marks: [0, 7, 15, 19, 23],
      won: false,
      finishPosition: null,
      synced: true,
    },
    {
      playerId: 'dev-sam',
      displayName: 'Sam',
      avatarUrl: null,
      card: fakeCard(5),
      marks: [4, 8, 11, 16, 20, 22],
      won: false,
      finishPosition: null,
      synced: true,
    },
  ];
}
