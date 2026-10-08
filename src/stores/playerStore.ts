import { create } from 'zustand';
import type { Player } from '@/types/player';

interface PlayerState {
  player: Player | null;
  // True during the async identity resolution on first load
  isLoading: boolean;
  // The Discord name this session is signed in as; null while anonymous.
  linkedAs: string | null;
  setPlayer: (player: Player) => void;
  setLinkedAs: (name: string | null) => void;
  setLoading: (loading: boolean) => void;
  // Merge partial updates into the current player (e.g. after profile save)
  updatePlayer: (updates: Partial<Player>) => void;
  clearPlayer: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  player: null,
  isLoading: true,
  linkedAs: null,

  setPlayer: (player) => set({ player, isLoading: false }),
  setLinkedAs: (linkedAs) => set({ linkedAs }),
  setLoading: (isLoading) => set({ isLoading }),

  updatePlayer: (updates) => {
    const { player } = get();
    if (player) set({ player: { ...player, ...updates } });
  },

  // Used on sign-out — resets to unauthenticated state
  clearPlayer: () => set({ player: null, isLoading: false }),
}));
