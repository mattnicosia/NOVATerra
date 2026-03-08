-- ═══════════════════════════════════════════════════════════════
-- Multi-User Collaboration Migration
-- Run in Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── Estimate Locks (heartbeat-based pessimistic locking) ─────
CREATE TABLE IF NOT EXISTS estimate_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id TEXT NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(id),
  locked_by UUID NOT NULL REFERENCES auth.users(id),
  locked_by_name TEXT,
  locked_by_color TEXT,
  acquired_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(estimate_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_estimate_locks_expiry
  ON estimate_locks(expires_at);

ALTER TABLE estimate_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "locks_select" ON estimate_locks
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "locks_insert" ON estimate_locks
  FOR INSERT WITH CHECK (
    locked_by = auth.uid() AND is_org_member(org_id)
  );

CREATE POLICY "locks_update" ON estimate_locks
  FOR UPDATE USING (
    locked_by = auth.uid() OR is_org_manager(org_id)
  );

CREATE POLICY "locks_delete" ON estimate_locks
  FOR DELETE USING (
    locked_by = auth.uid() OR is_org_manager(org_id)
  );

-- ── Estimate Presence (lightweight, for avatar dots) ─────────
CREATE TABLE IF NOT EXISTS estimate_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id TEXT NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_name TEXT,
  user_color TEXT,
  last_seen TIMESTAMPTZ DEFAULT now(),
  UNIQUE(estimate_id, org_id, user_id)
);

ALTER TABLE estimate_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "presence_select" ON estimate_presence
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "presence_insert" ON estimate_presence
  FOR INSERT WITH CHECK (user_id = auth.uid() AND is_org_member(org_id));

CREATE POLICY "presence_update" ON estimate_presence
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "presence_delete" ON estimate_presence
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_estimate_presence_estimate
  ON estimate_presence(estimate_id, org_id);

-- ── Assignment column on user_estimates ──────────────────────
ALTER TABLE user_estimates ADD COLUMN IF NOT EXISTS assigned_to UUID[];

-- ── Enable realtime for collaboration tables ─────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE estimate_locks;
ALTER PUBLICATION supabase_realtime ADD TABLE estimate_presence;
