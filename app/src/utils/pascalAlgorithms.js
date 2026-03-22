/**
 * pascalAlgorithms.js — Space detection + wall mitering algorithms
 * Extracted from Pascal Editor (MIT License)
 * https://github.com/pascalorg/editor
 *
 * Adapted for NOVATerra: converts takeoff wall measurements into
 * proper room detection and mitered wall junctions.
 *
 * Original: TypeScript with WallNode { start: [x,z], end: [x,z], thickness }
 * Adapted:  Plain JS, same interface, usable with our geometryBuilder output
 */

// ═══════════════════════════════════════════════════════════════════
// SPACE DETECTION — Flood-fill room detection from wall geometry
// ═══════════════════════════════════════════════════════════════════

/**
 * Detect rooms/spaces from a set of walls on a single floor level.
 * Walls are defined as { id, start: [x,z], end: [x,z], thickness? }
 *
 * Returns { spaces: [{ id, polygon, wallIds, isExterior }], wallUpdates }
 *
 * @param {string} levelId - Floor identifier
 * @param {Array<{id: string, start: [number,number], end: [number,number], thickness?: number}>} walls
 * @param {number} gridResolution - Grid cell size in feet (default 1.0 for imperial)
 */
export function detectSpacesForLevel(levelId, walls, gridResolution = 1.0) {
  if (!walls || walls.length === 0) {
    return { wallUpdates: [], spaces: [] };
  }

  const grid = buildGrid(walls, gridResolution);
  floodFillFromEdges(grid);
  const interiorSpaces = findInteriorSpaces(grid, levelId);
  const wallUpdates = assignWallSides(walls, grid);

  return { wallUpdates, spaces: interiorSpaces };
}

/**
 * Check if a wall touches any other walls (endpoint proximity)
 */
export function wallTouchesOthers(wall, otherWalls, threshold = 0.5) {
  for (const other of otherWalls) {
    if (other.id === wall.id) continue;
    if (
      distanceToSegment(wall.start, other.start, other.end) < threshold ||
      distanceToSegment(wall.end, other.start, other.end) < threshold ||
      distanceToSegment(other.start, wall.start, wall.end) < threshold ||
      distanceToSegment(other.end, wall.start, wall.end) < threshold
    ) {
      return true;
    }
  }
  return false;
}

// ── Grid Building ──

function buildGrid(walls, resolution) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const wall of walls) {
    minX = Math.min(minX, wall.start[0], wall.end[0]);
    minZ = Math.min(minZ, wall.start[1], wall.end[1]);
    maxX = Math.max(maxX, wall.start[0], wall.end[0]);
    maxZ = Math.max(maxZ, wall.start[1], wall.end[1]);
  }

  const padding = 6; // feet padding around bounds
  minX -= padding; minZ -= padding;
  maxX += padding; maxZ += padding;

  const width = Math.ceil((maxX - minX) / resolution);
  const height = Math.ceil((maxZ - minZ) / resolution);

  const grid = { cells: new Map(), resolution, minX, minZ, maxX, maxZ, width, height };

  for (const wall of walls) {
    markWallCells(grid, wall);
  }
  return grid;
}

function markWallCells(grid, wall) {
  const thickness = wall.thickness || 0.5; // default 6" wall
  const [x1, z1] = wall.start;
  const [x2, z2] = wall.end;
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.01) return;

  const perpX = -dz / len, perpZ = dx / len;
  const steps = Math.max(Math.ceil(len / (grid.resolution * 0.5)), 2);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + dx * t, z = z1 + dz * t;
    const thicknessSteps = Math.max(Math.ceil(thickness / (grid.resolution * 0.5)), 2);
    for (let j = 0; j <= thicknessSteps; j++) {
      const offset = (j / thicknessSteps - 0.5) * thickness;
      const key = getCellKey(grid, x + perpX * offset, z + perpZ * offset);
      if (key) grid.cells.set(key, "wall");
    }
  }
}

// ── Flood Fill ──

function floodFillFromEdges(grid) {
  const queue = [];
  for (let x = 0; x < grid.width; x++) {
    for (let z = 0; z < grid.height; z++) {
      if (x === 0 || x === grid.width - 1 || z === 0 || z === grid.height - 1) {
        const key = `${x},${z}`;
        if (grid.cells.get(key) !== "wall") {
          grid.cells.set(key, "exterior");
          queue.push(key);
        }
      }
    }
  }

  while (queue.length > 0) {
    const key = queue.shift();
    const [x, z] = key.split(",").map(Number);
    for (const [nx, nz] of [[x+1,z],[x-1,z],[x,z+1],[x,z-1]]) {
      if (nx < 0 || nx >= grid.width || nz < 0 || nz >= grid.height) continue;
      const nKey = `${nx},${nz}`;
      const cell = grid.cells.get(nKey);
      if (cell !== "wall" && cell !== "exterior") {
        grid.cells.set(nKey, "exterior");
        queue.push(nKey);
      }
    }
  }
}

// ── Interior Space Detection ──

function findInteriorSpaces(grid, levelId) {
  const spaces = [];
  const visited = new Set();

  for (let x = 0; x < grid.width; x++) {
    for (let z = 0; z < grid.height; z++) {
      const key = `${x},${z}`;
      if (visited.has(key)) continue;
      const cell = grid.cells.get(key);
      if (cell === "wall" || cell === "exterior") { visited.add(key); continue; }

      // Found interior cell — flood fill to find full space
      const spaceCells = new Set();
      const queue = [key];
      visited.add(key); spaceCells.add(key);
      grid.cells.set(key, "interior");

      while (queue.length > 0) {
        const curKey = queue.shift();
        const [cx, cz] = curKey.split(",").map(Number);
        for (const [nx, nz] of [[cx+1,cz],[cx-1,cz],[cx,cz+1],[cx,cz-1]]) {
          if (nx < 0 || nx >= grid.width || nz < 0 || nz >= grid.height) continue;
          const nKey = `${nx},${nz}`;
          if (visited.has(nKey)) continue;
          const nCell = grid.cells.get(nKey);
          if (nCell === "wall" || nCell === "exterior") { visited.add(nKey); continue; }
          visited.add(nKey); spaceCells.add(nKey);
          grid.cells.set(nKey, "interior");
          queue.push(nKey);
        }
      }

      // Extract bounding polygon from cells
      let sMinX = Infinity, sMinZ = Infinity, sMaxX = -Infinity, sMaxZ = -Infinity;
      for (const ck of spaceCells) {
        const [sx, sz] = ck.split(",").map(Number);
        const wx = grid.minX + sx * grid.resolution;
        const wz = grid.minZ + sz * grid.resolution;
        sMinX = Math.min(sMinX, wx); sMinZ = Math.min(sMinZ, wz);
        sMaxX = Math.max(sMaxX, wx + grid.resolution);
        sMaxZ = Math.max(sMaxZ, wz + grid.resolution);
      }

      spaces.push({
        id: `space-${levelId}-${spaces.length}`,
        levelId,
        polygon: [[sMinX,sMinZ],[sMaxX,sMinZ],[sMaxX,sMaxZ],[sMinX,sMaxZ]],
        cellCount: spaceCells.size,
        areaSF: spaceCells.size * grid.resolution * grid.resolution,
        wallIds: [],
        isExterior: false,
      });
    }
  }
  return spaces;
}

// ── Wall Side Assignment ──

function assignWallSides(walls, grid) {
  const updates = [];
  for (const wall of walls) {
    const thickness = wall.thickness || 0.5;
    const [x1, z1] = wall.start;
    const [x2, z2] = wall.end;
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.01) continue;

    const perpX = -dz / len, perpZ = dx / len;
    const midX = (x1 + x2) / 2, midZ = (z1 + z2) / 2;
    const offset = thickness / 2 + grid.resolution;

    const frontKey = getCellKey(grid, midX + perpX * offset, midZ + perpZ * offset);
    const backKey = getCellKey(grid, midX - perpX * offset, midZ - perpZ * offset);
    const frontCell = frontKey ? grid.cells.get(frontKey) : undefined;
    const backCell = backKey ? grid.cells.get(backKey) : undefined;

    updates.push({
      wallId: wall.id,
      frontSide: frontCell === "exterior" ? "exterior" : frontCell === "interior" ? "interior" : "unknown",
      backSide: backCell === "exterior" ? "exterior" : backCell === "interior" ? "interior" : "unknown",
    });
  }
  return updates;
}

// ── Grid Utilities ──

function getCellKey(grid, x, z) {
  const cellX = Math.floor((x - grid.minX) / grid.resolution);
  const cellZ = Math.floor((z - grid.minZ) / grid.resolution);
  if (cellX < 0 || cellX >= grid.width || cellZ < 0 || cellZ >= grid.height) return null;
  return `${cellX},${cellZ}`;
}

function distanceToSegment(point, segStart, segEnd) {
  const [px, pz] = point;
  const [x1, z1] = segStart;
  const [x2, z2] = segEnd;
  const dx = x2 - x1, dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 0.0001) {
    return Math.sqrt((px - x1) ** 2 + (pz - z1) ** 2);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / lenSq));
  return Math.sqrt((px - (x1 + t * dx)) ** 2 + (pz - (z1 + t * dz)) ** 2);
}


// ═══════════════════════════════════════════════════════════════════
// WALL MITERING — Proper junction geometry for L and T connections
// ═══════════════════════════════════════════════════════════════════

const MITER_TOLERANCE = 0.01;

function miterPointToKey(p, tolerance = MITER_TOLERANCE) {
  const snap = 1 / tolerance;
  return `${Math.round(p.x * snap)},${Math.round(p.y * snap)}`;
}

function createLineFromPointAndVector(p, v) {
  const a = -v.y, b = v.x;
  return { a, b, c: -(a * p.x + b * p.y) };
}

function pointOnWallSegment(point, wall, tolerance = MITER_TOLERANCE) {
  const start = { x: wall.start[0], y: wall.start[1] };
  const end = { x: wall.end[0], y: wall.end[1] };
  if (miterPointToKey(point, tolerance) === miterPointToKey(start, tolerance)) return false;
  if (miterPointToKey(point, tolerance) === miterPointToKey(end, tolerance)) return false;

  const v = { x: end.x - start.x, y: end.y - start.y };
  const L = Math.sqrt(v.x * v.x + v.y * v.y);
  if (L < 1e-9) return false;

  const w = { x: point.x - start.x, y: point.y - start.y };
  const t = (v.x * w.x + v.y * w.y) / (L * L);
  if (t < tolerance || t > 1 - tolerance) return false;

  const dist = Math.sqrt((point.x - (start.x + t * v.x)) ** 2 + (point.y - (start.y + t * v.y)) ** 2);
  return dist < tolerance;
}

/**
 * Find all junctions (points where 2+ walls meet)
 */
function findJunctions(walls) {
  const junctions = new Map();

  for (const wall of walls) {
    const startPt = { x: wall.start[0], y: wall.start[1] };
    const endPt = { x: wall.end[0], y: wall.end[1] };
    const keyStart = miterPointToKey(startPt);
    const keyEnd = miterPointToKey(endPt);

    if (!junctions.has(keyStart)) junctions.set(keyStart, { meetingPoint: startPt, connectedWalls: [] });
    junctions.get(keyStart).connectedWalls.push({ wall, endType: "start" });

    if (!junctions.has(keyEnd)) junctions.set(keyEnd, { meetingPoint: endPt, connectedWalls: [] });
    junctions.get(keyEnd).connectedWalls.push({ wall, endType: "end" });
  }

  // Detect T-junctions
  for (const [, junction] of junctions) {
    for (const wall of walls) {
      if (junction.connectedWalls.some(cw => cw.wall.id === wall.id)) continue;
      if (pointOnWallSegment(junction.meetingPoint, wall)) {
        junction.connectedWalls.push({ wall, endType: "passthrough" });
      }
    }
  }

  // Filter to junctions with 2+ walls
  const actual = new Map();
  for (const [key, junction] of junctions) {
    if (junction.connectedWalls.length >= 2) actual.set(key, junction);
  }
  return actual;
}

function calculateJunctionIntersections(junction, getThickness) {
  const { meetingPoint, connectedWalls } = junction;
  const processed = [];

  for (const { wall, endType } of connectedWalls) {
    const halfT = getThickness(wall) / 2;

    if (endType === "passthrough") {
      const v1 = { x: wall.end[0] - wall.start[0], y: wall.end[1] - wall.start[1] };
      for (const v of [v1, { x: -v1.x, y: -v1.y }]) {
        const L = Math.sqrt(v.x * v.x + v.y * v.y);
        if (L < 1e-9) continue;
        const n = { x: -v.y / L, y: v.x / L };
        const pA = { x: meetingPoint.x + n.x * halfT, y: meetingPoint.y + n.y * halfT };
        const pB = { x: meetingPoint.x - n.x * halfT, y: meetingPoint.y - n.y * halfT };
        processed.push({
          wallId: wall.id,
          angle: Math.atan2(v.y, v.x),
          edgeA: createLineFromPointAndVector(pA, v),
          edgeB: createLineFromPointAndVector(pB, v),
          isPassthrough: true,
        });
      }
    } else {
      const v = endType === "start"
        ? { x: wall.end[0] - wall.start[0], y: wall.end[1] - wall.start[1] }
        : { x: wall.start[0] - wall.end[0], y: wall.start[1] - wall.end[1] };
      const L = Math.sqrt(v.x * v.x + v.y * v.y);
      if (L < 1e-9) continue;
      const n = { x: -v.y / L, y: v.x / L };
      const pA = { x: meetingPoint.x + n.x * halfT, y: meetingPoint.y + n.y * halfT };
      const pB = { x: meetingPoint.x - n.x * halfT, y: meetingPoint.y - n.y * halfT };
      processed.push({
        wallId: wall.id,
        angle: Math.atan2(v.y, v.x),
        edgeA: createLineFromPointAndVector(pA, v),
        edgeB: createLineFromPointAndVector(pB, v),
        isPassthrough: false,
      });
    }
  }

  processed.sort((a, b) => a.angle - b.angle);
  const intersections = new Map();
  const n = processed.length;
  if (n < 2) return intersections;

  for (let i = 0; i < n; i++) {
    const w1 = processed[i];
    const w2 = processed[(i + 1) % n];
    const det = w1.edgeA.a * w2.edgeB.b - w2.edgeB.a * w1.edgeA.b;
    if (Math.abs(det) < 1e-9) continue;

    const p = {
      x: (w1.edgeA.b * w2.edgeB.c - w2.edgeB.b * w1.edgeA.c) / det,
      y: (w2.edgeB.a * w1.edgeA.c - w1.edgeA.a * w2.edgeB.c) / det,
    };

    if (!w1.isPassthrough) {
      if (!intersections.has(w1.wallId)) intersections.set(w1.wallId, {});
      intersections.get(w1.wallId).left = p;
    }
    if (!w2.isPassthrough) {
      if (!intersections.has(w2.wallId)) intersections.set(w2.wallId, {});
      intersections.get(w2.wallId).right = p;
    }
  }

  return intersections;
}

/**
 * Calculate miter data for all walls on a level.
 * Walls: [{ id, start: [x,z], end: [x,z], thickness? }]
 *
 * Returns { junctionData, junctions }
 * junctionData: Map<junctionKey, Map<wallId, { left?, right? }>>
 */
export function calculateLevelMiters(walls) {
  const getThickness = wall => wall.thickness || 0.5;
  const junctions = findJunctions(walls);
  const junctionData = new Map();

  for (const [key, junction] of junctions) {
    junctionData.set(key, calculateJunctionIntersections(junction, getThickness));
  }

  return { junctionData, junctions };
}

/**
 * Get wall IDs adjacent to dirty walls (for incremental updates)
 */
export function getAdjacentWallIds(allWalls, dirtyWallIds) {
  const adjacent = new Set();

  for (const dirtyId of dirtyWallIds) {
    const dirtyWall = allWalls.find(w => w.id === dirtyId);
    if (!dirtyWall) continue;

    const dirtyStart = { x: dirtyWall.start[0], y: dirtyWall.start[1] };
    const dirtyEnd = { x: dirtyWall.end[0], y: dirtyWall.end[1] };

    for (const wall of allWalls) {
      if (wall.id === dirtyId) continue;
      const ws = { x: wall.start[0], y: wall.start[1] };
      const we = { x: wall.end[0], y: wall.end[1] };

      if (
        miterPointToKey(ws) === miterPointToKey(dirtyStart) ||
        miterPointToKey(ws) === miterPointToKey(dirtyEnd) ||
        miterPointToKey(we) === miterPointToKey(dirtyStart) ||
        miterPointToKey(we) === miterPointToKey(dirtyEnd)
      ) { adjacent.add(wall.id); continue; }

      if (pointOnWallSegment(dirtyStart, wall) || pointOnWallSegment(dirtyEnd, wall)) {
        adjacent.add(wall.id); continue;
      }
      if (pointOnWallSegment(ws, dirtyWall) || pointOnWallSegment(we, dirtyWall)) {
        adjacent.add(wall.id);
      }
    }
  }

  return adjacent;
}
