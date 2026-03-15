-- ============================================================
-- Migration 007: NOVA Core Admin Tables
-- recompute_log, pipeline_log, admin_action_log
-- ============================================================

BEGIN;

-- ============================================================
-- 1. recompute_log — nightly recompute run history
--    (nightly-recompute edge function already writes here)
-- ============================================================
CREATE TABLE IF NOT EXISTS recompute_log (
  id                  uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp           timestamptz   NOT NULL DEFAULT now(),
  duration_ms         integer       NOT NULL DEFAULT 0,
  records_processed   integer       NOT NULL DEFAULT 0,
  errors              jsonb,
  step_results        jsonb,
  created_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_recompute_log_ts ON recompute_log (timestamp DESC);

-- ============================================================
-- 2. pipeline_log — per-step pipeline metrics
-- ============================================================
CREATE TABLE IF NOT EXISTS pipeline_log (
  id              uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  step            text          NOT NULL,
  records_in      integer       NOT NULL DEFAULT 0,
  records_flagged integer       NOT NULL DEFAULT 0,
  records_passed  integer       NOT NULL DEFAULT 0,
  run_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_pipeline_log_step ON pipeline_log (step, run_at DESC);
CREATE INDEX idx_pipeline_log_run_at ON pipeline_log (run_at DESC);

-- ============================================================
-- 3. admin_action_log — append-only admin actions
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_action_log (
  id              uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type     text          NOT NULL,
  record_table    text          NOT NULL,
  record_id       uuid          NOT NULL,
  admin_note      text,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_action_log_ts ON admin_action_log (created_at DESC);
CREATE INDEX idx_admin_action_log_type ON admin_action_log (action_type, created_at DESC);

COMMIT;
