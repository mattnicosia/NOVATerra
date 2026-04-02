/**
 * firstClickTeacher.js — Capture the user's first click/accept as a visual reference.
 *
 * After the user's first measurement or first accepted prediction,
 * this crops a 400×400px region around the click point and stores it.
 * On subsequent Vision calls (same takeoff, same or different sheets),
 * the crop is included as a visual reference image:
 *   "Here is an example of what to look for: [image]"
 *
 * This is a 2-3x accuracy multiplier — instead of NOVA guessing what
 * "2x4 Recessed Troffers" look like, it has an actual crop showing the
 * exact symbol on THIS project's drawings.
 *
 * Session-scoped — crops are lost on page reload (intentional: keeps it
 * fresh per session, prevents stale references from old projects).
 */

// ── Session cache: takeoffId → { base64, description, drawingId, point, capturedAt } ──
const _firstClickCache = new Map();

// Max cache entries (one per takeoff is typical, cap at 20 for safety)
const MAX_CACHE = 20;

/**
 * Capture a first-click example from the drawing canvas.
 *
 * Crops a 400×400px region centered on the click point from the
 * drawing image, draws a red circle at the exact click location,
 * and stores the result for this takeoff.
 *
 * @param {Object} params
 * @param {string} params.takeoffId — The active takeoff ID
 * @param {string} params.description — Takeoff description (e.g., "2x4 Recessed Troffers")
 * @param {Object} params.drawing — Drawing object with .data (base64 JPEG) and .id
 * @param {Object} params.point — Click point { x, y } in drawing pixel coordinates
 * @returns {string|null} — Base64 of the cropped example, or null on failure
 */
export function captureFirstClick({ takeoffId, description, drawing, point }) {
  if (!takeoffId || !drawing?.data || !point) return null;

  // Only capture ONCE per takeoff
  if (_firstClickCache.has(takeoffId)) return _firstClickCache.get(takeoffId).base64;

  try {
    const img = new Image();
    img.src = drawing.data;

    // If image isn't loaded yet, load it synchronously (it's cached in browser)
    if (!img.naturalWidth) {
      console.warn("[firstClickTeacher] Image not loaded — skipping capture");
      return null;
    }

    const CROP_SIZE = 400;
    const HALF = CROP_SIZE / 2;

    // Clamp crop region to image bounds
    const cx = Math.max(HALF, Math.min(img.naturalWidth - HALF, point.x));
    const cy = Math.max(HALF, Math.min(img.naturalHeight - HALF, point.y));

    const canvas = document.createElement("canvas");
    canvas.width = CROP_SIZE;
    canvas.height = CROP_SIZE;
    const ctx = canvas.getContext("2d");

    // Draw the cropped region
    ctx.drawImage(
      img,
      cx - HALF, cy - HALF, CROP_SIZE, CROP_SIZE, // source
      0, 0, CROP_SIZE, CROP_SIZE                   // dest
    );

    // Draw a red circle at the exact click point (center of crop)
    ctx.strokeStyle = "#FF3333";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(HALF, HALF, 20, 0, 2 * Math.PI);
    ctx.stroke();

    // Small red dot at center
    ctx.fillStyle = "#FF3333";
    ctx.beginPath();
    ctx.arc(HALF, HALF, 4, 0, 2 * Math.PI);
    ctx.fill();

    const base64 = canvas.toDataURL("image/jpeg", 0.85);

    // LRU eviction
    if (_firstClickCache.size >= MAX_CACHE) {
      const oldest = _firstClickCache.keys().next().value;
      _firstClickCache.delete(oldest);
    }

    const entry = {
      base64,
      description,
      drawingId: drawing.id,
      point: { x: point.x, y: point.y },
      capturedAt: Date.now(),
    };

    _firstClickCache.set(takeoffId, entry);

    console.log(
      `[firstClickTeacher] ✓ Captured example for "${description}" ` +
      `at (${Math.round(point.x)}, ${Math.round(point.y)}) on ${drawing.id}`
    );

    return base64;
  } catch (err) {
    console.warn("[firstClickTeacher] Capture failed:", err.message);
    return null;
  }
}

/**
 * Capture from a loaded Image element (avoids needing to re-load).
 * Used when the canvas image is already available.
 */
export function captureFromLoadedImage({ takeoffId, description, image, drawingId, point }) {
  if (!takeoffId || !image || !point) return null;
  if (_firstClickCache.has(takeoffId)) return _firstClickCache.get(takeoffId).base64;

  try {
    const CROP_SIZE = 400;
    const HALF = CROP_SIZE / 2;

    const cx = Math.max(HALF, Math.min(image.naturalWidth - HALF, point.x));
    const cy = Math.max(HALF, Math.min(image.naturalHeight - HALF, point.y));

    const canvas = document.createElement("canvas");
    canvas.width = CROP_SIZE;
    canvas.height = CROP_SIZE;
    const ctx = canvas.getContext("2d");

    ctx.drawImage(image, cx - HALF, cy - HALF, CROP_SIZE, CROP_SIZE, 0, 0, CROP_SIZE, CROP_SIZE);

    // Red circle indicator
    ctx.strokeStyle = "#FF3333";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(HALF, HALF, 20, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = "#FF3333";
    ctx.beginPath();
    ctx.arc(HALF, HALF, 4, 0, 2 * Math.PI);
    ctx.fill();

    const base64 = canvas.toDataURL("image/jpeg", 0.85);

    if (_firstClickCache.size >= MAX_CACHE) {
      const oldest = _firstClickCache.keys().next().value;
      _firstClickCache.delete(oldest);
    }

    _firstClickCache.set(takeoffId, {
      base64,
      description,
      drawingId,
      point: { x: point.x, y: point.y },
      capturedAt: Date.now(),
    });

    console.log(
      `[firstClickTeacher] ✓ Captured example for "${description}" ` +
      `at (${Math.round(point.x)}, ${Math.round(point.y)})`
    );

    return base64;
  } catch (err) {
    console.warn("[firstClickTeacher] Capture from image failed:", err.message);
    return null;
  }
}

/**
 * Get the first-click example for a takeoff (if one has been captured).
 *
 * @param {string} takeoffId
 * @returns {{ base64: string, description: string, drawingId: string, point: {x,y} } | null}
 */
export function getFirstClickExample(takeoffId) {
  return _firstClickCache.get(takeoffId) || null;
}

/**
 * Check if we have a first-click example for a takeoff.
 */
export function hasFirstClickExample(takeoffId) {
  return _firstClickCache.has(takeoffId);
}

/**
 * Build Vision API content blocks that include the first-click example.
 * Returns an array of content blocks to prepend to the user message,
 * or empty array if no example exists.
 *
 * @param {string} takeoffId
 * @returns {Array} — Content blocks: [imageBlock, textBlock] or []
 */
export function getFirstClickContentBlocks(takeoffId) {
  const example = _firstClickCache.get(takeoffId);
  if (!example) return [];

  // Import imageBlock dynamically to avoid circular deps
  const { imageBlock } = require("./ai");

  const raw = example.base64.includes(",")
    ? example.base64.split(",")[1]
    : example.base64;

  return [
    imageBlock(raw),
    {
      type: "text",
      text: `REFERENCE IMAGE: This is a cropped example showing exactly what "${example.description}" looks like on this project's drawings. The red circle marks the exact location of one instance. Find ALL other instances of this same symbol/element on the full drawing below.`,
    },
  ];
}

/**
 * Clear first-click cache (call when switching estimates or on cleanup).
 */
export function clearFirstClickCache() {
  _firstClickCache.clear();
}

/**
 * Get cache stats (for debugging).
 */
export function getFirstClickStats() {
  return {
    size: _firstClickCache.size,
    entries: [..._firstClickCache.entries()].map(([id, e]) => ({
      takeoffId: id,
      description: e.description,
      drawingId: e.drawingId,
      age: Date.now() - e.capturedAt,
    })),
  };
}
