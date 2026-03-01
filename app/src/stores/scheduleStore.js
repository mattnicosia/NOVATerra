import { create } from 'zustand';
import { today } from '@/utils/format';

export const useScheduleStore = create((set, get) => ({
  // Generated schedule data
  activities: [],

  // Settings
  projectStartDate: today(),
  workDaysPerWeek: 5,

  // Trade overrides: { [tradeKey]: { crewSize?, dailyRate?, duration? } }
  tradeOverrides: {},

  // Takt zones
  zones: ["Zone 1"],

  // View state
  viewMode: "gantt",              // "gantt" | "takt"
  selectedActivityId: null,
  generated: false,
  generating: false,

  // Actions
  setActivities: (v) => set({ activities: v, generated: true, generating: false }),
  setProjectStartDate: (v) => set({ projectStartDate: v }),
  setWorkDaysPerWeek: (v) => set({ workDaysPerWeek: v }),
  setViewMode: (v) => set({ viewMode: v }),
  setSelectedActivityId: (v) => set({ selectedActivityId: v }),
  setZones: (v) => set({ zones: v }),
  setGenerating: (v) => set({ generating: v }),

  setTradeOverride: (tradeKey, field, value) => set(s => ({
    tradeOverrides: {
      ...s.tradeOverrides,
      [tradeKey]: { ...(s.tradeOverrides[tradeKey] || {}), [field]: value },
    },
  })),

  clearTradeOverride: (tradeKey) => set(s => {
    const next = { ...s.tradeOverrides };
    delete next[tradeKey];
    return { tradeOverrides: next };
  }),

  addZone: (label) => set(s => ({ zones: [...s.zones, label] })),
  removeZone: (idx) => set(s => ({ zones: s.zones.filter((_, i) => i !== idx) })),
  renameZone: (idx, label) => set(s => ({
    zones: s.zones.map((z, i) => i === idx ? label : z),
  })),

  getSelectedActivity: () => {
    const { activities, selectedActivityId } = get();
    return activities.find(a => a.id === selectedActivityId) || null;
  },

  getProjectEndDay: () => {
    const { activities } = get();
    if (activities.length === 0) return 0;
    return Math.max(...activities.map(a => a.earlyFinish || 0));
  },

  getCriticalPathLength: () => {
    const { activities } = get();
    return activities.filter(a => a.isCritical).reduce((s, a) => s + a.duration, 0);
  },

  reset: () => set({
    activities: [],
    projectStartDate: today(),
    workDaysPerWeek: 5,
    tradeOverrides: {},
    zones: ["Zone 1"],
    viewMode: "gantt",
    selectedActivityId: null,
    generated: false,
    generating: false,
  }),
}));
