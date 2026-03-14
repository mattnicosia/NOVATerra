// ============================================================
// NOVA Core — TypeScript Type Definitions
// All 8 Group 1 backbone tables
// Column names match 001_nova_core_backbone.sql exactly.
// ============================================================

export interface CsiCode {
  id: string;
  division: number;
  section: string;
  title: string;
  level: number;
  parent_id: string | null;
  canonical_unit: string | null;
  description: string | null;
  created_at: string;
}

export interface Trade {
  id: string;
  name: string;
  code: string;
  soc_codes: string[];
  csi_divisions: number[];
  burden_multiplier: number;
  open_shop_ratio: number;
  wc_rate_range_low: number;
  wc_rate_range_high: number;
  seasonal_sensitivity: 'none' | 'low' | 'medium' | 'high';
  created_at: string;
}

export interface UnitOfMeasure {
  id: string;
  code: string;
  name: string;
  dimension: 'area' | 'length' | 'volume' | 'count' | 'weight' | 'lump-sum';
  conversion_to_si: number | null;
  aliases: string[];
  created_at: string;
}

export interface BuildingType {
  id: string;
  code: string;
  name: string;
  category: 'residential' | 'commercial' | 'industrial' | 'institutional' | 'mixed_use';
  typical_sf_range_low: number | null;
  typical_sf_range_high: number | null;
  typical_story_range_low: number | null;
  typical_story_range_high: number | null;
  construction_type: string[];
  created_at: string;
}

export interface ProjectType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  affects_sf_benchmark: boolean;
  created_at: string;
}

export interface DeliveryMethod {
  id: string;
  code: string;
  name: string;
  has_gmp: boolean;
  pdc_structure_typical: string | null;
  created_at: string;
}

export interface CostCategory {
  id: string;
  code: string;
  name: string;
  included_in_construction_cost: boolean;
  description: string | null;
  created_at: string;
}

export interface SeasonalAdjustment {
  id: string;
  trade_id: string;
  climate_zone: 'northern' | 'southern' | 'mountain' | 'coastal';
  month: number;
  adjustment_factor: number;
  base_month: number;
  notes: string | null;
  validated_at: string | null;
  created_at: string;
}

/** Maps each table name to its TypeScript type */
export interface NovaCoreTables {
  csi_codes: CsiCode;
  trades: Trade;
  units_of_measure: UnitOfMeasure;
  building_types: BuildingType;
  project_types: ProjectType;
  delivery_methods: DeliveryMethod;
  cost_categories: CostCategory;
  seasonal_adjustments: SeasonalAdjustment;
}
