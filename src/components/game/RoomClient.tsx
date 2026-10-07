'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { GameLobby } from './GameLobby';
import { GameView } from './GameView';
import { GameOver } from './GameOver';
import type { HostAction } from './HostControls';
import { GameSkeleton } from './GameSkeleton';
import { BoardSkeleton } from '@/components/board/BoardSkeleton';
import { useRealtimeRoom } from '@/hooks/useRealtimeRoom';
import { usePlayer } from '@/hooks/usePlayer';
import { useGameStore, type GameWinner } from '@/stores/gameStore';
import { createClient } from '@/lib/supabase/client';
import { generateCard } from '@/lib/game/shuffle';
import { buildGameSetup } from '@/lib/game/game-setup';
import { createRound } from '@/lib/game/create-round';
import { withStylePreset } from '@/lib/card-styles';
import { loadGamePlayers } from '@/lib/game/game-players';
import { planSwap, swapGameSquares, type SwapPlan, type SwapReplacements } from '@/lib/game/swap-games';
import { seededRng } from '@/lib/game/seed-rng';
import { loadLibrary } from '@/lib/library/api';
import { squareFrom } from '@/lib/library/card-draft';
import { saveLastRoom, clearLastRoom } from '@/lib/utils/last-room';
import { checkWin, freeIndexOf } from '@/lib/game/win-detection';
import { shouldRetractWin } from '@/lib/game/retract';
import { withRetry, RETRY_DELAYS_MS } from '@/lib/utils/retry';
import { resolveRestoredCard, computeBingoTimeMs } from '@/lib/game/restore';
import { ensureOwnRow, writeOwnRow } from '@/lib/game/own-row';
import type { Json, Tables } from '@/lib/supabase/types';
import type { Room, WinPattern, GameStartedPayload } from '@/types/game';
import type { SquareItem } from '@/types/card';

interface RoomClientProps {
  initialRoom: Room;
}

export function RoomClient({ initialRoom }: RoomClientProps) {
  const router = useRouter();
  const { player, isLoading } = usePlayer();
  // The DB bootstrap below, reachable from the hook. A ref (set in an effect)
  // rather than the function itself so the hook's channel never resubscribes
  // just because this component re-rendered.
  const restoreRoundRef = useRef<(() => Promise<void>) | null>(null);
  const { presentPlayers, connection, broadcast } = useRealtimeRoom(
    initialRoom.join_code,
    initialRoom.id,
    player,
    // room_closed → re-render the server component so status 'finished' shows GameOver
    () => router.refresh(),
    // A newer round exists that we never got game_started for → load it from the DB.
    () => {
      restoreRoundRef.current?.().catch((err) => console.error('Round restore failed:', err));
    },
    // The host switched the card style → redraw this board in it.
    (stylePreset) => applyStyle(stylePreset),
    // Gates the catch-up read of everyone's marks to a round on screen.
    initialRoom.status,
  );
  const { gameId } = useGameStore();
  // The host's Style pick for the night. Read from the room once, then kept
  // current by style_changed, because initialRoom.settings is the server
  // render's copy and goes stale the moment the host picks; every round this
  // tab starts or restores reads it through roomSettings().
  const stylePresetRef = useRef<string | undefined>(
    (initialRoom.settings as { stylePreset?: string } | null)?.stylePreset,
  );
  const roomSettings = () => ({
    ...((initialRoom.settings as Record<string, unknown> | null) ?? {}),
    ...(stylePresetRef.current ? { stylePreset: stylePresetRef.current } : {}),
  });

  // DEV-only handle so the store can be inspected from Playwright during
  // verification. Stripped from production builds by the NODE_ENV check.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __squares?: unknown }).__squares = useGameStore;
    }
  }, []);

  // The game store is global and outlives this component, so leaving a room
  // (Game Over → Home → another room, all client-side navigation) used to
  // carry room A's round into room B: the rejoin and lobby effects below skip
  // when a gameId is already set, so B showed A's board and marks went to A's
  // row. Reset on unmount, not mount: by the time the next room's RoomClient
  // renders, the store is already empty, so no child ever sees A's round. A
  // same-room router.refresh() keeps this component mounted and the store
  // intact; a full reload starts empty anyway.
  useEffect(() => () => useGameStore.getState().resetGame(), []);

  // Remember this room for the landing page's Rejoin chip, and forget it once
  // the night is over. DESIGN.md: "Never make me type a room code I was
  // already in."
  useEffect(() => {
    if (initialRoom.status === 'finished') {
      clearLastRoom();
    } else {
      saveLastRoom(initialRoom.join_code, initialRoom.name);
    }
  }, [initialRoom.status, initialRoom.join_code, initialRoom.name]);

  // Everyone else's boards come from the database, not from broadcasts we may
  // have missed. Re-read them whenever the round changes or we land on a room
  // that is already in progress. (The hook also re-reads on every regained
  // SUBSCRIBED and right after the game_started upsert.)
  useEffect(() => {
    if (initialRoom.status !== 'playing' || !gameId || !player) return;
    loadGamePlayers(createClient(), gameId, player.id);
  }, [initialRoom.status, gameId, player?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce timer for persisting marks to game_players — marks change on every
  // tap, but the DB only needs the latest snapshot (used for reconnect restore).
  const persistMarksTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (persistMarksTimer.current) clearTimeout(persistMarksTimer.current);
  }, []);

  // Win and retraction writes run one after another, never side by side. Each
  // retries on its own backoff, so unchained a slow win write could land after
  // the retraction that followed it and leave the row saying won = true for a
  // win that was taken back (or the reverse for a quick re-win).
  const winWriteChain = useRef<Promise<void>>(Promise.resolve());
  function queueWinWrite(task: () => Promise<void>) {
    winWriteChain.current = winWriteChain.current
      .then(task)
      .catch((err) => console.error('Win write failed:', err));
  }

  // Transition lobby → game (and Game Over → game, when the host hits "Play
  // Again") once a game_started broadcast puts a gameId in the store. The
  // server component still holds the old rooms.status, so re-render it.
  useEffect(() => {
    if (gameId && initialRoom.status !== 'playing') {
      router.refresh();
    }
  }, [gameId, initialRoom.status, router]);

  // A finished room never runs the round restore (that is for rooms still
  // playing), so after a refresh the store is empty and Game Over read
  // "Round 0" with no winner. Read the last round and its winners into local
  // state, NOT the store: a gameId in the store on a non-playing room trips
  // the router.refresh effect above.
  const [finishedRound, setFinishedRound] = useState<{ roundNumber: number; winners: GameWinner[] } | null>(null);
  useEffect(() => {
    if (initialRoom.status !== 'finished' || useGameStore.getState().gameId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        // Latest by started_at, same as restoreLatestRound: round_number is not
        // unique in older data.
        const { data: game, error: gameError } = await supabase
          .from('games')
          .select('id, round_number, win_pattern')
          .eq('room_id', initialRoom.id)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (gameError) throw gameError;
        if (!game || cancelled) return;
        const { data: rows, error: rowsError } = await supabase
          .from('game_players')
          .select('player_id, finish_position, players!game_players_player_id_fkey(display_name)')
          .eq('game_id', game.id)
          .eq('won', true);
        if (rowsError) throw rowsError;
        if (cancelled) return;
        const winners = (rows ?? [])
          .sort((a, b) => (a.finish_position ?? Infinity) - (b.finish_position ?? Infinity))
          .map((row) => ({
            playerId: row.player_id,
            displayName: (row.players as { display_name: string } | null)?.display_name ?? 'Player',
            // Only the first winner's pattern is stored on the game.
            pattern: (game.win_pattern as WinPattern | null) ?? 'row',
            finishPosition: row.finish_position ?? undefined,
          }));
        setFinishedRound({ roundNumber: game.round_number, winners });
      } catch (err) {
        console.error('Failed to read the last round:', err);
        toast.error("Couldn't load the last round's result.");
      }
    })();
    return () => { cancelled = true; };
  }, [initialRoom.status, initialRoom.id]);

  // Guards restoreLatestRound: the mount effect, a games INSERT and a regained
  // SUBSCRIBED can all ask for it within a second of each other. A request
  // that arrives mid-restore is remembered and run once the current one ends,
  // so a round inserted during a restore is not skipped.
  const restoringRef = useRef(false);
  const restoreAgainRef = useRef(false);
  // The rejoin restore gave up with no round on screen. GameSkeleton then
  // overlays Can't Load This Round with Try Again instead of pulsing forever.
  const [restoreFailed, setRestoreFailed] = useState(false);

  /**
   * Rebuild this player's view of the room's latest round from the DB: the
   * rejoin path (tab closed mid-game, refresh) and the catch-up path (a new
   * round started while our socket was down). The card comes from our saved
   * game_players.card_data when it exists, so a template edited mid-night
   * can't reshuffle it; only a first join regenerates it from seed + playerId.
   *
   * Every read retries on its own short backoff, and a failed read never falls
   * through to a write: treating "couldn't read my row" as "I have no row" is
   * exactly how a refresh used to wipe a board and un-win a winner.
   */
  async function restoreLatestRound() {
    if (!player || !initialRoom.template_id) return;
    if (restoringRef.current) {
      restoreAgainRef.current = true;
      return;
    }
    restoringRef.current = true;
    try {
      do {
        restoreAgainRef.current = false;
        await restoreOnce(player.id, initialRoom.template_id);
      } while (restoreAgainRef.current);
    } finally {
      restoringRef.current = false;
    }
  }

  async function restoreOnce(playerId: string, templateId: string) {
    const supabase = createClient();
    // One heads-up per restore, not one per retry.
    let warned = false;
    const warnOnce = () => {
      if (warned) return;
      warned = true;
      toast.error('Having trouble reaching the game. Retrying…');
    };
    // With no round on screen the skeleton's overlay says it, with Try Again;
    // a catch-up restore over a live board keeps the toast.
    const failRestore = (message: string) => {
      if (!useGameStore.getState().gameId) setRestoreFailed(true);
      else toast.error(message);
    };

    // The live round is the most recently started one. round_number is not
    // unique in older data, so ordering by it could pick a finished round.
    const gameRead = await withRetry<Tables<'games'> | null>(async () => {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('room_id', initialRoom.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error('Failed to read the current round:', error);
        return { ok: false };
      }
      return { ok: true, value: data };
    }, RETRY_DELAYS_MS, warnOnce);
    if (!gameRead.ok) {
      failRestore("Couldn't load this round. Try refreshing.");
      return;
    }
    const game = gameRead.value;
    if (!game) { setRestoreFailed(false); return; }
    // The game_started broadcast may have got us here first.
    if (useGameStore.getState().gameId === game.id) return;

    const templateRead = await withRetry<Tables<'card_templates'>>(async () => {
      const { data, error } = await supabase
        .from('card_templates')
        .select('*')
        .eq('id', templateId)
        .single();
      if (error || !data) {
        console.error('Failed to read the card template:', error);
        return { ok: false };
      }
      return { ok: true, value: data };
    }, RETRY_DELAYS_MS, warnOnce);
    if (!templateRead.ok) {
      failRestore("Couldn't load this round. Try refreshing.");
      return;
    }
    const template = templateRead.value;
    if (useGameStore.getState().gameId === game.id) return;

    // Our own row, read BEFORE the card is built: its card_data is the card we
    // were actually marking. maybeSingle() separates the two cases the old
    // .single() lumped together: `data: null` with no error is a genuine first
    // join, an error is a failed read and must never lead to a write.
    const ownRead = await withRetry<{ marks: Json; card_data: Json } | null>(async () => {
      const { data, error } = await supabase
        .from('game_players')
        .select('marks, card_data')
        .match({ game_id: game.id, player_id: playerId })
        .maybeSingle();
      if (error) {
        console.error('Failed to read own game_players row:', error);
        return { ok: false };
      }
      return { ok: true, value: data };
    }, RETRY_DELAYS_MS, warnOnce);
    if (!ownRead.ok) {
      failRestore("Couldn't restore your board. Try refreshing.");
      return;
    }
    const ownRow = ownRead.value;
    if (useGameStore.getState().gameId === game.id) return;

    // Same bootstrap the lobby/new-round paths use, seeded from the existing
    // game so the item filter (and therefore indices) can't drift.
    const setup = buildGameSetup(template, roomSettings(), game.seed);
    const items = setup.items;

    // The stored card wins over a regenerated one: the host may have edited
    // the template since this round started, and a regenerated card would put
    // our saved marks on different squares. Regenerate only for a first join
    // (no row yet) or a row with no usable card.
    const restored = resolveRestoredCard(
      ownRow?.card_data,
      { boardSize: setup.boardSize, freeSpace: setup.freeSpace },
      () => generateCard(items, game.seed, playerId, setup.boardSize, setup.shuffleMode, setup.freeSpace),
    );

    const { initGame, setMyCard, setCalledCount, setMyMarks } = useGameStore.getState();

    initGame({
      gameId: game.id,
      seed: game.seed,
      roundNumber: game.round_number,
      // The persisted call list wins over a regenerated one — it's what the
      // host has actually been calling from.
      callList: game.call_list as number[],
      templateItems: items,
      boardSize: restored.boardSize,
      freeSpace: restored.freeSpace,
      winPatterns: setup.winPatterns,
      gameMode: setup.gameMode,
      cardStyles: setup.cardStyles,
      // The round's real start, so a bingo after this refresh is timed from
      // when the round began rather than from the refresh.
      startedAt: game.started_at,
    });
    setRestoreFailed(false);

    // Restore how far the host has called
    setCalledCount(game.calls_made);
    setMyCard(restored.card);

    // Restore winners (ourselves included) BEFORE marks — if this player
    // already won, the winners list and hasClaimed must be populated before
    // the marks land, or the auto-claim effect in GameView re-fires and
    // re-writes finish_position. So a failed read here also stops the restore.
    const othersRead = await withRetry<null>(
      async () => ((await loadGamePlayers(supabase, game.id, playerId, { quiet: true }))
        ? { ok: true, value: null }
        : { ok: false }),
      RETRY_DELAYS_MS,
      warnOnce,
    );
    if (!othersRead.ok) {
      toast.error("Couldn't restore this round. Try refreshing.");
      return;
    }
    // The host moved on while we were reading; that round's restore owns the store now.
    if (useGameStore.getState().gameId !== game.id) return;

    if (ownRow) {
      setMyMarks((ownRow.marks ?? []) as number[]);
      return;
    }

    // Player is joining this round for the first time (joined the room after
    // it started, or missed game_started). Insert-only (ensureOwnRow): if a
    // row appeared since the read (the broadcast path raced us), it stays
    // untouched. Retried like the game_started create; a round we have since
    // left stops retrying.
    const created = await withRetry<null>(async () => {
      if (useGameStore.getState().gameId !== game.id) return { ok: true, value: null };
      return (await ensureOwnRow(supabase, { gameId: game.id, playerId }, restored.card))
        ? { ok: true, value: null }
        : { ok: false };
    });
    if (!created.ok) {
      // Generic copy — never surface raw DB error text to players.
      toast.error('Could not join this round. Try refreshing.');
    }
  }

  // Keep the hook's handle on the latest closure (player, room settings).
  useEffect(() => {
    restoreRoundRef.current = restoreLatestRound;
  });

  // Rejoin: the room is already playing but our store is empty (tab was closed
  // mid-game, or a refresh).
  useEffect(() => {
    if (initialRoom.status !== 'playing' || gameId || !player) return;
    restoreLatestRound().catch((err) => console.error('Reconnect failed:', err));
    // Deps are deliberately narrowed to the identity fields: `initialRoom` is a
    // fresh object on every server re-render, so depending on it (or on
    // `initialRoom.settings`) would re-run this whole reconnect fetch on every
    // router.refresh().
  }, [initialRoom.status, initialRoom.id, initialRoom.template_id, player?.id, gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Event handlers ────────────────────────────────────────────────────────

  async function handleStartGame(payload: Required<GameStartedPayload>) {
    await broadcast('game_started', payload as unknown as Record<string, unknown>);
  }

  // Traditional mode: CallerPanel has already persisted calls_made to the DB —
  // this just fans the new count out to every player in the room.
  async function handleCallNext(callsMade: number) {
    await broadcast('item_called', { callsMade });
  }

  async function handleMarkSquare(marks: number[]) {
    if (!player) return;
    const playerId = player.id;
    // Not awaited: with broadcast acks on, a send can wait out the socket
    // timeout on a dying connection, and the DB write below must not queue
    // behind it. A failed send is queued by the hook and flushed on reconnect.
    void broadcast('mark_updated', { gameId: useGameStore.getState().gameId, playerId, marks });

    // Persist marks (debounced) so a refresh mid-game can restore them.
    // Rapid taps collapse into one save of the final state.
    if (persistMarksTimer.current) clearTimeout(persistMarksTimer.current);
    persistMarksTimer.current = setTimeout(() => {
      saveMarks(playerId).catch((err) => console.error('Marks save failed:', err));
    }, 500);

    // An early bingo that backed off: I am a winner and these marks no longer
    // make any pattern. Silent — never confirm a mark (DESIGN.md).
    const state = useGameStore.getState();
    if (shouldRetractWin({
      isWinner: state.winners.some((w) => w.playerId === playerId),
      marks,
      boardSize: state.boardSize,
      winPatterns: state.winPatterns,
      freeIndex: state.freeSpace ? freeIndexOf(state.myCard) : null,
    })) {
      handleBingoRetract().catch((err) => console.error('Bingo retraction failed:', err));
    }
  }

  // One marks save at a time. A save that is still retrying when the next tap
  // lands is not doubled up: the tap is remembered and one more save runs once
  // the current one ends. Each attempt reads the latest marks from the store,
  // so the last write to land is always the newest board, never an older one.
  const savingMarksRef = useRef(false);
  const saveMarksAgainRef = useRef(false);

  async function saveMarks(playerId: string) {
    if (savingMarksRef.current) {
      saveMarksAgainRef.current = true;
      return;
    }
    savingMarksRef.current = true;
    try {
      do {
        saveMarksAgainRef.current = false;
        await saveMarksOnce(playerId);
      } while (saveMarksAgainRef.current);
    } finally {
      savingMarksRef.current = false;
    }
  }

  async function saveMarksOnce(playerId: string) {
    const gid = useGameStore.getState().gameId;
    if (!gid) return;
    const supabase = createClient();
    // Silent retries: a blip is ridden out without a word (never confirm a
    // mark, DESIGN.md). writeOwnRow proves the row was touched and recreates
    // a row whose first create was lost, so a save can no longer "succeed"
    // against nothing.
    const result = await withRetry<null>(async () => {
      const { gameId: now, myMarks, myCard } = useGameStore.getState();
      // The round moved on (or we left the room): this board is gone.
      if (now !== gid) return { ok: true, value: null };
      return (await writeOwnRow(supabase, { gameId: gid, playerId }, { marks: myMarks }, myCard))
        ? { ok: true, value: null }
        : { ok: false };
    });
    if (!result.ok) {
      // Marks still live in the store, but a refresh would lose them. Generic
      // copy — never raw DB text.
      toast.error('Your marks could not be saved. Avoid refreshing.');
    }
  }

  async function handleBingoClaim() {
    if (!player) return;
    const { gameId: gid, myCard, myMarks, boardSize, freeSpace, winPatterns, winners: currentWinners } = useGameStore.getState();
    if (!gid) return;

    if (currentWinners.some((w) => w.playerId === player.id)) return;

    // FREE's index is read off the card — it is not the centre on 3×3/4×4.
    const pattern = checkWin(new Set(myMarks), boardSize, winPatterns, freeSpace ? freeIndexOf(myCard) : null);
    if (!pattern) {
      useGameStore.getState().setHasClaimed(false);
      return;
    }

    const supabase = createClient();
    const finishPosition = currentWinners.length + 1;
    const bingoTimeMs = computeBingoTimeMs(useGameStore.getState().gameStartedAt, Date.now());

    // Our own banner, fanfare and confetti come from here, not from the
    // self-echo of the broadcast below: if the channel is mid-reconnect there
    // is no echo, and the winner must never be the one tab that doesn't know.
    // The echo and the DB replay are then no-ops (addWinner is idempotent).
    useGameStore.getState().addWinner({
      playerId: player.id,
      displayName: player.display_name,
      pattern,
      finishPosition,
    });

    // Persist the win. The DB row is what loadGamePlayers replays to any tab
    // that missed the broadcast, so a blip must not lose it: retry on the
    // shared backoff, and only tell the player once every attempt has failed.
    // Queued behind any retraction still being written (see winWriteChain).
    const playerId = player.id;
    const isFirstWinner = currentWinners.length === 0;
    queueWinWrite(async () => {
      // writeOwnRow, not a bare update: an update that matches 0 rows reports
      // success, and a win written nowhere is dropped by every other tab once
      // its catch-up grace runs out. A missing row is recreated, then won.
      const result = await withRetry<null>(async () => (
        (await writeOwnRow(supabase, { gameId: gid, playerId }, {
          won: true,
          marks: myMarks,
          finish_position: finishPosition,
          bingo_time_ms: bingoTimeMs,
        }, myCard))
          ? { ok: true, value: null }
          : { ok: false }
      ));
      if (!result.ok) toast.error('Your win was announced but not recorded in stats.');

      // Update game status on first winner
      if (!isFirstWinner) return;
      const statusResult = await withRetry<null>(async () => {
        const { error } = await supabase.from('games').update({
          status: 'won',
          win_pattern: pattern,
          ended_at: new Date().toISOString(),
        }).eq('id', gid);
        if (error) console.error('Failed to update game status:', error);
        return error ? { ok: false } : { ok: true, value: null };
      });
      if (!statusResult.ok) toast.error('Round result could not be saved.');
    });

    // If this can't be sent now, the hook queues it and sends it on the next
    // SUBSCRIBED; tabs that miss it entirely pick the win up from the DB.
    await broadcast('bingo_confirmed', {
      gameId: gid,
      playerId: player.id,
      displayName: player.display_name,
      pattern,
      finishPosition,
    });
  }

  /**
   * Take my win back: I unmarked a square and my marks no longer make a
   * pattern (an early bingo, game night 2026-10-02). Undone everywhere — my
   * store now, everyone else's through bingo_retracted, and the DB so the
   * replay, /history and /leaderboard agree.
   *
   * DB writes come from this tab only, including the other winners' moved-up
   * finish_position: the retracting tab is the one that knows a renumber is
   * due, and an owner-writes-own-row scheme would leave a gap in the placings
   * whenever another winner's tab was offline. Same shape as the host's swap,
   * which also writes other players' rows.
   */
  async function handleBingoRetract() {
    if (!player) return;
    const { gameId: gid, winners, removeWinner, setHasClaimed } = useGameStore.getState();
    if (!gid || !winners.some((w) => w.playerId === player.id)) return;
    const playerId = player.id;
    const wasFirst = winners[0]?.playerId === playerId;

    // Local first, so my own banner and placing clear on this tap even if the
    // channel is down. hasClaimed resets so a real win later auto-claims again.
    removeWinner(playerId);
    setHasClaimed(false);
    const remaining = useGameStore.getState().winners;

    queueWinWrite(async () => {
      const supabase = createClient();
      const rowResult = await withRetry<null>(async () => {
        const { error } = await supabase.from('game_players').update({
          won: false,
          finish_position: null,
          bingo_time_ms: null,
          // The latest marks ride along, as the win write's do.
          marks: useGameStore.getState().myMarks,
        }).match({ game_id: gid, player_id: playerId });
        if (error) console.error('Failed to retract win:', error);
        return error ? { ok: false } : { ok: true, value: null };
      });
      if (!rowResult.ok) {
        // Generic copy — never surface raw DB error text.
        toast.error("Your win was taken back here but couldn't be saved.");
        return;
      }

      const tidyResult = await withRetry<null>(async () => {
        // Close the gap in the placings from the DB's own order, not this
        // tab's: the DB is what /history, /leaderboard and the replay read.
        const { data, error } = await supabase
          .from('game_players')
          .select('player_id, finish_position')
          .eq('game_id', gid)
          .eq('won', true)
          .order('finish_position', { ascending: true, nullsFirst: false });
        if (error) {
          console.error('Failed to read winners after a retraction:', error);
          return { ok: false };
        }
        const rows = data ?? [];
        for (const [index, row] of rows.entries()) {
          if (row.finish_position === index + 1) continue;
          const { error: moveError } = await supabase
            .from('game_players')
            .update({ finish_position: index + 1 })
            .match({ game_id: gid, player_id: row.player_id });
          if (moveError) {
            console.error('Failed to move a winner up a place:', moveError);
            return { ok: false };
          }
        }

        if (rows.length === 0 && remaining.length === 0) {
          // Nobody holds a win: the round is live again, so End Night / New
          // Round cancel it like any unwon round. Only a 'won' round flips
          // back, so a round already cancelled is never reopened. A winner
          // only this tab or only the DB knows of keeps it 'won' — their own
          // claim saw a winner already and will not set the status again.
          const { error: gameError } = await supabase
            .from('games')
            .update({ status: 'active', win_pattern: null, ended_at: null })
            .eq('id', gid)
            .eq('status', 'won');
          if (gameError) {
            console.error('Failed to reopen the round:', gameError);
            return { ok: false };
          }
        } else if (wasFirst && remaining[0]) {
          // Second place is first now; the round's pattern is theirs.
          const { error: gameError } = await supabase
            .from('games')
            .update({ win_pattern: remaining[0].pattern })
            .eq('id', gid);
          if (gameError) {
            console.error('Failed to update the round pattern:', gameError);
            return { ok: false };
          }
        }
        return { ok: true, value: null };
      });
      if (!tidyResult.ok) toast.error('Round result could not be saved.');
    });

    // Queued by the hook under the same key as bingo_confirmed if the channel
    // is down, so only the latest of win / retraction is ever replayed.
    await broadcast('bingo_retracted', { gameId: gid, playerId });
  }

  /**
   * Mark the current round 'cancelled' if, as far as this host knows, nobody
   * won it. The local winners list is only a hint — the host may have missed a
   * bingo_confirmed — so the write is conditional on the DB still saying
   * 'active': a round the DB already has as 'won' is never flipped to
   * cancelled and dropped off the leaderboard.
   *
   * A failure is reported but does not block New Round / End Night: a round
   * left 'active' is already excluded from stats (isScoredRound), so the only
   * cost is a stale status, while blocking would strand the whole room.
   */
  async function cancelUnwonRound() {
    const { gameId: prevGameId, winners: prevWinners } = useGameStore.getState();
    if (!prevGameId || prevWinners.length > 0) return;
    const { error } = await createClient()
      .from('games')
      .update({ status: 'cancelled', ended_at: new Date().toISOString() })
      .eq('id', prevGameId)
      .eq('status', 'active');
    if (error) {
      console.error('Failed to close out the round:', error);
      // Generic copy — never surface raw DB error text.
      toast.error("Couldn't close out the last round. Stats are unaffected.");
    }
  }

  // A double-click on New Round / Play Again must not insert two rounds. A ref,
  // not state, so the second click sees it before React re-renders.
  const newRoundInFlight = useRef(false);
  // What the host's buttons show while a request is out: the clicked one
  // spins and says Starting… / Ending…, its sibling is disabled. State (the
  // ref above stays the double-click guard) so the buttons re-render.
  const [hostAction, setHostAction] = useState<HostAction | null>(null);

  async function handleNewRound() {
    if (!player || !initialRoom.template_id) return;
    if (newRoundInFlight.current) return;
    newRoundInFlight.current = true;
    setHostAction('new-round');
    try {
      const supabase = createClient();

      const { data: template } = await supabase
        .from('card_templates')
        .select('*')
        .eq('id', initialRoom.template_id)
        .single();

      if (!template) throw new Error('Template not found');

      // Close out the previous round. If someone won, handleBingoClaim already
      // marked the game 'won' — only rounds abandoned with zero winners need a
      // status, and that's 'cancelled' so stats never count a phantom win.
      await cancelUnwonRound();

      // Shared bootstrap: item filter + settings parse + fresh seed/call list
      const setup = buildGameSetup(template, roomSettings());

      // Next round number comes from the DB, not the store: a host who
      // refreshed on Game Over has an empty store, and "0 + 1" inserted a
      // second round 1. The unique (room_id, round_number) constraint backs
      // this up if two hosts' tabs ever race.
      const { data: lastRound, error: lastRoundError } = await supabase
        .from('games')
        .select('round_number')
        .eq('room_id', initialRoom.id)
        .order('round_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastRoundError) throw lastRoundError;

      const payload = await createRound(supabase, initialRoom.id, (lastRound?.round_number ?? 0) + 1, setup);
      await broadcast('game_started', payload as unknown as Record<string, unknown>);

      // If we're coming back from the 'finished' state (host hit "Play Again"
      // on the Game Over screen), the room row still says 'finished' — flip it
      // back so a refresh/late joiner lands on the board, not Game Over.
      if (initialRoom.status !== 'playing') {
        const { error: roomError } = await supabase
          .from('rooms')
          .update({ status: 'playing' })
          .eq('id', initialRoom.id);
        if (roomError) throw roomError;
        // room_reopened isn't a thing — game_started above already moved every
        // client's store; the refresh swaps the server-rendered shell.
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to start new round:', err);
      toast.error('Could not start a new round.');
    } finally {
      newRoundInFlight.current = false;
      setHostAction(null);
    }
  }

  /**
   * Everything a swap reads: every card in the round with its marks, and the
   * pool the replacements come from. Shared by the picker (what to show) and
   * the swap itself (what to write), so the two can never disagree.
   *
   * `libraryRequired`: the picker must not show a blank list because the
   * library failed, so it throws; the swap itself carries on without it.
   */
  async function readSwapSource(targetGameTagId: string, libraryRequired: boolean) {
    const { gameId: gid, templateItems, myMarks, others } = useGameStore.getState();
    if (!player || !gid) throw new Error('No round to swap in');
    const supabase = createClient();

    // Fresh rows, not the store: a late joiner's card may not be in `others` yet.
    const { data: rows, error: readError } = await supabase
      .from('game_players')
      .select('player_id, card_data, marks')
      .eq('game_id', gid);
    if (readError) throw readError;

    const cards = (rows ?? []).flatMap((row) => {
      const card = (row.card_data ?? []) as unknown as SquareItem[];
      if (!Array.isArray(card) || card.length === 0) return [];
      // Marks are saved on a 500ms debounce, so the DB can be a beat behind a
      // fresh tap. Union it with what this tab heard live so a square marked
      // a moment ago is never swapped out from under its player.
      const liveMarks = row.player_id === player.id ? myMarks : (others[row.player_id]?.marks ?? []);
      const marks = [...new Set([...((row.marks ?? []) as number[]), ...liveMarks])];
      return [{ playerId: row.player_id, card, marks }];
    });

    // The pool: the round's own items (originalIndex = pool position, the
    // same tag generateCard gives, so traditional-mode call checks still
    // line up), then the host's library for that game. A saved card holds
    // exactly N² items, so its pool alone has no spare Modern Warfare squares;
    // the library is where the rest live. Library-only items carry no
    // originalIndex, so in traditional mode they can never be called — fine
    // for the honor-system mode this feature exists for.
    const pool: SquareItem[] = templateItems.map((item, index) => ({ ...item, originalIndex: index }));
    try {
      const library = await loadLibrary(player.id);
      pool.push(...library.items.filter((item) => item.gameTagId === targetGameTagId).map(squareFrom));
    } catch (libraryError) {
      if (libraryRequired) throw libraryError;
      // Not fatal: the round's pool may still cover it; the skipped toast says if not.
      console.error('Failed to load the library for a swap:', libraryError);
    }
    return { gid, cards, pool };
  }

  /** The seed every swap draw for this direction hangs off, so Pick For Me is stable within a round. */
  function swapSeed(gid: string, dropGameTagId: string, targetGameTagId: string) {
    return `${useGameStore.getState().seed ?? gid}:swap:${dropGameTagId}>${targetGameTagId}`;
  }

  /**
   * What the host's swap picker shows: the dropped game's items still
   * swappable, the target game's items on no card, and a seeded suggestion
   * for Pick For Me. Throws on any read failure; the picker shows its own
   * error state with generic copy.
   */
  async function handleLoadSwapPlan(dropGameTagId: string, targetGameTagId: string): Promise<SwapPlan> {
    const { gid, cards, pool } = await readSwapSource(targetGameTagId, true);
    return planSwap({
      cards,
      pool,
      dropGameTagId,
      targetGameTagId,
      rng: seededRng(swapSeed(gid, dropGameTagId, targetGameTagId)),
    });
  }

  /**
   * Host swaps one game's unmarked squares for another's on every card in the
   * round ("we've left Rocket League for Modern Warfare"). The host's picks
   * map each dropped item to one chosen item, the same on every card; anything
   * the picks do not cover falls back to a seeded draw. card_data is the truth
   * every tab reads, so the swap rewrites it row by row, then a cards_swapped
   * broadcast tells every tab to reread.
   */
  async function handleSwapGames(dropGameTagId: string, targetGameTagId: string, replacements: SwapReplacements) {
    const gid = useGameStore.getState().gameId;
    if (!player || !gid) return;
    const supabase = createClient();
    // Outside the try so a failure partway through still tells every tab to
    // reread the cards that were already rewritten.
    let swapped = 0;
    try {
      const { cards, pool } = await readSwapSource(targetGameTagId, false);

      let skipped = 0;
      for (const row of cards) {
        const result = swapGameSquares({
          card: row.card,
          marks: row.marks,
          pool,
          dropGameTagId,
          targetGameTagId,
          replacements,
          // The fallback is seeded per player so each board gets its own
          // draw, reproducibly; the host's picks are the same everywhere.
          rng: seededRng(`${swapSeed(gid, dropGameTagId, targetGameTagId)}:${row.playerId}`),
        });
        skipped += result.skipped;
        if (result.swapped === 0) continue;

        // Only card_data is written; the players' own debounced saves touch
        // only marks, so the two never overwrite each other.
        const { data: updated, error: writeError } = await supabase
          .from('game_players')
          .update({ card_data: result.card as unknown as Json })
          .match({ game_id: gid, player_id: row.playerId })
          .select('player_id');
        if (writeError) throw writeError;
        if (!updated || updated.length === 0) throw new Error('Card update matched no row');
        swapped += result.swapped;
      }

      if (swapped > 0) {
        // Reread locally first so the host's own board flips even if the
        // broadcast has to wait for a reconnect; everyone else rereads on it.
        await loadGamePlayers(supabase, gid, player.id, { includeMyCard: true });
        await broadcast('cards_swapped', { gameId: gid });
      }

      if (skipped > 0) {
        toast.warning(`${skipped} ${skipped === 1 ? 'square' : 'squares'} couldn't be swapped — not enough new items for that game.`);
      } else if (swapped > 0) {
        toast.success(`Swapped ${swapped} ${swapped === 1 ? 'square' : 'squares'}.`);
      } else {
        toast('Nothing to swap — every square for that game is already marked.');
      }
    } catch (err) {
      console.error('Failed to swap games:', err);
      toast.error("Couldn't swap the squares. Try again.");
      if (swapped > 0) {
        try {
          await loadGamePlayers(supabase, gid, player.id, { includeMyCard: true });
          await broadcast('cards_swapped', { gameId: gid });
        } catch (syncError) {
          console.error('Failed to sync a partial swap:', syncError);
        }
      }
    }
  }

  /** Redraw this tab's board in a card style. A preset it already shows is a no-op. */
  function applyStyle(stylePreset: string) {
    const store = useGameStore.getState();
    if (stylePresetRef.current === stylePreset && store.cardStyles.preset === stylePreset) return;
    stylePresetRef.current = stylePreset;
    store.setCardStyles(withStylePreset(store.cardStyles, stylePreset));
  }

  /**
   * Host switches the card style for the night. The broadcast goes first so
   * every board changes at once; the room row is written after, so a tab that
   * missed the broadcast (postgres_changes), a rejoin and New Round all keep
   * it. The saved card is never touched. Settings are reread before the write
   * so the merge never clobbers win patterns or the game mode.
   */
  async function handleSetStyle(stylePreset: string) {
    applyStyle(stylePreset);
    await broadcast('style_changed', { stylePreset });
    try {
      const supabase = createClient();
      const { data, error: readError } = await supabase.from('rooms').select('settings').eq('id', initialRoom.id).single();
      if (readError) throw readError;
      const settings = { ...((data?.settings as Record<string, unknown> | null) ?? {}), stylePreset };
      const { error } = await supabase.from('rooms').update({ settings: settings as Json }).eq('id', initialRoom.id);
      if (error) throw error;
    } catch (err) {
      console.error('Failed to save the card style:', err);
      // Everyone already sees it; only a refresh or the next round would lose it.
      toast.warning("Style changed, but it couldn't be saved. A refresh may undo it.");
    }
  }

  // Host wraps up the night: room goes to 'finished' (the previously unreachable
  // GameOver state) and every client refreshes via the room_closed broadcast.
  async function handleEndGame() {
    if (!player) return;
    setHostAction('end-night');
    try {
      const supabase = createClient();

      // Same close-out handleNewRound performs: a final round that nobody won
      // must not linger as 'active', or the leaderboard counts a round that was
      // simply abandoned when the night ended.
      await cancelUnwonRound();

      const { error } = await supabase
        .from('rooms')
        .update({ status: 'finished' })
        .eq('id', initialRoom.id);
      if (error) throw error;

      await broadcast('room_closed', {});
      router.refresh();
    } catch (err) {
      console.error('Failed to end game:', err);
      toast.error('Could not end the game.');
    } finally {
      setHostAction(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Waiting on the player's identity. The template has not been read yet, so
  // the board size is unknown and the skeleton assumes the common 5×5.
  if (isLoading || !player) {
    // A round in progress loads into the game screen's own frame, so the
    // board fills in where its outline already is.
    if (initialRoom.status === 'playing') {
      return <GameSkeleton joinCode={initialRoom.join_code} />;
    }
    // Lobby and Game Over have no board to hold a place for; the board's
    // shape alone says "loading" without borrowing the game screen's chrome.
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Loading the room">
        <BoardSkeleton className="w-[240px]" />
      </div>
    );
  }

  // Game Over is the finished room only. Winners never route here (the win
  // state is the banner inside GameView), so a retracted win can never strand
  // anyone on an ended screen.
  if (initialRoom.status === 'finished') {
    return (
      <GameOver
        room={initialRoom}
        currentPlayerId={player.id}
        presentPlayers={presentPlayers}
        finishedRound={finishedRound}
        // Host can restart from the finished state; GameOver hides the button
        // for non-hosts and shows a "waiting for the host" line instead.
        onNewRound={handleNewRound}
        isStarting={hostAction === 'new-round'}
      />
    );
  }

  switch (initialRoom.status) {
    case 'waiting':
      return (
        <GameLobby
          room={initialRoom}
          currentPlayerId={player.id}
          presentPlayers={presentPlayers}
          connection={connection}
          onStartGame={handleStartGame}
        />
      );

    case 'playing':
      return (
        <GameView
          room={initialRoom}
          currentPlayerId={player.id}
          presentPlayers={presentPlayers}
          connection={connection}
          onMarkSquare={handleMarkSquare}
          onBingoClaim={handleBingoClaim}
          onNewRound={handleNewRound}
          onEndGame={handleEndGame}
          hostAction={hostAction}
          onRetryRestore={restoreFailed ? restoreLatestRound : undefined}
          onSwapGames={handleSwapGames}
          onLoadSwapPlan={handleLoadSwapPlan}
          onSetStyle={handleSetStyle}
          onCallNext={handleCallNext}
        />
      );

    default:
      return null;
  }
}
