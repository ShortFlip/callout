import type { CardSplit } from '@/lib/library/hosting';

/**
 * A card's game split in words, numbers in mono so they line up down a list:
 * "5 Rocket League · 19 Call of Duty", "24 Items", "Draws 24 From 30 Items".
 * The words themselves come from cardSplit(); this only styles them.
 */
export function CardSplitWords({ split }: { split: CardSplit }) {
  if (split.draws !== null) {
    return (
      <>
        Draws <span className="tabular-nums">{split.draws}</span> From{' '}
        <span className="tabular-nums">{split.parts[0]?.count ?? 0}</span> Items
      </>
    );
  }
  return (
    <>
      {split.parts.map((part, i) => (
        <span key={`${part.label}-${i}`}>
          {i > 0 && ' · '}
          <span className="tabular-nums">{part.count}</span> {part.label}
        </span>
      ))}
    </>
  );
}
