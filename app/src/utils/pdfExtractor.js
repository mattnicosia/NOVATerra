// ══════════════════════════════════════════════════════════════════════
// PDF Extraction Engine — extracts text + vector geometry from CAD PDFs
// Foundation for auto/predictive takeoffs
// ══════════════════════════════════════════════════════════════════════

import { loadPdfJs } from "./pdf";

// ── Cache (per drawing ID) ──────────────────────────────────────────
const cache = new Map();

// ── External schedule regions (injected by scan system) ────────────
const _externalScheduleRegions = new Map(); // drawingId → regions[]

/**
 * Register schedule regions detected by the scan system (AI Vision).
 * Merges into cached extraction data if available.
 */
export function registerExternalScheduleRegions(drawingId, regions) {
  if (!regions || regions.length === 0) return;
  _externalScheduleRegions.set(drawingId, regions);
  // Merge into cached data if it exists
  if (cache.has(drawingId)) {
    const cached = cache.get(drawingId);
    cached.scheduleRegions = mergeScheduleRegions(cached.scheduleRegions || [], regions);
  }
}

/**
 * Get all schedule regions for a drawing (detected + external).
 */
export function getScheduleRegions(drawingId) {
  const cached = cache.get(drawingId);
  const detected = cached?.scheduleRegions || [];
  const external = _externalScheduleRegions.get(drawingId) || [];
  if (external.length === 0) return detected;
  return mergeScheduleRegions(detected, external);
}

// Merge two region arrays, deduplicating overlapping regions
function mergeScheduleRegions(a, b) {
  const merged = [...a];
  for (const reg of b) {
    const alreadyCovered = merged.some(
      r => reg.minX >= r.minX - 20 && reg.maxX <= r.maxX + 20 && reg.minY >= r.minY - 20 && reg.maxY <= r.maxY + 20,
    );
    if (!alreadyCovered) merged.push(reg);
  }
  return merged;
}

// ── Matrix math helpers ─────────────────────────────────────────────
const identityMatrix = () => [1, 0, 0, 1, 0, 0];

function multiplyMatrix(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1], // a
    a[1] * b[0] + a[3] * b[1], // b
    a[0] * b[2] + a[2] * b[3], // c
    a[1] * b[2] + a[3] * b[3], // d
    a[0] * b[4] + a[2] * b[5] + a[4], // e
    a[1] * b[4] + a[3] * b[5] + a[5], // f
  ];
}

function applyMatrix(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

// ── Load a PDF page from a drawing object ───────────────────────────
// Returns null for pdfPreRendered drawings (data is JPEG, not raw PDF).
async function loadPage(drawing) {
  // Pre-rendered pages don't have raw PDF data — can't extract text/vectors
  if (drawing.pdfPreRendered) return null;
  await loadPdfJs();
  const resp = await fetch(`data:application/pdf;base64,${drawing.data}`);
  const buf = await resp.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const page = await pdf.getPage(drawing.pdfPage || 1);
  const viewport = page.getViewport({ scale: 1.5 });
  return { page, viewport, pdf };
}

// ══════════════════════════════════════════════════════════════════════
// TEXT EXTRACTION — precise (x,y) positions from embedded PDF text
// ══════════════════════════════════════════════════════════════════════
export async function extractText(drawing) {
  const loaded = await loadPage(drawing);
  if (!loaded) return []; // pdfPreRendered — no raw PDF for text extraction
  const { page, viewport } = loaded;
  const textContent = await page.getTextContent();
  const items = [];

  for (const item of textContent.items) {
    if (!item.str || !item.str.trim()) continue;

    const tx = item.transform; // [a, b, c, d, x, y] in PDF coords

    // Convert PDF position to canvas coordinates using viewport transform
    const [canvasX, canvasY] = window.pdfjsLib.Util.transform(viewport.transform, [tx[4], tx[5]]) || [0, 0];

    // Calculate rotation from transform matrix
    const angle = Math.atan2(tx[1], tx[0]) * (180 / Math.PI);

    // Font size from transform (approximate from vertical scale)
    const fontSize = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]) || Math.abs(tx[0]);

    items.push({
      text: item.str.trim(),
      // PDF coordinates (original)
      pdfX: tx[4],
      pdfY: tx[5],
      // Canvas coordinates (for rendering overlays)
      x: canvasX,
      y: canvasY,
      width: item.width * viewport.scale,
      height: item.height * viewport.scale || fontSize * viewport.scale,
      fontSize: fontSize * viewport.scale,
      rotation: Math.round(angle * 10) / 10,
    });
  }

  return items;
}

// ══════════════════════════════════════════════════════════════════════
// VECTOR EXTRACTION — line segments from PDF vector paths
// Used for wall detection, room boundaries, structural elements
// ══════════════════════════════════════════════════════════════════════
export async function extractVectors(drawing) {
  const loaded = await loadPage(drawing);
  if (!loaded) return { lines: [], rects: [] }; // pdfPreRendered — no raw PDF for vector extraction
  const { page, viewport } = loaded;
  const ops = await page.getOperatorList();
  const OPS = window.pdfjsLib.OPS;

  const lines = [];
  const rects = [];
  const ctmStack = [];
  let ctm = [...viewport.transform]; // Start with viewport transform to get canvas coords
  let currentPath = [];
  let lineWidth = 1;

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];

    switch (fn) {
      case OPS.save:
        ctmStack.push([...ctm]);
        break;

      case OPS.restore:
        if (ctmStack.length > 0) ctm = ctmStack.pop();
        break;

      case OPS.transform:
        ctm = multiplyMatrix(ctm, args);
        break;

      case OPS.setLineWidth:
        lineWidth = args[0];
        break;

      case OPS.constructPath: {
        const subOps = args[0]; // Array of sub-operation codes
        const subArgs = args[1]; // Flat array of coordinates
        let argIdx = 0;
        let cx = 0,
          cy = 0; // Current point in PDF coords
        let pathStart = null;

        for (let j = 0; j < subOps.length; j++) {
          const op = subOps[j];

          if (op === OPS.moveTo) {
            cx = subArgs[argIdx++];
            cy = subArgs[argIdx++];
            pathStart = { x: cx, y: cy };
            const [canvasX, canvasY] = applyMatrix(ctm, cx, cy);
            currentPath.push({ type: "M", x: canvasX, y: canvasY, pdfX: cx, pdfY: cy });
          } else if (op === OPS.lineTo) {
            const prevX = cx,
              prevY = cy;
            cx = subArgs[argIdx++];
            cy = subArgs[argIdx++];
            const [x1, y1] = applyMatrix(ctm, prevX, prevY);
            const [x2, y2] = applyMatrix(ctm, cx, cy);
            const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
            if (len > 2) {
              // Filter noise (< 2px)
              lines.push({ x1, y1, x2, y2, lineWidth, length: len });
            }
            currentPath.push({ type: "L", x: x2, y: y2, pdfX: cx, pdfY: cy });
          } else if (op === OPS.curveTo) {
            // Skip bezier details, just consume args and track endpoint
            argIdx += 4; // cp1x, cp1y, cp2x, cp2y
            cx = subArgs[argIdx++];
            cy = subArgs[argIdx++];
            const [canvasX, canvasY] = applyMatrix(ctm, cx, cy);
            currentPath.push({ type: "C", x: canvasX, y: canvasY, pdfX: cx, pdfY: cy });
          } else if (op === OPS.rectangle) {
            const rx = subArgs[argIdx++];
            const ry = subArgs[argIdx++];
            const rw = subArgs[argIdx++];
            const rh = subArgs[argIdx++];
            const [x1, y1] = applyMatrix(ctm, rx, ry);
            const [x2, y2] = applyMatrix(ctm, rx + rw, ry);
            const [x3, y3] = applyMatrix(ctm, rx + rw, ry + rh);
            const [x4, y4] = applyMatrix(ctm, rx, ry + rh);
            const w = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
            const h = Math.sqrt((x3 - x2) ** 2 + (y3 - y2) ** 2);
            if (w > 2 && h > 2) {
              rects.push({ x1, y1, x2, y2, x3, y3, x4, y4, width: w, height: h, lineWidth });
            }
            cx = rx;
            cy = ry;
          } else if (op === OPS.closePath) {
            if (pathStart && currentPath.length > 1) {
              const last = currentPath[currentPath.length - 1];
              const first = currentPath[0];
              const len = Math.sqrt((first.x - last.x) ** 2 + (first.y - last.y) ** 2);
              if (len > 2) {
                lines.push({ x1: last.x, y1: last.y, x2: first.x, y2: first.y, lineWidth, length: len });
              }
            }
            currentPath = [];
          }
        }
        break;
      }

      case OPS.stroke:
      case OPS.fill:
      case OPS.eoFill:
      case OPS.fillStroke:
      case OPS.eoFillStroke:
        // Path has been rendered, reset current path
        currentPath = [];
        break;
    }
  }

  return { lines, rects };
}

// ══════════════════════════════════════════════════════════════════════
// FULL PAGE EXTRACTION — text + vectors, cached per drawing
// ══════════════════════════════════════════════════════════════════════
export async function extractPageData(drawing) {
  if (cache.has(drawing.id)) return cache.get(drawing.id);

  const [text, vectors] = await Promise.all([extractText(drawing), extractVectors(drawing)]);

  const result = {
    drawingId: drawing.id,
    text,
    lines: vectors.lines,
    rects: vectors.rects,
    extractedAt: Date.now(),
    stats: {
      textItems: text.length,
      lineSegments: vectors.lines.length,
      rectangles: vectors.rects.length,
    },
  };

  // Pre-compute schedule regions so downstream code doesn't re-detect every call
  result.scheduleRegions = detectScheduleRegions(result);

  cache.set(drawing.id, result);
  return result;
}

// ── Invalidate cache for a drawing ──────────────────────────────────
export function invalidateCache(drawingId) {
  if (drawingId) cache.delete(drawingId);
  else cache.clear();
}

// ── Check if a drawing has been extracted ────────────────────────────
export function isExtracted(drawingId) {
  return cache.has(drawingId);
}

// ══════════════════════════════════════════════════════════════════════
// TAG DETECTION — identify construction tags in extracted text
// ══════════════════════════════════════════════════════════════════════

// Common construction tag patterns:
// Wall types: "0A", "1A", "2B", "EW-1", "IW-3", "IW-3A", "EW-1B", "W1", "W2A"
// Fixture types: "1A", "2B", "A1", "F1", "L-1", "P-1"
// Door types: "D1", "D2", "D-101", "D201"
// Window types: "W1", "W-1", "W101"
// Room/area: "RM-1", "RM-1A", "BR", "2BR"
const TAG_PATTERN = /^[A-Z0-9]{1,3}[-.]?[A-Z0-9]{0,4}$/i;

// Detect if a text item looks like a construction tag (short, alphanumeric)
export function isLikelyTag(text) {
  const t = text.trim();
  if (t.length < 1 || t.length > 8) return false;
  if (/^\d+['-]/.test(t)) return false; // Dimensions like 12'-6"
  if (/^\d+$/.test(t) && t.length > 3) return false; // Long numbers
  if (/^[A-Z]{4,}$/i.test(t)) return false; // Long words
  return TAG_PATTERN.test(t);
}

// Find the nearest tag text to a canvas point
export function findNearestTag(extractedData, canvasX, canvasY, maxRadius = 100) {
  if (!extractedData?.text) return null;

  let nearest = null;
  let nearestDist = maxRadius;

  for (const item of extractedData.text) {
    if (!isLikelyTag(item.text)) continue;
    const dx = item.x - canvasX;
    const dy = item.y - canvasY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = { ...item, distance: dist };
    }
  }

  return nearest;
}

// Find short text items (1-4 chars) near a position — used for differentiator detection
// e.g., "D" for Duplex, "S" for Single near a "2BR" tag
export function findAdjacentText(extractedData, x, y, maxRadius = 80) {
  if (!extractedData?.text) return [];

  return extractedData.text
    .filter(item => {
      const t = item.text.trim();
      if (t.length < 1 || t.length > 4) return false;
      // Skip items that are themselves tags (handled separately)
      if (isLikelyTag(t) && t.length > 2) return false;
      const dx = item.x - x;
      const dy = item.y - y;
      return Math.sqrt(dx * dx + dy * dy) < maxRadius;
    })
    .map(item => ({
      text: item.text.trim(),
      x: item.x,
      y: item.y,
      distance: Math.sqrt((item.x - x) ** 2 + (item.y - y) ** 2),
    }))
    .sort((a, b) => a.distance - b.distance);
}

// Find ALL instances of a specific tag on the page
export function findAllTagInstances(extractedData, tag) {
  if (!extractedData?.text || !tag) return [];

  const normalizedTag = tag.trim().toUpperCase();
  const instances = [];

  for (const item of extractedData.text) {
    if (item.text.trim().toUpperCase() === normalizedTag) {
      instances.push({ ...item });
    }
  }

  return instances;
}

// ══════════════════════════════════════════════════════════════════════
// SCHEDULE/LEGEND REGION DETECTION
// Two detection strategies:
//   1. Rectangle-based: schedules typically have bordered table cells (very reliable)
//   2. Text-density-based: fallback for unbordered schedules (keyword + dense rows)
// ══════════════════════════════════════════════════════════════════════
// Keywords that indicate a schedule/legend header row
const SCHEDULE_KEYWORDS =
  /\b(SCHEDULE|FINISH|MATERIAL|LEGEND|KEY|NOTES|SPECIFICATIONS?|ABBREVIATIONS?|TYPE|MARK|SIZE|DESCRIPTION|MANUFACTURER|MODEL|QUANTITY|QTY|REMARKS?|HEIGHT|WIDTH|THICKNESS|RATING)\b/i;

export function detectScheduleRegions(extractedData) {
  if (!extractedData?.text || extractedData.text.length === 0) return [];

  const regions = [];
  const pad = 30; // padding around detected regions

  // ── Strategy 1: Rectangle-based detection (high confidence) ──
  // Schedules have dense grids of rectangles at consistent spacing.
  // Look for clusters of aligned rectangles that form table cells.
  if (extractedData.rects && extractedData.rects.length > 0) {
    // Find rectangles that are table-cell-sized (not tiny dots or huge page borders)
    const tableCells = extractedData.rects.filter(r => {
      const w = r.width,
        h = r.height;
      return w > 20 && w < 800 && h > 8 && h < 200;
    });

    if (tableCells.length >= 3) {
      // Cluster rectangles by proximity — overlapping or adjacent rects = same table
      const cellBounds = tableCells.map(r => ({
        minX: Math.min(r.x1, r.x2, r.x3, r.x4),
        minY: Math.min(r.y1, r.y2, r.y3, r.y4),
        maxX: Math.max(r.x1, r.x2, r.x3, r.x4),
        maxY: Math.max(r.y1, r.y2, r.y3, r.y4),
      }));

      // Simple greedy clustering: merge overlapping/adjacent bounds
      const clusters = [];
      const used = new Set();

      for (let i = 0; i < cellBounds.length; i++) {
        if (used.has(i)) continue;
        let cluster = { ...cellBounds[i] };
        used.add(i);
        let changed = true;

        while (changed) {
          changed = false;
          for (let j = 0; j < cellBounds.length; j++) {
            if (used.has(j)) continue;
            const b = cellBounds[j];
            // Check overlap or adjacency (within 5px gap)
            const gap = 5;
            if (
              b.minX <= cluster.maxX + gap &&
              b.maxX >= cluster.minX - gap &&
              b.minY <= cluster.maxY + gap &&
              b.maxY >= cluster.minY - gap
            ) {
              cluster.minX = Math.min(cluster.minX, b.minX);
              cluster.minY = Math.min(cluster.minY, b.minY);
              cluster.maxX = Math.max(cluster.maxX, b.maxX);
              cluster.maxY = Math.max(cluster.maxY, b.maxY);
              used.add(j);
              changed = true;
            }
          }
        }

        // Count how many original cells are in this cluster
        const cellCount = cellBounds.filter(
          (b, idx) =>
            used.has(idx) &&
            b.minX >= cluster.minX - 5 &&
            b.maxX <= cluster.maxX + 5 &&
            b.minY >= cluster.minY - 5 &&
            b.maxY <= cluster.maxY + 5,
        ).length;

        // A table needs at least 3 cells in a cluster
        if (cellCount >= 3) {
          clusters.push(cluster);
        }
      }

      // Check each cluster: does it contain schedule keywords?
      for (const cluster of clusters) {
        const textsInCluster = extractedData.text.filter(
          t =>
            t.x >= cluster.minX - 10 &&
            t.x <= cluster.maxX + 10 &&
            t.y >= cluster.minY - 10 &&
            t.y <= cluster.maxY + 10,
        );
        const clusterText = textsInCluster.map(t => t.text).join(" ");
        // Rectangle cluster with keywords = definite schedule
        // Rectangle cluster with 8+ text items = probable schedule even without keywords
        if (SCHEDULE_KEYWORDS.test(clusterText) || textsInCluster.length >= 8) {
          regions.push({
            minX: cluster.minX - pad,
            minY: cluster.minY - pad,
            maxX: cluster.maxX + pad,
            maxY: cluster.maxY + pad,
          });
        }
      }
    }
  }

  // ── Strategy 2: Text-density-based detection (fallback) ──
  // Group text items by approximate Y position (rows)
  const rowTolerance = 8; // px
  const rows = [];
  const sorted = [...extractedData.text].sort((a, b) => a.y - b.y);

  let currentRow = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - currentRow[0].y) < rowTolerance) {
      currentRow.push(sorted[i]);
    } else {
      if (currentRow.length >= 2) rows.push(currentRow);
      currentRow = [sorted[i]];
    }
  }
  if (currentRow.length >= 2) rows.push(currentRow);

  // Mark rows that contain schedule-related keywords
  const keywordRows = new Set();
  for (let i = 0; i < rows.length; i++) {
    const rowText = rows[i].map(t => t.text).join(" ");
    if (SCHEDULE_KEYWORDS.test(rowText)) {
      for (let j = Math.max(0, i - 1); j < Math.min(rows.length, i + 8); j++) {
        keywordRows.add(j);
      }
    }
  }

  // Find clusters of consecutive dense rows — require keyword anchor OR 5+ consecutive dense rows
  let regionStart = null;
  let hasKeyword = false;

  for (let i = 0; i < rows.length; i++) {
    const isDense = rows[i].length >= 3; // Require 3+ items per row for schedule detection
    const isKeywordMarked = keywordRows.has(i);
    if (isDense || isKeywordMarked) {
      if (regionStart === null) regionStart = i;
      if (isKeywordMarked) hasKeyword = true;
    } else {
      if (regionStart !== null) {
        const rowCount = i - regionStart;
        // Require keyword anchor for shorter regions, or 4+ rows without keyword
        if ((hasKeyword && rowCount >= 2) || rowCount >= 4) {
          const regionRows = rows.slice(regionStart, i);
          const allItems = regionRows.flat();
          const candidate = {
            minX: Math.min(...allItems.map(t => t.x)) - pad,
            minY: Math.min(...allItems.map(t => t.y)) - pad,
            maxX: Math.max(...allItems.map(t => t.x + (t.width || 50))) + pad,
            maxY: Math.max(...allItems.map(t => t.y + (t.height || 15))) + pad,
          };
          // Don't add if already covered by a rectangle-detected region
          const alreadyCovered = regions.some(
            r =>
              candidate.minX >= r.minX &&
              candidate.maxX <= r.maxX &&
              candidate.minY >= r.minY &&
              candidate.maxY <= r.maxY,
          );
          if (!alreadyCovered) regions.push(candidate);
        }
      }
      regionStart = null;
      hasKeyword = false;
    }
  }

  // Handle trailing region
  if (regionStart !== null) {
    const rowCount = rows.length - regionStart;
    if ((hasKeyword && rowCount >= 2) || rowCount >= 4) {
      const regionRows = rows.slice(regionStart);
      const allItems = regionRows.flat();
      const candidate = {
        minX: Math.min(...allItems.map(t => t.x)) - pad,
        minY: Math.min(...allItems.map(t => t.y)) - pad,
        maxX: Math.max(...allItems.map(t => t.x + (t.width || 50))) + pad,
        maxY: Math.max(...allItems.map(t => t.y + (t.height || 15))) + pad,
      };
      const alreadyCovered = regions.some(
        r =>
          candidate.minX >= r.minX && candidate.maxX <= r.maxX && candidate.minY >= r.minY && candidate.maxY <= r.maxY,
      );
      if (!alreadyCovered) regions.push(candidate);
    }
  }

  return regions;
}

// Check if a point is inside a schedule region
export function isInScheduleRegion(x, y, regions) {
  return regions.some(r => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY);
}

// Find tag instances, excluding schedule/legend regions
export function findPlanTagInstances(extractedData, tag) {
  const allInstances = findAllTagInstances(extractedData, tag);
  // Use pre-computed schedule regions from extractPageData when available
  const scheduleRegions = extractedData.scheduleRegions || detectScheduleRegions(extractedData);
  return allInstances.filter(inst => !isInScheduleRegion(inst.x, inst.y, scheduleRegions));
}
