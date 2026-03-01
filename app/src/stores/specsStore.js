import { create } from 'zustand';
import { uid } from '@/utils/format';

export const useSpecsStore = create((set, get) => ({
  specs: [],
  specPdf: null,
  specViewPage: null,
  specParseLoading: false,
  exclusions: [],
  clarifications: [],
  aiExclusionLoading: false,

  setSpecs: (v) => set({ specs: v }),
  setSpecPdf: (v) => set({ specPdf: v }),
  setSpecViewPage: (v) => set({ specViewPage: v }),
  setSpecParseLoading: (v) => set({ specParseLoading: v }),
  setExclusions: (v) => set({ exclusions: v }),
  setClarifications: (v) => set({ clarifications: v }),
  setAiExclusionLoading: (v) => set({ aiExclusionLoading: v }),

  addSpec: (spec) => set(s => ({
    specs: [...s.specs, { id: uid(), ...spec }],
  })),

  updateSpec: (id, field, value) => set(s => ({
    specs: s.specs.map(sp => sp.id === id ? { ...sp, [field]: value } : sp),
  })),

  removeSpec: (id) => set(s => ({
    specs: s.specs.filter(sp => sp.id !== id),
  })),

  addExclusion: (exclusion) => set(s => ({
    exclusions: [...s.exclusions, { id: uid(), ...exclusion }],
  })),

  removeExclusion: (id) => set(s => ({
    exclusions: s.exclusions.filter(e => e.id !== id),
  })),

  addClarification: (category, text) => set(s => ({
    clarifications: [...s.clarifications, { id: uid(), text: text || "", category: category || "" }],
  })),

  updateClarification: (id, field, value) => set(s => ({
    clarifications: s.clarifications.map(c => c.id === id ? { ...c, [field]: value } : c),
  })),

  removeClarification: (id) => set(s => ({
    clarifications: s.clarifications.filter(c => c.id !== id),
  })),
}));
