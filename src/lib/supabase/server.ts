import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './types';

/**
 * Server-side Supabase client.
 * Use this in Server Components, Route Handlers, and Server Actions.
 * Reads/writes auth cookies via next/headers — must be called in a
 * server context (not in 'use client' files or Edge Functions).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component — cookies can't be
            // mutated there. No middleware refreshes the session, so the
            // browser client does it.
          }
        },
      },
    },
  );
}
