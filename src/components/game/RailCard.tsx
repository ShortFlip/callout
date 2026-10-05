'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { MiniBoard } from '@/components/board/MiniBoard';
import { PILL } from '@/lib/pill';
import { bestLine, bestLineLabel, freeIndexOf } from '@/lib/game/win-detection';
import type { SquareItem } from '@/types/card';

interface RailCardProps {
  displayName: string;
  card: SquareItem[];
  marks: number[];
  boardSize: number;
  freeSpace: boolean;
  /** False until this player's game_players row has been read. */
  synced: boolean;
  /** A confirmed winner this round — gets the gold treatment. */
  winner?: boolean;
  /** 1 or 2, drawn as the `1ST` / `2ND` pill beside the score. */
  finishPosition?: number | null;
  /** The pattern the win was claimed with; the fallback when the marks that
   *  completed the line have not reached us yet. */
  winPattern?: string;
  /** Miniature content-box size. Shrinks to 90 while the win banner is up. */
  miniSize?: number;
}

const POSITION_LABELS: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd' };

/**
 * One other player in the rail: their whole board, their score, and how close
 * they are — all readable without clicking anything.
 *
 * The name has the first line to itself. Beside the 108px miniature the column
 * is 134px wide (152px under the win banner), and a real name at 17px needs
 * most of it — "Asian Baby Boi" is 116px — so the avatar circle that used to
 * sit before it (34px with its gap) truncated names like that even before any
 * pill. The placing pill rides on the score line instead, where it has room
 * and where a placing belongs anyway: next to the number it was won with.
 */
export function RailCard({
  displayName,
  card,
  marks,
  boardSize,
  freeSpace,
  synced,
  winner,
  finishPosition,
  winPattern,
  miniSize,
}: RailCardProps) {
  const total = boardSize * boardSize;

  // An unsynced board gets no derived state at all — not even a free space.
  // Drawing a line or a lit center on a board we have not read would be
  // inventing information about someone else's game.
  const line = useMemo(
    // FREE's index comes from this player's own card; on 3×3/4×4 it differs per player.
    () => (synced ? bestLine(new Set(marks), boardSize, freeSpace ? freeIndexOf(card) : null) : null),
    [synced, marks, boardSize, freeSpace, card],
  );

  // A winner's status line states the fact, not the distance.
  const label = bestLineLabel(line, winner ? { pattern: winPattern ?? 'row' } : undefined);
  // "One away" is the only state worth changing color for — it is the moment
  // you might actually want to look up from the game.
  const oneAway = line !== null && line.remaining === 1;
  const percent = total > 0 ? Math.min(100, (marks.length / total) * 100) : 0;

  return (
    <div
      className={cn('glass rounded-xl p-3 flex gap-3')}
      style={
        winner
          ? {
              border: '1px solid color-mix(in oklab, var(--gold) 70%, transparent)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.12), 0 0 26px color-mix(in oklab, var(--gold) 28%, transparent)',
            }
          : undefined
      }
    >
      <MiniBoard
        card={card}
        // Nothing is drawn for a board we have not read — no marks, no free
        // space, no line. Dim and empty is the honest picture.
        marks={synced ? marks : []}
        boardSize={boardSize}
        freeSpace={synced && freeSpace}
        line={line?.cells}
        winner={winner}
        size={miniSize}
        // An unread board is dimmed rather than drawn as an empty one — an
        // honest "we don't know yet" instead of a false 0/25.
        className={cn(!synced && 'opacity-45')}
      />

      <div className="flex flex-col justify-center gap-1.5 min-w-0 flex-1">
        {/* truncate stays as the backstop for a name longer than the column. */}
        <span className="font-display text-[17px] font-bold truncate">{displayName}</span>

        {synced ? (
          <>
            <div className="flex items-center gap-2">
              <span className="tabular-nums text-[13px] font-bold">
                {marks.length} / {total}
              </span>
              {winner && (
                <span
                  className={cn(PILL, 'shrink-0 text-background')}
                  style={{ backgroundColor: 'var(--gold)' }}
                >
                  {POSITION_LABELS[finishPosition ?? 1] ?? '1st'}
                </span>
              )}
            </div>
            <div className="h-1 rounded-full bg-white/8 overflow-hidden">
              <div
                className={cn(
                  // The fill grows (width) and turns emerald or gold (colour, glow).
                  // 300ms, as before: it is the rail's one panel-scale motion.
                  'h-full rounded-full transition-[width,background-color,box-shadow] duration-300',
                  winner
                    ? ''
                    : oneAway
                      ? 'bg-success shadow-[0_0_8px_color-mix(in_oklab,var(--success)_70%,transparent)]'
                      : 'bg-accent shadow-[0_0_8px_color-mix(in_oklab,var(--accent)_70%,transparent)]',
                )}
                style={{
                  width: `${percent}%`,
                  ...(winner
                    ? {
                        backgroundColor: 'var(--gold)',
                        boxShadow: '0 0 8px color-mix(in oklab, var(--gold) 70%, transparent)',
                      }
                    : {}),
                }}
              />
            </div>
            {/* 13px can take two lines ("Column 5 — three away" is ~150px in a
                134px column); balance splits it evenly instead of orphaning a word. */}
            <p
              className={cn(
                'text-[13px] font-medium text-balance',
                winner || oneAway ? 'text-success' : 'text-muted-foreground',
              )}
            >
              {label}
            </p>
          </>
        ) : (
          <>
            <span className={cn(PILL, 'self-start bg-accent/15 text-accent border border-accent/30')}>
              Syncing
            </span>
            <p className="text-[13px] font-medium text-balance text-muted-foreground">
              Waiting for their board
            </p>
          </>
        )}
      </div>
    </div>
  );
}
