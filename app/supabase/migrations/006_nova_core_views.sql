-- ============================================================
-- Migration 006: NOVA Core Views
-- market_tension_index table + market_intelligence_view materialized view
-- ============================================================

BEGIN;

-- ============================================================
-- 1. market_tension_index — per-metro market health signal
-- ============================================================
CREATE TABLE market_tension_index (
  id                    uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metro_area            text          NOT NULL,
  market_tension_index  numeric(5,1)  NOT NULL,
  tension_label         text          NOT NULL,
  proposal_volume_score numeric(5,1),
  bid_count_score       numeric(5,1),
  bid_spread_score      numeric(5,1),
  cost_trend_score      numeric(5,1),
  computed_at           timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_mti_metro ON market_tension_index (metro_area);

-- ============================================================
-- 2. market_intelligence_view — materialized view
--    Joins: unit_costs, csi_codes, trades, units_of_measure,
--           pdc_benchmarks, market_tension_index
--    Filters: is_active, is_current_revision, NOT outlier_flag
-- ============================================================
CREATE MATERIALIZED VIEW market_intelligence_view AS
WITH pctl AS (
  SELECT
    csi_code_id,
    PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY unit_cost) AS p10,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY unit_cost) AS p50,
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY unit_cost) AS p90
  FROM unit_costs
  WHERE is_active = true
    AND is_current_revision = true
    AND outlier_flag = false
  GROUP BY csi_code_id
)
SELECT
  -- === Unit cost identity ===
  uc.id                           AS unit_cost_id,
  uc.csi_code_id,
  uc.trade_id,
  uc.unit_id,
  uc.org_id,

  -- === Descriptors from lookup tables ===
  csi.division                    AS csi_division,
  csi.section                     AS csi_section,
  csi.title                       AS csi_title,
  csi.level                       AS csi_level,
  tr.name                         AS trade_name,
  tr.code                         AS trade_code,
  uom.code                        AS unit_code,
  uom.name                        AS unit_name,

  -- === Core cost data ===
  uc.unit_cost,
  uc.raw_unit_cost,
  uc.source_type,
  uc.source_weight,
  uc.contribution_weight,
  uc.recency_weight,
  uc.geo_weight,

  -- === Geography ===
  uc.state,
  uc.metro_area,
  uc.climate_zone,

  -- === Flags ===
  uc.burden_included,
  uc.overhead_included,
  uc.profit_included,
  uc.pdc_included,
  uc.lump_sum_resolved,

  -- === Price basis & display flag (derived from local sample density) ===
  CASE
    WHEN COUNT(*) OVER w_local >= 30 THEN 'market_all_in'
    WHEN COUNT(*) OVER w_local >= 5  THEN 'blended'
    ELSE 'sf_seed'
  END                             AS price_basis,
  CASE
    WHEN COUNT(*) OVER w_local >= 30 THEN 'none'
    WHEN COUNT(*) OVER w_local >= 5  THEN 'indicative'
    ELSE 'insufficient_data'
  END                             AS display_flag,

  -- === National weighted mean (across all metros for this CSI code) ===
  SUM(uc.unit_cost * uc.contribution_weight) OVER w_national
    / NULLIF(SUM(uc.contribution_weight) OVER w_national, 0)
                                  AS national_weighted_mean,

  -- === Local weighted mean (within same CSI code + metro) ===
  SUM(uc.unit_cost * uc.contribution_weight) OVER w_local
    / NULLIF(SUM(uc.contribution_weight) OVER w_local, 0)
                                  AS local_weighted_mean,

  -- === Percentiles (from CTE — ordered-set aggregates grouped by csi_code_id) ===
  pctl.p10,
  pctl.p50,
  pctl.p90,

  -- === Sample counts ===
  COUNT(*) OVER w_national        AS national_sample_count,
  COUNT(*) OVER w_local           AS local_sample_count,

  -- === PDC context columns ===
  pdc.pdc_bucket,
  pdc.p10_pct                     AS pdc_p10_pct,
  pdc.p50_pct                     AS pdc_p50_pct,
  pdc.p90_pct                     AS pdc_p90_pct,
  pdc.org_running_pdc_pct,
  pdc.size_curve                  AS pdc_size_curve,
  pdc.awarded_count               AS pdc_awarded_count,
  pdc.total_count                 AS pdc_total_count,

  -- === Market Tension Index columns ===
  mti.market_tension_index,
  mti.tension_label,
  mti.proposal_volume_score,
  mti.bid_count_score,
  mti.bid_spread_score,
  mti.cost_trend_score,
  mti.computed_at                 AS tension_computed_at,

  -- === Carbon columns (NULL placeholders — future integration) ===
  NULL::numeric                   AS ice_co2e_per_unit,
  NULL::numeric                   AS ec3_co2e_per_unit,

  -- === Timestamps ===
  uc.created_at,
  uc.updated_at

FROM unit_costs uc
JOIN csi_codes         csi  ON csi.id  = uc.csi_code_id
JOIN trades            tr   ON tr.id   = uc.trade_id
JOIN units_of_measure  uom  ON uom.id  = uc.unit_id
JOIN pctl                   ON pctl.csi_code_id = uc.csi_code_id
LEFT JOIN pdc_benchmarks pdc ON pdc.state = uc.state
                              AND COALESCE(pdc.metro_area, '') = COALESCE(uc.metro_area, '')
                              AND pdc.org_id = uc.org_id
LEFT JOIN market_tension_index mti ON mti.metro_area = uc.metro_area

WHERE uc.is_active            = true
  AND uc.is_current_revision  = true
  AND uc.outlier_flag         = false

WINDOW
  w_national AS (PARTITION BY uc.csi_code_id),
  w_local    AS (PARTITION BY uc.csi_code_id, uc.metro_area)
;

-- === Unique index on unit_cost_id (required for CONCURRENTLY refresh) ===
CREATE UNIQUE INDEX idx_miv_unit_cost_id
  ON market_intelligence_view (unit_cost_id);

-- === Lookup index for code + metro queries ===
CREATE INDEX idx_miv_csi_metro
  ON market_intelligence_view (csi_code_id, metro_area);

COMMIT;

-- === First refresh (CONCURRENTLY requires the unique index, so runs outside txn) ===
REFRESH MATERIALIZED VIEW CONCURRENTLY market_intelligence_view;
