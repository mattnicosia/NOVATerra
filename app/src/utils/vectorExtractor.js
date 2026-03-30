// vectorExtractor.js — Client-side interface to the PyMuPDF vector extraction API
// Calls the Render-hosted Python service for PDF vector extraction.
// Returns walls + rooms in PDF points (72 DPI). Client converts to feet via calibration.

import { useDrawingsStore } from "@/stores/drawingsStore";
import { useDocumentsStore } from "@/stores/documentsStore";

const VECTOR_API_URL = "https://novaterra-vector-api.onrender.com";

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
  let pdfBase64 = null;

  // Check if drawing.data IS a PDF (not a JPEG)
  if (drawing.data && typeof drawing.data === "string") {
    const d = drawing.data;
    if (d.startsWith("data:application/pdf") || d.startsWith("JVBERi")) {
      pdfBase64 = d;
    }
  }

  // Check drawing-level fields
  if (!pdfBase64 && drawing.sourceFileData) pdfBase64 = drawing.sourceFileData;
  if (!pdfBase64 && drawing.pdfData) pdfBase64 = drawing.pdfData;

  // Check bldg-pdf-raw IDB — the upload pipeline stores raw PDFs here (uploadPipeline.js:156)
  if (!pdfBase64) {
    const fileName = drawing.fileName || drawing.sourceFileName || drawing.name;
    if (fileName) {
      try {
        const { loadPdfRawFromIDB } = await import("@/utils/uploadPipeline");
        const arrayBuffer = await loadPdfRawFromIDB(fileName);
        if (arrayBuffer && arrayBuffer.byteLength > 100) {
          // Convert ArrayBuffer to base64 data URL
          const bytes = new Uint8Array(arrayBuffer);
          const chunks = [];
          const chunkSize = 32768;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
          }
          pdfBase64 = "data:application/pdf;base64," + btoa(chunks.join(""));
          console.log(`[vectorExtractor] Loaded raw PDF from IDB: ${fileName} (${(arrayBuffer.byteLength / 1024).toFixed(0)}KB)`);
        }
      } catch (idbErr) {
        console.warn(`[vectorExtractor] IDB raw PDF lookup failed: ${idbErr.message}`);
      }
    }
  }

  // Check documentsStore — the original PDF is stored as a document
  if (!pdfBase64) {
    const docs = useDocumentsStore.getState().documents || [];
    // Try matching by docId, documentId, or filename
    const parentDoc = docs.find(d =>
      (drawing.docId && d.id === drawing.docId) ||
      (drawing.documentId && d.id === drawing.documentId) ||
      (drawing.sourceDocId && d.id === drawing.sourceDocId) ||
      (drawing.fileName && d.filename === drawing.fileName)
    );
    if (parentDoc?.data) {
      const pd = parentDoc.data;
      if (pd.startsWith("data:application/pdf") || pd.startsWith("JVBERi") || pd.startsWith("data:application/octet")) {
        pdfBase64 = pd;
        console.log(`[vectorExtractor] Found PDF in documentsStore: ${parentDoc.filename || parentDoc.id}`);
      }
    }
  }

  // Download from Supabase Storage if we have a storagePath
  if (!pdfBase64 && drawing.storagePath) {
    console.log(`[vectorExtractor] Downloading PDF from cloud storage: ${drawing.storagePath}`);
    try {
      const { downloadBlob } = await import("@/utils/cloudSync");
      const downloaded = await downloadBlob(drawing.storagePath);
      if (downloaded && (downloaded.startsWith("data:application/pdf") || downloaded.startsWith("data:application/octet"))) {
        pdfBase64 = downloaded;
        console.log(`[vectorExtractor] Downloaded PDF from cloud (${(downloaded.length / 1024).toFixed(0)}KB)`);
      }
    } catch (dlErr) {
      console.warn(`[vectorExtractor] Cloud download failed: ${dlErr.message}`);
    }
  }

  // Also check if the parent document has a storagePath
  if (!pdfBase64) {
    const docs = useDocumentsStore.getState().documents || [];
    const parentDoc = docs.find(d =>
      (drawing.docId && d.id === drawing.docId) ||
      (drawing.documentId && d.id === drawing.documentId) ||
      (drawing.fileName && d.filename === drawing.fileName)
    );
    if (parentDoc?.storagePath && !pdfBase64) {
      console.log(`[vectorExtractor] Downloading parent doc PDF from cloud: ${parentDoc.storagePath}`);
      try {
        const { downloadBlob } = await import("@/utils/cloudSync");
        const downloaded = await downloadBlob(parentDoc.storagePath);
        if (downloaded) {
          pdfBase64 = downloaded;
          console.log(`[vectorExtractor] Downloaded parent doc PDF (${(downloaded.length / 1024).toFixed(0)}KB)`);
        }
      } catch (dlErr) {
        console.warn(`[vectorExtractor] Parent doc download failed: ${dlErr.message}`);
      }
    }
  }

  if (!pdfBase64) {
    throw new Error(`No PDF data available for drawing ${drawingId.slice(0, 8)}. Try re-uploading the drawings.`);
  }

  const pageNum = (drawing.pdfPage || drawing.pageNumber || 1) - 1; // 0-indexed for API

  console.log(`[vectorExtractor] Calling API for ${drawingId.slice(0, 8)}, page ${pageNum + 1}...`);

  const response = await fetch(`${VECTOR_API_URL}/extract`, {
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
