-- ============================================================
-- NOVA Core — Sprint 2 Migration: Groups 2, 3, and 4
-- supabase/migrations/003_nova_core_groups234.sql
--
-- Creates all tables for Groups 2 (Cost Intelligence),
-- 3 (Market Data), and 4 (Intelligence Layer).
--
-- labor_rates is dropped and recreated with full Sprint 2 schema.
-- All other tables are new.
-- ============================================================

BEGIN;

-- ============================================================
-- GROUP 2 — Cost Intelligence (6 tables)
-- ============================================================

-- labor_rates: Drop existing Sprint 1 version, recreate with full schema
DROP TABLE IF EXISTS labor_rates CASCADE;

CREATE TABLE labor_rates (
  id              uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          uuid            NOT NULL REFERENCES organizations(id),
  trade_id        uuid            NOT NULL REFERENCES trades(id),
  soc_code        text            NOT NULL,
  county          text,
  state           text            NOT NULL,
  metro_area      text,
  climate_zone    text            NOT NULL,
  base_rate       numeric(10,2)   NOT NULL,
  burden_multiplier numeric(5,3)  NOT NULL,
  open_shop_rate  numeric(10,2)   NOT NULL,
  source          text            NOT NULL,
  data_vintage    date            NOT NULL,
  submission_month integer,
  seasonal_adjustment_applied boolean NOT NULL DEFAULT false,
  raw_unit_cost   numeric(10,2),
  is_active       boolean         NOT NULL DEFAULT true,
  batch_id        uuid,
  created_at      timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX idx_labor_rates_trade ON labor_rates (trade_id, state, metro_area);
CREATE INDEX idx_labor_rates_source ON labor_rates (source, is_active);
CREATE INDEX idx_labor_rates_batch ON labor_rates (batch_id);

-- material_costs
CREATE TABLE material_costs (
  id                    uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id                uuid            NOT NULL REFERENCES organizations(id),
  csi_code_id           uuid            NOT NULL REFERENCES csi_codes(id),
  trade_id              uuid            NOT NULL REFERENCES trades(id),
  unit_id               uuid            NOT NULL REFERENCES units_of_measure(id),
  description           text            NOT NULL,
  unit_cost             numeric(10,2)   NOT NULL,
  price_type            text            NOT NULL,
  supplier              text,
  source                text            NOT NULL,
  state                 text            NOT NULL,
  metro_area            text,
  data_vintage          date            NOT NULL,
  commodity_index_ticker text,
  is_active             boolean         NOT NULL DEFAULT true,
  batch_id              uuid,
  created_at            timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX idx_material_costs_csi ON material_costs (csi_code_id, state, metro_area);
CREATE INDEX idx_material_costs_source ON material_costs (source, is_active);

-- equipment_costs
CREATE TABLE equipment_costs (
  id              uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          uuid            NOT NULL REFERENCES organizations(id),
  trade_id        uuid            NOT NULL REFERENCES trades(id),
  equipment_name  text            NOT NULL,
  rate_type       text            NOT NULL,
  unit_cost       numeric(10,2)   NOT NULL,
  source          text            NOT NULL,
  state           text            NOT NULL,
  data_vintage    date            NOT NULL,
  is_active       boolean         NOT NULL DEFAULT true,
  batch_id        uuid,
  created_at      timestamptz     NOT NULL DEFAULT now()
);

-- unit_costs
CREATE TABLE unit_costs (
  id                    uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id                uuid            NOT NULL REFERENCES organizations(id),
  csi_code_id           uuid            NOT NULL REFERENCES csi_codes(id),
  trade_id              uuid            NOT NULL REFERENCES trades(id),
  unit_id               uuid            NOT NULL REFERENCES units_of_measure(id),
  unit_cost             numeric(10,2)   NOT NULL,
  raw_unit_cost         numeric(10,2),
  burden_included       boolean         NOT NULL,
  overhead_included     boolean         NOT NULL,
  profit_included       boolean         NOT NULL,
  pdc_included          boolean         NOT NULL,
  source_type           text            NOT NULL,
  source_weight         numeric(4,2)    NOT NULL,
  estimator_type        text,
  state                 text            NOT NULL,
  metro_area            text,
  climate_zone          text            NOT NULL,
  submission_month      integer,
  seasonal_adjustment_applied boolean   NOT NULL DEFAULT false,
  contribution_weight   numeric(8,6)    NOT NULL,
  recency_weight        numeric(8,6)    NOT NULL,
  geo_weight            numeric(4,3)    NOT NULL,
  outlier_flag          boolean         NOT NULL DEFAULT false,
  outlier_pass          numeric(3,2)    NOT NULL,
  potential_duplicate   boolean         NOT NULL DEFAULT false,
  duplicate_of          uuid,
  is_current_revision   boolean         NOT NULL DEFAULT true,
  revision_number       integer         NOT NULL DEFAULT 1,
  revision_of           uuid,
  revision_reason       text,
  superseded_at         timestamptz,
  lump_sum_resolved     boolean         NOT NULL DEFAULT false,
  lump_sum_context      text,
  pending_context       boolean         NOT NULL DEFAULT false,
  revisit_trigger       boolean         NOT NULL DEFAULT false,
  is_active             boolean         NOT NULL DEFAULT true,
  batch_id              uuid,
  source_id             uuid,
  created_at            timestamptz     NOT NULL DEFAULT now(),
  updated_at            timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX idx_unit_costs_csi_metro ON unit_costs (csi_code_id, metro_area, is_active, is_current_revision);
CREATE INDEX idx_unit_costs_revision ON unit_costs (revision_of, is_current_revision);
CREATE INDEX idx_unit_costs_batch ON unit_costs (batch_id);
CREATE INDEX idx_unit_costs_pending ON unit_costs (pending_context, revisit_trigger) WHERE pending_context = true;

-- assemblies
CREATE TABLE assemblies (
  id                uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id            uuid            NOT NULL REFERENCES organizations(id),
  csi_code_id       uuid            NOT NULL REFERENCES csi_codes(id),
  name              text            NOT NULL,
  building_type_id  uuid            REFERENCES building_types(id),
  components        jsonb           NOT NULL,
  total_cost_per_sf numeric(10,2),
  sample_count      integer         NOT NULL DEFAULT 0,
  state             text            NOT NULL,
  metro_area        text,
  is_active         boolean         NOT NULL DEFAULT true,
  created_at        timestamptz     NOT NULL DEFAULT now(),
  updated_at        timestamptz     NOT NULL DEFAULT now()
);

-- sf_benchmarks
CREATE TABLE sf_benchmarks (
  id                  uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id              uuid            NOT NULL REFERENCES organizations(id),
  building_type_id    uuid            NOT NULL REFERENCES building_types(id),
  project_type_id     uuid            NOT NULL REFERENCES project_types(id),
  delivery_method_id  uuid            REFERENCES delivery_methods(id),
  state               text            NOT NULL,
  metro_area          text,
  p10_cost_per_sf     numeric(10,2),
  p50_cost_per_sf     numeric(10,2),
  p90_cost_per_sf     numeric(10,2),
  sample_count        integer         NOT NULL DEFAULT 0,
  weighted_sum        numeric(14,4)   NOT NULL DEFAULT 0,
  weight_sum          numeric(10,6)   NOT NULL DEFAULT 0,
  price_basis         text            NOT NULL,
  display_flag        text            NOT NULL,
  last_recomputed_at  timestamptz,
  created_at          timestamptz     NOT NULL DEFAULT now(),
  updated_at          timestamptz     NOT NULL DEFAULT now()
);

-- ============================================================
-- GROUP 3 — Market Data (8 tables)
-- ============================================================

-- projects
CREATE TABLE projects (
  id                  uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id              uuid            NOT NULL REFERENCES organizations(id),
  name                text            NOT NULL,
  building_type_id    uuid            REFERENCES building_types(id),
  project_type_id     uuid            REFERENCES project_types(id),
  delivery_method_id  uuid            REFERENCES delivery_methods(id),
  gross_sf            integer,
  story_count         integer,
  state               text            NOT NULL,
  county              text,
  metro_area          text,
  climate_zone        text            NOT NULL,
  bid_date            date,
  award_date          date,
  construction_start  date,
  construction_end    date,
  status              text            NOT NULL,
  is_active           boolean         NOT NULL DEFAULT true,
  created_at          timestamptz     NOT NULL DEFAULT now(),
  updated_at          timestamptz     NOT NULL DEFAULT now()
);

-- proposals
CREATE TABLE proposals (
  id                  uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id              uuid            NOT NULL REFERENCES organizations(id),
  project_id          uuid            REFERENCES projects(id),
  submitting_org_name text            NOT NULL,
  trade_id            uuid            REFERENCES trades(id),
  proposal_type       text            NOT NULL,
  contract_type       text            NOT NULL,
  pricing_type        text            NOT NULL,
  base_bid_value      numeric(14,2)   NOT NULL,
  has_alternates      boolean         NOT NULL DEFAULT false,
  award_status        text            NOT NULL,
  lump_sum_context    text,
  pending_context     boolean         NOT NULL DEFAULT false,
  revisit_trigger     boolean         NOT NULL DEFAULT false,
  potential_duplicate boolean         NOT NULL DEFAULT false,
  duplicate_of        uuid,
  revision_number     integer         NOT NULL DEFAULT 1,
  revision_of         uuid,
  is_current_revision boolean         NOT NULL DEFAULT true,
  revision_reason     text,
  superseded_at       timestamptz,
  submitted_at        timestamptz     NOT NULL,
  is_active           boolean         NOT NULL DEFAULT true,
  batch_id            uuid,
  created_at          timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposals_revision ON proposals (revision_of, is_current_revision);
-- Note: spec had metro_area in this index but proposals table doesn't have metro_area
-- (metro_area is on the joined projects table). Using available columns.
CREATE INDEX idx_proposals_dedup ON proposals (trade_id, submitted_at, base_bid_value);
CREATE INDEX idx_proposals_pending ON proposals (pending_context) WHERE pending_context = true;
CREATE INDEX idx_proposals_project ON proposals (project_id, award_status);

-- proposal_line_items
CREATE TABLE proposal_line_items (
  id                  uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id              uuid            NOT NULL REFERENCES organizations(id),
  proposal_id         uuid            NOT NULL REFERENCES proposals(id),
  csi_code_id         uuid            REFERENCES csi_codes(id),
  unit_id             uuid            REFERENCES units_of_measure(id),
  line_label          text            NOT NULL,
  quantity            numeric(12,3),
  unit_cost           numeric(10,2),
  line_total          numeric(14,2)   NOT NULL,
  alternate_accepted  boolean,
  is_alternate        boolean         NOT NULL DEFAULT false,
  parser_confidence   numeric(4,3),
  parser_mapped       boolean         NOT NULL DEFAULT false,
  potential_duplicate boolean         NOT NULL DEFAULT false,
  duplicate_of        uuid,
  created_at          timestamptz     NOT NULL DEFAULT now()
);

-- pdc_lines
CREATE TABLE pdc_lines (
  id              uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          uuid            NOT NULL REFERENCES organizations(id),
  proposal_id     uuid            NOT NULL REFERENCES proposals(id),
  line_label      text            NOT NULL,
  line_type       text            NOT NULL,
  amount_type     text            NOT NULL,
  amount_value    numeric(10,4)   NOT NULL,
  applies_to      text            NOT NULL,
  combined_with   text[],
  sort_order      integer         NOT NULL,
  normalized_pct  numeric(6,4),
  created_at      timestamptz     NOT NULL DEFAULT now()
);

-- awarded_contracts
CREATE TABLE awarded_contracts (
  id                  uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id              uuid            NOT NULL REFERENCES organizations(id),
  project_id          uuid            NOT NULL REFERENCES projects(id),
  proposal_id         uuid            REFERENCES proposals(id),
  trade_id            uuid            REFERENCES trades(id),
  contract_value      numeric(14,2)   NOT NULL,
  alternates_accepted text[],
  final_cost          numeric(14,2),
  change_order_total  numeric(14,2)   NOT NULL DEFAULT 0,
  owner_addition_total numeric(14,2)  NOT NULL DEFAULT 0,
  final_cost_per_sf   numeric(10,2),
  closeout_date       date,
  source_weight       numeric(4,2)    NOT NULL DEFAULT 1.00,
  is_active           boolean         NOT NULL DEFAULT true,
  created_at          timestamptz     NOT NULL DEFAULT now()
);

-- completed_estimates
CREATE TABLE completed_estimates (
  id                  uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id              uuid            NOT NULL REFERENCES organizations(id),
  project_id          uuid            REFERENCES projects(id),
  estimate_name       text            NOT NULL,
  estimate_type       text            NOT NULL,
  estimator_type      text            NOT NULL,
  burden_included     boolean         NOT NULL,
  overhead_included   boolean         NOT NULL,
  profit_included     boolean         NOT NULL,
  total_cost          numeric(14,2)   NOT NULL,
  accuracy_profile    numeric(4,3)    NOT NULL,
  revision_number     integer         NOT NULL DEFAULT 1,
  revision_of         uuid,
  is_current_revision boolean         NOT NULL DEFAULT true,
  revision_reason     text,
  superseded_at       timestamptz,
  is_active           boolean         NOT NULL DEFAULT true,
  batch_id            uuid,
  created_at          timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX idx_estimates_revision ON completed_estimates (revision_of, is_current_revision);

-- estimate_line_items
CREATE TABLE estimate_line_items (
  id                uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id            uuid            NOT NULL REFERENCES organizations(id),
  estimate_id       uuid            NOT NULL REFERENCES completed_estimates(id),
  csi_code_id       uuid            REFERENCES csi_codes(id),
  trade_id          uuid            REFERENCES trades(id),
  unit_id           uuid            REFERENCES units_of_measure(id),
  description       text            NOT NULL,
  quantity          numeric(12,3),
  unit_cost         numeric(10,2),
  line_total        numeric(14,2)   NOT NULL,
  cost_category_id  uuid            REFERENCES cost_categories(id),
  created_at        timestamptz     NOT NULL DEFAULT now()
);

-- change_orders
CREATE TABLE change_orders (
  id                      uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id                  uuid            NOT NULL REFERENCES organizations(id),
  contract_id             uuid            NOT NULL REFERENCES awarded_contracts(id),
  co_number               text            NOT NULL,
  scope_type              text            NOT NULL,
  description             text            NOT NULL,
  amount                  numeric(14,2)   NOT NULL,
  approved_date           date            NOT NULL,
  contributes_to_benchmark boolean        NOT NULL,
  csi_code_id             uuid            REFERENCES csi_codes(id),
  created_at              timestamptz     NOT NULL DEFAULT now()
);

-- ============================================================
-- GROUP 4 — Intelligence Layer (4 tables)
-- ============================================================

-- location_factors
CREATE TABLE location_factors (
  id              uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          uuid            NOT NULL REFERENCES organizations(id),
  geo_level       text            NOT NULL,
  geo_value       text            NOT NULL,
  trade_factors   jsonb           NOT NULL,
  overall_factor  numeric(5,3)    NOT NULL,
  sample_count    integer         NOT NULL DEFAULT 0,
  last_updated    timestamptz     NOT NULL DEFAULT now(),
  created_at      timestamptz     NOT NULL DEFAULT now()
);

-- pdc_benchmarks
CREATE TABLE pdc_benchmarks (
  id                  uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id              uuid            NOT NULL REFERENCES organizations(id),
  building_type_id    uuid            REFERENCES building_types(id),
  project_type_id     uuid            REFERENCES project_types(id),
  state               text            NOT NULL,
  metro_area          text,
  pdc_bucket          text            NOT NULL,
  p10_pct             numeric(6,4),
  p50_pct             numeric(6,4),
  p90_pct             numeric(6,4),
  org_running_pdc_pct numeric(6,4),
  size_curve          jsonb,
  awarded_count       integer         NOT NULL DEFAULT 0,
  total_count         integer         NOT NULL DEFAULT 0,
  last_recomputed_at  timestamptz,
  created_at          timestamptz     NOT NULL DEFAULT now()
);

-- contribution_tracking
CREATE TABLE contribution_tracking (
  id                    uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id                uuid            NOT NULL REFERENCES organizations(id),
  total_contributions   integer         NOT NULL DEFAULT 0,
  contribution_score    numeric(10,2)   NOT NULL DEFAULT 0,
  current_tier          text            NOT NULL,
  tier_achieved_at      timestamptz,
  breadth_score         numeric(6,2)    NOT NULL DEFAULT 0,
  depth_score           numeric(6,2)    NOT NULL DEFAULT 0,
  geography_score       numeric(6,2)    NOT NULL DEFAULT 0,
  quality_score         numeric(6,2)    NOT NULL DEFAULT 0,
  accuracy_score        numeric(6,2)    NOT NULL DEFAULT 0,
  density_crossings     integer         NOT NULL DEFAULT 0,
  first_mover_metros    text[]          NOT NULL DEFAULT '{}',
  moved_threshold       boolean         NOT NULL DEFAULT false,
  founding_partner      boolean         NOT NULL DEFAULT false,
  trees_planted         integer         NOT NULL DEFAULT 0,
  grove_name            text,
  last_updated          timestamptz     NOT NULL DEFAULT now(),
  created_at            timestamptz     NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_contribution_org ON contribution_tracking (org_id);

-- environmental_scores
CREATE TABLE environmental_scores (
  id                          uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id                      uuid            NOT NULL REFERENCES organizations(id),
  project_id                  uuid            REFERENCES projects(id),
  carbon_intensity_vs_benchmark numeric(6,3),
  substitution_rate           numeric(5,3),
  carbon_saved_co2e           numeric(12,2),
  carbon_tier                 text            NOT NULL,
  grove_name                  text,
  trees_this_project          integer         NOT NULL DEFAULT 0,
  created_at                  timestamptz     NOT NULL DEFAULT now(),
  updated_at                  timestamptz     NOT NULL DEFAULT now()
);

COMMIT;
