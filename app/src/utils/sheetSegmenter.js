// sheetSegmenter.js — Sheet layout segmentation via PyMuPDF API
// ═══════════════════════════════════════════════════════════════
//
// Segments a construction drawing sheet into semantic regions:
//   - Sheet border (outermost frame)
//   - Title block (bottom-right metadata area)
//   - Viewports (individual drawing areas with title + scale)
//   - Notes regions (keynotes, general notes)
//   - Legends
//   - Schedule tables
//
// Uses the Render-hosted PyMuPDF service (/segment endpoint).
// Results are cached per drawing in drawingPipelineStore.
//
// This runs as Phase 0.5 in the scan pipeline — between OCR and detection.
// YOLO then runs on individual viewport crops instead of full pages.

import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useDocumentManagementStore } from "@/stores/documentManagementStore";

const VECTOR_API_URL = "https://novaterra-vector-api.onrender.com";

/**
 * Segment a drawing sheet into semantic regions.
 * Calls /segment on the Render API and caches the result.
 *
 * @param {string} drawingId — drawing ID in drawingPipelineStore
 * @returns {Promise<SegmentationResult>}
 */
export async function segmentSheet(drawingId) {
  // Check cache
  const cached = useDrawingPipelineStore.getState().segmentationData?.[drawingId];
  if (cached) {
    console.log(`[sheetSegmenter] Cache hit for ${drawingId.slice(0, 8)}`);
    return cached;
  }

  // Get PDF data — reuse vectorExtractor's PDF retrieval pattern
  const pdfBase64 = await getPdfData(drawingId);
  if (!pdfBase64) {
    console.warn(`[sheetSegmenter] No PDF data for ${drawingId.slice(0, 8)}`);
    return null;
  }

  const drawing = useDrawingPipelineStore.getState().drawings.find((d) => d.id === drawingId);
  const pageNum = (drawing?.pdfPage || drawing?.pageNumber || 1) - 1;

  console.log(`[sheetSegmenter] Segmenting ${drawingId.slice(0, 8)}, page ${pageNum + 1}...`);

  const response = await fetch(`${VECTOR_API_URL}/segment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pdf_base64: pdfBase64, page_num: pageNum }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.warn(`[sheetSegmenter] API error: ${err.error || response.status}`);
    return null;
  }

  const result = await response.json();

  const regions = result.regions || {};
  const vpCount = regions.viewports?.length || 0;
  const hasLayers = result.has_layers || false;
  console.log(
    `[sheetSegmenter] ${drawingId.slice(0, 8)}: ` +
      `label="${result.sheet_label || "?"}" type=${result.sheet_type} ` +
      `TB=${regions.title_block ? "yes" : "no"} VPs=${vpCount} layers=${hasLayers} ` +
      `(${result.layers?.length || 0} OCG groups)`
  );

  // Cache
  useDrawingPipelineStore.getState().setSegmentationData(drawingId, result);

  return result;
}

/**
 * Crop an image to a specific viewport region.
 * Converts PDF-coordinate viewport rect to pixel coordinates and crops.
 *
 * @param {string} imageBase64 — full-page image as base64 (no data: prefix)
 * @param {object} viewport — { rect: [x0,y0,x1,y1], title, scale, type }
 * @param {number} imgWidth — rendered image width in pixels
 * @param {number} imgHeight — rendered image height in pixels
 * @param {number} pageWidth — PDF page width in points
 * @param {number} pageHeight — PDF page height in points
 * @returns {Promise<string>} — cropped image as base64 (no data: prefix)
 */
export function cropToViewport(imageBase64, viewport, imgWidth, imgHeight, pageWidth, pageHeight) {
  const scaleX = imgWidth / pageWidth;
  const scaleY = imgHeight / pageHeight;
  const [x0, y0, x1, y1] = viewport.rect;

  const sx = Math.max(0, Math.round(x0 * scaleX));
  const sy = Math.max(0, Math.round(y0 * scaleY));
  const sw = Math.min(imgWidth - sx, Math.round((x1 - x0) * scaleX));
  const sh = Math.min(imgHeight - sy, Math.round((y1 - y0) * scaleY));

  if (sw < 50 || sh < 50) return Promise.resolve(imageBase64); // too small, return full

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      resolve(canvas.toDataURL("image/jpeg", 0.92).split(",")[1]);
    };
    img.onerror = () => resolve(imageBase64);
    img.src = `data:image/jpeg;base64,${imageBase64}`;
  });
}

/**
 * Check if a viewport rect overlaps with another rect by more than a threshold.
 */
export function rectsOverlap(r1, r2, threshold = 0.5) {
  const x0 = Math.max(r1[0], r2[0]);
  const y0 = Math.max(r1[1], r2[1]);
  const x1 = Math.min(r1[2], r2[2]);
  const y1 = Math.min(r1[3], r2[3]);
  if (x1 <= x0 || y1 <= y0) return false;
  const inter = (x1 - x0) * (y1 - y0);
  const area1 = (r1[2] - r1[0]) * (r1[3] - r1[1]);
  return inter / Math.max(area1, 1) > threshold;
}

// ── PDF Data Retrieval (shared with vectorExtractor.js) ──

async function getPdfData(drawingId) {
  const drawing = useDrawingPipelineStore.getState().drawings.find((d) => d.id === drawingId);
  if (!drawing) return null;

  // Check drawing.data for PDF
  if (drawing.data && typeof drawing.data === "string") {
    const d = drawing.data;
    if (d.startsWith("data:application/pdf") || d.startsWith("JVBERi")) return d;
  }

  if (drawing.sourceFileData) return drawing.sourceFileData;
  if (drawing.pdfData) return drawing.pdfData;

  // Check IDB raw PDF storage
  const fileName = drawing.fileName || drawing.sourceFileName || drawing.name;
  if (fileName) {
    try {
      const { loadPdfRawFromIDB } = await import("@/utils/uploadPipeline");
      const arrayBuffer = await loadPdfRawFromIDB(fileName);
      if (arrayBuffer && arrayBuffer.byteLength > 100) {
        const bytes = new Uint8Array(arrayBuffer);
        const chunks = [];
        const chunkSize = 32768;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
        }
        return "data:application/pdf;base64," + btoa(chunks.join(""));
      }
    } catch { /* non-critical */ }
  }

  // Check documentsStore
  const docs = useDocumentManagementStore.getState().documents || [];
  const parentDoc = docs.find(
    (d) =>
      (drawing.docId && d.id === drawing.docId) ||
      (drawing.documentId && d.id === drawing.documentId) ||
      (drawing.fileName && d.filename === drawing.fileName)
  );
  if (parentDoc?.data) {
    const pd = parentDoc.data;
    if (pd.startsWith("data:application/pdf") || pd.startsWith("JVBERi") || pd.startsWith("data:application/octet")) {
      return pd;
    }
  }

  // Download from cloud storage
  if (drawing.storagePath) {
    try {
      const { downloadBlob } = await import("@/utils/cloudSync");
      return await downloadBlob(drawing.storagePath);
    } catch { /* non-critical */ }
  }

  return null;
}
