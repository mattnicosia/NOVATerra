import { create } from "zustand";
import { DEFAULT_LABOR_TYPES } from "@/utils/laborTypes";

// ── Feature flag defaults ──
const DEFAULT_FLAGS = {
  "predictive-takeoffs": true,
  "drawing-overlay": true,
  "firm-memory": true,
  "collaboration": true,
  "dashboard-widgets": true,
  "onboarding-v2": true,
  "feedback-widget": true,
  "version-history": true,
  "nova-insights": true,
  "tablet-mode": true,
};
function parseUrlOverrides() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const overrides = {};
  for (const [key, value] of params.entries()) {
    if (key.startsWith("ff_")) overrides[key.slice(3)] = value === "1" || value === "true";
  }
  return overrides;
}

export const useUiStore = create((set, _get) => ({
  persistenceLoaded: false,
  cloudSettingsLoaded: false,
  sidebarOpen: true,
  toasts: [],
  showNotesPanel: false,

  // App settings — selectedPalette reads from localStorage for instant boot (no FOUC)
  appSettings: {
    activeCompanyId: "", // "" = primary profile, companyProfile.id, or "__all__"
    selectedPalette: (() => { try { return localStorage.getItem("nova-palette") || "nova"; } catch { return "nova"; } })(),
    paletteVariant: (() => { try { return Number(localStorage.getItem("nova-palette-variant")) || 0; } catch { return 0; } })(),
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

  // Conflict Merge (transient — not persisted)
  conflictData: null, // { estimateId, localBlob, cloudMeta } — set by cloudSync when offline conflict detected

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
  estViewMode: "detail", // "scope" | "detail" | "level"
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

  // Filtered takeoff suggestions (set by NOVA chat filter_takeoff_suggestions tool)
  filteredSuggestions: null, // null = no filter applied, Array = filtered list

  // Value engineering
  veLoading: false,
  veSuggestions: [],

  // Actions
  setPersistenceLoaded: v => set({ persistenceLoaded: v }),
  setCloudSettingsLoaded: v => set({ cloudSettingsLoaded: v }),
  setSidebarOpen: v => set({ sidebarOpen: v }),
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),

  showToast: (msg, type = "success") => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    set(s => ({ toasts: [...s.toasts.slice(-2), { id, msg, type }] }));
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, 3100);
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
  setCloudSyncLastFullAt: ts => set({ cloudSyncLastFullAt: ts }),
  setCloudSyncError: msg => set({ cloudSyncError: msg }),
  setOtherSessions: v => set({ otherSessions: v }),
  sessionKicked: false,
  setSessionKicked: v => set({ sessionKicked: v }),
  updateAvailable: false,
  setUpdateAvailable: v => set({ updateAvailable: v }),

  setFilteredSuggestions: v => set({ filteredSuggestions: v }),
  clearFilteredSuggestions: () => set({ filteredSuggestions: null }),

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
      // Persist palette instantly for no-flash boot
      try {
        if (path === "selectedPalette") localStorage.setItem("nova-palette", val);
        if (path === "paletteVariant") localStorage.setItem("nova-palette-variant", String(val));
      } catch { /* non-critical */ }
      return { appSettings: settings };
    }),

  setAppSettings: v => {
    set({ appSettings: v });
    // Persist palette to localStorage for instant boot (no theme flash)
    try {
      if (v?.selectedPalette) localStorage.setItem("nova-palette", v.selectedPalette);
      if (v?.paletteVariant !== undefined) localStorage.setItem("nova-palette-variant", String(v.paletteVariant));
    } catch { /* non-critical */ }
  },

  // ── Command Palette (was commandPaletteStore) ──
  cmdOpen: false,
  cmdQuery: '',
  cmdRecentIds: JSON.parse(localStorage.getItem('nova_cmd_recents') || '[]'),
  cmdToggle: () => set(s => ({ cmdOpen: !s.cmdOpen, cmdQuery: '' })),
  setCmdOpen: v => set({ cmdOpen: v, cmdQuery: '' }),
  cmdClose: () => set({ cmdOpen: false, cmdQuery: '' }),
  setCmdQuery: v => set({ cmdQuery: v }),
  addCmdRecent: id => set(s => {
    const next = [id, ...s.cmdRecentIds.filter(r => r !== id)].slice(0, 8);
    localStorage.setItem('nova_cmd_recents', JSON.stringify(next));
    return { cmdRecentIds: next };
  }),

  // ── Field View (was fieldStore) ──
  fieldMode: "field", // "field" | "plan" | "transitioning"
  fieldTransitionProgress: 0,
  fieldTransitionDirection: null, // "to-plan" | "to-field"
  fieldHoveredNodeId: null,
  fieldHoveredRingIdx: null,
  fieldSelectedNodeId: null,
  fieldTooltipData: null,
  setFieldMode: v => set({ fieldMode: v }),
  setFieldTransitionProgress: v => set({ fieldTransitionProgress: v }),
  setFieldTransitionDirection: v => set({ fieldTransitionDirection: v }),
  setFieldHoveredNode: (nodeId, ringIdx) => set({ fieldHoveredNodeId: nodeId, fieldHoveredRingIdx: ringIdx }),
  clearFieldHover: () => set({ fieldHoveredNodeId: null, fieldHoveredRingIdx: null, fieldTooltipData: null }),
  setFieldSelectedNode: v => set({ fieldSelectedNodeId: v }),
  setFieldTooltipData: v => set({ fieldTooltipData: v }),
  toggleFieldMode: () => set(s => ({ fieldMode: s.fieldMode === "field" ? "plan" : "field" })),

  // ── Core Tab (was coreStore) ──
  coreActiveTab: "overview",
  setCoreActiveTab: tab => set({ coreActiveTab: tab }),
  coreStatsLastComputed: null,
  coreCachedStats: null,
  setCoreCachedStats: stats => set({ coreCachedStats: stats, coreStatsLastComputed: Date.now() }),

  // ── Feature Flags (was featureFlagStore) ──
  featureFlags: { ...DEFAULT_FLAGS, ...parseUrlOverrides() },
  isFeatureEnabled: name => _get().featureFlags[name] ?? false,
  toggleFeatureFlag: name => set(s => ({ featureFlags: { ...s.featureFlags, [name]: !s.featureFlags[name] } })),
  setFeatureFlag: (name, value) => set(s => ({ featureFlags: { ...s.featureFlags, [name]: value } })),
  setFeatureFlags: updates => set(s => ({ featureFlags: { ...s.featureFlags, ...updates } })),
  resetFeatureFlags: () => set({ featureFlags: { ...DEFAULT_FLAGS } }),
  getAllFeatureFlags: () => Object.entries(_get().featureFlags).map(([name, enabled]) => ({ name, enabled, isDefault: DEFAULT_FLAGS[name] === enabled })),
}));
