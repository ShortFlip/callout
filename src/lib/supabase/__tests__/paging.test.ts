import { describe, expect, it } from 'vitest';
import { CHUNK, PAGE, readAllPages, readAllPagesIn } from '../paging';

/** A fake table that answers range reads the way PostgREST does: capped at PAGE. */
function table(size: number) {
  const rows = Array.from({ length: size }, (_, i) => i);
  const calls: [number, number][] = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to, from + PAGE - 1) + 1), error: null };
  };
  return { rows, calls, fetchPage };
}

describe('readAllPages', () => {
  it('reads past the 1,000-row cap', async () => {
    // The bug: 2,500 rows came back as 1,000 with no error.
    const t = table(2500);
    expect(await readAllPages(t.fetchPage)).toEqual(t.rows);
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('stops after one short page', async () => {
    const t = table(10);
    expect(await readAllPages(t.fetchPage)).toHaveLength(10);
    expect(t.calls).toHaveLength(1);
  });

  it('asks once more when the last page is exactly full', async () => {
    const t = table(PAGE);
    expect(await readAllPages(t.fetchPage)).toHaveLength(PAGE);
    expect(t.calls).toHaveLength(2);
  });

  it('throws the read error instead of returning what it has', async () => {
    const boom = new Error('boom');
    await expect(readAllPages(async () => ({ data: null, error: boom }))).rejects.toBe(boom);
  });
});

describe('readAllPagesIn', () => {
  it('splits the ids into chunks and reads each in full', async () => {
    const ids = Array.from({ length: CHUNK + 5 }, (_, i) => `room-${i}`);
    const seen: number[] = [];
    const rows = await readAllPagesIn(ids, async (chunk) => {
      seen.push(chunk.length);
      return { data: chunk, error: null };
    });
    expect(seen).toEqual([CHUNK, 5]);
    expect(rows).toEqual(ids);
  });
});
