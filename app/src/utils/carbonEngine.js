// Carbon Calculation Engine — Embodied carbon estimation for line items & projects
// Mirrors the cost calculation pattern: resolve factors, compute per-item, aggregate project-level

import {
  CARBON_FACTORS,
  CARBON_TRADE_DEFAULTS,
  CARBON_BENCHMARKS,
} from '@/constants/embodiedCarbonDb';

// ─── Factor Resolution ───────────────────────────────────────────────

/**
 * Resolve the best carbon factor for a line item.
 * Priority: exact code match > code prefix match > trade default (per-$ fallback).
 * @param {string} code - CSI code (e.g., "03.310")
 * @param {string} trade - Trade name (e.g., "concrete")
 * @param {string} name - Item description for fuzzy matching within a section
 * @returns {{ kgCO2ePerUnit: number, source: string, confidence: string, matchType: string }}
 */
export function resolveCarbonFactor(code, trade, name) {
  const normalizedCode = (code || '').trim();
  const normalizedTrade = (trade || '').toLowerCase().trim();
  const normalizedName = (name || '').toLowerCase().trim();

  // 1. Exact code match — navigate into items array
  if (normalizedCode && CARBON_FACTORS[normalizedCode]) {
    const section = CARBON_FACTORS[normalizedCode];
    const items = section.items;
    if (items && items.length > 0) {
      // Try to match by name if provided
      let best = items[0];
      if (normalizedName) {
        const nameMatch = items.find(it =>
          normalizedName.includes(it.name.toLowerCase()) ||
          it.name.toLowerCase().includes(normalizedName)
        );
        if (nameMatch) best = nameMatch;
      }
      return {
        kgCO2ePerUnit: best.kgCO2ePerUnit,
        source: best.source || 'ice',
        confidence: best.confidence || 'high',
        matchType: 'exact',
      };
    }
  }

  // 2. Code prefix match — progressively shorten code to find a parent section
  if (normalizedCode) {
    let prefix = normalizedCode;
    while (prefix.length > 2) {
      prefix = prefix.replace(/\.?[^.]*$/, '');
      if (!prefix || prefix.length < 2) break;
      if (CARBON_FACTORS[prefix]) {
        const section = CARBON_FACTORS[prefix];
        const items = section.items;
        if (items && items.length > 0) {
          let best = items[0];
          if (normalizedName) {
            const nameMatch = items.find(it =>
              normalizedName.includes(it.name.toLowerCase()) ||
              it.name.toLowerCase().includes(normalizedName)
            );
            if (nameMatch) best = nameMatch;
          }
          return {
            kgCO2ePerUnit: best.kgCO2ePerUnit,
            source: best.source || 'ice',
            confidence: best.confidence || 'medium',
            matchType: 'prefix',
          };
        }
      }
    }
  }

  // 3. Trade default — per-$ fallback (CARBON_TRADE_DEFAULTS values are plain numbers)
  if (normalizedTrade && CARBON_TRADE_DEFAULTS[normalizedTrade]) {
    return {
      kgCO2ePerUnit: CARBON_TRADE_DEFAULTS[normalizedTrade],
      source: 'trade-default',
      confidence: 'low',
      matchType: 'trade-default',
    };
  }

  // 4. No match — return zero factor
  return {
    kgCO2ePerUnit: 0,
    source: 'none',
    confidence: 'none',
    matchType: 'none',
  };
}

// ─── Item-Level Carbon ───────────────────────────────────────────────

/**
 * Calculate embodied carbon for a single line item.
 * Per-unit factors use quantity; trade-default (per-$) factors use material cost.
 * @param {Object} item - { code, trade, name, unit, quantity, material, labor, equipment }
 * @returns {{ kgCO2e: number, kgCO2ePerUnit: number, source: string, confidence: string, matchType: string }}
 */
export function calcItemCarbon(item) {
  const { code, trade, name, quantity, material } = item || {};
  const factor = resolveCarbonFactor(code, trade, name);

  let kgCO2e = 0;

  if (factor.matchType === 'trade-default') {
    // Per-$ fallback: carbon correlates with material cost, not labor
    const materialCost = parseFloat(material) || 0;
    kgCO2e = materialCost * factor.kgCO2ePerUnit;
  } else if (factor.matchType !== 'none') {
    // Per-unit: carbon = quantity * factor
    const qty = parseFloat(quantity) || 0;
    kgCO2e = qty * factor.kgCO2ePerUnit;
  }

  return {
    kgCO2e,
    kgCO2ePerUnit: factor.kgCO2ePerUnit,
    source: factor.source,
    confidence: factor.confidence,
    matchType: factor.matchType,
  };
}

// ─── Project-Level Carbon ────────────────────────────────────────────

/**
 * Calculate total project carbon from all line items.
 * Groups by CSI division and trade, identifies top contributors.
 * @param {Array} items - Array of line items
 * @param {number} projectSF - Total project square footage
 * @returns {Object} Comprehensive carbon summary
 */
export function calcProjectCarbon(items, projectSF) {
  const sf = parseFloat(projectSF) || 0;
  const byDivision = {};
  const byTrade = {};
  const itemDetails = [];

  let totalKgCO2e = 0;

  (items || []).forEach(item => {
    const result = calcItemCarbon(item);
    totalKgCO2e += result.kgCO2e;

    const div = (item.code || '').substring(0, 2);
    if (div) {
      byDivision[div] = (byDivision[div] || 0) + result.kgCO2e;
    }

    const trade = (item.trade || 'unknown').toLowerCase().trim();
    byTrade[trade] = (byTrade[trade] || 0) + result.kgCO2e;

    itemDetails.push({
      id: item.id,
      name: item.name || item.description || '',
      code: item.code || '',
      kgCO2e: result.kgCO2e,
      confidence: result.confidence,
      matchType: result.matchType,
    });
  });

  const topContributors = [...itemDetails]
    .sort((a, b) => b.kgCO2e - a.kgCO2e)
    .slice(0, 5);

  return {
    totalKgCO2e,
    totalTonnesCO2e: totalKgCO2e / 1000,
    kgCO2ePerSF: sf > 0 ? totalKgCO2e / sf : 0,
    byDivision,
    byTrade,
    topContributors,
    itemDetails,
  };
}

// ─── Benchmarks & Scoring ────────────────────────────────────────────

/**
 * Look up embodied carbon benchmark for a building type.
 * @param {string} buildingType - e.g., "office", "healthcare"
 * @returns {{ low: number, typical: number, high: number }} in kg CO2e / SF
 */
export function getCarbonBenchmark(buildingType) {
  const key = (buildingType || '').toLowerCase().trim();
  return CARBON_BENCHMARKS[key] || CARBON_BENCHMARKS['office'] || { low: 25, typical: 45, high: 70 };
}

/**
 * Score 0-100 based on how project compares to building type benchmark.
 * 100 = at or below "low" benchmark (best)
 *  50 = at "typical" benchmark
 *   0 = at or above 2x "high" benchmark (worst)
 * @param {number} kgCO2ePerSF - Project carbon intensity
 * @param {string} buildingType - Building type for benchmark lookup
 * @returns {number} Score 0-100
 */
export function calcCarbonScore(kgCO2ePerSF, buildingType) {
  const bm = getCarbonBenchmark(buildingType);
  const val = parseFloat(kgCO2ePerSF) || 0;

  if (val <= bm.low) return 100;

  if (val <= bm.typical) {
    const range = bm.typical - bm.low;
    if (range <= 0) return 100;
    return 100 - ((val - bm.low) / range) * 50;
  }

  const ceiling = bm.high * 2;
  if (val >= ceiling) return 0;

  const range = ceiling - bm.typical;
  if (range <= 0) return 0;
  return 50 - ((val - bm.typical) / range) * 50;
}

// ─── Formatting ──────────────────────────────────────────────────────

/**
 * Format a carbon value for display with appropriate units.
 * @param {number} kgCO2e - Carbon in kg CO2e
 * @returns {string} Formatted string
 */
export function formatCarbon(kgCO2e) {
  const val = parseFloat(kgCO2e) || 0;
  if (val < 1) return `${val.toFixed(2)} kg`;
  if (val < 1000) return `${Math.round(val)} kg`;
  if (val < 1000000) return `${(val / 1000).toFixed(1)} tonnes`;
  return `${(val / 1000000).toFixed(1)} kt`;
}
