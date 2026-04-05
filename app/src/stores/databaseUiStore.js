import { create } from "zustand";

export const useDatabaseUiStore = create((set) => ({
  // Navigation / expansion state
  dbExpandedDivs: new Set(),
  dbSelectedSub: null,
  dbSearch: "",
  dbZipCode: "",
  dbActiveTab: "items",
  dbAssemblySearch: "",

  // Modal / dialog state
  createDbItem: null,
  editDbItem: null,
  sendToDbModal: null,
  sendToDbCode: "",
  pickerForItemId: null,
  overwriteModal: null,

  // Custom trade bundle overrides: [{ key, label, sort, divisions }]
  customBundles: null,

  // ─── Setters ────────────────────────────────────────────────
  setDbExpandedDivs: v => set({ dbExpandedDivs: v }),
  setDbSelectedSub: v => set({ dbSelectedSub: v }),
  setDbSearch: v => set({ dbSearch: v }),
  setDbZipCode: v => set({ dbZipCode: v }),
  setDbActiveTab: v => set({ dbActiveTab: v }),
  setDbAssemblySearch: v => set({ dbAssemblySearch: v }),
  setCreateDbItem: v => set({ createDbItem: v }),
  setEditDbItem: v => set({ editDbItem: v }),
  setSendToDbModal: v => set({ sendToDbModal: v }),
  setSendToDbCode: v => set({ sendToDbCode: v }),
  setPickerForItemId: v => set({ pickerForItemId: v }),
  setOverwriteModal: v => set({ overwriteModal: v }),
  setCustomBundles: v => set({ customBundles: v }),

  toggleDbDiv: dc =>
    set(s => {
      const next = new Set(s.dbExpandedDivs);
      next.has(dc) ? next.delete(dc) : next.add(dc);
      return { dbExpandedDivs: next };
    }),
}));
