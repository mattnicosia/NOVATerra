import { create } from "zustand";
import { uid } from "@/utils/format";
import { useUndoStore } from "@/stores/undoStore";

// ── Debounce tracker for takeoff field edits ──
let _lastTkEdit = { id: null, field: null, origValue: null, timer: null };

function _flushTkEditUndo(set) {
  if (!_lastTkEdit.timer) return;
  clearTimeout(_lastTkEdit.timer);
  const { id, field, origValue } = _lastTkEdit;
  // Capture the current value for redo before clearing
  const curValue = useTakeoffsStore.getState().takeoffs.find(t => t.id === id)?.[field];
  useUndoStore.getState().push({
    action: `Edit takeoff`,
    undo: () =>
      set(s => ({
        takeoffs: s.takeoffs.map(t => (t.id === id ? { ...t, [field]: origValue } : t)),
      })),
    redo: () =>
      set(s => ({
        takeoffs: s.takeoffs.map(t => (t.id === id ? { ...t, [field]: curValue } : t)),
      })),
    timestamp: Date.now(),
  });
  _lastTkEdit = { id: null, field: null, origValue: null, timer: null };
}

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
  tkPanelWidth: 550,
  tkPanelTier: "standard", // "compact" | "standard" | "full" | "estimate"
  tkPanelOpen: true,
  toFilter: "all",
  tkVisibility: "all", // "all" | "page" | "active"
  tkNewInput: "",
  tkNewUnit: "SF",
  tkDbResults: [],

  // ── Predictive takeoff state ──
  tkPredictions: null, // { tag, predictions[], scanning, totalInstances, source }
  tkPredAccepted: [], // IDs of accepted predictions
  tkPredRejected: [], // IDs of rejected predictions
  tkPredContext: null, // { tag, source, confidence, matchCount, missCount, consecutiveMisses, refining }
  tkPredRefining: false, // true while NOVA is re-analyzing after misses
  tkNovaPanelOpen: false, // NOVA Vision right-side panel

  setTkPredictions: v =>
    set(s => {
      const hasPreds = v && v.predictions && v.predictions.length > 0;
      return {
        tkPredictions: v,
        tkPredAccepted: [],
        tkPredRejected: [],
        tkNovaPanelOpen: hasPreds ? true : s.tkNovaPanelOpen,
        // Auto-initialize prediction context when predictions arrive
        tkPredContext: hasPreds ? {
          tag: v.tag || "",
          source: v.source || "tag",
          confidence: v.confidence || 0.7,
          matchCount: 0,
          missCount: 0,
          consecutiveMisses: 0,
          refining: false,
        } : s.tkPredContext,
        tkPredRefining: false,
      };
    }),

  acceptPrediction: id =>
    set(s => {
      const newAccepted = [...s.tkPredAccepted, id];
      // Update context: increment match count, reset consecutive misses
      const ctx = s.tkPredContext;
      const newCtx = ctx
        ? {
            ...ctx,
            matchCount: ctx.matchCount + 1,
            consecutiveMisses: 0,
            confidence: Math.min(0.98, ctx.confidence + 0.03),
          }
        : null;
      return { tkPredAccepted: newAccepted, tkPredContext: newCtx };
    }),

  rejectPrediction: id =>
    set(s => {
      const newRejected = [...s.tkPredRejected, id];
      const ctx = s.tkPredContext;
      const newCtx = ctx
        ? {
            ...ctx,
            confidence: Math.max(0.1, ctx.confidence - 0.05),
          }
        : null;
      return { tkPredRejected: newRejected, tkPredContext: newCtx };
    }),

  acceptAllPredictions: () =>
    set(s => {
      if (!s.tkPredictions) return {};
      const ids = s.tkPredictions.predictions.map(p => p.id).filter(id => !s.tkPredRejected.includes(id));
      const ctx = s.tkPredContext;
      const newCtx = ctx
        ? {
            ...ctx,
            matchCount: ctx.matchCount + ids.length,
            consecutiveMisses: 0,
            confidence: 0.95,
          }
        : null;
      return { tkPredAccepted: ids, tkPredContext: newCtx };
    }),

  setTkNovaPanelOpen: v => set(s => ({ tkNovaPanelOpen: typeof v === "function" ? v(s.tkNovaPanelOpen) : v })),

  clearPredictions: () =>
    set({
      tkPredictions: null,
      tkPredAccepted: [],
      tkPredRejected: [],
      tkPredContext: null,
      tkPredRefining: false,
      tkNovaPanelOpen: false,
    }),

  // Record a user measurement miss (clicked far from any prediction)
  recordPredictionMiss: () =>
    set(s => {
      const ctx = s.tkPredContext;
      if (!ctx) return {};
      const newMiss = ctx.consecutiveMisses + 1;
      return {
        tkPredContext: {
          ...ctx,
          missCount: ctx.missCount + 1,
          consecutiveMisses: newMiss,
          confidence: Math.max(0.1, ctx.confidence - 0.08),
        },
        // Start refining state after 2 consecutive misses
        tkPredRefining: newMiss >= 2,
      };
    }),

  setTkPredRefining: v => set({ tkPredRefining: v }),

  // Initialize prediction context when predictions are first generated
  initPredContext: (tag, source, confidence) =>
    set({
      tkPredContext: {
        tag,
        source: source || "tag",
        confidence: confidence || 0.7,
        matchCount: 0,
        missCount: 0,
        consecutiveMisses: 0,
        refining: false,
      },
      tkPredRefining: false,
    }),

  setTakeoffs: v => set({ takeoffs: v }),
  setTkTool: v => set({ tkTool: v }),
  setTkActivePoints: v => set({ tkActivePoints: v }),
  setTkActiveTakeoffId: v => set({ tkActiveTakeoffId: v }),
  setTkSelectedTakeoffId: v => set({ tkSelectedTakeoffId: v }),
  setTkMeasureState: v => set({ tkMeasureState: v }),
  setTkCursorPt: v => set({ tkCursorPt: v }),
  setTkContextMenu: v => set({ tkContextMenu: v }),
  setTkCalibrations: v => set({ tkCalibrations: v }),
  setTkCalibInput: v => set({ tkCalibInput: v }),
  setTkShowVars: v => set({ tkShowVars: v }),
  setTkAutoCount: v => set({ tkAutoCount: v }),
  setTkScopeSuggestions: v => set({ tkScopeSuggestions: v }),
  setTkZoom: v => set(s => ({ tkZoom: typeof v === "function" ? v(s.tkZoom) : v })),
  setTkPan: v => set(s => ({ tkPan: typeof v === "function" ? v(s.tkPan) : v })),
  // Per-sheet zoom/pan persistence
  _sheetViews: {},
  saveTkSheetView: (sheetId) => {
    if (!sheetId) return;
    const { tkZoom, tkPan } = get();
    set(s => ({ _sheetViews: { ...s._sheetViews, [sheetId]: { zoom: tkZoom, pan: { ...tkPan } } } }));
  },
  restoreTkSheetView: (sheetId) => {
    if (!sheetId) return false;
    const view = get()._sheetViews[sheetId];
    if (!view) return false;
    set({ tkZoom: view.zoom, tkPan: { ...view.pan } });
    return true;
  },
  setTkPanelWidth: v => set({ tkPanelWidth: v }),
  setTkPanelTier: v => set({ tkPanelTier: v }),
  setTkPanelOpen: v => set({ tkPanelOpen: v }),
  setToFilter: v => set({ toFilter: v }),
  setTkVisibility: v => set({ tkVisibility: v }),
  setTkNewInput: v => set({ tkNewInput: v }),
  setTkNewUnit: v => set({ tkNewUnit: v }),
  setTkDbResults: v => set({ tkDbResults: v }),

  addTakeoff: (group, desc, unit, code, bidContext) => {
    const newId = uid();
    const newTakeoff = {
      id: newId,
      description: desc || "New Takeoff",
      quantity: 0,
      unit: unit || "SF",
      color: ["#C0392B", "#27AE60", "#2980B9", "#D35400", "#8E44AD", "#16A085", "#F39C12", "#E74C3C"][
        Math.floor(Math.random() * 8)
      ],
      drawingRef: "",
      group: group || "",
      linkedItemId: null,
      code: code || "",
      variables: [],
      formula: "",
      measurements: [],
      bidContext: bidContext || "base",
    };
    set(s => ({ takeoffs: [...s.takeoffs, newTakeoff] }));
    useUndoStore.getState().push({
      action: `Add takeoff "${newTakeoff.description}"`,
      undo: () => set(s => ({ takeoffs: s.takeoffs.filter(t => t.id !== newId) })),
      redo: () => set(s => ({ takeoffs: [...s.takeoffs, newTakeoff] })),
      timestamp: Date.now(),
    });
  },

  updateTakeoff: (id, field, value) => {
    // Flush any pending edit for a DIFFERENT id/field
    if (_lastTkEdit.timer && (_lastTkEdit.id !== id || _lastTkEdit.field !== field)) {
      _flushTkEditUndo(set);
    }
    // Capture original value on first edit of this id+field
    if (!_lastTkEdit.timer || _lastTkEdit.id !== id || _lastTkEdit.field !== field) {
      const tk = get().takeoffs.find(t => t.id === id);
      _lastTkEdit = { id, field, origValue: tk ? tk[field] : undefined, timer: null };
    }
    if (_lastTkEdit.timer) clearTimeout(_lastTkEdit.timer);

    // Capture the new value for redo closure
    const capturedValue = value;
    _lastTkEdit.timer = setTimeout(() => {
      // At flush time, build redo with the value that was last set
      const tk = get().takeoffs.find(t => t.id === id);
      const curValue = tk ? tk[field] : capturedValue;
      const orig = _lastTkEdit.origValue;
      if (curValue !== orig) {
        useUndoStore.getState().push({
          action: `Edit takeoff`,
          undo: () =>
            set(s => ({
              takeoffs: s.takeoffs.map(t => (t.id === id ? { ...t, [field]: orig } : t)),
            })),
          redo: () =>
            set(s => ({
              takeoffs: s.takeoffs.map(t => (t.id === id ? { ...t, [field]: curValue } : t)),
            })),
          timestamp: Date.now(),
        });
      }
      _lastTkEdit = { id: null, field: null, origValue: null, timer: null };
    }, 1500);

    // Apply the change
    set(s => ({
      takeoffs: s.takeoffs.map(t => (t.id === id ? { ...t, [field]: value } : t)),
    }));
  },

  removeTakeoff: id => {
    const takeoffs = get().takeoffs;
    const idx = takeoffs.findIndex(t => t.id === id);
    if (idx === -1) return;
    const removed = takeoffs[idx];
    set({ takeoffs: takeoffs.filter(t => t.id !== id) });
    useUndoStore.getState().push({
      action: `Delete takeoff "${removed.description || "takeoff"}"`,
      undo: () => {
        const cur = get().takeoffs;
        const restored = [...cur];
        restored.splice(idx, 0, removed);
        set({ takeoffs: restored });
      },
      redo: () => set(s => ({ takeoffs: s.takeoffs.filter(t => t.id !== id) })),
      timestamp: Date.now(),
    });
  },

  addMeasurement: (takeoffId, measurement) => {
    const newId = uid();
    const newMeasurement = { id: newId, ...measurement };
    set(s => ({
      takeoffs: s.takeoffs.map(t =>
        t.id === takeoffId ? { ...t, measurements: [...t.measurements, newMeasurement] } : t,
      ),
    }));
    useUndoStore.getState().push({
      action: `Add measurement`,
      undo: () =>
        set(s => ({
          takeoffs: s.takeoffs.map(t =>
            t.id === takeoffId ? { ...t, measurements: t.measurements.filter(m => m.id !== newId) } : t,
          ),
        })),
      redo: () =>
        set(s => ({
          takeoffs: s.takeoffs.map(t =>
            t.id === takeoffId ? { ...t, measurements: [...t.measurements, newMeasurement] } : t,
          ),
        })),
      timestamp: Date.now(),
    });
  },

  removeMeasurement: (takeoffId, measurementId) => {
    const tk = get().takeoffs.find(t => t.id === takeoffId);
    const removed = tk ? tk.measurements.find(m => m.id === measurementId) : null;
    set(s => ({
      takeoffs: s.takeoffs.map(t =>
        t.id === takeoffId ? { ...t, measurements: t.measurements.filter(m => m.id !== measurementId) } : t,
      ),
    }));
    if (removed) {
      useUndoStore.getState().push({
        action: `Delete measurement`,
        undo: () =>
          set(s => ({
            takeoffs: s.takeoffs.map(t =>
              t.id === takeoffId ? { ...t, measurements: [...t.measurements, removed] } : t,
            ),
          })),
        redo: () =>
          set(s => ({
            takeoffs: s.takeoffs.map(t =>
              t.id === takeoffId ? { ...t, measurements: t.measurements.filter(m => m.id !== measurementId) } : t,
            ),
          })),
        timestamp: Date.now(),
      });
    }
  },
}));
