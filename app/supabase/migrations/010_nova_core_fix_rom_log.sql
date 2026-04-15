-- ============================================================
-- NOVA Core — Migration 010: Fix rom_query_log Schema
-- M7: Alter csi_code_id from TEXT to UUID with USING cast.
-- M8: Add CHECK constraint on display_flag values.
-- ============================================================

-- M7: Convert csi_code_id from TEXT to UUID
ALTER TABLE rom_query_log
  ALTER COLUMN csi_code_id TYPE uuid USING csi_code_id::uuid;

-- M8: Add CHECK constraint on display_flag
ALTER TABLE rom_query_log
  ADD CONSTRAINT rom_query_log_display_flag_check
  CHECK (display_flag IN ('none', 'indicative', 'insufficient_data', 'national_fallback', 'no_data'));
