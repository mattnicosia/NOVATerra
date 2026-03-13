-- Single-Session Enforcement: user_active_session table
-- Run this in Supabase Dashboard → SQL Editor
-- One row per user, tracks which device/session is currently active

CREATE TABLE IF NOT EXISTS user_active_session (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  device TEXT,
  browser TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_active_session ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own row
CREATE POLICY "Users manage own session"
  ON user_active_session FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
