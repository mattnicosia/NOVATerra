// vectorWallDetector.js — Wall and room detection from PDF vector paths
// Uses extractVectors() output (line segments with lineWidth) instead of pixel-based CV.
// Zero AI. Zero rasterization. Pure geometry from the PDF vector data.
//
// Pipeline:
//   extractVectors() → classifyLines() → mergeWallSegments() → detectRooms()

import { getPxPerFoot } from "@/utils/geometryBuilder";

// ── Configuration ──
const DEFAULTS = {
  minWallLengthPx: 20,       // Minimum wall segment length in pixels
  gapTolerance: 12,          // Max gap (px) to merge collinear segments
  angleTolerance: 2,         // Degrees tolerance for collinear check
  titleBlockMargin: 0.08,    // Ignore outer 8% of sheet (title block)
  roomGridSize: 4,           // Flood-fill grid cell size in pixels
};

// ── Adaptive line weight threshold ──
// Residential drawings often use 0pt hairlines for walls.
// Commercial drawings use 0.8pt+ for walls.
function getWallThreshold(lines) {
  if (!lines.length) return 0.8;
  const weights = lines.map(l => l.lineWidth).filter(w => w >= 0);
  if (!weights.length) return 0.8;

  const sorted = [...new Set(weights)].sort((a, b) => a - b);
  const lightest = sorted[0] || 0;

  // Count how many lines use the lightest weight
  const lightCount = weights.filter(w => w === lightest).length;
  const lightRatio = lightCount / weights.length;

  // If lightest weight dominates (>40%), it's likely residential with hairline walls
  if (lightRatio > 0.4 && lightest < 0.5) {
    return lightest; // Include hairlines as potential walls
  }
  return 0.7; // Commercial standard — walls are 0.8pt+
}

// ── Step 1: Classify lines by weight ──
export function classifyLines(lines, pageWidth, pageHeight, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const threshold = getWallThreshold(lines);

  const marginX = pageWidth * cfg.titleBlockMargin;
  const marginY = pageHeight * cfg.titleBlockMargin;

  const walls = [];
  const annotations = [];
  const heavy = [];

  for (const line of lines) {
    const { x1, y1, x2, y2, lineWidth, length } = line;

    // Skip tiny segments
    if (length < cfg.minWallLengthPx) continue;

    // Skip lines in title block margins
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    if (midX < marginX || midX > pageWidth - marginX ||
        midY < marginY || midY > pageHeight - marginY) {
      continue;
    }

    // Classify by line weight
    if (lineWidth >= threshold * 2) {
      heavy.push(line); // Building outline / section cuts
      walls.push(line); // Also include as walls
    } else if (lineWidth >= threshold) {
      walls.push(line); // Standard walls
    } else {
      annotations.push(line); // Dimensions, grids, hatching
    }
  }

  return {
    walls,
    heavy,
    annotations,
    threshold,
    mode: threshold < 0.5 ? "residential" : "commercial",
    stats: {
      total: lines.length,
      wallCount: walls.length,
      heavyCount: heavy.length,
      annotationCount: annotations.length,
    },
  };
}

// ── Step 2: Merge collinear wall segments ──
export function mergeWallSegments(walls, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  if (!walls.length) return [];

  // Calculate angle for each segment
  const segments = walls.map(w => ({
    ...w,
    angle: Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180 / Math.PI,
  }));

  // Group by angle (within tolerance)
  const groups = [];
  const used = new Set();

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;
    const group = [segments[i]];
    used.add(i);

    for (let j = i + 1; j < segments.length; j++) {
      if (used.has(j)) continue;
      const angleDiff = Math.abs(segments[i].angle - segments[j].angle);
      const normalizedDiff = Math.min(angleDiff, 180 - angleDiff);

      if (normalizedDiff <= cfg.angleTolerance) {
        // Check if collinear (project onto shared axis, check distance)
        const dist = pointToLineDistance(
          (segments[j].x1 + segments[j].x2) / 2,
          (segments[j].y1 + segments[j].y2) / 2,
          segments[i].x1, segments[i].y1,
          segments[i].x2, segments[i].y2
        );
        if (dist < cfg.gapTolerance) {
          group.push(segments[j]);
          used.add(j);
        }
      }
    }
    groups.push(group);
  }

  // Merge each group into a single segment (extend to full span)
  const merged = [];
  for (const group of groups) {
    if (group.length === 0) continue;

    const avgAngle = group[0].angle;
    const isHorizontal = Math.abs(avgAngle) < 45 || Math.abs(avgAngle) > 135;

    if (isHorizontal) {
      const minX = Math.min(...group.map(g => Math.min(g.x1, g.x2)));
      const maxX = Math.max(...group.map(g => Math.max(g.x1, g.x2)));
      const avgY = group.reduce((s, g) => s + (g.y1 + g.y2) / 2, 0) / group.length;
      const avgWeight = group.reduce((s, g) => s + g.lineWidth, 0) / group.length;
      const length = maxX - minX;
      if (length > 0) {
        merged.push({
          x1: minX, y1: avgY, x2: maxX, y2: avgY,
          lineWidth: avgWeight, length,
          segmentCount: group.length,
        });
      }
    } else {
      const minY = Math.min(...group.map(g => Math.min(g.y1, g.y2)));
      const maxY = Math.max(...group.map(g => Math.max(g.y1, g.y2)));
      const avgX = group.reduce((s, g) => s + (g.x1 + g.x2) / 2, 0) / group.length;
      const avgWeight = group.reduce((s, g) => s + g.lineWidth, 0) / group.length;
      const length = maxY - minY;
      if (length > 0) {
        merged.push({
          x1: avgX, y1: minY, x2: avgX, y2: maxY,
          lineWidth: avgWeight, length,
          segmentCount: group.length,
        });
      }
    }
  }

  return merged;
}

// ── Step 3: Detect rooms via flood fill ──
export function detectRooms(mergedWalls, pageWidth, pageHeight, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const gridSize = cfg.roomGridSize;
  const gridW = Math.ceil(pageWidth / gridSize);
  const gridH = Math.ceil(pageHeight / gridSize);

  // Rasterize walls onto grid
  const grid = new Uint8Array(gridW * gridH); // 0 = empty, 1 = wall

  for (const wall of mergedWalls) {
    rasterizeLine(grid, gridW, gridH, gridSize,
      wall.x1, wall.y1, wall.x2, wall.y2,
      Math.max(1, Math.round(wall.lineWidth / gridSize) + 1));
  }

  // Flood fill from edges to mark exterior
  const EXTERIOR = 2;
  const visited = new Uint8Array(gridW * gridH);

  // Fill from all edges
  const queue = [];
  for (let x = 0; x < gridW; x++) {
    if (!grid[x]) queue.push(x); // Top edge
    const bottomIdx = (gridH - 1) * gridW + x;
    if (!grid[bottomIdx]) queue.push(bottomIdx);
  }
  for (let y = 0; y < gridH; y++) {
    const leftIdx = y * gridW;
    if (!grid[leftIdx]) queue.push(leftIdx);
    const rightIdx = y * gridW + gridW - 1;
    if (!grid[rightIdx]) queue.push(rightIdx);
  }

  // BFS flood fill exterior
  for (const idx of queue) visited[idx] = EXTERIOR;
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % gridW;
    const y = Math.floor(idx / gridW);

    const neighbors = [
      y > 0 ? idx - gridW : -1,
      y < gridH - 1 ? idx + gridW : -1,
      x > 0 ? idx - 1 : -1,
      x < gridW - 1 ? idx + 1 : -1,
    ];

    for (const n of neighbors) {
      if (n >= 0 && !grid[n] && !visited[n]) {
        visited[n] = EXTERIOR;
        queue.push(n);
      }
    }
  }

  // Find interior regions (not wall, not exterior)
  const rooms = [];
  const ROOM_BASE = 10;
  let roomId = ROOM_BASE;

  for (let i = 0; i < grid.length; i++) {
    if (grid[i] || visited[i]) continue;

    // New room — flood fill
    const roomCells = [];
    const rq = [i];
    visited[i] = roomId;

    let rHead = 0;
    while (rHead < rq.length) {
      const idx = rq[rHead++];
      roomCells.push(idx);
      const x = idx % gridW;
      const y = Math.floor(idx / gridW);

      const neighbors = [
        y > 0 ? idx - gridW : -1,
        y < gridH - 1 ? idx + gridW : -1,
        x > 0 ? idx - 1 : -1,
        x < gridW - 1 ? idx + 1 : -1,
      ];

      for (const n of neighbors) {
        if (n >= 0 && !grid[n] && !visited[n]) {
          visited[n] = roomId;
          rq.push(n);
        }
      }
    }

    // Skip tiny regions (< 16 cells = < 1 sq ft at typical scale)
    if (roomCells.length < 16) continue;

    // Compute bounding polygon (simplified: axis-aligned bounding box)
    let minX = gridW, maxX = 0, minY = gridH, maxY = 0;
    for (const idx of roomCells) {
      const x = idx % gridW;
      const y = Math.floor(idx / gridW);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    // Convert grid coords back to pixel coords
    const pxMinX = minX * gridSize;
    const pxMaxX = (maxX + 1) * gridSize;
    const pxMinY = minY * gridSize;
    const pxMaxY = (maxY + 1) * gridSize;

    const areaPx = roomCells.length * gridSize * gridSize;
    const centroidX = (pxMinX + pxMaxX) / 2;
    const centroidY = (pxMinY + pxMaxY) / 2;

    rooms.push({
      id: `room-${roomId - ROOM_BASE}`,
      polygon: [
        { x: pxMinX, y: pxMinY },
        { x: pxMaxX, y: pxMinY },
        { x: pxMaxX, y: pxMaxY },
        { x: pxMinX, y: pxMaxY },
      ],
      areaPx,
      centroid: { x: centroidX, y: centroidY },
      cellCount: roomCells.length,
      bounds: { minX: pxMinX, maxX: pxMaxX, minY: pxMinY, maxY: pxMaxY },
    });

    roomId++;
  }

  return rooms;
}

// ── Step 4: Label rooms from text blocks ──
export function labelRooms(rooms, textBlocks) {
  if (!textBlocks?.length || !rooms?.length) return rooms;

  return rooms.map(room => {
    // Find text block whose center falls inside the room bounds
    const label = textBlocks.find(t => {
      const tx = (t.x1 + t.x2) / 2;
      const ty = (t.y1 + t.y2) / 2;
      return tx >= room.bounds.minX && tx <= room.bounds.maxX &&
             ty >= room.bounds.minY && ty <= room.bounds.maxY;
    });

    return {
      ...room,
      label: label?.text?.trim() || null,
    };
  });
}

// ── Full pipeline: extractVectors output → structured building data ──
export function analyzeFloorPlan(extractedData, drawingId) {
  const { lines, text } = extractedData;
  if (!lines?.length) return null;

  const ppf = getPxPerFoot(drawingId);

  // Get page dimensions from line extents
  const allX = lines.flatMap(l => [l.x1, l.x2]);
  const allY = lines.flatMap(l => [l.y1, l.y2]);
  const pageWidth = Math.max(...allX) - Math.min(...allX) + 50;
  const pageHeight = Math.max(...allY) - Math.min(...allY) + 50;
  const offsetX = Math.min(...allX) - 25;
  const offsetY = Math.min(...allY) - 25;

  // Normalize coordinates to 0-based
  const normalizedLines = lines.map(l => ({
    ...l,
    x1: l.x1 - offsetX, y1: l.y1 - offsetY,
    x2: l.x2 - offsetX, y2: l.y2 - offsetY,
  }));

  const t0 = performance.now();

  // Classify
  const classified = classifyLines(normalizedLines, pageWidth, pageHeight);

  // Merge
  const merged = mergeWallSegments(classified.walls);

  // Detect rooms
  const rooms = detectRooms(merged, pageWidth, pageHeight);

  // Label rooms from text
  const normalizedText = text?.map(t => ({
    ...t,
    x1: (t.x1 || t.x || 0) - offsetX,
    y1: (t.y1 || t.y || 0) - offsetY,
    x2: (t.x2 || (t.x || 0) + 50) - offsetX,
    y2: (t.y2 || (t.y || 0) + 15) - offsetY,
    text: t.text || t.str || "",
  })) || [];
  const labeledRooms = labelRooms(rooms, normalizedText);

  const elapsed = performance.now() - t0;

  // Convert to feet if calibrated
  const toFeet = ppf ? (px => px / ppf) : (px => px);

  const result = {
    drawingId,
    mode: classified.mode,
    threshold: classified.threshold,
    walls: merged.map(w => ({
      start: { x: toFeet(w.x1), y: toFeet(w.y1) },
      end: { x: toFeet(w.x2), y: toFeet(w.y2) },
      lengthFt: ppf ? w.length / ppf : w.length,
      lineWeight: w.lineWidth,
      segmentCount: w.segmentCount,
    })),
    rooms: labeledRooms.map(r => ({
      id: r.id,
      label: r.label,
      polygon: r.polygon.map(p => ({ x: toFeet(p.x), y: toFeet(p.y) })),
      areaSf: ppf ? r.areaPx / (ppf * ppf) : r.areaPx,
      centroid: { x: toFeet(r.centroid.x), y: toFeet(r.centroid.y) },
    })),
    stats: {
      ...classified.stats,
      mergedWalls: merged.length,
      roomCount: labeledRooms.length,
      totalAreaSf: ppf
        ? labeledRooms.reduce((s, r) => s + r.areaPx / (ppf * ppf), 0)
        : 0,
      totalWallLf: ppf
        ? merged.reduce((s, w) => s + w.length / ppf, 0)
        : 0,
      runtimeMs: Math.round(elapsed),
    },
    offset: { x: offsetX, y: offsetY },
    pageDimensions: { width: pageWidth, height: pageHeight },
    calibrated: !!ppf,
  };

  console.log(
    `[vectorWallDetector] ${drawingId}: ${result.stats.mergedWalls} walls, ` +
    `${result.stats.roomCount} rooms, ${result.stats.totalAreaSf.toFixed(0)} SF, ` +
    `${result.stats.runtimeMs}ms (${classified.mode})`
  );

  return result;
}

// ── Helpers ──

function pointToLineDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

function rasterizeLine(grid, gridW, gridH, gridSize, x1, y1, x2, y2, thickness) {
  // Bresenham with thickness
  const gx1 = Math.floor(x1 / gridSize);
  const gy1 = Math.floor(y1 / gridSize);
  const gx2 = Math.floor(x2 / gridSize);
  const gy2 = Math.floor(y2 / gridSize);

  const dx = Math.abs(gx2 - gx1);
  const dy = Math.abs(gy2 - gy1);
  const sx = gx1 < gx2 ? 1 : -1;
  const sy = gy1 < gy2 ? 1 : -1;
  let err = dx - dy;
  let cx = gx1, cy = gy1;

  while (true) {
    // Paint with thickness
    for (let t = -Math.floor(thickness / 2); t <= Math.floor(thickness / 2); t++) {
      if (dx >= dy) {
        const ty = cy + t;
        if (cx >= 0 && cx < gridW && ty >= 0 && ty < gridH) {
          grid[ty * gridW + cx] = 1;
        }
      } else {
        const tx = cx + t;
        if (tx >= 0 && tx < gridW && cy >= 0 && cy < gridH) {
          grid[cy * gridW + tx] = 1;
        }
      }
    }

    if (cx === gx2 && cy === gy2) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
}
