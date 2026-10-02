'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { GameLobby } from './GameLobby';
import { GameView } from './GameView';
import { GameOver } from './GameOver';
import { GameSkeleton } from './GameSkeleton';
import { BoardSkeleton } from '@/components/board/BoardSkeleton';
import { useRealtimeRoom } from '@/hooks/useRealtimeRoom';
import { usePlayer } from '@/hooks/usePlayer';
import { useGameStore } from '@/stores/gameStore';
import { createClient } from '@/lib/supabase/client';
import { generateCard } from '@/lib/game/shuffle';
import { buildGameSetup } from '@/lib/game/game-setup';
import { withStylePreset } from '@/lib/card-styles';
import { loadGamePlayers } from '@/lib/game/game-players';
import { swapGameSquares } from '@/lib/game/swap-games';
import { seededRng } from '@/lib/game/seed-rng';
import { loadLibrary } from '@/lib/library/api';
import { squareFrom } from '@/lib/library/card-draft';
import { saveLastRoom, clearLastRoom } from '@/lib/utils/last-room';
import { checkWin, freeIndexOf } from '@/lib/game/win-detection';
import { withRetry, RETRY_DELAYS_MS } from '@/lib/utils/retry';
import { resolveRestoredCard, computeBingoTimeMs } from '@/lib/game/restore';
import type { Json, Tables } from '@/lib/supabase/types';
import type { Room, WinPattern, GameMode } from '@/types/game';
import type { SquareItem, CardStyles } from '@/types/card';

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

  // Transition lobby → game (and Game Over → game, when the host hits "Play
  // Again") once a game_started broadcast puts a gameId in the store. The
  // server component still holds the old rooms.status, so re-render it.
  useEffect(() => {
    if (gameId && initialRoom.status !== 'playing') {
      router.refresh();
    }
  }, [gameId, initialRoom.status, router]);

  // Guards restoreLatestRound: the mount effect, a games INSERT and a regained
  // SUBSCRIBED can all ask for it within a second of each other. A request
  // that arrives mid-restore is remembered and run once the current one ends,
  // so a round inserted during a restore is not skipped.
  const restoringRef = useRef(false);
  const restoreAgainRef = useRef(false);

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
      toast.error("Couldn't load this round. Try refreshing.");
      return;
    }
    const game = gameRead.value;
    if (!game) return;
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
      toast.error("Couldn't load this round. Try refreshing.");
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
      toast.error("Couldn't restore your board. Try refreshing.");
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
      shuffleMode: setup.shuffleMode,
      winPatterns: setup.winPatterns,
      gameMode: setup.gameMode,
      cardStyles: setup.cardStyles,
      // The round's real start, so a bingo after this refresh is timed from
      // when the round began rather than from the refresh.
      startedAt: game.started_at,
    });

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
    // it started, or missed game_started). ignoreDuplicates: if a row appeared
    // since the read (the broadcast path raced us), it stays untouched.
    const { error: insertError } = await supabase.from('game_players').upsert(
      { game_id: game.id, player_id: playerId, card_data: restored.card as unknown as Json, marks: [], won: false },
      { onConflict: 'game_id,player_id', ignoreDuplicates: true },
    );
    if (insertError) {
      console.error('Failed to create game_players on reconnect:', insertError);
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

  async function handleStartGame(payload: {
    gameId: string;
    seed: string;
    roundNumber: number;
    callList: number[];
    templateItems: SquareItem[];
    boardSize: number;
    freeSpace: boolean;
    shuffleMode: 'full' | 'column';
    winPatterns: WinPattern[];
    gameMode: GameMode;
    cardStyles: CardStyles;
    startedAt: string;
  }) {
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
    // Reads the latest marks from the store at fire time — rapid taps collapse
    // into one write with the final state.
    if (persistMarksTimer.current) clearTimeout(persistMarksTimer.current);
    persistMarksTimer.current = setTimeout(() => {
      const { gameId: gid, myMarks } = useGameStore.getState();
      if (!gid) return;
      createClient()
        .from('game_players')
        .update({ marks: myMarks })
        .match({ game_id: gid, player_id: playerId })
        .then(({ error }) => {
          if (error) {
            console.error('Failed to persist marks:', error);
            // Marks still live in the store, but a refresh would lose them.
            toast.error('Your marks could not be saved. Avoid refreshing.');
          }
        });
    }, 500);
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
    const playerId = player.id;
    withRetry<null>(async () => {
      const { error } = await supabase.from('game_players').update({
        won: true,
        marks: myMarks,
        finish_position: finishPosition,
        bingo_time_ms: bingoTimeMs,
      }).match({ game_id: gid, player_id: playerId });
      if (error) console.error('Failed to persist win:', error);
      return error ? { ok: false } : { ok: true, value: null };
    }).then((result) => {
      if (!result.ok) toast.error('Your win was announced but not recorded in stats.');
    });

    // Update game status on first winner
    if (currentWinners.length === 0) {
      withRetry<null>(async () => {
        const { error } = await supabase.from('games').update({
          status: 'won',
          win_pattern: pattern,
          ended_at: new Date().toISOString(),
        }).eq('id', gid);
        if (error) console.error('Failed to update game status:', error);
        return error ? { ok: false } : { ok: true, value: null };
      }).then((result) => {
        if (!result.ok) toast.error('Round result could not be saved.');
      });
    }

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

  async function handleNewRound() {
    if (!player || !initialRoom.template_id) return;
    if (newRoundInFlight.current) return;
    newRoundInFlight.current = true;
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
      const { seed, items, callList } = setup;

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

      const { data: game, error } = await supabase
        .from('games')
        .insert({
          room_id: initialRoom.id,
          round_number: (lastRound?.round_number ?? 0) + 1,
          call_list: callList,
          calls_made: 0,
          seed,
          status: 'active',
        })
        .select()
        .single();

      if (error || !game) throw error;

      await broadcast('game_started', {
        gameId: game.id,
        seed,
        roundNumber: game.round_number,
        callList,
        templateItems: items,
        boardSize: setup.boardSize,
        freeSpace: setup.freeSpace,
        shuffleMode: setup.shuffleMode,
        winPatterns: setup.winPatterns,
        gameMode: setup.gameMode,
        cardStyles: setup.cardStyles,
        // The DB's start time, so bingo times match what a refreshed tab restores.
        startedAt: game.started_at,
      });

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
    }
  }

  /**
   * Host swaps one game's unmarked squares for another's on every card in the
   * round ("we've left Rocket League for Modern Warfare"). card_data is the
   * truth every tab reads, so the swap rewrites it row by row, then a
   * cards_swapped broadcast tells every tab to reread.
   */
  async function handleSwapGames(dropGameTagId: string, targetGameTagId: string) {
    const { gameId: gid, seed, templateItems, myMarks, others } = useGameStore.getState();
    if (!player || !gid) return;
    const supabase = createClient();
    // Outside the try so a failure partway through still tells every tab to
    // reread the cards that were already rewritten.
    let swapped = 0;
    try {

      // Fresh rows, not the store: a late joiner's card may not be in `others` yet.
      const { data: rows, error: readError } = await supabase
        .from('game_players')
        .select('player_id, card_data, marks')
        .eq('game_id', gid);
      if (readError) throw readError;

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
        // Not fatal: the round's pool may still cover it; the skipped toast says if not.
        console.error('Failed to load the library for a swap:', libraryError);
      }

      let skipped = 0;
      for (const row of rows ?? []) {
        const card = (row.card_data ?? []) as unknown as SquareItem[];
        if (!Array.isArray(card) || card.length === 0) continue;
        // Marks are saved on a 500ms debounce, so the DB can be a beat behind a
        // fresh tap. Union it with what this tab heard live so a square marked
        // a moment ago is never swapped out from under its player.
        const liveMarks = row.player_id === player.id ? myMarks : (others[row.player_id]?.marks ?? []);
        const marks = [...new Set([...((row.marks ?? []) as number[]), ...liveMarks])];

        const result = swapGameSquares({
          card,
          marks,
          pool,
          dropGameTagId,
          targetGameTagId,
          // Seeded per player so each board gets its own draw, reproducibly.
          rng: seededRng(`${seed ?? gid}:swap:${dropGameTagId}>${targetGameTagId}:${row.player_id}`),
        });
        skipped += result.skipped;
        if (result.swapped === 0) continue;

        // Only card_data is written; the players' own debounced saves touch
        // only marks, so the two never overwrite each other.
        const { data: updated, error: writeError } = await supabase
          .from('game_players')
          .update({ card_data: result.card as unknown as Json })
          .match({ game_id: gid, player_id: row.player_id })
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

  // Show game over screen when room is finished OR when there are winners and
  // the host has not started a new round yet (covers the in-game win state)
  if (initialRoom.status === 'finished') {
    return (
      <GameOver
        room={initialRoom}
        currentPlayerId={player.id}
        presentPlayers={presentPlayers}
        // Host can restart from the finished state; GameOver hides the button
        // for non-hosts and shows a "waiting for the host" line instead.
        onNewRound={handleNewRound}
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
          onSwapGames={handleSwapGames}
          onSetStyle={handleSetStyle}
          onCallNext={handleCallNext}
        />
      );

    default:
      return null;
  }
}
