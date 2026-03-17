-- ============================================================
-- Migration 017: Estimate Revisions
-- Adds revision tracking to estimates + preferred sub designation
-- ============================================================

-- ── Add revision columns to user_estimates ──
-- parent_estimate_id: links revision to original estimate
-- revision_number: 0 = original, 1 = first revision, etc.
-- revision_reason: owner's reason for requesting revision
-- revision_created_at: when the revision was created
ALTER TABLE user_estimates
  ADD COLUMN IF NOT EXISTS parent_estimate_id UUID REFERENCES user_estimates(id),
  ADD COLUMN IF NOT EXISTS revision_number INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revision_reason TEXT,
  ADD COLUMN IF NOT EXISTS revision_created_at TIMESTAMPTZ;

-- Index for fast lookup of revision chains
CREATE INDEX IF NOT EXISTS idx_user_estimates_parent
  ON user_estimates(parent_estimate_id)
  WHERE parent_estimate_id IS NOT NULL;

-- ── Preferred subs table ──
-- One preferred sub per trade per estimate (the sub you want to continue working with)
CREATE TABLE IF NOT EXISTS preferred_subs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES user_estimates(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id),
  trade TEXT NOT NULL,
  sub_company TEXT NOT NULL,
  sub_contact TEXT,
  sub_email TEXT,
  sub_phone TEXT,
  invitation_id UUID,           -- FK to the original bid invitation if applicable
  total_bid NUMERIC,            -- their winning/selected bid amount
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(estimate_id, trade)    -- one preferred sub per trade per estimate
);

-- RLS for preferred_subs
ALTER TABLE preferred_subs ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "preferred_subs_service" ON preferred_subs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Org-scoped access
CREATE POLICY "preferred_subs_org_read" ON preferred_subs
  FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT id FROM organizations WHERE id = org_id)
    OR org_id IS NULL
  );

CREATE POLICY "preferred_subs_org_write" ON preferred_subs
  FOR ALL TO authenticated
  USING (
    org_id IN (
      SELECT o.id FROM organizations o
      JOIN org_members m ON m.org_id = o.id
      WHERE m.user_id = auth.uid()
    )
    OR org_id IS NULL
  )
  WITH CHECK (
    org_id IN (
      SELECT o.id FROM organizations o
      JOIN org_members m ON m.org_id = o.id
      WHERE m.user_id = auth.uid()
    )
    OR org_id IS NULL
  );

-- ── Revision history view (convenience) ──
CREATE OR REPLACE VIEW revision_chain AS
SELECT
  e.id,
  e.parent_estimate_id,
  e.revision_number,
  e.revision_reason,
  e.revision_created_at,
  e.created_at,
  e.updated_at
FROM user_estimates e
WHERE e.deleted_at IS NULL
ORDER BY e.parent_estimate_id NULLS FIRST, e.revision_number;
