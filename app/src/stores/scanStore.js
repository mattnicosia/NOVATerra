// ── Re-export shim: scanStore → drawingPipelineStore ──
// All state + actions now live in the consolidated drawingPipelineStore.
// This file kept for backward compatibility — import from here or from drawingPipelineStore directly.
export { useDrawingPipelineStore as useScanStore } from "@/stores/drawingPipelineStore";
