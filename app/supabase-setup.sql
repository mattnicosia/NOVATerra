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

-- ═══════════════════════════════════════════════════════════════════════
-- pgvector — Semantic Search for Assemblies, Proposals, Specs
-- ═══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS vector;

-- Unified embeddings table — one table for all content types
CREATE TABLE IF NOT EXISTS embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kind TEXT NOT NULL,                    -- 'seed_element' | 'user_element' | 'assembly' | 'proposal' | 'spec'
  source_id TEXT NOT NULL,               -- Original record ID (e.g. "s001", assembly UUID, etc.)
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL for shared/seed data
  content TEXT NOT NULL,                 -- The text that was embedded
  metadata JSONB DEFAULT '{}',           -- CSI code, trade, unit, cost data, etc.
  embedding vector(1536) NOT NULL,       -- OpenAI text-embedding-3-small dimension
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Vector similarity index (IVFFlat for < 100K records; switch to HNSW at scale)
CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Filtering indexes
CREATE INDEX IF NOT EXISTS idx_embeddings_kind ON embeddings (kind);
CREATE INDEX IF NOT EXISTS idx_embeddings_user ON embeddings (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_embeddings_kind_user ON embeddings (kind, user_id);

-- Unique constraint to prevent duplicate embeddings for the same source
CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_unique_source
  ON embeddings (kind, source_id, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::UUID));

-- RLS: Seed data (user_id IS NULL) readable by all. User data scoped to owner.
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read shared embeddings" ON embeddings;
DROP POLICY IF EXISTS "Read own embeddings" ON embeddings;
DROP POLICY IF EXISTS "Manage own embeddings" ON embeddings;

CREATE POLICY "Read shared embeddings" ON embeddings
  FOR SELECT USING (user_id IS NULL);

CREATE POLICY "Read own embeddings" ON embeddings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Manage own embeddings" ON embeddings
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Vector search RPC — called from serverless functions via supabaseAdmin
CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding vector(1536),
  match_kinds TEXT[] DEFAULT NULL,
  match_user_id UUID DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  kind TEXT,
  source_id TEXT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.kind,
    e.source_id,
    e.content,
    e.metadata,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM embeddings e
  WHERE
    (match_kinds IS NULL OR e.kind = ANY(match_kinds))
    AND (
      e.user_id IS NULL  -- always include shared/seed data
      OR (match_user_id IS NOT NULL AND e.user_id = match_user_id)
    )
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
