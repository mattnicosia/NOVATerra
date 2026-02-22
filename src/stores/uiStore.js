import { create } from 'zustand';
import { DEFAULT_LABOR_TYPES } from '@/utils/laborTypes';

export const useUiStore = create((set, get) => ({
  persistenceLoaded: false,
  sidebarOpen: true,
  toast: null,
  showNotesPanel: false,

  // App settings
  appSettings: {
    activeCompanyId: "",  // "" = primary profile, companyProfile.id, or "__all__"
    selectedPalette: "light",
    customPalettes: [],
    fontSize: 13,
    sidebarDefault: "open",
    apiKey: "",
    defaultMarkup: { overhead: 10, profit: 10, overheadAndProfit: 20, contingency: 5, generalConditions: 0, insurance: 2, fee: 0, tax: 0, bond: 0 },
    defaultMarkupOrder: [
      { key: "contingency",       label: "Contingency",         compound: false, active: false },
      { key: "generalConditions", label: "General Conditions",  compound: false, active: false },
      { key: "fee",               label: "Fee",                 compound: false, active: false },
      { key: "overheadAndProfit", label: "Overhead & Profit",   compound: false, active: false },
      { key: "overhead",          label: "Overhead",            compound: false, active: false },
      { key: "profit",            label: "Profit",              compound: false, active: false },
      { key: "insurance",         label: "Insurance",           compound: false, active: false },
    ],
    laborTypes: DEFAULT_LABOR_TYPES,
    defaultLaborType: "open_shop",
    onboardingDismissed: false,
  },

  // AI Chat
  aiChatOpen: false,
  aiChatMessages: [],
  aiChatInput: "",
  aiChatLoading: false,

  // Modal visibility
  quickAddModal: null,
  quickAddValue: "",
  deleteConfirmId: null,
  pricingModal: null,
  linkedSubModal: false,
  newIdeaOpen: false,
  newIdea: { title: "", desc: "", priority: "Medium" },
  settingsSaved: false,

  // Estimate view state
  estSearch: "",
  estDivision: "All",
  estGroupBy: "subdivision",
  estShowVars: null,
  estShowSpec: null,
  estShowAllowance: null,
  estViewMode: "both",  // "scope" | "detailed" | "both"
  expandedDivs: new Set(),

  // Cloud sync status
  cloudSyncStatus: "idle", // "idle" | "syncing" | "synced" | "error"
  cloudSyncLastAt: null,   // timestamp string

  // Value engineering
  veLoading: false,
  veSuggestions: [],

  // Actions
  setPersistenceLoaded: (v) => set({ persistenceLoaded: v }),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),

  showToast: (msg, type = "success") => {
    set({ toast: { msg, type } });
    setTimeout(() => set({ toast: null }), 2500);
  },

  setShowNotesPanel: (v) => set({ showNotesPanel: v }),
  setAiChatOpen: (v) => set({ aiChatOpen: v }),
  setAiChatInput: (v) => set({ aiChatInput: v }),
  setAiChatLoading: (v) => set({ aiChatLoading: v }),
  setAiChatMessages: (v) => set({ aiChatMessages: v }),

  setQuickAddModal: (v) => set({ quickAddModal: v }),
  setQuickAddValue: (v) => set({ quickAddValue: v }),
  setDeleteConfirmId: (v) => set({ deleteConfirmId: v }),
  setPricingModal: (v) => set({ pricingModal: v }),
  setLinkedSubModal: (v) => set({ linkedSubModal: v }),
  setNewIdeaOpen: (v) => set({ newIdeaOpen: v }),
  setNewIdea: (v) => set({ newIdea: v }),
  setSettingsSaved: (v) => set({ settingsSaved: v }),

  setEstSearch: (v) => set({ estSearch: v }),
  setEstDivision: (v) => set({ estDivision: v }),
  setEstGroupBy: (v) => set({ estGroupBy: v }),
  setEstShowVars: (v) => set({ estShowVars: v }),
  setEstShowSpec: (v) => set({ estShowSpec: v }),
  setEstShowAllowance: (v) => set({ estShowAllowance: v }),
  setEstViewMode: (v) => set({ estViewMode: v }),
  setExpandedDivs: (v) => set({ expandedDivs: v }),
  toggleExpandedDiv: (div) => set(s => {
    const next = new Set(s.expandedDivs);
    next.has(div) ? next.delete(div) : next.add(div);
    return { expandedDivs: next };
  }),

  setCloudSyncStatus: (status) => set({ cloudSyncStatus: status }),
  setCloudSyncLastAt: (ts) => set({ cloudSyncLastAt: ts }),

  setVeLoading: (v) => set({ veLoading: v }),
  setVeSuggestions: (v) => set({ veSuggestions: v }),

  updateSetting: (path, val) => set(s => {
    const settings = { ...s.appSettings };
    const keys = path.split(".");
    let obj = settings;
    for (let i = 0; i < keys.length - 1; i++) {
      obj[keys[i]] = { ...obj[keys[i]] };
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = val;
    return { appSettings: settings };
  }),

  setAppSettings: (v) => set({ appSettings: v }),
}));
