// ── Re-export shim: drawingsStore → drawingPipelineStore ──
// All state + actions now live in the consolidated drawingPipelineStore.
// This file kept for backward compatibility — import from here or from drawingPipelineStore directly.
export { useDrawingPipelineStore as useDrawingsStore } from "@/stores/drawingPipelineStore";
