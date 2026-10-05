'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PILL_TYPE } from '@/lib/pill';

interface ServerUnreachableProps {
  /**
   * What "Try Again" re-runs. Omitted on a server-rendered page, where the
   * retry is re-running the page itself (router.refresh()).
   */
  onRetry?: () => Promise<void> | void;
}

/**
 * Shown when Supabase could not be reached at all, as opposed to "not found".
 *
 * Why it exists: a failed read used to be treated as an empty one, so a
 * returning friend got the first-visit name prompt (and then a unique
 * browser_id error on submit), and a live room showed a 404. Saying plainly
 * that the server is unreachable, with one retry button, is the honest state.
 */
export function ServerUnreachable({ onRetry }: ServerUnreachableProps) {
  const router = useRouter();
  const [isRetrying, startRetry] = useTransition();

  function handleRetry() {
    // An async transition keeps the button in its pending state for the whole
    // retry, whether that is a client re-read or a server re-render.
    startRetry(async () => {
      if (onRetry) await onRetry();
      else router.refresh();
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="glass rounded-2xl w-full max-w-sm p-8 text-center space-y-4">
        {/* Same amber pill type as the in-game Reconnecting bar. */}
        <span className={cn(PILL_TYPE, 'inline-block text-accent')}>
          Offline
        </span>
        <h1 className="font-display text-2xl font-black">Can&apos;t Reach The Server</h1>
        <p className="text-sm text-muted-foreground">
          Nothing is lost. Check your connection, then try again.
        </p>
        <Button className="w-full gap-2 rounded-md" onClick={handleRetry} disabled={isRetrying}>
          <RefreshCw className={cn('w-4 h-4', isRetrying && 'animate-spin motion-reduce:animate-none')} />
          {isRetrying ? 'Retrying…' : 'Try Again'}
        </Button>
      </div>
    </main>
  );
}
