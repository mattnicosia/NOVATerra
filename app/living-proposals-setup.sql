-- Living Proposals — Interactive web-based proposal delivery with analytics
-- Run this in the Supabase SQL editor

-- 1. Proposal snapshots
CREATE TABLE IF NOT EXISTS living_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  estimate_id UUID NOT NULL,
  user_id UUID NOT NULL,
  org_id UUID,
  proposal_data JSONB NOT NULL,
  design_config JSONB NOT NULL,
  company_info JSONB,
  project_info JSONB,
  recipient_name TEXT,
  recipient_email TEXT,
  password_hash TEXT,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_by TEXT,
  accepted_name TEXT,
  accepted_title TEXT,
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Analytics events
CREATE TABLE IF NOT EXISTS proposal_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES living_proposals(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  section_id TEXT,
  duration_ms INTEGER,
  scroll_depth REAL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_living_proposals_token ON living_proposals(token);
CREATE INDEX IF NOT EXISTS idx_living_proposals_user ON living_proposals(user_id);
CREATE INDEX IF NOT EXISTS idx_living_proposals_estimate ON living_proposals(estimate_id);
CREATE INDEX IF NOT EXISTS idx_proposal_analytics_proposal ON proposal_analytics(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_analytics_session ON proposal_analytics(session_id);

-- 4. RLS policies
ALTER TABLE living_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_analytics ENABLE ROW LEVEL SECURITY;

-- Public read for living_proposals (token-based access via API)
CREATE POLICY "service_role_full_access" ON living_proposals FOR ALL USING (true);
CREATE POLICY "service_role_analytics_access" ON proposal_analytics FOR ALL USING (true);
