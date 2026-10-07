'use client';

import { useRouter } from 'next/navigation';
import { RetryButton } from '@/components/layout/LoadError';
import { StatusPage } from '@/components/layout/StatusPage';

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

  return (
    // Same amber as the in-game Reconnecting bar.
    <StatusPage
      pill="Offline"
      tone="accent"
      title="Can't Reach The Server"
      actions={
        <RetryButton
          variant="default"
          size="lg"
          className="w-full"
          onRetry={onRetry ?? (() => router.refresh())}
        />
      }
    >
      Nothing is lost. Check your connection, then try again.
    </StatusPage>
  );
}
