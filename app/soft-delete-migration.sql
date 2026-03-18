-- Soft-Delete Migration for user_estimates
-- Run this in Supabase Dashboard > SQL Editor
--
-- Adds a deleted_at column so deleted estimates are marked rather than removed.
-- This prevents zombie resurrection when IndexedDB is cleared (the server itself
-- knows what's deleted, independent of client-side tracking).

-- 1. Add the soft-delete column (NULL = not deleted, timestamp = deleted)
ALTER TABLE user_estimates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Index for efficient filtering of non-deleted estimates
-- (org_id added later via org-setup.sql — index uses user_id only)
CREATE INDEX IF NOT EXISTS idx_user_estimates_not_deleted
  ON user_estimates (user_id)
  WHERE deleted_at IS NULL;
