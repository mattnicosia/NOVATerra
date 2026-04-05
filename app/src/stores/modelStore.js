// ── Re-export shim: modelStore → drawingPipelineStore ──
// All state + actions now live in the consolidated drawingPipelineStore.
// This file kept for backward compatibility — import from here or from drawingPipelineStore directly.
export { useDrawingPipelineStore as useModelStore } from "@/stores/drawingPipelineStore";
