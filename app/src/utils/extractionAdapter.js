// ══════════════════════════════════════════════════════════════════════
// Extraction Adapter — decouples predictiveEngine from pdfExtractor
// All extraction calls from the predictive engine go through here.
// ══════════════════════════════════════════════════════════════════════

import {
  extractPageData,
  findNearestTag,
  findAdjacentText,
  findAllTagInstances,
  findPlanTagInstances,
  isLikelyTag,
  detectScheduleRegions,
  isInScheduleRegion,
  getScheduleRegions,
} from "./pdfExtractor";

// ── Direct re-exports ──────────────────────────────────────────────
export { extractPageData, findNearestTag, findAdjacentText };

// ── Renamed re-export for clarity ──────────────────────────────────
/** Synchronous check: does this text look like a construction tag? */
export const isValidTag = isLikelyTag;

// ── Unified schedule-region helpers ────────────────────────────────

/**
 * Check whether a point falls inside any schedule/legend region.
 * Accepts either a pre-built regions array OR an extractedData object
 * (from which regions are derived automatically).
 *
 * Signatures:
 *   isPointInSchedule(x, y, regions[])
 *   isPointInSchedule(x, y, extractedData)
 */
export function isPointInSchedule(x, y, regionsOrData) {
  const regions = Array.isArray(regionsOrData)
    ? regionsOrData
    : getOrDetectScheduleRegions(regionsOrData);
  return isInScheduleRegion(x, y, regions);
}

/**
 * Resolve schedule regions from every available source, in priority order:
 *   1. Pre-computed on extractedData.scheduleRegions
 *   2. External regions registered via scanStore (getScheduleRegions)
 *   3. Fresh detection from text/rects (detectScheduleRegions)
 *
 * Replaces the scattered `getScheduleRegions(id) || data.scheduleRegions || detectScheduleRegions(data)` pattern.
 */
export function getOrDetectScheduleRegions(extractedDataOrId, extractedData) {
  // Called with (drawingId, data) or (data)
  if (typeof extractedDataOrId === "string") {
    const drawingId = extractedDataOrId;
    const data = extractedData;
    const external = getScheduleRegions(drawingId);
    if (external && external.length > 0) return external;
    if (data?.scheduleRegions?.length > 0) return data.scheduleRegions;
    return detectScheduleRegions(data) || [];
  }
  // Called with (extractedData) — no separate drawingId
  const data = extractedDataOrId;
  if (data?.scheduleRegions?.length > 0) return data.scheduleRegions;
  return detectScheduleRegions(data) || [];
}

/**
 * Find all instances of a tag on the plan area of a drawing,
 * with optional schedule filtering (default: on).
 *
 * Wraps findPlanTagInstances which already excludes schedule regions.
 * If you need ALL instances including schedules, pass { includeSchedules: true }.
 */
export function getTagInstancesOnPlan(extractedData, tag, opts = {}) {
  if (opts.includeSchedules) {
    return findAllTagInstances(extractedData, tag);
  }
  return findPlanTagInstances(extractedData, tag);
}
