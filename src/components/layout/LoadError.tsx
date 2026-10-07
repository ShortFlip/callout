'use client';

import { useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RetryButtonProps {
  /** What Try Again re-runs. The button stays pending until it settles. */
  onRetry: () => Promise<void> | void;
  variant?: 'default' | 'secondary';
  size?: 'default' | 'lg';
  className?: string;
}

/**
 * The one Try Again button: a RefreshCw that spins only while the retry is in
 * flight, inside the button (decision 0005: spinners live only in the button
 * that started the work), and stands still under prefers-reduced-motion.
 */
export function RetryButton({ onRetry, variant = 'secondary', size = 'default', className }: RetryButtonProps) {
  const [isRetrying, startRetry] = useTransition();

  function handleRetry() {
    // An async transition keeps the button pending for the whole retry,
    // whether that is a client re-read or a server re-render.
    startRetry(async () => {
      await onRetry();
    });
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={cn('gap-2 rounded-md px-3', className)}
      onClick={handleRetry}
      disabled={isRetrying}
    >
      <RefreshCw
        className={cn('size-3.5', isRetrying && 'animate-spin motion-reduce:animate-none')}
        strokeWidth={1.75}
      />
      {isRetrying ? 'Retrying…' : 'Try Again'}
    </Button>
  );
}

interface LoadErrorProps {
  /** Title Case, says what failed: "Couldn't Load Your Nights". */
  title: string;
  /** One reassuring sentence under the title. */
  note?: string;
  onRetry: () => Promise<void> | void;
  /** Stacked fills a list's empty slot; row fits a small widget. */
  layout?: 'stacked' | 'row';
  className?: string;
}

/**
 * A read failed: said in the spot the empty copy would have used, so "we
 * couldn't ask" never looks like "you have none" (the 2026-10-07 audit's
 * false empties). Amber dashed edge, the same dashed box as the empty states
 * so the layout does not move, with the warning tone mixed into the border.
 */
export function LoadError({ title, note = 'Nothing is lost.', onRetry, layout = 'stacked', className }: LoadErrorProps) {
  const stacked = layout === 'stacked';
  return (
    <div
      role="alert"
      className={cn(
        'rounded-xl border border-dashed',
        stacked
          ? 'flex flex-col items-center gap-2 px-4 py-6 text-center'
          : 'flex items-center justify-between gap-4 px-4 py-3.5',
        className,
      )}
      style={{ borderColor: 'color-mix(in oklab, var(--accent) 45%, var(--border))' }}
    >
      <div className={cn('min-w-0', stacked ? 'space-y-1' : 'space-y-0.5')}>
        <p className={cn('font-display font-bold', stacked ? 'text-base' : 'text-[15px]')}>{title}</p>
        <p className="text-[13px] text-muted-foreground">{note}</p>
      </div>
      <RetryButton onRetry={onRetry} className={cn('text-[13px]', stacked ? 'mt-1' : 'shrink-0')} />
    </div>
  );
}
