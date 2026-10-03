'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

/**
 * Browser-side Supabase client.
 * Use this in Client Components ('use client') and hooks.
 * Creates a new client instance each call — safe because @supabase/ssr
 * deduplicates connections internally.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Run the realtime heartbeat from a Web Worker. A background tab's main
      // thread timers are throttled hard, so the socket's heartbeat can stall
      // and the server drops a tab that still thinks it is subscribed (missed
      // mark_updated broadcasts until a refresh). realtime-js builds the worker
      // from an inline Blob, so nothing extra is fetched or bundled.
      realtime: { worker: true },
    },
  );
}
