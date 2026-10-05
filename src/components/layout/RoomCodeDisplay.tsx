'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Link as LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyLink } from '@/lib/utils/copy-link';
import { Button } from '@/components/ui/button';
import { SECTION_LABEL } from '@/lib/label';

interface RoomCodeDisplayProps {
  code: string;
  className?: string;
}

/**
 * The lobby's invite: the room code, big enough to read aloud over a call,
 * and Copy Invite Link as the one loud button under it.
 *
 * The link is the call to action rather than the code because a pasted link
 * is how friends actually join — it lands them on the room with no typing
 * (DESIGN.md, Opening state and the Empty-lobby row). The code stays at
 * display size for the friend who would rather hear it; it is select-all, so
 * it can still be copied by hand.
 */
export function RoomCodeDisplay({ code, className }: RoomCodeDisplayProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A click just before leaving the lobby must not set state on an unmounted
  // component once the Copied tick expires.
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  async function handleCopyLink() {
    // Guarded: clipboard access can be denied, and the fallback toast shows
    // the link itself so it can still be selected by hand.
    const ok = await copyLink();
    if (!ok) return;
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <div className="flex flex-col items-center gap-2">
        <p className={SECTION_LABEL}>
          Room Code
        </p>
        <span
          // Same violet halo as the game header's code (.code-glow), so the
          // code reads as the same object in both places.
          className="code-glow font-mono text-5xl font-bold tracking-[0.2em] text-foreground select-all"
        >
          {code}
        </span>
      </div>

      <Button
        onClick={handleCopyLink}
        className={cn(
          // 6px radius per the button family in DESIGN.md; the violet glow
          // is what marks this as the lobby's main action.
          'h-11 px-6 gap-2 rounded-md text-[15px] font-semibold',
          'shadow-[0_0_24px_-4px_color-mix(in_oklab,var(--primary)_70%,transparent)]',
          'hover:bg-primary/90 hover:shadow-[0_0_30px_-2px_color-mix(in_oklab,var(--primary)_80%,transparent)]',
          'duration-150',
        )}
      >
        {copied
          ? <Check className="size-[18px]" />
          : <LinkIcon className="size-[18px]" />}
        {copied ? 'Link Copied' : 'Copy Invite Link'}
      </Button>

      <p className="text-[13px] text-muted-foreground">
        Paste the link in Discord, or read the code out.
      </p>
    </div>
  );
}
