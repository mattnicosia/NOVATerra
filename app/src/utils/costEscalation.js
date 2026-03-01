// Cost Escalation — Normalize historical costs to present-day dollars
// Uses construction cost index data for accurate division-level escalation

import {
  getCompositeIndex,
  getDivisionIndex,
  getCurrentYear,
} from '@/constants/constructionCostIndex';

/**
 * Extract year from a date string or timestamp.
 * Handles: "2023-05-15", "May 15, 2023", "2023", Date objects, timestamps
 */
export function extractYear(dateValue) {
  if (!dateValue) return getCurrentYear();
  if (typeof dateValue === 'number') {
    // Could be a year (2023) or a timestamp (1698000000000)
    if (dateValue > 1900 && dateValue < 2100) return dateValue;
    return new Date(dateValue).getFullYear();
  }
  if (dateValue instanceof Date) return dateValue.getFullYear();
  if (typeof dateValue === 'string') {
    // Try ISO date
    const isoMatch = dateValue.match(/^(\d{4})/);
    if (isoMatch) return parseInt(isoMatch[1]);
    // Try "Month Day, Year" format
    const parsed = new Date(dateValue);
    if (!isNaN(parsed.getTime())) return parsed.getFullYear();
  }
  return getCurrentYear();
}

/**
 * Escalate a total cost from one year to another using composite index.
 * Returns the adjusted cost in target-year dollars.
 */
export function escalateCost(cost, fromYear, toYear = getCurrentYear()) {
  if (!cost || cost <= 0) return 0;
  const fromIndex = getCompositeIndex(fromYear);
  const toIndex = getCompositeIndex(toYear);
  if (fromIndex <= 0) return cost;
  return cost * (toIndex / fromIndex);
}

/**
 * Escalate a division-level cost using division-specific index.
 * More accurate than composite for individual CSI divisions.
 */
export function escalateDivisionCost(cost, divCode, fromYear, toYear = getCurrentYear()) {
  if (!cost || cost <= 0) return 0;
  const fromIndex = getDivisionIndex(divCode, fromYear);
  const toIndex = getDivisionIndex(divCode, toYear);
  if (fromIndex <= 0) return cost;
  return cost * (toIndex / fromIndex);
}

/**
 * Escalate an entire division cost map to target year.
 * Input: { "03": 45000, "05": 30000, ... }
 * Returns: { "03": 48150, "05": 33600, ... }
 */
export function escalateDivisions(divisions, fromYear, toYear = getCurrentYear()) {
  if (!divisions) return {};
  const result = {};
  Object.entries(divisions).forEach(([div, cost]) => {
    result[div] = Math.round(escalateDivisionCost(cost, div, fromYear, toYear));
  });
  return result;
}

/**
 * Get the escalation factor between two years (composite).
 * e.g., 2020 → 2026 might return 1.37 (37% increase)
 */
export function getEscalationFactor(fromYear, toYear = getCurrentYear()) {
  const fromIndex = getCompositeIndex(fromYear);
  const toIndex = getCompositeIndex(toYear);
  if (fromIndex <= 0) return 1;
  return toIndex / fromIndex;
}

/**
 * Normalize a cost history entry to present-day dollars.
 * Returns a new entry with adjusted totalCost and per-SF figures.
 */
export function normalizeEntry(entry, toYear = getCurrentYear()) {
  const fromYear = extractYear(entry.date);
  if (fromYear === toYear) return { ...entry, escalationFactor: 1.0, adjustedCost: entry.totalCost };

  const factor = getEscalationFactor(fromYear, toYear);
  const adjustedCost = Math.round((entry.totalCost || 0) * factor);
  const adjustedDivisions = escalateDivisions(entry.divisions, fromYear, toYear);

  return {
    ...entry,
    escalationFactor: Math.round(factor * 1000) / 1000,
    adjustedCost,
    adjustedDivisions,
    adjustedPerSF: entry.projectSF > 0 ? Math.round(adjustedCost / entry.projectSF) : 0,
    originalYear: fromYear,
    targetYear: toYear,
  };
}

/**
 * Format an escalation factor as a readable string.
 * e.g., 1.15 → "+15%", 0.95 → "-5%"
 */
export function formatEscalation(factor) {
  if (!factor || factor === 1) return "0%";
  const pct = Math.round((factor - 1) * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}
