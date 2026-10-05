# 0006 — A dropped channel is removed once, outside its own callback

- **Date:** 2026-10-05
- **Symptom:** Killing the local mock Supabase under an open room
  (`/room/ENDED2`) filled the console with "Maximum call stack size exceeded"
  and "cannot add `presence` callbacks … after `subscribe()`". The status
  callback in `useRealtimeRoom` called `supabase.removeChannel(channel)` on
  `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`; removing a channel unsubscribes it,
  which fires the same callback with `CLOSED` synchronously, so it re-entered
  itself until the stack blew. Every level also queued a phx_leave and a
  resubscribe timer, and the half-removed channel was handed back by
  `supabase.channel()` on retry, hence the presence error. A real dropped
  socket on game night would do the same.
- **Measurement:** Mock killed by PID for ~35 s, then restarted. Before:
  59 stack overflows, 36,302 phx_leave and 45 phx_join on reconnect. After:
  no errors, 6 leave/join pairs (one per 1–2–4–8 s backoff step that fired
  during the outage, flushed from the socket's buffer), ending on one live
  join. `drop-channel.test.ts` reproduces the synchronous re-entry with a fake
  client.
- **Rule:**
  1. Never call `removeChannel` from inside that channel's own status
     callback. A dropped channel goes through `createChannelDropper`
     (`src/lib/realtime/drop-channel.ts`): once per channel, on a microtask.
  2. Only the first drop report per channel moves the backoff and schedules a
     resubscribe; the CLOSED that removal fires is ignored.
  3. The 1–2–4–8 s backoff is unchanged.
- **Code site:** `src/hooks/useRealtimeRoom.ts` (the `.subscribe` status
  callback), `src/lib/realtime/drop-channel.ts`.

Unmount is unaffected: the cleanup sets `cancelled` before it removes the
channel, so the CLOSED it triggers returns at the top of the callback.
