-- ============================================================
-- NOVATerra — Enable Realtime for cross-device sync
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable Realtime on the two core data tables.
-- This allows Supabase Realtime channels to push postgres_changes
-- events when rows are inserted/updated in these tables.

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_estimates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_data;

-- Note: If you see "relation already exists in publication" errors,
-- the tables are already enabled — that's fine, ignore the error.
