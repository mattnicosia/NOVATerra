-- ============================================================
-- NOVA Core — Migration 009: labor_rates Unique Constraint
-- Ensures BLS import upsert onConflict key matches an actual
-- unique constraint: (trade_id, soc_code, metro_area, state).
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_labor_rates_upsert_key
  ON labor_rates (trade_id, soc_code, state, COALESCE(metro_area, ''));
