// ============================================================
// NOVA Core — ROM Engine
// Replaces romEngine.js for all NOVA Core data lookups.
// romEngine.js remains untouched as a fallback.
// ============================================================

import {
  getLocalUnitCost,
  getNationalUnitCost,
  getLocationFactor,
  type MivRow,
} from './query';
import {
  applyMultipliers,
  getMultiplierSet,
  type ConfidenceBand,
  type MultiplierSet,
  type RomRequest,
} from './multipliers';
import { getCarbonData, buildCarbonBand, type CarbonBand } from './carbon';

// ── Types ──

/** Extended request that includes the line-item lookup key */
export type RomLineRequest = RomRequest & {
  csi_code_id: string;
  trade_id: string;
};

export type DisplayFlag =
  | 'none'
  | 'indicative'
  | 'insufficient_data'
  | 'national_fallback'
  | 'no_data';

export type RomResult = {
  /** The CSI code this result is for */
  csi_code_id: string;
  /** Raw confidence band before multipliers */
  raw_band: ConfidenceBand;
  /** Adjusted confidence band after all multipliers */
  adjusted_band: ConfidenceBand;
  /** The multiplier set that was applied */
  multipliers: MultiplierSet;
  /** Whether national data was used instead of local */
  is_national: boolean;
  /** Data quality indicator */
  display_flag: DisplayFlag;
  /** User-facing disclosure when data quality is degraded */
  disclosure: string | null;
  /** Unit cost from the view (weighted mean) */
  unit_cost: number | null;
  /** CSI section + title for display */
  csi_section: string | null;
  csi_title: string | null;
  /** Trade + unit metadata */
  trade_name: string | null;
  unit_code: string | null;
  /** Sample counts */
  local_sample_count: number;
  national_sample_count: number;
  /** Carbon data — null if no carbon data for this CSI code */
  carbon: CarbonBand | null;
};

// ── Helpers ──

function bandFromRow(row: MivRow): ConfidenceBand {
  return { p10: row.p10, p50: row.p50, p90: row.p90 };
}

function emptyBand(): ConfidenceBand {
  return { p10: null, p50: null, p90: null };
}

// ── Main Engine ──

/**
 * Produces a ROM result for a single CSI line item.
 *
 * Sequence:
 * 1. Try local market data (metro-level).
 * 2. Fall back to national data if local is unavailable.
 * 3. Look up location factor for the trade.
 * 4. Assemble multiplier set and apply to the confidence band.
 * 5. Return the full RomResult with provenance metadata.
 */
export async function getRomResult(
  request: RomLineRequest
): Promise<RomResult> {
  const { csi_code_id, trade_id, metro_area, state } = request;

  // ── Step 1 & 2: Data lookup with fallback ──

  let row: MivRow | null = null;
  let is_national = false;
  let display_flag: DisplayFlag = 'no_data';
  let disclosure: string | null = null;

  // Try local first
  if (metro_area) {
    row = await getLocalUnitCost(csi_code_id, metro_area);
  }

  if (row) {
    // Local data found
    is_national = false;
    display_flag = row.display_flag;
    disclosure = null;
  } else {
    // Fall back to national
    row = await getNationalUnitCost(csi_code_id);

    if (row) {
      is_national = true;
      display_flag = 'national_fallback';
      disclosure =
        'No local market data. Showing national average. Local costs may vary significantly.';
    }
  }

  // ── No data at all ──

  if (!row) {
    const noDataMultipliers = getMultiplierSet(request, 1.0);
    return {
      csi_code_id,
      raw_band: emptyBand(),
      adjusted_band: emptyBand(),
      multipliers: noDataMultipliers,
      is_national: false,
      display_flag: 'no_data',
      disclosure: 'No cost data available for this line item.',
      unit_cost: null,
      csi_section: null,
      csi_title: null,
      trade_name: null,
      unit_code: null,
      local_sample_count: 0,
      national_sample_count: 0,
      carbon: null,
    };
  }

  // ── Step 3: Location factor ──

  let locationFactor = 1.0;
  if (!trade_id) {
    console.warn('[rom] Missing trade_id — falling back to location factor 1.000');
  } else if (!state) {
    console.warn('[rom] Missing state — falling back to location factor 1.000');
  } else {
    locationFactor = await getLocationFactor(
      trade_id,
      metro_area ?? '',
      state
    );
  }

  // ── Step 4: Assemble multipliers and apply ──

  const multipliers = getMultiplierSet(request, locationFactor);
  const raw_band = bandFromRow(row);
  const adjusted_band = applyMultipliers(raw_band, multipliers);

  // ── Step 5: Carbon data lookup ──
  // Wrapped in try/catch — carbon must never break the ROM response.

  let carbon: CarbonBand | null = null;
  try {
    const carbonRow = await getCarbonData(csi_code_id);
    if (carbonRow) {
      carbon = buildCarbonBand(carbonRow);
    }
  } catch {
    carbon = null;
  }

  // ── Step 6: Return full result ──

  return {
    csi_code_id,
    raw_band,
    adjusted_band,
    multipliers,
    is_national,
    display_flag,
    disclosure,
    unit_cost: row.unit_cost,
    csi_section: row.csi_section,
    csi_title: row.csi_title,
    trade_name: row.trade_name,
    unit_code: row.unit_code,
    local_sample_count: row.local_sample_count,
    national_sample_count: row.national_sample_count,
    carbon,
  };
}
