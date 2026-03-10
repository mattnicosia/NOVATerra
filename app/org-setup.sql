-- Multi-Tenant Organization System — Run in Supabase Dashboard > SQL Editor
-- Adds organizations, members, invitations + dual-mode RLS on existing tables

-- ═══════════════════════════════════════════════════════════════════════
-- 1. New Tables
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('owner','manager','estimator','client')),
  display_name TEXT,
  avatar_url TEXT,
  color TEXT DEFAULT '#6366F1',
  active BOOLEAN DEFAULT true,
  invited_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ,
  UNIQUE(org_id, user_id)
);

CREATE TABLE IF NOT EXISTS org_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager','estimator','client')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ DEFAULT now() + interval '7 days',
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Add org_id to existing tables (nullable — NULL = solo mode)
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE user_data ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE user_estimates ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE pending_rfps ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. RLS on new tables
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;

-- Organizations: owner + members can read, owner can update
CREATE POLICY "org_select" ON organizations
  FOR SELECT USING (
    owner_id = auth.uid()
    OR id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid() AND om.active = true)
  );
CREATE POLICY "org_insert" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "org_update" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

-- Org members: members can read their org, owners/managers can manage
CREATE POLICY "org_members_select" ON org_members
  FOR SELECT USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid() AND om.active = true)
  );
CREATE POLICY "org_members_insert" ON org_members
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE om.user_id = auth.uid() AND om.active = true AND om.role IN ('owner','manager')
    )
  );
CREATE POLICY "org_members_update" ON org_members
  FOR UPDATE USING (
    -- Can update own profile (but NOT role — enforced via WITH CHECK)
    user_id = auth.uid()
    OR org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE om.user_id = auth.uid() AND om.active = true AND om.role IN ('owner','manager')
    )
  ) WITH CHECK (
    -- Self-updates: role must not change (prevents escalation)
    (user_id = auth.uid() AND role = (SELECT role FROM org_members WHERE id = org_members.id))
    -- Manager/owner updates: any valid role
    OR org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE om.user_id = auth.uid() AND om.active = true AND om.role IN ('owner','manager')
    )
  );
CREATE POLICY "org_members_delete" ON org_members
  FOR DELETE USING (
    org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE om.user_id = auth.uid() AND om.active = true AND om.role IN ('owner','manager')
    )
  );

-- Helper: get current user's email (avoids auth.users permission issue in RLS)
CREATE OR REPLACE FUNCTION get_my_email() RETURNS TEXT AS $$
  SELECT email FROM auth.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Invitations: owners/managers can CRUD, invitee can read/update own
CREATE POLICY "org_invitations_select" ON org_invitations
  FOR SELECT USING (
    org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE om.user_id = auth.uid() AND om.active = true AND om.role IN ('owner','manager')
    )
    OR email = get_my_email()
  );
CREATE POLICY "org_invitations_insert" ON org_invitations
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE om.user_id = auth.uid() AND om.active = true AND om.role IN ('owner','manager')
    )
  );
CREATE POLICY "org_invitations_update" ON org_invitations
  FOR UPDATE USING (
    org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE om.user_id = auth.uid() AND om.active = true AND om.role IN ('owner','manager')
    )
    OR email = get_my_email()
  );
CREATE POLICY "org_invitations_delete" ON org_invitations
  FOR DELETE USING (
    org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE om.user_id = auth.uid() AND om.active = true AND om.role IN ('owner','manager')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Update RLS on existing tables — dual-mode (solo + org)
-- ═══════════════════════════════════════════════════════════════════════

-- Helper: check if user is owner/manager in an org
CREATE OR REPLACE FUNCTION is_org_manager(check_org_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM org_members
    WHERE org_id = check_org_id AND user_id = auth.uid() AND active = true AND role IN ('owner','manager')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Helper: check if user is a member of an org
CREATE OR REPLACE FUNCTION is_org_member(check_org_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM org_members
    WHERE org_id = check_org_id AND user_id = auth.uid() AND active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ── user_data ──
DROP POLICY IF EXISTS "Users can CRUD own data" ON user_data;

CREATE POLICY "user_data_select" ON user_data
  FOR SELECT USING (
    (org_id IS NULL AND user_id = auth.uid())
    OR (org_id IS NOT NULL AND is_org_member(org_id))
  );
CREATE POLICY "user_data_write" ON user_data
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (org_id IS NULL OR is_org_member(org_id))
  );
CREATE POLICY "user_data_update" ON user_data
  FOR UPDATE USING (
    (org_id IS NULL AND user_id = auth.uid())
    OR (org_id IS NOT NULL AND user_id = auth.uid() AND is_org_member(org_id))
    OR (org_id IS NOT NULL AND is_org_manager(org_id))
  );
CREATE POLICY "user_data_delete" ON user_data
  FOR DELETE USING (
    (org_id IS NULL AND user_id = auth.uid())
    OR (org_id IS NOT NULL AND user_id = auth.uid() AND is_org_member(org_id))
    OR (org_id IS NOT NULL AND is_org_manager(org_id))
  );

-- ── user_estimates ──
DROP POLICY IF EXISTS "Users can CRUD own estimates" ON user_estimates;

CREATE POLICY "user_estimates_select" ON user_estimates
  FOR SELECT USING (
    (org_id IS NULL AND user_id = auth.uid())
    OR (org_id IS NOT NULL AND is_org_member(org_id))
  );
CREATE POLICY "user_estimates_write" ON user_estimates
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (org_id IS NULL OR is_org_member(org_id))
  );
CREATE POLICY "user_estimates_update" ON user_estimates
  FOR UPDATE USING (
    (org_id IS NULL AND user_id = auth.uid())
    OR (org_id IS NOT NULL AND user_id = auth.uid() AND is_org_member(org_id))
    OR (org_id IS NOT NULL AND is_org_manager(org_id))
  );
CREATE POLICY "user_estimates_delete" ON user_estimates
  FOR DELETE USING (
    (org_id IS NULL AND user_id = auth.uid())
    OR (org_id IS NOT NULL AND user_id = auth.uid() AND is_org_member(org_id))
    OR (org_id IS NOT NULL AND is_org_manager(org_id))
  );

-- ── pending_rfps ──
DROP POLICY IF EXISTS "Users can CRUD own rfps" ON pending_rfps;

CREATE POLICY "pending_rfps_select" ON pending_rfps
  FOR SELECT USING (
    (org_id IS NULL AND user_id = auth.uid())
    OR (org_id IS NOT NULL AND is_org_member(org_id))
  );
CREATE POLICY "pending_rfps_write" ON pending_rfps
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (org_id IS NULL OR is_org_member(org_id))
  );
CREATE POLICY "pending_rfps_update" ON pending_rfps
  FOR UPDATE USING (
    (org_id IS NULL AND user_id = auth.uid())
    OR (org_id IS NOT NULL AND user_id = auth.uid() AND is_org_member(org_id))
    OR (org_id IS NOT NULL AND is_org_manager(org_id))
  );
CREATE POLICY "pending_rfps_delete" ON pending_rfps
  FOR DELETE USING (
    (org_id IS NULL AND user_id = auth.uid())
    OR (org_id IS NOT NULL AND user_id = auth.uid() AND is_org_member(org_id))
    OR (org_id IS NOT NULL AND is_org_manager(org_id))
  );

-- ── embeddings (keep existing shared/seed policies, add org-aware ones) ──
DROP POLICY IF EXISTS "Read own embeddings" ON embeddings;
DROP POLICY IF EXISTS "Manage own embeddings" ON embeddings;

CREATE POLICY "embeddings_select_own" ON embeddings
  FOR SELECT USING (
    (org_id IS NULL AND user_id = auth.uid())
    OR (org_id IS NOT NULL AND is_org_member(org_id))
  );
CREATE POLICY "embeddings_manage" ON embeddings
  FOR ALL USING (
    user_id = auth.uid()
    AND (org_id IS NULL OR is_org_member(org_id))
  ) WITH CHECK (
    user_id = auth.uid()
    AND (org_id IS NULL OR is_org_member(org_id))
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Indexes
-- ═══════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON org_invitations(email) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON org_invitations(token) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_data_org ON user_data(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_estimates_org ON user_estimates(org_id) WHERE org_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. RPC: Accept invitation (atomic: mark accepted + create membership)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION accept_invitation(invitation_token TEXT)
RETURNS JSONB AS $$
DECLARE
  inv RECORD;
  mem RECORD;
BEGIN
  -- Find valid invitation
  SELECT * INTO inv FROM org_invitations
  WHERE token = invitation_token AND accepted_at IS NULL AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or expired invitation');
  END IF;

  -- Check email matches current user
  IF inv.email != (SELECT email FROM auth.users WHERE id = auth.uid()) THEN
    RETURN jsonb_build_object('error', 'This invitation was sent to a different email address');
  END IF;

  -- Check not already a member
  IF EXISTS(SELECT 1 FROM org_members WHERE org_id = inv.org_id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('error', 'You are already a member of this organization');
  END IF;

  -- Create membership
  INSERT INTO org_members (org_id, user_id, role, display_name, joined_at)
  VALUES (inv.org_id, auth.uid(), inv.role, (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = auth.uid()), now())
  RETURNING * INTO mem;

  -- Mark invitation accepted
  UPDATE org_invitations SET accepted_at = now() WHERE id = inv.id;

  RETURN jsonb_build_object(
    'success', true,
    'org_id', inv.org_id,
    'role', inv.role,
    'member_id', mem.id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Additional constraints and indexes
-- ═══════════════════════════════════════════════════════════════════════

-- Prevent duplicate pending invitations to the same email in the same org
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_invitations_unique_pending
  ON org_invitations(org_id, email) WHERE accepted_at IS NULL;

-- Update unique constraints on user_data and user_estimates to include org_id
-- (required for onConflict upsert to work correctly in both solo and org modes)
-- NOTE: NULL org_id values are treated as distinct in PostgreSQL, so solo-mode
-- rows with org_id=NULL will not conflict with each other on (user_id, key, org_id).
-- To handle this, we use two partial unique indexes instead:
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_data_uq_solo
  ON user_data(user_id, key) WHERE org_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_data_uq_org
  ON user_data(user_id, key, org_id) WHERE org_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_estimates_uq_solo
  ON user_estimates(user_id, estimate_id) WHERE org_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_estimates_uq_org
  ON user_estimates(user_id, estimate_id, org_id) WHERE org_id IS NOT NULL;

-- Org delete policy (owner only)
CREATE POLICY "org_delete" ON organizations
  FOR DELETE USING (owner_id = auth.uid());
