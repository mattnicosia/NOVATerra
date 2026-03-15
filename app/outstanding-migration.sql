-- ═══════════════════════════════════════════════════════════════
-- Outstanding Migrations — Run in Supabase Dashboard → SQL Editor
-- Date: 2026-03-13
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Single-Session Enforcement ─────────────────────────────
-- Tracks which device/session is currently active per user.
-- Without this table, session enforcement polls return 404.

CREATE TABLE IF NOT EXISTS user_active_session (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  device TEXT,
  browser TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_active_session ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own row
DROP POLICY IF EXISTS "Users manage own session" ON user_active_session;
CREATE POLICY "Users manage own session"
  ON user_active_session FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
