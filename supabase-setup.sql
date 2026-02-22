-- NOVA Cloud Sync — Run this in Supabase Dashboard > SQL Editor
-- Creates tables for cross-device data persistence

-- User data (one row per user per key — mirrors the IndexedDB key-value pattern)
CREATE TABLE IF NOT EXISTS user_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);

-- Estimate data (one row per estimate)
CREATE TABLE IF NOT EXISTS user_estimates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estimate_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, estimate_id)
);

-- Row Level Security
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_estimates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Users can CRUD own data" ON user_data;
DROP POLICY IF EXISTS "Users can CRUD own estimates" ON user_estimates;

CREATE POLICY "Users can CRUD own data" ON user_data
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own estimates" ON user_estimates
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Email inbox — approved sender whitelist
CREATE TABLE IF NOT EXISTS user_email_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, email)
);

-- Email inbox — pending RFPs
CREATE TABLE IF NOT EXISTS pending_rfps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  sender_email TEXT,
  sender_name TEXT,
  subject TEXT,
  raw_text TEXT,
  parsed_data JSONB,
  parse_error TEXT,
  attachments JSONB DEFAULT '[]',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_email_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_rfps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own email mappings" ON user_email_mappings;
DROP POLICY IF EXISTS "Users can CRUD own rfps" ON pending_rfps;

CREATE POLICY "Users can CRUD own email mappings" ON user_email_mappings
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own rfps" ON pending_rfps
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_data_lookup ON user_data(user_id, key);
CREATE INDEX IF NOT EXISTS idx_user_estimates_lookup ON user_estimates(user_id, estimate_id);
CREATE INDEX IF NOT EXISTS idx_email_mappings_lookup ON user_email_mappings(email);
CREATE INDEX IF NOT EXISTS idx_pending_rfps_user ON pending_rfps(user_id, status);
