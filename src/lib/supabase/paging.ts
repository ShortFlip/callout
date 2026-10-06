/** PostgREST returns at most 1,000 rows per request; page through anything bigger. */
export const PAGE = 1000;

/** Ids per `.in()` filter, so a long id list never builds an overlong URL. */
export const CHUNK = 100;

export function chunks<T>(list: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

type PageResult<T> = { data: T[] | null; error: unknown };

/**
 * Every row a query would return, not just the first 1,000. A plain read past
 * the cap does not fail; it comes back short with no error, which is how a
 * long-running group's History and leaderboard would quietly stop counting.
 *
 * `fetchPage(from, to)` must apply `.range(from, to)` to a query with a
 * stable `.order(...)` (a unique column last), or rows can repeat or go
 * missing between pages. Throws the first error it meets.
 */
export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/**
 * readAllPages over a long id list: one `.in()` filter per CHUNK ids, each
 * paged in full. `fetchPage(ids, from, to)` gets the chunk to filter on.
 */
export async function readAllPagesIn<T>(
  ids: string[],
  fetchPage: (ids: string[], from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (const chunk of chunks(ids)) {
    rows.push(...(await readAllPages<T>((from, to) => fetchPage(chunk, from, to))));
  }
  return rows;
}
