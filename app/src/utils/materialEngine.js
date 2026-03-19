// materialEngine.js — Pure functions for material lookup, search, and swap impact
// No store access — operates on the material catalog directly

import {
  MATERIAL_CATALOG,
  MATERIAL_CATEGORIES,
  MATERIAL_INDEX,
} from "@/constants/materialCatalog";

// ── Lookup ────────────────────────────────────────────────────────

/**
 * Get a material by slug. O(1) index lookup.
 * @param {string} slug
 * @returns {object|null}
 */
export function getMaterial(slug) {
  return MATERIAL_INDEX[slug] ?? null;
}

// ── Search ────────────────────────────────────────────────────────

/**
 * Case-insensitive text search across name, manufacturer, and category.
 * @param {string} query
 * @returns {object[]}
 */
export function searchMaterials(query) {
  if (!query || typeof query !== "string" || query.trim() === "") return [];
  const q = query.toLowerCase();
  return MATERIAL_CATALOG.filter(m =>
    m.name.toLowerCase().includes(q) ||
    m.manufacturer.toLowerCase().includes(q) ||
    m.category.toLowerCase().includes(q)
  );
}

// ── Category helpers ──────────────────────────────────────────────

/**
 * Get all materials in a category.
 * @param {string} categoryKey
 * @returns {object[]}
 */
export function getCategory(categoryKey) {
  return MATERIAL_CATALOG.filter(m => m.category === categoryKey);
}

/**
 * Get list of all categories with counts.
 * @returns {{ key: string, label: string, count: number }[]}
 */
export function getCategories() {
  return MATERIAL_CATEGORIES.map(cat => ({
    key: cat.key,
    label: cat.label,
    count: MATERIAL_CATALOG.filter(m => m.category === cat.key).length,
  })).filter(c => c.count > 0);
}

// ── Element-based suggestions ─────────────────────────────────────

/**
 * Mapping from element type + trade to relevant material categories.
 */
const ELEMENT_CATEGORY_MAP = {
  "wall:framing": ["exterior-cladding", "interior-wall", "concrete"],
  "wall:drywall": ["interior-wall"],
  "wall:masonry": ["concrete"],
  "wall:insulation": ["exterior-cladding"],
  "slab:roofing": ["roofing"],
  "slab:flooring": ["flooring"],
  "slab:concrete": ["concrete", "flooring"],
  "slab:tile": ["flooring"],
  "slab:act": ["ceiling"],
  "object:plumbing": ["plumbing-fixture"],
  "object:windows": ["glazing"],
  "object:doors": ["glazing"],
};

/**
 * Suggest materials for a building element based on its type and trade.
 * @param {{ type: string, trade: string }} element
 * @returns {object[]}
 */
export function getMaterialsForElement(element) {
  const { type, trade } = element || {};
  const key = `${type}:${trade}`;

  // Try exact match first
  let categories = ELEMENT_CATEGORY_MAP[key];

  // Fall back to type-only matches
  if (!categories) {
    const typeMatches = Object.entries(ELEMENT_CATEGORY_MAP)
      .filter(([k]) => k.startsWith(`${type}:`))
      .flatMap(([, cats]) => cats);
    if (typeMatches.length > 0) {
      categories = [...new Set(typeMatches)];
    }
  }

  // Fall back to trade-only matches
  if (!categories) {
    const tradeMatches = Object.entries(ELEMENT_CATEGORY_MAP)
      .filter(([k]) => k.endsWith(`:${trade}`))
      .flatMap(([, cats]) => cats);
    if (tradeMatches.length > 0) {
      categories = [...new Set(tradeMatches)];
    }
  }

  // Ultimate fallback: return everything
  if (!categories || categories.length === 0) {
    return [...MATERIAL_CATALOG];
  }

  return MATERIAL_CATALOG.filter(m => categories.includes(m.category));
}

// ── Swap impact calculation ───────────────────────────────────────

/**
 * Compute cost/schedule delta when swapping one material for another.
 * @param {string} fromSlug
 * @param {string} toSlug
 * @param {{ areaSF?: number, quantity?: number }} scope
 * @returns {{ costDeltaPerUnit: number, costDeltaTotal: number, leadTimeDelta: number, scheduleDaysDelta: number }|null}
 */
export function computeSwapImpact(fromSlug, toSlug, scope = {}) {
  const from = getMaterial(fromSlug);
  const to = getMaterial(toSlug);
  if (!from || !to) return null;

  const costDeltaPerUnit = to.cost.totalPerUnit - from.cost.totalPerUnit;
  const leadTimeDelta = to.schedule.leadTimeDays - from.schedule.leadTimeDays;

  // Determine quantity multiplier — areaSF for area-based, quantity for count-based
  const qty = scope.areaSF || scope.quantity || 1;
  const costDeltaTotal = costDeltaPerUnit * qty;

  // Schedule days delta based on install rate difference (higher rate = faster = fewer days)
  // For a given area, days = area / (rate * crewSize * 8hrs)
  // Simplified: compare relative rates
  const fromDaysPerUnit = from.schedule.installRate > 0 ? 1 / from.schedule.installRate : 0;
  const toDaysPerUnit = to.schedule.installRate > 0 ? 1 / to.schedule.installRate : 0;
  const scheduleDaysDelta = (toDaysPerUnit - fromDaysPerUnit) * qty;

  return {
    costDeltaPerUnit,
    costDeltaTotal,
    leadTimeDelta,
    scheduleDaysDelta,
  };
}
