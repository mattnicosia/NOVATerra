-- Fix: bid_packages.estimate_id must be TEXT, not UUID
-- Local estimate IDs are short random strings (e.g. "0u24pallt"), not UUIDs.
-- Run this in the Supabase Dashboard SQL Editor.

ALTER TABLE bid_packages
  ALTER COLUMN estimate_id TYPE text USING estimate_id::text;
