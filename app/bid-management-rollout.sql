-- Bid Management Rollout SQL Migration
-- Run in Supabase Dashboard → SQL Editor
-- Safe to re-run (uses IF NOT EXISTS)

-- Scope sheets for bid packages
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS scope_sheet TEXT;

-- Award workflow
ALTER TABLE bid_invitations ADD COLUMN IF NOT EXISTS awarded_at TIMESTAMPTZ;
ALTER TABLE bid_invitations ADD COLUMN IF NOT EXISTS feedback_notes TEXT;
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS awarded_invitation_id UUID REFERENCES bid_invitations(id);
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
