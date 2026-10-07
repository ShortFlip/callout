import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The store talks to Supabase only through the library api; stub it so a test
// can make the read fail and then succeed, the way a blip does.
vi.mock('@/lib/library/api', () => {
  class LibraryError extends Error {}
  return {
    LibraryError,
    loadLibrary: vi.fn(),
    loadSavedCards: vi.fn(),
    loadHeatRows: vi.fn(async () => []),
  };
});
vi.mock('@/lib/library/notify', () => ({
  notify: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import * as api from '@/lib/library/api';
import { useLibraryStore } from '../libraryStore';

const loadLibrary = vi.mocked(api.loadLibrary);
const loadSavedCards = vi.mocked(api.loadSavedCards);

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  loadLibrary.mockReset();
  loadSavedCards.mockReset();
  useLibraryStore.setState({ loaded: false, loadFailed: false, ownerId: null, items: [], tags: [], savedCards: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Run load() through every retry delay without waiting in real time. */
async function loadWithTimers(ownerId: string): Promise<boolean> {
  const pending = useLibraryStore.getState().load(ownerId);
  await vi.runAllTimersAsync();
  return pending;
}

describe('libraryStore.load', () => {
  it('rides out one blip without ever reporting a failure', async () => {
    loadLibrary.mockRejectedValueOnce(new Error('blip')).mockResolvedValue({ items: [], tags: [] });
    loadSavedCards.mockResolvedValue([]);

    expect(await loadWithTimers('me')).toBe(true);
    expect(useLibraryStore.getState()).toMatchObject({ loaded: true, loadFailed: false, ownerId: 'me' });
  });

  it('flags a failed load, not a forever-loading one, and a retry clears it', async () => {
    // Every try of the first load fails: the page must get loadFailed, or it
    // shows its skeleton forever (the 2026-10-07 audit's stuck Library).
    loadLibrary.mockRejectedValue(new Error('offline'));
    loadSavedCards.mockResolvedValue([]);

    expect(await loadWithTimers('me')).toBe(false);
    expect(useLibraryStore.getState()).toMatchObject({ loaded: false, loadFailed: true });

    // Try Again re-runs load(); the server is back.
    loadLibrary.mockResolvedValue({ items: [], tags: [] });
    expect(await loadWithTimers('me')).toBe(true);
    expect(useLibraryStore.getState()).toMatchObject({ loaded: true, loadFailed: false });
  });
});
