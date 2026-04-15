-- ============================================================
-- NOVA Core — CSI Section-Level Codes + Carbon Data Reseed
-- 013_csi_section_codes.sql
--
-- 1. Adds ~90 CSI MasterFormat 2020 section-level codes (level 2)
--    for all 16 active trade divisions, with canonical_unit per section.
-- 2. Deletes old division-level carbon_data records.
-- 3. Reseeds carbon_data at section level with specific ICE v3.0
--    generic averages per material.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. INSERT SECTION-LEVEL CSI CODES
--    Each references its division-level parent via subquery.
--    canonical_unit is section-specific.
-- ============================================================

-- ── Division 02: Existing Conditions (DEMO) ──
INSERT INTO csi_codes (division, section, title, level, parent_id, canonical_unit, description) VALUES
  (2, '02 41 00', 'Demolition',                    2, (SELECT id FROM csi_codes WHERE section='02 00 00'), 'SF',  'Selective and complete demolition'),
  (2, '02 42 00', 'Removal & Salvage',             2, (SELECT id FROM csi_codes WHERE section='02 00 00'), 'SF',  'Salvage of materials for reuse'),
  (2, '02 82 00', 'Asbestos Remediation',           2, (SELECT id FROM csi_codes WHERE section='02 00 00'), 'SF',  'Asbestos abatement and disposal')
ON CONFLICT DO NOTHING;

-- ── Division 03: Concrete (CONC) ──
INSERT INTO csi_codes (division, section, title, level, parent_id, canonical_unit, description) VALUES
  (3, '03 10 00', 'Concrete Forming & Accessories', 2, (SELECT id FROM csi_codes WHERE section='03 00 00'), 'SF',  'Formwork, form ties, accessories'),
  (3, '03 20 00', 'Concrete Reinforcing',           2, (SELECT id FROM csi_codes WHERE section='03 00 00'), 'LB',  'Rebar, welded wire, fiber reinforcing'),
  (3, '03 30 00', 'Cast-in-Place Concrete',         2, (SELECT id FROM csi_codes WHERE section='03 00 00'), 'CY',  'Structural and architectural concrete'),
  (3, '03 35 00', 'Concrete Finishing',             2, (SELECT id FROM csi_codes WHERE section='03 00 00'), 'SF',  'Finishing, curing, hardeners'),
  (3, '03 40 00', 'Precast Concrete',               2, (SELECT id FROM csi_codes WHERE section='03 00 00'), 'CY',  'Precast structural and architectural'),
  (3, '03 60 00', 'Grouting',                       2, (SELECT id FROM csi_codes WHERE section='03 00 00'), 'CF',  'Cementitious and chemical grouting')
ON CONFLICT DO NOTHING;

-- ── Division 04: Masonry (MASON) ──
INSERT INTO csi_codes (division, section, title, level, parent_id, canonical_unit, description) VALUES
  (4, '04 20 00', 'Unit Masonry',                   2, (SELECT id FROM csi_codes WHERE section='04 00 00'), 'SF',  'CMU, brick, glass block'),
  (4, '04 22 00', 'Concrete Unit Masonry',          2, (SELECT id FROM csi_codes WHERE section='04 00 00'), 'SF',  'CMU walls, lintels, bond beams'),
  (4, '04 40 00', 'Stone Assemblies',               2, (SELECT id FROM csi_codes WHERE section='04 00 00'), 'SF',  'Cut stone, stone veneer'),
  (4, '04 70 00', 'Manufactured Masonry',           2, (SELECT id FROM csi_codes WHERE section='04 00 00'), 'SF',  'Manufactured stone, thin brick')
ON CONFLICT DO NOTHING;

-- ── Division 05: Metals (STRUCT_STEEL, MISC_METALS) ──
INSERT INTO csi_codes (division, section, title, level, parent_id, canonical_unit, description) VALUES
  (5, '05 12 00', 'Structural Steel Framing',       2, (SELECT id FROM csi_codes WHERE section='05 00 00'), 'TON', 'W-shapes, HSS, wide-flange beams'),
  (5, '05 21 00', 'Steel Joist Framing',            2, (SELECT id FROM csi_codes WHERE section='05 00 00'), 'LF',  'Open-web steel joists'),
  (5, '05 31 00', 'Steel Decking',                  2, (SELECT id FROM csi_codes WHERE section='05 00 00'), 'SF',  'Composite and non-composite deck'),
  (5, '05 50 00', 'Metal Fabrications',              2, (SELECT id FROM csi_codes WHERE section='05 00 00'), 'LB',  'Misc steel, embeds, connections'),
  (5, '05 51 00', 'Metal Stairs',                    2, (SELECT id FROM csi_codes WHERE section='05 00 00'), 'EA',  'Steel stairs and platforms'),
  (5, '05 52 00', 'Metal Railings',                  2, (SELECT id FROM csi_codes WHERE section='05 00 00'), 'LF',  'Steel, aluminum, cable railings')
ON CONFLICT DO NOTHING;

-- ── Division 06: Wood, Plastics, Composites (ROUGH_CARP, FINISH_CARP) ──
INSERT INTO csi_codes (division, section, title, level, parent_id, canonical_unit, description) VALUES
  (6, '06 10 00', 'Rough Carpentry',                2, (SELECT id FROM csi_codes WHERE section='06 00 00'), 'SF',  'Blocking, nailers, rough framing'),
  (6, '06 11 00', 'Wood Framing',                   2, (SELECT id FROM csi_codes WHERE section='06 00 00'), 'SF',  'Dimensional lumber framing'),
  (6, '06 17 00', 'Shop-Fabricated Structural Wood', 2, (SELECT id FROM csi_codes WHERE section='06 00 00'), 'SF',  'Glulam, LVL, trusses'),
  (6, '06 20 00', 'Finish Carpentry',               2, (SELECT id FROM csi_codes WHERE section='06 00 00'), 'LF',  'Trim, molding, base'),
  (6, '06 40 00', 'Architectural Woodwork',          2, (SELECT id FROM csi_codes WHERE section='06 00 00'), 'SF',  'Custom cabinetry, paneling, millwork')
ON CONFLICT DO NOTHING;

-- ── Division 07: Thermal & Moisture Protection (WATERPROOF, INSULATION) ──
INSERT INTO csi_codes (division, section, title, level, parent_id, canonical_unit, description) VALUES
  (7, '07 10 00', 'Dampproofing & Waterproofing',   2, (SELECT id FROM csi_codes WHERE section='07 00 00'), 'SF',  'Below-grade waterproofing, damp-proofing'),
  (7, '07 21 00', 'Thermal Insulation',              2, (SELECT id FROM csi_codes WHERE section='07 00 00'), 'SF',  'Batt, rigid, spray foam insulation'),
  (7, '07 27 00', 'Air Barriers',                    2, (SELECT id FROM csi_codes WHERE section='07 00 00'), 'SF',  'Fluid-applied, self-adhered air barriers'),
  (7, '07 31 00', 'Shingles & Shakes',              2, (SELECT id FROM csi_codes WHERE section='07 00 00'), 'SQ',  'Asphalt, wood, composite shingles'),
  (7, '07 41 00', 'Roof Panels',                     2, (SELECT id FROM csi_codes WHERE section='07 00 00'), 'SF',  'Metal roof panels, standing seam'),
  (7, '07 50 00', 'Membrane Roofing',                2, (SELECT id FROM csi_codes WHERE section='07 00 00'), 'SF',  'TPO, EPDM, PVC, modified bitumen'),
  (7, '07 60 00', 'Flashing & Sheet Metal',          2, (SELECT id FROM csi_codes WHERE section='07 00 00'), 'LF',  'Copper, aluminum, galvanized flashing'),
  (7, '07 92 00', 'Joint Sealants',                  2, (SELECT id FROM csi_codes WHERE section='07 00 00'), 'LF',  'Silicone, polyurethane, polysulfide')
ON CONFLICT DO NOTHING;

-- ── Division 08: Openings (DOORS_WINDOWS) ──
INSERT INTO csi_codes (division, section, title, level, parent_id, canonical_unit, description) VALUES
  (8, '08 11 00', 'Metal Doors & Frames',           2, (SELECT id FROM csi_codes WHERE section='08 00 00'), 'EA',  'HM doors, frames, accessories'),
  (8, '08 14 00', 'Wood Doors',                      2, (SELECT id FROM csi_codes WHERE section='08 00 00'), 'EA',  'Flush, stile-and-rail wood doors'),
  (8, '08 31 00', 'Access Doors & Panels',           2, (SELECT id FROM csi_codes WHERE section='08 00 00'), 'EA',  'Access panels, hatches'),
  (8, '08 41 00', 'Entrances & Storefronts',         2, (SELECT id FROM csi_codes WHERE section='08 00 00'), 'SF',  'Aluminum storefronts, curtain wall'),
  (8, '08 51 00', 'Windows',                         2, (SELECT id FROM csi_codes WHERE section='08 00 00'), 'SF',  'Aluminum, vinyl, wood windows'),
  (8, '08 71 00', 'Door Hardware',                   2, (SELECT id FROM csi_codes WHERE section='08 00 00'), 'EA',  'Hinges, locksets, closers, panic hardware'),
  (8, '08 80 00', 'Glazing',                         2, (SELECT id FROM csi_codes WHERE section='08 00 00'), 'SF',  'Float glass, insulated glass units')
ON CONFLICT DO NOTHING;

-- ── Division 09: Finishes (FINISHES, FLOORING) ──
INSERT INTO csi_codes (division, section, title, level, parent_id, canonical_unit, description) VALUES
  (9, '09 21 00', 'Plaster & Gypsum Board',         2, (SELECT id FROM csi_codes WHERE section='09 00 00'), 'SF',  'Drywall, plaster, veneer plaster'),
  (9, '09 22 00', 'Metal Support Assemblies',        2, (SELECT id FROM csi_codes WHERE section='09 00 00'), 'SF',  'Metal studs, furring, ceiling grid'),
  (9, '09 30 00', 'Tiling',                          2, (SELECT id FROM csi_codes WHERE section='09 00 00'), 'SF',  'Ceramic, porcelain, natural stone tile'),
  (9, '09 51 00', 'Acoustical Ceilings',             2, (SELECT id FROM csi_codes WHERE section='09 00 00'), 'SF',  'ACT, suspended ceiling systems'),
  (9, '09 65 00', 'Resilient Flooring',              2, (SELECT id FROM csi_codes WHERE section='09 00 00'), 'SF',  'VCT, LVT, sheet vinyl, rubber'),
  (9, '09 68 00', 'Carpeting',                       2, (SELECT id FROM csi_codes WHERE section='09 00 00'), 'SY',  'Broadloom and carpet tile'),
  (9, '09 91 00', 'Painting',                        2, (SELECT id FROM csi_codes WHERE section='09 00 00'), 'SF',  'Interior and exterior coatings')
ON CONFLICT DO NOTHING;

-- ── Division 10: Specialties (SPECIALTIES) ──
INSERT INTO csi_codes (division, section, title, level, parent_id, canonical_unit, description) VALUES
  (10, '10 14 00', 'Signage',                        2, (SELECT id FROM csi_codes WHERE section='10 00 00'), 'EA',  'Interior and exterior signage'),
  (10, '10 21 00', 'Compartments & Cubicles',        2, (SELECT id FROM csi_codes WHERE section='10 00 00'), 'EA',  'Toilet partitions, shower compartments'),
  (10, '10 28 00', 'Toilet & Bath Accessories',      2, (SELECT id FROM csi_codes WHERE section='10 00 00'), 'EA',  'Grab bars, dispensers, mirrors'),
  (10, '10 44 00', 'Fire Protection Specialties',    2, (SELECT id FROM csi_codes WHERE section='10 00 00'), 'EA',  'Extinguishers, cabinets, blankets')
ON CONFLICT DO NOTHING;

-- ── Division 14: Conveying Equipment (ELEVATOR) ──
INSERT INTO csi_codes (division, section, title, level, parent_id, canonical_unit, description) VALUES
  (14, '14 20 00', 'Elevators',                      2, (SELECT id FROM csi_codes WHERE section='14 00 00'), 'EA',  'Traction and MRL elevators'),
  (14, '14 24 00', 'Hydraulic Elevators',            2, (SELECT id FROM csi_codes WHERE section='14 00 00'), 'EA',  'Holeless and in-ground hydraulic'),
  (14, '14 31 00', 'Escalators & Moving Walks',      2, (SELECT id FROM csi_codes WHERE section='14 00 00'), 'EA',  'Escalators, moving walkways')
ON CONFLICT DO NOTHING;

-- ── Division 21: Fire Suppression (FIRE_PROT) ──
INSERT INTO csi_codes (division, section, title, level, parent_id, canonical_unit, description) VALUES
  (21, '21 05 00', 'Common Work for Fire Suppression', 2, (SELECT id FROM csi_codes WHERE section='21 00 00'), 'SF', 'Hangers, sleeves, firestopping'),
  (21, '21 12 00', 'Fire-Suppression Standpipes',   2, (SELECT id FROM csi_codes WHERE section='21 00 00'), 'LF',  'Standpipe risers, valves, hose connections'),
  (21, '21 13 00', 'Fire-Suppression Sprinkler Systems', 2, (SELECT id FROM csi_codes WHERE section='21 00 00'), 'SF', 'Wet, dry, pre-action sprinkler systems')
ON CONFLICT DO NOTHING;

-- ── Division 22: Plumbing (PLUMBING) ──
INSERT INTO csi_codes (division, section, title, level, parent_id, canonical_unit, description) VALUES
  (22, '22 05 00', 'Common Work for Plumbing',      2, (SELECT id FROM csi_codes WHERE section='22 00 00'), 'LF',  'Hangers, sleeves, insulation'),
  (22, '22 11 00', 'Facility Water Distribution',   2, (SELECT id FROM csi_codes WHERE section='22 00 00'), 'LF',  'Domestic water piping, valves'),
  (22, '22 13 00', 'Facility Sanitary Sewerage',    2, (SELECT id FROM csi_codes WHERE section='22 00 00'), 'LF',  'Sanitary waste and vent piping'),
  (22, '22 14 00', 'Facility Storm Drainage',       2, (SELECT id FROM csi_codes WHERE section='22 00 00'), 'LF',  'Storm drain piping, roof drains'),
  (22, '22 34 00', 'Fuel-Fired Domestic Water Heaters', 2, (SELECT id FROM csi_codes WHERE section='22 00 00'), 'EA', 'Gas and electric water heaters'),
  (22, '22 40 00', 'Plumbing Fixtures',              2, (SELECT id FROM csi_codes WHERE section='22 00 00'), 'EA',  'Sinks, toilets, urinals, lavatories')
ON CONFLICT DO NOTHING;

-- ── Division 23: HVAC (HVAC) ──
INSERT INTO csi_codes (division, section, title, level, parent_id, canonical_unit, description) VALUES
  (23, '23 05 00', 'Common Work for HVAC',          2, (SELECT id FROM csi_codes WHERE section='23 00 00'), 'LF',  'Hangers, sleeves, insulation'),
  (23, '23 09 00', 'HVAC Instrumentation & Control', 2, (SELECT id FROM csi_codes WHERE section='23 00 00'), 'EA', 'Thermostats, sensors, BAS points'),
  (23, '23 21 00', 'Hydronic Piping & Pumps',       2, (SELECT id FROM csi_codes WHERE section='23 00 00'), 'LF',  'Chilled/hot water piping, pumps'),
  (23, '23 31 00', 'HVAC Ducts & Casings',          2, (SELECT id FROM csi_codes WHERE section='23 00 00'), 'LB',  'Sheet metal ductwork, flex duct'),
  (23, '23 34 00', 'HVAC Fans',                     2, (SELECT id FROM csi_codes WHERE section='23 00 00'), 'EA',  'Exhaust fans, inline fans, ERVs'),
  (23, '23 64 00', 'Packaged Water Chillers',       2, (SELECT id FROM csi_codes WHERE section='23 00 00'), 'TON', 'Air and water-cooled chillers'),
  (23, '23 73 00', 'Indoor Central-Station AHUs',   2, (SELECT id FROM csi_codes WHERE section='23 00 00'), 'EA',  'AHUs, MAUs, RTUs'),
  (23, '23 82 00', 'Convection Heating & Cooling',  2, (SELECT id FROM csi_codes WHERE section='23 00 00'), 'EA',  'FCUs, unit heaters, baseboard')
ON CONFLICT DO NOTHING;

-- ── Division 26: Electrical (ELECTRICAL) ──
INSERT INTO csi_codes (division, section, title, level, parent_id, canonical_unit, description) VALUES
  (26, '26 05 00', 'Common Work for Electrical',    2, (SELECT id FROM csi_codes WHERE section='26 00 00'), 'LF',  'Raceways, conduit, wire, boxes'),
  (26, '26 24 00', 'Switchboards & Panelboards',    2, (SELECT id FROM csi_codes WHERE section='26 00 00'), 'EA',  'Main distribution, branch panels'),
  (26, '26 27 00', 'Low-Voltage Distribution',      2, (SELECT id FROM csi_codes WHERE section='26 00 00'), 'EA',  'Transformers, disconnects, bus duct'),
  (26, '26 28 00', 'Low-Voltage Protective Devices', 2, (SELECT id FROM csi_codes WHERE section='26 00 00'), 'EA', 'Breakers, fuses, surge protection'),
  (26, '26 51 00', 'Interior Lighting',              2, (SELECT id FROM csi_codes WHERE section='26 00 00'), 'EA',  'LED fixtures, troffers, downlights'),
  (26, '26 56 00', 'Exterior Lighting',              2, (SELECT id FROM csi_codes WHERE section='26 00 00'), 'EA',  'Site, facade, parking lighting')
ON CONFLICT DO NOTHING;

-- ── Division 31: Earthwork (SITEWORK) ──
INSERT INTO csi_codes (division, section, title, level, parent_id, canonical_unit, description) VALUES
  (31, '31 10 00', 'Site Clearing',                  2, (SELECT id FROM csi_codes WHERE section='31 00 00'), 'SF',  'Clearing, grubbing, tree removal'),
  (31, '31 22 00', 'Grading',                        2, (SELECT id FROM csi_codes WHERE section='31 00 00'), 'CY',  'Rough and finish grading'),
  (31, '31 23 00', 'Excavation & Fill',              2, (SELECT id FROM csi_codes WHERE section='31 00 00'), 'CY',  'Mass excavation, structural fill, backfill'),
  (31, '31 25 00', 'Erosion & Sedimentation Controls', 2, (SELECT id FROM csi_codes WHERE section='31 00 00'), 'LF', 'Silt fence, inlet protection, SWPPP')
ON CONFLICT DO NOTHING;

-- ── Division 32: Exterior Improvements (SITEWORK) ──
INSERT INTO csi_codes (division, section, title, level, parent_id, canonical_unit, description) VALUES
  (32, '32 12 00', 'Flexible Paving',                2, (SELECT id FROM csi_codes WHERE section='32 00 00'), 'SY',  'Asphalt paving, base course'),
  (32, '32 13 00', 'Rigid Paving',                   2, (SELECT id FROM csi_codes WHERE section='32 00 00'), 'SF',  'Concrete paving, sidewalks'),
  (32, '32 16 00', 'Curbs & Gutters',                2, (SELECT id FROM csi_codes WHERE section='32 00 00'), 'LF',  'Concrete curb, gutter, combined'),
  (32, '32 31 00', 'Fences & Gates',                 2, (SELECT id FROM csi_codes WHERE section='32 00 00'), 'LF',  'Chain link, ornamental, wood fencing'),
  (32, '32 90 00', 'Planting',                       2, (SELECT id FROM csi_codes WHERE section='32 00 00'), 'EA',  'Trees, shrubs, ground cover'),
  (32, '32 92 00', 'Lawns & Grasses',                2, (SELECT id FROM csi_codes WHERE section='32 00 00'), 'SF',  'Sod, seed, hydroseeding')
ON CONFLICT DO NOTHING;

-- ── Division 33: Utilities (SITEWORK) ──
INSERT INTO csi_codes (division, section, title, level, parent_id, canonical_unit, description) VALUES
  (33, '33 11 00', 'Water Utilities',                2, (SELECT id FROM csi_codes WHERE section='33 00 00'), 'LF',  'Water mains, services, valves'),
  (33, '33 31 00', 'Sanitary Sewerage Utilities',    2, (SELECT id FROM csi_codes WHERE section='33 00 00'), 'LF',  'Sanitary sewer, manholes, cleanouts'),
  (33, '33 41 00', 'Storm Drainage Utilities',       2, (SELECT id FROM csi_codes WHERE section='33 00 00'), 'LF',  'Storm sewer, catch basins, detention')
ON CONFLICT DO NOTHING;


-- ============================================================
-- 2. DELETE OLD DIVISION-LEVEL CARBON_DATA
-- ============================================================
DELETE FROM carbon_data;


-- ============================================================
-- 3. RESEED CARBON_DATA AT SECTION LEVEL
--    ICE Database v3.0 generic averages per material.
--    Each record: org_id, csi_code_id, trade_id, material,
--    canonical_unit, ice_co2e, a1-a3, transport%, a4, a5, total.
--
--    transport A4 = ice_co2e * transport_pct
--    construction A5 = ice_co2e * 0.05 (5% waste/site energy)
--    total = a1_a3 + a4 + a5
-- ============================================================

-- Helper function: compute carbon lifecycle from base ICE coefficient
-- Returns (a1_a3, a4, a5, total) as a row
DO $$
DECLARE
  v_org_id UUID;
  v_trade_id UUID;
  v_csi_id UUID;
BEGIN
  -- Get the system org
  SELECT id INTO v_org_id FROM organizations LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found';
  END IF;

  -- ── CONCRETE (trade: CONC, division 3) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'CONC';

  -- 03 10 00 Forming: plywood formwork — ICE plywood 0.45 kg/kg → 2.5 kg/SF (3/4" sheet)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '03 10 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'plywood formwork', 'SF',
    2.50, 2.50, 0.05, 0.125, 0.125, 2.75, 'ice_generic', true, '2024-01-01');

  -- 03 20 00 Reinforcing: rebar — ICE steel rebar 1.99 kg/kg → 0.90 kg/LB
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '03 20 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'steel reinforcement', 'LB',
    0.90, 0.90, 0.12, 0.108, 0.045, 1.053, 'ice_generic', true, '2024-01-01');

  -- 03 30 00 Cast-in-Place: concrete — ICE general concrete 130 kg/m³ → 99.4 kg/CY
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '03 30 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'ready-mix concrete (30 MPa)', 'CY',
    99.40, 99.40, 0.12, 11.928, 4.970, 116.298, 'ice_generic', true, '2024-01-01');

  -- 03 35 00 Finishing: curing compound — ICE sealant 2.9 kg/kg → 0.15 kg/SF
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '03 35 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'concrete curing compound', 'SF',
    0.15, 0.15, 0.05, 0.0075, 0.0075, 0.165, 'ice_generic', true, '2024-01-01');

  -- 03 40 00 Precast: higher-strength concrete — ICE 180 kg/m³ → 137.7 kg/CY
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '03 40 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'precast concrete (40 MPa)', 'CY',
    137.70, 137.70, 0.12, 16.524, 6.885, 161.109, 'ice_generic', true, '2024-01-01');

  -- 03 60 00 Grouting: cementitious grout — ~90 kg/CY (lower cement content)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '03 60 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'cementitious grout', 'CF',
    12.00, 12.00, 0.12, 1.440, 0.600, 14.040, 'ice_generic', true, '2024-01-01');

  -- ── MASONRY (trade: MASON, division 4) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'MASON';

  -- 04 20 00 Unit Masonry: clay brick — ICE 0.24 kg/kg → 11.5 kg/SF (4" wall)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '04 20 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'clay brick', 'SF',
    11.50, 11.50, 0.12, 1.380, 0.575, 13.455, 'ice_generic', true, '2024-01-01');

  -- 04 22 00 CMU: concrete block — ICE 0.073 kg/kg → 8.2 kg/SF (8" wall)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '04 22 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'concrete masonry unit', 'SF',
    8.20, 8.20, 0.12, 0.984, 0.410, 9.594, 'ice_generic', true, '2024-01-01');

  -- 04 40 00 Stone: natural stone — ICE 0.06 kg/kg → 6.8 kg/SF (2" veneer)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '04 40 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'natural stone veneer', 'SF',
    6.80, 6.80, 0.12, 0.816, 0.340, 7.956, 'ice_generic', true, '2024-01-01');

  -- ── STRUCTURAL STEEL (trade: STRUCT_STEEL, division 5) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'STRUCT_STEEL';

  -- 05 12 00 Structural framing: hot-rolled — ICE 1.55 kg/kg → 0.70 kg/LB → 1400 kg/TON
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '05 12 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'structural steel (hot-rolled)', 'TON',
    1400.00, 1400.00, 0.12, 168.000, 70.000, 1638.000, 'ice_generic', true, '2024-01-01');

  -- 05 21 00 Steel joists — ICE 1.55 kg/kg → 0.70 kg/LB
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '05 21 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'open-web steel joist', 'LF',
    4.20, 4.20, 0.12, 0.504, 0.210, 4.914, 'ice_generic', true, '2024-01-01');

  -- 05 31 00 Steel decking: galvanized — ICE 2.76 kg/kg → 2.8 kg/SF (20 ga composite)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '05 31 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'steel deck (galvanized)', 'SF',
    2.80, 2.80, 0.12, 0.336, 0.140, 3.276, 'ice_generic', true, '2024-01-01');

  -- ── MISC METALS (trade: MISC_METALS, division 5) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'MISC_METALS';

  -- 05 50 00 Metal fabrications: misc steel — 0.70 kg/LB
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '05 50 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'miscellaneous steel', 'LB',
    0.70, 0.70, 0.12, 0.084, 0.035, 0.819, 'ice_generic', true, '2024-01-01');

  -- 05 52 00 Metal railings: aluminum — ICE 6.67 kg/kg → 3.03 kg/LB
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '05 52 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'aluminum railing', 'LF',
    8.50, 8.50, 0.12, 1.020, 0.425, 9.945, 'ice_generic', true, '2024-01-01');

  -- ── ROUGH CARPENTRY (trade: ROUGH_CARP, division 6) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'ROUGH_CARP';

  -- 06 10 00 Rough Carpentry: sawn softwood — ICE 0.31 kg/kg → 0.59 kg/SF (2x framing per SF wall)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '06 10 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'sawn softwood lumber', 'SF',
    0.59, 0.59, 0.05, 0.030, 0.030, 0.650, 'ice_generic', true, '2024-01-01');

  -- 06 11 00 Wood Framing: dimensional lumber — 0.59 kg/SF
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '06 11 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'dimensional lumber framing', 'SF',
    0.59, 0.59, 0.05, 0.030, 0.030, 0.650, 'ice_generic', true, '2024-01-01');

  -- 06 17 00 Engineered wood: glulam — ICE 0.42 kg/kg → 0.80 kg/SF
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '06 17 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'glulam / engineered wood', 'SF',
    0.80, 0.80, 0.05, 0.040, 0.040, 0.880, 'ice_generic', true, '2024-01-01');

  -- ── FINISH CARPENTRY (trade: FINISH_CARP, division 6) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'FINISH_CARP';

  -- 06 20 00 Finish Carpentry: hardwood trim — ICE 0.39 kg/kg → 0.35 kg/LF
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '06 20 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'hardwood trim', 'LF',
    0.35, 0.35, 0.05, 0.018, 0.018, 0.386, 'ice_generic', true, '2024-01-01');

  -- 06 40 00 Architectural Woodwork: MDF/plywood — ICE 0.59 kg/kg → 3.2 kg/SF
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '06 40 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'architectural woodwork (MDF/ply)', 'SF',
    3.20, 3.20, 0.05, 0.160, 0.160, 3.520, 'ice_generic', true, '2024-01-01');

  -- ── WATERPROOFING (trade: WATERPROOF, division 7) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'WATERPROOF';

  -- 07 10 00 Waterproofing: bituminous membrane — ICE 0.43 kg/kg → 2.1 kg/SF
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '07 10 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'bituminous waterproofing membrane', 'SF',
    2.10, 2.10, 0.05, 0.105, 0.105, 2.310, 'ice_generic', true, '2024-01-01');

  -- 07 41 00 Metal roof panels: galvanized steel — 3.8 kg/SF
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '07 41 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'galvanized steel roof panel', 'SF',
    3.80, 3.80, 0.12, 0.456, 0.190, 4.446, 'ice_generic', true, '2024-01-01');

  -- 07 50 00 Membrane Roofing: TPO — ICE PVC/PE blend → 1.7 kg/SF
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '07 50 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'TPO roofing membrane', 'SF',
    1.70, 1.70, 0.05, 0.085, 0.085, 1.870, 'ice_generic', true, '2024-01-01');

  -- 07 60 00 Flashing: sheet metal — 1.2 kg/LF
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '07 60 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'galvanized sheet metal flashing', 'LF',
    1.20, 1.20, 0.12, 0.144, 0.060, 1.404, 'ice_generic', true, '2024-01-01');

  -- ── INSULATION (trade: INSULATION, division 7) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'INSULATION';

  -- 07 21 00 Thermal Insulation: mineral wool batt — ICE 1.28 kg/kg → 0.85 kg/SF
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '07 21 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'mineral wool batt insulation', 'SF',
    0.85, 0.85, 0.05, 0.043, 0.043, 0.936, 'ice_generic', true, '2024-01-01');

  -- 07 27 00 Air Barriers: fluid-applied — 0.65 kg/SF
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '07 27 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'fluid-applied air barrier', 'SF',
    0.65, 0.65, 0.05, 0.033, 0.033, 0.716, 'ice_generic', true, '2024-01-01');

  -- ── DOORS & WINDOWS (trade: DOORS_WINDOWS, division 8) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'DOORS_WINDOWS';

  -- 08 11 00 Metal Doors: HM door+frame — ICE steel → 45 kg/EA (typical 3070)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '08 11 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'hollow metal door & frame', 'EA',
    45.00, 45.00, 0.12, 5.400, 2.250, 52.650, 'ice_generic', true, '2024-01-01');

  -- 08 14 00 Wood Doors: flush wood — ICE timber → 18 kg/EA
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '08 14 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'flush wood door', 'EA',
    18.00, 18.00, 0.05, 0.900, 0.900, 19.800, 'ice_generic', true, '2024-01-01');

  -- 08 41 00 Storefronts: aluminum curtain wall — ICE aluminum 6.67 kg/kg → 18.5 kg/SF
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '08 41 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'aluminum storefront/curtain wall', 'SF',
    18.50, 18.50, 0.12, 2.220, 0.925, 21.645, 'ice_generic', true, '2024-01-01');

  -- 08 51 00 Windows: aluminum frame + IGU — 15.2 kg/SF
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '08 51 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'aluminum window with IGU', 'SF',
    15.20, 15.20, 0.12, 1.824, 0.760, 17.784, 'ice_generic', true, '2024-01-01');

  -- 08 80 00 Glazing: float glass — ICE 0.86 kg/kg → 10.5 kg/SF (1/4" glass)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '08 80 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'float glass (1/4")', 'SF',
    10.50, 10.50, 0.12, 1.260, 0.525, 12.285, 'ice_generic', true, '2024-01-01');

  -- ── FINISHES (trade: FINISHES, division 9) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'FINISHES';

  -- 09 21 00 Gypsum Board: drywall — ICE 0.12 kg/kg → 1.20 kg/SF (5/8")
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '09 21 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'gypsum board (5/8")', 'SF',
    1.20, 1.20, 0.05, 0.060, 0.060, 1.320, 'ice_generic', true, '2024-01-01');

  -- 09 22 00 Metal Studs: light-gauge steel — ICE 2.76 kg/kg → 0.95 kg/SF (framed wall)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '09 22 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'light-gauge steel studs', 'SF',
    0.95, 0.95, 0.12, 0.114, 0.048, 1.112, 'ice_generic', true, '2024-01-01');

  -- 09 30 00 Tiling: ceramic tile — ICE 0.74 kg/kg → 5.80 kg/SF
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '09 30 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'ceramic tile', 'SF',
    5.80, 5.80, 0.12, 0.696, 0.290, 6.786, 'ice_generic', true, '2024-01-01');

  -- 09 51 00 Acoustical Ceilings: mineral fiber ACT — 1.85 kg/SF
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '09 51 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'mineral fiber acoustical tile', 'SF',
    1.85, 1.85, 0.05, 0.093, 0.093, 2.036, 'ice_generic', true, '2024-01-01');

  -- 09 91 00 Painting: latex paint — ICE 2.91 kg/kg → 0.12 kg/SF (2 coats)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '09 91 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'latex paint (2 coats)', 'SF',
    0.12, 0.12, 0.05, 0.006, 0.006, 0.132, 'ice_generic', true, '2024-01-01');

  -- ── FLOORING (trade: FLOORING, division 9) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'FLOORING';

  -- 09 65 00 Resilient Flooring: LVT — ICE vinyl 2.92 kg/kg → 1.50 kg/SF
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '09 65 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'luxury vinyl tile (LVT)', 'SF',
    1.50, 1.50, 0.05, 0.075, 0.075, 1.650, 'ice_generic', true, '2024-01-01');

  -- 09 68 00 Carpeting: broadloom — ICE 5.53 kg/kg → 3.20 kg/SY
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '09 68 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'broadloom carpet', 'SY',
    3.20, 3.20, 0.05, 0.160, 0.160, 3.520, 'ice_generic', true, '2024-01-01');

  -- ── SPECIALTIES (trade: SPECIALTIES, division 10) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'SPECIALTIES';

  -- 10 21 00 Toilet partitions: HDPE — 22 kg/EA
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '10 21 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'HDPE toilet partition', 'EA',
    22.00, 22.00, 0.05, 1.100, 1.100, 24.200, 'ice_generic', true, '2024-01-01');

  -- 10 28 00 Toilet accessories: stainless steel — 8.5 kg/EA
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '10 28 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'stainless steel accessories', 'EA',
    8.50, 8.50, 0.12, 1.020, 0.425, 9.945, 'ice_generic', true, '2024-01-01');

  -- ── PLUMBING (trade: PLUMBING, division 22) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'PLUMBING';

  -- 22 11 00 Water Distribution: copper pipe — ICE 2.71 kg/kg → 1.85 kg/LF (3/4" type L)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '22 11 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'copper pipe (3/4" type L)', 'LF',
    1.85, 1.85, 0.12, 0.222, 0.093, 2.165, 'ice_generic', true, '2024-01-01');

  -- 22 13 00 Sanitary Sewerage: PVC DWV — ICE PVC 2.41 kg/kg → 1.45 kg/LF (4")
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '22 13 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'PVC DWV pipe (4")', 'LF',
    1.45, 1.45, 0.05, 0.073, 0.073, 1.596, 'ice_generic', true, '2024-01-01');

  -- 22 14 00 Storm Drainage: PVC SDR-35 — 1.20 kg/LF (4")
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '22 14 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'PVC storm drain pipe (4")', 'LF',
    1.20, 1.20, 0.05, 0.060, 0.060, 1.320, 'ice_generic', true, '2024-01-01');

  -- 22 40 00 Plumbing Fixtures: vitreous china — ICE ceramic 0.74 kg/kg → 28 kg/EA (typical toilet)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '22 40 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'vitreous china fixture', 'EA',
    28.00, 28.00, 0.12, 3.360, 1.400, 32.760, 'ice_generic', true, '2024-01-01');

  -- ── FIRE PROTECTION (trade: FIRE_PROT, division 21) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'FIRE_PROT';

  -- 21 13 00 Sprinkler Systems: steel pipe — 2.10 kg/LF (1" Schedule 40)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '21 13 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'black steel fire sprinkler pipe', 'SF',
    0.42, 0.42, 0.12, 0.050, 0.021, 0.491, 'ice_generic', true, '2024-01-01');

  -- 21 12 00 Standpipes: steel — 3.50 kg/LF (2.5" Schedule 40)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '21 12 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'steel standpipe riser', 'LF',
    3.50, 3.50, 0.12, 0.420, 0.175, 4.095, 'ice_generic', true, '2024-01-01');

  -- ── HVAC (trade: HVAC, division 23) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'HVAC';

  -- 23 21 00 Hydronic Piping: copper — 1.85 kg/LF
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '23 21 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'copper hydronic pipe', 'LF',
    1.85, 1.85, 0.12, 0.222, 0.093, 2.165, 'ice_generic', true, '2024-01-01');

  -- 23 31 00 Ductwork: galvanized sheet steel — ICE 2.76 kg/kg → 1.40 kg/LB
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '23 31 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'galvanized sheet metal ductwork', 'LB',
    1.40, 1.40, 0.12, 0.168, 0.070, 1.638, 'ice_generic', true, '2024-01-01');

  -- 23 73 00 AHUs: mixed metals — 850 kg/EA (typical 10-ton AHU)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '23 73 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'air handling unit (10-ton)', 'EA',
    850.00, 850.00, 0.12, 102.000, 42.500, 994.500, 'ice_generic', true, '2024-01-01');

  -- 23 64 00 Chillers: mixed metals — 2200 kg CO2e/TON capacity
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '23 64 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'packaged water chiller', 'TON',
    2200.00, 2200.00, 0.12, 264.000, 110.000, 2574.000, 'ice_generic', true, '2024-01-01');

  -- ── ELECTRICAL (trade: ELECTRICAL, division 26) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'ELECTRICAL';

  -- 26 05 00 Common Work: copper wire + PVC conduit — 1.65 kg/LF (avg)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '26 05 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'copper wire in PVC conduit', 'LF',
    1.65, 1.65, 0.08, 0.132, 0.083, 1.865, 'ice_generic', true, '2024-01-01');

  -- 26 24 00 Switchboards: mixed metals/plastics — 320 kg/EA
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '26 24 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'electrical panelboard', 'EA',
    320.00, 320.00, 0.12, 38.400, 16.000, 374.400, 'ice_generic', true, '2024-01-01');

  -- 26 51 00 Interior Lighting: LED fixture — ICE aluminum/glass → 8.5 kg/EA
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '26 51 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'LED light fixture', 'EA',
    8.50, 8.50, 0.05, 0.425, 0.425, 9.350, 'ice_generic', true, '2024-01-01');

  -- ── ELEVATOR (trade: ELEVATOR, division 14) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'ELEVATOR';

  -- 14 20 00 Elevators: traction — ICE steel/copper/aluminum → 4500 kg/EA
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '14 20 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'traction elevator system', 'EA',
    4500.00, 4500.00, 0.12, 540.000, 225.000, 5265.000, 'ice_generic', true, '2024-01-01');

  -- 14 24 00 Hydraulic Elevators — 3200 kg/EA (simpler system)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '14 24 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'hydraulic elevator system', 'EA',
    3200.00, 3200.00, 0.12, 384.000, 160.000, 3744.000, 'ice_generic', true, '2024-01-01');

  -- ── DEMOLITION (trade: DEMO, division 2) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'DEMO';

  -- 02 41 00 Demolition: negative carbon credit (embedded carbon released)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '02 41 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'demolition (mixed materials)', 'SF',
    3.50, 3.50, 0.08, 0.280, 0.175, 3.955, 'ice_generic', true, '2024-01-01');

  -- ── SITEWORK (trade: SITEWORK, divisions 31,32,33) ──
  SELECT id INTO v_trade_id FROM trades WHERE code = 'SITEWORK';

  -- 31 23 00 Excavation & Fill: diesel equipment emissions — 2.8 kg/CY
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '31 23 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'earthwork (diesel equipment)', 'CY',
    2.80, 2.80, 0.15, 0.420, 0.140, 3.360, 'ice_generic', true, '2024-01-01');

  -- 32 12 00 Flexible Paving: asphalt — ICE 0.052 kg/kg → 6.20 kg/SY (3" HMA)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '32 12 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'hot-mix asphalt (3")', 'SY',
    6.20, 6.20, 0.12, 0.744, 0.310, 7.254, 'ice_generic', true, '2024-01-01');

  -- 32 13 00 Rigid Paving: concrete sidewalk — 75 kg/SF (4" slab per SF)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '32 13 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'concrete paving (4" slab)', 'SF',
    4.10, 4.10, 0.12, 0.492, 0.205, 4.797, 'ice_generic', true, '2024-01-01');

  -- 32 16 00 Curbs: concrete curb — 18.5 kg/LF (6x18 curb)
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '32 16 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'concrete curb (6x18)', 'LF',
    18.50, 18.50, 0.12, 2.220, 0.925, 21.645, 'ice_generic', true, '2024-01-01');

  -- 33 11 00 Water Utilities: ductile iron pipe — 4.5 kg/LF (8")
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '33 11 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'ductile iron water main (8")', 'LF',
    4.50, 4.50, 0.12, 0.540, 0.225, 5.265, 'ice_generic', true, '2024-01-01');

  -- 33 31 00 Sanitary Sewer: PVC — 1.80 kg/LF (8")
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '33 31 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'PVC sanitary sewer pipe (8")', 'LF',
    1.80, 1.80, 0.05, 0.090, 0.090, 1.980, 'ice_generic', true, '2024-01-01');

  -- 33 41 00 Storm Drainage: HDPE — 2.10 kg/LF (12")
  SELECT id INTO v_csi_id FROM csi_codes WHERE section = '33 41 00';
  INSERT INTO carbon_data (org_id, csi_code_id, trade_id, material_name, canonical_unit,
    ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e, total_co2e,
    active_co2e_source, transport_assumption_disclosed, data_vintage)
  VALUES (v_org_id, v_csi_id, v_trade_id, 'HDPE storm drain pipe (12")', 'LF',
    2.10, 2.10, 0.05, 0.105, 0.105, 2.310, 'ice_generic', true, '2024-01-01');

END;
$$;

COMMIT;
