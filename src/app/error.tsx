'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { RetryButton } from '@/components/layout/LoadError';
import { StatusPage } from '@/components/layout/StatusPage';
import { cn } from '@/lib/utils';

interface ErrorPageProps {
  error: Error & { digest?: string };
  /** Next 16.3: re-fetches and re-renders the segment (reset() only re-renders). */
  retry: () => void;
}

/**
 * Anything unexpected that throws while a page renders. Every board, mark and
 * win is already in the database, so the honest message is that nothing is
 * lost, with Try Again and a way home (where the Rejoin chip waits).
 */
export default function ErrorPage({ error, retry }: ErrorPageProps) {
  useEffect(() => {
    // Not shown to the player (never raw error text), but kept for debugging.
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      pill="Error"
      tone="accent"
      title="Something Broke"
      actions={
        <div className="grid grid-cols-2 gap-2">
          <RetryButton variant="default" size="lg" onRetry={retry} />
          <Link href="/" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'rounded-md')}>
            Home
          </Link>
        </div>
      }
    >
      Nothing is lost. Try again, or head home and rejoin.
    </StatusPage>
  );
}
