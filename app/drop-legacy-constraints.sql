-- ═══════════════════════════════════════════════════════════
-- Drop legacy unique constraints that conflict with org mode
-- ═══════════════════════════════════════════════════════════
--
-- Background:
--   supabase-setup.sql created these UNIQUE constraints:
--     user_data(user_id, key)       → auto-named "user_data_user_id_key_key"
--     user_estimates(user_id, estimate_id) → auto-named "user_estimates_user_id_estimate_id_key"
--
--   org-setup.sql added dual-mode partial unique indexes:
--     idx_user_data_uq_solo     → UNIQUE(user_id, key) WHERE org_id IS NULL
--     idx_user_data_uq_org      → UNIQUE(user_id, key, org_id) WHERE org_id IS NOT NULL
--     idx_user_estimates_uq_solo → UNIQUE(user_id, estimate_id) WHERE org_id IS NULL
--     idx_user_estimates_uq_org  → UNIQUE(user_id, estimate_id, org_id) WHERE org_id IS NOT NULL
--
--   The old constraints are a superset — they reject org-mode inserts where
--   (user_id, key) already exists for a different org_id. cloudSync.js currently
--   catches the resulting 23505 error and falls back to UPDATE, but dropping the
--   old constraints is the correct fix.
--
-- Run this in Supabase Dashboard → SQL Editor
-- Safe to run multiple times (IF EXISTS)
-- ═══════════════════════════════════════════════════════════

-- 1. Drop the legacy global UNIQUE on user_data
ALTER TABLE user_data DROP CONSTRAINT IF EXISTS user_data_user_id_key_key;

-- 2. Drop the legacy global UNIQUE on user_estimates
ALTER TABLE user_estimates DROP CONSTRAINT IF EXISTS user_estimates_user_id_estimate_id_key;

-- 3. Verify: list remaining indexes on both tables to confirm partial indexes survive
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('user_data', 'user_estimates')
  AND indexname LIKE '%uq%' OR indexname LIKE '%user_data_user_id%' OR indexname LIKE '%user_estimates_user_id%'
ORDER BY tablename, indexname;
