-- ═══════════════════════════════════════════════════════════════════════════════
-- Email Threading Migration — Run in Supabase Dashboard SQL Editor
--
-- Adds email threading fields to pending_rfps for:
-- 1. Email thread header tracking (Message-ID, In-Reply-To, References)
-- 2. AI classification beyond just addendum detection
-- 3. Bidirectional linking between emails and estimates
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Email thread headers (for reliable thread matching)
ALTER TABLE pending_rfps ADD COLUMN IF NOT EXISTS message_id TEXT;
ALTER TABLE pending_rfps ADD COLUMN IF NOT EXISTS in_reply_to TEXT;
ALTER TABLE pending_rfps ADD COLUMN IF NOT EXISTS references_header TEXT;

-- 2. AI classification of email purpose
-- Values: 'initial_rfp' | 'addendum' | 'date_change' | 'scope_clarification' |
--         'substitution' | 'pre_bid_notes' | 'plan_room_notification' | 'other'
ALTER TABLE pending_rfps ADD COLUMN IF NOT EXISTS classification TEXT DEFAULT 'initial_rfp';

-- 3. Bidirectional estimate linking
-- linked_estimate_id: the estimate this email is associated with (set on import or auto-match)
ALTER TABLE pending_rfps ADD COLUMN IF NOT EXISTS linked_estimate_id TEXT;

-- 4. Sender domain fingerprint (for matching emails from different people at same firm)
ALTER TABLE pending_rfps ADD COLUMN IF NOT EXISTS sender_domain TEXT;

-- 5. Index for fast lookups by linked estimate
CREATE INDEX IF NOT EXISTS idx_pending_rfps_linked_estimate
  ON pending_rfps (linked_estimate_id)
  WHERE linked_estimate_id IS NOT NULL;

-- 6. Index for thread header matching
CREATE INDEX IF NOT EXISTS idx_pending_rfps_message_id
  ON pending_rfps (message_id)
  WHERE message_id IS NOT NULL;

-- 7. Backfill sender_domain from existing sender_email
UPDATE pending_rfps
SET sender_domain = split_part(sender_email, '@', 2)
WHERE sender_email IS NOT NULL AND sender_domain IS NULL;

-- 8. Backfill classification from existing type field
UPDATE pending_rfps
SET classification = CASE
  WHEN type = 'addendum' THEN 'addendum'
  ELSE 'initial_rfp'
END
WHERE classification IS NULL OR classification = 'initial_rfp';

-- Done! Verify with:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'pending_rfps' ORDER BY ordinal_position;
