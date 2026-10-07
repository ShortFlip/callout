export type ThemeId = 'midnight' | 'obsidian' | 'forest' | 'ocean' | 'crimson' | 'latte';

export interface Theme {
  id: ThemeId;
  label: string;
  bg: string;   // preview swatch color
  accent: string;
  dark: boolean;
}

export const THEMES: Theme[] = [
  { id: 'midnight', label: 'Midnight',  bg: '#21213a', accent: '#7c3aed', dark: true  },
  { id: 'obsidian', label: 'Obsidian',  bg: '#0f0f14', accent: '#7c3aed', dark: true  },
  { id: 'forest',   label: 'Forest',    bg: '#0f1f16', accent: '#10b981', dark: true  },
  { id: 'ocean',    label: 'Ocean',     bg: '#0f1a2a', accent: '#38bdf8', dark: true  },
  { id: 'crimson',  label: 'Crimson',   bg: '#1f0f12', accent: '#f43f5e', dark: true  },
  { id: 'latte',    label: 'Latte',     bg: '#f5f0e8', accent: '#7c3aed', dark: false },
];

const STORAGE_KEY = 'callout:theme';

export function getSavedTheme(): ThemeId {
  if (typeof window === 'undefined') return 'midnight';
  return (localStorage.getItem(STORAGE_KEY) as ThemeId) ?? 'midnight';
}

export function applyTheme(id: ThemeId) {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  const html = document.documentElement;

  // Toggle dark class based on theme
  html.classList.toggle('dark', theme.dark);

  // Remove all theme data attrs then set the new one
  delete html.dataset.theme;
  if (id !== 'midnight') {
    html.dataset.theme = id;
  }

  localStorage.setItem(STORAGE_KEY, id);
}
