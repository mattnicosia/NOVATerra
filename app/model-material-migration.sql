-- Model & Material Migration — Run in Supabase Dashboard > SQL Editor
-- Adds: material_catalog, model_material_assignments, model_snapshots, core_material_stats
-- Part of the Estimate-to-Architecture pipeline (Slice 5)

-- ═══════════════════════════════════════════════════════════════════════
-- 1. material_catalog — Server-side material reference data
--    Mirrors the client-side MATERIAL_CATALOG for NOVA Core aggregation.
--    Seeded from materialCatalog.js, updated as catalog grows.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS material_catalog (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  manufacturer TEXT DEFAULT 'N/A',
  category TEXT NOT NULL,
  spec_section TEXT,                  -- CSI spec section (e.g., "07 46 46")
  ifc_material TEXT,                  -- IFC material classification name
  cost_json JSONB NOT NULL DEFAULT '{}',
  -- { materialPerUnit, laborPerUnit, totalPerUnit, unit }
  schedule_json JSONB NOT NULL DEFAULT '{}',
  -- { installRate, crewSize, leadTimeDays }
  visual_json JSONB NOT NULL DEFAULT '{}',
  -- { color, roughness, metalness, pattern, patternScale, opacity? }
  assembly_json JSONB NOT NULL DEFAULT '{}',
  -- { layers: [{name, thickness}], rValue, fireRating, stc }
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_catalog_category ON material_catalog (category);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. model_material_assignments — Per-element material selections
--    Tracks which material a user assigned to a specific 3D element
--    within an estimate's model. Supports override pricing.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS model_material_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id TEXT NOT NULL,           -- matches user_estimates.id (client-generated)
  element_id TEXT NOT NULL,            -- matches element.id from geometryBuilder
  material_slug TEXT REFERENCES material_catalog(slug),
  overrides_json JSONB DEFAULT '{}',
  -- { costOverride?, laborOverride?, notes? } — user tweaks to base pricing
  org_id UUID REFERENCES organizations(id),
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  UNIQUE(estimate_id, element_id)
);

CREATE INDEX IF NOT EXISTS idx_material_assignments_estimate
  ON model_material_assignments (estimate_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_material_assignments_slug
  ON model_material_assignments (material_slug);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. model_snapshots — Versioned model state for undo / history
--    Each snapshot captures the full model state at a point in time.
--    Enables "compare to previous" and version history in the UI.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS model_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id TEXT NOT NULL,           -- matches user_estimates.id
  version INTEGER NOT NULL DEFAULT 1,
  label TEXT DEFAULT '',               -- user-facing label ("After wall change", etc.)
  snapshot_json JSONB NOT NULL,
  -- Full serialized model state: outlines, floorAssignments, floorHeights,
  -- specOverrides, materialAssignments, viewMode, etc.
  org_id UUID REFERENCES organizations(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(estimate_id, version)
);

CREATE INDEX IF NOT EXISTS idx_model_snapshots_estimate
  ON model_snapshots (estimate_id, version DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. core_material_stats — Aggregated material intelligence
--    Anonymized usage data across all orgs for NOVA Core insights.
--    "In your region, 72% of similar projects use standing seam metal"
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS core_material_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_slug TEXT NOT NULL REFERENCES material_catalog(slug),
  org_id UUID REFERENCES organizations(id),
  project_type TEXT,                   -- commercial, residential, mixed-use, etc.
  region TEXT,                         -- geographic region for cost variance
  usage_count INTEGER DEFAULT 0,
  total_area_applied NUMERIC DEFAULT 0,
  avg_cost_override NUMERIC DEFAULT 0, -- average of user overrides vs base cost
  avg_lead_time_actual INTEGER,        -- actual lead time reported
  last_used_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(material_slug, org_id, project_type, region)
);

CREATE INDEX IF NOT EXISTS idx_core_stats_slug
  ON core_material_stats (material_slug);

CREATE INDEX IF NOT EXISTS idx_core_stats_org
  ON core_material_stats (org_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 5. RLS Policies
-- ═══════════════════════════════════════════════════════════════════════

-- material_catalog: read-only for all authenticated users (reference data)
ALTER TABLE material_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "material_catalog_read" ON material_catalog
  FOR SELECT TO authenticated
  USING (true);

-- model_material_assignments: org-scoped CRUD
ALTER TABLE model_material_assignments ENABLE ROW LEVEL SECURITY;

-- Solo mode (no org): user owns their assignments
CREATE POLICY "assignments_solo_select" ON model_material_assignments
  FOR SELECT TO authenticated
  USING (org_id IS NULL AND assigned_by = auth.uid());

CREATE POLICY "assignments_solo_insert" ON model_material_assignments
  FOR INSERT TO authenticated
  WITH CHECK (org_id IS NULL AND assigned_by = auth.uid());

CREATE POLICY "assignments_solo_update" ON model_material_assignments
  FOR UPDATE TO authenticated
  USING (org_id IS NULL AND assigned_by = auth.uid());

-- Org mode: members of the org can read/write
CREATE POLICY "assignments_org_select" ON model_material_assignments
  FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL AND
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid() AND om.active = true)
  );

CREATE POLICY "assignments_org_insert" ON model_material_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IS NOT NULL AND
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid() AND om.active = true)
  );

CREATE POLICY "assignments_org_update" ON model_material_assignments
  FOR UPDATE TO authenticated
  USING (
    org_id IS NOT NULL AND
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid() AND om.active = true)
  );

-- model_snapshots: org-scoped read/write
ALTER TABLE model_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshots_solo_select" ON model_snapshots
  FOR SELECT TO authenticated
  USING (org_id IS NULL AND created_by = auth.uid());

CREATE POLICY "snapshots_solo_insert" ON model_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (org_id IS NULL AND created_by = auth.uid());

CREATE POLICY "snapshots_org_select" ON model_snapshots
  FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL AND
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid() AND om.active = true)
  );

CREATE POLICY "snapshots_org_insert" ON model_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IS NOT NULL AND
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid() AND om.active = true)
  );

-- core_material_stats: org-scoped writes, all authenticated reads (for NOVA Core)
ALTER TABLE core_material_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "core_stats_read" ON core_material_stats
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "core_stats_solo_insert" ON core_material_stats
  FOR INSERT TO authenticated
  WITH CHECK (org_id IS NULL OR org_id IN (
    SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid() AND om.active = true
  ));

CREATE POLICY "core_stats_solo_update" ON core_material_stats
  FOR UPDATE TO authenticated
  USING (org_id IS NULL OR org_id IN (
    SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid() AND om.active = true
  ));

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Seed material_catalog from current client-side catalog
--    (28 materials — run once, then maintain via admin UI or migration)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO material_catalog (slug, name, manufacturer, category, spec_section, ifc_material, cost_json, schedule_json, visual_json, assembly_json)
VALUES
  -- Exterior Cladding
  ('hardie-lap-siding', 'James Hardie Lap Siding', 'James Hardie', 'exterior-cladding', '07 46 46', 'Fiber Cement Lap Siding',
   '{"materialPerUnit":4.25,"laborPerUnit":6.5,"totalPerUnit":10.75,"unit":"SF"}',
   '{"installRate":200,"crewSize":3,"leadTimeDays":14}',
   '{"color":"#E8DCC8","roughness":0.6,"metalness":0,"pattern":"horizontal-lap","patternScale":7}',
   '{"layers":[{"name":"Hardie Plank 5/16\"","thickness":0.3125},{"name":"Tyvek HomeWrap","thickness":0.01},{"name":"7/16\" OSB Sheathing","thickness":0.4375}],"rValue":1.5,"fireRating":"1-HR","stc":35}'),

  ('cedar-bevel-siding', 'Western Red Cedar Bevel Siding', 'Real Cedar', 'exterior-cladding', '07 46 23', 'Wood Siding',
   '{"materialPerUnit":8.5,"laborPerUnit":9,"totalPerUnit":17.5,"unit":"SF"}',
   '{"installRate":150,"crewSize":3,"leadTimeDays":21}',
   '{"color":"#C4956A","roughness":0.75,"metalness":0,"pattern":"horizontal-lap","patternScale":6}',
   '{"layers":[{"name":"3/4\" Cedar Bevel","thickness":0.75},{"name":"Tyvek HomeWrap","thickness":0.01},{"name":"7/16\" OSB Sheathing","thickness":0.4375}],"rValue":1,"fireRating":"0-HR","stc":30}'),

  ('vinyl-siding', 'CertainTeed Vinyl Siding', 'CertainTeed', 'exterior-cladding', '07 46 29', 'Vinyl Siding',
   '{"materialPerUnit":2.5,"laborPerUnit":4,"totalPerUnit":6.5,"unit":"SF"}',
   '{"installRate":300,"crewSize":3,"leadTimeDays":7}',
   '{"color":"#F5F0E8","roughness":0.3,"metalness":0,"pattern":"horizontal-lap","patternScale":8}',
   '{"layers":[{"name":"Vinyl Panel 0.044\"","thickness":0.044},{"name":"Fanfold Insulation","thickness":0.25},{"name":"Tyvek HomeWrap","thickness":0.01}],"rValue":0.6,"fireRating":"0-HR","stc":28}'),

  ('metal-panel-ribbed', 'MBCI Ribbed Metal Panel', 'MBCI', 'exterior-cladding', '07 42 13', 'Metal Wall Panel',
   '{"materialPerUnit":6,"laborPerUnit":5,"totalPerUnit":11,"unit":"SF"}',
   '{"installRate":250,"crewSize":3,"leadTimeDays":21}',
   '{"color":"#8B9DAF","roughness":0.2,"metalness":0.8,"pattern":"vertical-rib","patternScale":12}',
   '{"layers":[{"name":"26ga Steel Panel","thickness":0.018},{"name":"Rigid Insulation","thickness":1.5},{"name":"Vapor Barrier","thickness":0.01}],"rValue":6,"fireRating":"2-HR","stc":32}'),

  ('eifs-stucco', 'Dryvit EIFS', 'Dryvit', 'exterior-cladding', '07 24 13', 'EIFS',
   '{"materialPerUnit":9,"laborPerUnit":11,"totalPerUnit":20,"unit":"SF"}',
   '{"installRate":120,"crewSize":4,"leadTimeDays":14}',
   '{"color":"#E8E0D0","roughness":0.5,"metalness":0,"pattern":"stucco","patternScale":1}',
   '{"layers":[{"name":"Acrylic Finish","thickness":0.125},{"name":"Base Coat + Mesh","thickness":0.0625},{"name":"2\" EPS Insulation","thickness":2},{"name":"Adhesive","thickness":0.0625}],"rValue":8,"fireRating":"1-HR","stc":38}'),

  ('brick-veneer', 'General Shale Brick Veneer', 'General Shale', 'exterior-cladding', '04 21 13', 'Brick',
   '{"materialPerUnit":12,"laborPerUnit":14,"totalPerUnit":26,"unit":"SF"}',
   '{"installRate":80,"crewSize":4,"leadTimeDays":14}',
   '{"color":"#A0522D","roughness":0.85,"metalness":0,"pattern":"brick-running","patternScale":8}',
   '{"layers":[{"name":"Modular Brick 3-5/8\"","thickness":3.625},{"name":"1\" Air Gap","thickness":1},{"name":"Building Wrap","thickness":0.01}],"rValue":0.8,"fireRating":"2-HR","stc":45}'),

  -- Roofing
  ('tpo-60mil', 'Carlisle TPO 60-mil', 'Carlisle', 'roofing', '07 54 23', 'TPO Membrane',
   '{"materialPerUnit":5.5,"laborPerUnit":4.5,"totalPerUnit":10,"unit":"SF"}',
   '{"installRate":300,"crewSize":4,"leadTimeDays":14}',
   '{"color":"#F0F0F0","roughness":0.3,"metalness":0,"pattern":"membrane","patternScale":1}',
   '{"layers":[{"name":"60-mil TPO Membrane","thickness":0.06},{"name":"1/2\" Cover Board","thickness":0.5},{"name":"3\" Polyiso Insulation","thickness":3}],"rValue":18,"fireRating":"A","stc":20}'),

  ('epdm-60mil', 'Firestone EPDM 60-mil', 'Firestone', 'roofing', '07 53 23', 'EPDM Membrane',
   '{"materialPerUnit":4.5,"laborPerUnit":4,"totalPerUnit":8.5,"unit":"SF"}',
   '{"installRate":350,"crewSize":4,"leadTimeDays":10}',
   '{"color":"#2D2D2D","roughness":0.4,"metalness":0,"pattern":"membrane","patternScale":1}',
   '{"layers":[{"name":"60-mil EPDM Sheet","thickness":0.06},{"name":"1/2\" Cover Board","thickness":0.5},{"name":"3\" Polyiso Insulation","thickness":3}],"rValue":18,"fireRating":"A","stc":20}'),

  ('standing-seam-metal', 'Petersen PAC-CLAD Standing Seam', 'Petersen', 'roofing', '07 41 13', 'Metal Roofing',
   '{"materialPerUnit":10,"laborPerUnit":8,"totalPerUnit":18,"unit":"SF"}',
   '{"installRate":150,"crewSize":4,"leadTimeDays":28}',
   '{"color":"#4A5568","roughness":0.15,"metalness":0.85,"pattern":"standing-seam","patternScale":18}',
   '{"layers":[{"name":"24ga Steel Panel","thickness":0.025},{"name":"Underlayment","thickness":0.0625},{"name":"3\" Polyiso Insulation","thickness":3}],"rValue":18,"fireRating":"A","stc":28}'),

  ('asphalt-shingle', 'GAF Timberline HDZ', 'GAF', 'roofing', '07 31 13', 'Asphalt Shingle',
   '{"materialPerUnit":2.5,"laborPerUnit":3.5,"totalPerUnit":6,"unit":"SF"}',
   '{"installRate":400,"crewSize":4,"leadTimeDays":7}',
   '{"color":"#5C5C5C","roughness":0.8,"metalness":0,"pattern":"shingle","patternScale":12}',
   '{"layers":[{"name":"Architectural Shingle","thickness":0.25},{"name":"Synthetic Underlayment","thickness":0.03},{"name":"7/16\" OSB Deck","thickness":0.4375}],"rValue":0.5,"fireRating":"A","stc":22}'),

  -- Interior Wall
  ('gwb-1-layer', 'USG 5/8\" Type X GWB — 1 Layer', 'USG', 'interior-wall', '09 29 00', 'Gypsum Board',
   '{"materialPerUnit":2,"laborPerUnit":3.5,"totalPerUnit":5.5,"unit":"SF"}',
   '{"installRate":400,"crewSize":3,"leadTimeDays":5}',
   '{"color":"#F5F5F0","roughness":0.5,"metalness":0,"pattern":"smooth","patternScale":1}',
   '{"layers":[{"name":"5/8\" Type X GWB","thickness":0.625}],"rValue":0.6,"fireRating":"1-HR","stc":35}'),

  ('gwb-2-layer', 'USG 5/8\" Type X GWB — 2 Layer', 'USG', 'interior-wall', '09 29 00', 'Gypsum Board',
   '{"materialPerUnit":3.5,"laborPerUnit":5.5,"totalPerUnit":9,"unit":"SF"}',
   '{"installRate":250,"crewSize":3,"leadTimeDays":5}',
   '{"color":"#F5F5F0","roughness":0.5,"metalness":0,"pattern":"smooth","patternScale":1}',
   '{"layers":[{"name":"5/8\" Type X GWB","thickness":0.625},{"name":"5/8\" Type X GWB","thickness":0.625}],"rValue":1.2,"fireRating":"2-HR","stc":45}'),

  ('cmu-8-block', 'Standard 8\" CMU Block Wall', 'Various', 'interior-wall', '04 22 00', 'Concrete Masonry Unit',
   '{"materialPerUnit":7,"laborPerUnit":10,"totalPerUnit":17,"unit":"SF"}',
   '{"installRate":100,"crewSize":4,"leadTimeDays":10}',
   '{"color":"#B0B0B0","roughness":0.9,"metalness":0,"pattern":"block","patternScale":8}',
   '{"layers":[{"name":"8\" CMU","thickness":7.625}],"rValue":2,"fireRating":"2-HR","stc":45}'),

  -- Flooring
  ('lvt-plank', 'Shaw Floorté LVT Plank', 'Shaw', 'flooring', '09 65 19', 'Vinyl Plank Flooring',
   '{"materialPerUnit":5,"laborPerUnit":3,"totalPerUnit":8,"unit":"SF"}',
   '{"installRate":300,"crewSize":2,"leadTimeDays":10}',
   '{"color":"#C4A882","roughness":0.4,"metalness":0,"pattern":"wood-plank","patternScale":6}',
   '{"layers":[{"name":"5mm LVT Plank","thickness":0.2},{"name":"Underlayment","thickness":0.06}],"rValue":0.3,"fireRating":"","stc":18}'),

  ('carpet-tile', 'Interface Carpet Tile', 'Interface', 'flooring', '09 68 13', 'Carpet Tile',
   '{"materialPerUnit":4,"laborPerUnit":2.5,"totalPerUnit":6.5,"unit":"SF"}',
   '{"installRate":400,"crewSize":2,"leadTimeDays":10}',
   '{"color":"#6B7280","roughness":0.95,"metalness":0,"pattern":"carpet","patternScale":2}',
   '{"layers":[{"name":"Carpet Tile","thickness":0.25},{"name":"Adhesive","thickness":0.01}],"rValue":1.2,"fireRating":"","stc":22}'),

  ('polished-concrete', 'Polished Concrete Floor', 'N/A', 'flooring', '03 35 00', 'Polished Concrete',
   '{"materialPerUnit":3,"laborPerUnit":5,"totalPerUnit":8,"unit":"SF"}',
   '{"installRate":200,"crewSize":3,"leadTimeDays":7}',
   '{"color":"#BCBCBC","roughness":0.1,"metalness":0.05,"pattern":"polished","patternScale":1}',
   '{"layers":[{"name":"4\" Concrete Slab","thickness":4},{"name":"Vapor Barrier","thickness":0.01}],"rValue":0.4,"fireRating":"2-HR","stc":48}'),

  ('ceramic-tile', 'Daltile Ceramic Floor Tile', 'Daltile', 'flooring', '09 30 13', 'Ceramic Tile',
   '{"materialPerUnit":6,"laborPerUnit":8,"totalPerUnit":14,"unit":"SF"}',
   '{"installRate":100,"crewSize":2,"leadTimeDays":14}',
   '{"color":"#E8E0D0","roughness":0.3,"metalness":0.05,"pattern":"tile-grid","patternScale":12}',
   '{"layers":[{"name":"Ceramic Tile","thickness":0.375},{"name":"Thinset","thickness":0.125},{"name":"Cement Backer Board","thickness":0.25}],"rValue":0.3,"fireRating":"","stc":30}'),

  -- Ceiling
  ('act-2x4', 'Armstrong 2×4 Acoustical Ceiling Tile', 'Armstrong', 'ceiling', '09 51 00', 'Acoustical Ceiling Tile',
   '{"materialPerUnit":3.5,"laborPerUnit":3,"totalPerUnit":6.5,"unit":"SF"}',
   '{"installRate":300,"crewSize":3,"leadTimeDays":10}',
   '{"color":"#F8F8F5","roughness":0.7,"metalness":0,"pattern":"grid-2x4","patternScale":1}',
   '{"layers":[{"name":"ACT Panel","thickness":0.75},{"name":"Grid System","thickness":1.5}],"rValue":1,"fireRating":"1-HR","stc":35}'),

  ('gwb-ceiling', 'USG 5/8\" GWB Ceiling', 'USG', 'ceiling', '09 29 00', 'Gypsum Board Ceiling',
   '{"materialPerUnit":2.5,"laborPerUnit":5,"totalPerUnit":7.5,"unit":"SF"}',
   '{"installRate":200,"crewSize":3,"leadTimeDays":5}',
   '{"color":"#FFFFFF","roughness":0.4,"metalness":0,"pattern":"smooth","patternScale":1}',
   '{"layers":[{"name":"5/8\" GWB","thickness":0.625},{"name":"Resilient Channel","thickness":0.5}],"rValue":0.6,"fireRating":"1-HR","stc":40}'),

  -- Glazing
  ('curtain-wall-glass', 'Curtain Wall — Insulated Glass', 'Kawneer', 'glazing', '08 44 13', 'Curtain Wall Glass',
   '{"materialPerUnit":35,"laborPerUnit":15,"totalPerUnit":50,"unit":"SF"}',
   '{"installRate":50,"crewSize":4,"leadTimeDays":42}',
   '{"color":"#88C0D0","roughness":0.1,"metalness":0.3,"pattern":"glass","patternScale":1,"opacity":0.4}',
   '{"layers":[{"name":"1\" Insulated Glass Unit","thickness":1},{"name":"Aluminum Frame","thickness":2}],"rValue":3,"fireRating":"0-HR","stc":32}'),

  ('storefront-glass', 'Aluminum Storefront', 'Kawneer', 'glazing', '08 41 13', 'Aluminum Storefront',
   '{"materialPerUnit":25,"laborPerUnit":10,"totalPerUnit":35,"unit":"SF"}',
   '{"installRate":80,"crewSize":3,"leadTimeDays":28}',
   '{"color":"#A8D0E0","roughness":0.1,"metalness":0.2,"pattern":"glass","patternScale":1,"opacity":0.5}',
   '{"layers":[{"name":"1\" Insulated Glass Unit","thickness":1},{"name":"Aluminum Storefront Frame","thickness":1.75}],"rValue":2,"fireRating":"0-HR","stc":30}'),

  -- Plumbing Fixtures
  ('kohler-simplice-faucet', 'Kohler Simplice K-22036', 'Kohler', 'plumbing-fixture', '22 41 16', 'Plumbing Fixture - Faucet',
   '{"materialPerUnit":485,"laborPerUnit":125,"totalPerUnit":610,"unit":"EA"}',
   '{"installRate":4,"crewSize":1,"leadTimeDays":14}',
   '{"color":"#C0C0C0","roughness":0.1,"metalness":0.9,"pattern":"chrome","patternScale":1}',
   '{"layers":[{"name":"Faucet Assembly","thickness":0}],"rValue":0,"fireRating":"","stc":0}'),

  ('delta-trinsic-faucet', 'Delta Trinsic 559LF', 'Delta', 'plumbing-fixture', '22 41 16', 'Plumbing Fixture - Faucet',
   '{"materialPerUnit":310,"laborPerUnit":115,"totalPerUnit":425,"unit":"EA"}',
   '{"installRate":4,"crewSize":1,"leadTimeDays":7}',
   '{"color":"#C0C0C0","roughness":0.1,"metalness":0.9,"pattern":"chrome","patternScale":1}',
   '{"layers":[{"name":"Faucet Assembly","thickness":0}],"rValue":0,"fireRating":"","stc":0}'),

  ('moen-align-faucet', 'Moen Align 6192', 'Moen', 'plumbing-fixture', '22 41 16', 'Plumbing Fixture - Faucet',
   '{"materialPerUnit":275,"laborPerUnit":115,"totalPerUnit":390,"unit":"EA"}',
   '{"installRate":4,"crewSize":1,"leadTimeDays":10}',
   '{"color":"#C0C0C0","roughness":0.1,"metalness":0.9,"pattern":"chrome","patternScale":1}',
   '{"layers":[{"name":"Faucet Assembly","thickness":0}],"rValue":0,"fireRating":"","stc":0}'),

  ('commercial-toilet', 'Commercial Floor-Mount Toilet', 'Kohler', 'plumbing-fixture', '22 42 13', 'Plumbing Fixture - Water Closet',
   '{"materialPerUnit":650,"laborPerUnit":350,"totalPerUnit":1000,"unit":"EA"}',
   '{"installRate":3,"crewSize":1,"leadTimeDays":14}',
   '{"color":"#FFFFFF","roughness":0.2,"metalness":0.1,"pattern":"porcelain","patternScale":1}',
   '{"layers":[{"name":"Toilet + Flush Valve","thickness":0}],"rValue":0,"fireRating":"","stc":0}'),

  ('commercial-lavatory', 'Wall-Mount Lavatory w/ Faucet', 'Kohler', 'plumbing-fixture', '22 41 13', 'Plumbing Fixture - Lavatory',
   '{"materialPerUnit":450,"laborPerUnit":280,"totalPerUnit":730,"unit":"EA"}',
   '{"installRate":3,"crewSize":1,"leadTimeDays":14}',
   '{"color":"#FFFFFF","roughness":0.2,"metalness":0.1,"pattern":"porcelain","patternScale":1}',
   '{"layers":[{"name":"Lavatory + Faucet + Trap","thickness":0}],"rValue":0,"fireRating":"","stc":0}'),

  -- Concrete & Masonry
  ('cast-concrete-wall', 'Cast-in-Place Concrete Wall 8"', 'N/A', 'concrete', '03 30 00', 'Cast-in-Place Concrete',
   '{"materialPerUnit":12,"laborPerUnit":18,"totalPerUnit":30,"unit":"SF"}',
   '{"installRate":50,"crewSize":6,"leadTimeDays":5}',
   '{"color":"#BCBCBC","roughness":0.95,"metalness":0,"pattern":"smooth","patternScale":1}',
   '{"layers":[{"name":"8\" Cast Concrete","thickness":8}],"rValue":2,"fireRating":"4-HR","stc":55}'),

  ('cmu-12-grouted', 'CMU 12" Grouted & Reinforced', 'Various', 'concrete', '04 22 00', 'Concrete Masonry Unit Grouted',
   '{"materialPerUnit":9,"laborPerUnit":13,"totalPerUnit":22,"unit":"SF"}',
   '{"installRate":80,"crewSize":4,"leadTimeDays":10}',
   '{"color":"#A0A0A0","roughness":0.9,"metalness":0,"pattern":"block","patternScale":8}',
   '{"layers":[{"name":"12\" CMU Grouted","thickness":11.625}],"rValue":3,"fireRating":"4-HR","stc":55}')

ON CONFLICT (slug) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Helper function: update timestamp on modification
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_material_assignments_updated
  BEFORE UPDATE ON model_material_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_core_stats_updated
  BEFORE UPDATE ON core_material_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_material_catalog_updated
  BEFORE UPDATE ON material_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
