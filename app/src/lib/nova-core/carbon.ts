// ============================================================
// NOVA Core — Carbon Query Layer
// src/lib/nova-core/carbon.ts
//
// All carbon data lookups in one place. Three functions:
//   getCarbonData     — DB query, returns highest-priority source
//   getCarbonSubstitutes — DB query, returns substitutes array
//   buildCarbonBand   — pure function, no DB call
//
// Uses the NOVA Core Supabase client — never the existing client.
// ============================================================

import { novaCoreClient } from './supabase';

// ── Types ──

export interface CarbonRow {
  id: string;
  csi_code_id: string;
  trade_id: string;
  material_name: string;
  canonical_unit: string;
  ice_co2e: number;
  a1_a3_co2e: number;
  transport_co2e_pct: number;
  a4_co2e: number;
  a5_co2e: number;
  total_co2e: number;
  active_co2e_source: string;
  transport_assumption_disclosed: boolean;
  substitutes: CarbonSubstitute[] | null;
  data_vintage: string;
}

export interface CarbonSubstitute {
  material_name: string;
  co2e_reduction_pct: number; // e.g. 0.18 for 18% reduction
  cost_premium_pct: number;   // e.g. 0.04 for 4% cost premium
  source: string;
}

export interface CarbonBand {
  p50_co2e: number | null;        // kg CO2e per canonical unit
  a1_a3_co2e: number | null;      // product stage
  a4_co2e: number | null;         // transport
  a5_co2e: number | null;         // construction process
  total_co2e: number | null;      // sum of a1-a5
  active_co2e_source: string | null;
  transport_disclosed: boolean;
  substitutes: CarbonSubstitute[] | null;
  co2e_extended: number | null;   // total_co2e x quantity
}

// ── Source priority (most specific → least specific) ──
const SOURCE_PRIORITY: Record<string, number> = {
  epd_specific: 1,
  ice_generic_ec3: 2,
  ice_generic: 3,
  estimated: 4,
};

// ── Functions ──

/**
 * Fetch the highest-priority carbon data record for a CSI code.
 * Orders by active_co2e_source priority: epd_specific > ice_generic_ec3 > ice_generic > estimated.
 * Returns null if no carbon data exists for this CSI code.
 */
export async function getCarbonData(csi_code_id: string): Promise<CarbonRow | null> {
  if (!novaCoreClient) return null;

  const { data, error } = await novaCoreClient
    .from('carbon_data')
    .select('*')
    .eq('csi_code_id', csi_code_id);

  if (error || !data || data.length === 0) return null;

  // Sort by source priority — lowest number = highest priority
  data.sort((a, b) => {
    const pa = SOURCE_PRIORITY[a.active_co2e_source] ?? 99;
    const pb = SOURCE_PRIORITY[b.active_co2e_source] ?? 99;
    return pa - pb;
  });

  return data[0] as CarbonRow;
}

/**
 * Fetch material substitution alternatives for a CSI code.
 * Reads the substitutes JSONB field from the highest-priority carbon_data record.
 * Returns empty array if no substitutes exist.
 */
export async function getCarbonSubstitutes(csi_code_id: string): Promise<CarbonSubstitute[]> {
  if (!novaCoreClient) return [];

  const { data, error } = await novaCoreClient
    .from('carbon_data')
    .select('substitutes')
    .eq('csi_code_id', csi_code_id);

  if (error || !data || data.length === 0) return [];

  // Find the first record that has non-null substitutes
  for (const row of data) {
    if (row.substitutes && Array.isArray(row.substitutes) && row.substitutes.length > 0) {
      return row.substitutes as CarbonSubstitute[];
    }
  }

  return [];
}

/**
 * Build a CarbonBand from a CarbonRow. Pure function — no database call.
 * If quantity is provided, computes co2e_extended = total_co2e x quantity.
 */
export function buildCarbonBand(carbonRow: CarbonRow, quantity?: number): CarbonBand {
  const co2e_extended = quantity != null
    ? parseFloat((carbonRow.total_co2e * quantity).toFixed(4))
    : null;

  return {
    p50_co2e: carbonRow.total_co2e,
    a1_a3_co2e: carbonRow.a1_a3_co2e,
    a4_co2e: carbonRow.a4_co2e,
    a5_co2e: carbonRow.a5_co2e,
    total_co2e: carbonRow.total_co2e,
    active_co2e_source: carbonRow.active_co2e_source,
    transport_disclosed: carbonRow.transport_assumption_disclosed,
    substitutes: carbonRow.substitutes,
    co2e_extended,
  };
}
