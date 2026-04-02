/**
 * predictionGuardrails.js — Sanity checks on Vision prediction output.
 *
 * Applied AFTER Vision API returns predictions, BEFORE showing to user.
 * Prevents hallucination, clustering, and edge-of-drawing false positives.
 *
 * Five guardrails:
 *   1. Quantity Anchor — flag if count deviates wildly from cross-sheet average
 *   2. Coordinate Clustering — penalize if >60% in one quadrant
 *   3. Confidence Floor — suppress predictions below 0.35
 *   4. Max Cap — never return >200 predictions per sheet
 *   5. Edge Avoidance — penalize predictions within 2% of drawing edges
 */

import { getCrossSheetData } from "./crossSheetLearning";

/**
 * Apply all guardrails to a set of Vision predictions.
 *
 * @param {Array} predictions — Array of prediction objects with { point: {x,y}, confidence, ... }
 * @param {Object} options
 * @param {string} options.takeoffId — For cross-sheet density lookup
 * @param {number} options.imageWidth — Drawing width in pixels (for edge calculation)
 * @param {number} options.imageHeight — Drawing height in pixels
 * @returns {{ predictions: Array, guardrailFlags: string[], removed: number }}
 */
export function applyGuardrails(predictions, options = {}) {
  if (!predictions || predictions.length === 0) {
    return { predictions: [], guardrailFlags: [], removed: 0 };
  }

  const flags = [];
  let result = [...predictions];
  const initialCount = result.length;

  // ── 1. Quantity Anchor ──────────────────────────────────────
  // If cross-sheet data suggests ~20 elements/sheet but we got 60, flag it
  const crossSheetData = options.takeoffId
    ? getCrossSheetData(options.takeoffId)
    : null;

  if (crossSheetData && crossSheetData.size > 0) {
    const sheets = [...crossSheetData.values()];
    const avgPerSheet = sheets.reduce((s, sh) => s + (sh.accepted || 0) + (sh.userAdded || 0), 0) / sheets.length;

    if (avgPerSheet > 3 && result.length > avgPerSheet * 2.5) {
      flags.push(`quantity-anchor: ${result.length} predictions vs ${Math.round(avgPerSheet)} avg/sheet — reducing confidence`);
      result = result.map(p => ({ ...p, confidence: (p.confidence || 0.5) * 0.3 }));
    } else if (avgPerSheet > 3 && result.length < avgPerSheet * 0.2) {
      flags.push(`quantity-anchor: only ${result.length} predictions vs ${Math.round(avgPerSheet)} avg/sheet — may be missing elements`);
    }
  }

  // ── 2. Coordinate Clustering ───────────────────────────────
  // If >60% of predictions cluster in one quadrant, penalize
  if (result.length >= 4) {
    const quadrants = [0, 0, 0, 0]; // TL, TR, BL, BR
    result.forEach(p => {
      const pt = p.point || p;
      const x = pt.x || 0;
      const y = pt.y || 0;
      // Normalize to 0-1 range (predictions might be in pixels or percentages)
      const nx = options.imageWidth ? x / options.imageWidth : (x > 1 ? x / 100 : x);
      const ny = options.imageHeight ? y / options.imageHeight : (y > 1 ? y / 100 : y);
      const qi = (nx < 0.5 ? 0 : 1) + (ny < 0.5 ? 0 : 2);
      quadrants[qi]++;
    });

    const maxQuadrant = Math.max(...quadrants);
    const clusterRatio = maxQuadrant / result.length;
    if (clusterRatio > 0.6) {
      flags.push(`clustering: ${Math.round(clusterRatio * 100)}% of predictions in one quadrant — reducing confidence`);
      result = result.map(p => ({ ...p, confidence: (p.confidence || 0.5) * 0.4 }));
    }
  }

  // ── 3. Confidence Floor ────────────────────────────────────
  // Suppress predictions below 0.35 — don't show to user
  const beforeFloor = result.length;
  result = result.filter(p => (p.confidence || 0.5) >= 0.35);
  if (result.length < beforeFloor) {
    flags.push(`confidence-floor: suppressed ${beforeFloor - result.length} predictions below 0.35`);
  }

  // ── 4. Max Cap ─────────────────────────────────────────────
  // Never return >200 predictions per sheet
  if (result.length > 200) {
    flags.push(`max-cap: capped from ${result.length} to 200 predictions`);
    result = result
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 200);
  }

  // ── 5. Edge Avoidance ──────────────────────────────────────
  // Predictions within 2% of drawing edges → penalize confidence by 0.5×
  // (symbols near edges are usually title block or border elements)
  const EDGE_THRESHOLD = 0.02; // 2%
  let edgePenalized = 0;
  result = result.map(p => {
    const pt = p.point || p;
    const x = pt.x || 0;
    const y = pt.y || 0;
    const nx = options.imageWidth ? x / options.imageWidth : (x > 1 ? x / 100 : x);
    const ny = options.imageHeight ? y / options.imageHeight : (y > 1 ? y / 100 : y);

    const nearEdge =
      nx < EDGE_THRESHOLD || nx > (1 - EDGE_THRESHOLD) ||
      ny < EDGE_THRESHOLD || ny > (1 - EDGE_THRESHOLD);

    if (nearEdge) {
      edgePenalized++;
      return { ...p, confidence: (p.confidence || 0.5) * 0.5 };
    }
    return p;
  });
  if (edgePenalized > 0) {
    flags.push(`edge-avoidance: penalized ${edgePenalized} predictions near drawing edges`);
  }

  // Re-apply confidence floor after edge penalty
  const beforeSecondFloor = result.length;
  result = result.filter(p => (p.confidence || 0.5) >= 0.35);
  if (result.length < beforeSecondFloor) {
    flags.push(`confidence-floor-2: suppressed ${beforeSecondFloor - result.length} after edge penalty`);
  }

  // ── Duplicate suppression ──────────────────────────────────
  // Merge predictions within 30px radius (Vision sometimes returns near-duplicates)
  const MERGE_RADIUS = 30;
  const merged = [];
  const used = new Set();
  for (let i = 0; i < result.length; i++) {
    if (used.has(i)) continue;
    let best = result[i];
    for (let j = i + 1; j < result.length; j++) {
      if (used.has(j)) continue;
      const pi = best.point || best;
      const pj = result[j].point || result[j];
      const dx = (pi.x || 0) - (pj.x || 0);
      const dy = (pi.y || 0) - (pj.y || 0);
      if (Math.sqrt(dx * dx + dy * dy) < MERGE_RADIUS) {
        used.add(j);
        // Keep the higher-confidence one
        if ((result[j].confidence || 0) > (best.confidence || 0)) {
          best = result[j];
        }
      }
    }
    merged.push(best);
  }
  if (merged.length < result.length) {
    flags.push(`dedup: merged ${result.length - merged.length} near-duplicate predictions`);
    result = merged;
  }

  return {
    predictions: result,
    guardrailFlags: flags,
    removed: initialCount - result.length,
  };
}
