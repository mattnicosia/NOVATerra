-- ============================================================
-- NOVA Core — Sprint 5: AI Parser Tables
-- Migration 014
--
-- Creates:
--   1. bid_leveling_queue — parsed line items awaiting GC review
--   2. parser_audit_log  — every parse job logged with stats
--   3. proposals.parser_job_id — links proposals to their parse job
-- ============================================================

-- ── 1. bid_leveling_queue ──────────────────────────────────

CREATE TABLE IF NOT EXISTS bid_leveling_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  parse_job_id    UUID NOT NULL,
  proposal_id     UUID,
  raw_description TEXT NOT NULL,
  suggested_csi_code TEXT,
  csi_confidence  NUMERIC(4,2),
  quantity        NUMERIC(12,2),
  unit            TEXT,
  unit_cost       NUMERIC(12,2),
  total_cost      NUMERIC(12,2) NOT NULL,
  review_status   TEXT NOT NULL DEFAULT 'pending'
                  CHECK (review_status IN ('pending','approved','rejected','modified')),
  gc_csi_code     TEXT,
  gc_notes        TEXT,
  reviewed_by     UUID,
  reviewed_at     TIMESTAMPTZ,
  auto_routed     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: org isolation
ALTER TABLE bid_leveling_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bid_leveling_queue_org_isolation"
  ON bid_leveling_queue
  FOR ALL
  USING (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::uuid)
  WITH CHECK (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::uuid);

-- Service role bypass
CREATE POLICY "bid_leveling_queue_service_role"
  ON bid_leveling_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX idx_blq_org_status ON bid_leveling_queue(org_id, review_status);
CREATE INDEX idx_blq_parse_job ON bid_leveling_queue(parse_job_id);
CREATE INDEX idx_blq_created ON bid_leveling_queue(created_at DESC);

-- ── 2. parser_audit_log ────────────────────────────────────

CREATE TABLE IF NOT EXISTS parser_audit_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id),
  input_hash        TEXT NOT NULL,
  source_email      TEXT,
  sub_company_name  TEXT,
  pdf_page_count    INTEGER,
  total_lines_parsed INTEGER NOT NULL DEFAULT 0,
  high_confidence   INTEGER DEFAULT 0,
  mid_confidence    INTEGER DEFAULT 0,
  low_confidence    INTEGER DEFAULT 0,
  auto_written      INTEGER DEFAULT 0,
  total_bid_amount  NUMERIC(14,2),
  is_lump_sum       BOOLEAN,
  model_used        TEXT,
  tokens_input      INTEGER,
  tokens_output     INTEGER,
  parse_duration_ms INTEGER,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: org isolation
ALTER TABLE parser_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parser_audit_log_org_isolation"
  ON parser_audit_log
  FOR ALL
  USING (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::uuid)
  WITH CHECK (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::uuid);

-- Service role bypass
CREATE POLICY "parser_audit_log_service_role"
  ON parser_audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX idx_pal_org ON parser_audit_log(org_id);
CREATE INDEX idx_pal_created ON parser_audit_log(created_at DESC);
CREATE INDEX idx_pal_input_hash ON parser_audit_log(input_hash);

-- ── 3. Add parser_job_id to proposals ──────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'parser_job_id'
  ) THEN
    ALTER TABLE proposals ADD COLUMN parser_job_id UUID;
  END IF;
END $$;

-- FK to parser_audit_log (nullable — manually created proposals have no parse job)
-- Note: no FK constraint per spec — avoids circular dependency issues
CREATE INDEX IF NOT EXISTS idx_proposals_parser_job ON proposals(parser_job_id);
