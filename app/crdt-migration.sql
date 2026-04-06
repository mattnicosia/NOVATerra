-- ═══════════════════════════════════════════════════════════
-- CRDT Migration — Deprecate locks, mark presence for sunset
--
-- This migration prepares the transition from pessimistic
-- locking to CRDT-based concurrent editing. The tables are
-- NOT dropped — they're deprecated so rollback is instant.
--
-- Run this AFTER enabling VITE_ENABLE_CRDT=true in production.
-- The estimate_locks and estimate_presence tables remain
-- functional for legacy clients during gradual rollout.
-- ═══════════════════════════════════════════════════════════

-- 1. Add deprecation markers to lock and presence tables
ALTER TABLE estimate_locks
  ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE estimate_presence
  ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Add a comment explaining the deprecation
COMMENT ON TABLE estimate_locks IS
  'DEPRECATED: Being replaced by CRDT broadcast channels. Table kept for rollback during transition.';

COMMENT ON TABLE estimate_presence IS
  'DEPRECATED: Being replaced by Supabase Realtime Presence API. Table kept for rollback during transition.';

-- 3. Ensure Realtime is enabled for broadcast channels
-- (Broadcast channels don't need table-level Realtime — they use the Supabase
--  Realtime infrastructure directly. This is already configured from the
--  realtime-sync-migration.sql that enabled postgres_changes.)

-- 4. Clean up expired locks (housekeeping)
DELETE FROM estimate_locks WHERE expires_at < NOW();

-- 5. Clean up stale presence records (older than 1 hour)
DELETE FROM estimate_presence WHERE last_seen < NOW() - INTERVAL '1 hour';
