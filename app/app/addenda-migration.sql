-- ═══════════════════════════════════════════════════════════════
-- Addenda System Migration — Add addendum tracking to pending_rfps
-- Run in Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Add addendum columns to pending_rfps
ALTER TABLE pending_rfps ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'original';
ALTER TABLE pending_rfps ADD COLUMN IF NOT EXISTS parent_rfp_id UUID;
ALTER TABLE pending_rfps ADD COLUMN IF NOT EXISTS parent_estimate_id TEXT;
ALTER TABLE pending_rfps ADD COLUMN IF NOT EXISTS addendum_number INTEGER;
ALTER TABLE pending_rfps ADD COLUMN IF NOT EXISTS match_confidence REAL;

-- Index for efficient addendum lookups (same sender, imported status)
CREATE INDEX IF NOT EXISTS idx_pending_rfps_sender_status
  ON pending_rfps(user_id, sender_email, status);

-- Index for finding addenda by parent
CREATE INDEX IF NOT EXISTS idx_pending_rfps_parent
  ON pending_rfps(parent_rfp_id) WHERE parent_rfp_id IS NOT NULL;
