import { create } from "zustand";
import { uid } from "@/utils/format";
import { storage } from "@/utils/storage";
import { idbKey } from "@/utils/idbKey";
import { useUiStore } from "@/stores/uiStore";
import { useUndoStore } from "@/stores/undoStore";
import { useAuthStore } from "@/stores/authStore";
import { useOrgStore } from "@/stores/orgStore";

// ── Debounce tracker for takeoff field edits ──
let _lastTkEdit = { id: null, field: null, origValue: null, timer: null };

function _flushTkEditUndo(set) {
  if (!_lastTkEdit.timer) return;
  clearTimeout(_lastTkEdit.timer);
  const { id, field, origValue } = _lastTkEdit;
  // Capture the current value for redo before clearing
  const curValue = useDrawingPipelineStore.getState().takeoffs.find(t => t.id === id)?.[field];
  useUndoStore.getState().push({
    action: `Edit takeoff`,
    undo: () =>
      useDrawingPipelineStore.setState(s => ({
        takeoffs: s.takeoffs.map(t => (t.id === id ? { ...t, [field]: origValue } : t)),
      })),
    redo: () =>
      useDrawingPipelineStore.setState(s => ({
        takeoffs: s.takeoffs.map(t => (t.id === id ? { ...t, [field]: curValue } : t)),
      })),
    timestamp: Date.now(),
  });
  _lastTkEdit = { id: null, field: null, origValue: null, timer: null };
}

export const useDrawingPipelineStore = create((set, get) => ({

  // ═══════════════════════════════════════════════════════════
  // DRAWINGS DOMAIN (was drawingsStore)
  // ═══════════════════════════════════════════════════════════

  drawings: [],
  selectedDrawingId: null,
  pdfCanvases: {},
  drawingScales: {},
  drawingDpi: {},
  previewDrawingId: null,
  sheetIndex: {},
  detectedReferences: {},
  refScanLoading: null,
  smartLabelMode: false,
  smartLabelRegion: null,
  smartLabelDragging: null,
  aiLabelLoading: false,
  autoLabelProgress: null,
  vectorData: {},

  setDrawings: v => set({ drawings: v }),
  setVectorData: (drawingId, data) => set(s => ({ vectorData: { ...s.vectorData, [drawingId]: data } })),
  setSelectedDrawingId: v => set({ selectedDrawingId: v }),
  setPdfCanvases: v => set({ pdfCanvases: v }),
  setDrawingScales: v => set({ drawingScales: v }),
  setDrawingDpi: v => set({ drawingDpi: v }),
  setPreviewDrawingId: v => set({ previewDrawingId: v }),
  setDetectedReferences: (drawingId, refs) =>
    set(s => ({ detectedReferences: { ...s.detectedReferences, [drawingId]: refs } })),
  setRefScanLoading: v => set({ refScanLoading: v }),
  buildSheetIndex: () =>
    set(s => {
      const idx = {};
      s.drawings.forEach(d => {
        if (d.sheetNumber && !d.superseded) {
          idx[d.sheetNumber] = d.id;
          const clean = d.sheetNumber.replace(/[-\s]/g, "");
          if (clean !== d.sheetNumber) idx[clean] = d.id;
        }
      });
      return { sheetIndex: idx };
    }),
  setSmartLabelMode: v => set({ smartLabelMode: v }),
  setSmartLabelRegion: v => set({ smartLabelRegion: v }),
  setSmartLabelDragging: v => set({ smartLabelDragging: v }),
  setAiLabelLoading: v => set({ aiLabelLoading: v }),
  setAutoLabelProgress: v => set({ autoLabelProgress: v }),

  addDrawing: drawing =>
    set(s => ({
      drawings: [...s.drawings, { id: uid(), ...drawing }],
    })),

  updateDrawing: (id, field, value) =>
    set(s => ({
      drawings: s.drawings.map(d => (d.id === id ? { ...d, [field]: value } : d)),
    })),

  removeDrawing: id =>
    set(s => ({
      drawings: s.drawings.filter(d => d.id !== id),
      selectedDrawingId: s.selectedDrawingId === id ? null : s.selectedDrawingId,
    })),

  getSelectedDrawing: () => {
    const { drawings, selectedDrawingId } = get();
    return drawings.find(d => d.id === selectedDrawingId) || null;
  },

  // ── Version Tracking (Addenda System) ──────────────────────

  supersedeDrawing: (oldId, newId, addendumNumber) =>
    set(s => ({
      drawings: s.drawings.map(d => {
        if (d.id === oldId) {
          return {
            ...d,
            superseded: true,
            supersededBy: newId,
            versionHistory: [
              ...(d.versionHistory || []),
              { drawingId: newId, addendumNumber, date: new Date().toISOString() },
            ],
          };
        }
        if (d.id === newId) {
          return {
            ...d,
            supersedes: oldId,
            addendumNumber: addendumNumber || d.addendumNumber,
            isAddendum: true,
          };
        }
        return d;
      }),
    })),

  getVersionChain: drawingId => {
    const { drawings } = get();
    const chain = [];
    let current = drawings.find(d => d.id === drawingId);
    if (!current) return chain;

    while (current?.supersedes) {
      const prev = drawings.find(d => d.id === current.supersedes);
      if (!prev) break;
      current = prev;
    }

    chain.push(current);
    while (current?.supersededBy) {
      const next = drawings.find(d => d.id === current.supersededBy);
      if (!next) break;
      chain.push(next);
      current = next;
    }

    return chain;
  },

  getActiveDrawings: () => {
    const { drawings } = get();
    return drawings.filter(d => !d.superseded);
  },

  mergeAddendumDrawings: (newDrawings, addendumNumber) => {
    const { drawings } = get();
    const updatedDrawings = [...drawings];
    const addedDrawings = [];

    for (const newDraw of newDrawings) {
      const matchBySheet = newDraw.sheetNumber
        ? updatedDrawings.find(d => !d.superseded && d.sheetNumber === newDraw.sheetNumber)
        : null;

      const normalizeName = name =>
        (name || "")
          .toLowerCase()
          .replace(/-pg\d+$/i, "")
          .replace(/-rev\d+$/i, "")
          .replace(/\s*\(rev\s*\d+\)/i, "")
          .trim();

      const matchByName =
        !matchBySheet && newDraw.label
          ? updatedDrawings.find(d => !d.superseded && normalizeName(d.label) === normalizeName(newDraw.label))
          : null;

      const match = matchBySheet || matchByName;

      if (match) {
        const matchIdx = updatedDrawings.findIndex(d => d.id === match.id);
        if (matchIdx >= 0) {
          updatedDrawings[matchIdx] = {
            ...updatedDrawings[matchIdx],
            superseded: true,
            supersededBy: newDraw.id,
            versionHistory: [
              ...(updatedDrawings[matchIdx].versionHistory || []),
              { drawingId: newDraw.id, addendumNumber, date: new Date().toISOString() },
            ],
          };
        }
        addedDrawings.push({
          ...newDraw,
          supersedes: match.id,
          addendumNumber,
          isAddendum: true,
          revision: String((parseInt(match.revision || "0", 10) || 0) + 1),
        });
      } else {
        addedDrawings.push({
          ...newDraw,
          addendumNumber,
          isAddendum: true,
        });
      }
    }

    set({ drawings: [...updatedDrawings, ...addedDrawings] });
    return addedDrawings;
  },

  showSuperseded: false,
  setShowSuperseded: v => set({ showSuperseded: v }),

  // ── Symbol Legends (was legendStore) ──
  legends: {},
  legendsLoaded: false,

  loadLegends: async () => {
    if (get().legendsLoaded) return;
    try {
      const raw = await storage.get(idbKey("bldg-legends"));
      if (raw?.value) {
        const parsed = typeof raw.value === "string" ? JSON.parse(raw.value) : raw.value;
        set({ legends: parsed, legendsLoaded: true });
      } else {
        set({ legendsLoaded: true });
      }
    } catch { set({ legendsLoaded: true }); }
  },

  addLegend: (estimateId, legendEntry) => set(s => {
    const existing = s.legends[estimateId] || [];
    const filtered = existing.filter(l => l.drawingId !== legendEntry.drawingId);
    const updated = { ...s.legends, [estimateId]: [...filtered, legendEntry] };
    storage.set(idbKey("bldg-legends"), JSON.stringify(updated)).catch(() => {});
    return { legends: updated };
  }),

  getLegendsForEstimate: estimateId => get().legends[estimateId] || [],

  getSymbolsForDiscipline: (estimateId, discipline) => {
    const legends = get().legends[estimateId] || [];
    if (!discipline) return legends.flatMap(l => l.symbols);
    return legends.filter(l => l.discipline === discipline || l.discipline === "general").flatMap(l => l.symbols);
  },

  buildLegendContext: (estimateId, discipline) => {
    const symbols = get().getSymbolsForDiscipline(estimateId, discipline);
    if (symbols.length === 0) return "";
    const lines = symbols.map(s => {
      const visual = s.symbolDescription ? ` (looks like: ${s.symbolDescription})` : "";
      return `- ${s.code}: ${s.description}${visual} [${s.category}]`;
    });
    return ["SYMBOL LEGEND (from project drawings):", ...lines, "", "Use these symbol definitions to identify elements accurately."].join("\n");
  },

  isLegendSheet: drawing => {
    const title = (drawing.sheetTitle || drawing.label || "").toLowerCase();
    const number = (drawing.sheetNumber || "").toLowerCase();
    const isCoverSheet = /^[a-z]0[.\-]?[01]$/i.test(number) || /^[a-z]-?0$/i.test(number);
    const hasLegendKeyword = /legend|symbol|fixture\s+schedule|abbreviat|general\s+notes/i.test(title);
    return isCoverSheet || hasLegendKeyword;
  },

  hasLegendForDrawing: (estimateId, drawingId) => {
    const legends = get().legends[estimateId] || [];
    return legends.some(l => l.drawingId === drawingId);
  },

  clearLegends: estimateId => set(s => {
    const updated = { ...s.legends };
    delete updated[estimateId];
    storage.set(idbKey("bldg-legends"), JSON.stringify(updated)).catch(() => {});
    return { legends: updated };
  }),

  // ═══════════════════════════════════════════════════════════
  // SCAN DOMAIN (was scanStore)
  // ═══════════════════════════════════════════════════════════

  scanResults: null,
  scanProgress: { phase: null, current: 0, total: 0, message: "" },
  scanError: null,
  learningRecords: [],
  parameterCorrections: [],
  scanAbortController: null,
  scanResultsPending: false,

  setScanResults: results => set({ scanResults: results }),
  setScanResultsPending: v => set({ scanResultsPending: v }),
  setScanProgress: progress => set({ scanProgress: progress }),
  setScanError: error => set({ scanError: error }),

  clearScan: () =>
    set({
      scanResults: null,
      scanProgress: { phase: null, current: 0, total: 0, message: "" },
      scanError: null,
      scanAbortController: null,
      scanResultsPending: false,
    }),

  createAbortController: () => {
    const controller = new AbortController();
    set({ scanAbortController: controller });
    return controller.signal;
  },

  stopScan: () => {
    const { scanAbortController } = get();
    if (scanAbortController) {
      scanAbortController.abort();
    }
    set({
      scanAbortController: null,
      scanProgress: { phase: null, current: 0, total: 0, message: "" },
    });
  },

  // ── Learning Records ──
  addLearningRecord: async record => {
    const records = [...get().learningRecords, { ...record, timestamp: Date.now() }];
    set({ learningRecords: records });
    try {
      const ok = await storage.set(idbKey("bldg-scan-learning"), JSON.stringify(records));
      if (!ok) {
        console.error("[scanStore] Failed to persist learning record");
        useUiStore.getState().showToast("Calibration data save failed", "error");
      }
    } catch (err) {
      console.error("[scanStore] Learning record persistence error:", err);
      useUiStore.getState().showToast("Calibration data save failed", "error");
    }
  },

  loadLearningRecords: async () => {
    try {
      const raw = await storage.get(idbKey("bldg-scan-learning"));
      if (raw) {
        const records = JSON.parse(raw.value);
        set({ learningRecords: records });
      }
    } catch (err) {
      console.warn("[scanStore] Failed to load learning records:", err);
    }
  },

  getCalibrationFactors: (buildingType, workType, laborType) => {
    const allRecords = get().learningRecords;

    const FALLBACK_TYPE_MAP = {
      restaurant: "retail",
      religious: "commercial-office",
      parking: "industrial",
      "mixed-use": "commercial-office",
      hospitality: "retail",
      government: "education",
    };

    const computeFactors = (records, bootstrapped = false) => {
      const currentYear = new Date().getFullYear();
      const divTotals = {};

      records.forEach(rec => {
        if (!rec.romPrediction?.divisions || !rec.actuals?.divisions) return;

        const recYear = rec.normalizedToYear || rec.originalYear || currentYear;
        const age = Math.max(0, currentYear - recYear);
        const recencyWeight = Math.pow(0.85, age);

        const divCount = Object.keys(rec.actuals.divisions).length;
        const completenessWeight = Math.min(1, divCount / 10);

        const isGC = rec.proposalType === "gc";
        const typeWeight = isGC ? 1.0 : 0.85;

        const weight = recencyWeight * completenessWeight * typeWeight;

        Object.keys(rec.romPrediction.divisions).forEach(div => {
          const predicted = rec.romPrediction.divisions[div]?.mid || 0;
          const actual = rec.actuals.divisions[div] || 0;
          if (predicted > 0 && actual > 0) {
            if (!divTotals[div]) divTotals[div] = {
              predicted: 0, actual: 0, count: 0,
              gcPredicted: 0, gcActual: 0, gcCount: 0,
              subPredicted: 0, subActual: 0, subCount: 0,
            };
            divTotals[div].predicted += predicted * weight;
            divTotals[div].actual += actual * weight;
            divTotals[div].count += 1;

            if (isGC) {
              divTotals[div].gcPredicted += predicted * weight;
              divTotals[div].gcActual += actual * weight;
              divTotals[div].gcCount += 1;
            } else {
              divTotals[div].subPredicted += predicted * weight;
              divTotals[div].subActual += actual * weight;
              divTotals[div].subCount += 1;
            }
          }
        });
      });

      const factors = {};
      Object.entries(divTotals).forEach(([div, d]) => {
        if (d.count >= 1 && d.predicted > 0) {
          const factor = d.actual / d.predicted;
          const confidence = d.count < 3 ? "low" : d.count < 8 ? "medium" : "high";
          factors[div] = {
            factor,
            count: d.count,
            confidence,
            gcFactor: d.gcCount > 0 && d.gcPredicted > 0 ? d.gcActual / d.gcPredicted : null,
            gcCount: d.gcCount,
            subFactor: d.subCount > 0 && d.subPredicted > 0 ? d.subActual / d.subPredicted : null,
            subCount: d.subCount,
            bootstrapped,
          };
        }
      });
      factors.bootstrapped = bootstrapped;
      return factors;
    };

    if (allRecords.length === 0) return { bootstrapped: true };

    let records = allRecords;
    if (buildingType || workType || laborType) {
      const filtered = allRecords.filter(rec => {
        if (buildingType && rec.buildingType && rec.buildingType !== buildingType) return false;
        if (workType && rec.workType && rec.workType !== workType) return false;
        if (laborType && rec.laborType && rec.laborType !== laborType) return false;
        return true;
      });
      if (filtered.length > 0) {
        return computeFactors(filtered, false);
      }
    }

    if (buildingType && FALLBACK_TYPE_MAP[buildingType]) {
      const fallbackType = FALLBACK_TYPE_MAP[buildingType];
      const fallbackFiltered = allRecords.filter(rec => {
        if (rec.buildingType && rec.buildingType !== fallbackType) return false;
        if (workType && rec.workType && rec.workType !== workType) return false;
        if (laborType && rec.laborType && rec.laborType !== laborType) return false;
        return true;
      });
      if (fallbackFiltered.length > 0) {
        return computeFactors(fallbackFiltered, true);
      }
    }

    return computeFactors(allRecords, true);
  },

  // ── Parameter Correction Tracking ──

  addParameterCorrection: async ({ field, detected, corrected }) => {
    let buildingType = "",
      projectSF = 0;
    try {
      const { useProjectStore } = await import("@/stores/projectStore");
      const proj = useProjectStore.getState().project;
      buildingType = proj.jobType || proj.buildingType || "";
      projectSF = parseFloat(proj.projectSF) || 0;
    } catch {
      /* non-critical */
    }

    const record = {
      field,
      detected: typeof detected === "number" ? detected : parseInt(detected) || 0,
      corrected: typeof corrected === "number" ? corrected : parseInt(corrected) || 0,
      buildingType,
      projectSF,
      timestamp: Date.now(),
    };

    const corrections = [...get().parameterCorrections, record];
    set({ parameterCorrections: corrections });

    try {
      await storage.set(idbKey("bldg-param-corrections"), JSON.stringify(corrections));
    } catch (err) {
      console.warn("[scanStore] Failed to persist parameter correction:", err);
    }
  },

  loadParameterCorrections: async () => {
    try {
      const raw = await storage.get(idbKey("bldg-param-corrections"));
      if (raw) {
        const corrections = JSON.parse(raw.value);
        set({ parameterCorrections: corrections });
      }
    } catch (err) {
      console.warn("[scanStore] Failed to load parameter corrections:", err);
    }
  },

  getParameterCorrectionFactors: buildingType => {
    let corrections = get().parameterCorrections;
    if (corrections.length === 0) return {};

    if (buildingType) {
      const filtered = corrections.filter(c => c.buildingType === buildingType);
      if (filtered.length >= 3) corrections = filtered;
    }

    const fieldData = {};

    corrections.forEach(c => {
      if (!c.detected || !c.corrected || c.detected === c.corrected) return;

      const age = Math.max(0, (Date.now() - c.timestamp) / (365.25 * 24 * 60 * 60 * 1000));
      const weight = Math.pow(0.8, age);

      if (!fieldData[c.field]) fieldData[c.field] = [];
      fieldData[c.field].push({
        detected: c.detected,
        corrected: c.corrected,
        weight,
      });
    });

    const factors = {};
    Object.entries(fieldData).forEach(([field, items]) => {
      if (items.length < 2) return;

      let weightedDetected = 0,
        weightedCorrected = 0,
        totalWeight = 0;
      items.forEach(({ detected, corrected, weight }) => {
        weightedDetected += detected * weight;
        weightedCorrected += corrected * weight;
        totalWeight += weight;
      });

      if (weightedDetected > 0 && totalWeight > 0) {
        const ratio = weightedCorrected / weightedDetected;
        factors[field] = Math.max(0.5, Math.min(2.0, ratio));
      }
    });

    return factors;
  },

  // ═══════════════════════════════════════════════════════════
  // TAKEOFFS DOMAIN (was takeoffsStore)
  // ═══════════════════════════════════════════════════════════

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
  tkPanelTier: "standard",
  tkPanelOpen: true,
  toFilter: "all",
  tkVisibility: "all",
  tkNewInput: "",
  tkNewUnit: "SF",
  tkDbResults: [],

  // ── Predictive takeoff state ──
  tkPredictions: null,
  tkPredAccepted: [],
  tkPredRejected: [],
  tkPredContext: null,
  tkPredRefining: false,
  tkRefinementPending: false,
  tkNovaPanelOpen: false,

  setTkPredictions: v =>
    set(s => {
      const hasPreds = v && v.predictions && v.predictions.length > 0;
      return {
        tkPredictions: v,
        tkPredAccepted: [],
        tkPredRejected: [],
        tkNovaPanelOpen: hasPreds ? true : s.tkNovaPanelOpen,
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

  recordPredictionMiss: () => {
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
        tkPredRefining: newMiss >= 2,
      };
    });
    const { tkPredRefining, triggerRefinement } = get();
    if (tkPredRefining) triggerRefinement();
  },

  setTkPredRefining: v => set({ tkPredRefining: v }),

  triggerRefinement: () => {
    set(s => ({
      tkPredictions: s.tkPredictions ? { ...s.tkPredictions, predictions: [] } : null,
      tkPredRefining: true,
      tkRefinementPending: true,
      tkPredContext: s.tkPredContext
        ? { ...s.tkPredContext, consecutiveMisses: 0, refining: true }
        : null,
    }));
  },
  clearRefinementPending: () => set({ tkRefinementPending: false }),

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
    // Attribution: snapshot current user info for collaboration tracking
    const _user = useAuthStore?.getState?.()?.user;
    const _member = useOrgStore?.getState?.()?.membership;
    const _userId = _user?.id || null;
    const _userName = _member?.display_name || _user?.user_metadata?.full_name || _user?.email?.split("@")[0] || null;
    const _userColor = _member?.color || "#60A5FA";

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
      // Collaboration attribution
      createdBy: _userId,
      createdByName: _userName,
      createdByColor: _userColor,
      createdAt: new Date().toISOString(),
      lastModifiedBy: _userId,
      lastModifiedByName: _userName,
      lastModifiedAt: new Date().toISOString(),
    };
    set(s => ({ takeoffs: [...s.takeoffs, newTakeoff] }));
    useUndoStore.getState().push({
      action: `Add takeoff "${newTakeoff.description}"`,
      undo: () => set(s => ({ takeoffs: s.takeoffs.filter(t => t.id !== newId) })),
      redo: () => set(s => ({ takeoffs: [...s.takeoffs, newTakeoff] })),
      timestamp: Date.now(),
    });
    return newId;
  },

  updateTakeoff: (id, field, value) => {
    if (_lastTkEdit.timer && (_lastTkEdit.id !== id || _lastTkEdit.field !== field)) {
      _flushTkEditUndo(set);
    }
    if (!_lastTkEdit.timer || _lastTkEdit.id !== id || _lastTkEdit.field !== field) {
      const tk = get().takeoffs.find(t => t.id === id);
      _lastTkEdit = { id, field, origValue: tk ? tk[field] : undefined, timer: null };
    }
    if (_lastTkEdit.timer) clearTimeout(_lastTkEdit.timer);

    const capturedValue = value;
    _lastTkEdit.timer = setTimeout(() => {
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

    // Update field + attribution
    const _user = useAuthStore?.getState?.()?.user;
    const _member = useOrgStore?.getState?.()?.membership;
    set(s => ({
      takeoffs: s.takeoffs.map(t => (t.id === id ? {
        ...t,
        [field]: value,
        lastModifiedBy: _user?.id || t.lastModifiedBy,
        lastModifiedByName: _member?.display_name || _user?.email?.split("@")[0] || t.lastModifiedByName,
        lastModifiedAt: new Date().toISOString(),
      } : t)),
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

  // ═══════════════════════════════════════════════════════════
  // MODEL DOMAIN (was modelStore)
  // ═══════════════════════════════════════════════════════════

  elements: [],
  selectedElementId: null,
  viewMode: 'trade',
  levels: [],
  ifcLoaded: false,
  autoGenerated: false,
  generating: false,
  ifcElements: [],
  ifcError: null,

  outlines: {},
  floorAssignments: {},
  coverageCells: [],
  coverageStats: null,
  floorHeight: 12,
  floorHeights: {},
  analyzingPlans: false,
  analyzeProgress: '',

  roomGeometry: {},
  roomElements: [],

  hoveredElementId: null,
  hiddenFloors: [],
  sectionPlaneY: null,
  specOverrides: {},
  xrayMode: false,

  materialAssignments: {},

  setElements: (v) => set({ elements: v }),
  setSelectedElementId: (v) => set({ selectedElementId: v }),
  setViewMode: (v) => set({ viewMode: v }),
  setLevels: (v) => set({ levels: v }),
  setGenerating: (v) => set({ generating: v }),
  setIfcLoaded: (v) => set({ ifcLoaded: v }),
  setIfcElements: (v) => set({ ifcElements: v }),
  setIfcError: (v) => set({ ifcError: v }),

  selectElement: (id) => set({ selectedElementId: id }),

  setOutline: (drawingId, polygon, source = 'ai', pixelPolygon = null) => set(s => ({
    outlines: { ...s.outlines, [drawingId]: { polygon, source, pixelPolygon } },
  })),
  setFloorAssignments: (map) => set({ floorAssignments: map }),
  setCoverage: (cells, stats) => set({ coverageCells: cells, coverageStats: stats }),
  setFloorHeight: (ft) => set({ floorHeight: ft }),
  setFloorHeightFor: (label, ft) => set(s => ({
    floorHeights: { ...s.floorHeights, [label]: ft },
  })),
  setAnalyzingPlans: (v) => set({ analyzingPlans: v }),
  setAnalyzeProgress: (v) => set({ analyzeProgress: v }),
  setRoomGeometry: (drawingId, rooms, roomLabels) => set(s => ({
    roomGeometry: { ...s.roomGeometry, [drawingId]: { rooms, roomLabels } },
  })),
  setRoomElements: (v) => set({ roomElements: v }),

  setHoveredElement: (id) => set({ hoveredElementId: id }),
  toggleFloorVisibility: (floorName) => set(s => {
    const hidden = [...s.hiddenFloors];
    const idx = hidden.indexOf(floorName);
    if (idx >= 0) hidden.splice(idx, 1);
    else hidden.push(floorName);
    return { hiddenFloors: hidden };
  }),
  showAllFloors: () => set({ hiddenFloors: [] }),
  setSectionPlaneY: (y) => set({ sectionPlaneY: y }),
  setSpecOverride: (elementId, overrides) => set(s => ({
    specOverrides: {
      ...s.specOverrides,
      [elementId]: { ...(s.specOverrides[elementId] || {}), ...overrides },
    },
  })),
  clearSpecOverride: (elementId) => set(s => {
    const next = { ...s.specOverrides };
    delete next[elementId];
    return { specOverrides: next };
  }),
  setXrayMode: (v) => set({ xrayMode: v }),

  assignMaterial: (elementId, slug, overrides = {}) => set(s => ({
    materialAssignments: {
      ...s.materialAssignments,
      [elementId]: { slug, overrides },
    },
  })),
  removeMaterialAssignment: (elementId) => set(s => {
    const next = { ...s.materialAssignments };
    delete next[elementId];
    return { materialAssignments: next };
  }),
  updateMaterialOverrides: (elementId, overrides) => set(s => ({
    materialAssignments: {
      ...s.materialAssignments,
      [elementId]: {
        ...(s.materialAssignments[elementId] || {}),
        overrides: { ...(s.materialAssignments[elementId]?.overrides || {}), ...overrides },
      },
    },
  })),

  getSelectedElement: () => {
    const { elements, selectedElementId } = get();
    return elements.find(e => e.id === selectedElementId) || null;
  },

  reset: () => set({
    elements: [],
    selectedElementId: null,
    viewMode: 'trade',
    levels: [],
    ifcLoaded: false,
    autoGenerated: false,
    generating: false,
    ifcElements: [],
    ifcError: null,
    outlines: {},
    floorAssignments: {},
    coverageCells: [],
    coverageStats: null,
    floorHeight: 12,
    floorHeights: {},
    analyzingPlans: false,
    analyzeProgress: '',
    hoveredElementId: null,
    hiddenFloors: [],
    sectionPlaneY: null,
    specOverrides: {},
    xrayMode: false,
    materialAssignments: {},
    roomGeometry: {},
    roomElements: [],
  }),
}));

