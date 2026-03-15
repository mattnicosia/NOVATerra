// ============================================================
// NOVA Core — Multiplier Matrix
// Pure functions for applying location, building type, project
// type, and delivery method multipliers to confidence bands.
// No database calls — all lookups are passed in.
// ============================================================

// ── Types ──

export type ConfidenceBand = {
  p10: number | null;
  p50: number | null;
  p90: number | null;
};

export type MultiplierSet = {
  location: number;
  building_type: number;
  project_type: number;
  delivery_method: number;
  combined: number;
};

export type RomRequest = {
  building_type_id: string | null;
  project_type_code: string;
  delivery_method_code: string;
  state: string;
  metro_area: string | null;
  gross_sf: number;
};

// ── Project Type Factors ──

export const PROJECT_TYPE_FACTORS: Record<string, number> = {
  NC: 1.0,
  RENO: 0.85,
  TI: 0.7,
  ADDITION: 0.9,
  ADAPTIVE_REUSE: 0.95,
  SITEWORK: 1.0,
} as const;

// ── Delivery Method Factors ──

export const DELIVERY_METHOD_FACTORS: Record<string, number> = {
  DBB: 1.0,
  DB: 0.97,
  CMaR: 1.02,
  GMP: 1.0,
  TM: 1.0,
  CMAR: 1.02,
} as const;

// ── applyMultipliers ──

/**
 * Applies all four multipliers to each percentile independently.
 * Returns null for any band value that is null.
 * Rounds all outputs to 2 decimal places.
 */
export function applyMultipliers(
  band: ConfidenceBand,
  factors: MultiplierSet
): ConfidenceBand {
  const m = factors.combined;
  return {
    p10: band.p10 !== null ? Math.round(band.p10 * m * 100) / 100 : null,
    p50: band.p50 !== null ? Math.round(band.p50 * m * 100) / 100 : null,
    p90: band.p90 !== null ? Math.round(band.p90 * m * 100) / 100 : null,
  };
}

// ── getMultiplierSet ──

/**
 * Assembles the four factors into a MultiplierSet.
 * Building type factor defaults to 1.00 when building_type_id is null.
 * Location factor is passed in (looked up externally via query layer).
 */
export function getMultiplierSet(
  params: RomRequest,
  locationFactor: number
): MultiplierSet {
  const location = locationFactor;
  const building_type = params.building_type_id !== null ? 1.0 : 1.0;
  const project_type = PROJECT_TYPE_FACTORS[params.project_type_code] ?? 1.0;
  const delivery_method =
    DELIVERY_METHOD_FACTORS[params.delivery_method_code] ?? 1.0;
  const combined = location * building_type * project_type * delivery_method;

  return {
    location,
    building_type,
    project_type,
    delivery_method,
    combined: Math.round(combined * 1_000_000) / 1_000_000,
  };
}
