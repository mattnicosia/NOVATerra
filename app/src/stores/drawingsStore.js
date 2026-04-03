import { create } from "zustand";
import { uid } from "@/utils/format";
import { storage } from "@/utils/storage";
import { idbKey } from "@/utils/idbKey";

export const useDrawingsStore = create((set, get) => ({
  drawings: [],
  selectedDrawingId: null,
  pdfCanvases: {},
  drawingScales: {},
  drawingDpi: {},
  previewDrawingId: null,
  sheetIndex: {}, // { "A501": drawingId, "S-201": drawingId }
  detectedReferences: {}, // { [drawingId]: [{ label, targetSheet, type, xPct, yPct }] }
  refScanLoading: null, // drawingId currently being scanned
  smartLabelMode: false,
  smartLabelRegion: null,
  smartLabelDragging: null,
  aiLabelLoading: false,
  autoLabelProgress: null,
  vectorData: {}, // { [drawingId]: { walls, rooms, text_blocks, page_width, page_height, stats } }

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
  // Build sheet index from all drawings' sheetNumber fields
  buildSheetIndex: () =>
    set(s => {
      const idx = {};
      s.drawings.forEach(d => {
        if (d.sheetNumber && !d.superseded) {
          // Normalize: strip dashes, spaces for fuzzy matching
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

  // Mark an old drawing as superseded by a new one (addendum revision)
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

  // Get the full version chain for a drawing (all versions, oldest first)
  getVersionChain: drawingId => {
    const { drawings } = get();
    const chain = [];
    let current = drawings.find(d => d.id === drawingId);
    if (!current) return chain;

    // Walk backwards to find oldest version
    while (current?.supersedes) {
      const prev = drawings.find(d => d.id === current.supersedes);
      if (!prev) break;
      current = prev;
    }

    // Walk forward collecting all versions
    chain.push(current);
    while (current?.supersededBy) {
      const next = drawings.find(d => d.id === current.supersededBy);
      if (!next) break;
      chain.push(next);
      current = next;
    }

    return chain;
  },

  // Get only active (non-superseded) drawings
  getActiveDrawings: () => {
    const { drawings } = get();
    return drawings.filter(d => !d.superseded);
  },

  // Merge new drawings from an addendum into existing drawings
  // Matches by sheetNumber or filename pattern to create version links
  mergeAddendumDrawings: (newDrawings, addendumNumber) => {
    const { drawings } = get();
    const updatedDrawings = [...drawings];
    const addedDrawings = [];

    for (const newDraw of newDrawings) {
      // Try to match by sheet number first
      const matchBySheet = newDraw.sheetNumber
        ? updatedDrawings.find(d => !d.superseded && d.sheetNumber === newDraw.sheetNumber)
        : null;

      // Fallback: match by filename pattern (strip page/revision suffixes)
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
        // Supersede the old drawing
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
        // Mark new drawing as superseding old
        addedDrawings.push({
          ...newDraw,
          supersedes: match.id,
          addendumNumber,
          isAddendum: true,
          revision: String((parseInt(match.revision || "0", 10) || 0) + 1),
        });
      } else {
        // No match — add as new drawing from addendum
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

  // Show/hide superseded drawings toggle
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
}));
