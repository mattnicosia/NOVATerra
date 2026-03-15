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

// ============================================================
// Group 2 — Cost Intelligence (6 tables)
// Column names match 003_nova_core_groups234.sql exactly.
// ============================================================

export interface LaborRate {
  id: string;
  org_id: string;
  trade_id: string;
  soc_code: string;
  county: string | null;
  state: string;
  metro_area: string | null;
  climate_zone: 'northern' | 'southern' | 'mountain' | 'coastal';
  base_rate: number;
  burden_multiplier: number;
  open_shop_rate: number;
  source: string;
  data_vintage: string;
  submission_month: number | null;
  seasonal_adjustment_applied: boolean;
  raw_unit_cost: number | null;
  is_active: boolean;
  batch_id: string | null;
  created_at: string;
}

export interface MaterialCost {
  id: string;
  org_id: string;
  csi_code_id: string;
  trade_id: string;
  unit_id: string;
  description: string;
  unit_cost: number;
  price_type: 'contractor' | 'retail' | 'list';
  supplier: string | null;
  source: string;
  state: string;
  metro_area: string | null;
  data_vintage: string;
  commodity_index_ticker: string | null;
  is_active: boolean;
  batch_id: string | null;
  created_at: string;
}

export interface EquipmentCost {
  id: string;
  org_id: string;
  trade_id: string;
  equipment_name: string;
  rate_type: 'daily' | 'hourly' | 'weekly' | 'monthly' | 'owned';
  unit_cost: number;
  source: string;
  state: string;
  data_vintage: string;
  is_active: boolean;
  batch_id: string | null;
  created_at: string;
}

export interface UnitCost {
  id: string;
  org_id: string;
  csi_code_id: string;
  trade_id: string;
  unit_id: string;
  unit_cost: number;
  raw_unit_cost: number | null;
  burden_included: boolean;
  overhead_included: boolean;
  profit_included: boolean;
  pdc_included: boolean;
  source_type: 'awarded_contract' | 'leveled_proposal' | 'completed_estimate' | 'user_override' | 'public_seed';
  source_weight: number;
  estimator_type: 'internal_team' | 'hybrid' | 'external_consultant' | 'unknown' | null;
  state: string;
  metro_area: string | null;
  climate_zone: 'northern' | 'southern' | 'mountain' | 'coastal';
  submission_month: number | null;
  seasonal_adjustment_applied: boolean;
  contribution_weight: number;
  recency_weight: number;
  geo_weight: number;
  outlier_flag: boolean;
  outlier_pass: number;
  potential_duplicate: boolean;
  duplicate_of: string | null;
  is_current_revision: boolean;
  revision_number: number;
  revision_of: string | null;
  revision_reason: 'scope_change' | 'price_correction' | 'value_engineering' | 'design_advance' | 'error_correction' | null;
  superseded_at: string | null;
  lump_sum_resolved: boolean;
  lump_sum_context: 'situation_a' | 'situation_b' | 'situation_c' | null;
  pending_context: boolean;
  revisit_trigger: boolean;
  is_active: boolean;
  batch_id: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Assembly {
  id: string;
  org_id: string;
  csi_code_id: string;
  name: string;
  building_type_id: string | null;
  components: Record<string, unknown>;
  total_cost_per_sf: number | null;
  sample_count: number;
  state: string;
  metro_area: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SfBenchmark {
  id: string;
  org_id: string;
  building_type_id: string;
  project_type_id: string;
  delivery_method_id: string | null;
  state: string;
  metro_area: string | null;
  p10_cost_per_sf: number | null;
  p50_cost_per_sf: number | null;
  p90_cost_per_sf: number | null;
  sample_count: number;
  weighted_sum: number;
  weight_sum: number;
  price_basis: 'market_all_in' | 'blended' | 'sf_seed';
  display_flag: 'none' | 'indicative' | 'insufficient_data' | 'national_fallback';
  last_recomputed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Group 3 — Market Data (8 tables)
// Column names match 003_nova_core_groups234.sql exactly.
// ============================================================

export interface Project {
  id: string;
  org_id: string;
  name: string;
  building_type_id: string | null;
  project_type_id: string | null;
  delivery_method_id: string | null;
  gross_sf: number | null;
  story_count: number | null;
  state: string;
  county: string | null;
  metro_area: string | null;
  climate_zone: 'northern' | 'southern' | 'mountain' | 'coastal';
  bid_date: string | null;
  award_date: string | null;
  construction_start: string | null;
  construction_end: string | null;
  status: 'estimating' | 'bidding' | 'awarded' | 'under_construction' | 'complete' | 'cancelled';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Proposal {
  id: string;
  org_id: string;
  project_id: string | null;
  submitting_org_name: string;
  trade_id: string | null;
  proposal_type: 'sub_proposal' | 'gc_proposal' | 't_and_m' | 'unit_rate_schedule';
  contract_type: 'lump_sum' | 'unit_price' | 't_and_m' | 'cost_plus' | 'gmp';
  pricing_type: 'base_bid' | 'alternates' | 'allowances' | 'unit_rates';
  base_bid_value: number;
  has_alternates: boolean;
  award_status: 'unknown' | 'awarded' | 'not_awarded' | 'pending';
  lump_sum_context: 'situation_a' | 'situation_b' | 'situation_c' | null;
  pending_context: boolean;
  revisit_trigger: boolean;
  potential_duplicate: boolean;
  duplicate_of: string | null;
  revision_number: number;
  revision_of: string | null;
  is_current_revision: boolean;
  revision_reason: 'scope_change' | 'price_correction' | 'value_engineering' | 'design_advance' | 'error_correction' | 'owner_request' | null;
  superseded_at: string | null;
  submitted_at: string;
  is_active: boolean;
  batch_id: string | null;
  created_at: string;
}

export interface ProposalLineItem {
  id: string;
  org_id: string;
  proposal_id: string;
  csi_code_id: string | null;
  unit_id: string | null;
  line_label: string;
  quantity: number | null;
  unit_cost: number | null;
  line_total: number;
  alternate_accepted: boolean | null;
  is_alternate: boolean;
  parser_confidence: number | null;
  parser_mapped: boolean;
  potential_duplicate: boolean;
  duplicate_of: string | null;
  created_at: string;
}

export interface PdcLine {
  id: string;
  org_id: string;
  proposal_id: string;
  line_label: string;
  line_type: 'general_requirements' | 'general_conditions' | 'insurance' | 'bond' | 'overhead' | 'fee_profit';
  amount_type: 'percentage' | 'lump_sum' | 'unit_rate';
  amount_value: number;
  applies_to: 'direct_costs' | 'trade_costs' | 'total' | 'unknown';
  combined_with: string[] | null;
  sort_order: number;
  normalized_pct: number | null;
  created_at: string;
}

export interface AwardedContract {
  id: string;
  org_id: string;
  project_id: string;
  proposal_id: string | null;
  trade_id: string | null;
  contract_value: number;
  alternates_accepted: string[] | null;
  final_cost: number | null;
  change_order_total: number;
  owner_addition_total: number;
  final_cost_per_sf: number | null;
  closeout_date: string | null;
  source_weight: number;
  is_active: boolean;
  created_at: string;
}

export interface CompletedEstimate {
  id: string;
  org_id: string;
  project_id: string | null;
  estimate_name: string;
  estimate_type: 'rom' | 'schematic' | 'design_development' | 'construction_documents' | 'as_built';
  estimator_type: 'internal_team' | 'hybrid' | 'external_consultant' | 'unknown';
  burden_included: boolean;
  overhead_included: boolean;
  profit_included: boolean;
  total_cost: number;
  accuracy_profile: number;
  revision_number: number;
  revision_of: string | null;
  is_current_revision: boolean;
  revision_reason: 'scope_change' | 'price_correction' | 'design_advance' | 'error_correction' | null;
  superseded_at: string | null;
  is_active: boolean;
  batch_id: string | null;
  created_at: string;
}

export interface EstimateLineItem {
  id: string;
  org_id: string;
  estimate_id: string;
  csi_code_id: string | null;
  trade_id: string | null;
  unit_id: string | null;
  description: string;
  quantity: number | null;
  unit_cost: number | null;
  line_total: number;
  cost_category_id: string | null;
  created_at: string;
}

export interface ChangeOrder {
  id: string;
  org_id: string;
  contract_id: string;
  co_number: string;
  scope_type: 'original_scope_overrun' | 'owner_addition' | 'unforeseen_condition' | 'design_error' | 'weather_delay' | 'code_change' | 'allowance_draw' | 'other';
  description: string;
  amount: number;
  approved_date: string;
  contributes_to_benchmark: boolean;
  csi_code_id: string | null;
  created_at: string;
}

// ============================================================
// Group 4 — Intelligence Layer (4 tables)
// Column names match 003_nova_core_groups234.sql exactly.
// ============================================================

export interface LocationFactor {
  id: string;
  org_id: string;
  geo_level: 'zip' | 'metro' | 'state' | 'region' | 'national';
  geo_value: string;
  trade_factors: Record<string, number>;
  overall_factor: number;
  sample_count: number;
  last_updated: string;
  created_at: string;
}

export interface PdcBenchmark {
  id: string;
  org_id: string;
  building_type_id: string | null;
  project_type_id: string | null;
  state: string;
  metro_area: string | null;
  pdc_bucket: 'general_requirements' | 'general_conditions' | 'insurance' | 'bond' | 'overhead' | 'fee_profit' | 'total_pdc';
  p10_pct: number | null;
  p50_pct: number | null;
  p90_pct: number | null;
  org_running_pdc_pct: number | null;
  size_curve: Record<string, unknown> | null;
  awarded_count: number;
  total_count: number;
  last_recomputed_at: string | null;
  created_at: string;
}

export interface ContributionTracking {
  id: string;
  org_id: string;
  total_contributions: number;
  contribution_score: number;
  current_tier: 'observer' | 'contributor' | 'data_partner' | 'market_maker' | 'intelligence_lead' | 'nova_luminary';
  tier_achieved_at: string | null;
  breadth_score: number;
  depth_score: number;
  geography_score: number;
  quality_score: number;
  accuracy_score: number;
  density_crossings: number;
  first_mover_metros: string[];
  moved_threshold: boolean;
  founding_partner: boolean;
  trees_planted: number;
  grove_name: string | null;
  last_updated: string;
  created_at: string;
}

export interface EnvironmentalScore {
  id: string;
  org_id: string;
  project_id: string | null;
  carbon_intensity_vs_benchmark: number | null;
  substitution_rate: number | null;
  carbon_saved_co2e: number | null;
  carbon_tier: 'carbon_aware' | 'carbon_conscious' | 'carbon_leader' | 'carbon_champion' | 'carbon_pioneer';
  grove_name: string | null;
  trees_this_project: number;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Carbon types — re-exported from carbon.ts for convenience
// ============================================================

export type { CarbonBand, CarbonRow, CarbonSubstitute } from './carbon';

// ============================================================
// Table map — all 26 NOVA Core tables (8 backbone + 18 new)
// ============================================================

/** Maps each table name to its TypeScript type */
export interface NovaCoreTables {
  // Group 1 — Backbone
  csi_codes: CsiCode;
  trades: Trade;
  units_of_measure: UnitOfMeasure;
  building_types: BuildingType;
  project_types: ProjectType;
  delivery_methods: DeliveryMethod;
  cost_categories: CostCategory;
  seasonal_adjustments: SeasonalAdjustment;
  // Group 2 — Cost Intelligence
  labor_rates: LaborRate;
  material_costs: MaterialCost;
  equipment_costs: EquipmentCost;
  unit_costs: UnitCost;
  assemblies: Assembly;
  sf_benchmarks: SfBenchmark;
  // Group 3 — Market Data
  projects: Project;
  proposals: Proposal;
  proposal_line_items: ProposalLineItem;
  pdc_lines: PdcLine;
  awarded_contracts: AwardedContract;
  completed_estimates: CompletedEstimate;
  estimate_line_items: EstimateLineItem;
  change_orders: ChangeOrder;
  // Group 4 — Intelligence Layer
  location_factors: LocationFactor;
  pdc_benchmarks: PdcBenchmark;
  contribution_tracking: ContributionTracking;
  environmental_scores: EnvironmentalScore;
}
