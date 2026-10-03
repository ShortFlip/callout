'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { generateCard } from '@/lib/game/shuffle';
import { loadGamePlayers } from '@/lib/game/game-players';
import { useGameStore } from '@/stores/gameStore';
import { enqueuePending, pendingKey, type PendingBroadcast } from '@/lib/realtime/pending-key';
import type { Player } from '@/types/player';
import type { SquareItem, CardStyles } from '@/types/card';
import type { WinPattern, GameMode } from '@/types/game';

export interface PresencePlayer {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string;
}

/**
 * Connection truth for the room channel. `connecting` is the first attempt,
 * `reconnecting` is every attempt after a drop — the UI distinguishes them so a
 * first load can show a skeleton while a mid-game drop shows the amber bar.
 */
export type ConnectionState = 'connecting' | 'live' | 'reconnecting';

interface GameStartedPayload {
  gameId: string;
  seed: string;
  roundNumber: number;
  callList: number[];
  templateItems: SquareItem[];
  boardSize: number;
  freeSpace: boolean;
  shuffleMode: 'full' | 'column';
  winPatterns: WinPattern[];
  gameMode?: GameMode;
  cardStyles?: CardStyles;
  // games.started_at, so every tab times bingos from the same instant. Legacy
  // payloads omit it and fall back to "now".
  startedAt?: string;
}

interface ItemCalledPayload {
  callsMade: number;
}

// `gameId` is optional only so a tab still running the previous build keeps
// working; current senders always include it. It lets a receiver drop a
// broadcast that was queued during a drop and flushed after the round moved on.
interface BingoConfirmedPayload {
  gameId?: string;
  playerId: string;
  displayName: string;
  pattern: WinPattern;
  finishPosition?: number;
}

// A winner took their win back: their marks no longer make a pattern.
interface BingoRetractedPayload {
  gameId?: string;
  playerId: string;
}

interface MarkUpdatedPayload {
  gameId?: string;
  playerId: string;
  marks: number[];
}

// How long a games INSERT waits for the game_started broadcast before this tab
// bootstraps the new round from the DB itself. The broadcast is the fast path
// and carries the same data; this only catches the tab that missed it.
const INSERT_FALLBACK_MS = 1500;

// Resubscribe backoff after a dropped channel: 1 s, 2 s, 4 s, then 8 s forever.
// Short enough that a blip is invisible, capped so a long outage neither hammers
// the server nor leaves the player waiting a minute once the network returns.
const BACKOFF_MS = [1000, 2000, 4000, 8000];

/**
 * Unified Realtime hook — handles both lobby presence and in-game events.
 *
 * Uses `self: true` in broadcast config so the host also receives the
 * game_started event they broadcast, allowing uniform state initialization.
 */
export function useRealtimeRoom(
  roomCode: string,
  // Room UUID — needed to filter the postgres_changes subscriptions below.
  roomId: string,
  player: Player | null,
  // Fired when the room's lifecycle changes: the room_closed broadcast, or the
  // postgres_changes fallback seeing rooms.status change. Kept in a ref so a new
  // callback identity doesn't tear down and resubscribe the channel.
  onRoomClosed?: () => void,
  // Fired when the room has a newer round than the one in the store (a games
  // INSERT we never got game_started for, or a reconnect that finds one).
  // RoomClient answers by re-running its DB bootstrap. Ref'd like onRoomClosed.
  onRoundChanged?: () => void,
  // Fired with the host's new card style: the style_changed broadcast, or the
  // postgres_changes fallback seeing rooms.settings.stylePreset change (a tab
  // that missed the broadcast). Ref'd like onRoomClosed.
  onStyleChanged?: (stylePreset: string) => void,
) {
  const [presentPlayers, setPresentPlayers] = useState<PresencePlayer[]>([]);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onRoomClosedRef = useRef(onRoomClosed);
  const onRoundChangedRef = useRef(onRoundChanged);
  const onStyleChangedRef = useRef(onStyleChanged);
  // Survives resubscribes on purpose: the whole point is to outlive the channel
  // that failed to send.
  const pendingRef = useRef<PendingBroadcast[]>([]);
  // Last rooms.status we acted on, so a duplicate UPDATE (or one that merely
  // touched another column) doesn't trigger a redundant refresh.
  const lastRoomStatusRef = useRef<string | null>(null);
  useEffect(() => {
    onRoomClosedRef.current = onRoomClosed;
  }, [onRoomClosed]);
  useEffect(() => {
    onRoundChangedRef.current = onRoundChanged;
  }, [onRoundChanged]);
  useEffect(() => {
    onStyleChangedRef.current = onStyleChanged;
  }, [onStyleChanged]);

  const { initGame, setMyCard, setCalledCount, addWinner } = useGameStore();

  useEffect(() => {
    if (!player) return;
    const self = player;

    const supabase = createClient();
    // Guards every async continuation: after unmount nothing may resubscribe,
    // set state, or leave a timer running.
    let cancelled = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const insertTimers = new Set<ReturnType<typeof setTimeout>>();

    /**
     * Send everything that failed while we were down, oldest first. Stops at
     * the first failure so order is kept and the rest wait for the next
     * SUBSCRIBED. Anything for a round we have since left is dropped — a
     * receiver would ignore it anyway.
     */
    async function flushPending(channel: RealtimeChannel) {
      while (pendingRef.current.length > 0 && !cancelled) {
        const next = pendingRef.current[0];
        const forGame = next.payload.gameId;
        if (typeof forGame === 'string' && forGame !== useGameStore.getState().gameId) {
          pendingRef.current = pendingRef.current.filter((p) => p !== next);
          continue;
        }
        const result = await channel.send({ type: 'broadcast', event: next.event, payload: next.payload });
        if (result !== 'ok') return;
        // By identity: a newer copy may have replaced this key meanwhile.
        pendingRef.current = pendingRef.current.filter((p) => p !== next);
      }
    }

    function subscribe(): RealtimeChannel {
      const channel = supabase.channel(`room:${roomCode}`, {
        config: {
          // self: true so the broadcaster also receives their own game events.
          // ack: true so send() resolves 'ok' only once the server has the
          // message; without it a send on a half-dead socket reports 'ok' and
          // a bingo can vanish without ever reaching the retry queue.
          broadcast: { self: true, ack: true },
          presence: { key: self.id },
        },
      });

      channel
        // ── Presence (lobby player list) ────────────────────────────────────
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState<PresencePlayer>();
          const present = Object.values(state).flat();
          setPresentPlayers(present);

          // Anyone here who has no entry in the store yet gets an unsynced
          // placeholder, so the rail can show them as "syncing" rather than
          // pretending they are on 0/25 (DESIGN.md, Partial state).
          // addPlaceholders, never setOthers: presence must not touch a board
          // that has already synced.
          const store = useGameStore.getState();
          if (!store.gameId) return;
          const missing = present.filter(
            (p) => p.playerId !== self.id && !store.others[p.playerId],
          );
          if (missing.length === 0) return;
          store.addPlaceholders(
            missing.map((p) => ({
              playerId: p.playerId,
              displayName: p.displayName,
              avatarUrl: p.avatarUrl,
              card: [],
              marks: [],
              won: false,
              finishPosition: null,
              synced: false,
            })),
          );
        })

        // ── Game events ─────────────────────────────────────────────────────
        .on('broadcast', { event: 'game_started' }, async ({ payload }: { payload: GameStartedPayload }) => {
          // Already on this round — the DB bootstrap beat the broadcast, or a
          // queued copy arrived twice. Re-initialising would wipe our marks.
          if (useGameStore.getState().gameId === payload.gameId) return;
          initGame(payload);
          // Generate this player's card from the shared seed + their unique ID
          const card = generateCard(
            payload.templateItems,
            payload.seed,
            self.id,
            payload.boardSize,
            payload.shuffleMode,
            payload.freeSpace,
          );
          setMyCard(card);

          // Persist this player's game_players record so wins can be verified
          // and the DB has a record of who played. ignoreDuplicates makes this
          // insert-only: if the row already exists (a rejoin, a replayed
          // broadcast) its marks and win must survive, never reset to [] / false.
          const { error } = await supabase.from('game_players').upsert(
            {
              game_id: payload.gameId,
              player_id: self.id,
              card_data: card as unknown as import('@/lib/supabase/types').Json,
              marks: [],
              won: false,
            },
            { onConflict: 'game_id,player_id', ignoreDuplicates: true },
          );
          if (error) {
            console.error('Failed to create game_players record:', error);
            // Generic copy — never surface raw DB error text to players.
            toast.error('Your card could not be saved. Stats may be missing.');
          }
          if (cancelled) return;
          // Read everyone else's rows only after our own row exists, so the
          // other clients' matching fetches can see us too.
          await loadGamePlayers(supabase, payload.gameId, self.id);
        })

        .on('broadcast', { event: 'item_called' }, ({ payload }: { payload: ItemCalledPayload }) => {
          setCalledCount(payload.callsMade);
        })

        .on('broadcast', { event: 'bingo_confirmed' }, ({ payload }: { payload: BingoConfirmedPayload }) => {
          if (payload.gameId && payload.gameId !== useGameStore.getState().gameId) return;
          addWinner({
            playerId: payload.playerId,
            displayName: payload.displayName,
            pattern: payload.pattern,
            finishPosition: payload.finishPosition,
          });
        })

        // A win taken back (an early bingo that backed off). removeWinner is
        // idempotent, so the retracting tab's own echo is a no-op; later
        // winners move up a place, and the banner/gold clear once none remain.
        .on('broadcast', { event: 'bingo_retracted' }, ({ payload }: { payload: BingoRetractedPayload }) => {
          if (payload.gameId && payload.gameId !== useGameStore.getState().gameId) return;
          const store = useGameStore.getState();
          store.removeWinner(payload.playerId);
          // My win taken back from another tab of mine: a later real win on
          // this tab must be free to auto-claim again.
          if (payload.playerId === self.id) store.setHasClaimed(false);
        })

        .on('broadcast', { event: 'mark_updated' }, ({ payload }: { payload: MarkUpdatedPayload }) => {
          // Our own marks already live in myMarks; echoing them into `others`
          // would double-render us in the rail.
          if (payload.playerId === self.id) return;
          if (payload.gameId && payload.gameId !== useGameStore.getState().gameId) return;
          useGameStore.getState().setOtherMarks(payload.playerId, payload.marks);
        })

        // Host ended the game night — rooms.status is now 'finished' in the DB,
        // so clients re-render the server component to reach the GameOver screen.
        // The host swapped one game's unmarked squares for another's on every
        // card. The new cards are already in game_players.card_data, so this
        // just rereads them — mine and everyone else's.
        .on('broadcast', { event: 'cards_swapped' }, async ({ payload }: { payload: { gameId?: string } }) => {
          const { gameId } = useGameStore.getState();
          if (!gameId || (payload.gameId && payload.gameId !== gameId)) return;
          await loadGamePlayers(supabase, gameId, self.id, { includeMyCard: true });
        })

        // The host switched the card style for the night. Boards redraw in place;
        // cards and marks are untouched.
        .on('broadcast', { event: 'style_changed' }, ({ payload }: { payload: { stylePreset?: unknown } }) => {
          if (typeof payload.stylePreset === 'string') onStyleChangedRef.current?.(payload.stylePreset);
        })

        .on('broadcast', { event: 'room_closed' }, () => {
          onRoomClosedRef.current?.();
        })

        // ── postgres_changes fallback ───────────────────────────────────────
        // Broadcasts are fire-and-forget: a tab that was asleep or briefly
        // disconnected never sees them. These DB subscriptions replay the
        // pieces of state that actually matter (room lifecycle, call progress,
        // a new round) so such a client self-heals instead of sitting on a
        // stale screen. Boards and winners are replayed by loadGamePlayers.
        // Both handlers are idempotent and dedupe against current state, so a
        // client that DID get the broadcast does nothing extra here.
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
          ({ new: row }: { new: { status?: string; settings?: { stylePreset?: unknown } } }) => {
            // A Style switch this tab's broadcast missed. Idempotent: RoomClient
            // ignores a preset it already shows.
            const stylePreset = row?.settings?.stylePreset;
            if (typeof stylePreset === 'string') onStyleChangedRef.current?.(stylePreset);
            const status = row?.status;
            if (!status || status === lastRoomStatusRef.current) return;
            lastRoomStatusRef.current = status;
            // Same handler as room_closed: re-render the server component so the
            // right screen (lobby / board / game over) is chosen from the new status.
            onRoomClosedRef.current?.();
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'games', filter: `room_id=eq.${roomId}` },
          ({ new: row }: { new: { id?: string; calls_made?: number } }) => {
            const store = useGameStore.getState();
            // Ignore rows for a different round than the one we're rendering.
            if (!row?.id || row.id !== store.gameId) return;
            if (typeof row.calls_made !== 'number') return;
            // Never rewind: the broadcast may already have moved us further along.
            if (row.calls_made <= store.calledCount) return;
            store.setCalledCount(row.calls_made);
          },
        )
        // A new round is an INSERT, which the UPDATE listener above never sees.
        // Give the game_started broadcast a moment to land; if it hasn't, this
        // tab missed it and bootstraps the round from the DB instead.
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'games', filter: `room_id=eq.${roomId}` },
          ({ new: row }: { new: { id?: string } }) => {
            const newId = row?.id;
            if (!newId) return;
            const timer = setTimeout(() => {
              insertTimers.delete(timer);
              if (cancelled || useGameStore.getState().gameId === newId) return;
              onRoundChangedRef.current?.();
            }, INSERT_FALLBACK_MS);
            insertTimers.add(timer);
          },
        )

        .subscribe(async (status) => {
          if (cancelled) return;

          if (status === 'SUBSCRIBED') {
            attempt = 0; // a good connection clears the backoff ladder
            setConnection('live');
            await channel.track({
              playerId: self.id,
              displayName: self.display_name,
              avatarUrl: self.avatar_url ?? null,
              joinedAt: new Date().toISOString(),
            });
            // What we failed to say while down goes out first — a bingo claimed
            // mid-drop is announced now rather than never.
            await flushPending(channel);
            if (cancelled) return;
            // Anything we missed while the socket was down is in the DB.
            const { gameId } = useGameStore.getState();
            if (!gameId) return;
            // A round started while we were away replaces this one entirely;
            // reloading the old round's boards would leave us marking a dead row.
            const { data: latest, error: latestError } = await supabase
              .from('games')
              .select('id')
              .eq('room_id', roomId)
              .order('started_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (cancelled) return;
            if (latestError) console.error('Failed to check for a newer round:', latestError);
            if (latest && latest.id !== gameId) {
              onRoundChangedRef.current?.();
              return;
            }
            // includeMyCard: a cards_swapped broadcast sent while we were
            // down only lives in card_data now.
            await loadGamePlayers(supabase, gameId, self.id, { includeMyCard: true });
            return;
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setConnection('reconnecting');
            // Drop the dead channel outright: Supabase does not revive an
            // errored channel on its own, and holding it leaks the socket.
            supabase.removeChannel(channel);
            channelRef.current = null;
            const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
            attempt++;
            retryTimer = setTimeout(() => {
              if (cancelled) return;
              channelRef.current = subscribe();
            }, delay);
          }
        });

      return channel;
    }

    channelRef.current = subscribe();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      for (const timer of insertTimers) clearTimeout(timer);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
    // Only re-subscribe on identity changes; the store setters and the
    // onRoomClosed callback are read through refs/getState on purpose.
  }, [roomCode, roomId, player?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Send a broadcast event to the room channel. Never silently drops: with no
   * channel (mid-backoff) or no server ack, the event is queued and flushed on
   * the next SUBSCRIBED. Resolves true only when the server acked it.
   */
  async function broadcast(event: string, payload: Record<string, unknown>): Promise<boolean> {
    const key = pendingKey(event, payload);
    const enqueue = () => {
      // Replace an older copy under the same key rather than stacking them.
      pendingRef.current = enqueuePending(pendingRef.current, event, payload);
    };
    const channel = channelRef.current;
    if (!channel) {
      enqueue();
      return false;
    }
    const result = await channel.send({ type: 'broadcast', event, payload });
    if (result !== 'ok') {
      enqueue();
      return false;
    }
    // A queued older copy is now stale; flushing it later would rewind marks.
    pendingRef.current = pendingRef.current.filter((p) => p.key !== key);
    return true;
  }

  return {
    presentPlayers,
    connection,
    broadcast,
  };
}
