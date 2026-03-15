// ============================================================
// NOVA Core — Query Layer
// All market_intelligence_view queries in one place.
// Uses the NOVA Core Supabase client — never the existing one.
// ============================================================

import { novaCoreClient } from './supabase';

// ── Exported types ──

export type MivRow = {
  csi_code_id: string;
  trade_id: string;
  unit_id: string;
  csi_section: string;
  csi_title: string;
  trade_name: string;
  unit_code: string;
  unit_name: string;
  unit_cost: number;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  display_flag: 'none' | 'indicative' | 'insufficient_data';
  local_sample_count: number;
  national_sample_count: number;
  local_weighted_mean: number | null;
  national_weighted_mean: number | null;
  state: string;
  metro_area: string | null;
  updated_at: string;
};

export type MarketTensionRow = {
  id: string;
  metro_area: string;
  market_tension_index: number;
  tension_label: string;
  proposal_volume_score: number | null;
  bid_count_score: number | null;
  bid_spread_score: number | null;
  cost_trend_score: number | null;
  computed_at: string;
};

// ── Query 1: Local unit cost ──

export async function getLocalUnitCost(
  csi_code_id: string,
  metro_area: string
): Promise<MivRow | null> {
  if (!novaCoreClient) return null;
  try {
    const { data, error } = await novaCoreClient
      .from('market_intelligence_view')
      .select(
        'csi_code_id, trade_id, unit_id, csi_section, csi_title, trade_name, unit_code, unit_name, unit_cost, p10, p50, p90, display_flag, local_sample_count, national_sample_count, local_weighted_mean, national_weighted_mean, state, metro_area, updated_at'
      )
      .eq('csi_code_id', csi_code_id)
      .eq('metro_area', metro_area)
      .limit(1)
      .single();
    if (error || !data) return null;
    return data as MivRow;
  } catch {
    return null;
  }
}

// ── Query 2: National unit cost (no metro filter) ──

export async function getNationalUnitCost(
  csi_code_id: string
): Promise<MivRow | null> {
  if (!novaCoreClient) return null;
  try {
    const { data, error } = await novaCoreClient
      .from('market_intelligence_view')
      .select(
        'csi_code_id, trade_id, unit_id, csi_section, csi_title, trade_name, unit_code, unit_name, unit_cost, p10, p50, p90, display_flag, local_sample_count, national_sample_count, local_weighted_mean, national_weighted_mean, state, metro_area, updated_at'
      )
      .eq('csi_code_id', csi_code_id)
      .limit(1)
      .single();
    if (error || !data) return null;
    return data as MivRow;
  } catch {
    return null;
  }
}

// ── Query 3: Location factor (geo hierarchy fallback) ──

export async function getLocationFactor(
  trade_id: string,
  metro_area: string,
  state: string
): Promise<number> {
  if (!novaCoreClient) return 1.0;

  // Walk the hierarchy from most specific to least
  const levels: Array<{ geo_level: string; geo_value: string }> = [
    { geo_level: 'metro', geo_value: metro_area },
    { geo_level: 'state', geo_value: state },
  ];

  for (const { geo_level, geo_value } of levels) {
    if (!geo_value) continue;
    try {
      const { data, error } = await novaCoreClient
        .from('location_factors')
        .select('overall_factor, trade_factors')
        .eq('geo_level', geo_level)
        .eq('geo_value', geo_value)
        .limit(1)
        .single();
      if (error || !data) continue;

      // Use trade-specific factor if available, otherwise overall
      const tradeFactors = data.trade_factors as Record<string, number> | null;
      if (tradeFactors && trade_id in tradeFactors) {
        return tradeFactors[trade_id];
      }
      return data.overall_factor;
    } catch {
      continue;
    }
  }

  // National default — no adjustment
  return 1.0;
}

// ── Query 4: Market tension index ──

export async function getMarketTensionIndex(
  metro_area: string
): Promise<MarketTensionRow | null> {
  if (!novaCoreClient) return null;
  try {
    const { data, error } = await novaCoreClient
      .from('market_tension_index')
      .select('id, metro_area, market_tension_index, tension_label, proposal_volume_score, bid_count_score, bid_spread_score, cost_trend_score, computed_at')
      .eq('metro_area', metro_area)
      .limit(1)
      .single();
    if (error || !data) return null;
    return data as MarketTensionRow;
  } catch {
    return null;
  }
}
