'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { StatusPage } from '@/components/layout/StatusPage';
import { cn } from '@/lib/utils';

/**
 * The one not-found page. Almost every 404 here is a mistyped or stale room
 * code (room/[code]/page.tsx calls notFound() when no room has that code), so
 * it speaks about rooms. A not-found page gets no params, so the code comes
 * from the URL; any other path gets the same card without one.
 */
export default function NotFound() {
  const pathname = usePathname();
  const code = /^\/room\/([^/]+)/.exec(pathname ?? '')?.[1]?.toUpperCase() ?? null;

  return (
    <StatusPage
      pill="No Room"
      tone="destructive"
      title="No Room With That Code"
      actions={
        <Link href="/" className={cn(buttonVariants({ size: 'lg' }), 'w-full gap-2 rounded-md')}>
          <ArrowLeft strokeWidth={1.75} />
          Back to Home
        </Link>
      }
    >
      {code ? (
        <>
          {/* Mono: a room code is read aloud, so O/0 and I/1 must stay distinct. */}
          <span className="font-mono font-bold tracking-[0.06em] text-foreground">{code}</span> isn&apos;t a live room.
        </>
      ) : (
        <>That isn&apos;t a live room.</>
      )}{' '}
      Check the code with whoever&apos;s hosting.
    </StatusPage>
  );
}
