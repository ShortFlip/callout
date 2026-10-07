'use client';

import { SquaresMark } from '@/components/layout/SquaresMark';
import { BoardSkeleton } from '@/components/board/BoardSkeleton';
import { RetryButton } from '@/components/layout/LoadError';
import {
  HEADER_H, NAME_ROW_H, PANEL_GAP, PANEL_PAD_X, PANEL_PAD_Y, heroGridSize,
} from '@/lib/hero-fit';

interface GameSkeletonProps {
  /** Known from the server-rendered room row, so it can show straight away. */
  joinCode: string;
  /** Squares per side; 5 until the template has been read. */
  boardSize?: number;
  /**
   * Set when the round could not be restored. The outline stays (the board
   * will land there) and a card over it says so, with Try Again re-running
   * the restore, instead of the skeleton pulsing forever.
   */
  onRetry?: () => Promise<void>;
}

/**
 * The game screen before the card is ready — a refresh mid-round, or the
 * moment between game_started and the card being generated.
 *
 * It repeats GameView's frame (header height, body padding, hero column as a
 * size container, 300px rail) and sizes its grid with the same heroGridSize(),
 * so when the card lands the squares fill in where their outlines already
 * were instead of the layout jumping. The room code is real, not a
 * placeholder: it is already known and it is the thing people read out.
 */
export function GameSkeleton({ joinCode, boardSize = 5, onRetry }: GameSkeletonProps) {
  const gridW = heroGridSize(false);

  return (
    <div className="h-screen overflow-hidden flex flex-col" role="status" aria-label="Loading your board">
      <header
        className="glass-header shrink-0 flex items-center px-5 pr-[68px] relative z-20"
        style={{ height: HEADER_H }}
      >
        <div className="flex items-center gap-3">
          <SquaresMark size={22} />
          <span className="font-display text-[15px] font-extrabold">Squares</span>
          <span className="w-px h-[22px] bg-foreground/12" />
          <span
            className="code-glow font-mono text-[26px] font-bold tracking-[0.14em]"
          >
            {joinCode}
          </span>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex gap-5 px-[22px] py-5">
        <div className="hero-fit flex-1 min-w-0 flex justify-center">
          <section
            className="glass w-fit flex flex-col items-center rounded-2xl overflow-hidden"
            style={{ padding: `${PANEL_PAD_Y}px ${PANEL_PAD_X}px`, gap: PANEL_GAP }}
          >
            {/* Name row stand-in: avatar and name, at the real row's height. */}
            <div className="flex items-center gap-2.5" style={{ width: gridW, height: NAME_ROW_H }}>
              <span className="sk-bar w-[30px] h-[30px] rounded-full shrink-0" />
              <span className="sk-bar h-3.5 w-28 rounded-full" />
            </div>
            <div className="relative">
              <BoardSkeleton boardSize={boardSize} style={{ width: gridW }} />
              {onRetry && (
                // A solid card, not glass: its text sits over the board's outline.
                <div className="absolute inset-0 grid place-items-center">
                  <div
                    role="alert"
                    className="flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-card px-5 py-4 text-center shadow-[0_18px_40px_-20px_rgb(0_0_0/0.9)]"
                  >
                    <p className="font-display text-base font-bold">Can&apos;t Load This Round</p>
                    <p className="text-[13px] text-muted-foreground">Your marks are saved.</p>
                    <RetryButton variant="default" onRetry={onRetry} className="text-[13px]" />
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* The rail's width is held so the hero column — and so the grid — is
            already the size it will be once the rail fills in. */}
        <aside className="w-[300px] shrink-0" aria-hidden />
      </div>

      <span className="sr-only">Loading your board…</span>
    </div>
  );
}
