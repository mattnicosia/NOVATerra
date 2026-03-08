// Shared drawing utility functions — used by DocumentsPage and PlanRoomPage
import { SCALE_PRESETS } from "@/constants/scales";
import { loadPdfJs } from "@/utils/pdf";
import { useDrawingsStore } from "@/stores/drawingsStore";

// Convert ArrayBuffer to base64
export const arrayBufferToBase64 = buffer => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
};

// Map AI-detected scale text to our scale key
export const SCALE_MAP = {
  // Architectural
  "1/16\"=1'": "sixteenth",
  "1/16\" = 1'": "sixteenth",
  '1/16"=1\'-0"': "sixteenth",
  '1/16" = 1\'-0"': "sixteenth",
  "1/8\"=1'": "eighth",
  "1/8\" = 1'": "eighth",
  '1/8"=1\'-0"': "eighth",
  '1/8" = 1\'-0"': "eighth",
  "3/16\"=1'": "3/16",
  "3/16\" = 1'": "3/16",
  '3/16"=1\'-0"': "3/16",
  '3/16" = 1\'-0"': "3/16",
  "1/4\"=1'": "quarter",
  "1/4\" = 1'": "quarter",
  '1/4"=1\'-0"': "quarter",
  '1/4" = 1\'-0"': "quarter",
  "3/8\"=1'": "3/8",
  "3/8\" = 1'": "3/8",
  '3/8"=1\'-0"': "3/8",
  '3/8" = 1\'-0"': "3/8",
  "1/2\"=1'": "half",
  "1/2\" = 1'": "half",
  '1/2"=1\'-0"': "half",
  '1/2" = 1\'-0"': "half",
  "3/4\"=1'": "3/4",
  "3/4\" = 1'": "3/4",
  '3/4"=1\'-0"': "3/4",
  '3/4" = 1\'-0"': "3/4",
  "1\"=1'": "full",
  "1\" = 1'": "full",
  '1"=1\'-0"': "full",
  '1" = 1\'-0"': "full",
  "1-1/2\"=1'": "1-1/2",
  "1-1/2\" = 1'": "1-1/2",
  '1-1/2"=1\'-0"': "1-1/2",
  '1-1/2" = 1\'-0"': "1-1/2",
  "3\"=1'": "3",
  "3\" = 1'": "3",
  '3"=1\'-0"': "3",
  '3" = 1\'-0"': "3",
  // Engineering
  "1\"=10'": "eng10",
  "1\" = 10'": "eng10",
  "1\"=20'": "eng20",
  "1\" = 20'": "eng20",
  "1\"=30'": "eng30",
  "1\" = 30'": "eng30",
  "1\"=40'": "eng40",
  "1\" = 40'": "eng40",
  "1\"=50'": "eng50",
  "1\" = 50'": "eng50",
  "1\"=60'": "eng60",
  "1\" = 60'": "eng60",
  "1\"=100'": "eng100",
  "1\" = 100'": "eng100",
  // Metric
  "1:50": "metric_1:50",
  "1:100": "metric_1:100",
  "1:200": "metric_1:200",
  "1:500": "metric_1:500",
};

export function matchScaleKey(scaleText) {
  if (!scaleText) return null;
  const s = scaleText.trim();
  if (SCALE_MAP[s]) return SCALE_MAP[s];
  const norm = s
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2019/g, "'")
    .replace(/\s*=\s*/g, "=")
    .replace(/\s*-\s*/g, "-")
    .trim();
  if (SCALE_MAP[norm]) return SCALE_MAP[norm];
  const spaced = norm.replace(/=/g, " = ");
  if (SCALE_MAP[spaced]) return SCALE_MAP[spaced];
  const lower = norm.toLowerCase();
  for (const [key, val] of Object.entries(SCALE_MAP)) {
    if (key.toLowerCase().replace(/\s/g, "") === lower.replace(/\s/g, "")) return val;
  }
  return null;
}

export function getScaleLabel(key) {
  if (!key) return null;
  for (const group of SCALE_PRESETS) {
    const item = group.items.find(i => i.key === key);
    if (item) return item.label;
  }
  return key;
}

// Render PDF page to canvas data URL (caches in drawingsStore.pdfCanvases)
// Handles both legacy PDF drawings (raw PDF base64) and pre-rendered pages (JPEG).
export async function renderPdfPage(drawing) {
  const currentCanvases = useDrawingsStore.getState().pdfCanvases;
  if (currentCanvases[drawing.id]) return currentCanvases[drawing.id];

  // Pre-rendered PDF page: data is already a JPEG — cache and return directly
  if (drawing.pdfPreRendered && drawing.data) {
    useDrawingsStore.setState(s => ({
      pdfCanvases: { ...s.pdfCanvases, [drawing.id]: drawing.data },
    }));
    return drawing.data;
  }

  if (drawing.type !== "pdf" || !drawing.data) return null;
  try {
    await loadPdfJs();
    const resp = await fetch(`data:application/pdf;base64,${drawing.data}`);
    const buf = await resp.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const pg = await pdf.getPage(drawing.pdfPage || 1);
    const scale = 1.5;
    const vp = pg.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width;
    canvas.height = vp.height;
    await pg.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    const url = canvas.toDataURL("image/jpeg", 0.8);
    useDrawingsStore.setState(s => ({ pdfCanvases: { ...s.pdfCanvases, [drawing.id]: url } }));
    return url;
  } catch (e) {
    console.error("renderPdfPage error:", e);
    return null;
  }
}

// Classify a file as drawing, specification, or general document
export function classifyFile(filename, contentType, size) {
  if (!filename) return "general";
  const lower = filename.toLowerCase();
  const isPdf = contentType === "application/pdf" || lower.endsWith(".pdf");
  const isImage = contentType?.startsWith("image/") || /\.(jpg|jpeg|png|tif|tiff|bmp)$/i.test(lower);
  const isDwg = /\.(dwg|dxf|dwf|rvt|ifc)$/i.test(lower);

  // Drawing patterns — common construction drawing file naming
  const drawingPatterns = [
    /drawings?/i,
    /plans?[.\s_-]/i,
    /sheets?/i,
    // Standard discipline prefix patterns: A-100, S-200, M-001, E-100, P-100, L-001, C-001
    /^[ASMEPL]-\d/i,
    /[_\s][ASMEPL]-?\d{2,}/i,
    // Discipline names
    /architectural/i,
    /structural/i,
    /mechanical/i,
    /electrical/i,
    /plumbing/i,
    /civil/i,
    /landscape/i,
    /fire\s*protection/i,
    /telecom/i,
    // Drawing types
    /elevation/i,
    /detail/i,
    /section/i,
    /floor\s*plan/i,
    /reflected\s*ceiling/i,
    /site\s*plan/i,
    /roof\s*plan/i,
    /foundation/i,
    /framing/i,
    /demolition/i,
    /demo\s*plan/i,
    /grading/i,
    /utility/i,
    /enlarged/i,
    /typical/i,
    /keynote/i,
    /schedule/i,
    // File naming conventions
    /blueprint/i,
    /construction\s*doc/i,
    /CD[\s_-]?set/i,
    /permit\s*set/i,
    /bid\s*set/i,
    /IFC[\s_-]?set/i,
    /[_-]DWG/i,
    /[_-]PLN/i,
  ];

  // RFP / Invitation to Bid patterns — highest priority for bid info extraction
  const rfpPatterns = [
    /rfp/i,
    /rfi/i,
    /invitation\s*(to|for)\s*bid/i,
    /ITB/i,
    /request\s*(for|to)\s*(proposal|qualif|bid)/i,
    /bid\s*package/i,
    /bid\s*invitation/i,
    /bid\s*notice/i,
    /solicitation/i,
    /procurement/i,
    /pre[\s-]*bid/i,
    /notice\s*to\s*(bidders?|contractors?)/i,
    /instructions?\s*to\s*bidders?/i,
  ];

  // Spec patterns
  const specPatterns = [
    /spec/i,
    /project\s*manual/i,
    /division/i,
    /csi/i,
    /technical\s*spec/i,
    /bid\s*doc/i,
    /^0[0-9]\s/,
    /addend/i,
    /general\s*conditions/i,
    /supplementary/i,
    /^section\s*\d/i,
    /bid\s*form/i,
    /proposal\s*form/i,
    /geotechnical/i,
    /soils?\s*report/i,
    /environmental/i,
  ];

  // Images and CAD files → drawing
  if (isImage || isDwg) return "drawing";
  if (isPdf) {
    // Check RFP first — these contain bid requirements
    if (rfpPatterns.some(p => p.test(lower))) return "rfp";
    if (drawingPatterns.some(p => p.test(lower))) return "drawing";
    if (specPatterns.some(p => p.test(lower))) return "specification";
    // Large PDFs (>2MB) are almost always drawing sets in construction.
    // AI classification will refine this if needed, but defaulting to "drawing"
    // ensures the extraction pipeline runs rather than silently skipping.
    if (size && size > 2 * 1024 * 1024) return "drawing";
  }
  return "general";
}

// Check for duplicate filename in documents store
export function isDuplicateFile(filename, documents) {
  if (!filename || !documents) return false;
  return documents.some(d => d.filename === filename);
}
