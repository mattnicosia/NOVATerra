// vectorExtractor.js — Client-side interface to the PyMuPDF vector extraction API
// Calls /api/extract_vectors with PDF data, caches results in drawingsStore.
// Returns walls + rooms in PDF points (72 DPI). Client converts to feet via calibration.

import { useDrawingsStore } from "@/stores/drawingsStore";

/**
 * Extract vector wall data from a PDF drawing page.
 * Uses server-side PyMuPDF for accurate geometry extraction.
 * Results are cached — subsequent calls return instantly.
 *
 * @param {string} drawingId — the drawing ID in drawingsStore
 * @returns {Object} { walls: [...], rooms: [...], text_blocks: [...], page_width, page_height, stats }
 */
export async function extractVectors(drawingId) {
  // Check cache first
  const cached = useDrawingsStore.getState().vectorData?.[drawingId];
  if (cached) {
    console.log(`[vectorExtractor] Cache hit for ${drawingId.slice(0, 8)}: ${cached.walls?.length || 0} walls`);
    return cached;
  }

  const drawing = useDrawingsStore.getState().drawings.find(d => d.id === drawingId);
  if (!drawing) throw new Error(`Drawing ${drawingId} not found`);

  // Get raw PDF data — need the original PDF, not the rendered JPEG
  // The PDF is stored as base64 in drawing.data for PDF-type drawings
  // OR we need to reconstruct from the source file
  let pdfBase64 = null;

  // Check if drawing has raw PDF data
  if (drawing.data && (drawing.data.startsWith("data:application/pdf") || drawing.data.startsWith("JVBERi"))) {
    pdfBase64 = drawing.data;
  } else if (drawing.sourceFileData) {
    pdfBase64 = drawing.sourceFileData;
  } else if (drawing.pdfData) {
    pdfBase64 = drawing.pdfData;
  }

  // Try to get from the shared document source
  if (!pdfBase64) {
    const docs = useDrawingsStore.getState().documents || [];
    const parentDoc = docs.find(d => d.id === drawing.docId || d.id === drawing.documentId);
    if (parentDoc?.data) {
      pdfBase64 = parentDoc.data;
    }
  }

  if (!pdfBase64) {
    throw new Error(`No PDF data available for drawing ${drawingId.slice(0, 8)}. The original PDF may not be stored.`);
  }

  const pageNum = (drawing.pdfPage || drawing.pageNumber || 1) - 1; // 0-indexed for API

  console.log(`[vectorExtractor] Calling API for ${drawingId.slice(0, 8)}, page ${pageNum + 1}...`);

  const response = await fetch("/api/extract_vectors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pdf_base64: pdfBase64,
      page_num: pageNum,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Vector extraction failed: ${response.status}`);
  }

  const result = await response.json();

  console.log(`[vectorExtractor] ${drawingId.slice(0, 8)}: ${result.stats?.merged_walls || 0} walls, ${result.stats?.rooms_detected || 0} rooms (${result.drawing_type})`);

  // Cache in store
  useDrawingsStore.getState().setVectorData(drawingId, result);

  return result;
}

/**
 * Check if a drawing has cached vector data.
 */
export function hasVectorData(drawingId) {
  return !!useDrawingsStore.getState().vectorData?.[drawingId];
}

/**
 * Clear cached vector data for a drawing (force re-extraction).
 */
export function clearVectorData(drawingId) {
  const state = useDrawingsStore.getState();
  if (state.vectorData?.[drawingId]) {
    const updated = { ...state.vectorData };
    delete updated[drawingId];
    useDrawingsStore.setState({ vectorData: updated });
  }
}
