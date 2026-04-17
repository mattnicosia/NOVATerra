-- Migration 022: Critical user-scoped indexes for query performance
-- Date: 2026-04-17
-- Why: Production audit flagged missing indexes on user_id / created_at for
-- frequently-queried tables. Adding these dramatically reduces query latency
-- on user dashboards, session checks, and admin lists.
-- All CREATE INDEX use IF NOT EXISTS — safe to re-run.

BEGIN;

-- ── user_estimates ─────────────────────────────────────────────
-- The UNIQUE(user_id, estimate_id) constraint already covers point lookups
-- by user_id, but listing/sorting requires an explicit index on (user_id, updated_at).
-- Most user dashboards fetch the N most recently updated estimates per user.
CREATE INDEX IF NOT EXISTS idx_user_estimates_user_updated
  ON user_estimates(user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- Admin queries that scan ALL recent estimates regardless of user.
CREATE INDEX IF NOT EXISTS idx_user_estimates_updated
  ON user_estimates(updated_at DESC)
  WHERE deleted_at IS NULL;

-- ── embeddings ─────────────────────────────────────────────────
-- Vector search filters by user_id (custom data) AND kind (seed vs user_element vs proposal).
-- Without these, every search scans the full embeddings table.
CREATE INDEX IF NOT EXISTS idx_embeddings_user
  ON embeddings(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_embeddings_kind
  ON embeddings(kind);

CREATE INDEX IF NOT EXISTS idx_embeddings_kind_user
  ON embeddings(kind, user_id);

-- ── user_active_session ────────────────────────────────────────
-- Polled every 15s by the session-mismatch detector for every active user.
-- Without an index, this is a full table scan multiple times per second at scale.
CREATE INDEX IF NOT EXISTS idx_user_active_session_user
  ON user_active_session(user_id);

-- ── ai_test_runs ───────────────────────────────────────────────
-- Admin testing dashboard lists recent runs by user.
CREATE INDEX IF NOT EXISTS idx_ai_test_runs_user_created
  ON ai_test_runs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_test_runs_created
  ON ai_test_runs(created_at DESC);

COMMIT;

-- Run ANALYZE so the query planner picks up the new statistics immediately.
ANALYZE user_estimates;
ANALYZE embeddings;
ANALYZE user_active_session;
ANALYZE ai_test_runs;
