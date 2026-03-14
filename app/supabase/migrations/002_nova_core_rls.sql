-- ============================================================
-- NOVA Core — RLS Infrastructure
-- 002_nova_core_rls.sql
-- Sprint 1: scaffolding only. No table-level policies yet.
-- (1) Create nova_core schema
-- (2) Create set_org_context utility function
-- (3) Document that all 8 Group 1 backbone tables have RLS DISABLED
-- ============================================================

BEGIN;

-- 1. Schema for NOVA Core objects (keeps separate from public)
CREATE SCHEMA IF NOT EXISTS nova_core;

-- 2. Utility function to set org context at session start
CREATE OR REPLACE FUNCTION nova_core.set_org_context(org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM set_config('app.current_org_id', org_id::text, true);
END;
$$;

-- 3. Confirm Group 1 tables do NOT have RLS enabled
-- (Documentation only — no SQL action needed)
-- csi_codes, trades, units_of_measure, building_types,
-- project_types, delivery_methods, cost_categories, seasonal_adjustments
-- All Group 1 tables: RLS disabled, publicly readable.
-- The actual per-table RLS policies for Groups 2-4 will be added in later migrations.
-- This file is infrastructure only.

COMMIT;
