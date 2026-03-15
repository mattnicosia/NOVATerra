-- ============================================================
-- NOVA Core — Migration 008: org_id Indexes
-- Adds an index on org_id for every table in Groups 2, 3, and 4
-- that has an org_id column and an RLS policy (18 tables).
-- ============================================================

-- GROUP 2 — Cost Intelligence (6 tables)
CREATE INDEX IF NOT EXISTS idx_labor_rates_org ON labor_rates (org_id);
CREATE INDEX IF NOT EXISTS idx_material_costs_org ON material_costs (org_id);
CREATE INDEX IF NOT EXISTS idx_equipment_costs_org ON equipment_costs (org_id);
CREATE INDEX IF NOT EXISTS idx_unit_costs_org ON unit_costs (org_id);
CREATE INDEX IF NOT EXISTS idx_assemblies_org ON assemblies (org_id);
CREATE INDEX IF NOT EXISTS idx_sf_benchmarks_org ON sf_benchmarks (org_id);

-- GROUP 3 — Market Data (8 tables)
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects (org_id);
CREATE INDEX IF NOT EXISTS idx_proposals_org ON proposals (org_id);
CREATE INDEX IF NOT EXISTS idx_proposal_line_items_org ON proposal_line_items (org_id);
CREATE INDEX IF NOT EXISTS idx_pdc_lines_org ON pdc_lines (org_id);
CREATE INDEX IF NOT EXISTS idx_awarded_contracts_org ON awarded_contracts (org_id);
CREATE INDEX IF NOT EXISTS idx_completed_estimates_org ON completed_estimates (org_id);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_org ON estimate_line_items (org_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_org ON change_orders (org_id);

-- GROUP 4 — Intelligence Layer (4 tables)
CREATE INDEX IF NOT EXISTS idx_location_factors_org ON location_factors (org_id);
CREATE INDEX IF NOT EXISTS idx_pdc_benchmarks_org ON pdc_benchmarks (org_id);
CREATE INDEX IF NOT EXISTS idx_contribution_tracking_org ON contribution_tracking (org_id);
CREATE INDEX IF NOT EXISTS idx_environmental_scores_org ON environmental_scores (org_id);
