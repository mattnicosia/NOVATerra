import { create } from 'zustand';
import { uid, nn } from '@/utils/format';
import { useProjectStore } from '@/stores/projectStore';
import { useUiStore } from '@/stores/uiStore';
import { useItemsStore, DEFAULT_MARKUP_ORDER } from '@/stores/itemsStore';
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
      ? { ...a, items: [...a.items, { id: uid(), description: "", quantity: 1, unit: "EA", material: 0, labor: 0, equipment: 0, subcontractor: 0, linkedItemId: null }] }
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

  // Link an alternate item to a base estimate item (for item swap on accept)
  linkAlternateItem: (altId, altItemId, baseItemId) => set(s => ({
    alternates: s.alternates.map(a => a.id === altId
      ? { ...a, items: a.items.map(it => it.id === altItemId ? { ...it, linkedItemId: baseItemId || null } : it) }
      : a),
  })),

  toggleAltExpanded: (id) => set(s => {
    const next = new Set(s.altExpanded);
    next.has(id) ? next.delete(id) : next.add(id);
    return { altExpanded: next };
  }),

  // Direct cost of an alternate (no markup)
  getAltTotal: (alt) => {
    const laborTypeKey = useProjectStore.getState().project.laborType;
    const laborTypes = useUiStore.getState().appSettings.laborTypes;
    const mult = getLaborMultiplier(laborTypeKey, laborTypes);
    return (alt.items || []).reduce((sum, it) => {
      return sum + nn(it.quantity) * (nn(it.material) + nn(it.labor) * mult + nn(it.equipment) + nn(it.subcontractor));
    }, 0);
  },

  // Full cost of an alternate including the same markup chain as the base bid
  getAltTotalWithMarkup: (alt) => {
    const direct = get().getAltTotal(alt);
    if (direct === 0) return { direct: 0, grand: 0, markupAmount: 0 };

    const { markup, markupOrder, customMarkups } = useItemsStore.getState();
    const order = markupOrder || DEFAULT_MARKUP_ORDER;

    // Apply ordered markup chain (same logic as itemsStore.getTotals)
    let running = direct;
    order.forEach(mo => {
      if (mo.active === false) return;
      const pct = nn(markup[mo.key]);
      if (pct === 0) return;
      const base = mo.compound ? running : direct;
      running += base * pct / 100;
    });

    let grand = running;

    // Tax and bond on post-markup
    grand *= (1 + nn(markup.tax) / 100);
    grand *= (1 + nn(markup.bond) / 100);

    // Custom markups
    (customMarkups || []).forEach(cm => {
      if (cm.type === "pct") grand *= (1 + nn(cm.value) / 100);
      else grand += nn(cm.value);
    });

    return { direct, grand, markupAmount: grand - direct };
  },
}));
