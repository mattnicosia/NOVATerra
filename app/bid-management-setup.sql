-- Bid Management System — Run this in Supabase Dashboard > SQL Editor
-- Creates tables for bid packages, invitations, proposals, and sub pool

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Bid Packages — one package per scope grouping sent to subs
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bid_packages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estimate_id TEXT NOT NULL,
  name TEXT NOT NULL,
  scope_items JSONB NOT NULL DEFAULT '[]',
  drawing_ids JSONB NOT NULL DEFAULT '[]',
  cover_message TEXT DEFAULT '',
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Bid Invitations — one row per sub invited to a package
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bid_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES bid_packages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  sub_company TEXT NOT NULL,
  sub_contact TEXT DEFAULT '',
  sub_email TEXT NOT NULL,
  sub_phone TEXT DEFAULT '',
  sub_trade TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  resend_email_id TEXT,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  downloaded_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Bid Proposals — uploaded proposal files + AI-parsed data
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bid_proposals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invitation_id UUID NOT NULL REFERENCES bid_invitations(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES bid_packages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT DEFAULT 'application/pdf',
  file_size INTEGER DEFAULT 0,
  parsed_data JSONB,
  parse_status TEXT NOT NULL DEFAULT 'pending',
  parse_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Sub Pool — shared directory of subs who've submitted proposals
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sub_pool (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  contact TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  trade TEXT NOT NULL,
  market TEXT DEFAULT '',
  proposal_count INTEGER NOT NULL DEFAULT 1,
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email, trade)
);

-- ═══════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE bid_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_pool ENABLE ROW LEVEL SECURITY;

-- Bid packages: users CRUD own packages
DROP POLICY IF EXISTS "Users can CRUD own bid packages" ON bid_packages;
CREATE POLICY "Users can CRUD own bid packages" ON bid_packages
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Bid invitations: users CRUD own invitations
DROP POLICY IF EXISTS "Users can CRUD own bid invitations" ON bid_invitations;
CREATE POLICY "Users can CRUD own bid invitations" ON bid_invitations
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Bid proposals: anyone can INSERT (subs submit via portal), owners can read
DROP POLICY IF EXISTS "Anyone can insert proposals" ON bid_proposals;
CREATE POLICY "Anyone can insert proposals" ON bid_proposals
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Package owners can read proposals" ON bid_proposals;
CREATE POLICY "Package owners can read proposals" ON bid_proposals
  FOR SELECT USING (
    package_id IN (SELECT id FROM bid_packages WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Package owners can update proposals" ON bid_proposals;
CREATE POLICY "Package owners can update proposals" ON bid_proposals
  FOR UPDATE USING (
    package_id IN (SELECT id FROM bid_packages WHERE user_id = auth.uid())
  );

-- Sub pool: readable by all authenticated users, insertable by service role (API)
DROP POLICY IF EXISTS "Authenticated users can read sub pool" ON sub_pool;
CREATE POLICY "Authenticated users can read sub pool" ON sub_pool
  FOR SELECT USING (auth.role() = 'authenticated');

-- ═══════════════════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_bid_packages_user ON bid_packages(user_id, estimate_id);
CREATE INDEX IF NOT EXISTS idx_bid_invitations_package ON bid_invitations(package_id);
CREATE INDEX IF NOT EXISTS idx_bid_invitations_token ON bid_invitations(token);
CREATE INDEX IF NOT EXISTS idx_bid_proposals_invitation ON bid_proposals(invitation_id);
CREATE INDEX IF NOT EXISTS idx_bid_proposals_package ON bid_proposals(package_id);
CREATE INDEX IF NOT EXISTS idx_sub_pool_trade ON sub_pool(trade);
CREATE INDEX IF NOT EXISTS idx_sub_pool_email ON sub_pool(email);

-- ═══════════════════════════════════════════════════════════════════════
-- Storage bucket for proposal uploads
-- ═══════════════════════════════════════════════════════════════════════
-- Run this separately in Supabase Dashboard > Storage or via API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('proposals', 'proposals', false);
