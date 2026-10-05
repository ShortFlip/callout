/**
 * Builds the one place a dropped realtime channel is removed.
 *
 * `supabase.removeChannel` unsubscribes, and unsubscribing fires the channel's
 * own status callback with `CLOSED` — synchronously, from inside the call. A
 * status callback that answers CLOSED by calling removeChannel therefore
 * re-enters itself until the stack overflows, and every level queues another
 * phx_leave and another resubscribe timer. Killing the mock Supabase under an
 * open room produced ~36,000 phx_leave frames and 45 joins once it came back.
 *
 * The returned `drop(channel)` removes each channel at most once, on a
 * microtask so it never runs inside the status callback that reported the
 * drop. It returns `true` only on the first call for a channel: the caller
 * schedules its resubscribe only then, so one drop is one backoff step.
 */
export function createChannelDropper<C extends object>(
  remove: (channel: C) => unknown,
  // Injectable so a test can run the removal synchronously and prove the flag
  // alone stops the re-entry.
  defer: (fn: () => void) => void = queueMicrotask,
): (channel: C) => boolean {
  // WeakSet: a dropped channel is garbage once Supabase lets go of it.
  const dropped = new WeakSet<C>();
  return (channel) => {
    if (dropped.has(channel)) return false;
    dropped.add(channel);
    defer(() => {
      remove(channel);
    });
    return true;
  };
}
