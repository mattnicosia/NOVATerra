import { create } from 'zustand';
import { uid, nn } from '@/utils/format';
import { autoDirective } from '@/utils/directives';
import { autoTradeFromCode } from '@/constants/tradeGroupings';
import { useProjectStore } from '@/stores/projectStore';
import { useUiStore } from '@/stores/uiStore';
import { getLaborMultiplier } from '@/utils/laborTypes';
import { resolveLocationFactors, METRO_AREAS } from '@/constants/locationFactors';

// Default markup order — each entry can independently compound on running subtotal
// `active` controls whether markup is applied in calculation (inactive = skipped)
export const DEFAULT_MARKUP_ORDER = [
  { key: "contingency",       label: "Contingency",         compound: false, active: false },
  { key: "generalConditions", label: "General Conditions",  compound: false, active: false },
  { key: "fee",               label: "Fee",                 compound: false, active: false },
  { key: "overheadAndProfit", label: "Overhead & Profit",   compound: false, active: false },
  { key: "overhead",          label: "Overhead",            compound: false, active: false },
  { key: "profit",            label: "Profit",              compound: false, active: false },
  { key: "insurance",         label: "Insurance",           compound: false, active: false },
];

export const useItemsStore = create((set, get) => ({
  items: [],
  markup: { overhead: 10, profit: 10, overheadAndProfit: 20, contingency: 5, generalConditions: 0, insurance: 2, fee: 0, tax: 0, bond: 0 },
  markupOrder: [...DEFAULT_MARKUP_ORDER],
  customMarkups: [],
  changeOrders: [],

  setItems: (v) => set({ items: v }),
  setMarkup: (v) => set({ markup: v }),
  setMarkupOrder: (v) => set({ markupOrder: v }),
  setCustomMarkups: (v) => set({ customMarkups: v }),
  setChangeOrders: (v) => set({ changeOrders: v }),

  addElement: (division, preset) => set(s => ({
    items: [...s.items, {
      id: uid(), code: preset?.code || "", description: preset?.name || "",
      division: division || "", quantity: 1, unit: preset?.unit || "EA",
      material: preset?.material || 0, labor: preset?.labor || 0,
      equipment: preset?.equipment || 0, subcontractor: preset?.subcontractor || 0,
      trade: preset?.trade || autoTradeFromCode(preset?.code) || "",
      directive: "", notes: "", drawingRef: "",
      variables: [], formula: "", specSection: "", specText: "",
      specVariantLabel: "", allowanceOf: "", allowanceSubMarkup: "",
      locationLocked: false,
      subItems: preset?.subItems || [],
    }],
  })),

  updateItem: (id, field, value) => set(s => ({
    items: s.items.map(it => {
      if (it.id !== id) return it;
      const updated = { ...it, [field]: value };
      // If user manually sets directive, mark as override; if set to "" reset to auto
      if (field === "directive") {
        updated.directiveOverride = !!value;
      }
      // Only auto-calculate directive if not manually overridden
      if (["material", "labor", "equipment", "subcontractor"].includes(field) && !updated.directiveOverride) {
        updated.directive = autoDirective(updated.material, updated.labor, updated.equipment, updated.subcontractor);
      }
      return updated;
    }),
  })),

  removeItem: (id) => set(s => ({ items: s.items.filter(it => it.id !== id) })),

  duplicateItem: (id) => set(s => {
    const idx = s.items.findIndex(it => it.id === id);
    if (idx === -1) return s;
    const copy = { ...s.items[idx], id: uid(), subItems: [...(s.items[idx].subItems || [])] };
    const next = [...s.items];
    next.splice(idx + 1, 0, copy);
    return { items: next };
  }),

  // Sub-item CRUD — optional cost breakdown within a scope item
  addSubItem: (itemId) => set(s => ({
    items: s.items.map(it => it.id !== itemId ? it : {
      ...it,
      subItems: [...(it.subItems || []), { id: uid(), desc: "", unit: "EA", m: 0, l: 0, e: 0, factor: 1 }],
    }),
  })),

  updateSubItem: (itemId, subItemId, field, value) => set(s => ({
    items: s.items.map(it => it.id !== itemId ? it : {
      ...it,
      subItems: (it.subItems || []).map(si => si.id === subItemId ? { ...si, [field]: value } : si),
    }),
  })),

  removeSubItem: (itemId, subItemId) => set(s => ({
    items: s.items.map(it => it.id !== itemId ? it : {
      ...it,
      subItems: (it.subItems || []).filter(si => si.id !== subItemId),
    }),
  })),

  updateMarkup: (field, value) => set(s => ({
    markup: { ...s.markup, [field]: value },
  })),

  addCustomMarkup: () => set(s => ({
    customMarkups: [...s.customMarkups, { id: uid(), label: "", value: 0, type: "pct" }],
  })),

  updateCustomMarkup: (id, field, value) => set(s => ({
    customMarkups: s.customMarkups.map(m => m.id === id ? { ...m, [field]: value } : m),
  })),

  removeCustomMarkup: (id) => set(s => ({
    customMarkups: s.customMarkups.filter(m => m.id !== id),
  })),

  _getLaborMult: () => {
    const laborTypeKey = useProjectStore.getState().project.laborType;
    const laborTypes = useUiStore.getState().appSettings.laborTypes;
    return getLaborMultiplier(laborTypeKey, laborTypes);
  },

  _getLocationFactors: () => {
    const project = useProjectStore.getState().project;
    if (project.locationMetroId) {
      const metro = METRO_AREAS.find(m => m.id === project.locationMetroId);
      if (metro) return { mat: metro.mat, lab: metro.lab, equip: metro.equip };
    }
    const resolved = resolveLocationFactors(project.zipCode);
    return { mat: resolved.mat, lab: resolved.lab, equip: resolved.equip };
  },

  getItemTotal: (item) => {
    const q = nn(item.quantity);
    const mult = get()._getLaborMult();
    const loc = item.locationLocked ? { mat: 1, lab: 1, equip: 1 } : get()._getLocationFactors();
    return q * (nn(item.material) * loc.mat + nn(item.labor) * mult * loc.lab + nn(item.equipment) * loc.equip + nn(item.subcontractor));
  },

  getTotals: () => {
    const { items, markup, markupOrder, customMarkups } = get();
    const mult = get()._getLaborMult();
    const globalLoc = get()._getLocationFactors();
    let material = 0, labor = 0, equipment = 0, sub = 0;
    items.forEach(it => {
      const q = nn(it.quantity);
      const loc = it.locationLocked ? { mat: 1, lab: 1, equip: 1 } : globalLoc;
      material += q * nn(it.material) * loc.mat;
      labor += q * nn(it.labor) * loc.lab;
      equipment += q * nn(it.equipment) * loc.equip;
      sub += q * nn(it.subcontractor);
    });
    // Apply labor multiplier
    labor = labor * mult;
    const direct = material + labor + equipment + sub;

    // Ordered markup calculation — each markup either compounds on running subtotal or uses base direct
    // Skip inactive markups (active defaults to true for backward compatibility)
    let running = direct;
    const order = markupOrder || DEFAULT_MARKUP_ORDER;
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
    customMarkups.forEach(cm => {
      if (cm.type === "pct") grand *= (1 + nn(cm.value) / 100);
      else grand += nn(cm.value);
    });

    return { material, labor, equipment, sub, direct, grand };
  },
}));
