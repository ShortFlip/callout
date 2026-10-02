import { describe, it, expect } from 'vitest';
import { Bomb, Crosshair, Flame, Skull } from 'lucide-react';
import { cardLegend, squareGame } from '../legend';
import { GAME_COLORS } from '@/lib/game-colors';
import type { SquareItem } from '@/types/card';
import type { LegendEntry } from '@/types/library';

const RL = 'game-rl';
const COD = 'game-cod';

const LEGEND: LegendEntry[] = [
  { gameTagId: RL, name: 'Rocket League', color: 'sky', icon: 'flame' },
  { gameTagId: COD, name: 'Call of Duty', color: 'orange', icon: 'crosshair' },
];

/** A legend row as a stale or hand-edited JSON column might hold it. */
function rawLegend(...entries: unknown[]): LegendEntry[] {
  return entries as LegendEntry[];
}

describe('squareGame', () => {
  it('resolves a square to its game colour (CSS, not the key), icon and name', () => {
    expect(squareGame(LEGEND, RL)).toEqual({
      gameTagId: RL,
      name: 'Rocket League',
      color: GAME_COLORS.sky,
      icon: Flame,
      logoUrl: null,
    });
    expect(squareGame(LEGEND, COD)?.icon).toBe(Crosshair);
  });

  it('carries an uploaded logo, and draws the icon for anything but an https URL', () => {
    const logo = 'https://example.supabase.co/storage/v1/object/public/game-logos/rl.png?t=1';
    const withLogo = LEGEND.map((entry) => (entry.gameTagId === RL ? { ...entry, logoUrl: logo } : entry));
    expect(squareGame(withLogo, RL)?.logoUrl).toBe(logo);
    expect(squareGame(withLogo, COD)?.logoUrl).toBeNull();
    const unsafe = LEGEND.map((entry) => ({ ...entry, logoUrl: 'javascript:alert(1)' }));
    expect(squareGame(unsafe, RL)?.logoUrl).toBeNull();
  });

  it('resolves the newer icon keys (skull, bomb) like any other', () => {
    const legend: LegendEntry[] = [
      { gameTagId: 'g1', name: 'Shooter', color: 'rose', icon: 'skull' },
      { gameTagId: 'g2', name: 'Party', color: 'pink', icon: 'bomb' },
    ];
    expect(squareGame(legend, 'g1')?.icon).toBe(Skull);
    expect(squareGame(legend, 'g2')?.icon).toBe(Bomb);
  });

  it('returns null for a game id the legend does not list', () => {
    expect(squareGame(LEGEND, 'game-deleted')).toBeNull();
  });

  it('returns null when the card has no legend, as every legacy card does', () => {
    expect(squareGame(undefined, RL)).toBeNull();
    expect(squareGame(null, RL)).toBeNull();
    expect(squareGame([], RL)).toBeNull();
  });

  it('returns null for a square with no game', () => {
    expect(squareGame(LEGEND, undefined)).toBeNull();
    expect(squareGame(LEGEND, null)).toBeNull();
    expect(squareGame(LEGEND, '')).toBeNull();
  });

  it('never marks the free space, even if it somehow carries a game id', () => {
    expect(squareGame(LEGEND, RL, true)).toBeNull();
  });

  it('returns null for a colour or icon key this build does not know', () => {
    const legend = rawLegend(
      { gameTagId: RL, name: 'Rocket League', color: 'teal', icon: 'flame' },
      { gameTagId: COD, name: 'Call of Duty', color: 'orange', icon: 'rocket' },
    );
    expect(squareGame(legend, RL)).toBeNull();
    expect(squareGame(legend, COD)).toBeNull();
  });

  it('survives a malformed legend column', () => {
    expect(squareGame('sky' as unknown as LegendEntry[], RL)).toBeNull();
    expect(squareGame(rawLegend(null, 7, { gameTagId: RL }), RL)).toBeNull();
    expect(squareGame(rawLegend(null, LEGEND[0]), RL)?.name).toBe('Rocket League');
  });
});

describe('cardLegend', () => {
  const card: SquareItem[] = [
    { text: 'Whiffed open net', gameTagId: RL },
    { text: 'FREE', isFreeSpace: true },
    { text: 'Killcam roast', gameTagId: COD },
    { text: 'Blames lag' },
  ];

  it('lists the games on the card in legend order, not card order', () => {
    const reversed: SquareItem[] = [card[2], card[0]];
    expect(cardLegend(LEGEND, reversed).map((g) => g.name)).toEqual(['Rocket League', 'Call of Duty']);
  });

  it('leaves out a legend game with no square on this board', () => {
    const onlyCod = card.filter((item) => item.gameTagId !== RL);
    expect(cardLegend(LEGEND, onlyCod).map((g) => g.gameTagId)).toEqual([COD]);
  });

  it('ignores a game id on the free space', () => {
    const items: SquareItem[] = [{ text: 'FREE', isFreeSpace: true, gameTagId: RL }, card[2]];
    expect(cardLegend(LEGEND, items).map((g) => g.gameTagId)).toEqual([COD]);
  });

  it('is empty with no legend, so a legacy card draws no legend row', () => {
    expect(cardLegend(undefined, card)).toEqual([]);
    expect(cardLegend(null, card)).toEqual([]);
  });

  it('skips unknown keys and lists a repeated legend entry once', () => {
    const legend = rawLegend(
      { gameTagId: RL, name: 'Rocket League', color: 'teal', icon: 'flame' },
      LEGEND[1],
      LEGEND[1],
    );
    expect(cardLegend(legend, card).map((g) => g.gameTagId)).toEqual([COD]);
  });
});
