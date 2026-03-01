import { create } from 'zustand';

export const useDashboardStore = create((set) => ({
  activeProjectId: '1',
  setActiveProjectId: (id) => set({ activeProjectId: id }),
  orbState: 'idle', // 'idle' | 'thinking' | 'responding'
  setOrbState: (s) => set({ orbState: s }),
}));
