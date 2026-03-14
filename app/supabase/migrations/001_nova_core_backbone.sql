-- ============================================================
-- NOVA Core — Group 1 Backbone Schema
-- 001_nova_core_backbone.sql
-- 8 tables: csi_codes, trades, units_of_measure, building_types,
--           project_types, delivery_methods, cost_categories,
--           seasonal_adjustments
-- All shared reference data. No RLS. No org_id. No user_id.
-- ============================================================

BEGIN;

-- --------------------------------------------------------
-- 1. csi_codes
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS csi_codes (
    id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    division        integer     NOT NULL,           -- Top-level CSI division. 1-49.
    section         text        NOT NULL,           -- Section code. e.g. '03 30 00'
    title           text        NOT NULL,           -- Human-readable name. e.g. 'Cast-in-Place Concrete'
    level           integer     NOT NULL,           -- Hierarchy depth. 1=division, 2=section, 3=assembly, 4=unit.
    parent_id       uuid                 REFERENCES csi_codes(id), -- FK. NULL for top-level divisions.
    canonical_unit  text,                           -- Default unit for cost data at this code. CY, SF, LF, EA, LS.
    description     text,                           -- Extended description for parser training.
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csi_division ON csi_codes (division);
CREATE INDEX IF NOT EXISTS idx_csi_section  ON csi_codes (section);
CREATE INDEX IF NOT EXISTS idx_csi_parent   ON csi_codes (parent_id);

-- --------------------------------------------------------
-- 2. trades
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS trades (
    id                    uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name                  text          NOT NULL,           -- e.g. 'Concrete', 'Electrical', 'Roofing'
    code                  text          NOT NULL,           -- Internal code. e.g. 'CONC', 'ELEC', 'ROOF'. UNIQUE.
    soc_codes             text[]        NOT NULL,           -- BLS SOC codes for this trade. e.g. ARRAY['47-2061']
    csi_divisions         integer[]     NOT NULL,           -- Primary CSI divisions. e.g. ARRAY[3, 4]
    burden_multiplier     numeric(5,3)  NOT NULL,           -- Trade-specific burden. e.g. 1.38 for concrete. NEVER flat 1.40.
    open_shop_ratio       numeric(5,3)  NOT NULL,           -- Ratio to convert prevailing wage to open shop. Trade-specific.
    wc_rate_range_low     numeric(5,3)  NOT NULL,           -- Workers comp rate floor for this trade. e.g. 0.20
    wc_rate_range_high    numeric(5,3)  NOT NULL,           -- Workers comp rate ceiling for this trade. e.g. 0.28
    seasonal_sensitivity  text          NOT NULL,           -- none | low | medium | high. Drives Step 3b normalization.
    created_at            timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_code ON trades (code);

-- --------------------------------------------------------
-- 3. units_of_measure
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS units_of_measure (
    id              uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    code            text          NOT NULL,           -- Short code. SF, LF, CY, EA, LS, TON, GAL, LB. UNIQUE.
    name            text          NOT NULL,           -- Full name. 'Square Foot', 'Linear Foot', 'Cubic Yard'
    dimension       text          NOT NULL,           -- area | length | volume | count | weight | lump-sum
    conversion_to_si numeric(12,6),                   -- Factor to convert to SI base unit. NULL for dimensionless.
    aliases         text[]        NOT NULL,           -- Common variations. ARRAY['sq ft', 'sqft', 'S.F.'] for SF.
    created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_uom_code ON units_of_measure (code);

-- --------------------------------------------------------
-- 4. building_types
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS building_types (
    id                      uuid      NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    code                    text      NOT NULL,           -- e.g. 'MULTI_MID', 'OFFICE_CLASS_A'. UNIQUE.
    name                    text      NOT NULL,           -- Human-readable. 'Mid-Rise Multifamily (5-12 stories)'
    category                text      NOT NULL,           -- residential | commercial | industrial | institutional | mixed_use
    typical_sf_range_low    integer,                      -- Typical project SF floor for this type.
    typical_sf_range_high   integer,                      -- Typical project SF ceiling for this type.
    typical_story_range_low integer,                      -- Story count floor.
    typical_story_range_high integer,                     -- Story count ceiling.
    construction_type       text[]    NOT NULL,           -- IBC types. ARRAY['III-A', 'III-B', 'V-A'] etc.
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_building_type_code ON building_types (code);
CREATE INDEX IF NOT EXISTS idx_building_type_category ON building_types (category);

-- --------------------------------------------------------
-- 5. project_types
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_types (
    id                  uuid      NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    code                text      NOT NULL,           -- NC, RENO, TI, ADAPTIVE_REUSE, ADDITION, SITEWORK. UNIQUE.
    name                text      NOT NULL,           -- Human-readable. 'Tenant Improvement'
    description         text,                         -- Extended description for classification logic.
    affects_sf_benchmark boolean  NOT NULL,           -- True if this type uses its own SF benchmark vs NC.
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_type_code ON project_types (code);

-- --------------------------------------------------------
-- 6. delivery_methods
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery_methods (
    id                  uuid      NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    code                text      NOT NULL,           -- DBB, DB, CMaR, GMP, CMAR, IPBD, TM. UNIQUE.
    name                text      NOT NULL,           -- Human-readable. 'Design-Build' etc.
    has_gmp             boolean   NOT NULL,           -- Does this method typically have a GMP contract?
    pdc_structure_typical text,                       -- Notes on typical PDC structure for this delivery method.
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_method_code ON delivery_methods (code);

-- --------------------------------------------------------
-- 7. cost_categories
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS cost_categories (
    id                          uuid      NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    code                        text      NOT NULL,           -- HARD, SOFT, FF_AND_E, CONTINGENCY, ESCALATION, FINANCING. UNIQUE.
    name                        text      NOT NULL,           -- Human-readable.
    included_in_construction_cost boolean NOT NULL,           -- True for HARD only. Determines if line contributes to unit cost benchmarks.
    description                 text,                         -- Definition for parser and UI classification.
    created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_category_code ON cost_categories (code);

-- --------------------------------------------------------
-- 8. seasonal_adjustments
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS seasonal_adjustments (
    id              uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    trade_id        uuid          NOT NULL REFERENCES trades(id),   -- FK to trades.id
    climate_zone    text          NOT NULL,           -- northern | southern | mountain | coastal
    month           integer       NOT NULL,           -- 1-12. January = 1.
    adjustment_factor numeric(5,4) NOT NULL,          -- Multiply raw unit cost by this to normalize to base conditions.
    base_month      integer       NOT NULL,           -- Reference month for this trade/zone. Typically 6 (June).
    notes           text,                             -- e.g. 'Winter premium includes heating enclosure and extended cure time'
    validated_at    timestamptz,                       -- Date this factor was last validated against real market data.
    created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seasonal_lookup ON seasonal_adjustments (trade_id, climate_zone, month);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seasonal_unique ON seasonal_adjustments (trade_id, climate_zone, month);

-- Constraint: only insert rows for trades with seasonal_sensitivity != 'none'
-- Validated via trigger or application logic — not a DB constraint.

COMMIT;
