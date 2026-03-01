import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { useUiStore } from '@/stores/uiStore';
import { DEFAULT_SECTION_ORDER, DEFAULT_SECTION_VISIBILITY } from '@/constants/proposalSections';

const TEMPLATES_KEY = "bldg-proposal-templates";

export const useReportsStore = create((set, get) => ({
  reportType: "proposal",
  proposalConfig: {
    scope: "", exclusions: "", qualifications: "", schedule: "",
    pricing: "lumpsum", customScope: "", customQualifications: "", customSchedule: "",
  },
  proposalText: {
    greeting: "",
    intro: "",
    closing: "",
    signature: "",
  },

  // Proposal builder state
  sectionOrder: [...DEFAULT_SECTION_ORDER],
  sectionVisibility: { ...DEFAULT_SECTION_VISIBILITY },
  builderOpen: true,
  proposalTemplates: [],

  // SOV preferences (persisted across navigation)
  sovMode: "below",
  sovSort: "trade",
  setSovMode: (v) => set({ sovMode: v }),
  setSovSort: (v) => set({ sovSort: v }),

  // Scope of Work options
  scopeShowQuantities: true,
  setScopeShowQuantities: (v) => set({ scopeShowQuantities: v }),

  // AI scope narratives
  scopeNarratives: {},
  scopeNarrativeLoading: {},

  setReportType: (v) => set({ reportType: v }),
  setProposalText: (key, value) => set(s => ({
    proposalText: { ...s.proposalText, [key]: value },
  })),
  setProposalConfig: (v) => set({ proposalConfig: v }),
  updateProposalConfig: (field, value) => set(s => ({
    proposalConfig: { ...s.proposalConfig, [field]: value },
  })),

  // Builder actions
  reorderSection: (oldIdx, newIdx) => set(s => {
    const order = [...s.sectionOrder];
    const [moved] = order.splice(oldIdx, 1);
    order.splice(newIdx, 0, moved);
    return { sectionOrder: order };
  }),

  toggleSectionVisibility: (id) => set(s => ({
    sectionVisibility: { ...s.sectionVisibility, [id]: !s.sectionVisibility[id] },
  })),

  toggleBuilder: () => set(s => ({ builderOpen: !s.builderOpen })),

  resetLayout: () => set({
    sectionOrder: [...DEFAULT_SECTION_ORDER],
    sectionVisibility: { ...DEFAULT_SECTION_VISIBILITY },
  }),

  // Special sections (page break / spacer)
  addSpecialSection: (type) => set(s => {
    const id = `${type}_${crypto.randomUUID().slice(0, 8)}`;
    return {
      sectionOrder: [...s.sectionOrder, id],
      sectionVisibility: { ...s.sectionVisibility, [id]: true },
    };
  }),

  removeSpecialSection: (id) => set(s => {
    const vis = { ...s.sectionVisibility };
    delete vis[id];
    return {
      sectionOrder: s.sectionOrder.filter(sid => sid !== id),
      sectionVisibility: vis,
    };
  }),

  // AI narrative actions
  setScopeNarrative: (division, text) => set(s => ({
    scopeNarratives: { ...s.scopeNarratives, [division]: text },
  })),

  setScopeNarrativeLoading: (division, loading) => set(s => ({
    scopeNarrativeLoading: { ...s.scopeNarrativeLoading, [division]: loading },
  })),

  clearScopeNarrative: (division) => set(s => {
    const next = { ...s.scopeNarratives };
    delete next[division];
    return { scopeNarratives: next };
  }),

  // Template CRUD
  saveTemplate: async (name) => {
    const { sectionOrder, sectionVisibility, proposalTemplates } = get();
    const template = {
      id: crypto.randomUUID(),
      name,
      sectionOrder: [...sectionOrder],
      sectionVisibility: { ...sectionVisibility },
      createdAt: Date.now(),
    };
    const next = [...proposalTemplates, template];
    set({ proposalTemplates: next });
    try {
      const ok = await storage.set(TEMPLATES_KEY, JSON.stringify(next));
      if (!ok) useUiStore.getState().showToast("Template save failed", "error");
    } catch (err) {
      console.error('[reportsStore] Template save error:', err);
      useUiStore.getState().showToast("Template save failed", "error");
    }
  },

  loadTemplate: (id) => set(s => {
    const t = s.proposalTemplates.find(t => t.id === id);
    if (!t) return {};
    return {
      sectionOrder: [...t.sectionOrder],
      sectionVisibility: { ...t.sectionVisibility },
    };
  }),

  deleteTemplate: async (id) => {
    const next = get().proposalTemplates.filter(t => t.id !== id);
    set({ proposalTemplates: next });
    try {
      const ok = await storage.set(TEMPLATES_KEY, JSON.stringify(next));
      if (!ok) useUiStore.getState().showToast("Template delete failed to persist", "error");
    } catch (err) {
      console.error('[reportsStore] Template delete error:', err);
      useUiStore.getState().showToast("Template delete failed to persist", "error");
    }
  },

  loadTemplatesFromStorage: async () => {
    const raw = await storage.get(TEMPLATES_KEY);
    if (raw) {
      try {
        set({ proposalTemplates: JSON.parse(raw.value) });
      } catch (err) {
        console.error('[reportsStore] Failed to parse templates:', err);
      }
    }
  },
}));
