// Normalization Engine — converts raw proposal data to national open-shop baseline
// Every data point is normalized so calibration factors are market-agnostic.
// When generating a ROM for a new project, the normalized baseline is
// DENORMALIZED using the target project's location + labor type.
//
// Formula:
//   normalized_cost = raw_cost / locationFactor / laborFactor
//   project_cost = normalized_cost * targetLocationFactor * targetLaborFactor

import { resolveLocationFactors } from "@/constants/locationFactors";

// ── Labor type multipliers (relative to open-shop = 1.0) ──
const LABOR_FACTORS = {
  "open-shop": 1.0,
  "open shop": 1.0,
  "": 1.0,
  "prevailing": 1.35,
  "prevailing-wage": 1.35,
  "prevailing wage": 1.35,
  "union": 1.45,
};

function getLaborFactor(laborType) {
  if (!laborType) return 1.0;
  const key = laborType.toLowerCase().trim();
  return LABOR_FACTORS[key] ?? 1.0;
}

/**
 * Compute the combined location factor for a ZIP code.
 * Uses a weighted blend: 70% labor + 20% material + 10% equipment
 * (construction is ~70% labor-driven on cost variation by location)
 */
function getCombinedLocationFactor(zip) {
  const factors = resolveLocationFactors(zip || "");
  // Weighted blend reflecting construction cost structure
  return factors.lab * 0.70 + factors.mat * 0.20 + factors.equip * 0.10;
}

/**
 * Normalize a single $/SF value from raw to national open-shop baseline.
 *
 * @param {number} rawPerSF - The raw $/SF from the proposal
 * @param {string} zip - Project ZIP code
 * @param {string} laborType - "open-shop", "prevailing", "union"
 * @returns {{ normalized: number, locationFactor: number, laborFactor: number, combinedFactor: number }}
 */
export function normalizePerSF(rawPerSF, zip, laborType) {
  const locationFactor = getCombinedLocationFactor(zip);
  const laborFactor = getLaborFactor(laborType);
  const combinedFactor = locationFactor * laborFactor;
  const normalized = combinedFactor > 0 ? rawPerSF / combinedFactor : rawPerSF;

  return {
    raw: rawPerSF,
    normalized: Math.round(normalized * 100) / 100,
    locationFactor: Math.round(locationFactor * 1000) / 1000,
    laborFactor,
    combinedFactor: Math.round(combinedFactor * 1000) / 1000,
    locationLabel: resolveLocationFactors(zip || "").label,
  };
}

/**
 * Denormalize a baseline $/SF value for a specific project location + labor type.
 *
 * @param {number} normalizedPerSF - National open-shop baseline $/SF
 * @param {string} zip - Target project ZIP code
 * @param {string} laborType - Target labor type
 * @returns {{ denormalized: number, locationFactor: number, laborFactor: number }}
 */
export function denormalizePerSF(normalizedPerSF, zip, laborType) {
  const locationFactor = getCombinedLocationFactor(zip);
  const laborFactor = getLaborFactor(laborType);
  const denormalized = normalizedPerSF * locationFactor * laborFactor;

  return {
    baseline: normalizedPerSF,
    denormalized: Math.round(denormalized * 100) / 100,
    locationFactor: Math.round(locationFactor * 1000) / 1000,
    laborFactor,
    locationLabel: resolveLocationFactors(zip || "").label,
  };
}

/**
 * Normalize an entire proposal — all divisions get normalized to baseline.
 *
 * @param {object} proposal - Full proposal object from masterDataStore
 * @returns {object} Normalized proposal with per-division breakdown
 */
export function normalizeProposal(proposal) {
  const sf = proposal.projectSF || 0;
  const zip = proposal.zipCode || proposal.location || "";
  const laborType = proposal.laborType || "";
  const locationFactor = getCombinedLocationFactor(zip);
  const laborFactor = getLaborFactor(laborType);
  const combinedFactor = locationFactor * laborFactor;

  const locationInfo = resolveLocationFactors(zip);

  const normalizedDivisions = {};
  const divEntries = Object.entries(proposal.divisions || {});

  for (const [divCode, rawCost] of divEntries) {
    const cost = parseFloat(rawCost) || 0;
    if (cost <= 0) continue;

    const rawPerSF = sf > 0 ? cost / sf : 0;
    const normalizedPerSF = combinedFactor > 0 ? rawPerSF / combinedFactor : rawPerSF;
    const normalizedTotal = sf > 0 ? normalizedPerSF * sf : cost / combinedFactor;

    normalizedDivisions[divCode] = {
      rawTotal: Math.round(cost),
      rawPerSF: Math.round(rawPerSF * 100) / 100,
      normalizedPerSF: Math.round(normalizedPerSF * 100) / 100,
      normalizedTotal: Math.round(normalizedTotal),
      factor: Math.round(combinedFactor * 1000) / 1000,
    };
  }

  // Normalize markups
  const rawDirectCost = divEntries.reduce((sum, [, v]) => sum + (parseFloat(v) || 0), 0);
  const markupData = {};
  if (proposal.markups?.length > 0) {
    const markupTotal = proposal.markups.reduce((s, m) => s + (m.calculatedAmount || 0), 0);
    markupData.rawMarkupTotal = Math.round(markupTotal);
    markupData.markupPctOfDirect = rawDirectCost > 0
      ? Math.round((markupTotal / rawDirectCost) * 10000) / 100
      : 0;
    markupData.items = proposal.markups.map(m => ({
      label: m.label,
      amount: m.calculatedAmount || 0,
      pct: m.type === "percent" ? m.inputValue : null,
      category: m.category || "unknown",
    }));
  }

  return {
    proposalId: proposal.id,
    projectName: proposal.projectName || proposal.name,
    projectSF: sf,
    buildingType: proposal.jobType || proposal.buildingType || "unknown",
    workType: proposal.workType || "",
    proposalType: proposal.proposalType || "gc",

    // Raw input
    raw: {
      totalCost: Math.round(proposal.totalCost || 0),
      totalPerSF: sf > 0 ? Math.round((proposal.totalCost / sf) * 100) / 100 : 0,
      zip,
      laborType,
      location: locationInfo.label,
    },

    // Normalization factors applied
    normalization: {
      locationFactor: Math.round(locationFactor * 1000) / 1000,
      locationBreakdown: {
        material: locationInfo.mat,
        labor: locationInfo.lab,
        equipment: locationInfo.equip,
      },
      laborFactor,
      combinedFactor: Math.round(combinedFactor * 1000) / 1000,
      baselineLabel: "National Average, Open Shop",
    },

    // Normalized divisions
    divisions: normalizedDivisions,

    // Normalized totals
    normalized: {
      totalCost: Math.round((proposal.totalCost || 0) / combinedFactor),
      totalPerSF: sf > 0
        ? Math.round(((proposal.totalCost || 0) / sf / combinedFactor) * 100) / 100
        : 0,
    },

    // Markup analysis
    markups: markupData,
  };
}

/**
 * Get a human-readable normalization trace for display in admin UI.
 * Shows every step of the normalization process.
 */
export function getNormalizationTrace(proposal) {
  const n = normalizeProposal(proposal);
  const divTraces = Object.entries(n.divisions).map(([code, d]) => ({
    division: code,
    rawPerSF: d.rawPerSF,
    locationDivisor: n.normalization.locationFactor,
    laborDivisor: n.normalization.laborFactor,
    combinedDivisor: n.normalization.combinedFactor,
    normalizedPerSF: d.normalizedPerSF,
    formula: `$${d.rawPerSF}/SF ÷ ${n.normalization.combinedFactor} (${n.raw.location} ${n.raw.laborType || "open-shop"}) = $${d.normalizedPerSF}/SF baseline`,
  }));

  return {
    summary: {
      project: n.projectName,
      sf: n.projectSF,
      rawTotal: n.raw.totalCost,
      rawPerSF: n.raw.totalPerSF,
      normalizedTotal: n.normalized.totalCost,
      normalizedPerSF: n.normalized.totalPerSF,
      location: n.raw.location,
      laborType: n.raw.laborType || "open-shop",
      combinedFactor: n.normalization.combinedFactor,
    },
    factors: {
      location: `${n.raw.location}: mat=${n.normalization.locationBreakdown.material}× lab=${n.normalization.locationBreakdown.labor}× equip=${n.normalization.locationBreakdown.equipment}× → combined=${n.normalization.locationFactor}×`,
      labor: `${n.raw.laborType || "open-shop"}: ${n.normalization.laborFactor}×`,
      combined: `${n.normalization.combinedFactor}× total adjustment`,
    },
    divisions: divTraces,
    markups: n.markups,
  };
}
