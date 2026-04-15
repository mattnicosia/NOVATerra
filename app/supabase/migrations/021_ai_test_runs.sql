-- ============================================================
-- Migration 021: AI Test Runs
-- Stores results from AI testing (logic tests + estimator simulation)
-- Used by /admin/testing dashboard for visibility and history
-- ============================================================

-- ── Test run: one row per /test invocation ──
CREATE TABLE IF NOT EXISTS ai_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL CHECK (run_type IN ('logic', 'estimator', 'deploy', 'changed', 'build')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'passed', 'failed', 'partial')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  -- Logic test summary
  test_files_total INTEGER,
  test_files_passed INTEGER,
  tests_total INTEGER,
  tests_passed INTEGER,
  -- Build result
  build_passed BOOLEAN,
  build_error TEXT,
  -- Trigger context
  trigger_source TEXT, -- 'manual', 'pre-deploy', 'test-changed'
  changed_files JSONB, -- array of file paths that triggered the run
  -- Summary
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Journey result: one row per estimator journey per run ──
CREATE TABLE IF NOT EXISTS ai_test_journey_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES ai_test_runs(id) ON DELETE CASCADE,
  journey_name TEXT NOT NULL,
  journey_number INTEGER NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass', 'fail', 'functional_pass_ux_fail', 'skipped')),
  failure_class TEXT CHECK (failure_class IN ('correctness', 'discoverability', 'terminology', 'viewport', NULL)),
  component_involved TEXT,
  explanation TEXT,
  -- Evidence
  screenshot_url TEXT,
  snapshot_data JSONB,
  -- Timestamps
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_ai_test_runs_started
  ON ai_test_runs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_test_runs_status
  ON ai_test_runs(status);

CREATE INDEX IF NOT EXISTS idx_ai_test_journey_results_run
  ON ai_test_journey_results(run_id);

-- ── RLS ──
ALTER TABLE ai_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_test_journey_results ENABLE ROW LEVEL SECURITY;

-- Admin-only access (service role bypasses RLS)
CREATE POLICY "admin_read_test_runs" ON ai_test_runs
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admin_insert_test_runs" ON ai_test_runs
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "admin_read_journey_results" ON ai_test_journey_results
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admin_insert_journey_results" ON ai_test_journey_results
  FOR INSERT TO authenticated
  WITH CHECK (true);
