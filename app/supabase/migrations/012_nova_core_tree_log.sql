-- ============================================================
-- NOVA Core — Tree Planting Log
-- Migration 012: tree_planting_log table
-- Tracks tree planting events triggered by carbon tier milestones.
-- ============================================================

BEGIN;

CREATE TABLE tree_planting_log (
  id                uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id            uuid            NOT NULL REFERENCES organizations(id),
  estimate_id       uuid,           -- the estimate that triggered this event (nullable for tier-based awards)
  event_type        text            NOT NULL,  -- 'first_carbon_estimate' | 'carbon_conscious' | 'carbon_leader' | 'carbon_champion'
  trees_awarded     integer         NOT NULL DEFAULT 0,
  grove_name        text,           -- set when carbon_leader+ tier reached
  carbon_tier       text            NOT NULL,  -- tier at time of award
  triggered_at      timestamptz     NOT NULL DEFAULT now(),
  created_at        timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX idx_tree_log_org ON tree_planting_log (org_id);
CREATE INDEX idx_tree_log_event ON tree_planting_log (event_type);

-- RLS: org-scoped read/write
ALTER TABLE tree_planting_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tree_log_org_read ON tree_planting_log
  FOR SELECT USING (org_id = auth.uid());

CREATE POLICY tree_log_org_insert ON tree_planting_log
  FOR INSERT WITH CHECK (org_id = auth.uid());

COMMIT;
