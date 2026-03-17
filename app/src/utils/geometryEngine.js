// ══════════════════════════════════════════════════════════════════════
// Geometry Engine — Advanced vector analysis for construction drawings
// Detects rooms, walls, openings, and structural elements from PDF vectors
// Phase 3 of the predictive takeoff system
// ══════════════════════════════════════════════════════════════════════

import { extractPageData } from "./pdfExtractor";

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

  // Detect walls from line segments
  const walls = detectWalls(pageData.lines);

  // Build wall connectivity graph
  const graph = buildWallGraph(walls);

  // Find wall chains (connected runs)
  const chains = findWallChains(walls, graph);

  // Detect rooms (closed polygons)
  const rooms = detectRooms(walls, graph);

  // Detect openings (doors/windows from wall gaps)
  const openings = detectOpenings(walls, pageData.lines);

  // Associate tags with walls
  const wallTags = associateTagsWithWalls(pageData.text, walls);

  // Associate labels with rooms
  const roomLabels = associateTagsWithRooms(pageData.text, rooms);

  const result = {
    walls,
    rooms,
    openings,
    wallTags,
    roomLabels,
    wallChains: chains,
    stats: {
      totalWalls: walls.length,
      totalRooms: rooms.length,
      totalOpenings: openings.length,
      totalWallLength: walls.reduce((s, w) => s + w.length, 0),
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
