import { cn } from '@/lib/utils';

interface SkeletonRowsProps {
  /** How many placeholder rows (or tiles) to draw. */
  count: number;
  /** What is loading, read out by screen readers ("Loading your cards"). */
  label: string;
  /** Layout of the group: `space-y-2`, `grid grid-cols-2 gap-3`, … */
  className?: string;
  /** Size and shape of one row, matched to the real row it stands in for. */
  rowClassName?: string;
}

/**
 * Placeholder rows in the shape of the list that is loading, instead of a lone
 * spinner and the word "Loading…" (design rule 61, 2026-10-04 audit). The real
 * rows replace these in place, so nothing jumps when the data lands. History,
 * Library and the board already load this way; this is the same idea for lists.
 */
export function SkeletonRows({ count, label, className, rowClassName }: SkeletonRowsProps) {
  return (
    <div role="status" aria-label={label} className={cn('space-y-2', className)}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className={cn('h-12 rounded-lg bg-muted animate-pulse motion-reduce:animate-none', rowClassName)}
        />
      ))}
    </div>
  );
}
