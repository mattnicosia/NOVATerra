import { create } from 'zustand';

export const useCommandPaletteStore = create((set) => ({
  open: false,
  query: '',
  recentIds: JSON.parse(localStorage.getItem('nova_cmd_recents') || '[]'),

  toggle: () => set(s => ({ open: !s.open, query: '' })),
  setOpen: (v) => set({ open: v, query: '' }),
  close: () => set({ open: false, query: '' }),
  setQuery: (v) => set({ query: v }),

  addRecent: (id) => set(s => {
    const next = [id, ...s.recentIds.filter(r => r !== id)].slice(0, 8);
    localStorage.setItem('nova_cmd_recents', JSON.stringify(next));
    return { recentIds: next };
  }),
}));
