-- ============================================================
-- NOVA Core — Sprint 5: Parser Email Acknowledgement
-- Migration 015
--
-- Adds acknowledgement_sent column to parser_audit_log
-- to track whether the auto-reply email was sent successfully.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parser_audit_log' AND column_name = 'acknowledgement_sent'
  ) THEN
    ALTER TABLE parser_audit_log ADD COLUMN acknowledgement_sent BOOLEAN DEFAULT false;
  END IF;
END $$;
