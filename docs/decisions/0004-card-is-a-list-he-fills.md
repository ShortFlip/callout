# 0004 — The card is a list he fills

- **Date:** 2026-10-01
- **Symptom:** "The most confusing thing ever." The card builder was a random
  deal with holds: + on the left pinned an item and quietly evicted a random
  square, every size, mix or library change re-randomised the unpinned
  squares, and a square could only be swapped, never emptied. The #36 pin
  flash explained the deal better but did not fix the mismatch: he thinks in
  hand-picked lists, and the UI was built around a deal.
- **Measurement:** Live gate `.playwright-mcp/card-v2-gate.cjs`, 9/9 on the dev
  server with his real list (27 items, two games): new card empty, Add three,
  Remove from the left, ✕ on the card, Fill menu preview, Fill keeps the
  hand-picked square first with no repeats, left matches card (24 Added),
  4×4 cuts 9 from the bottom with a toast, Clear Card. Unit tests 237 → 230
  (reconcile and swap tests gone, seven fill tests added).
- **Rule:**
  1. A new card starts empty. `draft.set` is the squares in order and may be
     shorter than the slots; the gap renders as numbered Empty rows.
  2. Add puts one item in the next empty square. It never evicts anything;
     a full card says so. Added / Remove is the same toggle on the left, ✕ on
     the card.
  3. Fill Empty (`fillEmptySquares`) is the only random step. It fills the
     gaps from the mix and never touches a square already there. The mix lives
     in its menu and is read as proportions over the empty squares.
  4. Nothing else moves a square: not the size (shrinking cuts from the
     bottom, with a toast), not the mix, not a library edit (a deleted item's
     square empties; a game change relabels in place).
  5. Pins, Swap and Reshuffle are gone. Save and Host still need a full card.
- **Code sites:**
  - `src/lib/library/card-draft.ts` (`fillEmptySquares`; `reconcileCardSet`
    and `sameSet` removed)
  - `src/lib/game/card-builder.ts` (`swapItem` removed)
  - `src/stores/libraryStore.ts` (`addItem`, `removeItem`, `fillEmpty`,
    `clearCard`; `pinnedIds` and `rebuild` removed)
  - `src/components/library/CardPane.tsx`, `ItemRow.tsx`, `ItemsPane.tsx`,
    `MixControl.tsx`, `src/components/ui/popover.tsx`

## Note

Mockup first (`.design/mockups/card-builder-v2.html`), then built to it. The
one change from the mockup: the Fill menu is 26rem wide so both game names sit
on the split slider untruncated.

A stored draft from before this change still loads: the extra `pinnedIds`
key is ignored, and its squares load as they were.

Legacy pool cards (more items than squares) still draw their slots once on
load, and Fill Empty keeps drawing from that card's own items until Use Whole
Library.
