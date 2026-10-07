'use client';

import { CalloutMark } from '@/components/layout/CalloutMark';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, ArrowRight, LogIn, Crown, Ticket } from 'lucide-react';
import { CreateRoomDialog } from '@/components/game/CreateRoomDialog';
import { TemplateList } from '@/components/game/TemplateList';
import { useCrewSummary } from '@/components/home/CrewSummary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { normalizeRoomCode, isValidRoomCode } from '@/lib/game/room-code';
import { createClient } from '@/lib/supabase/client';
import { getLastRoom, clearLastRoom, type LastRoom } from '@/lib/utils/last-room';
import type { CardTemplate } from '@/types/card';

// How long a remembered room stays offerable. A game night is one evening; a
// chip for yesterday's room is noise, not help.
const REJOIN_WINDOW_MS = 18 * 60 * 60 * 1000;

// Separated into its own component because useSearchParams() requires a Suspense boundary
function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createOpen, setCreateOpen] = useState(() => searchParams.get('create') === 'true');
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  // Null until we have confirmed with the database that the room is still live.
  const [rejoin, setRejoin] = useState<LastRoom | null>(null);
  // The card Host This picked. Null leaves the choice to the Create a Room
  // dialog, which preselects the last hosted card (saved or not).
  const [hostCard, setHostCard] = useState<CardTemplate | null>(null);
  const { crewRow, tiles } = useCrewSummary();

  // Offer a one-click way back into the room this browser was last in, but only
  // while that room is still going. Anything unexpected (no memory, stale
  // memory, room finished, query failed) leaves the chip hidden.
  useEffect(() => {
    const last = getLastRoom();
    if (!last) return;
    if (Date.now() - new Date(last.savedAt).getTime() > REJOIN_WINDOW_MS) {
      clearLastRoom();
      return;
    }

    let cancelled = false;
    createClient()
      .from('rooms')
      .select('status')
      .eq('join_code', last.code)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // Silent: the join box below still works, so there is nothing to
          // tell the player about.
          console.error('Failed to check the last room:', error);
          return;
        }
        if (!data) {
          clearLastRoom();
          return;
        }
        if (data.status === 'finished') {
          clearLastRoom();
          return;
        }
        setRejoin(last);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleJoinInput(e: React.ChangeEvent<HTMLInputElement>) {
    const normalized = normalizeRoomCode(e.target.value).slice(0, 6);
    setJoinCode(normalized);
    setJoinError('');
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidRoomCode(joinCode)) {
      setJoinError('Enter a valid 6-character room code.');
      return;
    }
    router.push(`/room/${joinCode}`);
  }

  // Wide layout (audit item 5, 2026-10-05): no width cap, the page fills the
  // second monitor. A night's setup is check a card → host, so Your Cards takes
  // the main panel and Host/Join sit in a rail beside it. Fixed to the window
  // height so nothing scrolls at 1280×800; below ~720px tall the page scrolls
  // instead of crushing the cards. The extra top padding clears the fixed
  // profile avatar in the top-right corner.
  return (
    <main className="flex h-screen min-h-[720px] flex-col gap-5 px-10 pt-14 pb-7">
      {/* ── Hero band: marquee left, the crew's live numbers right ── */}
      <section className="glass grid shrink-0 grid-cols-[1fr_minmax(0,520px)] items-center gap-8 rounded-2xl px-8 py-6">
        <div className="flex min-w-0 items-center gap-6">
          <CalloutMark size={88} />
          <div className="min-w-0 space-y-2">
            <h1 className="font-display text-7xl font-black leading-none tracking-tight">SQUARES</h1>
            <p className="text-muted-foreground">Real-time bingo for your friend group.</p>
            {crewRow && <div className="pt-1">{crewRow}</div>}
          </div>
        </div>
        {tiles}
      </section>

      {/* Rejoin — above everything else in the body so the way back into a
          live room is the first thing a returning player sees. */}
      {rejoin && (
        <button
          type="button"
          onClick={() => router.push(`/room/${rejoin.code}`)}
          className="flex shrink-0 items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-5 py-3 text-left transition-colors hover:bg-primary/15 active:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogIn className="w-5 h-5 text-primary shrink-0" />
          <p className="min-w-0 flex-1 truncate">
            <span className="font-display text-base font-bold">
              Rejoin{rejoin.name ? ` ${rejoin.name}` : ''}
            </span>
            <span className="ml-2 text-sm text-muted-foreground">
              You were in <span className="font-mono">{rejoin.code}</span>
            </span>
          </p>
          <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_340px] gap-5">
        {/* ── Your Cards: the main panel ── */}
        <section className="glass min-h-0 rounded-2xl p-5">
          <TemplateList selectedId={hostCard?.id ?? null} onHost={setHostCard} />
        </section>

        {/* ── Rail: Host (the page's one primary button), then Join ── */}
        <div className="flex min-h-0 flex-col gap-4">
          <div className="flex flex-1 flex-col gap-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start gap-3.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-[10px] border border-primary/40 bg-primary/15">
                <Crown className="size-[22px] text-primary" />
              </span>
              <div className="space-y-1">
                <h2 className="font-display text-lg font-bold">Host a Game</h2>
                <p className="text-sm text-muted-foreground">Share the room code with your crew.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[13px] font-semibold text-muted-foreground">Card</p>
              <div className="rounded-lg border border-border px-3 py-2.5">
                {hostCard ? (
                  <>
                    <p className="truncate text-sm font-semibold">{hostCard.name}</p>
                    <p className="text-[13px] tabular-nums text-muted-foreground">
                      {hostCard.board_size}×{hostCard.board_size} · from Your Cards
                    </p>
                  </>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    Pick one with Host This, or choose in the next step.
                  </p>
                )}
              </div>
            </div>
            <Button size="lg" className="mt-auto h-12 w-full gap-2 text-base" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              Create a Room
            </Button>
          </div>

          <div className="flex shrink-0 flex-col gap-3 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-3.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-[10px] border border-success/40 bg-success/15">
                <Ticket className="size-[22px] text-success" />
              </span>
              <h2 className="font-display text-lg font-bold">Join a Game</h2>
            </div>
            {/* Code and button on one row: stacked, the rail overflowed 1280×800
                whenever the Rejoin bar showed. */}
            <form onSubmit={handleJoin} className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                placeholder="ABC123"
                value={joinCode}
                onChange={handleJoinInput}
                className="h-9 min-w-0 font-mono text-center text-lg tracking-[0.2em] uppercase"
                maxLength={6}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Room code"
              />
              <Button
                type="submit"
                variant="outline"
                className="h-9 gap-2"
                disabled={joinCode.length < 6}
              >
                Join
                <ArrowRight className="w-4 h-4" />
              </Button>
              {joinError && <p className="col-span-2 text-[13px] text-destructive">{joinError}</p>}
            </form>
          </div>
        </div>
      </div>

      <CreateRoomDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        card={hostCard ? { kind: 'saved', templateId: hostCard.id } : undefined}
      />
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <HomePageContent />
    </Suspense>
  );
}
