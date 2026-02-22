import { create } from 'zustand';
import { uid } from '@/utils/format';

export const useTakeoffsStore = create((set, get) => ({
  takeoffs: [],
  tkTool: "select",
  tkActivePoints: [],
  tkActiveTakeoffId: null,
  tkSelectedTakeoffId: null,
  tkMeasureState: "idle",
  tkCursorPt: null,
  tkContextMenu: null,
  tkCalibrations: {},
  tkCalibInput: { dist: "", unit: "ft" },
  tkShowVars: null,
  tkAutoCount: null,
  tkScopeSuggestions: null,
  tkZoom: 100,
  tkPan: { x: 0, y: 0 },
  tkPanelWidth: 380,
  tkPanelOpen: true,
  toFilter: "all",
  tkVisibility: "all",   // "all" | "active" | "none"
  tkNewInput: "",
  tkNewUnit: "SF",
  tkDbResults: [],

  setTakeoffs: (v) => set({ takeoffs: v }),
  setTkTool: (v) => set({ tkTool: v }),
  setTkActivePoints: (v) => set({ tkActivePoints: v }),
  setTkActiveTakeoffId: (v) => set({ tkActiveTakeoffId: v }),
  setTkSelectedTakeoffId: (v) => set({ tkSelectedTakeoffId: v }),
  setTkMeasureState: (v) => set({ tkMeasureState: v }),
  setTkCursorPt: (v) => set({ tkCursorPt: v }),
  setTkContextMenu: (v) => set({ tkContextMenu: v }),
  setTkCalibrations: (v) => set({ tkCalibrations: v }),
  setTkCalibInput: (v) => set({ tkCalibInput: v }),
  setTkShowVars: (v) => set({ tkShowVars: v }),
  setTkAutoCount: (v) => set({ tkAutoCount: v }),
  setTkScopeSuggestions: (v) => set({ tkScopeSuggestions: v }),
  setTkZoom: (v) => set(s => ({ tkZoom: typeof v === 'function' ? v(s.tkZoom) : v })),
  setTkPan: (v) => set(s => ({ tkPan: typeof v === 'function' ? v(s.tkPan) : v })),
  setTkPanelWidth: (v) => set({ tkPanelWidth: v }),
  setTkPanelOpen: (v) => set({ tkPanelOpen: v }),
  setToFilter: (v) => set({ toFilter: v }),
  setTkVisibility: (v) => set({ tkVisibility: v }),
  setTkNewInput: (v) => set({ tkNewInput: v }),
  setTkNewUnit: (v) => set({ tkNewUnit: v }),
  setTkDbResults: (v) => set({ tkDbResults: v }),

  addTakeoff: (group, desc, unit, code) => set(s => ({
    takeoffs: [...s.takeoffs, {
      id: uid(), description: desc || "New Takeoff", quantity: 0,
      unit: unit || "SF", color: "#2563eb", drawingRef: "",
      group: group || "", linkedItemId: null, code: code || "",
      variables: [], formula: "",
      measurements: [],
    }],
  })),

  updateTakeoff: (id, field, value) => set(s => ({
    takeoffs: s.takeoffs.map(t => t.id === id ? { ...t, [field]: value } : t),
  })),

  removeTakeoff: (id) => set(s => ({
    takeoffs: s.takeoffs.filter(t => t.id !== id),
  })),

  addMeasurement: (takeoffId, measurement) => set(s => ({
    takeoffs: s.takeoffs.map(t => t.id === takeoffId
      ? { ...t, measurements: [...t.measurements, { id: uid(), ...measurement }] }
      : t),
  })),

  removeMeasurement: (takeoffId, measurementId) => set(s => ({
    takeoffs: s.takeoffs.map(t => t.id === takeoffId
      ? { ...t, measurements: t.measurements.filter(m => m.id !== measurementId) }
      : t),
  })),
}));
