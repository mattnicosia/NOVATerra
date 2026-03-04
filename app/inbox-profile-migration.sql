-- NOVATerra: Add company_profile_id to pending_rfps
-- Run this in Supabase Dashboard → SQL Editor
-- This enables filtering inbox RFPs by company profile

-- 1. Add company_profile_id column (empty string = primary/unassigned)
ALTER TABLE pending_rfps
  ADD COLUMN IF NOT EXISTS company_profile_id TEXT DEFAULT '';

-- 2. Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_pending_rfps_company_profile
  ON pending_rfps (user_id, company_profile_id, status);
