/**
 * The section label: the small caption above a panel's content ("Room Code",
 * "Players (4)", "Theme", "Badges"). One constant so every caption moves
 * together, the way `pill.ts` holds the pill scale.
 *
 * Title Case at 14px semibold with normal tracking. These were 13px uppercase
 * with `tracking-widest` until the 2026-10-04 design audit: all-caps,
 * letter-spaced micro-labels read as shouting (design rules 9 and 10), so the
 * hierarchy now comes from weight instead of capitals.
 */
export const SECTION_LABEL = 'text-[14px] font-semibold text-muted-foreground';
