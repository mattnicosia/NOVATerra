-- ============================================================
-- NOVA Core — Living Proposals & Project Threads
-- Migration 016
--
-- Creates:
--   1. living_proposals         — shareable proposal links
--   2. living_proposal_versions — immutable version snapshots
--   3. living_proposal_views    — server-side analytics
--   4. living_proposal_comments — owner + GC comments
--   5. living_proposal_alternates — owner alternate selections
--   6. project_threads          — unified bid activity container
-- ============================================================

-- ── 1. living_proposals ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS living_proposals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id),
  estimate_id         TEXT NOT NULL,
  user_id             UUID NOT NULL,
  slug                TEXT UNIQUE NOT NULL,
  access_token        TEXT UNIQUE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','published','expired','revoked')),

  -- White-label branding
  gc_company_name     TEXT NOT NULL,
  gc_logo_url         TEXT,
  gc_accent_color     TEXT DEFAULT '#7C5CFC',
  gc_phone            TEXT,
  gc_email            TEXT,

  -- Proposal metadata
  project_name        TEXT NOT NULL,
  project_address     TEXT,
  owner_name          TEXT,
  owner_email         TEXT,
  owner_contact_name  TEXT,

  -- Expiration
  valid_days           INTEGER,
  valid_until         TIMESTAMPTZ,
  expired_at          TIMESTAMPTZ,

  -- Counters (denormalized for dashboard speed)
  version_count       INTEGER NOT NULL DEFAULT 0,
  view_count          INTEGER NOT NULL DEFAULT 0,
  comment_count       INTEGER NOT NULL DEFAULT 0,
  last_viewed_at      TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: org isolation
ALTER TABLE living_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "living_proposals_org_isolation"
  ON living_proposals
  FOR ALL
  USING (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::uuid)
  WITH CHECK (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::uuid);

CREATE POLICY "living_proposals_service_role"
  ON living_proposals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX idx_lp_slug ON living_proposals(slug);
CREATE INDEX idx_lp_org ON living_proposals(org_id);
CREATE INDEX idx_lp_user ON living_proposals(user_id);
CREATE INDEX idx_lp_estimate ON living_proposals(estimate_id);
CREATE INDEX idx_lp_status ON living_proposals(status);

-- ── 2. living_proposal_versions ──────────────────────────────

CREATE TABLE IF NOT EXISTS living_proposal_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  living_proposal_id  UUID NOT NULL REFERENCES living_proposals(id) ON DELETE CASCADE,
  version_number      INTEGER NOT NULL,
  published_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by        UUID NOT NULL,

  -- Snapshot data (frozen at publish time)
  snapshot_data       JSONB NOT NULL,
  grand_total         NUMERIC(14,2) NOT NULL,
  direct_cost         NUMERIC(14,2),
  division_totals     JSONB,

  -- Change notes
  change_summary      TEXT,
  change_diff         JSONB,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(living_proposal_id, version_number)
);

ALTER TABLE living_proposal_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lpv_service_role"
  ON living_proposal_versions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can SELECT their own proposal versions
CREATE POLICY "lpv_select_own"
  ON living_proposal_versions
  FOR SELECT
  USING (
    living_proposal_id IN (
      SELECT id FROM living_proposals
      WHERE org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::uuid
    )
  );

CREATE INDEX idx_lpv_proposal ON living_proposal_versions(living_proposal_id);
CREATE INDEX idx_lpv_published ON living_proposal_versions(published_at DESC);

-- ── 3. living_proposal_views ─────────────────────────────────

CREATE TABLE IF NOT EXISTS living_proposal_views (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  living_proposal_id  UUID NOT NULL REFERENCES living_proposals(id) ON DELETE CASCADE,
  version_id          UUID REFERENCES living_proposal_versions(id),
  viewer_fingerprint  TEXT,
  ip_hash             TEXT,
  user_agent          TEXT,
  referrer            TEXT,
  viewed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_seconds    INTEGER,
  sections_viewed     TEXT[]
);

ALTER TABLE living_proposal_views ENABLE ROW LEVEL SECURITY;

-- Public anonymous INSERT (owners viewing proposals)
CREATE POLICY "lpviews_anon_insert"
  ON living_proposal_views
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "lpviews_service_role"
  ON living_proposal_views
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can SELECT their own views
CREATE POLICY "lpviews_select_own"
  ON living_proposal_views
  FOR SELECT
  USING (
    living_proposal_id IN (
      SELECT id FROM living_proposals
      WHERE org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::uuid
    )
  );

CREATE INDEX idx_lpviews_proposal ON living_proposal_views(living_proposal_id);
CREATE INDEX idx_lpviews_viewed ON living_proposal_views(viewed_at DESC);

-- ── 4. living_proposal_comments ──────────────────────────────

CREATE TABLE IF NOT EXISTS living_proposal_comments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  living_proposal_id  UUID NOT NULL REFERENCES living_proposals(id) ON DELETE CASCADE,
  version_id          UUID REFERENCES living_proposal_versions(id),
  author_type         TEXT NOT NULL CHECK (author_type IN ('owner','gc')),
  author_name         TEXT NOT NULL,
  author_email        TEXT,
  content             TEXT NOT NULL,
  target_type         TEXT,
  target_id           TEXT,
  is_read             BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE living_proposal_comments ENABLE ROW LEVEL SECURITY;

-- Public anonymous INSERT (owners commenting)
CREATE POLICY "lpcomments_anon_insert"
  ON living_proposal_comments
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "lpcomments_service_role"
  ON living_proposal_comments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "lpcomments_select_own"
  ON living_proposal_comments
  FOR SELECT
  USING (
    living_proposal_id IN (
      SELECT id FROM living_proposals
      WHERE org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::uuid
    )
  );

CREATE INDEX idx_lpcomments_proposal ON living_proposal_comments(living_proposal_id);

-- ── 5. living_proposal_alternates ────────────────────────────

CREATE TABLE IF NOT EXISTS living_proposal_alternates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  living_proposal_id  UUID NOT NULL REFERENCES living_proposals(id) ON DELETE CASCADE,
  version_id          UUID REFERENCES living_proposal_versions(id),
  alternate_id        TEXT NOT NULL,
  selected            BOOLEAN NOT NULL DEFAULT false,
  selected_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE living_proposal_alternates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lpalts_anon_insert"
  ON living_proposal_alternates
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "lpalts_anon_update"
  ON living_proposal_alternates
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "lpalts_service_role"
  ON living_proposal_alternates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_lpalts_proposal ON living_proposal_alternates(living_proposal_id);

-- ── 6. project_threads ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_threads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id),
  estimate_id         TEXT NOT NULL,
  user_id             UUID NOT NULL,
  project_name        TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','awarded','lost','archived')),

  living_proposal_id  UUID REFERENCES living_proposals(id),

  -- Denormalized counters
  inbound_rfp_count   INTEGER NOT NULL DEFAULT 0,
  sub_proposal_count  INTEGER NOT NULL DEFAULT 0,
  email_count         INTEGER NOT NULL DEFAULT 0,
  action_item_count   INTEGER NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE project_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_threads_org_isolation"
  ON project_threads
  FOR ALL
  USING (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::uuid)
  WITH CHECK (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::uuid);

CREATE POLICY "project_threads_service_role"
  ON project_threads
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_pt_org ON project_threads(org_id);
CREATE INDEX idx_pt_estimate ON project_threads(estimate_id);
CREATE INDEX idx_pt_status ON project_threads(status);
