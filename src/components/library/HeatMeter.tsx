import { cn } from '@/lib/utils';
import type { ItemHeat } from '@/lib/library/heat';
import { hitRate } from '@/lib/library/heat';

/*
 * The cold end of the heat scale. No theme token is a cool blue, and the scale
 * needs one so "rarely marked" reads as cold rather than as an error (rose) or
 * a win (emerald). The hot end is the theme's own amber accent.
 */
const COLD = 'oklch(0.7 0.13 240)';

/** Cool blue at 0%, the amber accent at 100%, mixed in oklch so the middle stays bright. */
export function heatColor(rate: number): string {
  const hot = Math.round(Math.min(1, Math.max(0, rate)) * 100);
  return `color-mix(in oklch, var(--accent) ${hot}%, ${COLD})`;
}

interface HeatMeterProps {
  heat: ItemHeat | undefined;
  className?: string;
}

/**
 * A thin bar plus NN% for one item. Fixed width so every row's game menu stays
 * in the same column; an item that never appeared shows "New", not 0%, because
 * no history is not the same as never marked.
 */
export function HeatMeter({ heat, className }: HeatMeterProps) {
  const rate = hitRate(heat);
  const title = heat && rate !== null ? `Marked ${heat.marked} of ${heat.appearances} times` : 'Never On A Card Yet';
  return (
    <span className={cn('flex w-16 shrink-0 items-center gap-1.5', className)} title={title} data-testid="item-heat">
      {rate === null ? (
        <span className="w-full text-right text-[13px] text-muted-foreground/70">New</span>
      ) : (
        <>
          <span aria-hidden className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(4, rate * 100)}%`, background: heatColor(rate) }}
            />
          </span>
          <span className="w-9 text-right tabular-nums text-[13px]" style={{ color: heatColor(rate) }}>
            {Math.round(rate * 100)}%
          </span>
        </>
      )}
    </span>
  );
}
