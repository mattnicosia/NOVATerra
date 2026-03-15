-- ============================================================
-- NOVA Core — Sprint 2 RLS Policies: Groups 2, 3, and 4
-- supabase/migrations/004_nova_core_groups234_rls.sql
--
-- Enables RLS and creates SELECT, INSERT, UPDATE policies
-- on all 18 user-data tables from migration 003.
--
-- Pattern: org_id = current_setting('app.current_org_id')::uuid
-- set_org_context() was created in 002_nova_core_rls.sql
--
-- market_intelligence_view has NO RLS — it is anonymized
-- aggregate data with no org_id.
--
-- Group 1 backbone tables already have no RLS — do not touch.
-- ============================================================

BEGIN;

-- ============================================================
-- GROUP 2 — Cost Intelligence
-- ============================================================

-- labor_rates
ALTER TABLE labor_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY labor_rates_select ON labor_rates FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY labor_rates_insert ON labor_rates FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY labor_rates_update ON labor_rates FOR UPDATE
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- material_costs
ALTER TABLE material_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_costs_select ON material_costs FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY material_costs_insert ON material_costs FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY material_costs_update ON material_costs FOR UPDATE
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- equipment_costs
ALTER TABLE equipment_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY equipment_costs_select ON equipment_costs FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY equipment_costs_insert ON equipment_costs FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY equipment_costs_update ON equipment_costs FOR UPDATE
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- unit_costs
ALTER TABLE unit_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY unit_costs_select ON unit_costs FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY unit_costs_insert ON unit_costs FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY unit_costs_update ON unit_costs FOR UPDATE
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- assemblies
ALTER TABLE assemblies ENABLE ROW LEVEL SECURITY;
CREATE POLICY assemblies_select ON assemblies FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY assemblies_insert ON assemblies FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY assemblies_update ON assemblies FOR UPDATE
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- sf_benchmarks
ALTER TABLE sf_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY sf_benchmarks_select ON sf_benchmarks FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY sf_benchmarks_insert ON sf_benchmarks FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY sf_benchmarks_update ON sf_benchmarks FOR UPDATE
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================
-- GROUP 3 — Market Data
-- ============================================================

-- projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_select ON projects FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY projects_insert ON projects FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY projects_update ON projects FOR UPDATE
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- proposals
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY proposals_select ON proposals FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY proposals_insert ON proposals FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY proposals_update ON proposals FOR UPDATE
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- proposal_line_items
ALTER TABLE proposal_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY proposal_line_items_select ON proposal_line_items FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY proposal_line_items_insert ON proposal_line_items FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY proposal_line_items_update ON proposal_line_items FOR UPDATE
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- pdc_lines
ALTER TABLE pdc_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY pdc_lines_select ON pdc_lines FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY pdc_lines_insert ON pdc_lines FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY pdc_lines_update ON pdc_lines FOR UPDATE
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- awarded_contracts
ALTER TABLE awarded_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY awarded_contracts_select ON awarded_contracts FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY awarded_contracts_insert ON awarded_contracts FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY awarded_contracts_update ON awarded_contracts FOR UPDATE
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- completed_estimates
ALTER TABLE completed_estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY completed_estimates_select ON completed_estimates FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY completed_estimates_insert ON completed_estimates FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY completed_estimates_update ON completed_estimates FOR UPDATE
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- estimate_line_items
ALTER TABLE estimate_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY estimate_line_items_select ON estimate_line_items FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY estimate_line_items_insert ON estimate_line_items FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY estimate_line_items_update ON estimate_line_items FOR UPDATE
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- change_orders
ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY change_orders_select ON change_orders FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY change_orders_insert ON change_orders FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY change_orders_update ON change_orders FOR UPDATE
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================
-- GROUP 4 — Intelligence Layer
-- ============================================================

-- location_factors
ALTER TABLE location_factors ENABLE ROW LEVEL SECURITY;
CREATE POLICY location_factors_select ON location_factors FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY location_factors_insert ON location_factors FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY location_factors_update ON location_factors FOR UPDATE
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- pdc_benchmarks
ALTER TABLE pdc_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY pdc_benchmarks_select ON pdc_benchmarks FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY pdc_benchmarks_insert ON pdc_benchmarks FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY pdc_benchmarks_update ON pdc_benchmarks FOR UPDATE
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- contribution_tracking
ALTER TABLE contribution_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY contribution_tracking_select ON contribution_tracking FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY contribution_tracking_insert ON contribution_tracking FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY contribution_tracking_update ON contribution_tracking FOR UPDATE
  USING (org_id = current_setting('app.current_org_id')::uuid);

-- environmental_scores
ALTER TABLE environmental_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY environmental_scores_select ON environmental_scores FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY environmental_scores_insert ON environmental_scores FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
CREATE POLICY environmental_scores_update ON environmental_scores FOR UPDATE
  USING (org_id = current_setting('app.current_org_id')::uuid);

COMMIT;
