// NOVATerra AI — Barrel re-export
// All 35+ consumers import from "@/utils/ai" — this file re-exports from domain modules
// so existing imports continue to work without changes.
//
// Domain modules:
//   ai-core.js  — Auth, API calls, streaming, image/pdf blocks, context builder, usage tracking
//   ai-scan.js  — OCR, segmented OCR, dedup, sheet reference detection, batch processing

// ── Core: API calls, streaming, auth, image utilities, context ──
export {
  SCAN_MODEL,
  INTERPRET_MODEL,
  NARRATIVE_MODEL,
  callAnthropic,
  callAnthropicStream,
  callAnthropicStreamPublic,
  optimizeImageForAI,
  cropImageRegion,
  imageBlock,
  pdfBlock,
  buildProjectContext,
  getSessionUsage,
  resetSessionUsage,
  createAIAbort,
} from "./ai-core";

// ── Scan: OCR, segmented tiling, sheet references, batch ──
export {
  batchAI,
  runOCR,
  deduplicateOCRText,
  segmentedOCR,
  detectSheetReferences,
} from "./ai-scan";
