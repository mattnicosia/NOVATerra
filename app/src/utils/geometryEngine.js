// ══════════════════════════════════════════════════════════════════════
// Geometry Engine — Advanced vector analysis for construction drawings
// Detects rooms, walls, openings, and structural elements from PDF vectors
// Phase 3 of the predictive takeoff system
// ══════════════════════════════════════════════════════════════════════

import { extractPageData } from "./pdfExtractor";

// ══════════════════════════════════════════════════════════════════════
// DRAWING MODE DETECTION — adaptive threshold for residential vs commercial
// ══════════════════════════════════════════════════════════════════════

/**
 * Analyze line weight distribution to determine drawing type.
 * Residential plans often use 0pt hairlines for walls.
 * Commercial plans use 0.7pt+ for walls.
 * Framing plans have evenly-spaced lines (16" OC joists).
 *
 * @param {Array} lines — extracted line segments with lineWidth
 * @returns {{ mode: string, threshold: number, message: string }}
 */
export function getDrawingMode(lines) {
  if (!lines || lines.length === 0) return { mode: "unknown", threshold: 30, message: "No lines found" };

  // Collect weights from meaningful segments (>15px long)
  const weights = [];
  for (const l of lines) {
    if (l.length > 15) weights.push(Math.round((l.lineWidth || 0) * 100) / 100);
  }
  if (weights.length === 0) return { mode: "unknown", threshold: 30, message: "No meaningful segments" };

  const unique = [...new Set(weights)].sort((a, b) => a - b);
  const lightest = unique[0];
  const lightestCount = weights.filter(w => w === lightest).length;
  const lightestRatio = lightestCount / weights.length;

  // Framing detection: check for regular spacing among horizontal lines
  const hLines = lines.filter(l => {
    if (l.length < 20) return false;
    const dy = Math.abs(l.y2 - l.y1);
    const dx = Math.abs(l.x2 - l.x1);
    return dx > dy * 3; // horizontal
  });

  if (hLines.length > 20) {
    const yPositions = hLines.map(l => Math.round((l.y1 + l.y2) / 2)).sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < yPositions.length; i++) {
      const gap = yPositions[i] - yPositions[i - 1];
      if (gap > 5 && gap < 50) gaps.push(gap);
    }
    if (gaps.length > 10) {
      const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      const regularCount = gaps.filter(g => Math.abs(g - avgGap) < 3).length;
      if (regularCount / gaps.length > 0.6) {
        return {
          mode: "framing",
          threshold: 30,
          message: `Framing plan detected (${regularCount} lines at ~${avgGap.toFixed(0)}px spacing) — unsupported for wall detection`,
        };
      }
    }
  }

  // Residential vs commercial
  if (lightestRatio > 0.4 && lightest < 0.5) {
    return {
      mode: "residential",
      threshold: Math.max(8, lightest < 0.01 ? 8 : 15), // lower min length for hairlines
      message: `Residential mode (${lightest}pt = ${(lightestRatio * 100).toFixed(0)}% of segments)`,
    };
  }

  return {
    mode: "commercial",
    threshold: 30, // standard commercial threshold
    message: `Commercial mode (lightest=${lightest}pt at ${(lightestRatio * 100).toFixed(0)}%)`,
  };
}

// ══════════════════════════════════════════════════════════════════════
// FLOOD FILL ROOM DETECTION — fallback when DFS cycle detection finds 0 rooms
// ══════════════════════════════════════════════════════════════════════

/**
 * Detect rooms by rasterizing walls onto a grid and flood-filling exterior.
 * Remaining interior cells are clustered into room polygons.
 * Used as fallback when graph-based DFS finds no enclosed cycles.
 *
 * @param {Array} walls — detected wall objects with centerline + endpoints
 * @param {number} pageWidth — page width in pixels
 * @param {number} pageHeight — page height in pixels
 * @param {number} minRoomArea — minimum room area in grid cells (default 50)
 * @returns {Array} rooms with polygon, area, centroid
 */
export function detectRoomsFloodFill(walls, pageWidth, pageHeight, minRoomArea = 50) {
  if (!walls || walls.length < 3) return [];

  // Determine bounds from walls
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const w of walls) {
    for (const ep of w.endpoints) {
      if (ep.x < minX) minX = ep.x;
      if (ep.x > maxX) maxX = ep.x;
      if (ep.y < minY) minY = ep.y;
      if (ep.y > maxY) maxY = ep.y;
    }
  }

  const pad = 20;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;

  // Grid resolution
  const cellSize = Math.max(6, (maxX - minX) / 400);
  const gridW = Math.min(2000, Math.ceil((maxX - minX) / cellSize) + 1);
  const gridH = Math.min(2000, Math.ceil((maxY - minY) / cellSize) + 1);

  // Rasterize walls (0 = empty, 1 = wall)
  const grid = new Uint8Array(gridW * gridH); // flat for performance

  for (const w of walls) {
    const cl = w.centerline;
    const x1 = cl.x1, y1 = cl.y1, x2 = cl.x2, y2 = cl.y2;
    const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
    const isH = dx > dy;

    if (isH) {
      const gy = Math.floor(((y1 + y2) / 2 - minY) / cellSize);
      const gx1 = Math.floor((Math.min(x1, x2) - minX) / cellSize);
      const gx2 = Math.floor((Math.max(x1, x2) - minX) / cellSize);
      for (let gx = Math.max(0, gx1); gx <= Math.min(gridW - 1, gx2); gx++) {
        for (let d = -1; d <= 1; d++) {
          const gy2 = gy + d;
          if (gy2 >= 0 && gy2 < gridH) grid[gy2 * gridW + gx] = 1;
        }
      }
    } else {
      const gx = Math.floor(((x1 + x2) / 2 - minX) / cellSize);
      const gy1 = Math.floor((Math.min(y1, y2) - minY) / cellSize);
      const gy2 = Math.floor((Math.max(y1, y2) - minY) / cellSize);
      for (let gy = Math.max(0, gy1); gy <= Math.min(gridH - 1, gy2); gy++) {
        for (let d = -1; d <= 1; d++) {
          const gx2 = gx + d;
          if (gx2 >= 0 && gx2 < gridW) grid[gy * gridW + gx2] = 1;
        }
      }
    }
  }

  // BFS flood fill from edges (mark exterior as 2)
  const queue = [];
  for (let gx = 0; gx < gridW; gx++) {
    if (grid[gx] === 0) { grid[gx] = 2; queue.push(gx); } // top edge: row 0
    const botIdx = (gridH - 1) * gridW + gx;
    if (grid[botIdx] === 0) { grid[botIdx] = 2; queue.push(botIdx); } // bottom edge
  }
  for (let gy = 0; gy < gridH; gy++) {
    const leftIdx = gy * gridW;
    if (grid[leftIdx] === 0) { grid[leftIdx] = 2; queue.push(leftIdx); }
    const rightIdx = gy * gridW + gridW - 1;
    if (grid[rightIdx] === 0) { grid[rightIdx] = 2; queue.push(rightIdx); }
  }

  let qi = 0;
  const offsets = [-gridW, gridW, -1, 1]; // up, down, left, right
  while (qi < queue.length) {
    const idx = queue[qi++];
    const gx = idx % gridW, gy = Math.floor(idx / gridW);
    for (const off of offsets) {
      const ni = idx + off;
      if (ni < 0 || ni >= gridW * gridH) continue;
      // Prevent left/right wrap
      const nx = ni % gridW;
      if (off === -1 && nx === gridW - 1) continue;
      if (off === 1 && nx === 0) continue;
      if (grid[ni] === 0) { grid[ni] = 2; queue.push(ni); }
    }
  }

  // Cluster remaining interior cells (value 0) into rooms
  const rooms = [];
  let roomId = 3;

  for (let idx = 0; idx < gridW * gridH; idx++) {
    if (grid[idx] !== 0) continue;

    const cells = [];
    const rq = [idx];
    grid[idx] = roomId;

    let rqi = 0;
    while (rqi < rq.length) {
      const ci = rq[rqi++];
      cells.push(ci);
      for (const off of offsets) {
        const ni = ci + off;
        if (ni < 0 || ni >= gridW * gridH) continue;
        const nx = ni % gridW;
        if (off === -1 && nx === gridW - 1) continue;
        if (off === 1 && nx === 0) continue;
        if (grid[ni] === 0) { grid[ni] = roomId; rq.push(ni); }
      }
    }

    if (cells.length >= minRoomArea) {
      // Compute bounding box and centroid
      let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
      let sumX = 0, sumY = 0;
      for (const ci of cells) {
        const cx = ci % gridW, cy = Math.floor(ci / gridW);
        if (cx < xMin) xMin = cx; if (cx > xMax) xMax = cx;
        if (cy < yMin) yMin = cy; if (cy > yMax) yMax = cy;
        sumX += cx; sumY += cy;
      }

      const bboxMinX = xMin * cellSize + minX;
      const bboxMaxX = (xMax + 1) * cellSize + minX;
      const bboxMinY = yMin * cellSize + minY;
      const bboxMaxY = (yMax + 1) * cellSize + minY;

      rooms.push({
        id: `room-ff-${roomId}`,
        polygon: [
          { x: bboxMinX, y: bboxMinY },
          { x: bboxMaxX, y: bboxMinY },
          { x: bboxMaxX, y: bboxMaxY },
          { x: bboxMinX, y: bboxMaxY },
        ],
        area: cells.length * cellSize * cellSize, // in px²
        centroid: {
          x: (sumX / cells.length) * cellSize + minX,
          y: (sumY / cells.length) * cellSize + minY,
        },
        cellCount: cells.length,
      });
    }
    roomId++;
  }

  return rooms;
}

// ══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════

const WALL_MIN_LENGTH = 30; // px — minimum line length to be a wall candidate
const WALL_MAX_WIDTH = 55; // px — max perpendicular distance for parallel wall lines
const WALL_MIN_WIDTH = 3; // px — min perpendicular distance (avoids duplicate lines)
const ENDPOINT_SNAP = 15; // px — max distance to snap endpoints together
const ANGLE_TOLERANCE = 5; // degrees — tolerance for parallel line detection
const _ROOM_MAX_GAP = 20; // px — max gap between wall segments forming a room

// ══════════════════════════════════════════════════════════════════════
// VECTOR MATH UTILITIES
// ══════════════════════════════════════════════════════════════════════

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function lineAngle(line) {
  return Math.atan2(line.y2 - line.y1, line.x2 - line.x1);
}

function normalizeAngle(a) {
  // Normalize to [0, PI) — treat opposite directions as same
  while (a < 0) a += Math.PI;
  while (a >= Math.PI) a -= Math.PI;
  return a;
}

function anglesParallel(a1, a2, tolerance = (ANGLE_TOLERANCE * Math.PI) / 180) {
  const na1 = normalizeAngle(a1);
  const na2 = normalizeAngle(a2);
  const diff = Math.abs(na1 - na2);
  return diff < tolerance || Math.abs(diff - Math.PI) < tolerance;
}

function perpDistToLine(px, py, line) {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1) return Infinity;
  const t = Math.max(0, Math.min(1, ((px - line.x1) * dx + (py - line.y1) * dy) / len2));
  const projX = line.x1 + t * dx;
  const projY = line.y1 + t * dy;
  return dist(px, py, projX, projY);
}

function lineMidpoint(line) {
  return { x: (line.x1 + line.x2) / 2, y: (line.y1 + line.y2) / 2 };
}

function pointsEqual(p1, p2, tolerance = ENDPOINT_SNAP) {
  return dist(p1.x, p1.y, p2.x, p2.y) < tolerance;
}

// ══════════════════════════════════════════════════════════════════════
// WALL DETECTION
// Finds pairs of parallel lines that form walls
// ══════════════════════════════════════════════════════════════════════

/**
 * Detect wall segments from line data
 * Walls = pairs of parallel lines at consistent spacing (wall thickness)
 * @param {Array} lines - Extracted line segments from PDF
 * @returns {Array} Wall segments with centerline, width, and source lines
 */
export function detectWalls(lines) {
  // Filter to substantial lines (likely structural, not annotations)
  const wallCandidates = lines.filter(l => l.length >= WALL_MIN_LENGTH);

  // Sort by length descending — process longest lines first
  wallCandidates.sort((a, b) => b.length - a.length);

  const usedLines = new Set();
  const walls = [];

  for (let i = 0; i < wallCandidates.length; i++) {
    const line1 = wallCandidates[i];
    const key1 = `${Math.round(line1.x1)},${Math.round(line1.y1)},${Math.round(line1.x2)},${Math.round(line1.y2)}`;
    if (usedLines.has(key1)) continue;

    const angle1 = lineAngle(line1);
    let bestPair = null;
    let bestWidth = WALL_MAX_WIDTH;

    // Find the best parallel line to pair with
    for (let j = i + 1; j < wallCandidates.length; j++) {
      const line2 = wallCandidates[j];
      const key2 = `${Math.round(line2.x1)},${Math.round(line2.y1)},${Math.round(line2.x2)},${Math.round(line2.y2)}`;
      if (usedLines.has(key2)) continue;

      const angle2 = lineAngle(line2);
      if (!anglesParallel(angle1, angle2)) continue;

      // Check perpendicular distance (wall width)
      const mid2 = lineMidpoint(line2);
      const perpDist = perpDistToLine(mid2.x, mid2.y, line1);

      if (perpDist >= WALL_MIN_WIDTH && perpDist <= bestWidth) {
        // Verify the lines overlap in the parallel direction
        // Project both lines onto the primary direction
        const dx = Math.cos(angle1);
        const dy = Math.sin(angle1);
        const proj1Start = line1.x1 * dx + line1.y1 * dy;
        const proj1End = line1.x2 * dx + line1.y2 * dy;
        const proj2Start = line2.x1 * dx + line2.y1 * dy;
        const proj2End = line2.x2 * dx + line2.y2 * dy;

        const min1 = Math.min(proj1Start, proj1End);
        const max1 = Math.max(proj1Start, proj1End);
        const min2 = Math.min(proj2Start, proj2End);
        const max2 = Math.max(proj2Start, proj2End);

        // Overlap check (at least 50% of shorter line)
        const overlapStart = Math.max(min1, min2);
        const overlapEnd = Math.min(max1, max2);
        const overlapLen = Math.max(0, overlapEnd - overlapStart);
        const minLineLen = Math.min(max1 - min1, max2 - min2);

        if (overlapLen > minLineLen * 0.4) {
          bestWidth = perpDist;
          bestPair = { line: line2, key: key2, width: perpDist };
        }
      }
    }

    if (bestPair) {
      usedLines.add(key1);
      usedLines.add(bestPair.key);

      // Compute centerline
      const centerline = {
        x1: (line1.x1 + bestPair.line.x1) / 2,
        y1: (line1.y1 + bestPair.line.y1) / 2,
        x2: (line1.x2 + bestPair.line.x2) / 2,
        y2: (line1.y2 + bestPair.line.y2) / 2,
      };

      walls.push({
        id: `wall-${walls.length}`,
        centerline,
        width: bestPair.width,
        length: dist(centerline.x1, centerline.y1, centerline.x2, centerline.y2),
        angle: lineAngle(line1),
        sourceLines: [line1, bestPair.line],
        endpoints: [
          { x: centerline.x1, y: centerline.y1 },
          { x: centerline.x2, y: centerline.y2 },
        ],
        confidence: bestPair.width < 30 ? 0.9 : 0.75, // Thinner = more likely a wall
      });
    }
  }

  return walls;
}

// ══════════════════════════════════════════════════════════════════════
// WALL GRAPH CONSTRUCTION
// Build a connectivity graph of walls that share endpoints
// ══════════════════════════════════════════════════════════════════════

/**
 * Build an adjacency graph of walls based on endpoint proximity
 */
export function buildWallGraph(walls) {
  const graph = new Map(); // wallId -> Set of connected wallIds

  walls.forEach(w => graph.set(w.id, new Set()));

  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const w1 = walls[i];
      const w2 = walls[j];

      // Check if any endpoints are close
      for (const ep1 of w1.endpoints) {
        for (const ep2 of w2.endpoints) {
          if (pointsEqual(ep1, ep2)) {
            graph.get(w1.id).add(w2.id);
            graph.get(w2.id).add(w1.id);
          }
        }
      }
    }
  }

  return graph;
}

/**
 * Find connected wall chains (groups of walls that form continuous runs)
 */
export function findWallChains(walls, graph) {
  const visited = new Set();
  const chains = [];

  for (const wall of walls) {
    if (visited.has(wall.id)) continue;

    // BFS to find all connected walls
    const chain = [];
    const queue = [wall.id];

    while (queue.length > 0) {
      const wid = queue.shift();
      if (visited.has(wid)) continue;
      visited.add(wid);
      chain.push(wid);

      for (const neighbor of graph.get(wid) || []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }

    if (chain.length >= 1) {
      chains.push(chain);
    }
  }

  return chains;
}

// ══════════════════════════════════════════════════════════════════════
// ROOM DETECTION
// Find closed polygons formed by wall segments (= rooms)
// ══════════════════════════════════════════════════════════════════════

/**
 * Detect rooms as closed polygons from wall endpoints
 * Uses a cycle detection algorithm on the wall graph
 */
export function detectRooms(walls, _graph) {
  if (walls.length < 3) return [];

  const rooms = [];
  const wallMap = new Map(walls.map(w => [w.id, w]));

  // Build endpoint graph
  // Each unique endpoint -> list of wall IDs that touch it
  const endpointMap = new Map(); // "x,y" -> Set of wall IDs

  walls.forEach(wall => {
    wall.endpoints.forEach(ep => {
      const key = `${Math.round(ep.x / ENDPOINT_SNAP) * ENDPOINT_SNAP},${Math.round(ep.y / ENDPOINT_SNAP) * ENDPOINT_SNAP}`;
      if (!endpointMap.has(key)) endpointMap.set(key, new Set());
      endpointMap.get(key).add(wall.id);
    });
  });

  // Find closed loops using DFS
  // A room is a cycle of walls where each wall connects to the next at endpoints
  const visitedCycles = new Set(); // Prevent duplicate rooms

  let _cycleOpsCount = 0; // Global operation counter to prevent exponential blowup
  const CYCLE_OPS_LIMIT = 50000; // Max DFS operations across all findCycles calls

  function findCycles(startWallId, maxDepth = 12) {
    const cycles = [];
    if (_cycleOpsCount >= CYCLE_OPS_LIMIT) return cycles; // Time guard

    function dfs(currentWallId, path, visitedInPath) {
      _cycleOpsCount++;
      if (_cycleOpsCount >= CYCLE_OPS_LIMIT) return; // Abort if exceeded
      if (path.length > maxDepth) return;

      const currentWall = wallMap.get(currentWallId);
      if (!currentWall) return;

      // Get the "outgoing" endpoint (the one not shared with the previous wall)
      let outgoingEp;
      if (path.length === 1) {
        // Starting wall — try both endpoints
        outgoingEp = currentWall.endpoints[1]; // Will also try [0] in outer loop
      } else {
        const prevWall = wallMap.get(path[path.length - 2]);
        // Find which endpoint of current wall is shared with previous
        const sharedWithPrev = currentWall.endpoints.find(ep => prevWall.endpoints.some(pep => pointsEqual(ep, pep)));
        outgoingEp = currentWall.endpoints.find(ep => ep !== sharedWithPrev) || currentWall.endpoints[1];
      }

      // Find walls connected at the outgoing endpoint
      const epKey = `${Math.round(outgoingEp.x / ENDPOINT_SNAP) * ENDPOINT_SNAP},${Math.round(outgoingEp.y / ENDPOINT_SNAP) * ENDPOINT_SNAP}`;
      const connectedWalls = endpointMap.get(epKey) || new Set();

      for (const nextWallId of connectedWalls) {
        if (nextWallId === currentWallId) continue;

        // Check if we've completed a cycle
        if (nextWallId === startWallId && path.length >= 3) {
          const cycleKey = [...path].sort().join(",");
          if (!visitedCycles.has(cycleKey)) {
            visitedCycles.add(cycleKey);
            cycles.push([...path]);
          }
          continue;
        }

        if (visitedInPath.has(nextWallId)) continue;

        visitedInPath.add(nextWallId);
        path.push(nextWallId);
        dfs(nextWallId, path, visitedInPath);
        path.pop();
        visitedInPath.delete(nextWallId);
      }
    }

    const visited = new Set([startWallId]);
    dfs(startWallId, [startWallId], visited);

    return cycles;
  }

  // Try finding cycles starting from each wall
  for (const wall of walls) {
    const cycles = findCycles(wall.id, 10);

    for (const cycle of cycles) {
      // Convert wall cycle to polygon points
      const points = [];
      for (let i = 0; i < cycle.length; i++) {
        const w = wallMap.get(cycle[i]);
        if (!w) continue;

        if (i === 0) {
          // Use both endpoints of first wall
          points.push(w.endpoints[0]);
        }

        // Find the shared endpoint with the next wall
        const nextW = wallMap.get(cycle[(i + 1) % cycle.length]);
        if (nextW) {
          for (const ep of w.endpoints) {
            if (nextW.endpoints.some(nep => pointsEqual(ep, nep))) {
              points.push(ep);
              break;
            }
          }
        }
      }

      if (points.length >= 3) {
        // Calculate area using shoelace formula
        let area = 0;
        for (let i = 0; i < points.length; i++) {
          const j = (i + 1) % points.length;
          area += points[i].x * points[j].y;
          area -= points[j].x * points[i].y;
        }
        area = Math.abs(area) / 2;

        // Filter out tiny or huge polygons
        if (area > 500 && area < 5000000) {
          // Centroid
          const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
          const cy = points.reduce((s, p) => s + p.y, 0) / points.length;

          rooms.push({
            id: `room-${rooms.length}`,
            polygon: points,
            area, // in px²
            centroid: { x: cx, y: cy },
            wallIds: cycle,
            perimeter: cycle.reduce((s, wid) => s + (wallMap.get(wid)?.length || 0), 0),
            confidence: cycle.length >= 4 ? 0.85 : 0.7,
          });
        }
      }
    }
  }

  // Deduplicate rooms that share the same walls
  const uniqueRooms = [];
  const roomWallSets = [];

  for (const room of rooms) {
    const wallSet = new Set(room.wallIds);
    const isDuplicate = roomWallSets.some(existing => {
      const intersection = [...wallSet].filter(w => existing.has(w));
      return intersection.length >= Math.min(wallSet.size, existing.size) * 0.8;
    });

    if (!isDuplicate) {
      uniqueRooms.push(room);
      roomWallSets.push(wallSet);
    }
  }

  return uniqueRooms;
}

// ══════════════════════════════════════════════════════════════════════
// OPENING DETECTION
// Find gaps in wall lines (doors, windows) from line breaks
// ══════════════════════════════════════════════════════════════════════

/**
 * Detect openings (doors/windows) as gaps in wall segments
 */
export function detectOpenings(walls, lines) {
  const openings = [];

  for (const wall of walls) {
    const angle = wall.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Find all lines parallel to this wall and within wall width
    const parallelLines = lines.filter(l => {
      if (l.length < 10) return false;
      const lAngle = lineAngle(l);
      if (!anglesParallel(angle, lAngle)) return false;
      const mid = lineMidpoint(l);
      const perpDist = perpDistToLine(mid.x, mid.y, wall.centerline);
      return perpDist <= (wall.width || WALL_MAX_WIDTH) * 0.8;
    });

    // Project onto wall direction and find gaps
    const projections = parallelLines
      .map(l => {
        const p1 = l.x1 * cos + l.y1 * sin;
        const p2 = l.x2 * cos + l.y2 * sin;
        return { min: Math.min(p1, p2), max: Math.max(p1, p2), line: l };
      })
      .sort((a, b) => a.min - b.min);

    // Find gaps between consecutive projected segments
    for (let i = 0; i < projections.length - 1; i++) {
      const gap = projections[i + 1].min - projections[i].max;

      // Typical door = 24-48" = ~36-72px at 1/4" scale
      // Typical window = 18-72" = ~27-108px at 1/4" scale
      if (gap >= 15 && gap <= 120) {
        const gapCenter = (projections[i].max + projections[i + 1].min) / 2;
        const gapX = wall.centerline.x1 + (gapCenter - wall.centerline.x1 * cos - wall.centerline.y1 * sin) * cos;
        const gapY = wall.centerline.y1 + (gapCenter - wall.centerline.x1 * cos - wall.centerline.y1 * sin) * sin;

        openings.push({
          id: `opening-${openings.length}`,
          wallId: wall.id,
          position: { x: gapX, y: gapY },
          width: gap,
          type: gap > 50 ? "door" : "window", // Rough heuristic
          confidence: 0.6,
        });
      }
    }
  }

  return openings;
}

// ══════════════════════════════════════════════════════════════════════
// TAG-GEOMETRY ASSOCIATION
// Link detected tags to nearby geometry (walls, rooms)
// ══════════════════════════════════════════════════════════════════════

/**
 * Associate text tags with detected walls
 * Tags near walls likely label that wall type
 */
export function associateTagsWithWalls(textItems, walls, maxDist = 60) {
  const associations = [];

  for (const text of textItems) {
    if (text.text.length > 6 || text.text.length < 1) continue; // Skip long text (not tags)

    let nearestWall = null;
    let nearestDist = maxDist;

    for (const wall of walls) {
      const d = perpDistToLine(text.x, text.y, wall.centerline);
      if (d < nearestDist) {
        nearestDist = d;
        nearestWall = wall;
      }
    }

    if (nearestWall) {
      associations.push({
        tag: text.text,
        tagPosition: { x: text.x, y: text.y },
        wallId: nearestWall.id,
        distance: nearestDist,
        confidence: nearestDist < 30 ? 0.9 : 0.7,
      });
    }
  }

  return associations;
}

/**
 * Associate room numbers with detected rooms
 * Room numbers at room centroids identify the room
 */
export function associateTagsWithRooms(textItems, rooms) {
  const associations = [];

  for (const room of rooms) {
    // Find text items inside or near the room centroid
    let nearestText = null;
    let nearestDist = Infinity;

    for (const text of textItems) {
      // Check if text is inside room polygon (point-in-polygon test)
      const d = dist(text.x, text.y, room.centroid.x, room.centroid.y);
      if (d < nearestDist && d < Math.sqrt(room.area) * 0.5) {
        nearestDist = d;
        nearestText = text;
      }
    }

    if (nearestText) {
      associations.push({
        roomId: room.id,
        label: nearestText.text,
        labelPosition: { x: nearestText.x, y: nearestText.y },
        confidence: nearestDist < 50 ? 0.85 : 0.6,
      });
    }
  }

  return associations;
}

// ══════════════════════════════════════════════════════════════════════
// FULL GEOMETRY ANALYSIS
// Complete analysis pipeline for a drawing
// ══════════════════════════════════════════════════════════════════════

// ── Geometry cache (per drawing ID) ──────────────────────────────
const _geometryCache = new Map();

/**
 * Run complete geometry analysis on a drawing (cached per drawing ID)
 * @param {Object} drawing - Drawing with PDF data
 * @returns {Object} { walls, rooms, openings, wallTags, roomLabels, stats }
 */
export async function analyzeDrawingGeometry(drawing) {
  if (_geometryCache.has(drawing.id)) return _geometryCache.get(drawing.id);

  const pageData = await extractPageData(drawing);

  // Detect drawing mode (residential/commercial/framing)
  const drawingMode = getDrawingMode(pageData.lines);
  console.log(`[geometryEngine] ${drawingMode.message}`);

  // Framing plans: return early with unsupported message
  if (drawingMode.mode === "framing") {
    const result = {
      walls: [], rooms: [], openings: [], wallTags: [], roomLabels: [], wallChains: [],
      drawingMode,
      stats: { totalWalls: 0, totalRooms: 0, totalOpenings: 0, totalWallLength: 0, wallTagCount: 0, roomLabelCount: 0, totalSF: 0, wallLF: 0 },
    };
    _geometryCache.set(drawing.id, result);
    return result;
  }

  // Filter lines based on adaptive threshold
  const filteredLines = drawingMode.mode === "residential"
    ? pageData.lines.filter(l => l.length >= drawingMode.threshold)
    : pageData.lines;

  // Detect walls from line segments
  const walls = detectWalls(filteredLines);

  // Build wall connectivity graph
  const graph = buildWallGraph(walls);

  // Find wall chains (connected runs)
  const chains = findWallChains(walls, graph);

  // Detect rooms (closed polygons via DFS)
  let rooms = detectRooms(walls, graph);

  // Flood fill fallback if DFS found 0 rooms
  if (rooms.length === 0 && walls.length >= 3) {
    console.log("[geometryEngine] DFS found 0 rooms — trying flood fill fallback");
    const pw = pageData.stats?.pageWidth || 1000;
    const ph = pageData.stats?.pageHeight || 800;
    rooms = detectRoomsFloodFill(walls, pw, ph);
    if (rooms.length > 0) {
      console.log(`[geometryEngine] Flood fill found ${rooms.length} rooms`);
    }
  }

  // Detect openings (doors/windows from wall gaps)
  const openings = detectOpenings(walls, filteredLines);

  // Associate tags with walls
  const wallTags = associateTagsWithWalls(pageData.text, walls);

  // Associate labels with rooms
  const roomLabels = associateTagsWithRooms(pageData.text, rooms);

  // Compute aggregate stats
  const wallLF = walls.reduce((s, w) => s + w.length, 0);
  const totalSF = rooms.reduce((s, r) => s + (r.area || 0), 0);

  const result = {
    walls,
    rooms,
    openings,
    wallTags,
    roomLabels,
    wallChains: chains,
    drawingMode,
    stats: {
      totalWalls: walls.length,
      totalRooms: rooms.length,
      totalOpenings: openings.length,
      totalWallLength: wallLF,
      wallLF,
      totalSF,
      wallTagCount: wallTags.length,
      roomLabelCount: roomLabels.length,
    },
  };

  _geometryCache.set(drawing.id, result);
  // LRU eviction: cap at 5 drawings
  if (_geometryCache.size > 5) {
    const oldest = _geometryCache.keys().next().value;
    _geometryCache.delete(oldest);
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════════
// AUTO-TAKEOFF GENERATORS
// Convert detected geometry into takeoff measurements
// ══════════════════════════════════════════════════════════════════════

/**
 * Generate auto-takeoff measurements from geometry analysis
 * Creates measurement objects ready to insert into takeoffs
 */
export function generateAutoMeasurements(geometryResult, drawingId, options = {}) {
  const { includeWalls = true, includeRooms = true, includeOpenings = true } = options;
  const measurements = [];

  // Wall measurements (linear)
  if (includeWalls) {
    // Group walls by tag
    const wallsByTag = new Map();
    for (const assoc of geometryResult.wallTags) {
      const tag = assoc.tag.toUpperCase();
      if (!wallsByTag.has(tag)) wallsByTag.set(tag, []);
      wallsByTag.get(tag).push(assoc.wallId);
    }

    // For each wall tag group, create measurements
    for (const [tag, wallIds] of wallsByTag) {
      const uniqueWallIds = [...new Set(wallIds)];
      const wallMap = new Map(geometryResult.walls.map(w => [w.id, w]));

      for (const wallId of uniqueWallIds) {
        const wall = wallMap.get(wallId);
        if (!wall) continue;

        measurements.push({
          type: "linear",
          tag,
          points: wall.endpoints,
          length: wall.length,
          wallWidth: wall.width,
          sheetId: drawingId,
          confidence: wall.confidence,
          source: "geometry",
          wallId,
        });
      }
    }
  }

  // Room measurements (area)
  if (includeRooms) {
    for (const room of geometryResult.rooms) {
      const label = geometryResult.roomLabels.find(rl => rl.roomId === room.id);

      measurements.push({
        type: "area",
        tag: label?.label || `Room ${room.id}`,
        points: room.polygon,
        area: room.area,
        perimeter: room.perimeter,
        sheetId: drawingId,
        confidence: room.confidence,
        source: "geometry",
        roomId: room.id,
      });
    }
  }

  // Opening measurements (count)
  if (includeOpenings) {
    const openingsByType = { door: [], window: [] };
    for (const opening of geometryResult.openings) {
      if (opening.type in openingsByType) {
        openingsByType[opening.type].push(opening);
      }
    }

    for (const [type, openings] of Object.entries(openingsByType)) {
      for (const opening of openings) {
        measurements.push({
          type: "count",
          tag: `${type.charAt(0).toUpperCase() + type.slice(1)}`,
          points: [opening.position],
          width: opening.width,
          sheetId: drawingId,
          confidence: opening.confidence,
          source: "geometry",
          openingId: opening.id,
        });
      }
    }
  }

  return measurements;
}
