-- ============================================================
-- Migration 008: NOVA Core ROM Query Log
-- Tracks every ROM API query for intelligence analytics:
-- coverage analysis, fallback rates, popular CSI codes.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS rom_query_log (
  id              uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  csi_code_id     text          NOT NULL,
  metro_area      text          NOT NULL,
  display_flag    text          NOT NULL DEFAULT 'none',
  is_national     boolean       NOT NULL DEFAULT false,
  queried_at      timestamptz   NOT NULL DEFAULT now()
);

-- Fast lookups for analytics queries
CREATE INDEX idx_rom_query_log_queried_at ON rom_query_log (queried_at DESC);
CREATE INDEX idx_rom_query_log_metro      ON rom_query_log (metro_area, queried_at DESC);
CREATE INDEX idx_rom_query_log_csi        ON rom_query_log (csi_code_id, queried_at DESC);
CREATE INDEX idx_rom_query_log_flag       ON rom_query_log (display_flag, queried_at DESC);

COMMIT;
