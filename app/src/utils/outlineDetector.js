// outlineDetector.js — Detect building outline from plan sheet images using Claude Vision
// Returns building perimeter polygon in feet-space for 3D shell rendering

import { useDrawingsStore } from '@/stores/drawingsStore';
import { callAnthropic, optimizeImageForAI, imageBlock } from '@/utils/ai';
import { getPxPerFoot } from '@/utils/geometryBuilder';

/**
 * Load pdf.js library dynamically (same loader as TakeoffsPage).
 */
const loadPdfJs = () => new Promise((resolve, reject) => {
  if (window.pdfjsLib) { resolve(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  s.onload = () => { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; resolve(); } catch (e) { reject(e); } };
  s.onerror = () => reject(new Error('Failed to load PDF.js'));
  document.head.appendChild(s);
  setTimeout(() => reject(new Error('PDF.js timeout')), 15000);
});

/**
 * Ensure a drawing has a rendered canvas image in pdfCanvases.
 * Renders the PDF page if needed. Returns the base64 image or null.
 * @param {Object} drawing - Drawing object from drawingsStore
 * @returns {Promise<string|null>} Base64 image data URL
 */
export async function ensureDrawingImage(drawing) {
  if (!drawing?.data) return null;

  // Image-type drawings already have data
  if (drawing.type === 'image') return drawing.data;

  // Check if already rendered
  const { pdfCanvases } = useDrawingsStore.getState();
  if (pdfCanvases[drawing.id]) return pdfCanvases[drawing.id];

  // Render the PDF page
  if (drawing.type !== 'pdf') return null;
  try {
    await loadPdfJs();
    const resp = await fetch(`data:application/pdf;base64,${drawing.data}`);
    const buf = await resp.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const pg = await pdf.getPage(drawing.pdfPage || 1);
    const scale = 1.5;
    const vp = pg.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    const url = canvas.toDataURL('image/jpeg', 0.8);
    // Store in drawingsStore so other code can use it
    useDrawingsStore.setState(s => ({ pdfCanvases: { ...s.pdfCanvases, [drawing.id]: url } }));
    return url;
  } catch (e) {
    console.error('ensureDrawingImage:', e);
    return null;
  }
}

const OUTLINE_PROMPT = `Analyze this architectural floor plan image. Your task is to identify the outermost building perimeter — the exterior wall boundary that encloses the entire building footprint.

Rules:
- Trace ONLY the outer building envelope (exterior walls)
- Ignore interior walls, room partitions, and furniture
- Simplify curves into straight segments (20-40 vertices total)
- Return coordinates as pixel positions in the image (origin = top-left)
- Trace clockwise
- Close the polygon (last point connects back to first)

Return ONLY a JSON array of {x, y} objects. No explanation, no markdown fences. Example:
[{"x":120,"y":85},{"x":580,"y":85},{"x":580,"y":420},{"x":120,"y":420}]`;

/**
 * Detect the building outline from a plan drawing using Claude Vision.
 * @param {string} drawingId - Drawing ID from drawingsStore
 * @returns {{ polygon: Array<{x:number,y:number}>, confidence: number, imgWidth: number, imgHeight: number }}
 */
export async function detectBuildingOutline(drawingId) {
  // Get or render the drawing image
  const { drawings } = useDrawingsStore.getState();
  const drawing = drawings.find(d => d.id === drawingId);
  const base64 = await ensureDrawingImage(drawing);
  if (!base64) throw new Error(`No image found for drawing ${drawingId}`);

  // Optimize image for API (max 1200px)
  const dataUrl = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
  const { base64: optimized, width: imgWidth, height: imgHeight } = await optimizeImageForAI(dataUrl, 1200);

  // Call Claude Vision
  const response = await callAnthropic({
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        imageBlock(optimized),
        { type: 'text', text: OUTLINE_PROMPT },
      ],
    }],
    temperature: 0,
  });

  // Parse the JSON response
  const polygon = parsePolygonResponse(response, imgWidth, imgHeight);

  return {
    polygon,
    confidence: polygon.length >= 4 ? 0.8 : 0.4,
    imgWidth,
    imgHeight,
  };
}

/**
 * Parse Claude's response into a validated polygon array.
 */
function parsePolygonResponse(text, imgWidth, imgHeight) {
  // Try to extract JSON array from response
  let jsonStr = text.trim();

  // Strip markdown code fences if present
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  // Find the array in the response using balanced bracket matching
  const startIdx = jsonStr.indexOf('[');
  if (startIdx === -1) throw new Error('No polygon array found in AI response');
  let depth = 0, inStr = false, esc = false, endIdx = -1;
  for (let i = startIdx; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  if (endIdx === -1) throw new Error('No polygon array found in AI response');

  const parsed = JSON.parse(jsonStr.slice(startIdx, endIdx + 1));
  if (!Array.isArray(parsed) || parsed.length < 3) {
    throw new Error(`Invalid polygon: expected ≥3 points, got ${parsed.length}`);
  }

  // Validate and clamp points to image bounds
  const polygon = parsed
    .filter(p => typeof p.x === 'number' && typeof p.y === 'number')
    .map(p => ({
      x: Math.max(0, Math.min(p.x, imgWidth)),
      y: Math.max(0, Math.min(p.y, imgHeight)),
    }));

  if (polygon.length < 3) throw new Error('Too few valid points in polygon');
  return polygon;
}

/**
 * Compute the area of a polygon using the shoelace formula.
 * @param {Array<{x:number, z:number}>} polygon - Vertices in feet-space
 * @returns {number} Area in square feet
 */
export function computePolygonArea(polygon) {
  if (!polygon || polygon.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    area += (polygon[j].x + polygon[i].x) * (polygon[j].z - polygon[i].z);
  }
  return Math.abs(area / 2);
}

/**
 * Convert a pixel-space polygon to feet-space coordinates for Three.js.
 * Uses the same coordinate space as generateElementsFromTakeoffs (raw pixels/ppf)
 * so that coverage grid cells align with building elements.
 * @param {Array<{x:number,y:number}>} polygon - Pixel coordinates
 * @param {string} drawingId - Drawing ID for scale lookup
 * @returns {Array<{x:number,z:number}>} Feet coordinates (same space as elements)
 */
export function outlineToFeet(polygon, drawingId) {
  let ppf = getPxPerFoot(drawingId);

  // Fallback: if no scale set, estimate from image dimensions
  // Assume a typical plan sheet shows ~80ft width at 1200px → ~15 ppf
  if (!ppf) {
    console.warn(`No scale for drawing ${drawingId} — using estimated scale`);
    ppf = 15; // rough fallback so 3D shell is reasonably sized
  }

  // Convert pixels to feet — same transform as geometryBuilder uses for elements
  // Do NOT center at origin, so outline and elements share the same coordinate space
  return polygon.map(p => ({
    x: p.x / ppf,
    z: p.y / ppf, // Drawing Y → 3D Z (depth axis)
  }));
}
