// pascalWallMitering.js — Adapted from Pascal Editor (MIT License)
// https://github.com/pascalorg/editor
//
// Calculates proper wall junction geometry (L-junctions, T-junctions).
// Input: wall segments as [{id, start:[x,z], end:[x,z], thickness}] in feet-space
// Output: junction data with miter intersection points per wall

const TOLERANCE = 0.01; // ~1/8 inch in feet

function pointToKey(p, tolerance = TOLERANCE) {
  const snap = 1 / tolerance;
  return `${Math.round(p.x * snap)},${Math.round(p.y * snap)}`;
}

function createLineFromPointAndVector(p, v) {
  const a = -v.y;
  const b = v.x;
  const c = -(a * p.x + b * p.y);
  return { a, b, c };
}

function pointOnWallSegment(point, wall, tolerance = TOLERANCE) {
  const start = { x: wall.start[0], y: wall.start[1] };
  const end = { x: wall.end[0], y: wall.end[1] };

  if (pointToKey(point, tolerance) === pointToKey(start, tolerance)) return false;
  if (pointToKey(point, tolerance) === pointToKey(end, tolerance)) return false;

  const v = { x: end.x - start.x, y: end.y - start.y };
  const L = Math.sqrt(v.x * v.x + v.y * v.y);
  if (L < 1e-9) return false;

  const w = { x: point.x - start.x, y: point.y - start.y };
  const t = (v.x * w.x + v.y * w.y) / (L * L);
  if (t < tolerance || t > 1 - tolerance) return false;

  const projX = start.x + t * v.x;
  const projY = start.y + t * v.y;
  const dist = Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);

  return dist < tolerance;
}

// ── Junction detection ──

function findJunctions(walls) {
  const junctions = new Map();

  // Group walls by endpoints
  for (const wall of walls) {
    const startPt = { x: wall.start[0], y: wall.start[1] };
    const endPt = { x: wall.end[0], y: wall.end[1] };

    const keyStart = pointToKey(startPt);
    const keyEnd = pointToKey(endPt);

    if (!junctions.has(keyStart)) {
      junctions.set(keyStart, { meetingPoint: startPt, connectedWalls: [] });
    }
    junctions.get(keyStart).connectedWalls.push({ wall, endType: "start" });

    if (!junctions.has(keyEnd)) {
      junctions.set(keyEnd, { meetingPoint: endPt, connectedWalls: [] });
    }
    junctions.get(keyEnd).connectedWalls.push({ wall, endType: "end" });
  }

  // Detect T-junctions (wall passing through another wall's midpoint)
  for (const [_key, junction] of junctions.entries()) {
    for (const wall of walls) {
      if (junction.connectedWalls.some(cw => cw.wall.id === wall.id)) continue;
      if (pointOnWallSegment(junction.meetingPoint, wall)) {
        junction.connectedWalls.push({ wall, endType: "passthrough" });
      }
    }
  }

  // Keep only junctions with 2+ walls
  const actual = new Map();
  for (const [key, junction] of junctions.entries()) {
    if (junction.connectedWalls.length >= 2) actual.set(key, junction);
  }
  return actual;
}

// ── Miter calculation ──

function calculateJunctionIntersections(junction, getThickness) {
  const { meetingPoint, connectedWalls } = junction;
  const processedWalls = [];

  for (const { wall, endType } of connectedWalls) {
    const halfT = getThickness(wall) / 2;

    if (endType === "passthrough") {
      // T-junction: add both directions
      const v1 = { x: wall.end[0] - wall.start[0], y: wall.end[1] - wall.start[1] };
      const v2 = { x: -v1.x, y: -v1.y };

      for (const v of [v1, v2]) {
        const L = Math.sqrt(v.x * v.x + v.y * v.y);
        if (L < 1e-9) continue;

        const nUnit = { x: -v.y / L, y: v.x / L };
        const pA = { x: meetingPoint.x + nUnit.x * halfT, y: meetingPoint.y + nUnit.y * halfT };
        const pB = { x: meetingPoint.x - nUnit.x * halfT, y: meetingPoint.y - nUnit.y * halfT };

        processedWalls.push({
          wallId: wall.id,
          angle: Math.atan2(v.y, v.x),
          edgeA: createLineFromPointAndVector(pA, v),
          edgeB: createLineFromPointAndVector(pB, v),
          isPassthrough: true,
        });
      }
    } else {
      // Normal endpoint
      const v = endType === "start"
        ? { x: wall.end[0] - wall.start[0], y: wall.end[1] - wall.start[1] }
        : { x: wall.start[0] - wall.end[0], y: wall.start[1] - wall.end[1] };

      const L = Math.sqrt(v.x * v.x + v.y * v.y);
      if (L < 1e-9) continue;

      const nUnit = { x: -v.y / L, y: v.x / L };
      const pA = { x: meetingPoint.x + nUnit.x * halfT, y: meetingPoint.y + nUnit.y * halfT };
      const pB = { x: meetingPoint.x - nUnit.x * halfT, y: meetingPoint.y - nUnit.y * halfT };

      processedWalls.push({
        wallId: wall.id,
        angle: Math.atan2(v.y, v.x),
        edgeA: createLineFromPointAndVector(pA, v),
        edgeB: createLineFromPointAndVector(pB, v),
        isPassthrough: false,
      });
    }
  }

  // Sort by outgoing angle
  processedWalls.sort((a, b) => a.angle - b.angle);

  const wallIntersections = new Map();
  const n = processedWalls.length;
  if (n < 2) return wallIntersections;

  // Intersect adjacent wall edges
  for (let i = 0; i < n; i++) {
    const wall1 = processedWalls[i];
    const wall2 = processedWalls[(i + 1) % n];

    const det = wall1.edgeA.a * wall2.edgeB.b - wall2.edgeB.a * wall1.edgeA.b;
    if (Math.abs(det) < 1e-9) continue; // parallel

    const p = {
      x: (wall1.edgeA.b * wall2.edgeB.c - wall2.edgeB.b * wall1.edgeA.c) / det,
      y: (wall2.edgeB.a * wall1.edgeA.c - wall1.edgeA.a * wall2.edgeB.c) / det,
    };

    // Only assign to non-passthrough walls
    if (!wall1.isPassthrough) {
      if (!wallIntersections.has(wall1.wallId)) wallIntersections.set(wall1.wallId, {});
      wallIntersections.get(wall1.wallId).left = p;
    }
    if (!wall2.isPassthrough) {
      if (!wallIntersections.has(wall2.wallId)) wallIntersections.set(wall2.wallId, {});
      wallIntersections.get(wall2.wallId).right = p;
    }
  }

  return wallIntersections;
}

// ── Main export ──

/**
 * Calculates miter data for all walls on a level.
 * Returns junction data with intersection points that define proper wall corner geometry.
 *
 * Usage:
 *   const { junctionData, junctions } = calculateLevelMiters(walls);
 *   // For each wall, check junctionData entries for left/right miter points
 *   // Use these points to build ExtrudeGeometry paths instead of simple rectangles
 */
export function calculateLevelMiters(walls) {
  const getThickness = wall => wall.thickness ?? 0.5; // default 6" in feet
  const junctions = findJunctions(walls);
  const junctionData = new Map();

  for (const [key, junction] of junctions.entries()) {
    const wallIntersections = calculateJunctionIntersections(junction, getThickness);
    junctionData.set(key, wallIntersections);
  }

  return { junctionData, junctions };
}

/**
 * Gets wall IDs that share junctions with the given dirty walls.
 * Used for dirty-node tracking — when a wall changes, its neighbors need re-mitering.
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

      const wallStart = { x: wall.start[0], y: wall.start[1] };
      const wallEnd = { x: wall.end[0], y: wall.end[1] };

      // Check endpoint connections
      if (
        pointToKey(wallStart) === pointToKey(dirtyStart) ||
        pointToKey(wallStart) === pointToKey(dirtyEnd) ||
        pointToKey(wallEnd) === pointToKey(dirtyStart) ||
        pointToKey(wallEnd) === pointToKey(dirtyEnd)
      ) { adjacent.add(wall.id); continue; }

      // Check T-junction connections
      if (pointOnWallSegment(dirtyStart, wall) || pointOnWallSegment(dirtyEnd, wall)) {
        adjacent.add(wall.id); continue;
      }
      if (pointOnWallSegment(wallStart, dirtyWall) || pointOnWallSegment(wallEnd, dirtyWall)) {
        adjacent.add(wall.id);
      }
    }
  }

  return adjacent;
}
