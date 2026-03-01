// coverageGrid.js — Coverage grid engine for building outline analysis
// Subdivides floor outline into cells, tests overlap with takeoff-generated elements

import { uid } from '@/utils/format';

/**
 * Point-in-polygon test using ray casting algorithm.
 * @param {number} px - Test point X
 * @param {number} pz - Test point Z
 * @param {Array<{x:number, z:number}>} polygon - Polygon vertices
 * @returns {boolean}
 */
export function pointInPolygon(px, pz, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, zi = polygon[i].z;
    const xj = polygon[j].x, zj = polygon[j].z;
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Test if a point is near a line segment (within distance d).
 * @param {number} px - Point X
 * @param {number} pz - Point Z
 * @param {{x:number,z:number}} a - Line start
 * @param {{x:number,z:number}} b - Line end
 * @param {number} d - Max distance
 * @returns {boolean}
 */
function pointNearSegment(px, pz, a, b, d) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return Math.hypot(px - a.x, pz - a.z) <= d;
  let t = ((px - a.x) * dx + (pz - a.z) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx, projZ = a.z + t * dz;
  return Math.hypot(px - projX, pz - projZ) <= d;
}

/**
 * Build a coverage grid within the building outline.
 * @param {Array<{x:number, z:number}>} outline - Building outline polygon in feet
 * @param {number} cellSize - Grid cell size in feet (default 4)
 * @returns {Array<{id:string, cx:number, cz:number, size:number, covered:boolean, trades:string[]}>}
 */
export function buildCoverageGrid(outline, cellSize = 4) {
  if (!outline || outline.length < 3) return [];

  // Compute bounding box
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  outline.forEach(p => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  });

  // Guard against degenerate or excessively large grids
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  if (spanX < cellSize || spanZ < cellSize) return []; // outline too small
  const maxCells = 10000; // safety cap to prevent browser hang
  const estCells = (spanX / cellSize) * (spanZ / cellSize);
  const effectiveSize = estCells > maxCells ? Math.ceil(Math.sqrt((spanX * spanZ) / maxCells)) : cellSize;

  const half = effectiveSize / 2;
  const cells = [];

  // Subdivide bounding box into grid cells
  for (let x = minX + half; x < maxX; x += effectiveSize) {
    for (let z = minZ + half; z < maxZ; z += effectiveSize) {
      // Only include cells whose center is inside the building outline
      if (pointInPolygon(x, z, outline)) {
        cells.push({
          id: uid(),
          cx: x,
          cz: z,
          size: effectiveSize,
          covered: false,
          trades: [],
        });
      }
    }
  }

  return cells;
}

/**
 * Test each grid cell against building elements for coverage.
 * A cell is "covered" if any element geometry overlaps it.
 * @param {Array} grid - Grid cells from buildCoverageGrid
 * @param {Array} elements - 3D elements from modelStore
 * @returns {Array} Same grid cells with `covered` and `trades` updated
 */
export function testCoverage(grid, elements) {
  if (!grid.length || !elements.length) return grid;

  // Pre-process elements into testable shapes
  const shapes = elements.map(el => {
    const g = el.geometry;
    if (g.kind === 'extrudedPath' && g.path?.length >= 2) {
      return { type: 'path', path: g.path, thickness: g.thickness || 0.5, trade: el.trade };
    }
    if (g.kind === 'polygon' && g.points?.length >= 3) {
      return { type: 'polygon', points: g.points, trade: el.trade };
    }
    if (g.kind === 'box' && g.position) {
      return {
        type: 'box', trade: el.trade,
        minX: g.position.x - (g.width || 3) / 2,
        maxX: g.position.x + (g.width || 3) / 2,
        minZ: g.position.z - (g.depth || 3) / 2,
        maxZ: g.position.z + (g.depth || 3) / 2,
      };
    }
    return null;
  }).filter(Boolean);

  // Test each cell against all shapes
  grid.forEach(cell => {
    for (const shape of shapes) {
      let hit = false;

      if (shape.type === 'path') {
        // Test if cell center is near any segment of the path (buffered by thickness)
        const buf = Math.max(shape.thickness, cell.size / 2);
        for (let i = 0; i < shape.path.length - 1; i++) {
          if (pointNearSegment(cell.cx, cell.cz, shape.path[i], shape.path[i + 1], buf)) {
            hit = true;
            break;
          }
        }
      } else if (shape.type === 'polygon') {
        hit = pointInPolygon(cell.cx, cell.cz, shape.points);
      } else if (shape.type === 'box') {
        hit = cell.cx >= shape.minX && cell.cx <= shape.maxX &&
              cell.cz >= shape.minZ && cell.cz <= shape.maxZ;
      }

      if (hit) {
        cell.covered = true;
        if (!cell.trades.includes(shape.trade)) {
          cell.trades.push(shape.trade);
        }
      }
    }
  });

  return grid;
}

/**
 * Compute coverage statistics from grid.
 * @param {Array} grid - Grid cells with coverage data
 * @returns {{ total: number, covered: number, gap: number, pct: number }}
 */
export function computeCoverageStats(grid) {
  const total = grid.length;
  const covered = grid.filter(c => c.covered).length;
  const gap = total - covered;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
  return { total, covered, gap, pct };
}
