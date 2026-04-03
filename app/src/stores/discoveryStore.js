// ═══════════════════════════════════════════════════════════════════════════════
// Discovery Store — Zustand store for Proactive Discovery Scan results
//
// After drawings are uploaded, the discovery scan analyzes all sheets and builds
// a unified index of every detected construction element. This store holds that
// index and the scan state so the UI can display a discovery dashboard.
// ═══════════════════════════════════════════════════════════════════════════════
import { create } from "zustand";

// Discovery item categories (used for grouping in the dashboard)
export const DISCOVERY_CATEGORIES = {
  OPENING: "opening", // doors, windows, storefronts
  FINISH: "finish", // paint, tile, flooring, ceiling
  FIXTURE: "fixture", // plumbing, lighting, mechanical
  STRUCTURAL: "structural", // walls, framing, concrete, steel
  EXTERIOR: "exterior", // siding, roofing, flashing
  EQUIPMENT: "equipment", // HVAC, elevators, specialties
  SITE: "site", // earthwork, paving, utilities
  OTHER: "other",
};

export const useDiscoveryStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────────
  scanStatus: "idle", // idle | scanning | complete | error
  scanProgress: 0, // 0-100
  scanActivity: null, // Current activity string for UI
  scanError: null, // Error message if scan failed

  // The discovery index — array of discovered elements across all sheets
  // Each item: {
  //   id: string,
  //   tag: string,               // The detected tag text (e.g., "D1", "WP-2", "GYP")
  //   description: string,       // Inferred description (e.g., "Door Type D1")
  //   category: string,          // One of DISCOVERY_CATEGORIES
  //   instanceCount: number,     // Total instances across all sheets
  //   sheets: [{ drawingId, sheetNumber, sheetTitle, count }],
  //   confidence: number,        // 0-1 average detection confidence
  //   measurementType: string,   // "count" | "linear" | "area"
  //   strategy: string,          // "tag-based" | "exterior-surface" | "interior-surface" | "structural"
  //   createdTakeoffId: string|null,  // Set when user creates a takeoff from this discovery
  //   dismissed: boolean,        // User dismissed this discovery
  // }
  discoveryIndex: [],

  // Timestamp of last completed scan
  lastScanAt: null,

  // ── Actions ────────────────────────────────────────────────────────────────

  // Start a new scan
  startScan: () =>
    set({
      scanStatus: "scanning",
      scanProgress: 0,
      scanActivity: "Initializing discovery scan...",
      scanError: null,
    }),

  // Update scan progress
  updateScanProgress: (progress, activity) =>
    set(s => ({
      scanProgress: Math.min(100, progress),
      scanActivity: activity || s.scanActivity,
    })),

  // Complete the scan with results
  completeScan: discoveryIndex =>
    set({
      scanStatus: "complete",
      scanProgress: 100,
      scanActivity: null,
      discoveryIndex,
      lastScanAt: Date.now(),
    }),

  // Fail the scan
  failScan: error =>
    set({
      scanStatus: "error",
      scanProgress: 0,
      scanActivity: null,
      scanError: error,
    }),

  // Mark a discovery item as having a takeoff created
  markTakeoffCreated: (discoveryId, takeoffId) =>
    set(s => ({
      discoveryIndex: s.discoveryIndex.map(item =>
        item.id === discoveryId ? { ...item, createdTakeoffId: takeoffId } : item,
      ),
    })),

  // Dismiss a discovery item (user doesn't want it)
  dismissDiscovery: discoveryId =>
    set(s => ({
      discoveryIndex: s.discoveryIndex.map(item =>
        item.id === discoveryId ? { ...item, dismissed: true } : item,
      ),
    })),

  // Restore a dismissed discovery
  restoreDiscovery: discoveryId =>
    set(s => ({
      discoveryIndex: s.discoveryIndex.map(item =>
        item.id === discoveryId ? { ...item, dismissed: false } : item,
      ),
    })),

  // Set the full discovery index (used when loading from persistence)
  setDiscoveryIndex: discoveryIndex => set({ discoveryIndex, scanStatus: discoveryIndex?.length > 0 ? "complete" : "idle" }),

  // Reset everything (called on estimate switch)
  reset: () =>
    set({
      scanStatus: "idle",
      scanProgress: 0,
      scanActivity: null,
      scanError: null,
      discoveryIndex: [],
      lastScanAt: null,
    }),
}));
