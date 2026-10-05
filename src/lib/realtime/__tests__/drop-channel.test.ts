import { describe, it, expect, vi } from 'vitest';
import { createChannelDropper } from '../drop-channel';

/**
 * A stand-in for Supabase: removing a channel fires that channel's status
 * callback with CLOSED synchronously, the way the real client does.
 */
function fakeClient() {
  const removed: object[] = [];
  const callbacks = new Map<object, (status: string) => void>();
  return {
    removed,
    channel(onStatus: (ch: object, status: string) => void) {
      const ch = {};
      callbacks.set(ch, (status) => onStatus(ch, status));
      return ch;
    },
    removeChannel(ch: object) {
      removed.push(ch);
      callbacks.get(ch)?.('CLOSED');
    },
    report(ch: object, status: string) {
      callbacks.get(ch)?.(status);
    },
  };
}

describe('createChannelDropper', () => {
  it('removes a channel once even though removal re-fires its own CLOSED', () => {
    const client = fakeClient();
    // Synchronous defer: the flag alone must stop the re-entry.
    const drop = createChannelDropper<object>((ch) => client.removeChannel(ch), (fn) => fn());
    const retries = vi.fn();
    const ch = client.channel((c) => {
      if (drop(c)) retries();
    });

    client.report(ch, 'CHANNEL_ERROR');

    expect(client.removed).toEqual([ch]);
    expect(retries).toHaveBeenCalledTimes(1);
  });

  it('never removes inside the status callback that reported the drop', async () => {
    const client = fakeClient();
    const drop = createChannelDropper<object>((ch) => client.removeChannel(ch));
    const ch = client.channel((c) => {
      drop(c);
    });

    client.report(ch, 'TIMED_OUT');
    expect(client.removed).toEqual([]);

    await Promise.resolve();
    expect(client.removed).toEqual([ch]);
  });

  it('answers true only for the first report per channel', () => {
    const drop = createChannelDropper<object>(() => {}, () => {});
    const first = {};
    const second = {};

    expect(drop(first)).toBe(true);
    expect(drop(first)).toBe(false);
    // A resubscribed channel is a new object and gets its own retry.
    expect(drop(second)).toBe(true);
  });
});
