/**
 * ResourceFieldRenderer — Pure Canvas Drawing for the Orbital Resource Field
 *
 * No React, no DOM — just ctx in, pixels out.
 * Called each RAF tick from ResourceField.jsx.
 *
 * Visual language:
 *   0–50%  util → calm (blue, slow)
 *   50–80% util → healthy (accent, medium)
 *   80–100% util → warm (orange, quickening)
 *   >100%  util → hot (red, urgent)
 */

import { polarToXY, hexToRgb, hexAlpha } from "@/utils/fieldPhysics";

// ── Helpers ─────────────────────────────────────────────────

/** Wide-tracked uppercase text (Canvas has no letterSpacing) */
function drawTracked(ctx, text, x, y, spacing = 1.5) {
  const chars = text.split("");
  let tw = 0;
  for (const ch of chars) tw += ctx.measureText(ch).width + spacing;
  tw -= spacing;
  let cx = x - tw / 2;
  for (const ch of chars) {
    const cw = ctx.measureText(ch).width;
    ctx.fillText(ch, cx + cw / 2, y);
    cx += cw + spacing;
  }
}

/** Format utilization as percentage string */
function fmtUtil(v) {
  return `${Math.round(v * 100)}%`;
}

// ── Main Render ─────────────────────────────────────────────

/**
 * Render one frame of the orbital resource field.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} params
 * @param {number} params.w - Canvas CSS width
 * @param {number} params.h - Canvas CSS height
 * @param {number} params.cx - Center x
 * @param {number} params.cy - Center y
 * @param {number} params.fieldRadius - Max usable radius
 * @param {Array} params.rings - Ring data from useFieldParticles
 * @param {Array} params.unassignedParticles - Outer ring drifters
 * @param {number} params.unassignedRadius - Radius for unassigned ring
 * @param {number} params.teamUtilization - 0–1+ average
 * @param {object} params.colors - Theme colors { accent, blue, green, orange, red, text, textDim, textMuted, bg, surface }
 * @param {string|null} params.hoveredNodeId - Currently hovered node
 * @param {number|null} params.hoveredRingIdx - Ring index of hovered node
 * @param {string|null} params.selectedNodeId - Currently selected node
 * @param {number} params.time - Elapsed seconds (for animation)
 * @param {boolean} params.reducedMotion - prefers-reduced-motion
 */
export function renderField(ctx, params) {
  const {
    w, h, cx, cy, fieldRadius,
    rings, unassignedParticles, unassignedRadius,
    teamUtilization, colors,
    hoveredNodeId, hoveredRingIdx, selectedNodeId,
    time, reducedMotion,
  } = params;

  ctx.clearRect(0, 0, w, h);

  // ── 1. Center glow (team health) ──
  drawCenterGlow(ctx, cx, cy, teamUtilization, colors, time);

  // ── 2. Rings ──
  for (let ri = 0; ri < rings.length; ri++) {
    const ring = rings[ri];
    const isHoveredRing = hoveredRingIdx === ri;
    drawRing(ctx, cx, cy, ring, ri, isHoveredRing, time, reducedMotion, colors);
  }

  // ── 3. Unassigned outer ring ──
  if (unassignedParticles.length > 0) {
    drawUnassignedRing(ctx, cx, cy, unassignedRadius, unassignedParticles, time, reducedMotion, colors);
  }

  // ── 4. Collaboration tethers ──
  drawTethers(ctx, cx, cy, rings, time, colors);

  // ── 5. Nodes (on top of rings) ──
  for (let ri = 0; ri < rings.length; ri++) {
    const ring = rings[ri];
    for (const node of ring.nodes) {
      const isHovered = hoveredNodeId === node.id;
      const isSelected = selectedNodeId === node.id;
      drawNode(ctx, cx, cy, ring, node, isHovered, isSelected, time, reducedMotion, colors);
    }
  }

  // ── 6. Ring labels (estimator names) ──
  for (let ri = 0; ri < rings.length; ri++) {
    drawRingLabel(ctx, cx, cy, rings[ri], hoveredRingIdx === ri, colors);
  }

  // ── 7. Center text ──
  drawCenterText(ctx, cx, cy, teamUtilization, rings.length, colors, w);
}

// ── Center Glow ─────────────────────────────────────────────

function drawCenterGlow(ctx, cx, cy, util, colors, time) {
  // Glow color shifts with team health
  let glowColor;
  if (util <= 0.5) glowColor = colors.blue || "#60A5FA";
  else if (util <= 0.8) glowColor = colors.accent || "#8B5CF6";
  else if (util <= 1.0) glowColor = colors.orange || "#FF9500";
  else glowColor = colors.red || "#FF3B30";

  const { r, g, b } = hexToRgb(glowColor);

  // Breathing pulse
  const pulse = 0.35 + Math.sin(time * 1.2) * 0.1;
  const coreR = 44 + Math.sin(time * 0.8) * 5;

  // Wide ambient glow
  const grdWide = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR + 35);
  grdWide.addColorStop(0, `rgba(${r},${g},${b},${pulse * 0.6})`);
  grdWide.addColorStop(0.3, `rgba(${r},${g},${b},${pulse * 0.25})`);
  grdWide.addColorStop(0.7, `rgba(${r},${g},${b},${pulse * 0.06})`);
  grdWide.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.beginPath();
  ctx.arc(cx, cy, coreR + 35, 0, Math.PI * 2);
  ctx.fillStyle = grdWide;
  ctx.fill();

  // Tight core glow
  const grdCore = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 0.6);
  grdCore.addColorStop(0, `rgba(${r},${g},${b},${pulse + 0.2})`);
  grdCore.addColorStop(0.5, `rgba(${r},${g},${b},${pulse * 0.4})`);
  grdCore.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.beginPath();
  ctx.arc(cx, cy, coreR * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = grdCore;
  ctx.fill();

  // Bright center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = glowColor;
  ctx.fill();

  // Specular on center dot
  const specGrd = ctx.createRadialGradient(cx - 1.5, cy - 1.5, 0, cx, cy, 5);
  specGrd.addColorStop(0, `rgba(255,255,255,0.6)`);
  specGrd.addColorStop(0.5, `rgba(255,255,255,0.1)`);
  specGrd.addColorStop(1, `rgba(255,255,255,0)`);
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = specGrd;
  ctx.fill();
}

// ── Ring Drawing ────────────────────────────────────────────

function drawRing(ctx, cx, cy, ring, ringIdx, isHovered, time, reducedMotion, colors) {
  const { r, g, b } = hexToRgb(ring.statusColor);

  // Ring circle — thin, with opacity pulse
  const basePulse = reducedMotion ? 0.2 : 0.15 + Math.sin(time * 0.6 + ringIdx * 1.2) * 0.08;
  const alpha = isHovered ? basePulse + 0.15 : basePulse;

  ctx.beginPath();
  ctx.arc(cx, cy, ring.radius, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
  ctx.lineWidth = isHovered ? 2 : 1.5;
  ctx.stroke();

  // Subtle ring glow (bloom effect)
  if (!reducedMotion) {
    ctx.beginPath();
    ctx.arc(cx, cy, ring.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.3})`;
    ctx.lineWidth = 6;
    ctx.stroke();
  }
}

// ── Node Drawing ────────────────────────────────────────────

function drawNode(ctx, cx, cy, ring, node, isHovered, isSelected, time, reducedMotion, colors) {
  // Compute animated angle
  let angle = node.angle;
  if (!reducedMotion) {
    angle += time * ring.angularVelocity;
  }

  const pos = polarToXY(angle, ring.radius, cx, cy);
  const { r, g, b } = hexToRgb(node.statusColor);
  const size = node.size;

  // ── Outer glow halo (wide, soft bloom) ──
  const outerGlow = isHovered ? size * 7 : isSelected ? size * 6 : size * 5;
  const outerAlpha = isHovered ? 0.3 : isSelected ? 0.25 : 0.18;
  const grdOuter = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, outerGlow);
  grdOuter.addColorStop(0, `rgba(${r},${g},${b},${outerAlpha})`);
  grdOuter.addColorStop(0.4, `rgba(${r},${g},${b},${outerAlpha * 0.4})`);
  grdOuter.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, outerGlow, 0, Math.PI * 2);
  ctx.fillStyle = grdOuter;
  ctx.fill();

  // ── Inner glow (tight, bright — gives sphere depth) ──
  const innerGlow = isHovered ? size * 3.5 : isSelected ? size * 3 : size * 2.5;
  const innerAlpha = isHovered ? 0.5 : isSelected ? 0.45 : 0.35;
  const grdInner = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, innerGlow);
  grdInner.addColorStop(0, `rgba(${r},${g},${b},${innerAlpha})`);
  grdInner.addColorStop(0.5, `rgba(${r},${g},${b},${innerAlpha * 0.3})`);
  grdInner.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, innerGlow, 0, Math.PI * 2);
  ctx.fillStyle = grdInner;
  ctx.fill();

  // ── Node core ──
  const coreSize = isHovered ? size * 1.4 : isSelected ? size * 1.3 : size * 1.1;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, coreSize, 0, Math.PI * 2);
  ctx.fillStyle = node.statusColor;
  ctx.fill();

  // ── Specular highlight (sphere illusion) ──
  const specX = pos.x - coreSize * 0.25;
  const specY = pos.y - coreSize * 0.25;
  const specGrd = ctx.createRadialGradient(specX, specY, 0, pos.x, pos.y, coreSize);
  specGrd.addColorStop(0, `rgba(255,255,255,0.55)`);
  specGrd.addColorStop(0.4, `rgba(255,255,255,0.12)`);
  specGrd.addColorStop(1, `rgba(255,255,255,0)`);
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, coreSize, 0, Math.PI * 2);
  ctx.fillStyle = specGrd;
  ctx.fill();

  // ── Selection ring ──
  if (isSelected) {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, coreSize + 4, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,0.6)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ── Pending ghost trail (NOVA suggestion) ──
  if (node.isPending && !reducedMotion) {
    const trailAlpha = 0.08 + Math.sin(time * 3) * 0.04;
    for (let t = 1; t <= 4; t++) {
      const trailAngle = angle - t * 0.12 * ring.angularVelocity;
      const trailPos = polarToXY(trailAngle, ring.radius, cx, cy);
      ctx.beginPath();
      ctx.arc(trailPos.x, trailPos.y, size * (1 - t * 0.15), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${trailAlpha * (1 - t * 0.2)})`;
      ctx.fill();
    }
  }

  // ── Hover label ──
  if (isHovered) {
    drawNodeLabel(ctx, pos.x, pos.y, node, coreSize, colors);
  }

  // Store computed position on node for hit-testing
  node._x = pos.x;
  node._y = pos.y;
  node._computedAngle = angle;
}

// ── Node Label (on hover) ───────────────────────────────────

function drawNodeLabel(ctx, x, y, node, nodeRadius, colors) {
  const labelY = y - nodeRadius - 10;
  const label = node.label;
  const hours = node.hours > 0 ? `${Math.round(node.hours)}h` : "";
  const due = node.bidDue ? formatDueDate(node.bidDue) : "";

  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  // Name
  ctx.font = "600 11px 'Switzer', sans-serif";
  ctx.fillStyle = colors.text || "#fff";
  ctx.fillText(label, x, labelY);

  // Hours + due date
  if (hours || due) {
    const meta = [hours, due].filter(Boolean).join(" · ");
    ctx.font = "500 9px 'Switzer', sans-serif";
    ctx.fillStyle = colors.textDim || "#999";
    ctx.fillText(meta, x, labelY - 13);
  }
}

// ── Ring Label (estimator name) ─────────────────────────────

function drawRingLabel(ctx, cx, cy, ring, isHovered, colors) {
  // Position: left side of ring, shifted outward
  const lx = cx - ring.radius - 12;
  const ly = cy;

  ctx.save();
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.font = `${isHovered ? 600 : 500} 10px 'Switzer', sans-serif`;
  ctx.fillStyle = isHovered ? (colors.text || "#fff") : (colors.textDim || "#999");
  ctx.fillText(ring.name, lx, ly);

  // Small utilization badge
  const utilStr = fmtUtil(ring.utilization);
  const utilX = lx - ctx.measureText(ring.name).width - 8;
  ctx.font = "500 8px 'Switzer', sans-serif";
  ctx.fillStyle = ring.statusColor;
  ctx.fillText(utilStr, utilX, ly);

  ctx.restore();
}

// ── Unassigned Ring ─────────────────────────────────────────

function drawUnassignedRing(ctx, cx, cy, radius, particles, time, reducedMotion, colors) {
  // Dashed outer ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = hexAlpha(colors.textDim || "#666", 0.25);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Drift particles
  const { r, g, b } = hexToRgb(colors.orange || "#FF9500");
  for (const p of particles) {
    let angle = p.angle;
    if (!reducedMotion) {
      angle += time * p.drift + Math.sin(time * 0.5 + p.phase) * 0.15;
    }
    const pos = polarToXY(angle, radius, cx, cy);

    // Outer glow
    const outerR = p.size * 4.5;
    const grdOuter = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, outerR);
    grdOuter.addColorStop(0, `rgba(${r},${g},${b},0.22)`);
    grdOuter.addColorStop(0.4, `rgba(${r},${g},${b},0.08)`);
    grdOuter.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, outerR, 0, Math.PI * 2);
    ctx.fillStyle = grdOuter;
    ctx.fill();

    // Inner glow
    const innerR = p.size * 2.2;
    const grdInner = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, innerR);
    grdInner.addColorStop(0, `rgba(${r},${g},${b},0.4)`);
    grdInner.addColorStop(0.5, `rgba(${r},${g},${b},0.12)`);
    grdInner.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, innerR, 0, Math.PI * 2);
    ctx.fillStyle = grdInner;
    ctx.fill();

    // Core
    const coreR = p.size * 1.1;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, coreR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r},${g},${b},0.75)`;
    ctx.fill();

    // Specular
    const sx = pos.x - coreR * 0.25;
    const sy = pos.y - coreR * 0.25;
    const specGrd = ctx.createRadialGradient(sx, sy, 0, pos.x, pos.y, coreR);
    specGrd.addColorStop(0, `rgba(255,255,255,0.4)`);
    specGrd.addColorStop(0.4, `rgba(255,255,255,0.08)`);
    specGrd.addColorStop(1, `rgba(255,255,255,0)`);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, coreR, 0, Math.PI * 2);
    ctx.fillStyle = specGrd;
    ctx.fill();

    // Store position for hit-testing
    p._x = pos.x;
    p._y = pos.y;
  }

  // "UNASSIGNED" label
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "500 8px 'Switzer', sans-serif";
  ctx.fillStyle = hexAlpha(colors.textDim || "#666", 0.4);
  drawTracked(ctx, `${particles.length} UNASSIGNED`, cx, cy - radius - 8, 1.2);
  ctx.restore();
}

// ── Collaboration Tethers ───────────────────────────────────

function drawTethers(ctx, cx, cy, rings, time, colors) {
  const drawn = new Set();

  for (let ri = 0; ri < rings.length; ri++) {
    const ring = rings[ri];
    for (const node of ring.nodes) {
      if (node.collaboratorRingIdx == null) continue;
      const key = `${node.id}-${ri}-${node.collaboratorRingIdx}`;
      const reverseKey = `${node.id}-${node.collaboratorRingIdx}-${ri}`;
      if (drawn.has(key) || drawn.has(reverseKey)) continue;
      drawn.add(key);

      // Find partner node
      const partnerRing = rings[node.collaboratorRingIdx];
      if (!partnerRing) continue;
      const partner = partnerRing.nodes.find(n => n.id === node.id);
      if (!partner || !node._x || !partner._x) continue;

      // Draw curved tether
      const { r, g, b } = hexToRgb(colors.accent || "#8B5CF6");
      const alpha = 0.12 + Math.sin(time * 2) * 0.04;

      ctx.beginPath();
      ctx.moveTo(node._x, node._y);
      // Bezier control point at center
      ctx.quadraticCurveTo(cx, cy, partner._x, partner._y);
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

// ── Center Text ─────────────────────────────────────────────

function drawCenterText(ctx, cx, cy, teamUtil, ringCount, colors, canvasWidth) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Team utilization %
  const fontSize = Math.min(22, canvasWidth * 0.045);
  ctx.font = `700 ${fontSize}px 'Switzer', sans-serif`;
  ctx.fillStyle = colors.text || "#fff";
  ctx.fillText(fmtUtil(teamUtil), cx, cy - 4);

  // "TEAM LOAD" label
  ctx.font = `600 ${Math.min(8, canvasWidth * 0.018)}px 'Switzer', sans-serif`;
  ctx.fillStyle = colors.textDim || "#999";
  drawTracked(ctx, "TEAM LOAD", cx, cy + 12, 1.5);

  // Estimator count at bottom
  if (ringCount > 0) {
    ctx.font = `500 ${Math.min(8, canvasWidth * 0.018)}px 'Switzer', sans-serif`;
    ctx.fillStyle = colors.textMuted || "#666";
    drawTracked(ctx, `${ringCount} ESTIMATOR${ringCount !== 1 ? "S" : ""}`, cx, cy + 24, 1.2);
  }

  ctx.restore();
}

// ── Animated Hit-Test (uses stored _x, _y from render) ──────

/**
 * Hit-test using the positions computed during the last render frame.
 * This accounts for orbital animation — hitTestNodes in fieldPhysics.js
 * uses static angles, but this uses the actual rendered positions.
 *
 * @returns {{ ringIdx, nodeIdx, node, x, y } | null}
 */
export function hitTestRendered(mx, my, rings, hitPadding = 8) {
  let closest = null;
  let closestDist = Infinity;

  for (let ri = 0; ri < rings.length; ri++) {
    const ring = rings[ri];
    for (let ni = 0; ni < ring.nodes.length; ni++) {
      const node = ring.nodes[ni];
      if (node._x == null) continue;
      const dx = mx - node._x;
      const dy = my - node._y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hitR = node.size + hitPadding;
      if (dist < hitR && dist < closestDist) {
        closest = { ringIdx: ri, nodeIdx: ni, node, x: node._x, y: node._y };
        closestDist = dist;
      }
    }
  }
  return closest;
}

/**
 * Hit-test unassigned particles (uses stored _x, _y from render).
 */
export function hitTestUnassigned(mx, my, particles, hitPadding = 8) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p._x == null) continue;
    const dx = mx - p._x;
    const dy = my - p._y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < p.size + hitPadding) return { idx: i, particle: p, x: p._x, y: p._y };
  }
  return null;
}

// ── Date formatting ─────────────────────────────────────────

function formatDueDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  const now = new Date();
  const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff <= 7) return `${diff}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
