import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { RoomClient } from '@/components/game/RoomClient';
import { ServerUnreachable } from '@/components/layout/ServerUnreachable';
import { withRetry } from '@/lib/utils/retry';
import type { Tables } from '@/lib/supabase/types';

interface RoomPageProps {
  params: Promise<{ code: string }>;
}

// Server render blocks the page, so the backoff here is short (~1 s total);
// the player gets the retry button rather than a long blank wait.
const ROOM_READ_RETRY_DELAYS_MS = [300, 700];

export async function generateMetadata({ params }: RoomPageProps) {
  const { code } = await params;
  return { title: `Room ${code.toUpperCase()} — Callout` };
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { code } = await params;
  const joinCode = code.toUpperCase();

  const supabase = await createClient();
  // A failed read and a missing room are different answers: only "no row"
  // is a 404. Treating an unreachable database as "not found" sent friends
  // in the middle of a night to a dead end.
  const roomRead = await withRetry<Tables<'rooms'> | null>(async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('join_code', joinCode)
      .maybeSingle();
    if (error) {
      console.error('Failed to read room:', error);
      return { ok: false };
    }
    return { ok: true, value: data };
  }, ROOM_READ_RETRY_DELAYS_MS);

  if (!roomRead.ok) return <ServerUnreachable />;
  if (!roomRead.value) notFound();

  return <RoomClient initialRoom={roomRead.value} />;
}
