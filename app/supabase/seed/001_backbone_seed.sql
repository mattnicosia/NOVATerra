-- ============================================================
-- NOVA Core — Backbone Seed Data
-- 001_backbone_seed.sql
-- Populates all 8 Group 1 backbone tables.
-- Run via: supabase db seed (or paste into SQL Editor)
-- ============================================================

BEGIN;

-- ========================================
-- 1. trades — 19 exact trades from Sprint 1 spec
-- ========================================
INSERT INTO trades (name, code, soc_codes, csi_divisions, burden_multiplier, open_shop_ratio, wc_rate_range_low, wc_rate_range_high, seasonal_sensitivity) VALUES
  ('Demolition',                'DEMO',          ARRAY['47-2061'], ARRAY[2],      1.38, 0.72, 0.18, 0.25, 'low'),
  ('Sitework & Earthwork',     'SITEWORK',      ARRAY['47-2061'], ARRAY[31,32,33], 1.38, 0.72, 0.18, 0.28, 'high'),
  ('Concrete',                 'CONC',          ARRAY['47-2051'], ARRAY[3],       1.38, 0.72, 0.20, 0.28, 'high'),
  ('Masonry',                  'MASON',         ARRAY['47-2021'], ARRAY[4],       1.38, 0.72, 0.20, 0.28, 'high'),
  ('Structural Steel',         'STRUCT_STEEL',  ARRAY['47-2221'], ARRAY[5],       1.46, 0.75, 0.15, 0.22, 'medium'),
  ('Miscellaneous Metals',     'MISC_METALS',   ARRAY['47-2221'], ARRAY[5],       1.38, 0.74, 0.15, 0.22, 'low'),
  ('Rough Carpentry & Framing','ROUGH_CARP',    ARRAY['47-2031'], ARRAY[6],       1.32, 0.74, 0.18, 0.25, 'medium'),
  ('Finish Carpentry & Millwork','FINISH_CARP', ARRAY['47-2031'], ARRAY[6],       1.32, 0.73, 0.12, 0.18, 'low'),
  ('Waterproofing & Roofing',  'WATERPROOF',    ARRAY['47-2181'], ARRAY[7],       1.54, 0.70, 0.22, 0.30, 'medium'),
  ('Insulation',               'INSULATION',    ARRAY['47-2131'], ARRAY[7],       1.29, 0.73, 0.10, 0.15, 'low'),
  ('Doors, Frames & Windows',  'DOORS_WINDOWS', ARRAY['47-2031'], ARRAY[8],       1.29, 0.73, 0.10, 0.15, 'low'),
  ('Interior Finishes & Drywall','FINISHES',    ARRAY['47-2081'], ARRAY[9],       1.24, 0.73, 0.10, 0.15, 'low'),
  ('Flooring & Tile',          'FLOORING',      ARRAY['47-2042'], ARRAY[9],       1.24, 0.72, 0.10, 0.15, 'low'),
  ('Specialties & Equipment',  'SPECIALTIES',   ARRAY['47-2211'], ARRAY[10,11],   1.29, 0.73, 0.10, 0.15, 'low'),
  ('Plumbing',                 'PLUMBING',      ARRAY['47-2152'], ARRAY[22],      1.29, 0.74, 0.08, 0.12, 'low'),
  ('Fire Protection',          'FIRE_PROT',     ARRAY['47-2152'], ARRAY[21],      1.29, 0.74, 0.08, 0.12, 'low'),
  ('HVAC & Mechanical',        'HVAC',          ARRAY['47-2152'], ARRAY[23],      1.29, 0.74, 0.08, 0.12, 'low'),
  ('Electrical',               'ELECTRICAL',    ARRAY['47-2111'], ARRAY[26],      1.29, 0.74, 0.06, 0.10, 'low'),
  ('Elevator & Conveying',     'ELEVATOR',      ARRAY['47-4011'], ARRAY[14],      1.38, 0.74, 0.08, 0.12, 'low')
ON CONFLICT DO NOTHING;

-- ========================================
-- 2. units_of_measure — standard units with common aliases
-- ========================================
INSERT INTO units_of_measure (code, name, dimension, conversion_to_si, aliases) VALUES
  ('SF',  'Square Foot',    'area',     0.092903, ARRAY['sq ft', 'sqft', 'S.F.', 'sq. ft.', 'sf']),
  ('LF',  'Linear Foot',    'length',   0.304800, ARRAY['lin ft', 'l.f.', 'lineal ft', 'lf']),
  ('CY',  'Cubic Yard',     'volume',   0.764555, ARRAY['cu yd', 'c.y.', 'cy', 'cubic yd']),
  ('EA',  'Each',           'count',    NULL,      ARRAY['ea', 'each', 'pc', 'pcs']),
  ('LS',  'Lump Sum',       'lump-sum', NULL,      ARRAY['ls', 'lump sum', 'L.S.']),
  ('TON', 'Ton',            'weight',   907.185,   ARRAY['ton', 'tn', 'tons']),
  ('GAL', 'Gallon',         'volume',   0.003785,  ARRAY['gal', 'gallon', 'gallons']),
  ('LB',  'Pound',          'weight',   0.453592,  ARRAY['lb', 'lbs', 'pound', 'pounds']),
  ('SY',  'Square Yard',    'area',     0.836127,  ARRAY['sq yd', 'sy', 'S.Y.']),
  ('CF',  'Cubic Foot',     'volume',   0.028317,  ARRAY['cu ft', 'cf', 'C.F.']),
  ('HR',  'Hour',           'count',    NULL,       ARRAY['hr', 'hrs', 'hour', 'hours']),
  ('DAY', 'Day',            'count',    NULL,       ARRAY['day', 'days']),
  ('MO',  'Month',          'count',    NULL,       ARRAY['mo', 'month', 'months']),
  ('MSF', 'Thousand SF',    'area',     92.903,     ARRAY['msf', 'M.S.F.', '1000 sf']),
  ('MLF', 'Thousand LF',    'length',   304.800,    ARRAY['mlf', 'M.L.F.', '1000 lf']),
  ('SQ',  'Roofing Square', 'area',     9.2903,     ARRAY['sq', 'square', 'roofing square']),
  ('MBF', 'Thousand Board Feet', 'volume', NULL,    ARRAY['mbf', 'M.B.F.', '1000 bf']),
  ('VLF', 'Vertical Linear Foot', 'length', 0.304800, ARRAY['vlf', 'V.L.F.']),
  ('PLF', 'Plf (Pounds per LF)', 'weight', NULL,   ARRAY['plf', 'lbs/lf']),
  ('PSF', 'Pounds per SF',  'weight',   NULL,       ARRAY['psf', 'lbs/sf']),
  ('KSF', 'Kips per SF',    'weight',   NULL,       ARRAY['ksf']),
  ('CSF', 'Hundred SF',     'area',     9.2903,     ARRAY['csf', 'C.S.F.', '100 sf']),
  ('CLF', 'Hundred LF',     'length',   30.480,     ARRAY['clf', 'C.L.F.', '100 lf']),
  ('SET', 'Set',            'count',    NULL,        ARRAY['set', 'sets']),
  ('FLT', 'Flight',         'count',    NULL,        ARRAY['flt', 'flight', 'flights'])
ON CONFLICT DO NOTHING;

-- ========================================
-- 3. building_types — residential, commercial, industrial, institutional
-- ========================================
INSERT INTO building_types (code, name, category, typical_sf_range_low, typical_sf_range_high, typical_story_range_low, typical_story_range_high, construction_type) VALUES
  -- Residential
  ('SFR',             'Single Family Residential',                  'residential',    1000,    5000,   1,  3,  ARRAY['V-A', 'V-B']),
  ('TOWNHOUSE',       'Townhouse / Rowhouse',                       'residential',    1200,    3000,   2,  4,  ARRAY['V-A', 'III-A']),
  ('MULTI_LOW',       'Low-Rise Multifamily (1-4 stories)',         'residential',    5000,   80000,   1,  4,  ARRAY['V-A', 'V-B', 'III-A']),
  ('MULTI_MID',       'Mid-Rise Multifamily (5-12 stories)',        'residential',   50000,  400000,   5, 12,  ARRAY['III-A', 'III-B', 'I-A']),
  ('MULTI_HIGH',      'High-Rise Multifamily (13+ stories)',        'residential',  150000, 1000000,  13, 60,  ARRAY['I-A', 'I-B']),
  ('SENIOR_LIVING',   'Senior Living / Assisted Living',            'residential',   30000,  200000,   1,  5,  ARRAY['V-A', 'III-A', 'II-B']),
  ('STUDENT_HOUSING', 'Student Housing',                            'residential',   40000,  300000,   2,  8,  ARRAY['III-A', 'V-A']),
  -- Commercial
  ('OFFICE_CLASS_A',  'Class A Office',                             'commercial',    50000,  500000,   3, 40,  ARRAY['I-A', 'I-B', 'II-A']),
  ('OFFICE_CLASS_B',  'Class B Office',                             'commercial',    10000,  150000,   1, 10,  ARRAY['II-A', 'II-B', 'III-A']),
  ('RETAIL_INLINE',   'Retail — Inline / Strip',                    'commercial',     1000,   30000,   1,  2,  ARRAY['V-A', 'V-B', 'II-B']),
  ('RETAIL_BIG_BOX',  'Retail — Big Box',                           'commercial',    50000,  200000,   1,  1,  ARRAY['II-B', 'III-B']),
  ('RETAIL_MIXED',    'Mixed-Use Retail + Residential',             'commercial',    20000,  400000,   2, 12,  ARRAY['I-A', 'III-A', 'V-A']),
  ('HOTEL_SELECT',    'Hotel — Select Service',                     'commercial',    40000,  150000,   3,  8,  ARRAY['III-A', 'V-A']),
  ('HOTEL_FULL',      'Hotel — Full Service / Luxury',              'commercial',    80000,  500000,   5, 30,  ARRAY['I-A', 'I-B']),
  ('RESTAURANT',      'Restaurant / Food Service',                  'commercial',     1000,   10000,   1,  2,  ARRAY['V-A', 'V-B']),
  ('PARKING_STRUCT',  'Parking Structure',                          'commercial',    50000,  500000,   2,  8,  ARRAY['I-A', 'II-A', 'IV-A']),
  -- Industrial
  ('WAREHOUSE',       'Warehouse / Distribution',                   'industrial',    20000, 1000000,   1,  2,  ARRAY['II-B', 'III-B']),
  ('MANUFACTURING',   'Manufacturing / Light Industrial',           'industrial',    10000,  500000,   1,  2,  ARRAY['II-B', 'III-B']),
  ('COLD_STORAGE',    'Cold Storage / Refrigerated',                'industrial',    10000,  300000,   1,  2,  ARRAY['II-B']),
  ('DATA_CENTER',     'Data Center',                                'industrial',    10000,  200000,   1,  3,  ARRAY['I-A', 'I-B']),
  ('SELF_STORAGE',    'Self Storage',                               'industrial',    20000,  150000,   1,  4,  ARRAY['II-B', 'III-B']),
  -- Institutional
  ('K12_SCHOOL',      'K-12 School',                                'institutional', 20000,  300000,   1,  4,  ARRAY['II-A', 'II-B', 'III-A']),
  ('HIGHER_ED',       'Higher Education',                           'institutional', 30000,  500000,   1, 10,  ARRAY['I-A', 'II-A', 'III-A']),
  ('HOSPITAL',        'Hospital / Acute Care',                      'institutional', 50000, 1000000,   1, 15,  ARRAY['I-A', 'I-B']),
  ('MEDICAL_OFFICE',  'Medical Office Building',                    'institutional', 10000,  100000,   1,  5,  ARRAY['II-A', 'III-A', 'V-A']),
  ('GOVT_MUNICIPAL',  'Government / Municipal',                     'institutional', 10000,  200000,   1,  6,  ARRAY['I-A', 'II-A']),
  ('RELIGIOUS',       'Religious / House of Worship',               'institutional',  5000,  100000,   1,  2,  ARRAY['II-A', 'III-A', 'V-A']),
  ('RECREATION',      'Recreation / Community Center',              'institutional', 10000,  100000,   1,  3,  ARRAY['II-A', 'III-A']),
  ('LIBRARY',         'Library',                                    'institutional',  5000,   80000,   1,  3,  ARRAY['II-A', 'III-A']),
  ('PERFORMING_ARTS', 'Performing Arts / Theater',                  'institutional', 10000,  150000,   1,  4,  ARRAY['I-A', 'II-A']),
  -- Mixed Use
  ('MIXED_PODIUM',    'Mixed-Use Podium (Retail + Residential)',    'mixed_use',     30000,  500000,   3, 15,  ARRAY['I-A', 'III-A']),
  ('MIXED_VERTICAL',  'Mixed-Use Vertical (Office + Residential)',  'mixed_use',     50000,  800000,   5, 40,  ARRAY['I-A', 'I-B']),
  ('LIVE_WORK',       'Live/Work',                                  'mixed_use',      2000,   50000,   1,  4,  ARRAY['V-A', 'III-A']),
  ('TOD',             'Transit-Oriented Development',               'mixed_use',     50000,  600000,   3, 20,  ARRAY['I-A', 'III-A']),
  ('CAMPUS_MIXED',    'Campus Mixed-Use',                           'mixed_use',    100000, 2000000,   1, 15,  ARRAY['I-A', 'II-A', 'III-A'])
ON CONFLICT DO NOTHING;

-- ========================================
-- 4. project_types — 6 types
-- ========================================
INSERT INTO project_types (code, name, description, affects_sf_benchmark) VALUES
  ('NC',              'New Construction',     'Ground-up new building construction.',                           false),
  ('RENO',            'Renovation',           'Significant renovation of existing structure.',                  true),
  ('TI',              'Tenant Improvement',   'Interior build-out within existing shell.',                      true),
  ('ADAPTIVE_REUSE',  'Adaptive Reuse',       'Converting existing building to new use (e.g. warehouse to loft).', true),
  ('ADDITION',        'Addition',             'Building addition to existing structure.',                       true),
  ('SITEWORK',        'Sitework Only',        'Site-only scope: grading, paving, utilities, landscaping.',      true)
ON CONFLICT DO NOTHING;

-- ========================================
-- 5. delivery_methods — 7 methods
-- ========================================
INSERT INTO delivery_methods (code, name, has_gmp, pdc_structure_typical) VALUES
  ('DBB',  'Design-Bid-Build',                  false, 'Owner contracts separately with designer and builder. Sequential phases.'),
  ('DB',   'Design-Build',                      false, 'Single entity responsible for both design and construction.'),
  ('CMaR', 'CM at Risk',                        true,  'CM provides preconstruction services and GMP. Holds trade contracts.'),
  ('GMP',  'Guaranteed Maximum Price',          true,  'Fixed ceiling price with shared savings. Usually paired with CMaR.'),
  ('CMAR', 'Construction Manager as Advisor',   false, 'CM advises owner but does not hold trade contracts. Owner contracts directly.'),
  ('IPBD', 'Integrated Project Delivery',       false, 'Multi-party agreement. Shared risk/reward among owner, designer, builder.'),
  ('TM',   'Time & Materials',                  false, 'Cost-plus with no guaranteed maximum. Used for undefined scope or emergencies.')
ON CONFLICT DO NOTHING;

-- ========================================
-- 6. cost_categories — 6 categories
-- ========================================
INSERT INTO cost_categories (code, name, included_in_construction_cost, description) VALUES
  ('HARD',        'Hard Costs',          true,  'Direct construction costs: labor, materials, equipment, subcontractor work.'),
  ('SOFT',        'Soft Costs',          false, 'Indirect costs: design fees, permits, insurance, legal, financing costs.'),
  ('FF_AND_E',    'FF&E',                false, 'Furniture, fixtures, and equipment. Not part of construction contract.'),
  ('CONTINGENCY', 'Contingency',         false, 'Reserve for unforeseen conditions. Typically 3-10% of hard costs.'),
  ('ESCALATION',  'Escalation',          false, 'Cost adjustment for inflation between estimate date and construction midpoint.'),
  ('FINANCING',   'Financing Costs',     false, 'Interest carry, loan fees, construction loan costs.')
ON CONFLICT DO NOTHING;

-- ========================================
-- 7. csi_codes — Top-level CSI divisions 1-49 (level 1)
--    plus key sections for the 19 trades
-- ========================================
INSERT INTO csi_codes (division, section, title, level, parent_id, canonical_unit, description) VALUES
  -- Level 1: Divisions
  (0,  '00 00 00', 'Procurement & Contracting Requirements', 1, NULL, NULL, 'Bidding, contracting, bonds, insurance'),
  (1,  '01 00 00', 'General Requirements',                   1, NULL, NULL, 'General conditions, temporary facilities, cleanup'),
  (2,  '02 00 00', 'Existing Conditions',                    1, NULL, NULL, 'Demolition, hazmat abatement, site assessment'),
  (3,  '03 00 00', 'Concrete',                               1, NULL, 'CY', 'Cast-in-place, precast, reinforcing, formwork'),
  (4,  '04 00 00', 'Masonry',                                1, NULL, 'SF', 'Unit masonry, stone, stucco'),
  (5,  '05 00 00', 'Metals',                                 1, NULL, 'TON', 'Structural steel, misc metals, ornamental'),
  (6,  '06 00 00', 'Wood, Plastics, Composites',             1, NULL, 'SF', 'Rough carpentry, finish carpentry, millwork'),
  (7,  '07 00 00', 'Thermal & Moisture Protection',          1, NULL, 'SF', 'Waterproofing, roofing, insulation, sealants'),
  (8,  '08 00 00', 'Openings',                               1, NULL, 'EA', 'Doors, frames, windows, hardware, glazing'),
  (9,  '09 00 00', 'Finishes',                               1, NULL, 'SF', 'Drywall, plaster, tile, flooring, painting'),
  (10, '10 00 00', 'Specialties',                            1, NULL, 'EA', 'Signage, lockers, toilet accessories, fire extinguishers'),
  (11, '11 00 00', 'Equipment',                              1, NULL, 'EA', 'Commercial kitchen, laundry, athletic, lab equipment'),
  (12, '12 00 00', 'Furnishings',                            1, NULL, 'EA', 'Casework, window treatments, furniture'),
  (13, '13 00 00', 'Special Construction',                   1, NULL, NULL, 'Pools, clean rooms, pre-engineered buildings'),
  (14, '14 00 00', 'Conveying Equipment',                    1, NULL, 'EA', 'Elevators, escalators, dumbwaiters'),
  (21, '21 00 00', 'Fire Suppression',                       1, NULL, 'SF', 'Sprinkler systems, standpipes, fire pumps'),
  (22, '22 00 00', 'Plumbing',                               1, NULL, 'EA', 'Fixtures, piping, water heaters, drainage'),
  (23, '23 00 00', 'HVAC',                                   1, NULL, 'TON', 'Ductwork, equipment, controls, testing'),
  (25, '25 00 00', 'Integrated Automation',                  1, NULL, NULL, 'BAS, integrated building systems'),
  (26, '26 00 00', 'Electrical',                             1, NULL, 'SF', 'Power distribution, lighting, low voltage'),
  (27, '27 00 00', 'Communications',                         1, NULL, NULL, 'Data, voice, audio-visual, security'),
  (28, '28 00 00', 'Electronic Safety & Security',           1, NULL, NULL, 'Fire alarm, access control, surveillance'),
  (31, '31 00 00', 'Earthwork',                              1, NULL, 'CY', 'Grading, excavation, fill, compaction'),
  (32, '32 00 00', 'Exterior Improvements',                  1, NULL, 'SF', 'Paving, curbs, landscaping, irrigation'),
  (33, '33 00 00', 'Utilities',                              1, NULL, 'LF', 'Water, sewer, storm, gas, electric utilities'),
  (34, '34 00 00', 'Transportation',                         1, NULL, NULL, 'Rail, roadways, bridges'),
  (35, '35 00 00', 'Waterway & Marine',                      1, NULL, NULL, 'Docks, seawalls, dredging'),
  (40, '40 00 00', 'Process Integration',                    1, NULL, NULL, 'Process piping, instrumentation'),
  (41, '41 00 00', 'Material Processing & Handling',         1, NULL, NULL, 'Cranes, conveyors, hoists'),
  (42, '42 00 00', 'Process Heating & Cooling',              1, NULL, NULL, 'Boilers, heat exchangers, chillers'),
  (43, '43 00 00', 'Process Gas & Liquid Handling',          1, NULL, NULL, 'Pumps, compressors, tanks'),
  (44, '44 00 00', 'Pollution & Waste Control',              1, NULL, NULL, 'Air scrubbers, wastewater treatment'),
  (46, '46 00 00', 'Water & Wastewater',                     1, NULL, NULL, 'Treatment plants, distribution'),
  (48, '48 00 00', 'Electrical Power Generation',            1, NULL, NULL, 'Generators, solar, wind, fuel cells')
ON CONFLICT DO NOTHING;

-- ========================================
-- 8. seasonal_adjustments
--    For all trades with seasonal_sensitivity != 'none'
--    across 4 climate zones and 12 months.
--    Trades: SITEWORK(high), CONC(high), MASON(high),
--            STRUCT_STEEL(medium), ROUGH_CARP(medium), WATERPROOF(medium)
-- ========================================

-- Helper: insert seasonal adjustments for a trade by code
-- Northern zone has strongest winter premium, coastal the mildest
DO $$
DECLARE
  t RECORD;
  base_m integer := 6; -- June = base month
  zone text;
  m integer;
  factor numeric(5,4);
  sensitivity text;
BEGIN
  FOR t IN SELECT id, code, seasonal_sensitivity FROM trades WHERE seasonal_sensitivity != 'none'
  LOOP
    sensitivity := t.seasonal_sensitivity;
    FOR zone IN SELECT unnest(ARRAY['northern', 'southern', 'mountain', 'coastal'])
    LOOP
      FOR m IN 1..12
      LOOP
        -- Calculate adjustment factor based on sensitivity, zone, and month
        -- Base month (June) = 1.0000, winter months get premiums
        factor := 1.0000;

        IF sensitivity = 'high' THEN
          -- High sensitivity: concrete, masonry, sitework
          IF zone = 'northern' THEN
            factor := CASE m
              WHEN 1 THEN 1.1500 WHEN 2 THEN 1.1200 WHEN 3 THEN 1.0800
              WHEN 4 THEN 1.0400 WHEN 5 THEN 1.0100 WHEN 6 THEN 1.0000
              WHEN 7 THEN 1.0000 WHEN 8 THEN 1.0000 WHEN 9 THEN 1.0100
              WHEN 10 THEN 1.0400 WHEN 11 THEN 1.0800 WHEN 12 THEN 1.1200
            END;
          ELSIF zone = 'southern' THEN
            factor := CASE m
              WHEN 1 THEN 1.0300 WHEN 2 THEN 1.0200 WHEN 3 THEN 1.0100
              WHEN 4 THEN 1.0000 WHEN 5 THEN 1.0000 WHEN 6 THEN 1.0200
              WHEN 7 THEN 1.0300 WHEN 8 THEN 1.0300 WHEN 9 THEN 1.0100
              WHEN 10 THEN 1.0000 WHEN 11 THEN 1.0000 WHEN 12 THEN 1.0200
            END;
          ELSIF zone = 'mountain' THEN
            factor := CASE m
              WHEN 1 THEN 1.1200 WHEN 2 THEN 1.1000 WHEN 3 THEN 1.0700
              WHEN 4 THEN 1.0400 WHEN 5 THEN 1.0100 WHEN 6 THEN 1.0000
              WHEN 7 THEN 1.0000 WHEN 8 THEN 1.0000 WHEN 9 THEN 1.0200
              WHEN 10 THEN 1.0500 WHEN 11 THEN 1.0800 WHEN 12 THEN 1.1000
            END;
          ELSIF zone = 'coastal' THEN
            factor := CASE m
              WHEN 1 THEN 1.0400 WHEN 2 THEN 1.0300 WHEN 3 THEN 1.0200
              WHEN 4 THEN 1.0100 WHEN 5 THEN 1.0000 WHEN 6 THEN 1.0000
              WHEN 7 THEN 1.0000 WHEN 8 THEN 1.0000 WHEN 9 THEN 1.0000
              WHEN 10 THEN 1.0100 WHEN 11 THEN 1.0200 WHEN 12 THEN 1.0300
            END;
          END IF;

        ELSIF sensitivity = 'medium' THEN
          -- Medium sensitivity: structural steel, rough carpentry, waterproofing
          IF zone = 'northern' THEN
            factor := CASE m
              WHEN 1 THEN 1.0800 WHEN 2 THEN 1.0600 WHEN 3 THEN 1.0400
              WHEN 4 THEN 1.0200 WHEN 5 THEN 1.0000 WHEN 6 THEN 1.0000
              WHEN 7 THEN 1.0000 WHEN 8 THEN 1.0000 WHEN 9 THEN 1.0100
              WHEN 10 THEN 1.0200 WHEN 11 THEN 1.0500 WHEN 12 THEN 1.0700
            END;
          ELSIF zone = 'southern' THEN
            factor := CASE m
              WHEN 1 THEN 1.0200 WHEN 2 THEN 1.0100 WHEN 3 THEN 1.0000
              WHEN 4 THEN 1.0000 WHEN 5 THEN 1.0000 WHEN 6 THEN 1.0100
              WHEN 7 THEN 1.0200 WHEN 8 THEN 1.0200 WHEN 9 THEN 1.0100
              WHEN 10 THEN 1.0000 WHEN 11 THEN 1.0000 WHEN 12 THEN 1.0100
            END;
          ELSIF zone = 'mountain' THEN
            factor := CASE m
              WHEN 1 THEN 1.0700 WHEN 2 THEN 1.0500 WHEN 3 THEN 1.0300
              WHEN 4 THEN 1.0200 WHEN 5 THEN 1.0000 WHEN 6 THEN 1.0000
              WHEN 7 THEN 1.0000 WHEN 8 THEN 1.0000 WHEN 9 THEN 1.0100
              WHEN 10 THEN 1.0300 WHEN 11 THEN 1.0500 WHEN 12 THEN 1.0600
            END;
          ELSIF zone = 'coastal' THEN
            factor := CASE m
              WHEN 1 THEN 1.0300 WHEN 2 THEN 1.0200 WHEN 3 THEN 1.0100
              WHEN 4 THEN 1.0000 WHEN 5 THEN 1.0000 WHEN 6 THEN 1.0000
              WHEN 7 THEN 1.0000 WHEN 8 THEN 1.0000 WHEN 9 THEN 1.0000
              WHEN 10 THEN 1.0100 WHEN 11 THEN 1.0200 WHEN 12 THEN 1.0200
            END;
          END IF;

        ELSIF sensitivity = 'low' THEN
          -- Low sensitivity: most interior/MEP trades
          IF zone = 'northern' THEN
            factor := CASE m
              WHEN 1 THEN 1.0300 WHEN 2 THEN 1.0200 WHEN 3 THEN 1.0100
              WHEN 4 THEN 1.0000 WHEN 5 THEN 1.0000 WHEN 6 THEN 1.0000
              WHEN 7 THEN 1.0000 WHEN 8 THEN 1.0000 WHEN 9 THEN 1.0000
              WHEN 10 THEN 1.0100 WHEN 11 THEN 1.0200 WHEN 12 THEN 1.0300
            END;
          ELSIF zone = 'southern' THEN
            factor := CASE m
              WHEN 1 THEN 1.0100 WHEN 2 THEN 1.0000 WHEN 3 THEN 1.0000
              WHEN 4 THEN 1.0000 WHEN 5 THEN 1.0000 WHEN 6 THEN 1.0000
              WHEN 7 THEN 1.0100 WHEN 8 THEN 1.0100 WHEN 9 THEN 1.0000
              WHEN 10 THEN 1.0000 WHEN 11 THEN 1.0000 WHEN 12 THEN 1.0100
            END;
          ELSIF zone = 'mountain' THEN
            factor := CASE m
              WHEN 1 THEN 1.0200 WHEN 2 THEN 1.0200 WHEN 3 THEN 1.0100
              WHEN 4 THEN 1.0000 WHEN 5 THEN 1.0000 WHEN 6 THEN 1.0000
              WHEN 7 THEN 1.0000 WHEN 8 THEN 1.0000 WHEN 9 THEN 1.0000
              WHEN 10 THEN 1.0100 WHEN 11 THEN 1.0200 WHEN 12 THEN 1.0200
            END;
          ELSIF zone = 'coastal' THEN
            factor := CASE m
              WHEN 1 THEN 1.0100 WHEN 2 THEN 1.0100 WHEN 3 THEN 1.0000
              WHEN 4 THEN 1.0000 WHEN 5 THEN 1.0000 WHEN 6 THEN 1.0000
              WHEN 7 THEN 1.0000 WHEN 8 THEN 1.0000 WHEN 9 THEN 1.0000
              WHEN 10 THEN 1.0000 WHEN 11 THEN 1.0100 WHEN 12 THEN 1.0100
            END;
          END IF;
        END IF;

        INSERT INTO seasonal_adjustments (trade_id, climate_zone, month, adjustment_factor, base_month, notes)
        VALUES (t.id, zone, m, factor, base_m, NULL)
        ON CONFLICT (trade_id, climate_zone, month) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
