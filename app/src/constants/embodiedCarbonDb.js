// ─────────────────────────────────────────────────────────────────────────────
// Embodied Carbon Database — NOVATerra
// Maps construction materials to embodied carbon values (kg CO2e per unit).
// Primary source: ICE Database v4.1 (Inventory of Carbon & Energy, Univ. of Bath)
// Secondary sources: CLF Material Baselines, EPD averages, WBLCA studies
//
// Units match the SEED_ELEMENTS / MASTER_COST_DB unit conventions.
// All values represent cradle-to-gate (A1–A3) unless noted otherwise.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 1. CARBON_FACTORS
//    Keyed by CSI code prefix, with sub-entries for specific materials.
//    kgCO2ePerUnit = kg CO2e per unit used in the cost database
//    unit          = matching unit from the cost database
//    source        = 'ice' (ICE Database v4.1) or 'epd' (Environmental Product Declaration)
//    confidence    = 'high' | 'medium' | 'low'
//    notes         = brief description
// ─────────────────────────────────────────────────────────────────────────────

export const CARBON_FACTORS = {

  // ── 03 Concrete ───────────────────────────────────────────────────────────

  "03.110": {
    name: "Formwork & Accessories",
    items: [
      { id: "cf-03110-01", name: "Formwork, Wall (plywood component)", kgCO2ePerUnit: 1.15, unit: "SFCA", source: "ice", confidence: "medium", notes: "Plywood + nails; ~0.45 kg CO2e/kg plywood, assumes 2.5 kg/SFCA avg material" },
      { id: "cf-03110-02", name: "Formwork, Footing (plywood component)", kgCO2ePerUnit: 0.90, unit: "SFCA", source: "ice", confidence: "medium", notes: "Less material per SFCA than wall forms" },
      { id: "cf-03110-03", name: "Formwork, Prefab Metal Panel", kgCO2ePerUnit: 0.60, unit: "SFCA", source: "ice", confidence: "medium", notes: "Amortized over multiple reuses; steel panel ~1.46 kg CO2e/kg" },
      { id: "cf-03110-04", name: "ICF Block, Flat Wall 8\" Core", kgCO2ePerUnit: 4.20, unit: "SF", source: "ice", confidence: "medium", notes: "EPS foam ~3.29 kg CO2e/kg; ~1.3 kg EPS per SF" },
    ],
  },

  "03.150": {
    name: "Concrete Accessories",
    items: [
      { id: "cf-03150-01", name: "Anchor Bolts & Embeds", kgCO2ePerUnit: 2.80, unit: "EA", source: "ice", confidence: "medium", notes: "Steel ~1.46 kg CO2e/kg; avg anchor bolt ~1.9 kg" },
      { id: "cf-03150-02", name: "Tilt-Up Embed Plates & Inserts", kgCO2ePerUnit: 1.60, unit: "SF", source: "ice", confidence: "low", notes: "Distributed steel embeds across panel area" },
    ],
  },

  "03.210": {
    name: "Reinforcing Steel",
    items: [
      { id: "cf-03210-01", name: "Rebar, #4 Grade 60", kgCO2ePerUnit: 0.72, unit: "LB", source: "ice", confidence: "high", notes: "Steel rebar 1.58 kg CO2e/kg (ICE v4.1 with recycled content)" },
      { id: "cf-03210-02", name: "Rebar, #5 Grade 60", kgCO2ePerUnit: 0.72, unit: "LB", source: "ice", confidence: "high", notes: "Same CO2e/lb as #4" },
      { id: "cf-03210-03", name: "Rebar, #6 Grade 60", kgCO2ePerUnit: 0.72, unit: "LB", source: "ice", confidence: "high", notes: "Same CO2e/lb as #4" },
    ],
  },

  "03.220": {
    name: "Welded Wire Fabric",
    items: [
      { id: "cf-03220-01", name: "Welded Wire Mesh, 6x6 W1.4", kgCO2ePerUnit: 0.34, unit: "SF", source: "ice", confidence: "high", notes: "~0.22 kg steel/SF; steel wire 1.55 kg CO2e/kg" },
    ],
  },

  "03.310": {
    name: "Structural Concrete (Ready Mix)",
    items: [
      { id: "cf-03310-01", name: "Concrete, Ready Mix, 3000 PSI", kgCO2ePerUnit: 235.0, unit: "CY", source: "ice", confidence: "high", notes: "~0.13 kg CO2e/kg; ~1810 kg/CY; lower cement content" },
      { id: "cf-03310-02", name: "Concrete, Ready Mix, 4000 PSI", kgCO2ePerUnit: 270.0, unit: "CY", source: "ice", confidence: "high", notes: "~0.15 kg CO2e/kg; ~1810 kg/CY; typical structural mix" },
      { id: "cf-03310-03", name: "Concrete, Ready Mix, 5000 PSI", kgCO2ePerUnit: 320.0, unit: "CY", source: "ice", confidence: "high", notes: "~0.18 kg CO2e/kg; higher cement content" },
      { id: "cf-03310-04", name: "Concrete, Ready Mix, 6000 PSI", kgCO2ePerUnit: 370.0, unit: "CY", source: "ice", confidence: "high", notes: "~0.20 kg CO2e/kg; high-strength mix" },
      { id: "cf-03310-05", name: "Lightweight Concrete Topping", kgCO2ePerUnit: 295.0, unit: "CY", source: "ice", confidence: "medium", notes: "LW aggregate partially offsets higher cement ratio" },
      { id: "cf-03310-06", name: "Tilt-Up Panel Concrete, 5-1/2\"", kgCO2ePerUnit: 28.0, unit: "SF", source: "ice", confidence: "medium", notes: "~0.46 CY/10SF at 5.5\" thick" },
      { id: "cf-03310-07", name: "3D Print Concrete Mix (Proprietary)", kgCO2ePerUnit: 2.40, unit: "CF", source: "epd", confidence: "low", notes: "Proprietary mixes vary widely; ~0.14 kg CO2e/kg" },
    ],
  },

  "03.350": {
    name: "Concrete Finishing",
    items: [
      { id: "cf-03350-01", name: "Concrete Finishing, Broom", kgCO2ePerUnit: 0.02, unit: "SF", source: "ice", confidence: "medium", notes: "Minimal material — mostly labor; small curing compound" },
      { id: "cf-03350-02", name: "Concrete Finishing, Trowel", kgCO2ePerUnit: 0.01, unit: "SF", source: "ice", confidence: "medium", notes: "Negligible embodied carbon — labor-dominant" },
      { id: "cf-03350-03", name: "Polished Concrete Floor", kgCO2ePerUnit: 0.08, unit: "SF", source: "ice", confidence: "medium", notes: "Densifier + polish compound" },
    ],
  },

  "03.390": {
    name: "Concrete Curing",
    items: [
      { id: "cf-03390-01", name: "Concrete Curing Compound", kgCO2ePerUnit: 0.06, unit: "SF", source: "ice", confidence: "medium", notes: "Resin-based compound; low application rate" },
    ],
  },

  "03.400": {
    name: "Precast Concrete",
    items: [
      { id: "cf-03400-01", name: "Precast Hollow Core Plank, 6\"", kgCO2ePerUnit: 18.5, unit: "SF", source: "epd", confidence: "high", notes: "Industry EPD avg; includes prestress strand" },
      { id: "cf-03400-02", name: "Precast Hollow Core Plank, 8\"", kgCO2ePerUnit: 23.0, unit: "SF", source: "epd", confidence: "high", notes: "Thicker section, more concrete & strand" },
      { id: "cf-03400-03", name: "Precast Hollow Core Plank, 10\"", kgCO2ePerUnit: 27.5, unit: "SF", source: "epd", confidence: "high", notes: "Heavy plank for longer spans" },
      { id: "cf-03400-04", name: "Precast Hollow Core Plank, 12\"", kgCO2ePerUnit: 32.0, unit: "SF", source: "epd", confidence: "medium", notes: "Maximum depth plank" },
      { id: "cf-03400-05", name: "Precast Wall Panel, Flat 6\"", kgCO2ePerUnit: 32.0, unit: "SF", source: "epd", confidence: "medium", notes: "Solid precast wall; ~145 PCF concrete" },
      { id: "cf-03400-06", name: "Precast Wall Panel, Insulated Sandwich", kgCO2ePerUnit: 38.0, unit: "SF", source: "epd", confidence: "medium", notes: "Two wythes + rigid insulation core" },
      { id: "cf-03400-07", name: "Precast Wall Panel, Architectural", kgCO2ePerUnit: 42.0, unit: "SF", source: "epd", confidence: "medium", notes: "Architectural finish adds ~10% over flat panel" },
    ],
  },

  // ── 04 Masonry ──────────────────────────────────────────────────────────────

  "04.210": {
    name: "Concrete Unit Masonry",
    items: [
      { id: "cf-04210-01", name: "CMU Block, 8x8x16 Standard", kgCO2ePerUnit: 3.85, unit: "SF", source: "ice", confidence: "high", notes: "Normal weight CMU ~0.12 kg CO2e/kg; ~32 kg/SF wall area" },
      { id: "cf-04210-02", name: "CMU Block, 8x8x16 Lightweight", kgCO2ePerUnit: 3.20, unit: "SF", source: "ice", confidence: "high", notes: "Lighter blocks, less cement" },
      { id: "cf-04210-03", name: "CMU Block, 6x8x16 Standard", kgCO2ePerUnit: 3.00, unit: "SF", source: "ice", confidence: "high", notes: "Thinner wall, less material per SF" },
      { id: "cf-04210-04", name: "CMU Block, 12x8x16 Standard", kgCO2ePerUnit: 5.10, unit: "SF", source: "ice", confidence: "high", notes: "Heavy block, higher cement content" },
      { id: "cf-04210-05", name: "CMU Block, 8x8x16 Split-Face", kgCO2ePerUnit: 4.20, unit: "SF", source: "ice", confidence: "medium", notes: "Decorative face adds ~10% to standard" },
    ],
  },

  "04.220": {
    name: "Clay Unit Masonry (Brick)",
    items: [
      { id: "cf-04220-01", name: "Face Brick, Modular", kgCO2ePerUnit: 6.80, unit: "SF", source: "ice", confidence: "high", notes: "Clay brick 0.24 kg CO2e/kg (ICE); ~6.5 bricks/SF, mortar included" },
      { id: "cf-04220-02", name: "Face Brick, King Size", kgCO2ePerUnit: 5.90, unit: "SF", source: "ice", confidence: "high", notes: "Fewer units per SF due to larger size" },
    ],
  },

  "04.050": {
    name: "Masonry Mortar & Grout",
    items: [
      { id: "cf-04050-01", name: "Mortar, Type S", kgCO2ePerUnit: 0.22, unit: "SF", source: "ice", confidence: "high", notes: "~0.20 kg CO2e/kg mortar; ~1.1 kg mortar/SF wall" },
      { id: "cf-04050-02", name: "Grout, CMU Cells (Solid)", kgCO2ePerUnit: 195.0, unit: "CY", source: "ice", confidence: "high", notes: "Cementitious grout similar to concrete" },
    ],
  },

  "04.720": {
    name: "Stone Veneer",
    items: [
      { id: "cf-04720-01", name: "Natural Stone Veneer", kgCO2ePerUnit: 1.80, unit: "SF", source: "ice", confidence: "medium", notes: "Quarried stone ~0.06 kg CO2e/kg; ~30 kg/SF thin veneer + mortar" },
      { id: "cf-04720-02", name: "Manufactured Stone Veneer", kgCO2ePerUnit: 3.50, unit: "SF", source: "ice", confidence: "medium", notes: "Portland cement-based, higher carbon than natural stone" },
    ],
  },

  // ── 05 Metals ───────────────────────────────────────────────────────────────

  "05.110": {
    name: "Structural Steel",
    items: [
      { id: "cf-05110-01", name: "Structural Steel, Beams (W-shapes)", kgCO2ePerUnit: 1320.0, unit: "TON", source: "ice", confidence: "high", notes: "Steel section 1.46 kg CO2e/kg (ICE v4.1, world avg EAF/BOF); 907 kg/TON" },
      { id: "cf-05110-02", name: "Structural Steel, Columns (W-shapes)", kgCO2ePerUnit: 1320.0, unit: "TON", source: "ice", confidence: "high", notes: "Same factor as beams" },
      { id: "cf-05110-03", name: "Structural Steel, Misc (Angles, Plates)", kgCO2ePerUnit: 1450.0, unit: "TON", source: "ice", confidence: "medium", notes: "More fabrication processing adds ~10%" },
    ],
  },

  "05.120": {
    name: "Structural Steel Misc",
    items: [
      { id: "cf-05120-01", name: "Steel Lintels & Shelf Angles", kgCO2ePerUnit: 1.46, unit: "LB", source: "ice", confidence: "high", notes: "1.46 kg CO2e/kg = 0.66 kg CO2e/lb" },
    ],
  },

  "05.210": {
    name: "Steel Bar Joists",
    items: [
      { id: "cf-05210-01", name: "Steel Bar Joists, 18K Series", kgCO2ePerUnit: 5.80, unit: "LF", source: "ice", confidence: "high", notes: "~4 kg steel/LF; 1.46 kg CO2e/kg" },
    ],
  },

  "05.310": {
    name: "Steel Deck",
    items: [
      { id: "cf-05310-01", name: "Steel Deck, 1.5\" Type B, 20 ga", kgCO2ePerUnit: 3.65, unit: "SF", source: "ice", confidence: "high", notes: "~2.5 kg/SF (20ga); 1.46 kg CO2e/kg" },
      { id: "cf-05310-02", name: "Steel Deck, 3\" Composite, 20 ga", kgCO2ePerUnit: 4.85, unit: "SF", source: "ice", confidence: "high", notes: "~3.3 kg/SF deeper profile + embossments" },
      { id: "cf-05310-03", name: "Steel Deck, 1.5\" B Deck 22ga", kgCO2ePerUnit: 3.10, unit: "SF", source: "ice", confidence: "high", notes: "Lighter gauge ~2.1 kg/SF" },
      { id: "cf-05310-04", name: "Shear Studs, 3/4\" x 3\"", kgCO2ePerUnit: 0.22, unit: "EA", source: "ice", confidence: "high", notes: "~0.15 kg steel per stud" },
    ],
  },

  "05.400": {
    name: "Cold-Formed Metal Framing",
    items: [
      // Drywall / Non-Structural (20ga)
      { id: "cf-05400-01", name: "Metal Stud, 3-5/8\" 20ga (Drywall)", kgCO2ePerUnit: 0.42, unit: "LF", source: "ice", confidence: "high", notes: "~0.29 kg steel/LF; 1.46 kg CO2e/kg" },
      { id: "cf-05400-02", name: "Metal Stud, 6\" 20ga (Drywall)", kgCO2ePerUnit: 0.63, unit: "LF", source: "ice", confidence: "high", notes: "~0.43 kg steel/LF" },
      // Drywall / Non-Structural (25ga)
      { id: "cf-05400-03", name: "Metal Stud, 3-5/8\" 25ga (Drywall)", kgCO2ePerUnit: 0.34, unit: "LF", source: "ice", confidence: "high", notes: "~0.23 kg steel/LF; lighter gauge" },
      { id: "cf-05400-04", name: "Metal Stud, 6\" 25ga (Drywall)", kgCO2ePerUnit: 0.51, unit: "LF", source: "ice", confidence: "high", notes: "~0.35 kg steel/LF" },
      // Structural (18ga)
      { id: "cf-05400-05", name: "Metal Stud, 3-5/8\" 18ga (Structural)", kgCO2ePerUnit: 0.88, unit: "LF", source: "ice", confidence: "high", notes: "~0.60 kg steel/LF" },
      { id: "cf-05400-06", name: "Metal Stud, 6\" 18ga (Structural)", kgCO2ePerUnit: 1.17, unit: "LF", source: "ice", confidence: "high", notes: "~0.80 kg steel/LF" },
      { id: "cf-05400-07", name: "Metal Stud, 8\" 18ga (Structural)", kgCO2ePerUnit: 1.39, unit: "LF", source: "ice", confidence: "high", notes: "~0.95 kg steel/LF" },
      // Structural (16ga)
      { id: "cf-05400-08", name: "Metal Stud, 3-5/8\" 16ga (Structural)", kgCO2ePerUnit: 1.10, unit: "LF", source: "ice", confidence: "high", notes: "~0.75 kg steel/LF" },
      { id: "cf-05400-09", name: "Metal Stud, 6\" 16ga (Structural)", kgCO2ePerUnit: 1.46, unit: "LF", source: "ice", confidence: "high", notes: "~1.0 kg steel/LF" },
      { id: "cf-05400-10", name: "Metal Stud, 8\" 16ga (Structural)", kgCO2ePerUnit: 1.75, unit: "LF", source: "ice", confidence: "high", notes: "~1.2 kg steel/LF" },
      // Structural (14ga)
      { id: "cf-05400-11", name: "Metal Stud, 3-5/8\" 14ga (Structural)", kgCO2ePerUnit: 1.39, unit: "LF", source: "ice", confidence: "high", notes: "~0.95 kg steel/LF" },
      { id: "cf-05400-12", name: "Metal Stud, 6\" 14ga (Structural)", kgCO2ePerUnit: 1.82, unit: "LF", source: "ice", confidence: "high", notes: "~1.25 kg steel/LF" },
      { id: "cf-05400-13", name: "Metal Stud, 8\" 14ga (Structural)", kgCO2ePerUnit: 2.19, unit: "LF", source: "ice", confidence: "high", notes: "~1.5 kg steel/LF" },
      // Structural (12ga — Heavy)
      { id: "cf-05400-14", name: "Metal Stud, 6\" 12ga (Structural)", kgCO2ePerUnit: 2.55, unit: "LF", source: "ice", confidence: "high", notes: "~1.75 kg steel/LF" },
      { id: "cf-05400-15", name: "Metal Stud, 8\" 12ga (Structural)", kgCO2ePerUnit: 3.07, unit: "LF", source: "ice", confidence: "high", notes: "~2.1 kg steel/LF" },
      // Composite wall assemblies (per SF of wall)
      { id: "cf-05400-16", name: "Metal Stud Wall, 3-5/8\" 20ga 16\" o.c.", kgCO2ePerUnit: 1.05, unit: "SF", source: "ice", confidence: "medium", notes: "Studs + track distributed per SF of wall" },
      { id: "cf-05400-17", name: "Metal Stud Wall, 6\" 20ga 16\" o.c.", kgCO2ePerUnit: 1.55, unit: "SF", source: "ice", confidence: "medium", notes: "Wider studs, same spacing" },
      { id: "cf-05400-18", name: "Metal Stud Wall, 6\" 16ga 16\" o.c. (structural)", kgCO2ePerUnit: 3.60, unit: "SF", source: "ice", confidence: "medium", notes: "Heavy structural wall assembly" },
      // Accessories
      { id: "cf-05400-19", name: "Metal Furring Channel, 7/8\" Hat (25ga)", kgCO2ePerUnit: 0.16, unit: "LF", source: "ice", confidence: "high", notes: "~0.11 kg steel/LF" },
      { id: "cf-05400-20", name: "Metal Resilient Channel (RC-1)", kgCO2ePerUnit: 0.22, unit: "LF", source: "ice", confidence: "high", notes: "~0.15 kg steel/LF" },
      { id: "cf-05400-21", name: "Metal Corner Bead", kgCO2ePerUnit: 0.18, unit: "LF", source: "ice", confidence: "high", notes: "~0.12 kg steel/LF" },
    ],
  },

  "05.500": {
    name: "Metal Fabrications",
    items: [
      { id: "cf-05500-01", name: "Metal Fabrications, Misc (Lintels, Angles, Plates)", kgCO2ePerUnit: 0.66, unit: "LB", source: "ice", confidence: "high", notes: "Fabricated steel 1.46 kg CO2e/kg = 0.66 kg CO2e/lb" },
    ],
  },

  "05.510": {
    name: "Metal Stairs",
    items: [
      { id: "cf-05510-01", name: "Metal Stairs, Steel Pan w/ Concrete Fill", kgCO2ePerUnit: 2200.0, unit: "FLT", source: "ice", confidence: "medium", notes: "~1000 kg steel + 0.5 CY concrete per flight" },
    ],
  },

  "05.520": {
    name: "Metal Railings",
    items: [
      { id: "cf-05520-01", name: "Metal Railings, Steel Pipe", kgCO2ePerUnit: 14.6, unit: "LF", source: "ice", confidence: "medium", notes: "~10 kg steel/LF typical railing assembly" },
    ],
  },

  "05.530": {
    name: "Steel Grating",
    items: [
      { id: "cf-05530-01", name: "Steel Grating, Bar Type", kgCO2ePerUnit: 29.2, unit: "SF", source: "ice", confidence: "medium", notes: "~20 kg/SF bar grating; 1.46 kg CO2e/kg" },
    ],
  },

  // ── 06 Wood, Plastics & Composites ──────────────────────────────────────────

  "06.110": {
    name: "Wood Framing",
    items: [
      { id: "cf-06110-01", name: "2x4 Stud, SPF #2, 8'", kgCO2ePerUnit: 1.20, unit: "EA", source: "ice", confidence: "high", notes: "Softwood lumber 0.45 kg CO2e/kg; ~2.7 kg per 8' stud" },
      { id: "cf-06110-02", name: "2x4 Framing Lumber, SPF #2", kgCO2ePerUnit: 0.15, unit: "LF", source: "ice", confidence: "high", notes: "~0.34 kg/LF; 0.45 kg CO2e/kg" },
      { id: "cf-06110-03", name: "2x6 Framing Lumber, SPF #2", kgCO2ePerUnit: 0.23, unit: "LF", source: "ice", confidence: "high", notes: "~0.51 kg/LF" },
      { id: "cf-06110-04", name: "2x8 Framing Lumber, #2", kgCO2ePerUnit: 0.30, unit: "LF", source: "ice", confidence: "high", notes: "~0.68 kg/LF" },
      { id: "cf-06110-05", name: "2x10 Framing Lumber, #2", kgCO2ePerUnit: 0.38, unit: "LF", source: "ice", confidence: "high", notes: "~0.85 kg/LF" },
      { id: "cf-06110-06", name: "2x12 Framing Lumber, #2", kgCO2ePerUnit: 0.46, unit: "LF", source: "ice", confidence: "high", notes: "~1.02 kg/LF" },
      { id: "cf-06110-07", name: "2x4 Pressure Treated", kgCO2ePerUnit: 0.20, unit: "LF", source: "ice", confidence: "medium", notes: "Treated lumber ~0.59 kg CO2e/kg; treatment adds ~30%" },
      { id: "cf-06110-08", name: "2x6 Pressure Treated", kgCO2ePerUnit: 0.30, unit: "LF", source: "ice", confidence: "medium", notes: "Treated lumber ~0.59 kg CO2e/kg" },
      { id: "cf-06110-09", name: "2x4 Wall Framing, 16\" o.c. (per SF wall)", kgCO2ePerUnit: 0.65, unit: "SF", source: "ice", confidence: "medium", notes: "Studs + plates distributed per SF" },
      { id: "cf-06110-10", name: "2x6 Wall Framing, 16\" o.c. (per SF wall)", kgCO2ePerUnit: 0.95, unit: "SF", source: "ice", confidence: "medium", notes: "Studs + plates distributed per SF" },
      { id: "cf-06110-11", name: "Floor Framing, 2x10 16\" o.c.", kgCO2ePerUnit: 0.80, unit: "SF", source: "ice", confidence: "medium", notes: "Joists + bridging per SF" },
      { id: "cf-06110-12", name: "Floor Framing, 2x12 16\" o.c.", kgCO2ePerUnit: 0.95, unit: "SF", source: "ice", confidence: "medium", notes: "Joists + bridging per SF" },
      { id: "cf-06110-13", name: "Simpson Joist Hanger (typical)", kgCO2ePerUnit: 0.44, unit: "EA", source: "ice", confidence: "medium", notes: "~0.3 kg galvanized steel; 1.46 kg CO2e/kg" },
      { id: "cf-06110-14", name: "Hold-Down / Anchor Hardware", kgCO2ePerUnit: 2.92, unit: "EA", source: "ice", confidence: "medium", notes: "~2 kg steel hardware per unit" },
    ],
  },

  "06.120": {
    name: "Structural Panels (Plywood/OSB)",
    items: [
      { id: "cf-06120-01", name: "Plywood Sheathing, 1/2\" CDX", kgCO2ePerUnit: 1.85, unit: "SF", source: "ice", confidence: "high", notes: "Plywood 0.45 kg CO2e/kg; ~4.1 kg per 1/2\" SF" },
      { id: "cf-06120-02", name: "Plywood Sheathing, 3/4\" CDX (Subfloor)", kgCO2ePerUnit: 2.75, unit: "SF", source: "ice", confidence: "high", notes: "~6.1 kg per 3/4\" SF" },
      { id: "cf-06120-03", name: "OSB Sheathing, 7/16\"", kgCO2ePerUnit: 1.50, unit: "SF", source: "ice", confidence: "high", notes: "OSB 0.45 kg CO2e/kg; ~3.3 kg per 7/16\" SF" },
      { id: "cf-06120-04", name: "SIP Wall Panel, 6-1/2\" (R-24)", kgCO2ePerUnit: 5.80, unit: "SF", source: "ice", confidence: "medium", notes: "OSB skins + EPS core" },
    ],
  },

  "06.150": {
    name: "Wood Decking",
    items: [
      { id: "cf-06150-01", name: "Wood Decking, 5/4x6 PT", kgCO2ePerUnit: 1.55, unit: "SF", source: "ice", confidence: "medium", notes: "Treated softwood ~0.59 kg CO2e/kg; ~2.6 kg/SF" },
      { id: "cf-06150-02", name: "Composite Decking (Trex-type)", kgCO2ePerUnit: 3.80, unit: "SF", source: "epd", confidence: "medium", notes: "HDPE + wood fiber composite; higher carbon than natural wood" },
    ],
  },

  "06.170": {
    name: "Prefabricated Structural Wood",
    items: [
      { id: "cf-06170-01", name: "Prefab Roof Trusses", kgCO2ePerUnit: 1.35, unit: "SF", source: "ice", confidence: "medium", notes: "Truss lumber + connector plates per SF of plan area" },
      { id: "cf-06170-02", name: "Prefab Floor Trusses", kgCO2ePerUnit: 1.55, unit: "SF", source: "ice", confidence: "medium", notes: "More lumber per SF than roof trusses" },
      { id: "cf-06170-03", name: "CLT Floor Panel, 3-ply 4-1/8\"", kgCO2ePerUnit: 5.40, unit: "SF", source: "epd", confidence: "high", notes: "CLT industry EPD; biogenic carbon not credited per ICE" },
      { id: "cf-06170-04", name: "CLT Floor Panel, 5-ply 6-7/8\"", kgCO2ePerUnit: 9.00, unit: "SF", source: "epd", confidence: "high", notes: "Thicker panel, more wood + adhesive" },
      { id: "cf-06170-05", name: "CLT Floor Panel, 7-ply 9-5/8\"", kgCO2ePerUnit: 12.60, unit: "SF", source: "epd", confidence: "high", notes: "Heavy timber floor panel" },
    ],
  },

  "06.180": {
    name: "Glued-Laminated Construction",
    items: [
      { id: "cf-06180-01", name: "Glulam Beam, 3-1/8\" x 12\"", kgCO2ePerUnit: 3.60, unit: "LF", source: "ice", confidence: "high", notes: "Glulam 0.51 kg CO2e/kg (ICE); ~7 kg/LF" },
    ],
  },

  "06.190": {
    name: "Engineered Wood Products",
    items: [
      { id: "cf-06190-01", name: "LVL Beam, 1-3/4\" x 11-7/8\"", kgCO2ePerUnit: 2.10, unit: "LF", source: "ice", confidence: "high", notes: "LVL 0.45 kg CO2e/kg; ~4.7 kg/LF" },
      { id: "cf-06190-02", name: "LVL Beam, 1-3/4\" x 14\"", kgCO2ePerUnit: 2.50, unit: "LF", source: "ice", confidence: "high", notes: "~5.5 kg/LF" },
      { id: "cf-06190-03", name: "Engineered I-Joist, 9-1/2\"", kgCO2ePerUnit: 0.72, unit: "LF", source: "ice", confidence: "high", notes: "I-joist ~0.40 kg CO2e/kg; ~1.8 kg/LF" },
      { id: "cf-06190-04", name: "Engineered I-Joist, 11-7/8\"", kgCO2ePerUnit: 0.90, unit: "LF", source: "ice", confidence: "high", notes: "~2.25 kg/LF" },
      { id: "cf-06190-05", name: "Engineered I-Joist, 14\"", kgCO2ePerUnit: 1.08, unit: "LF", source: "ice", confidence: "high", notes: "~2.7 kg/LF" },
    ],
  },

  "06.200": {
    name: "Finish Carpentry & Millwork",
    items: [
      { id: "cf-06200-01", name: "Base Trim, MDF Primed 3-1/4\"", kgCO2ePerUnit: 0.25, unit: "LF", source: "ice", confidence: "medium", notes: "MDF 0.39 kg CO2e/kg; ~0.64 kg/LF" },
      { id: "cf-06200-02", name: "Base Trim, Pine 3-1/4\"", kgCO2ePerUnit: 0.18, unit: "LF", source: "ice", confidence: "medium", notes: "Softwood trim ~0.45 kg CO2e/kg; ~0.4 kg/LF" },
      { id: "cf-06200-03", name: "Base Trim, Oak 3-1/4\"", kgCO2ePerUnit: 0.30, unit: "LF", source: "ice", confidence: "medium", notes: "Hardwood ~0.47 kg CO2e/kg; ~0.64 kg/LF" },
      { id: "cf-06200-04", name: "Crown Molding, MDF Primed 3-5/8\"", kgCO2ePerUnit: 0.28, unit: "LF", source: "ice", confidence: "medium", notes: "Larger MDF profile" },
    ],
  },

  "06.410": {
    name: "Casework / Cabinets",
    items: [
      { id: "cf-06410-01", name: "Kitchen Cabinets, Mid-Grade (installed)", kgCO2ePerUnit: 22.0, unit: "LF", source: "ice", confidence: "low", notes: "Particleboard + veneer; ~40 kg wood products/LF" },
      { id: "cf-06410-02", name: "Kitchen Cabinets, High-End Custom", kgCO2ePerUnit: 38.0, unit: "LF", source: "ice", confidence: "low", notes: "Hardwood + plywood; more material per LF" },
      { id: "cf-06410-03", name: "Bathroom Vanity Cabinet", kgCO2ePerUnit: 18.0, unit: "LF", source: "ice", confidence: "low", notes: "Smaller section than kitchen uppers + lowers" },
    ],
  },

  "06.400": {
    name: "Countertops",
    items: [
      { id: "cf-06400-01", name: "Countertop, Granite (installed)", kgCO2ePerUnit: 4.50, unit: "SF", source: "ice", confidence: "medium", notes: "Granite ~0.70 kg CO2e/kg; ~6.4 kg/SF at 3cm" },
      { id: "cf-06400-02", name: "Countertop, Quartz (installed)", kgCO2ePerUnit: 5.80, unit: "SF", source: "epd", confidence: "medium", notes: "Engineered quartz ~0.90 kg CO2e/kg; ~6.4 kg/SF at 3cm" },
      { id: "cf-06400-03", name: "Countertop, Laminate (installed)", kgCO2ePerUnit: 2.20, unit: "SF", source: "ice", confidence: "medium", notes: "Particleboard substrate + laminate face" },
    ],
  },

  // ── 07 Thermal & Moisture Protection ────────────────────────────────────────

  "07.110": {
    name: "Dampproofing",
    items: [
      { id: "cf-07110-01", name: "Dampproofing, Spray Applied", kgCO2ePerUnit: 0.35, unit: "SF", source: "ice", confidence: "medium", notes: "Bituminous coating ~0.48 kg CO2e/kg; ~0.7 kg/SF" },
    ],
  },

  "07.120": {
    name: "Below-Grade Waterproofing",
    items: [
      { id: "cf-07120-01", name: "Below-Grade Waterproofing, Membrane", kgCO2ePerUnit: 1.80, unit: "SF", source: "ice", confidence: "medium", notes: "Modified bitumen sheet ~1.3 kg CO2e/kg; ~1.4 kg/SF" },
    ],
  },

  "07.190": {
    name: "Vapor Retarders",
    items: [
      { id: "cf-07190-01", name: "Vapor Barrier, 6 mil Poly", kgCO2ePerUnit: 0.12, unit: "SF", source: "ice", confidence: "high", notes: "Polyethylene film 2.54 kg CO2e/kg; ~0.047 kg/SF" },
    ],
  },

  "07.210": {
    name: "Building Insulation",
    items: [
      // Rigid Board
      { id: "cf-07210-01", name: "Rigid Insulation, XPS 1\"", kgCO2ePerUnit: 2.80, unit: "SF", source: "ice", confidence: "high", notes: "XPS 7.34 kg CO2e/kg (ICE, incl. blowing agent GWP); ~0.38 kg/SF at 1\"" },
      { id: "cf-07210-02", name: "Rigid Insulation, XPS 2\"", kgCO2ePerUnit: 5.60, unit: "SF", source: "ice", confidence: "high", notes: "Double thickness" },
      { id: "cf-07210-03", name: "Rigid Insulation, XPS 3\"", kgCO2ePerUnit: 8.40, unit: "SF", source: "ice", confidence: "high", notes: "Triple thickness" },
      { id: "cf-07210-04", name: "Rigid Insulation, EPS 1\"", kgCO2ePerUnit: 0.90, unit: "SF", source: "ice", confidence: "high", notes: "EPS 3.29 kg CO2e/kg (ICE); ~0.27 kg/SF at 1\"" },
      { id: "cf-07210-05", name: "Rigid Insulation, EPS 2\"", kgCO2ePerUnit: 1.80, unit: "SF", source: "ice", confidence: "high", notes: "Double thickness" },
      { id: "cf-07210-06", name: "Rigid Insulation, Polyiso 1\"", kgCO2ePerUnit: 1.50, unit: "SF", source: "ice", confidence: "high", notes: "Polyiso 4.24 kg CO2e/kg; ~0.35 kg/SF at 1\"" },
      { id: "cf-07210-07", name: "Rigid Insulation, Polyiso 2\"", kgCO2ePerUnit: 3.00, unit: "SF", source: "ice", confidence: "high", notes: "Double thickness" },
      { id: "cf-07210-08", name: "Rockwool Comfort Board, 2\" (R-8)", kgCO2ePerUnit: 0.68, unit: "SF", source: "ice", confidence: "high", notes: "Mineral wool 1.20 kg CO2e/kg; ~0.57 kg/SF at 2\"" },
      // Batt Insulation (fiberglass)
      { id: "cf-07210-09", name: "Batt Insulation, R-11 (Sound Control)", kgCO2ePerUnit: 0.28, unit: "SF", source: "ice", confidence: "high", notes: "Fiberglass 1.35 kg CO2e/kg; ~0.21 kg/SF" },
      { id: "cf-07210-10", name: "Batt Insulation, R-13 (2x4 wall)", kgCO2ePerUnit: 0.34, unit: "SF", source: "ice", confidence: "high", notes: "~0.25 kg/SF at 3.5\" thick" },
      { id: "cf-07210-11", name: "Batt Insulation, R-19 (2x6 wall)", kgCO2ePerUnit: 0.49, unit: "SF", source: "ice", confidence: "high", notes: "~0.36 kg/SF at 6.25\" thick" },
      { id: "cf-07210-12", name: "Batt Insulation, R-30 (attic)", kgCO2ePerUnit: 0.78, unit: "SF", source: "ice", confidence: "high", notes: "~0.58 kg/SF at 10\" thick" },
      { id: "cf-07210-13", name: "Batt Insulation, R-38 (attic)", kgCO2ePerUnit: 0.97, unit: "SF", source: "ice", confidence: "high", notes: "~0.72 kg/SF at 12\" thick" },
      { id: "cf-07210-14", name: "Batt Insulation, R-49 (13\" thick)", kgCO2ePerUnit: 1.22, unit: "SF", source: "ice", confidence: "high", notes: "~0.90 kg/SF" },
      // Spray Foam
      { id: "cf-07210-15", name: "Spray Foam, Closed-Cell (per inch)", kgCO2ePerUnit: 1.95, unit: "SF", source: "ice", confidence: "medium", notes: "Polyurethane SPF closed-cell ~3.48 kg CO2e/kg; ~0.56 kg/SF per inch" },
      { id: "cf-07210-16", name: "Spray Foam, R-21 Closed-Cell (3\")", kgCO2ePerUnit: 5.85, unit: "SF", source: "ice", confidence: "medium", notes: "3 inches of closed-cell SPF" },
      { id: "cf-07210-17", name: "Spray Foam, R-38 Open-Cell (5.5\")", kgCO2ePerUnit: 2.40, unit: "SF", source: "ice", confidence: "medium", notes: "Open-cell is lighter; ~1.38 kg CO2e/kg; ~1.74 kg/SF" },
      // Blown-In
      { id: "cf-07210-18", name: "Blown-In Insulation, R-38", kgCO2ePerUnit: 0.62, unit: "SF", source: "ice", confidence: "medium", notes: "Cellulose ~0.18 kg CO2e/kg (recycled content); ~3.4 kg/SF" },
      // Mineral Wool
      { id: "cf-07210-19", name: "Mineral Wool Insulation, 3.5\"", kgCO2ePerUnit: 0.65, unit: "SF", source: "ice", confidence: "high", notes: "Mineral wool 1.20 kg CO2e/kg; ~0.54 kg/SF" },
      // Sound Attenuation
      { id: "cf-07210-20", name: "Sound Attenuation Insulation, 3.5\"", kgCO2ePerUnit: 0.38, unit: "SF", source: "ice", confidence: "medium", notes: "Fiberglass batt; similar to R-11" },
    ],
  },

  "07.250": {
    name: "Weather Barriers",
    items: [
      { id: "cf-07250-01", name: "House Wrap (Tyvek-type)", kgCO2ePerUnit: 0.08, unit: "SF", source: "ice", confidence: "medium", notes: "HDPE spunbond ~2.54 kg CO2e/kg; very lightweight ~0.03 kg/SF" },
    ],
  },

  "07.270": {
    name: "Air Barriers",
    items: [
      { id: "cf-07270-01", name: "Air Barrier Membrane, Self-Adhered", kgCO2ePerUnit: 1.20, unit: "SF", source: "ice", confidence: "medium", notes: "Modified bitumen sheet; ~0.9 kg/SF" },
    ],
  },

  "07.310": {
    name: "Shingles",
    items: [
      { id: "cf-07310-01", name: "Asphalt Shingles, Architectural (30-yr)", kgCO2ePerUnit: 56.0, unit: "SQ", source: "ice", confidence: "high", notes: "~0.18 kg CO2e/kg; ~310 kg per SQ (100 SF)" },
      { id: "cf-07310-02", name: "Asphalt Shingles, 3-Tab", kgCO2ePerUnit: 42.0, unit: "SQ", source: "ice", confidence: "high", notes: "Lighter weight ~230 kg per SQ" },
    ],
  },

  "07.410": {
    name: "Metal Roof Panels",
    items: [
      { id: "cf-07410-01", name: "Standing Seam Metal Roof Panel", kgCO2ePerUnit: 5.80, unit: "SF", source: "ice", confidence: "high", notes: "Steel panel ~4 kg/SF; 1.46 kg CO2e/kg" },
      { id: "cf-07410-02", name: "Standing Seam Metal Roof, Aluminum", kgCO2ePerUnit: 9.20, unit: "SF", source: "ice", confidence: "high", notes: "Aluminum 8.24 kg CO2e/kg; ~1.1 kg/SF" },
    ],
  },

  "07.540": {
    name: "Thermoplastic Membrane Roofing (TPO)",
    items: [
      { id: "cf-07540-01", name: "TPO Membrane Roofing, 60 mil", kgCO2ePerUnit: 1.45, unit: "SF", source: "ice", confidence: "high", notes: "TPO ~3.0 kg CO2e/kg; ~0.48 kg/SF at 60 mil" },
    ],
  },

  "07.530": {
    name: "Elastomeric Membrane Roofing (EPDM)",
    items: [
      { id: "cf-07530-01", name: "EPDM Membrane Roofing, 60 mil", kgCO2ePerUnit: 1.95, unit: "SF", source: "ice", confidence: "high", notes: "EPDM ~3.60 kg CO2e/kg; ~0.54 kg/SF" },
    ],
  },

  "07.520": {
    name: "Modified Bituminous Membrane Roofing",
    items: [
      { id: "cf-07520-01", name: "Modified Bitumen Roofing, 2-Ply", kgCO2ePerUnit: 2.80, unit: "SF", source: "ice", confidence: "medium", notes: "Asphalt-based membrane; ~1.4 kg/SF per ply" },
    ],
  },

  "07.620": {
    name: "Sheet Metal Flashing",
    items: [
      { id: "cf-07620-01", name: "Sheet Metal Flashing, Aluminum", kgCO2ePerUnit: 2.90, unit: "LF", source: "ice", confidence: "medium", notes: "Aluminum 8.24 kg CO2e/kg; ~0.35 kg/LF" },
      { id: "cf-07620-02", name: "Drip Edge Flashing", kgCO2ePerUnit: 1.20, unit: "LF", source: "ice", confidence: "medium", notes: "Galvanized steel or aluminum; ~0.2 kg/LF" },
    ],
  },

  "07.780": {
    name: "Gutters & Downspouts",
    items: [
      { id: "cf-07780-01", name: "Gutters, Aluminum 5\" K-style", kgCO2ePerUnit: 3.30, unit: "LF", source: "ice", confidence: "medium", notes: "Aluminum 8.24 kg CO2e/kg; ~0.4 kg/LF" },
      { id: "cf-07780-02", name: "Downspouts, Aluminum 3x4", kgCO2ePerUnit: 2.50, unit: "LF", source: "ice", confidence: "medium", notes: "~0.3 kg aluminum/LF" },
    ],
  },

  "07.810": {
    name: "Applied Fireproofing",
    items: [
      { id: "cf-07810-01", name: "Spray Fireproofing, 1-HR", kgCO2ePerUnit: 0.45, unit: "SF", source: "ice", confidence: "medium", notes: "Cementitious spray ~0.20 kg CO2e/kg; ~2.2 kg/SF" },
      { id: "cf-07810-02", name: "Spray Fireproofing, 2-HR", kgCO2ePerUnit: 0.72, unit: "SF", source: "ice", confidence: "medium", notes: "Thicker application ~3.6 kg/SF" },
    ],
  },

  "07.840": {
    name: "Firestopping",
    items: [
      { id: "cf-07840-01", name: "Firestop Sealant, Intumescent", kgCO2ePerUnit: 0.35, unit: "LF", source: "ice", confidence: "low", notes: "Silicone/intumescent hybrid; small volume per LF" },
      { id: "cf-07840-02", name: "Mineral Wool Safing, 4\"", kgCO2ePerUnit: 1.20, unit: "LF", source: "ice", confidence: "medium", notes: "Mineral wool 1.20 kg CO2e/kg; ~1 kg/LF" },
    ],
  },

  "07.910": {
    name: "Joint Sealants",
    items: [
      { id: "cf-07910-01", name: "Caulking / Joint Sealant", kgCO2ePerUnit: 0.12, unit: "LF", source: "ice", confidence: "medium", notes: "Silicone sealant ~5.5 kg CO2e/kg; ~0.022 kg/LF" },
    ],
  },

  "07.920": {
    name: "Acoustical Sealant",
    items: [
      { id: "cf-07920-01", name: "Acoustical Sealant, Tube (29 oz)", kgCO2ePerUnit: 2.10, unit: "EA", source: "ice", confidence: "low", notes: "Latex-based sealant ~2.5 kg CO2e/kg; ~0.82 kg/tube" },
    ],
  },

  // ── 08 Openings ─────────────────────────────────────────────────────────────

  "08.110": {
    name: "Hollow Metal Doors & Frames",
    items: [
      { id: "cf-08110-01", name: "Hollow Metal Door And Frame, 3-0x7-0", kgCO2ePerUnit: 95.0, unit: "EA", source: "ice", confidence: "medium", notes: "~65 kg steel per door + frame assembly; 1.46 kg CO2e/kg" },
      { id: "cf-08110-02", name: "Hollow Metal Door And Frame, Fire Rated", kgCO2ePerUnit: 110.0, unit: "EA", source: "ice", confidence: "medium", notes: "Heavier gauge steel + fire-rated core; ~75 kg" },
    ],
  },

  "08.140": {
    name: "Wood Doors",
    items: [
      { id: "cf-08140-01", name: "Wood Interior Door, Flush Solid Core, 3-0x6-8", kgCO2ePerUnit: 18.0, unit: "EA", source: "ice", confidence: "medium", notes: "Particleboard core + veneer; ~25 kg door; 0.72 kg CO2e/kg composite" },
      { id: "cf-08140-02", name: "Wood Interior Door, Flush Hollow Core, 2-8x6-8", kgCO2ePerUnit: 8.50, unit: "EA", source: "ice", confidence: "medium", notes: "Cardboard honeycomb core; ~12 kg door" },
    ],
  },

  "08.160": {
    name: "Exterior Doors",
    items: [
      { id: "cf-08160-01", name: "Exterior Entry Door, Fiberglass, 3-0x6-8", kgCO2ePerUnit: 45.0, unit: "EA", source: "ice", confidence: "low", notes: "Fiberglass skin + PU foam core + frame" },
    ],
  },

  "08.330": {
    name: "Overhead / Coiling Doors",
    items: [
      { id: "cf-08330-01", name: "Overhead Coiling Door, 10x10", kgCO2ePerUnit: 380.0, unit: "EA", source: "ice", confidence: "low", notes: "~260 kg steel + motor; 1.46 kg CO2e/kg" },
    ],
  },

  "08.410": {
    name: "Aluminum Storefront",
    items: [
      { id: "cf-08410-01", name: "Aluminum Storefront Entrance, 3-0x7-0", kgCO2ePerUnit: 220.0, unit: "EA", source: "ice", confidence: "medium", notes: "Aluminum frame ~20 kg + glass ~15 kg; aluminum 8.24 kg CO2e/kg" },
    ],
  },

  "08.440": {
    name: "Storefront System",
    items: [
      { id: "cf-08440-01", name: "Aluminum Storefront System", kgCO2ePerUnit: 18.5, unit: "SF", source: "ice", confidence: "medium", notes: "Aluminum frame + insulated glass; ~1.5 kg Al + 10 kg glass per SF" },
    ],
  },

  "08.450": {
    name: "Curtain Wall Systems",
    items: [
      { id: "cf-08450-01", name: "Curtain Wall System, Aluminum", kgCO2ePerUnit: 28.0, unit: "SF", source: "ice", confidence: "medium", notes: "Aluminum mullions + IGU; ~2 kg Al + 10 kg glass per SF" },
    ],
  },

  "08.510": {
    name: "Windows",
    items: [
      { id: "cf-08510-01", name: "Vinyl Window, Double Hung, 3-0x4-0", kgCO2ePerUnit: 42.0, unit: "EA", source: "ice", confidence: "medium", notes: "PVC frame ~8 kg + IGU ~15 kg; PVC 3.10 kg CO2e/kg, glass 0.86 kg CO2e/kg" },
      { id: "cf-08510-02", name: "Vinyl Window, Casement, 3-0x4-0", kgCO2ePerUnit: 45.0, unit: "EA", source: "ice", confidence: "medium", notes: "Slightly more hardware than double hung" },
      { id: "cf-08510-03", name: "Aluminum Window, Fixed, 4-0x5-0", kgCO2ePerUnit: 85.0, unit: "EA", source: "ice", confidence: "medium", notes: "Aluminum frame ~6 kg + IGU ~20 kg; aluminum is high carbon" },
    ],
  },

  "08.710": {
    name: "Door Hardware",
    items: [
      { id: "cf-08710-01", name: "Door Hardware Set, Passage", kgCO2ePerUnit: 3.50, unit: "SET", source: "ice", confidence: "low", notes: "Lever + hinges + stop; mixed metals ~2.5 kg total" },
      { id: "cf-08710-02", name: "Door Hardware Set, Keyed Entry (Commercial)", kgCO2ePerUnit: 5.20, unit: "SET", source: "ice", confidence: "low", notes: "Heavier commercial hardware" },
      { id: "cf-08710-03", name: "Door Closer, Surface Mounted", kgCO2ePerUnit: 6.50, unit: "EA", source: "ice", confidence: "low", notes: "~4 kg steel/aluminum body + hydraulics" },
    ],
  },

  "08.800": {
    name: "Glazing",
    items: [
      { id: "cf-08800-01", name: "Glass, 1/4\" Clear Float", kgCO2ePerUnit: 5.30, unit: "SF", source: "ice", confidence: "high", notes: "Float glass 0.86 kg CO2e/kg; ~6.1 kg/SF at 1/4\"" },
      { id: "cf-08800-02", name: "Insulated Glass Unit (IGU), 1\" Overall", kgCO2ePerUnit: 11.2, unit: "SF", source: "ice", confidence: "high", notes: "Two lites + spacer + gas fill; ~13 kg/SF" },
      { id: "cf-08800-03", name: "Low-E Insulated Glass Unit", kgCO2ePerUnit: 12.5, unit: "SF", source: "ice", confidence: "medium", notes: "Low-E coating adds ~10% to IGU" },
      { id: "cf-08800-04", name: "Laminated Glass, 1/4\" + 1/4\"", kgCO2ePerUnit: 11.8, unit: "SF", source: "ice", confidence: "medium", notes: "Two lites + PVB interlayer" },
    ],
  },

  // ── 09 Finishes ─────────────────────────────────────────────────────────────

  "09.210": {
    name: "Gypsum Board",
    items: [
      { id: "cf-09210-01", name: "Gypsum Board, 5/8\" Type X (Fire Rated)", kgCO2ePerUnit: 1.42, unit: "SF", source: "ice", confidence: "high", notes: "Gypsum board 0.12 kg CO2e/kg (ICE); ~11.8 kg/SF at 5/8\"" },
      { id: "cf-09210-02", name: "Gypsum Board, 1/2\" Standard", kgCO2ePerUnit: 1.15, unit: "SF", source: "ice", confidence: "high", notes: "~9.6 kg/SF at 1/2\"" },
      { id: "cf-09210-03", name: "Gypsum Board, 1/2\" Moisture Resistant", kgCO2ePerUnit: 1.25, unit: "SF", source: "ice", confidence: "high", notes: "Green board; silicone treatment adds marginal CO2e" },
      { id: "cf-09210-04", name: "Abuse-Resistant Gypsum Board, 5/8\"", kgCO2ePerUnit: 1.55, unit: "SF", source: "ice", confidence: "medium", notes: "Fiberglass mat face adds ~10%" },
    ],
  },

  "09.220": {
    name: "Drywall Taping & Finishing",
    items: [
      { id: "cf-09220-01", name: "Drywall Taping & Finishing, Level 4", kgCO2ePerUnit: 0.08, unit: "SF", source: "ice", confidence: "medium", notes: "Joint compound ~0.13 kg CO2e/kg; ~0.6 kg/SF" },
      { id: "cf-09220-02", name: "Drywall Taping & Finishing, Level 5", kgCO2ePerUnit: 0.12, unit: "SF", source: "ice", confidence: "medium", notes: "Skim coat uses more compound" },
    ],
  },

  "09.230": {
    name: "Stucco",
    items: [
      { id: "cf-09230-01", name: "Portland Cement Stucco, 3-Coat", kgCO2ePerUnit: 3.80, unit: "SF", source: "ice", confidence: "medium", notes: "Cement stucco ~0.15 kg CO2e/kg; ~25 kg/SF 3-coat system" },
    ],
  },

  "09.310": {
    name: "Ceramic & Porcelain Tile",
    items: [
      { id: "cf-09310-01", name: "Ceramic Wall Tile", kgCO2ePerUnit: 3.60, unit: "SF", source: "ice", confidence: "high", notes: "Ceramic tile 0.78 kg CO2e/kg; ~3.5 kg/SF + thinset mortar" },
      { id: "cf-09310-02", name: "Ceramic Floor Tile", kgCO2ePerUnit: 3.80, unit: "SF", source: "ice", confidence: "high", notes: "Slightly thicker tiles for floor" },
      { id: "cf-09310-03", name: "Porcelain Floor Tile", kgCO2ePerUnit: 4.50, unit: "SF", source: "ice", confidence: "high", notes: "Porcelain fired at higher temp; 0.90 kg CO2e/kg" },
      { id: "cf-09310-04", name: "Porcelain Tile, Large Format", kgCO2ePerUnit: 5.20, unit: "SF", source: "ice", confidence: "medium", notes: "Thicker large-format tiles; more material per SF" },
    ],
  },

  "09.510": {
    name: "Acoustical Ceilings",
    items: [
      { id: "cf-09510-01", name: "Acoustical Ceiling Suspension Grid", kgCO2ePerUnit: 0.52, unit: "SF", source: "ice", confidence: "medium", notes: "Galvanized steel grid ~0.35 kg/SF; 1.46 kg CO2e/kg" },
      { id: "cf-09510-02", name: "Acoustical Ceiling Tile, 2x4", kgCO2ePerUnit: 1.10, unit: "SF", source: "ice", confidence: "medium", notes: "Mineral fiber tile ~0.59 kg CO2e/kg; ~1.9 kg/SF" },
      { id: "cf-09510-03", name: "Acoustical Ceiling Tile, 2x2", kgCO2ePerUnit: 1.20, unit: "SF", source: "ice", confidence: "medium", notes: "Same material, slightly more waste for smaller tiles" },
      { id: "cf-09510-04", name: "ACT Ceiling Assembly (grid + tile), 2x4", kgCO2ePerUnit: 1.62, unit: "SF", source: "ice", confidence: "medium", notes: "Combined grid + tile + wire" },
    ],
  },

  "09.640": {
    name: "Wood Flooring",
    items: [
      { id: "cf-09640-01", name: "Hardwood Flooring, Oak (3/4\" Solid)", kgCO2ePerUnit: 2.50, unit: "SF", source: "ice", confidence: "high", notes: "Hardwood 0.47 kg CO2e/kg; ~5.3 kg/SF at 3/4\"" },
    ],
  },

  "09.650": {
    name: "Resilient Flooring",
    items: [
      { id: "cf-09650-01", name: "Luxury Vinyl Plank (LVP)", kgCO2ePerUnit: 2.80, unit: "SF", source: "ice", confidence: "medium", notes: "PVC-based ~3.10 kg CO2e/kg; ~0.9 kg/SF" },
      { id: "cf-09650-02", name: "VCT (Vinyl Composition Tile)", kgCO2ePerUnit: 2.20, unit: "SF", source: "ice", confidence: "medium", notes: "VCT ~1.93 kg CO2e/kg; ~1.14 kg/SF at 1/8\" thick" },
      { id: "cf-09650-03", name: "Rubber Flooring", kgCO2ePerUnit: 3.50, unit: "SF", source: "ice", confidence: "medium", notes: "Synthetic rubber ~3.18 kg CO2e/kg; ~1.1 kg/SF" },
    ],
  },

  "09.680": {
    name: "Carpet",
    items: [
      { id: "cf-09680-01", name: "Carpet, Commercial Grade (Broadloom)", kgCO2ePerUnit: 4.20, unit: "SF", source: "ice", confidence: "high", notes: "Nylon face carpet 5.43 kg CO2e/kg; ~0.77 kg/SF" },
      { id: "cf-09680-02", name: "Carpet Tile, 24x24", kgCO2ePerUnit: 4.80, unit: "SF", source: "ice", confidence: "high", notes: "PVC backing adds to broadloom base; ~0.88 kg/SF" },
    ],
  },

  "09.620": {
    name: "Specialty Flooring",
    items: [
      { id: "cf-09620-01", name: "Laminate Flooring", kgCO2ePerUnit: 1.80, unit: "SF", source: "ice", confidence: "medium", notes: "HDF core + melamine overlay; ~0.55 kg CO2e/kg; ~3.3 kg/SF" },
    ],
  },

  "09.660": {
    name: "Terrazzo",
    items: [
      { id: "cf-09660-01", name: "Terrazzo, Thin-Set", kgCO2ePerUnit: 5.80, unit: "SF", source: "ice", confidence: "medium", notes: "Epoxy or cement matrix + marble chips; ~6 kg/SF" },
    ],
  },

  "09.670": {
    name: "Fluid-Applied Flooring",
    items: [
      { id: "cf-09670-01", name: "Epoxy Floor Coating", kgCO2ePerUnit: 1.60, unit: "SF", source: "ice", confidence: "medium", notes: "Epoxy resin ~5.0 kg CO2e/kg; ~0.32 kg/SF typical 2-coat" },
    ],
  },

  "09.910": {
    name: "Interior Painting",
    items: [
      { id: "cf-09910-01", name: "Interior Painting, Walls (2 Coats)", kgCO2ePerUnit: 0.18, unit: "SF", source: "ice", confidence: "medium", notes: "Latex paint ~2.40 kg CO2e/kg; ~0.075 kg/SF per coat" },
      { id: "cf-09910-02", name: "Interior Painting, Ceiling (2 Coats)", kgCO2ePerUnit: 0.18, unit: "SF", source: "ice", confidence: "medium", notes: "Same as wall paint" },
    ],
  },

  "09.920": {
    name: "Exterior Painting",
    items: [
      { id: "cf-09920-01", name: "Exterior Painting (2 Coats)", kgCO2ePerUnit: 0.22, unit: "SF", source: "ice", confidence: "medium", notes: "Acrylic latex exterior; slightly heavier application" },
    ],
  },

  "09.930": {
    name: "Staining & Finishing",
    items: [
      { id: "cf-09930-01", name: "Stain And Polyurethane, Wood (2 Coats)", kgCO2ePerUnit: 0.25, unit: "SF", source: "ice", confidence: "medium", notes: "Oil-modified polyurethane ~3.8 kg CO2e/kg; ~0.065 kg/SF per coat" },
    ],
  },

  // ── 06.160 Sheathing on Metal Studs ─────────────────────────────────────────

  "06.160": {
    name: "Sheathing (Metal Stud Walls)",
    items: [
      { id: "cf-06160-01", name: "DensGlass Sheathing, 1/2\"", kgCO2ePerUnit: 1.30, unit: "SF", source: "ice", confidence: "medium", notes: "Fiberglass-mat gypsum; ~10.8 kg/SF at 1/2\"" },
      { id: "cf-06160-02", name: "DensGlass Sheathing, 5/8\" Type X", kgCO2ePerUnit: 1.55, unit: "SF", source: "ice", confidence: "medium", notes: "~12.9 kg/SF at 5/8\"" },
      { id: "cf-06160-03", name: "Plywood Sheathing on Metal Studs, 1/2\" CDX", kgCO2ePerUnit: 1.85, unit: "SF", source: "ice", confidence: "high", notes: "Same as standard plywood sheathing" },
    ],
  },

  // ── 21 Fire Suppression ─────────────────────────────────────────────────────

  "21.110": {
    name: "Wet-Pipe Sprinkler Systems",
    items: [
      { id: "cf-21110-01", name: "Fire Sprinkler System (per SF, light hazard)", kgCO2ePerUnit: 1.80, unit: "SF", source: "ice", confidence: "low", notes: "Steel pipe, fittings, heads; ~1.2 kg steel/SF avg" },
      { id: "cf-21110-02", name: "Fire Sprinkler Head", kgCO2ePerUnit: 1.50, unit: "EA", source: "ice", confidence: "low", notes: "Brass/chrome body ~1 kg" },
    ],
  },

  // ── 22 Plumbing ─────────────────────────────────────────────────────────────

  "22.110": {
    name: "Facility Water Distribution Piping",
    items: [
      { id: "cf-22110-01", name: "Copper Pipe, Type L, 3/4\"", kgCO2ePerUnit: 1.52, unit: "LF", source: "ice", confidence: "high", notes: "Copper 3.01 kg CO2e/kg (ICE); ~0.505 kg/LF (3/4\" Type L)" },
      { id: "cf-22110-02", name: "Copper Pipe, Type L, 1\"", kgCO2ePerUnit: 2.28, unit: "LF", source: "ice", confidence: "high", notes: "~0.757 kg/LF (1\" Type L)" },
      { id: "cf-22110-03", name: "PEX Pipe, 3/4\"", kgCO2ePerUnit: 0.18, unit: "LF", source: "ice", confidence: "high", notes: "Cross-linked PE 2.54 kg CO2e/kg; ~0.071 kg/LF" },
      { id: "cf-22110-04", name: "PEX Pipe, 1/2\"", kgCO2ePerUnit: 0.12, unit: "LF", source: "ice", confidence: "high", notes: "~0.047 kg/LF" },
      { id: "cf-22110-05", name: "CPVC Pipe, 3/4\"", kgCO2ePerUnit: 0.22, unit: "LF", source: "ice", confidence: "high", notes: "CPVC ~3.10 kg CO2e/kg; ~0.071 kg/LF" },
    ],
  },

  "22.130": {
    name: "Facility Storm & Sanitary Drainage",
    items: [
      { id: "cf-22130-01", name: "PVC DWV Pipe, 3\"", kgCO2ePerUnit: 0.82, unit: "LF", source: "ice", confidence: "high", notes: "PVC 3.10 kg CO2e/kg; ~0.264 kg/LF (3\" Sch 40)" },
      { id: "cf-22130-02", name: "PVC DWV Pipe, 4\"", kgCO2ePerUnit: 1.22, unit: "LF", source: "ice", confidence: "high", notes: "~0.394 kg/LF (4\" Sch 40)" },
      { id: "cf-22130-03", name: "Cast Iron Pipe, 4\" (No-Hub)", kgCO2ePerUnit: 6.40, unit: "LF", source: "ice", confidence: "high", notes: "Cast iron 1.31 kg CO2e/kg; ~4.9 kg/LF (4\" no-hub)" },
    ],
  },

  "22.330": {
    name: "Water Heaters",
    items: [
      { id: "cf-22330-01", name: "Water Heater, Gas, 50 Gal", kgCO2ePerUnit: 180.0, unit: "EA", source: "ice", confidence: "low", notes: "Steel tank ~35 kg + insulation + components" },
      { id: "cf-22330-02", name: "Water Heater, Electric, 50 Gal", kgCO2ePerUnit: 165.0, unit: "EA", source: "ice", confidence: "low", notes: "Similar tank, no flue/gas valve" },
    ],
  },

  "22.410": {
    name: "Commercial Plumbing Fixtures",
    items: [
      { id: "cf-22410-01", name: "Water Closet, Standard (Floor Mount)", kgCO2ePerUnit: 72.0, unit: "EA", source: "ice", confidence: "medium", notes: "Vitreous china 0.72 kg CO2e/kg; ~40 kg fixture + valve + supply" },
      { id: "cf-22410-02", name: "Water Closet, Commercial (Wall Hung, Flush Valve)", kgCO2ePerUnit: 95.0, unit: "EA", source: "ice", confidence: "medium", notes: "Heavier carrier + chrome flush valve" },
    ],
  },

  "22.420": {
    name: "Lavatories",
    items: [
      { id: "cf-22420-01", name: "Lavatory Sink, Drop-In", kgCO2ePerUnit: 35.0, unit: "EA", source: "ice", confidence: "medium", notes: "Vitreous china ~15 kg + faucet + drain" },
      { id: "cf-22420-02", name: "Lavatory Sink, Wall Hung", kgCO2ePerUnit: 40.0, unit: "EA", source: "ice", confidence: "medium", notes: "Heavier mounting bracket" },
    ],
  },

  "22.440": {
    name: "Kitchen Sinks",
    items: [
      { id: "cf-22440-01", name: "Kitchen Sink, Double Bowl Stainless", kgCO2ePerUnit: 32.0, unit: "EA", source: "ice", confidence: "medium", notes: "Stainless steel ~8 kg; 4.0 kg CO2e/kg stainless" },
    ],
  },

  "22.450": {
    name: "Bathtubs & Showers",
    items: [
      { id: "cf-22450-01", name: "Bathtub, Fiberglass", kgCO2ePerUnit: 55.0, unit: "EA", source: "ice", confidence: "low", notes: "Fiberglass reinforced acrylic ~15 kg" },
      { id: "cf-22450-02", name: "Shower Stall, Fiberglass (36x36)", kgCO2ePerUnit: 48.0, unit: "EA", source: "ice", confidence: "low", notes: "Lighter than bathtub" },
    ],
  },

  // ── 23 HVAC ─────────────────────────────────────────────────────────────────

  "23.310": {
    name: "HVAC Ductwork",
    items: [
      { id: "cf-23310-01", name: "Sheet Metal Ductwork, Rectangular", kgCO2ePerUnit: 0.66, unit: "LB", source: "ice", confidence: "high", notes: "Galvanized sheet steel 1.46 kg CO2e/kg = 0.66 kg CO2e/lb" },
      { id: "cf-23310-02", name: "Flexible Ductwork, Insulated 6\"", kgCO2ePerUnit: 0.55, unit: "LF", source: "ice", confidence: "medium", notes: "Aluminum core + fiberglass wrap + vapor jacket; ~0.5 kg/LF" },
      { id: "cf-23310-03", name: "Flexible Ductwork, Insulated 8\"", kgCO2ePerUnit: 0.75, unit: "LF", source: "ice", confidence: "medium", notes: "~0.68 kg/LF" },
    ],
  },

  "23.370": {
    name: "HVAC Diffusers, Grilles & Insulation",
    items: [
      { id: "cf-23370-01", name: "Supply Diffuser, Ceiling 2x2", kgCO2ePerUnit: 3.80, unit: "EA", source: "ice", confidence: "low", notes: "Painted steel ~2.5 kg; 1.46 kg CO2e/kg" },
      { id: "cf-23370-02", name: "Return Air Grille, 24x24", kgCO2ePerUnit: 3.20, unit: "EA", source: "ice", confidence: "low", notes: "Painted steel ~2.2 kg" },
      { id: "cf-23370-03", name: "Duct Insulation, Fiberglass Wrap 1.5\"", kgCO2ePerUnit: 0.42, unit: "SF", source: "ice", confidence: "medium", notes: "Fiberglass ~1.35 kg CO2e/kg; ~0.31 kg/SF" },
    ],
  },

  "23.810": {
    name: "HVAC Equipment (Packaged / Split)",
    items: [
      { id: "cf-23810-01", name: "Rooftop Unit (RTU), 5 Ton", kgCO2ePerUnit: 1850.0, unit: "EA", source: "ice", confidence: "low", notes: "~400 kg steel + copper + aluminum + refrigerant" },
      { id: "cf-23810-02", name: "Rooftop Unit (RTU), 10 Ton", kgCO2ePerUnit: 3200.0, unit: "EA", source: "ice", confidence: "low", notes: "~700 kg; larger compressors + coils" },
      { id: "cf-23810-03", name: "Split System Condenser, 3 Ton", kgCO2ePerUnit: 680.0, unit: "EA", source: "ice", confidence: "low", notes: "~150 kg unit; copper coils, steel housing" },
    ],
  },

  "23.820": {
    name: "Air Handler / Fan Coil Units",
    items: [
      { id: "cf-23820-01", name: "Air Handler Unit (AHU)", kgCO2ePerUnit: 1200.0, unit: "EA", source: "ice", confidence: "low", notes: "~350 kg steel casing + coils + fan" },
      { id: "cf-23820-02", name: "Fan Coil Unit (Typical)", kgCO2ePerUnit: 250.0, unit: "EA", source: "ice", confidence: "low", notes: "~60 kg unit; copper coil + steel housing" },
    ],
  },

  "23.830": {
    name: "Ductless Systems",
    items: [
      { id: "cf-23830-01", name: "Mini Split, Ductless (Single Zone)", kgCO2ePerUnit: 450.0, unit: "EA", source: "ice", confidence: "low", notes: "Indoor + outdoor unit ~80 kg total + refrigerant" },
    ],
  },

  "23.520": {
    name: "Furnaces",
    items: [
      { id: "cf-23520-01", name: "Gas Furnace, 80K BTU", kgCO2ePerUnit: 320.0, unit: "EA", source: "ice", confidence: "low", notes: "~65 kg steel + heat exchanger" },
    ],
  },

  // ── 26 Electrical ───────────────────────────────────────────────────────────

  "26.050": {
    name: "Electrical Raceway & Wire",
    items: [
      { id: "cf-26050-01", name: "EMT Conduit, 3/4\"", kgCO2ePerUnit: 0.52, unit: "LF", source: "ice", confidence: "high", notes: "Galvanized steel ~0.36 kg/LF; 1.46 kg CO2e/kg" },
      { id: "cf-26050-02", name: "EMT Conduit, 1\"", kgCO2ePerUnit: 0.72, unit: "LF", source: "ice", confidence: "high", notes: "~0.49 kg/LF" },
      { id: "cf-26050-03", name: "PVC Conduit, 3/4\"", kgCO2ePerUnit: 0.22, unit: "LF", source: "ice", confidence: "high", notes: "PVC 3.10 kg CO2e/kg; ~0.071 kg/LF" },
      { id: "cf-26050-04", name: "Romex Cable, 12/2 NM-B", kgCO2ePerUnit: 0.38, unit: "LF", source: "ice", confidence: "medium", notes: "Copper conductors + PVC jacket; copper 3.01 kg CO2e/kg" },
      { id: "cf-26050-05", name: "Romex Cable, 14/2 NM-B", kgCO2ePerUnit: 0.28, unit: "LF", source: "ice", confidence: "medium", notes: "Smaller conductors than 12/2" },
      { id: "cf-26050-06", name: "THHN Wire, #12", kgCO2ePerUnit: 0.24, unit: "LF", source: "ice", confidence: "medium", notes: "Single copper conductor + PVC insulation" },
    ],
  },

  "26.240": {
    name: "Panelboards",
    items: [
      { id: "cf-26240-01", name: "Panel Board, 200A Main Breaker", kgCO2ePerUnit: 125.0, unit: "EA", source: "ice", confidence: "low", notes: "~45 kg steel enclosure + copper bus + breakers" },
      { id: "cf-26240-02", name: "Panel Board, 100A Sub Panel", kgCO2ePerUnit: 75.0, unit: "EA", source: "ice", confidence: "low", notes: "~28 kg; smaller panel" },
      { id: "cf-26240-03", name: "Circuit Breaker, 20A Single Pole", kgCO2ePerUnit: 2.50, unit: "EA", source: "ice", confidence: "low", notes: "~0.5 kg mixed materials" },
    ],
  },

  "26.270": {
    name: "Electrical Devices",
    items: [
      { id: "cf-26270-01", name: "Duplex Receptacle, 20A (with box & plate)", kgCO2ePerUnit: 1.80, unit: "EA", source: "ice", confidence: "low", notes: "Device + steel box + cover; ~0.8 kg total" },
      { id: "cf-26270-02", name: "GFCI Receptacle, 20A", kgCO2ePerUnit: 2.20, unit: "EA", source: "ice", confidence: "low", notes: "More electronics than standard receptacle" },
      { id: "cf-26270-03", name: "Light Switch, Single Pole", kgCO2ePerUnit: 1.50, unit: "EA", source: "ice", confidence: "low", notes: "Device + box + plate; ~0.6 kg" },
    ],
  },

  "26.510": {
    name: "Interior Luminaires",
    items: [
      { id: "cf-26510-01", name: "LED Recessed Downlight, 6\"", kgCO2ePerUnit: 5.80, unit: "EA", source: "ice", confidence: "low", notes: "Aluminum housing + LED driver + lens; ~2.5 kg" },
      { id: "cf-26510-02", name: "LED Troffer, 2x4", kgCO2ePerUnit: 18.0, unit: "EA", source: "ice", confidence: "low", notes: "Steel housing + LED panel + driver; ~8 kg" },
    ],
  },

  "26.560": {
    name: "Emergency & Exit Lighting",
    items: [
      { id: "cf-26560-01", name: "Exit Sign, LED", kgCO2ePerUnit: 4.50, unit: "EA", source: "ice", confidence: "low", notes: "Steel/plastic housing + battery + LEDs; ~2 kg" },
      { id: "cf-26560-02", name: "Emergency Light, LED Twin Head", kgCO2ePerUnit: 8.50, unit: "EA", source: "ice", confidence: "low", notes: "Steel housing + battery + 2 lamp heads; ~3.5 kg" },
    ],
  },

  // ── 31 Earthwork ────────────────────────────────────────────────────────────

  "31.220": {
    name: "Excavation",
    items: [
      { id: "cf-31220-01", name: "Excavation, Bulk (Cut)", kgCO2ePerUnit: 4.20, unit: "CY", source: "ice", confidence: "medium", notes: "Diesel equipment fuel; ~1.5 gal diesel/CY; 2.68 kg CO2e/gal" },
      { id: "cf-31220-02", name: "Excavation, Trench (Utility)", kgCO2ePerUnit: 6.80, unit: "CY", source: "ice", confidence: "medium", notes: "Less efficient; ~2.5 gal diesel/CY" },
    ],
  },

  "31.230": {
    name: "Fill & Compaction",
    items: [
      { id: "cf-31230-01", name: "Fill And Compaction, On-Site Material", kgCO2ePerUnit: 3.50, unit: "CY", source: "ice", confidence: "medium", notes: "Compaction equipment fuel only; ~1.3 gal diesel/CY" },
      { id: "cf-31230-02", name: "Import Fill, Structural (Compacted)", kgCO2ePerUnit: 8.50, unit: "CY", source: "ice", confidence: "medium", notes: "Trucking + processing + compaction; ~3.2 gal diesel equiv/CY" },
      { id: "cf-31230-03", name: "Gravel Base Course, 6\"", kgCO2ePerUnit: 1.20, unit: "SF", source: "ice", confidence: "medium", notes: "Crushed aggregate ~0.005 kg CO2e/kg; ~60 kg/SF at 6\"" },
      { id: "cf-31230-04", name: "Fine Grading", kgCO2ePerUnit: 0.08, unit: "SF", source: "ice", confidence: "low", notes: "Minimal fuel per SF for finish grading" },
    ],
  },

  // ── 32 Exterior Improvements ────────────────────────────────────────────────

  "32.120": {
    name: "Asphalt Paving",
    items: [
      { id: "cf-32120-01", name: "Asphalt Paving, 2\" Wearing Course", kgCO2ePerUnit: 3.80, unit: "SF", source: "ice", confidence: "high", notes: "Asphalt 0.066 kg CO2e/kg; ~23 kg/SF at 2\"; bitumen binder ~0.43 kg CO2e/kg" },
      { id: "cf-32120-02", name: "Asphalt Paving, 4\" Base Course", kgCO2ePerUnit: 7.20, unit: "SF", source: "ice", confidence: "high", notes: "Double the thickness of wearing course" },
    ],
  },

  "32.130": {
    name: "Concrete Paving",
    items: [
      { id: "cf-32130-01", name: "Concrete Sidewalk, 4\"", kgCO2ePerUnit: 8.80, unit: "SF", source: "ice", confidence: "high", notes: "~0.012 CY/SF at 4\" thick; 270 kg CO2e/CY (4000 PSI) + rebar" },
      { id: "cf-32130-02", name: "Concrete Curb And Gutter", kgCO2ePerUnit: 14.5, unit: "LF", source: "ice", confidence: "medium", notes: "~0.05 CY/LF typical curb & gutter section" },
    ],
  },

  "32.140": {
    name: "Unit Paving",
    items: [
      { id: "cf-32140-01", name: "Paver, Concrete Interlocking", kgCO2ePerUnit: 5.50, unit: "SF", source: "ice", confidence: "medium", notes: "Concrete pavers ~0.12 kg CO2e/kg; ~46 kg/SF at 2-3/8\" thick" },
      { id: "cf-32140-02", name: "Paver, Natural Stone (Bluestone)", kgCO2ePerUnit: 2.80, unit: "SF", source: "ice", confidence: "medium", notes: "Quarried stone ~0.06 kg CO2e/kg; ~46 kg/SF" },
    ],
  },

  "32.310": {
    name: "Fencing",
    items: [
      { id: "cf-32310-01", name: "Chain Link Fence, 6' (Galvanized)", kgCO2ePerUnit: 8.50, unit: "LF", source: "ice", confidence: "medium", notes: "Galv. steel ~1.46 kg CO2e/kg; ~5.8 kg steel/LF" },
      { id: "cf-32310-02", name: "Wood Privacy Fence, 6'", kgCO2ePerUnit: 3.20, unit: "LF", source: "ice", confidence: "medium", notes: "Treated lumber ~0.59 kg CO2e/kg; ~5.4 kg wood/LF" },
    ],
  },

  "32.920": {
    name: "Lawns & Grasses",
    items: [
      { id: "cf-32920-01", name: "Topsoil And Seeding", kgCO2ePerUnit: 0.05, unit: "SF", source: "ice", confidence: "low", notes: "Minimal embodied carbon; mostly labor" },
      { id: "cf-32920-02", name: "Sod, Installed", kgCO2ePerUnit: 0.12, unit: "SF", source: "ice", confidence: "low", notes: "Grown sod + transport; low embodied carbon" },
    ],
  },

  // ── 33 Utilities ────────────────────────────────────────────────────────────

  "33.310": {
    name: "Sanitary Sewerage Piping",
    items: [
      { id: "cf-33310-01", name: "PVC Sewer Pipe, 6\"", kgCO2ePerUnit: 2.40, unit: "LF", source: "ice", confidence: "high", notes: "PVC 3.10 kg CO2e/kg; ~0.77 kg/LF (6\" SDR 35)" },
      { id: "cf-33310-02", name: "PVC Sewer Pipe, 8\"", kgCO2ePerUnit: 3.80, unit: "LF", source: "ice", confidence: "high", notes: "~1.23 kg/LF (8\" SDR 35)" },
    ],
  },

  "33.410": {
    name: "Storm Drainage Piping",
    items: [
      { id: "cf-33410-01", name: "HDPE Storm Pipe, 12\"", kgCO2ePerUnit: 4.50, unit: "LF", source: "ice", confidence: "medium", notes: "HDPE 1.93 kg CO2e/kg; ~2.33 kg/LF corrugated" },
      { id: "cf-33410-02", name: "Reinforced Concrete Pipe, 15\"", kgCO2ePerUnit: 18.0, unit: "LF", source: "ice", confidence: "medium", notes: "Heavy concrete + steel reinforcement" },
    ],
  },

  "33.130": {
    name: "Water Utility Distribution Piping",
    items: [
      { id: "cf-33130-01", name: "Ductile Iron Water Main, 6\"", kgCO2ePerUnit: 12.5, unit: "LF", source: "ice", confidence: "medium", notes: "Ductile iron 1.31 kg CO2e/kg; ~9.5 kg/LF" },
      { id: "cf-33130-02", name: "Ductile Iron Water Main, 8\"", kgCO2ePerUnit: 18.0, unit: "LF", source: "ice", confidence: "medium", notes: "~13.7 kg/LF" },
    ],
  },
};


// ─────────────────────────────────────────────────────────────────────────────
// 2. CARBON_TRADE_DEFAULTS
//    Fallback kg CO2e per $ of material cost, keyed by trade.
//    Used when no specific CARBON_FACTOR exists for a line item.
//    Derived from industry averages: total embodied carbon of typical projects
//    divided by total material cost per trade.
// ─────────────────────────────────────────────────────────────────────────────

export const CARBON_TRADE_DEFAULTS = {
  // Trade key            kg CO2e / $ material
  concrete:               0.12,    // Cement-intensive; moderate cost per ton
  steel:                  0.08,    // High CO2e/kg but high $/kg
  masonry:                0.10,    // Similar to concrete; block + mortar
  framing:                0.04,    // Wood is low-carbon; biogenic sequestration partly offsets
  finishCarp:             0.03,    // Finish wood + MDF; lower carbon density
  carpentry:              0.04,    // General carpentry = rough framing
  insulation:             0.06,    // Varies widely; foam > fiberglass > cellulose
  roofing:                0.05,    // Mixed: membrane, asphalt, metal
  doors:                  0.04,    // Mixed materials; moderate carbon per $
  windows:                0.06,    // Aluminum + glass is moderately carbon-intensive
  drywall:                0.05,    // Gypsum board + metal framing
  tile:                   0.04,    // Ceramic/porcelain kiln energy
  act:                    0.03,    // Mineral fiber ceiling tiles
  ceilings:               0.03,    // Same as act
  flooring:               0.04,    // Mixed: carpet, LVP, tile, hardwood
  painting:               0.02,    // Latex paint is low-carbon per dollar
  specialties:            0.03,    // Misc items — toilet accessories, signage
  elevator:               0.05,    // Steel + motors + controls
  fireSuppression:        0.06,    // Steel pipe + fittings
  plumbing:               0.06,    // Copper & PVC pipe + fixtures
  hvac:                   0.07,    // Equipment-heavy; steel + copper + refrigerant
  electrical:             0.05,    // Copper wire + steel conduit + devices
  sitework:               0.03,    // Earthwork is fuel-dominated; paving adds CO2e
  demo:                   0.01,    // Demolition has minimal embodied carbon (fuel only)
  general:                0.01,    // General conditions — mostly labor
  firestop:               0.04,    // Sealants + mineral wool
  fireproofing:           0.03,    // Cementitious spray
  waterproofing:          0.05,    // Bituminous membranes
  metals:                 0.08,    // Same as structural steel
  finishes:               0.04,    // EIFS, stucco, etc.
};


// ─────────────────────────────────────────────────────────────────────────────
// 3. CARBON_BENCHMARKS
//    kg CO2e per SF benchmarks by building type.
//    Covers upfront embodied carbon (A1–A3 + A4 + A5 where data exists).
//    Sources: CLF Material Baselines 2024, LEED v4.1 WBLCA credits,
//    Architecture 2030 Challenge, SE 2050 Commitment baselines.
//
//    low     = best-practice / mass timber / optimized design
//    typical = industry average for building type
//    high    = carbon-intensive / conventional construction
// ─────────────────────────────────────────────────────────────────────────────

export const CARBON_BENCHMARKS = {
  office: {
    label: "Office",
    low: 25,
    typical: 45,
    high: 70,
    unit: "kgCO2e/SF",
    source: "CLF Material Baselines / SE 2050",
    notes: "Steel or concrete frame; typical mid-rise 4-10 stories",
  },
  retail: {
    label: "Retail",
    low: 18,
    typical: 35,
    high: 55,
    unit: "kgCO2e/SF",
    source: "CLF Material Baselines",
    notes: "Single-story big-box to multi-story mixed-use retail",
  },
  industrial: {
    label: "Industrial",
    low: 12,
    typical: 25,
    high: 45,
    unit: "kgCO2e/SF",
    source: "CLF Material Baselines",
    notes: "Pre-engineered metal buildings to tilt-up concrete",
  },
  warehouse: {
    label: "Warehouse",
    low: 10,
    typical: 20,
    high: 35,
    unit: "kgCO2e/SF",
    source: "CLF Material Baselines",
    notes: "Simple shell with minimal finishes",
  },
  healthcare: {
    label: "Healthcare",
    low: 40,
    typical: 65,
    high: 95,
    unit: "kgCO2e/SF",
    source: "CLF Material Baselines / LEED WBLCA",
    notes: "Hospital with heavy MEP, concrete, specialized equipment",
  },
  education: {
    label: "Education (K-12 / Higher Ed)",
    low: 22,
    typical: 40,
    high: 60,
    unit: "kgCO2e/SF",
    source: "CLF Material Baselines",
    notes: "Schools and university buildings; wood to concrete frame",
  },
  residential_multi: {
    label: "Multi-Family Residential",
    low: 20,
    typical: 38,
    high: 58,
    unit: "kgCO2e/SF",
    source: "CLF Material Baselines / Architecture 2030",
    notes: "Mid-rise apartments; wood-frame to concrete podium",
  },
  residential_single: {
    label: "Single-Family Residential",
    low: 15,
    typical: 30,
    high: 50,
    unit: "kgCO2e/SF",
    source: "CLF Material Baselines",
    notes: "Wood-frame construction typical; ICF/steel on high end",
  },
  hotel: {
    label: "Hotel / Hospitality",
    low: 28,
    typical: 48,
    high: 72,
    unit: "kgCO2e/SF",
    source: "CLF Material Baselines",
    notes: "Concrete/steel frame with heavy finishes and MEP",
  },
  mixed_use: {
    label: "Mixed-Use",
    low: 25,
    typical: 42,
    high: 65,
    unit: "kgCO2e/SF",
    source: "CLF Material Baselines",
    notes: "Weighted avg of retail/office/residential components",
  },
};


// ─────────────────────────────────────────────────────────────────────────────
// 4. LEED_V5_TARGETS
//    LEED v5 embodied carbon reduction targets by building type.
//    Percentage reductions from baseline (industry average).
//    Based on LEED v5 BD+C MRc Embodied Carbon Optimization credit.
//
//    threshold = minimum reduction to earn credit (Option 1)
//    target    = mid-level reduction (Option 2)
//    stretch   = exemplary performance (Option 3)
//
//    All values are % reduction from the building-type baseline.
// ─────────────────────────────────────────────────────────────────────────────

export const LEED_V5_TARGETS = {
  office: {
    label: "Office",
    threshold: 10,
    target: 20,
    stretch: 40,
    unit: "% reduction",
    source: "LEED v5 BD+C draft",
    notes: "From CLF baseline for office buildings",
  },
  retail: {
    label: "Retail",
    threshold: 10,
    target: 20,
    stretch: 40,
    unit: "% reduction",
    source: "LEED v5 BD+C draft",
    notes: "From CLF baseline for retail buildings",
  },
  industrial: {
    label: "Industrial / Warehouse",
    threshold: 10,
    target: 20,
    stretch: 40,
    unit: "% reduction",
    source: "LEED v5 BD+C draft",
    notes: "Combined category for industrial & warehouse",
  },
  healthcare: {
    label: "Healthcare",
    threshold: 5,
    target: 15,
    stretch: 30,
    unit: "% reduction",
    source: "LEED v5 BD+C draft",
    notes: "Lower thresholds due to programmatic constraints",
  },
  education: {
    label: "Education",
    threshold: 10,
    target: 20,
    stretch: 40,
    unit: "% reduction",
    source: "LEED v5 BD+C draft",
    notes: "K-12 and higher education combined",
  },
  residential_multi: {
    label: "Multi-Family Residential",
    threshold: 10,
    target: 20,
    stretch: 40,
    unit: "% reduction",
    source: "LEED v5 BD+C draft",
    notes: "Mid-rise and high-rise residential",
  },
  residential_single: {
    label: "Single-Family Residential",
    threshold: 10,
    target: 20,
    stretch: 40,
    unit: "% reduction",
    source: "LEED v5 Residential draft",
    notes: "Detached and attached single-family",
  },
  hotel: {
    label: "Hotel / Hospitality",
    threshold: 10,
    target: 20,
    stretch: 40,
    unit: "% reduction",
    source: "LEED v5 BD+C draft",
    notes: "Hotels, motels, extended stay",
  },
  mixed_use: {
    label: "Mixed-Use",
    threshold: 10,
    target: 20,
    stretch: 40,
    unit: "% reduction",
    source: "LEED v5 BD+C draft",
    notes: "Weighted by area of each use type",
  },
};


// ─────────────────────────────────────────────────────────────────────────────
// Lookup Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find a carbon factor by CSI code and optional name fragment.
 * Returns the first matching item or null.
 *
 * @param {string} code  — CSI code (e.g., "03.310")
 * @param {string} [nameFragment] — partial name match (case-insensitive)
 * @returns {object|null}
 */
export const findCarbonFactor = (code, nameFragment) => {
  const section = CARBON_FACTORS[code];
  if (!section) return null;

  if (!nameFragment) return section.items[0] || null;

  const lower = nameFragment.toLowerCase();
  return section.items.find(i => i.name.toLowerCase().includes(lower)) || null;
};

/**
 * Get the trade default carbon intensity (kg CO2e per $ material).
 * Falls back to a conservative 0.05 if the trade is unknown.
 *
 * @param {string} tradeKey — trade key from the seed assembly
 * @returns {number} kg CO2e per dollar of material cost
 */
export const getTradeDefaultCarbon = (tradeKey) => {
  return CARBON_TRADE_DEFAULTS[tradeKey] ?? 0.05;
};

/**
 * Estimate embodied carbon for a line item.
 * Tries specific CARBON_FACTORS first, then falls back to trade default.
 *
 * @param {object} item — line item with code, name, unit, material, quantity
 * @returns {{ kgCO2e: number, method: 'factor'|'trade_default', factor: object|null }}
 */
export const estimateItemCarbon = (item) => {
  const { code, name, material, quantity } = item;
  const qty = quantity || 1;

  // Try specific factor lookup
  const factor = findCarbonFactor(code, name);
  if (factor && factor.unit === item.unit) {
    return {
      kgCO2e: factor.kgCO2ePerUnit * qty,
      method: "factor",
      factor,
    };
  }

  // Fallback: trade default × material cost × quantity
  const tradeRate = getTradeDefaultCarbon(item.trade);
  const materialCost = (material || 0) * qty;
  return {
    kgCO2e: tradeRate * materialCost,
    method: "trade_default",
    factor: null,
  };
};

/**
 * Get benchmark for a building type.
 *
 * @param {string} buildingType — key from CARBON_BENCHMARKS
 * @returns {object|null}
 */
export const getCarbonBenchmark = (buildingType) => {
  return CARBON_BENCHMARKS[buildingType] || null;
};

/**
 * Get LEED v5 targets for a building type.
 *
 * @param {string} buildingType — key from LEED_V5_TARGETS
 * @returns {object|null}
 */
export const getLeedTargets = (buildingType) => {
  return LEED_V5_TARGETS[buildingType] || null;
};
