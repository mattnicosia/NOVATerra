// geometrySnapping.js — Pure geometry functions for cleaning takeoff paths
// Snaps imprecise estimator clicks to orthogonal (right-angle) geometry
// so the 3D model looks like a real building, not a jagged sketch.
//
// All functions are pure (no store access, no side effects) and operate
// on arrays of {x, z} points in feet-space.

// ── Douglas-Peucker path simplification ─────────────────────────────
// Removes micro-jitter points that don't contribute meaningful shape.
// `epsilon` is the perpendicular distance threshold in feet.

function _perpendicularDist(pt, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dz = lineEnd.z - lineStart.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) {
    // lineStart === lineEnd → just point distance
    return Math.sqrt((pt.x - lineStart.x) ** 2 + (pt.z - lineStart.z) ** 2);
  }
  const t = ((pt.x - lineStart.x) * dx + (pt.z - lineStart.z) * dz) / lenSq;
  const projX = lineStart.x + t * dx;
  const projZ = lineStart.z + t * dz;
  return Math.sqrt((pt.x - projX) ** 2 + (pt.z - projZ) ** 2);
}

function _dpSimplify(points, epsilon, start, end) {
  if (end - start < 2) return points.slice(start, end + 1);

  let maxDist = 0;
  let maxIdx = start;
  for (let i = start + 1; i < end; i++) {
    const d = _perpendicularDist(points[i], points[start], points[end]);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = _dpSimplify(points, epsilon, start, maxIdx);
    const right = _dpSimplify(points, epsilon, maxIdx, end);
    // Merge, avoiding duplicate of the split point
    return [...left.slice(0, -1), ...right];
  }

  // All intermediate points are within epsilon — keep only endpoints
  return [points[start], points[end]];
}

/**
 * Douglas-Peucker simplification.
 * Removes points that deviate less than `epsilon` feet from the line
 * between their neighbors. Preserves corners.
 *
 * @param {Array<{x:number, z:number}>} path
 * @param {object} [options]
 * @param {number} [options.epsilon=0.5] - Distance threshold in feet
 * @returns {Array<{x:number, z:number}>}
 */
export function simplifyPath(path, options = {}) {
  if (path.length <= 2) return [...path];
  const epsilon = options.epsilon ?? 0.5;
  return _dpSimplify(path, epsilon, 0, path.length - 1);
}

// ── Orthogonal snapping ─────────────────────────────────────────────
// For each segment, if its angle is within `angleTolerance` degrees of
// a 90° axis (0°, 90°, 180°, 270°), snap it to that axis while
// preserving segment length.

/**
 * Snap path segments to the nearest orthogonal axis.
 *
 * @param {Array<{x:number, z:number}>} path
 * @param {object} [options]
 * @param {number} [options.angleTolerance=15] - Max degrees from axis to snap
 * @returns {Array<{x:number, z:number}>}
 */
export function snapToOrthogonal(path, options = {}) {
  if (path.length <= 1) return [...path];

  const tolerance = options.angleTolerance ?? 15;
  const result = [{ ...path[0] }];

  for (let i = 1; i < path.length; i++) {
    const prev = result[i - 1]; // use the already-snapped previous point
    const curr = path[i];
    const dx = curr.x - prev.x;
    const dz = curr.z - prev.z;
    const len = Math.sqrt(dx * dx + dz * dz);

    if (len < 1e-9) {
      // Zero-length segment — preserve as-is
      result.push({ ...curr });
      continue;
    }

    // Angle in degrees, normalized to [0, 360)
    let angle = Math.atan2(dz, dx) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    // Find nearest 90° axis
    const nearestAxis = Math.round(angle / 90) * 90;
    const diff = Math.abs(angle - nearestAxis);

    // Also check wrap-around (e.g., angle=358, nearestAxis=360→0)
    const diffWrap = Math.min(diff, 360 - diff);

    if (diffWrap <= tolerance) {
      // Snap to nearest axis
      const snappedRad = (nearestAxis % 360) * (Math.PI / 180);
      // Round cos/sin to eliminate floating-point noise (cos(90°) → 0, not 6e-16)
      const cosA = Math.round(Math.cos(snappedRad) * 1e10) / 1e10;
      const sinA = Math.round(Math.sin(snappedRad) * 1e10) / 1e10;
      result.push({
        x: prev.x + cosA * len,
        z: prev.z + sinA * len,
      });
    } else {
      // Preserve original direction
      result.push({ x: prev.x + dx, z: prev.z + dz });
    }
  }

  return result;
}

// ── Colinear alignment ──────────────────────────────────────────────
// Clusters vertical segments by X and horizontal segments by Z across
// multiple paths, then snaps each cluster to its median value.

/**
 * Align colinear segments across multiple paths.
 * Vertical segments with similar X values get merged to the same X.
 * Horizontal segments with similar Z values get merged to the same Z.
 *
 * @param {Array<Array<{x:number, z:number}>>} paths - Multiple paths
 * @param {object} [options]
 * @param {number} [options.clusterTolerance=1] - Max feet difference to cluster
 * @param {number} [options.axisThreshold=0.5] - Max deviation to consider segment axis-aligned
 * @returns {Array<Array<{x:number, z:number}>>}
 */
export function alignColinearSegments(paths, options = {}) {
  if (paths.length === 0) return [];

  const clusterTol = options.clusterTolerance ?? 1;
  const axisThr = options.axisThreshold ?? 0.5;

  // Collect all axis-aligned segment coordinates
  // verticalXs: array of { value: X, pathIdx, pointIdxs: [i, i+1] }
  // horizontalZs: array of { value: Z, pathIdx, pointIdxs: [i, i+1] }
  const verticalXs = [];
  const horizontalZs = [];

  paths.forEach((path, pi) => {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const dx = Math.abs(b.x - a.x);
      const dz = Math.abs(b.z - a.z);

      if (dx <= axisThr && dz > axisThr) {
        // Vertical segment — record X values
        verticalXs.push({ value: (a.x + b.x) / 2, pathIdx: pi, pointIdxs: [i, i + 1] });
      } else if (dz <= axisThr && dx > axisThr) {
        // Horizontal segment — record Z values
        horizontalZs.push({ value: (a.z + b.z) / 2, pathIdx: pi, pointIdxs: [i, i + 1] });
      }
    }
  });

  // Clone paths for mutation
  const result = paths.map(p => p.map(pt => ({ ...pt })));

  // Cluster and align vertical segments by X
  _clusterAndAlign(verticalXs, clusterTol, result, "x");

  // Cluster and align horizontal segments by Z
  _clusterAndAlign(horizontalZs, clusterTol, result, "z");

  return result;
}

function _clusterAndAlign(entries, tolerance, paths, axis) {
  if (entries.length === 0) return;

  // Sort by value
  const sorted = [...entries].sort((a, b) => a.value - b.value);

  // Greedy clustering
  const clusters = [];
  let cluster = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].value - cluster[0].value <= tolerance) {
      cluster.push(sorted[i]);
    } else {
      clusters.push(cluster);
      cluster = [sorted[i]];
    }
  }
  clusters.push(cluster);

  // For each cluster with 2+ members, snap all points to median
  for (const cl of clusters) {
    if (cl.length < 2) continue;

    const values = cl.map(e => e.value);
    values.sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)];

    for (const entry of cl) {
      for (const ptIdx of entry.pointIdxs) {
        paths[entry.pathIdx][ptIdx][axis] = median;
      }
    }
  }
}

// ── cleanPath — convenience pipeline ────────────────────────────────

/**
 * Full cleaning pipeline for a single path:
 * 1. Douglas-Peucker simplification (remove jitter)
 * 2. Orthogonal snapping (straighten near-axis segments)
 * 3. Remove zero-length segments that result from collapsing
 *
 * @param {Array<{x:number, z:number}>} path
 * @param {object} [options]
 * @param {number} [options.epsilon=0.5] - Simplification threshold (feet)
 * @param {number} [options.angleTolerance=15] - Snap tolerance (degrees)
 * @returns {Array<{x:number, z:number}>}
 */
export function cleanPath(path, options = {}) {
  if (path.length <= 1) return [...path];

  // Step 1: Simplify (remove micro-jitter)
  const simplified = simplifyPath(path, { epsilon: options.epsilon ?? 0.5 });

  // Step 2: Snap to orthogonal axes
  const snapped = snapToOrthogonal(simplified, { angleTolerance: options.angleTolerance ?? 15 });

  // Step 3: Remove zero-length segments (consecutive duplicate points)
  const MIN_SEG_LEN = 0.05; // 0.05 feet ≈ 0.6 inches
  const cleaned = [snapped[0]];
  for (let i = 1; i < snapped.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    const dx = Math.abs(snapped[i].x - prev.x);
    const dz = Math.abs(snapped[i].z - prev.z);
    if (dx + dz > MIN_SEG_LEN) {
      cleaned.push(snapped[i]);
    }
  }

  return cleaned;
}
