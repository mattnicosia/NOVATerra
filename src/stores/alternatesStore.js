import { create } from 'zustand';
import { uid, nn } from '@/utils/format';
import { useProjectStore } from '@/stores/projectStore';
import { useUiStore } from '@/stores/uiStore';
import { getLaborMultiplier } from '@/utils/laborTypes';

export const useAlternatesStore = create((set, get) => ({
  alternates: [],
  altExpanded: new Set(),

  setAlternates: (v) => set({ alternates: v }),

  addAlternate: (type) => set(s => ({
    alternates: [...s.alternates, {
      id: uid(), name: "", type: type || "add",
      description: "", items: [], accepted: false,
    }],
  })),

  updateAlternate: (id, field, value) => set(s => ({
    alternates: s.alternates.map(a => a.id === id ? { ...a, [field]: value } : a),
  })),

  removeAlternate: (id) => set(s => ({
    alternates: s.alternates.filter(a => a.id !== id),
  })),

  addAlternateItem: (altId) => set(s => ({
    alternates: s.alternates.map(a => a.id === altId
      ? { ...a, items: [...a.items, { id: uid(), description: "", quantity: 1, unit: "EA", material: 0, labor: 0, equipment: 0, subcontractor: 0 }] }
      : a),
  })),

  updateAlternateItem: (altId, itemId, field, value) => set(s => ({
    alternates: s.alternates.map(a => a.id === altId
      ? { ...a, items: a.items.map(it => it.id === itemId ? { ...it, [field]: value } : it) }
      : a),
  })),

  removeAlternateItem: (altId, itemId) => set(s => ({
    alternates: s.alternates.map(a => a.id === altId
      ? { ...a, items: a.items.filter(it => it.id !== itemId) }
      : a),
  })),

  toggleAltExpanded: (id) => set(s => {
    const next = new Set(s.altExpanded);
    next.has(id) ? next.delete(id) : next.add(id);
    return { altExpanded: next };
  }),

  getAltTotal: (alt) => {
    const laborTypeKey = useProjectStore.getState().project.laborType;
    const laborTypes = useUiStore.getState().appSettings.laborTypes;
    const mult = getLaborMultiplier(laborTypeKey, laborTypes);
    return (alt.items || []).reduce((sum, it) => {
      return sum + nn(it.quantity) * (nn(it.material) + nn(it.labor) * mult + nn(it.equipment) + nn(it.subcontractor));
    }, 0);
  },
}));
