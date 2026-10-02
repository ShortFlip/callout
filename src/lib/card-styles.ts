import type { CardStyles } from '@/types/card';

export interface CardStylePreset {
  id: string;
  label: string;
  styles: CardStyles;
}

/**
 * Built-in card style presets.
 * The 'default' preset uses empty overrides — BingoSquare falls back to
 * CSS vars so it inherits whatever theme the player has active.
 *
 * Four on purpose (2026-10-02): he cut Ocean, Sunset, Forest and Retro.
 * Cards saved in them still draw in-game (card_templates.styles holds the
 * full colours); opening one in the library falls back to Default.
 */
export const CARD_PRESETS: CardStylePreset[] = [
  {
    id: 'default',
    label: 'Default',
    styles: { preset: 'default' },
  },
  {
    id: 'classic',
    label: 'Classic',
    styles: {
      preset: 'classic',
      cardBg: '#e8e8e0',
      squareBg: '#ffffff',
      squareBgMarked: '#bbf7d0',
      squareBgFree: '#86efac',
      gridLine: '#d1d5db',
      textColor: '#111827',
    },
  },
  {
    id: 'neon',
    label: 'Neon',
    styles: {
      preset: 'neon',
      cardBg: '#05050f',
      squareBg: '#0d0d20',
      squareBgMarked: '#7c3aed',
      squareBgFree: '#10b981',
      gridLine: '#1e1e3a',
      textColor: '#e0e0ff',
    },
  },
  {
    id: 'slate',
    label: 'Slate',
    styles: {
      preset: 'slate',
      cardBg: '#0f172a',
      squareBg: '#1e293b',
      squareBgMarked: '#475569',
      squareBgFree: '#334155',
      gridLine: '#334155',
      textColor: '#f1f5f9',
    },
  },
];
