import { describe, it, expect } from 'vitest';
import {
  CATCH_UP_WINNER_GRACE_MS,
  MARK_REWIND_WINDOW_MS,
  readMayOverwrite,
} from '../catch-up';
import { RETRY_DELAYS_MS } from '@/lib/utils/retry';

describe('readMayOverwrite', () => {
  const broadcastAt = 100_000;

  it('keeps live marks when the read started before the broadcast', () => {
    expect(readMayOverwrite(broadcastAt - 1000, broadcastAt)).toBe(false);
  });

  it('keeps live marks when the read started inside the window after the broadcast', () => {
    // The DB lags the broadcast by the sender's write debounce, so this read
    // can still carry the old marks.
    expect(readMayOverwrite(broadcastAt + 500, broadcastAt)).toBe(false);
    expect(readMayOverwrite(broadcastAt + MARK_REWIND_WINDOW_MS - 1, broadcastAt)).toBe(false);
  });

  it('applies a read that started after the window', () => {
    expect(readMayOverwrite(broadcastAt + MARK_REWIND_WINDOW_MS, broadcastAt)).toBe(true);
    expect(readMayOverwrite(broadcastAt + 10_000, broadcastAt)).toBe(true);
  });

  it('applies the read for a player with no live broadcast on record', () => {
    expect(readMayOverwrite(broadcastAt, undefined)).toBe(true);
  });

  it('honours a custom window', () => {
    expect(readMayOverwrite(broadcastAt + 10_000, broadcastAt, CATCH_UP_WINNER_GRACE_MS)).toBe(false);
    expect(readMayOverwrite(broadcastAt + CATCH_UP_WINNER_GRACE_MS, broadcastAt, CATCH_UP_WINNER_GRACE_MS)).toBe(true);
  });
});

describe('CATCH_UP_WINNER_GRACE_MS', () => {
  it('outlasts the whole win-write retry backoff', () => {
    const retrySpan = RETRY_DELAYS_MS.reduce((total, delay) => total + delay, 0);
    expect(CATCH_UP_WINNER_GRACE_MS).toBeGreaterThan(retrySpan);
  });
});
