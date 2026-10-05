'use client';

import { useMemo } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { checkWin, freeIndexOf } from '@/lib/game/win-detection';

/**
 * Derives frequently-needed computed values from the raw game store.
 * Memoized so components don't re-render unless the underlying data changes.
 */
export function useGameState() {
  const {
    callList, calledCount, myCard, myMarks,
    boardSize, freeSpace, winPatterns, gameMode,
  } = useGameStore();

  // Set of original item indices that have been called so far
  const calledOriginalIndices = useMemo(
    () => new Set(callList.slice(0, calledCount)),
    [callList, calledCount],
  );

  // Set of grid positions the player has marked (for BingoBoard)
  const marksSet = useMemo(() => new Set(myMarks), [myMarks]);

  // Set of grid positions whose items have been called (highlights unmark squares)
  const calledGridIndices = useMemo(() => {
    const called = new Set<number>();
    myCard.forEach((item, gridIndex) => {
      if (item.isFreeSpace) {
        called.add(gridIndex); // free space is always "callable"
      } else if (item.originalIndex !== undefined && calledOriginalIndices.has(item.originalIndex)) {
        called.add(gridIndex);
      }
    });
    return called;
  }, [myCard, calledOriginalIndices]);

  // Honor mode: any non-free-space square is markable — players self-serve.
  // Traditional mode: only squares whose item the host has called.
  // (Unmarking is covered too — a marked square was necessarily called.)
  function canMark(gridIndex: number): boolean {
    const item = myCard[gridIndex];
    if (!item) return false;
    if (item.isFreeSpace) return false; // free space is pre-marked, not user-markable
    if (gameMode === 'traditional') return calledGridIndices.has(gridIndex);
    return true;
  }

  // Client-side win check — used to show the BINGO! button
  const currentWin = useMemo(
    // FREE's position comes from the card: small boards place it at random.
    () => checkWin(marksSet, boardSize, winPatterns, freeSpace ? freeIndexOf(myCard) : null),
    [marksSet, boardSize, winPatterns, freeSpace, myCard],
  );

  return {
    calledGridIndices,
    canMark,
    currentWin,
  };
}
