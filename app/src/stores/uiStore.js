import { create } from "zustand";
import { DEFAULT_LABOR_TYPES } from "@/utils/laborTypes";

export const useUiStore = create((set, _get) => ({
  persistenceLoaded: false,
  sidebarOpen: true,
  toast: null,
  showNotesPanel: false,

  // App settings
  appSettings: {
    activeCompanyId: "", // "" = primary profile, companyProfile.id, or "__all__"
    selectedPalette: "shift5b",
    customPalettes: [],
    fontSize: 13,
    density: "comfortable", // "comfortable" | "compact"
    sidebarDefault: "open",
    fredApiKey: "",
    defaultMarkup: {
      overhead: 10,
      profit: 10,
      overheadAndProfit: 20,
      contingency: 5,
      generalConditions: 0,
      insurance: 2,
      fee: 0,
      tax: 0,
      bond: 0,
    },
    defaultMarkupOrder: [
      { key: "contingency", label: "Contingency", compound: false, active: false },
      { key: "generalConditions", label: "General Conditions", compound: false, active: false },
      { key: "fee", label: "Fee", compound: false, active: false },
      { key: "overheadAndProfit", label: "Overhead & Profit", compound: false, active: false },
      { key: "overhead", label: "Overhead", compound: false, active: false },
      { key: "profit", label: "Profit", compound: false, active: false },
      { key: "insurance", label: "Insurance", compound: false, active: false },
    ],
    laborTypes: DEFAULT_LABOR_TYPES,
    defaultLaborType: "open_shop",
    productionHoursPerDay: 7,
    bufferHours: 0,
    overheadPercent: 15,
    behindThreshold: 20,
    aheadThreshold: 15,
    useAccuracyAdjustment: false,
    complexityMultipliers: { light: 0.8, normal: 1.0, heavy: 1.3 },
    onboardingDismissed: false,
    showActivityTimer: false,
    workWeek: "mon-fri", // "mon-fri" | "mon-sat"
    projectColumns: {
      visible: ["name", "client", "status", "value", "bidDue", "modified"],
      order: ["name", "client", "status", "value", "bidDue", "modified"],
    },
  },

  // Revision Detection (transient — not persisted)
  revisionReport: null, // Array from detectRevisions(): [{ oldDrawingId, newDrawingId, sheetNumber, ... }]
  revisionImpact: null, // Object from analyzeRevisionImpact(): { sheets, summary }

  // AI Chat
  aiChatOpen: false,
  aiChatMessages: [],
  aiChatInput: "",
  aiChatLoading: false,
  pendingNovaMessage: null,

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
  estGroupBy2: null, // secondary grouping level for hierarchical nesting (null = flat)
  estShowVars: null,
  estShowSpec: null,
  estShowAllowance: null,
  estViewMode: "scope", // "scope" | "detail" | "level"
  activeGroupId: "base",
  expandedDivs: new Set(),

  // Cloud sync status
  cloudSyncStatus: "idle", // "idle" | "syncing" | "synced" | "error"
  cloudSyncLastAt: null, // timestamp string (formatted, e.g. "2:45 PM")
  cloudSyncLastFullAt: null, // ISO string for relative time calculations
  cloudSyncError: null, // error message string (for debug)
  cloudSyncInProgress: false, // true while startup sync is running — blocks auto-save cloud pushes

  // Multi-device session awareness
  otherSessions: [], // [{ device, browser, lastSeen }]

  // Value engineering
  veLoading: false,
  veSuggestions: [],

  // Actions
  setPersistenceLoaded: v => set({ persistenceLoaded: v }),
  setSidebarOpen: v => set({ sidebarOpen: v }),
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),

  showToast: (msg, type = "success") => {
    set({ toast: { msg, type } });
    setTimeout(() => set({ toast: null }), 3100);
  },

  setRevisionReport: v => set({ revisionReport: v }),
  setRevisionImpact: v => set({ revisionImpact: v }),
  dismissRevisionImpact: () => set({ revisionReport: null, revisionImpact: null }),

  setShowNotesPanel: v => set({ showNotesPanel: v }),
  setAiChatOpen: v => set({ aiChatOpen: v }),
  setAiChatInput: v => set({ aiChatInput: v }),
  setAiChatLoading: v => set({ aiChatLoading: v }),
  setAiChatMessages: v => set({ aiChatMessages: v }),
  setPendingNovaMessage: v => set({ pendingNovaMessage: v }),

  setQuickAddModal: v => set({ quickAddModal: v }),
  setQuickAddValue: v => set({ quickAddValue: v }),
  setDeleteConfirmId: v => set({ deleteConfirmId: v }),
  setPricingModal: v => set({ pricingModal: v }),
  setLinkedSubModal: v => set({ linkedSubModal: v }),
  setNewIdeaOpen: v => set({ newIdeaOpen: v }),
  setNewIdea: v => set({ newIdea: v }),
  setSettingsSaved: v => set({ settingsSaved: v }),

  setEstSearch: v => set({ estSearch: v }),
  setEstDivision: v => set({ estDivision: v }),
  setEstGroupBy: v => set({ estGroupBy: v }),
  setEstGroupBy2: v => set({ estGroupBy2: v }),
  setEstShowVars: v => set({ estShowVars: v }),
  setEstShowSpec: v => set({ estShowSpec: v }),
  setEstShowAllowance: v => set({ estShowAllowance: v }),
  setEstViewMode: v => set({ estViewMode: v }),
  setActiveGroupId: v => set({ activeGroupId: v }),
  setExpandedDivs: v => set({ expandedDivs: v }),
  toggleExpandedDiv: div =>
    set(s => {
      const next = new Set(s.expandedDivs);
      next.has(div) ? next.delete(div) : next.add(div);
      return { expandedDivs: next };
    }),

  setCloudSyncStatus: status =>
    set({ cloudSyncStatus: status, ...(status !== "error" ? { cloudSyncError: null } : {}) }),
  setCloudSyncLastAt: ts => set({ cloudSyncLastAt: ts }),
  setCloudSyncError: msg => set({ cloudSyncError: msg }),
  setOtherSessions: v => set({ otherSessions: v }),

  setVeLoading: v => set({ veLoading: v }),
  setVeSuggestions: v => set({ veSuggestions: v }),

  updateSetting: (path, val) =>
    set(s => {
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

  setAppSettings: v => set({ appSettings: v }),
}));
