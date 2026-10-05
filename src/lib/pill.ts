/**
 * The pill scale: every chip in the app — `Live`, `Your Board`, `1st` / `2nd`,
 * `1st — Name`, `2nd — Open`, `Syncing`, the History placing — built from one
 * place so the whole scale moves together, never one pill at a time (DESIGN.md
 * Part 2, type scale; the 13px floor ruled 2026-09-23).
 *
 * 13px, body face 700, Title Case, tabular digits. Until the 2026-10-04 design
 * audit pills were JetBrains Mono uppercase; they are labels, not codes, so
 * they now follow the no-mono and no-all-caps rules (3, 9, 10). Mono is kept
 * for the room and claim codes only, where O/0 and I/1 must stay distinct.
 * `leading-none` with 3px of vertical padding keeps a pill 19px tall (21px
 * with a border), so the type change does not move the row it sits in.
 */
export const PILL_TYPE = 'text-[13px] font-bold leading-none tabular-nums';

/** A pill's box: the type above plus the shape. Colour and border stay with each caller. */
export const PILL = `${PILL_TYPE} inline-flex items-center whitespace-nowrap rounded-full px-2 py-[3px]`;
