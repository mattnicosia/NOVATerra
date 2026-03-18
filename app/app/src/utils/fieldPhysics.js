/**
 * Resource Field — Orbital Physics & Hit-Testing
 *
 * Pure math functions for the orbital resource visualization.
 * No React, no DOM — just numbers in, numbers out.
 */

// ── Utilization → ring properties ─────────────────────────────

/** Angular velocity (rad/s) from utilization 0–1+ */
export function utilizationToSpeed(util) {
  if (util <= 0.5) return 0.1 + util * 0.3; // 0.1 – 0.25
  if (util <= 0.8) return 0.25 + (util - 0.5) * 0.67; // 0.25 – 0.45
  if (util <= 1.0) return 0.45 + (util - 0.8) * 1.25; // 0.45 – 0.7
  return 0.7 + Math.min(util - 1.0, 0.5) * 0.4; // 0.7 – 0.9 cap
}

/**
 * Map utilization to a status tier for color selection.
 * Returns a key into the theme color map.
 */
export function utilizationTier(util) {
  if (util <= 0.5) return "calm"; // blue
  if (util <= 0.8) return "healthy"; // accent
  if (util <= 1.0) return "warm"; // orange
  return "hot"; // red
}

// ── Ring layout ───────────────────────────────────────────────

/**
 * Compute ring radii for N estimators + 1 unassigned ring.
 * Rings are evenly spaced between innerRadius and outerRadius.
 *
 * @param {number} count - Number of estimator rings
 * @param {number} fieldRadius - Maximum usable radius (px)
 * @returns {number[]} - Array of radii, index 0 = innermost
 */
export function computeRingRadii(count, fieldRadius) {
  if (count === 0) return [];
  const innerR = fieldRadius * 0.25;
  const outerR = fieldRadius * 0.85;
  if (count === 1) return [fieldRadius * 0.55];
  const radii = [];
  for (let i = 0; i < count; i++) {
    radii.push(innerR + ((outerR - innerR) * i) / (count - 1));
  }
  return radii;
}

/** Radius for the unassigned outer ring */
export function unassignedRadius(fieldRadius) {
  return fieldRadius * 0.95;
}

// ── Node sizing ───────────────────────────────────────────────

/**
 * Node visual radius from estimated hours.
 * Uses sqrt scaling so large jobs don't dominate.
 */
export function nodeSize(hours) {
  return Math.max(4, Math.min(16, Math.sqrt(Math.max(hours, 1)) * 1.5));
}

// ── Node positioning ──────────────────────────────────────────

/**
 * Distribute N nodes evenly around a ring, with slight jitter.
 * Returns initial angles (radians).
 */
export function distributeNodes(count) {
  const angles = [];
  const step = (Math.PI * 2) / Math.max(count, 1);
  for (let i = 0; i < count; i++) {
    angles.push(step * i - Math.PI / 2); // start at top
  }
  return angles;
}

/**
 * Convert polar (angle, radius) to cartesian (x, y) relative to center.
 */
export function polarToXY(angle, radius, cx, cy) {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

// ── Hit-testing ───────────────────────────────────────────────

/**
 * Find the node under a given point. Returns the node object or null.
 * Checks all rings, returns closest if overlapping.
 *
 * @param {number} mx - Mouse x (canvas coords)
 * @param {number} my - Mouse y (canvas coords)
 * @param {Array} rings - Ring data with computed node positions
 * @param {number} cx - Center x
 * @param {number} cy - Center y
 * @param {number} hitPadding - Extra px around node for easier targeting
 * @returns {{ ringIdx: number, nodeIdx: number, node: object } | null}
 */
export function hitTestNodes(mx, my, rings, cx, cy, hitPadding = 6) {
  let closest = null;
  let closestDist = Infinity;

  for (let ri = 0; ri < rings.length; ri++) {
    const ring = rings[ri];
    for (let ni = 0; ni < ring.nodes.length; ni++) {
      const node = ring.nodes[ni];
      const pos = polarToXY(node.angle, ring.radius, cx, cy);
      const dx = mx - pos.x;
      const dy = my - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hitR = node.size + hitPadding;
      if (dist < hitR && dist < closestDist) {
        closest = { ringIdx: ri, nodeIdx: ni, node, x: pos.x, y: pos.y };
        closestDist = dist;
      }
    }
  }
  return closest;
}

/**
 * Find the ring label under a point (estimator name area).
 * Labels are rendered at the left side of each ring.
 */
export function hitTestRingLabel(mx, my, rings, cx, cy) {
  for (let ri = 0; ri < rings.length; ri++) {
    const ring = rings[ri];
    // Label is at angle π (left side), offset slightly
    const lx = cx - ring.radius - 8;
    const ly = cy;
    if (Math.abs(mx - lx) < 60 && Math.abs(my - ly) < 12) {
      return { ringIdx: ri, ring };
    }
  }
  return null;
}

// ── Color helpers ─────────────────────────────────────────────

/** Parse hex "#RRGGBB" to { r, g, b } */
export function hexToRgb(hex) {
  const h = (hex || "#888888").replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  };
}

/** rgba string from hex + alpha */
export function hexAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Date helpers ──────────────────────────────────────────────

/** Generate array of weekday date strings for next N weeks */
export function weekdayRange(startDate, weeks) {
  const days = [];
  const d = new Date(startDate);
  // Start from Monday of current week
  const dow = d.getDay();
  d.setDate(d.getDate() - ((dow + 6) % 7)); // back to Monday
  const end = weeks * 7;
  for (let i = 0; i < end; i++) {
    const current = new Date(d);
    current.setDate(d.getDate() + i);
    const day = current.getDay();
    if (day >= 1 && day <= 5) {
      days.push(current.toISOString().slice(0, 10));
    }
  }
  return days;
}
