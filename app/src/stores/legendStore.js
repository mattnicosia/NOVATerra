import { create } from "zustand";
import { storage } from "@/utils/storage";
import { idbKey } from "@/utils/idbKey";

/* ────────────────────────────────────────────────────────
   legendStore — Persisted symbol legend cache per project.

   Legends are parsed ONCE per project (via Vision API ~$0.02)
   and cached forever. Every subsequent prediction call gets
   the parsed symbol definitions as context → massive accuracy boost.

   Data shape per legend entry:
   {
     drawingId: string,        // Source drawing that contained the legend
     discipline: string,       // "electrical" | "plumbing" | "mechanical" | "architectural" | "general"
     sheetNumber: string,      // e.g., "E0.1"
     symbols: [{
       code: string,           // "A" or "2x4 troffer"
       description: string,    // "2x4 Recessed Fluorescent Troffer"
       category: string,       // "lighting" | "receptacle" | "switch" | "plumbing" | "hvac" | "fire" | "general"
       symbolDescription: string, // "Rectangle with X pattern" — what it looks like visually
     }],
     parsedAt: number,         // timestamp
     confidence: number,       // 0-1 from Vision API
   }
   ──────────────────────────────────────────────────────── */

const IDB_KEY = "bldg-legends";

export const useLegendStore = create((set, get) => ({
  // Map of estimateId → legend entries array
  legends: {},
  loaded: false,

  // ── Load from IDB on startup ──
  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await storage.get(idbKey(IDB_KEY));
      if (raw?.value) {
        const parsed = typeof raw.value === "string" ? JSON.parse(raw.value) : raw.value;
        set({ legends: parsed, loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  // ── Add a parsed legend for the current estimate ──
  addLegend: (estimateId, legendEntry) => {
    set(s => {
      const existing = s.legends[estimateId] || [];
      // Dedup by drawingId — replace if same drawing re-parsed
      const filtered = existing.filter(l => l.drawingId !== legendEntry.drawingId);
      const updated = {
        ...s.legends,
        [estimateId]: [...filtered, legendEntry],
      };
      // Persist (non-blocking)
      storage.set(idbKey(IDB_KEY), JSON.stringify(updated)).catch(() => {});
      return { legends: updated };
    });
  },

  // ── Get all legends for an estimate ──
  getLegendsForEstimate: (estimateId) => {
    return get().legends[estimateId] || [];
  },

  // ── Get all symbols for a discipline within an estimate ──
  getSymbolsForDiscipline: (estimateId, discipline) => {
    const legends = get().legends[estimateId] || [];
    if (!discipline) return legends.flatMap(l => l.symbols);
    return legends
      .filter(l => l.discipline === discipline || l.discipline === "general")
      .flatMap(l => l.symbols);
  },

  // ── Build a context string for Vision API prompts ──
  buildLegendContext: (estimateId, discipline) => {
    const symbols = get().getSymbolsForDiscipline(estimateId, discipline);
    if (symbols.length === 0) return "";

    const lines = symbols.map(s => {
      const visual = s.symbolDescription ? ` (looks like: ${s.symbolDescription})` : "";
      return `- ${s.code}: ${s.description}${visual} [${s.category}]`;
    });

    return [
      "SYMBOL LEGEND (from project drawings):",
      ...lines,
      "",
      "Use these symbol definitions to identify elements accurately.",
    ].join("\n");
  },

  // ── Check if a drawing looks like a legend sheet ──
  isLegendSheet: (drawing) => {
    const title = (drawing.sheetTitle || drawing.label || "").toLowerCase();
    const number = (drawing.sheetNumber || "").toLowerCase();

    // Sheet number heuristics: x0.1, x0.0, x-0 patterns (cover/legend sheets)
    const isCoverSheet = /^[a-z]0[.\-]?[01]$/i.test(number) ||
      /^[a-z]-?0$/i.test(number);

    // Title heuristics
    const hasLegendKeyword = /legend|symbol|fixture\s+schedule|abbreviat|general\s+notes/i.test(title);

    return isCoverSheet || hasLegendKeyword;
  },

  // ── Check if we already have a legend for a drawing ──
  hasLegendForDrawing: (estimateId, drawingId) => {
    const legends = get().legends[estimateId] || [];
    return legends.some(l => l.drawingId === drawingId);
  },

  // ── Clear legends for an estimate ──
  clearLegends: (estimateId) => {
    set(s => {
      const updated = { ...s.legends };
      delete updated[estimateId];
      storage.set(idbKey(IDB_KEY), JSON.stringify(updated)).catch(() => {});
      return { legends: updated };
    });
  },
}));
