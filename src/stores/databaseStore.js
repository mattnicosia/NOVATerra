import { create } from 'zustand';
import { uid } from '@/utils/format';
import { SEED_ELEMENTS, SEED_ASSEMBLIES } from '@/constants/seedAssemblies';

export const useDatabaseStore = create((set, get) => ({
  elements: [...SEED_ELEMENTS],
  dbExpandedDivs: new Set(),
  dbSelectedSub: null,
  dbSearch: "",
  createDbItem: null,
  editDbItem: null,
  sendToDbModal: null,
  sendToDbCode: "",
  pickerForItemId: null,
  overwriteModal: null,

  // Assemblies
  assemblies: [...SEED_ASSEMBLIES],
  dbAssemblySearch: "",
  dbActiveTab: "items",

  // Custom trade bundle overrides: [{ key, label, sort, divisions }]
  // When set, these override TRADE_GROUPINGS entirely
  customBundles: null,

  setElements: (v) => set({ elements: v }),
  setDbExpandedDivs: (v) => set({ dbExpandedDivs: v }),
  setDbSelectedSub: (v) => set({ dbSelectedSub: v }),
  setDbSearch: (v) => set({ dbSearch: v }),
  setCreateDbItem: (v) => set({ createDbItem: v }),
  setEditDbItem: (v) => set({ editDbItem: v }),
  setSendToDbModal: (v) => set({ sendToDbModal: v }),
  setSendToDbCode: (v) => set({ sendToDbCode: v }),
  setPickerForItemId: (v) => set({ pickerForItemId: v }),
  setOverwriteModal: (v) => set({ overwriteModal: v }),

  setAssemblies: (v) => set({ assemblies: v }),
  setDbAssemblySearch: (v) => set({ dbAssemblySearch: v }),
  setDbActiveTab: (v) => set({ dbActiveTab: v }),
  setCustomBundles: (v) => set({ customBundles: v }),

  addElement: (el) => set(s => ({
    elements: [...s.elements, { id: uid(), ...el }],
  })),

  updateElement: (id, field, value) => set(s => ({
    elements: s.elements.map(e => e.id === id ? { ...e, [field]: value } : e),
  })),

  removeElement: (id) => set(s => ({
    elements: s.elements.filter(e => e.id !== id),
  })),

  duplicateElement: (id) => set(s => {
    const idx = s.elements.findIndex(e => e.id === id);
    if (idx === -1) return s;
    const copy = { ...s.elements[idx], id: uid(), specVariants: [...(s.elements[idx].specVariants || [])] };
    const next = [...s.elements];
    next.splice(idx + 1, 0, copy);
    return { elements: next };
  }),

  addAssembly: (asm) => set(s => ({
    assemblies: [...s.assemblies, { id: uid(), ...asm }],
  })),

  updateAssembly: (id, field, value) => set(s => ({
    assemblies: s.assemblies.map(a => a.id === id ? { ...a, [field]: value } : a),
  })),

  removeAssembly: (id) => set(s => ({
    assemblies: s.assemblies.filter(a => a.id !== id),
  })),

  toggleDbDiv: (dc) => set(s => {
    const next = new Set(s.dbExpandedDivs);
    next.has(dc) ? next.delete(dc) : next.add(dc);
    return { dbExpandedDivs: next };
  }),
}));
