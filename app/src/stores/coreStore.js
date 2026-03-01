import { create } from 'zustand';

export const useCoreStore = create((set) => ({
  activeTab: "overview",  // "overview" | "proposals" | "costdata" | "sources"
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Overview stats cache (avoid expensive recalculation on every render)
  statsLastComputed: null,
  cachedStats: null,
  setCachedStats: (stats) => set({ cachedStats: stats, statsLastComputed: Date.now() }),
}));
