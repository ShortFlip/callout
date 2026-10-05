'use client';

import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import type { PresencePlayer } from '@/hooks/useRealtimeRoom';
import { SECTION_LABEL } from '@/lib/label';

interface PlayerListProps {
  players: PresencePlayer[];
  hostId: string;
  className?: string;
}

export function PlayerList({ players, hostId, className }: PlayerListProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <p className={SECTION_LABEL}>
        Players ({players.length})
      </p>
      <ul className="space-y-1.5">
        {players.map((p) => (
          <li
            key={p.playerId}
            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-background/40"
          >
            <PlayerAvatar
              playerId={p.playerId}
              displayName={p.displayName}
              avatarUrl={p.avatarUrl}
              size="sm"
            />
            <span className="text-sm font-medium flex-1 truncate">{p.displayName}</span>
            {p.playerId === hostId && (
              <Crown className="w-3.5 h-3.5 text-accent shrink-0" aria-label="Host" />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
