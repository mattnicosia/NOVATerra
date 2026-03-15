-- ============================================================
-- NOVA Core — Sprint 4: carbon_data table
-- 011_nova_core_carbon_data.sql
--
-- Stores carbon coefficients (kg CO2e per canonical unit) for
-- construction materials. Two sources kept separate: ICE Database
-- generic averages and EC3 product-category values.
-- A1-A5 lifecycle stages stored in individual columns.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS carbon_data (
  id                              uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id                          uuid            NOT NULL REFERENCES organizations(id),
  csi_code_id                     uuid            NOT NULL REFERENCES csi_codes(id),
  trade_id                        uuid            NOT NULL REFERENCES trades(id),
  material_name                   text            NOT NULL,
  canonical_unit                  text            NOT NULL,
  ice_co2e                        numeric(12,4)   NOT NULL,   -- kg CO2e per canonical unit (ICE generic average)
  a1_a3_co2e                      numeric(12,4)   NOT NULL,   -- Product stage: raw material extraction + manufacturing
  transport_co2e_pct              numeric(5,3)    NOT NULL,   -- Decimal: 0.12 = 12%. Heavy structural ~12%, light ~5%
  a4_co2e                         numeric(12,4)   NOT NULL,   -- Transport to site: a1_a3_co2e * transport_co2e_pct
  a5_co2e                         numeric(12,4)   NOT NULL,   -- Construction process: 0.05 * a1_a3_co2e
  total_co2e                      numeric(12,4)   NOT NULL,   -- a1_a3_co2e + a4_co2e + a5_co2e
  active_co2e_source              text            NOT NULL DEFAULT 'ice_generic',  -- ice_generic | ice_generic_ec3 | epd_specific | estimated
  transport_assumption_disclosed  boolean         NOT NULL DEFAULT true,
  substitutes                     jsonb,                      -- Array of {material_name, co2e_reduction_pct, cost_premium_pct, source}
  data_vintage                    date            NOT NULL,
  created_at                      timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX idx_carbon_data_csi ON carbon_data (csi_code_id, active_co2e_source);
CREATE INDEX idx_carbon_data_trade ON carbon_data (trade_id);
CREATE INDEX idx_carbon_data_org ON carbon_data (org_id);

COMMIT;
