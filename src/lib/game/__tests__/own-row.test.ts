import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { ensureOwnRow, rowsLanded, writeOwnRow } from '../own-row';

interface Row {
  game_id: string;
  player_id: string;
  card_data: unknown;
  marks: number[];
  won: boolean;
  [col: string]: unknown;
}

/**
 * A fake of the two PostgREST shapes own-row uses: an insert-only upsert, and
 * update().match().select(). Rows live in an array so a test can see exactly
 * what landed; `failUpserts` / `failUpdates` stage a blip.
 */
function fakeSupabase(rows: Row[], opts: { failUpserts?: number; failUpdates?: number } = {}) {
  let failUpserts = opts.failUpserts ?? 0;
  let failUpdates = opts.failUpdates ?? 0;
  const error = { message: 'boom' };
  const client = {
    from: () => ({
      upsert: async (row: Row) => {
        if (failUpserts > 0) {
          failUpserts--;
          return { error };
        }
        const exists = rows.some((r) => r.game_id === row.game_id && r.player_id === row.player_id);
        if (!exists) rows.push({ ...row });
        return { error: null };
      },
      update: (patch: Partial<Row>) => ({
        match: (key: { game_id: string; player_id: string }) => ({
          select: async () => {
            if (failUpdates > 0) {
              failUpdates--;
              return { data: null, error };
            }
            const hit = rows.filter((r) => r.game_id === key.game_id && r.player_id === key.player_id);
            for (const r of hit) Object.assign(r, patch);
            return { data: hit.map((r) => ({ player_id: r.player_id })), error: null };
          },
        }),
      }),
    }),
  };
  return client as unknown as SupabaseClient<Database>;
}

const key = { gameId: 'g1', playerId: 'me' };
const card = [{ text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' }];

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('rowsLanded', () => {
  it('treats an empty or missing result as nothing written', () => {
    // The bug: update().match() on 0 rows is { data: [], error: null }.
    expect(rowsLanded([])).toBe(false);
    expect(rowsLanded(null)).toBe(false);
    expect(rowsLanded(undefined)).toBe(false);
    expect(rowsLanded([{ player_id: 'me' }])).toBe(true);
  });
});

describe('ensureOwnRow', () => {
  it('never resets an existing row', () => {
    const rows: Row[] = [{ game_id: 'g1', player_id: 'me', card_data: card, marks: [0, 1], won: true }];
    return ensureOwnRow(fakeSupabase(rows), key, card).then((ok) => {
      expect(ok).toBe(true);
      expect(rows[0]).toMatchObject({ marks: [0, 1], won: true });
    });
  });

  it('refuses to write a row with no card', async () => {
    const rows: Row[] = [];
    expect(await ensureOwnRow(fakeSupabase(rows), key, [])).toBe(false);
    expect(rows).toHaveLength(0);
  });

  it('reports a failed create', async () => {
    expect(await ensureOwnRow(fakeSupabase([], { failUpserts: 1 }), key, card)).toBe(false);
  });
});

describe('writeOwnRow', () => {
  it('updates an existing row and reports it landed', async () => {
    const rows: Row[] = [{ game_id: 'g1', player_id: 'me', card_data: card, marks: [], won: false }];
    expect(await writeOwnRow(fakeSupabase(rows), key, { marks: [2] }, card)).toBe(true);
    expect(rows[0].marks).toEqual([2]);
  });

  it('recreates a row whose first create was lost, with the card, then writes', async () => {
    // The audit's High: the game_started upsert failed once, and every later
    // save matched 0 rows and called it success. Now the save puts the row back.
    const rows: Row[] = [];
    expect(await writeOwnRow(fakeSupabase(rows), key, { won: true, marks: [0, 1, 2] }, card)).toBe(true);
    expect(rows).toEqual([{ game_id: 'g1', player_id: 'me', card_data: card, marks: [0, 1, 2], won: true }]);
  });

  it('fails (so the caller retries) when the update errors', async () => {
    const rows: Row[] = [{ game_id: 'g1', player_id: 'me', card_data: card, marks: [], won: false }];
    expect(await writeOwnRow(fakeSupabase(rows, { failUpdates: 1 }), key, { marks: [2] }, card)).toBe(false);
    expect(rows[0].marks).toEqual([]);
  });

  it('fails when the row is missing and cannot be created', async () => {
    const rows: Row[] = [];
    expect(await writeOwnRow(fakeSupabase(rows, { failUpserts: 1 }), key, { marks: [2] }, card)).toBe(false);
    expect(rows).toHaveLength(0);
  });

  it("only touches this player's row in this round", async () => {
    const rows: Row[] = [
      { game_id: 'g1', player_id: 'bob', card_data: card, marks: [5], won: true },
      { game_id: 'g0', player_id: 'me', card_data: card, marks: [7], won: false },
    ];
    expect(await writeOwnRow(fakeSupabase(rows), key, { marks: [1] }, card)).toBe(true);
    expect(rows[0]).toMatchObject({ marks: [5], won: true });
    expect(rows[1]).toMatchObject({ marks: [7] });
    expect(rows[2]).toMatchObject({ game_id: 'g1', player_id: 'me', marks: [1] });
  });
});
