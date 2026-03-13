-- NOVA Network Sprint 1 — DB Migration
-- Run in Supabase Dashboard SQL Editor

-- Sub response intents (Bidding / Reviewing / Pass)
ALTER TABLE bid_invitations ADD COLUMN IF NOT EXISTS intent TEXT;
ALTER TABLE bid_invitations ADD COLUMN IF NOT EXISTS intent_reason TEXT;
ALTER TABLE bid_invitations ADD COLUMN IF NOT EXISTS intent_at TIMESTAMPTZ;

-- Post-loss feedback (coverage %, exclusion gaps, price quartile)
ALTER TABLE bid_invitations ADD COLUMN IF NOT EXISTS post_loss_feedback JSONB;

-- Pre-send scope warnings cache
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS pre_send_warnings JSONB;
