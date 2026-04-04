// Normalization Engine — converts raw proposal data to national open-shop baseline
// Every data point is normalized so calibration factors are market-agnostic.
// When generating a ROM for a new project, the normalized baseline is
// DENORMALIZED using the target project's location + labor type.
//
// Formula:
//   normalized_cost = raw_cost / locationFactor / laborFactor
//   project_cost = normalized_cost * targetLocationFactor * targetLaborFactor

import { resolveLocationFactors } from "@/constants/locationFactors";

// ── Trade-specific labor multipliers (relative to open-shop = 1.0) ──
// Calibrated from Violante + Montana proposal data.
// Higher-skill trades (plumbing, HVAC, electrical) carry steeper premiums
// under prevailing wage / union regimes than lower-skill-gap trades.
const TRADE_LABOR_MULTIPLIERS = {
  prevailing: {
    "03": 1.30, // Concrete
    "04": 1.30, // Masonry
    "05": 1.40, // Metals / Structural Steel
    "06": 1.25, // Wood / Carpentry
    "07": 1.25, // Thermal & Moisture Protection
    "08": 1.30, // Openings
    "09": 1.25, // Finishes (drywall, paint, tile)
    "10": 1.25, // Specialties
    "22": 1.50, // Plumbing
    "23": 1.45, // HVAC
    "26": 1.40, // Electrical
    "27": 1.35, // Communications
    "28": 1.35, // Electronic Safety
    _default: 1.35,
  },
  union: {
    "03": 1.40, // Concrete
    "04": 1.40, // Masonry
    "05": 1.50, // Metals / Structural Steel
    "06": 1.35, // Wood / Carpentry
    "07": 1.35, // Thermal & Moisture Protection
    "08": 1.40, // Openings
    "09": 1.35, // Finishes (drywall, paint, tile)
    "10": 1.35, // Specialties
    "22": 1.60, // Plumbing
    "23": 1.55, // HVAC
    "26": 1.50, // Electrical
    "27": 1.45, // Communications
    "28": 1.45, // Electronic Safety
    _default: 1.45,
  },
  open_shop: { _default: 1.0 },
};

// Canonical labor-type aliases → key into TRADE_LABOR_MULTIPLIERS
const LABOR_TYPE_ALIASES = {
  "open-shop": "open_shop",
  "open shop": "open_shop",
  "": "open_shop",
  "prevailing": "prevailing",
  "prevailing-wage": "prevailing",
  "prevailing wage": "prevailing",
  "union": "union",
};

/**
 * Resolve the canonical labor-type key from any user-facing string.
 */
function resolveLaborKey(laborType) {
  if (!laborType) return "open_shop";
  return LABOR_TYPE_ALIASES[laborType.toLowerCase().trim()] ?? "open_shop";
}

/**
 * Get the trade-specific labor multiplier for a given labor type and CSI division.
 *
 * @param {string} laborType  - "open-shop" | "prevailing" | "union" (any alias)
 * @param {string} [divisionCode] - 2-digit CSI division code ("03", "22", etc.).
 *   If omitted or unknown, falls back to the regime's `_default`.
 * @returns {number} The multiplier (relative to open-shop = 1.0)
 */
export function getTradeMultiplier(laborType, divisionCode) {
  const key = resolveLaborKey(laborType);
  const regime = TRADE_LABOR_MULTIPLIERS[key] || TRADE_LABOR_MULTIPLIERS.open_shop;
  if (divisionCode) {
    // Normalize to 2-digit string (handles "03", "3", "03000", etc.)
    const div2 = String(divisionCode).replace(/\D/g, "").slice(0, 2).padStart(2, "0");
    if (regime[div2] !== undefined) return regime[div2];
  }
  return regime._default;
}

/**
 * Get labor factor — backward-compatible wrapper.
 * @param {string} laborType
 * @param {string} [divisionCode] - optional CSI division for trade-specific multiplier
 */
function getLaborFactor(laborType, divisionCode) {
  return getTradeMultiplier(laborType, divisionCode);
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
 * @param {string} [divisionCode] - Optional 2-digit CSI division for trade-specific labor multiplier
 * @returns {{ normalized: number, locationFactor: number, laborFactor: number, combinedFactor: number }}
 */
export function normalizePerSF(rawPerSF, zip, laborType, divisionCode) {
  const locationFactor = getCombinedLocationFactor(zip);
  const laborFactor = getLaborFactor(laborType, divisionCode);
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
 * @param {string} [divisionCode] - Optional 2-digit CSI division for trade-specific labor multiplier
 * @returns {{ denormalized: number, locationFactor: number, laborFactor: number }}
 */
export function denormalizePerSF(normalizedPerSF, zip, laborType, divisionCode) {
  const locationFactor = getCombinedLocationFactor(zip);
  const laborFactor = getLaborFactor(laborType, divisionCode);
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
  // Project-level (blended default) labor factor — used for totals & markups
  const laborFactor = getLaborFactor(laborType);
  const combinedFactor = locationFactor * laborFactor;

  const locationInfo = resolveLocationFactors(zip);

  const normalizedDivisions = {};
  const divEntries = Object.entries(proposal.divisions || {});

  for (const [divCode, rawCost] of divEntries) {
    const cost = parseFloat(rawCost) || 0;
    if (cost <= 0) continue;

    // Trade-specific labor multiplier for this division
    const divLaborFactor = getLaborFactor(laborType, divCode);
    const divCombinedFactor = locationFactor * divLaborFactor;

    const rawPerSF = sf > 0 ? cost / sf : 0;
    const normalizedPerSF = divCombinedFactor > 0 ? rawPerSF / divCombinedFactor : rawPerSF;
    const normalizedTotal = sf > 0 ? normalizedPerSF * sf : cost / divCombinedFactor;

    normalizedDivisions[divCode] = {
      rawTotal: Math.round(cost),
      rawPerSF: Math.round(rawPerSF * 100) / 100,
      normalizedPerSF: Math.round(normalizedPerSF * 100) / 100,
      normalizedTotal: Math.round(normalizedTotal),
      laborFactor: divLaborFactor,
      factor: Math.round(divCombinedFactor * 1000) / 1000,
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
