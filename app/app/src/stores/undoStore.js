import { create } from 'zustand';

const MAX_HISTORY = 50;

export const useUndoStore = create((set, get) => ({
  past: [],
  future: [],

  // Push an undoable action
  push: (entry) => set(s => ({
    past: [...s.past.slice(-(MAX_HISTORY - 1)), entry],
    future: [], // clear redo stack on new action
  })),

  // Undo last action
  undo: () => {
    const { past, future } = get();
    if (past.length === 0) return false;
    const entry = past[past.length - 1];
    entry.undo();
    set({
      past: past.slice(0, -1),
      future: [...future, entry],
    });
    return entry.action;
  },

  // Redo last undone action
  redo: () => {
    const { past, future } = get();
    if (future.length === 0) return false;
    const entry = future[future.length - 1];
    entry.redo();
    set({
      past: [...past, entry],
      future: future.slice(0, -1),
    });
    return entry.action;
  },

  // Clear all history (e.g. on estimate switch)
  clear: () => set({ past: [], future: [] }),

  // Convenience getters
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));
