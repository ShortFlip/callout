import { describe, it, expect } from 'vitest';
import { CARD_PRESETS, withStylePreset } from '../card-styles';
import { buildGameSetup } from '../game/game-setup';
import type { CardStyles } from '@/types/card';
import type { LegendEntry } from '@/types/library';

const LEGEND: LegendEntry[] = [
  { gameTagId: 'rl', name: 'Rocket League', color: 'sky', icon: 'car', logoUrl: 'https://x.supabase.co/rl.png' },
];
const classic = CARD_PRESETS.find((p) => p.id === 'classic')!.styles;
const CLASSIC_CARD: CardStyles = { ...classic, legend: LEGEND };

describe('card style presets', () => {
  it('keeps exactly the four he picked', () => {
    expect(CARD_PRESETS.map((p) => p.id)).toEqual(['default', 'classic', 'neon', 'slate']);
  });
});

describe('withStylePreset', () => {
  it('redraws a Classic card in Slate and keeps its legend and logos', () => {
    const slate = withStylePreset(CLASSIC_CARD, 'slate');
    expect(slate.preset).toBe('slate');
    expect(slate.squareBg).not.toBe(classic.squareBg);
    expect(slate.legend).toEqual(LEGEND);
  });

  it('switching to Default drops every colour, so the board follows the app theme', () => {
    expect(withStylePreset(CLASSIC_CARD, 'default')).toEqual({ preset: 'default', legend: LEGEND });
  });

  it('leaves the card as saved when there is no pick, or a removed one', () => {
    expect(withStylePreset(CLASSIC_CARD, undefined)).toBe(CLASSIC_CARD);
    expect(withStylePreset(CLASSIC_CARD, 'retro')).toBe(CLASSIC_CARD);
  });

  it('buildGameSetup applies the room pick, so New Round and a rejoin keep it', () => {
    const template = { items: [{ text: 'A' }], board_size: 3, free_space: true, shuffle_mode: 'full', styles: CLASSIC_CARD };
    expect(buildGameSetup(template, { stylePreset: 'neon' }, 'seed').cardStyles.preset).toBe('neon');
    expect(buildGameSetup(template, {}, 'seed').cardStyles).toEqual(CLASSIC_CARD);
  });
});
