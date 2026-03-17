// Module item ID → Seed element ID mapping
// Used by useTakeoffSync to look up per-unit costs for scope item sub-parts
import { SEED_ELEMENTS } from "@/constants/seedAssemblies";

// ─────────────────────────────────────────────────────────────────────────────
// Explicit mapping for every derived module item → seed element.
// Items are grouped by module and category for easy maintenance.
// ─────────────────────────────────────────────────────────────────────────────
const SEED_MAP = {
  // ═══════════════════════════════════════════════════════════════════════════
  // FOUNDATION MODULE
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Continuous Footings ──
  "ftg-conc": "s006", // Footing Concrete → Concrete, Ready Mix, 4000 PSI (CY)
  "ftg-form": "s002", // Footing Formwork → Formwork, Footing (SFCA)
  "ftg-rebar": "s003", // Footing Rebar → Rebar, #4 Grade 60 (LB) — default bar size
  "ftg-keyway": "s270", // Footing Keyway → Footing Keyway (LF)

  // ── Spread Footings ──
  "spread-conc": "s006", // Spread Ftg Concrete → Concrete, Ready Mix, 4000 PSI (CY)

  // ── Foundation Walls ──
  "wall-conc": "s006", // Wall Concrete → Concrete, Ready Mix, 4000 PSI (CY)
  "wall-form": "s001", // Wall Formwork → Formwork, Wall (up to 8') (SFCA)
  "wall-rebar": "s003", // Wall Rebar → Rebar, #4 Grade 60 (LB)
  dowels: "s271", // Dowels → Dowels, #5 x 24" (EA)
  "anchor-bolts": "s011", // Anchor Bolts → Anchor Bolts & Embeds (EA)
  "snap-ties": "s272", // Snap Ties → Snap Ties, Foundation Wall (EA)
  waterproof: "s101", // Waterproofing → Dampproofing, Spray Applied (SF) — default
  "drain-board": "s282", // Drainage Board → Drainage Board, Standard (SF)
  "perim-insul": "s088", // Perimeter Insulation → Rigid Insulation, 2" (SF) — default
  "vert-insul": "s088", // Vertical Wall Insulation → Rigid Insulation, 2" (SF)

  // ── Slab on Grade ──
  "fine-grade": "s182", // Fine Grading → Fine Grading (SF)
  gravel: "s295", // Gravel Base → Crushed Stone / Gravel Base (CY)
  vapor: "s288", // Vapor Barrier → Vapor Barrier, 10 mil Poly (SF)
  "rigid-insul": "s088", // Rigid Insulation (Under Slab) → Rigid Insulation, 2" (SF)
  "slab-conc": "s006", // Slab Concrete → Concrete, Ready Mix, 4000 PSI (CY)
  "slab-reinf": "s005", // Slab Reinforcing → Welded Wire Mesh, 6x6 W1.4 (SF) — default
  "slab-finish": "s009", // Slab Finishing → Concrete Finishing, Trowel (SF) — default
  curing: "s010", // Curing Compound → Concrete Curing Compound (SF)
  compaction: "s296", // Compaction → Compaction, Subgrade (SF)
  "exp-joints": "s273", // Expansion Joints → Expansion / Control Joints, Slab (LF)

  // ── Excavation (derived-only group) ──
  "struct-exc": "s291", // Structural Excavation → Structural Excavation, Foundation (CY)
  backfill: "s292", // Backfill → Backfill, Foundation (On-Site Material) (CY)
  "excess-fill": "s293", // Excess Fill (Stockpile) → Excess Fill, Stockpile On-Site (CY)
  "export-fill": "s294", // Export Fill (Off-Site) → Export Fill, Off-Site (Haul & Dump) (CY)

  // ═══════════════════════════════════════════════════════════════════════════
  // WALLS MODULE
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Exterior Walls — Wood derived items ──
  "ext-studs": "s023", // Studs → 2x4 Stud, SPF #2, 8' (EA) — default stud
  "ext-top-plates": "s032", // Top Plates → 2x4 Top & Bottom Plate (LF) — default
  "ext-bot-plates": "s032", // Bottom Plates → 2x4 Top & Bottom Plate (LF)
  "ext-sheath": "s051", // Sheathing → OSB Sheathing, 7/16" (SF) — default as sheets (EA→SF)
  "ext-wrb": "s305", // House Wrap / WRB → Tyvek HomeWrap (SF)
  "ext-insul": "s083", // Wall Insulation → Batt Insulation, R-13 (SF) — default

  // ── Exterior Walls — CMU derived items ──
  "ext-cmu-block": "s195", // CMU Block → CMU Block, 8x8x16 Standard (SF)
  "ext-cmu-mortar": "s200", // Mortar → Mortar, Type S (SF)
  "ext-cmu-vert-rebar": "s003", // Vertical Rebar → Rebar, #4 Grade 60 (LB)
  "ext-cmu-horiz-reinf": "s461", // Horiz Reinforcement → Joint Reinforcement, Truss Type (LF)
  "ext-cmu-grout": "s469", // CMU Grout → Grout, CMU Cells (Rebar Only) (CY)
  "ext-cmu-insul": "s470", // CMU Wall Insulation → CMU Core Fill Insulation, Foam (SF)
  "ext-cmu-control-jt": "s463", // Control Joints → CMU Control Joint, Rubber (LF)
  "ext-cmu-flashing": "s465", // CMU Flashing → Masonry Flashing, Copper-Coated (LF)
  "ext-cmu-waterproof": "s468", // CMU Waterproofing → Dampproofing, Brush-Applied Bituminous (SF)

  // ── Exterior Walls — Concrete (Cast-in-Place) derived items ──
  "ext-conc-formwork": "s480", // Formwork → Wall Forms, Plywood/Job-Built (SFCA)
  "ext-conc-concrete": "s006", // Concrete → Concrete, Ready Mix, 4000 PSI (CY)
  "ext-conc-vert-rebar": "s003", // Vertical Rebar → Rebar, #4 Grade 60 (LB)
  "ext-conc-horiz-rebar": "s003", // Horizontal Rebar → Rebar, #4 Grade 60 (LB)
  "ext-conc-form-ties": "s485", // Form Ties → Form Tie, Standard Snap (EA)
  "ext-conc-finish": "s488", // Wall Finish → Concrete Wall Finish, Rubbed (SF)
  "ext-conc-waterstop": "s492", // Waterstop → Waterstop, PVC Ribbed (LF)
  "ext-conc-curing": "s010", // Curing → Concrete Curing Compound (SF)
  "ext-conc-waterproof": "s496", // Dampproofing/Waterproofing → Dampproofing, Brush-Applied (CIP Wall) (SF)

  // ── Exterior Walls — ICF derived items ──
  "ext-icf-blocks": "s501", // ICF Blocks → ICF Block, Flat Wall 8" Core (SF)
  "ext-icf-concrete": "s006", // Concrete Fill → Concrete, Ready Mix, 4000 PSI (CY)
  "ext-icf-vert-rebar": "s003", // Vertical Rebar → Rebar, #4 Grade 60 (LB)
  "ext-icf-horiz-rebar": "s003", // Horizontal Rebar → Rebar, #4 Grade 60 (LB)
  "ext-icf-bracing": "s506", // Bracing / Alignment → ICF Bracing / Alignment System (SF)
  "ext-icf-ext-finish": "s510", // Exterior Finish → ICF Exterior Finish, Stucco/EIFS (SF)
  "ext-icf-waterproof": "s496", // Waterproofing → Dampproofing, Brush-Applied (CIP Wall) (SF)

  // ── Exterior Walls — Tilt-Up derived items ──
  "ext-tilt-panels": "s521", // Tilt-Up Panels → Tilt-Up Panel Concrete, 5-1/2" (SF)
  "ext-tilt-formwork": "s520", // Casting Slab Formwork → Tilt-Up Panel Formwork (SF)
  "ext-tilt-reinf": "s524", // Panel Reinforcement → Tilt-Up Panel Rebar Mat (SF)
  "ext-tilt-embeds": "s526", // Embed Plates & Inserts → Tilt-Up Embed Plates & Inserts (SF)
  "ext-tilt-erection": "s527", // Panel Erection (Crane) → Tilt-Up Panel Erection (Crane) (SF)
  "ext-tilt-bracing": "s530", // Strong-Back Bracing → Tilt-Up Panel Strong-Back Bracing (SF)
  "ext-tilt-joints": "s528", // Joint Sealant → Tilt-Up Panel Joint Sealant (LF)
  "ext-tilt-curing": "s529", // Curing Compound → Tilt-Up Panel Curing Compound (SF)
  "ext-tilt-waterproof": "s531", // Waterproofing → Tilt-Up Panel Dampproofing (SF)

  // ── Exterior Walls — Precast derived items ──
  "ext-precast-panels": "s541", // Precast Panels → Precast Wall Panel, Flat 8" (SF)
  "ext-precast-erection": "s544", // Panel Erection (Crane) → Precast Panel Erection (Crane) (SF)
  "ext-precast-connections": "s545", // Panel Connections → Precast Panel Connections, Welded (EA)
  "ext-precast-joints": "s547", // Joint Treatment → Precast Panel Joint Sealant (LF)
  "ext-precast-waterproof": "s549", // Waterproofing → Precast Panel Dampproofing (SF)

  // ── Exterior Walls — SIP derived items ──
  "ext-sip-panels": "s561", // SIP Panels → SIP Wall Panel, 6-1/2" (R-24) (SF)
  "ext-sip-splines": "s564", // Splines / Connectors → SIP Spline / Connector (LF)
  "ext-sip-sealant": "s565", // Panel Sealant / Tape → SIP Panel Sealant / Tape (LF)
  "ext-sip-fasteners": "s566", // Structural Fasteners → SIP Panel Fasteners (SF)
  "ext-sip-plates": "s567", // Top / Bottom Plates → SIP Top / Bottom Plates (LF)

  // ── Exterior Walls — 3D Printed derived items ──
  "ext-print-material": "s580", // Print Material → 3D Print Concrete Mix (Proprietary) (CF)
  "ext-print-machine": "s581", // Machine Time → 3D Print Wall, Machine Time (SF)
  "ext-print-setup": "s586", // Mobilization / Setup → 3D Print Mobilization / Setup (SF)
  "ext-print-reinf": "s582", // Reinforcement → 3D Print Wall Reinforcement, Fiber Mesh (SF)
  "ext-print-insul": "s584", // Insulation Fill → 3D Print Wall Insulation Fill (SF)
  "ext-print-finish": "s585", // Wall Finish → 3D Print Wall Finish, Smooth Coat (SF)

  // ── Interior Walls — Wood derived items ──
  "int-studs": "s023", // Studs → 2x4 Stud, SPF #2, 8' (EA)
  "int-top-plates": "s032", // Top Plates → 2x4 Top & Bottom Plate (LF)
  "int-bot-plates": "s032", // Bottom Plates → 2x4 Top & Bottom Plate (LF)
  "int-blocking": "s040", // Fire Blocking → Blocking & Backing, 2x (misc) (LF)

  // ── Interior Walls — CMU derived items ──
  "int-cmu-block": "s195", // CMU Block → CMU Block, 8x8x16 Standard (SF)
  "int-cmu-mortar": "s200", // Mortar → Mortar, Type S (SF)
  "int-cmu-vert-rebar": "s003", // Vertical Rebar → Rebar, #4 Grade 60 (LB)
  "int-cmu-horiz-reinf": "s461", // Horiz Reinforcement → Joint Reinforcement, Truss Type (LF)
  "int-cmu-grout": "s469", // CMU Grout → Grout, CMU Cells (Rebar Only) (CY)
  "int-cmu-insul": "s470", // CMU Wall Insulation → CMU Core Fill Insulation, Foam (SF)
  "int-cmu-control-jt": "s463", // Control Joints → CMU Control Joint, Rubber (LF)

  // ── Interior Walls — Concrete (Cast-in-Place) derived items ──
  "int-conc-formwork": "s480", // Formwork → Wall Forms, Plywood/Job-Built (SFCA)
  "int-conc-concrete": "s006", // Concrete → Concrete, Ready Mix, 4000 PSI (CY)
  "int-conc-vert-rebar": "s003", // Vertical Rebar → Rebar, #4 Grade 60 (LB)
  "int-conc-horiz-rebar": "s003", // Horizontal Rebar → Rebar, #4 Grade 60 (LB)
  "int-conc-form-ties": "s485", // Form Ties → Form Tie, Standard Snap (EA)
  "int-conc-curing": "s010", // Curing → Concrete Curing Compound (SF)

  // ── Interior Walls — ICF derived items ──
  "int-icf-blocks": "s501", // ICF Blocks → ICF Block, Flat Wall 8" Core (SF)
  "int-icf-concrete": "s006", // Concrete Fill → Concrete, Ready Mix, 4000 PSI (CY)
  "int-icf-vert-rebar": "s003", // Vertical Rebar → Rebar, #4 Grade 60 (LB)
  "int-icf-horiz-rebar": "s003", // Horizontal Rebar → Rebar, #4 Grade 60 (LB)
  "int-icf-bracing": "s506", // Bracing / Alignment → ICF Bracing / Alignment System (SF)

  // ── Interior Walls — Tilt-Up derived items ──
  "int-tilt-panels": "s521", // Tilt-Up Panels → Tilt-Up Panel Concrete, 5-1/2" (SF)
  "int-tilt-formwork": "s520", // Casting Slab Formwork → Tilt-Up Panel Formwork (SF)
  "int-tilt-reinf": "s524", // Panel Reinforcement → Tilt-Up Panel Rebar Mat (SF)
  "int-tilt-embeds": "s526", // Embed Plates & Inserts → Tilt-Up Embed Plates & Inserts (SF)
  "int-tilt-erection": "s527", // Panel Erection (Crane) → Tilt-Up Panel Erection (Crane) (SF)
  "int-tilt-bracing": "s530", // Strong-Back Bracing → Tilt-Up Panel Strong-Back Bracing (SF)
  "int-tilt-joints": "s528", // Joint Sealant → Tilt-Up Panel Joint Sealant (LF)
  "int-tilt-curing": "s529", // Curing Compound → Tilt-Up Panel Curing Compound (SF)

  // ── Interior Walls — Precast derived items ──
  "int-precast-panels": "s541", // Precast Panels → Precast Wall Panel, Flat 8" (SF)
  "int-precast-erection": "s544", // Panel Erection (Crane) → Precast Panel Erection (Crane) (SF)
  "int-precast-connections": "s545", // Panel Connections → Precast Panel Connections, Welded (EA)
  "int-precast-joints": "s547", // Joint Treatment → Precast Panel Joint Sealant (LF)

  // ── Interior Walls — SIP derived items ──
  "int-sip-panels": "s561", // SIP Panels → SIP Wall Panel, 6-1/2" (R-24) (SF)
  "int-sip-splines": "s564", // Splines / Connectors → SIP Spline / Connector (LF)
  "int-sip-sealant": "s565", // Panel Sealant / Tape → SIP Panel Sealant / Tape (LF)
  "int-sip-fasteners": "s566", // Structural Fasteners → SIP Panel Fasteners (SF)
  "int-sip-plates": "s567", // Top / Bottom Plates → SIP Top / Bottom Plates (LF)

  // ── Interior Walls — 3D Printed derived items ──
  "int-print-material": "s580", // Print Material → 3D Print Concrete Mix (Proprietary) (CF)
  "int-print-machine": "s581", // Machine Time → 3D Print Wall, Machine Time (SF)
  "int-print-setup": "s586", // Mobilization / Setup → 3D Print Mobilization / Setup (SF)
  "int-print-reinf": "s582", // Reinforcement → 3D Print Wall Reinforcement, Fiber Mesh (SF)
  "int-print-finish": "s585", // Wall Finish → 3D Print Wall Finish, Smooth Coat (SF)

  // ── Exterior Walls — Metal Stud derived items (static fallbacks — dynamic lookup overrides) ──
  "ext-ms-studs": "s354", // Metal Studs → 3-5/8" 20ga (LF) — default; dynamic picks exact gauge/size
  "ext-ms-track": "s355", // Track → 3-5/8" 20ga Track (LF)
  "ext-ms-bridging": "s388", // Bridging → Metal Stud Bridging/Bracing, Flat Strap (LF)
  "ext-ms-sheathing": "s395", // Sheathing → DensGlass 1/2" (SF) — default
  "ext-ms-insul": "s083", // Wall Insulation → Batt Insulation, R-13 (SF)

  // ── Interior Walls — Metal Stud derived items (static fallbacks — dynamic lookup overrides) ──
  "int-ms-studs": "s354", // Metal Studs → 3-5/8" 20ga (LF) — default; dynamic picks exact gauge/size
  "int-ms-track": "s355", // Track → 3-5/8" 20ga Track (LF)
  "int-ms-bridging": "s388", // Bridging → Metal Stud Bridging/Bracing, Flat Strap (LF)
  "int-ms-insul": "s083", // Wall Insulation → Batt Insulation, R-13 (SF)

  // ── Drywall (derived-only group — global) ──
  "dw-sheets": "s105", // Drywall Sheets → Gypsum Board, 1/2" Standard (SF) — default
  "dw-compound": "s313", // Joint Compound → Joint Compound, All-Purpose (GAL)
  "dw-tape": "s314", // Joint Tape → Joint Tape, Paper (ROLL)
  "dw-screws": "s315", // Drywall Screws → Drywall Screws, Coarse Thread (LBS)

  // ── Drywall (per-instance — ext walls, 1 side) ──
  "ext-dw-sheets": "s105", // Drywall Sheets → Gypsum Board, 1/2" Standard (SF)
  "ext-dw-compound": "s313", // Joint Compound → Joint Compound, All-Purpose (GAL)
  "ext-dw-tape": "s314", // Joint Tape → Joint Tape, Paper (ROLL)
  "ext-dw-screws": "s315", // Drywall Screws → Drywall Screws, Coarse Thread (LBS)

  // ── Drywall (per-instance — int walls, 2 sides) ──
  "int-dw-sheets": "s105", // Drywall Sheets → Gypsum Board, 1/2" Standard (SF)
  "int-dw-compound": "s313", // Joint Compound → Joint Compound, All-Purpose (GAL)
  "int-dw-tape": "s314", // Joint Tape → Joint Tape, Paper (ROLL)
  "int-dw-screws": "s315", // Drywall Screws → Drywall Screws, Coarse Thread (LBS)

  // ═══════════════════════════════════════════════════════════════════════════
  // FLOORS MODULE
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Floor Structure — Wood Framing ──
  "flr-joists": "s601", // Floor Joists → Floor Joist, 2x10 SPF (LF) — default 2x10
  "flr-subfloor": "s607", // Subfloor Sheathing → Subfloor, 3/4" T&G OSB (SF) — default
  "flr-bridging": "s040", // Bridging → Blocking & Backing, 2x (misc) (LF)

  // ── Floor Structure — Wood Trusses ──
  "flr-trusses": "s591", // Floor Trusses → Floor Truss, 14" Open Web (LF) — default 14"
  "flr-truss-subfloor": "s607", // Subfloor Sheathing → Subfloor, 3/4" T&G OSB (SF)
  "flr-truss-bearing": "s595", // Bearing / Rim Board → Truss Bearing / Rim Board (LF)
  "flr-truss-bracing": "s596", // Bracing → Truss Strongback Bracing (LF)

  // ── Floor Structure — Steel Deck ──
  "flr-deck": "s611", // Steel Deck → Steel Deck, 1.5" B Deck 20ga (SF)
  "flr-deck-conc": "s622", // Concrete Fill → NW Concrete Topping (on deck) (CY)
  "flr-deck-studs": "s615", // Shear Studs → Shear Studs, 3/4" x 3" (EA)
  "flr-deck-fireproof": "s617", // Fireproofing → Spray Fireproofing, 1-HR (SF)

  // ── Floor Structure — Concrete on Deck ──
  "flr-elev-formwork": "s620", // Formwork / Shoring → Elevated Slab Formwork / Reshoring (SF)
  "flr-elev-concrete": "s006", // Concrete → Concrete, Ready Mix, 4000 PSI (CY)
  "flr-elev-top-rebar": "s003", // Top Rebar → Rebar, #4 Grade 60 (LB)
  "flr-elev-bot-rebar": "s003", // Bottom Rebar → Rebar, #4 Grade 60 (LB)
  "flr-elev-wwf": "s005", // Welded Wire Fabric → Welded Wire Mesh, 6x6 W1.4 (SF)
  "flr-elev-finish": "s624", // Slab Finishing → Elevated Slab Finishing, Trowel (SF)
  "flr-elev-curing": "s010", // Curing → Concrete Curing Compound (SF)

  // ── Floor Structure — Precast Plank ──
  "flr-plank": "s627", // Precast Planks → Precast Hollow Core Plank, 8" (SF)
  "flr-plank-erect": "s627", // Plank Erection → same as plank (erection included in rate)
  "flr-plank-topping": "s622", // Topping Concrete → NW Concrete Topping (on deck) (CY)
  "flr-plank-wwf": "s005", // Topping WWF → Welded Wire Mesh, 6x6 W1.4 (SF)
  "flr-plank-grout": "s630", // Keyway Grout → Precast Plank Grout, Keyway (LF)

  // ── Floor Structure — CLT ──
  "flr-clt-panels": "s634", // CLT Panels → CLT Floor Panel, 5-ply 6-7/8" (SF)
  "flr-clt-connectors": "s636", // Panel Connectors → CLT Panel Connector, Self-Tapping Screws (EA)
  "flr-clt-topping": "s638", // Topping / Mat → CLT Acoustic Mat / Topping (SF)
  "flr-clt-erection": "s634", // Crane / Erection → CLT panel rate (erection included)

  // ── Floor Finishes ──
  "flr-finish-material": "s641", // Finish Material → Carpet Tile, Standard (SF) — default
  "flr-finish-underlay": "s652", // Underlayment → Floor Underlayment, Cement Board (SF) — default

  // ── Ceiling Finishes ──
  "ceil-material": "s660", // Ceiling Material → ACT Ceiling, 2x2 Standard (SF) — default
  "ceil-grid": "s663", // Ceiling Grid → ACT Grid, 15/16" Exposed Tee (SF)
  "ceil-suspension": "s669", // Suspension / Hangers → Ceiling Suspension Wire & Hanger (SF)
  "ceil-seismic": "s670", // Seismic Bracing → Seismic Ceiling Bracing (SF)

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOF MODULE
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Roof Structure — Wood Trusses ──
  "roof-trusses": "s702", // Roof Trusses → Roof Truss, 32ft Span Common (EA) — default
  "roof-truss-sheathing": "s717", // Roof Sheathing → Roof Sheathing, 7/16" OSB (SF) — default
  "roof-truss-bracing": "s706", // Truss Bracing → Truss Bracing, Permanent (LF)

  // ── Roof Structure — Wood Rafters ──
  "roof-rafters": "s711", // Roof Rafters → Roof Rafter, 2x8 SPF (LF) — default
  "roof-ridge": "s714", // Ridge Board / Beam → Ridge Board / Beam (LF)
  "roof-collar-ties": "s715", // Collar Ties / Ceiling Joists → Collar Ties / Ceiling Joists (LF)
  "roof-rafter-sheathing": "s717", // Roof Sheathing → Roof Sheathing, 7/16" OSB (SF) — default

  // ── Roof Structure — Steel Joist/Deck ──
  "roof-steel-joists": "s721", // Steel Joists → Steel Open Web Joist, 22K (LF) — default
  "roof-steel-deck": "s724", // Steel Roof Deck → Steel Roof Deck, 1.5" B 20ga (SF) — default
  "roof-steel-bridging": "s726", // Joist Bridging → Joist Bridging, Horizontal (LF)

  // ── Roof Structure — Precast/Concrete ──
  "roof-precast-panels": "s730", // Precast Panels → Precast Roof Double Tee, 8ft Wide (SF)
  "roof-precast-erection": "s733", // Crane / Erection → Precast Roof Erection, Crane (SF)
  "roof-precast-topping": "s734", // Topping Concrete → Concrete Roof Topping, NW (CY)
  "roof-precast-insul": "s732", // Insulating Fill → Roof Insulating Concrete Fill (SF)

  // ── Roof Structure — SIP Panels ──
  "roof-sip-panels": "s737", // SIP Roof Panels → SIP Roof Panel, 8-1/4" (SF) — default
  "roof-sip-splines": "s739", // Splines / Sealant → SIP Roof Spline / Sealant (LF)

  // ── Roofing Finishes ──
  "roof-finish-material": "s741", // Roofing Material → Asphalt Shingles, Architectural (SF) — default
  "roof-underlayment": "s752", // Underlayment → Underlayment, Synthetic (SF) — default
  "roof-flashing-step": "s754", // Step / Base Flashing → Flashing, Step / Base (LF)
  "roof-flashing-ridge": "s755", // Ridge / Valley Flashing → Flashing, Ridge / Valley (LF)
  "roof-ridge-vent": "s756", // Ridge Vent → Ridge Vent, Continuous (LF)

  // ── Gutters & Drainage ──
  "gutter-material": "s760", // Gutter → Gutter, K-Style 5" Aluminum (LF) — default
  "gutter-downspout": "s763", // Downspout → Downspout, 3" x 4" Aluminum (LF)
  "gutter-guard": "s764", // Gutter Guard → Gutter Guard / Screen (LF)
  "gutter-scupper": "s765", // Scupper & Overflow → Commercial Scupper & Overflow (EA)

  // ═══════════════════════════════════════════════════════════════════════════
  // STEEL MODULE
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Structural Framing ──
  "stl-connections": "s818", // Fabricated Connections → Fabricated Steel Connections (EA)
  "stl-bolts": "s800", // High-Strength Bolts → High-Strength Bolts, A325 (LBS)
  "stl-field-weld": "s801", // Structural Welding, Field → Structural Welding, Field (LF)
  "stl-shop-primer": "s802", // Shop Primer Paint → Shop Primer Paint, Structural Steel (SF)
  "stl-fireproof": "s803", // Fireproofing → Spray-On Fireproofing (SFRM), 1-HR (SF) — default
  "stl-anchor-bolts": "s805", // Anchor Bolts → Anchor Bolts w/ Nut & Washer, 3/4" x 18" (EA)
  "stl-base-plates": "s806", // Base Plates → Steel Base Plates, Fabricated (EA)

  // ── Steel Joists ──
  "jst-lf": "s807", // Steel Joists → Steel Joists, K-Series (General) (LF) — default
  "jst-bridging": "s810", // Joist Bridging → Joist Bridging, Horizontal (LF)
  "jst-girders": "s811", // Joist Girders → Joist Girders (EA)

  // ── Steel Decking ──
  "dk-material": "s611", // Steel Deck → Steel Deck, 1.5" B Deck 20ga (SF) — default
  "dk-shear-studs": "s815", // Shear Studs → Shear Studs, 3/4" dia x 3" (EA)
  "dk-composite-conc": "s814", // Composite Concrete → Composite Concrete Fill, Normal Weight (CY)
  "dk-pour-stop": "s816", // Pour Stop / Edge Angle → Pour Stop / Edge Angle (LF)
  "dk-welding": "s817", // Deck Welding → Deck Welding / Puddle Welds (SF)

  // ── Misc Steel & Fabrications ──
  "misc-lintels": "s019", // Metal Lintels / Angles → Metal Fabrications, Misc (LB)
  "misc-embeds": "s278", // Embed Plates → Embed Plates, Misc Steel (EA)
  "misc-stairs": "s020", // Metal Stairs → Metal Stairs, Steel Pan w/ Concrete Fill (FLT)
  "misc-railings": "s021", // Metal Railings → Metal Railings, Steel Pipe (LF)
  "misc-grating": "s022", // Steel Grating → Steel Grating, Bar Type (SF)
};

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic seed lookup — picks correct seed based on instance specs (gauge+size)
// ─────────────────────────────────────────────────────────────────────────────

// Metal Stud → seed ID lookup by gauge × size
const MS_STUD_SEEDS = {
  "20 ga": { '1-5/8"': "s350", '2-1/2"': "s352", '3-5/8"': "s354", '6"': "s356" },
  "25 ga": { '3-5/8"': "s358", '6"': "s360" },
  "22 ga": { '3-5/8"': "s354", '6"': "s356" }, // 22ga → use 20ga pricing (closest)
  "18 ga": { '3-5/8"': "s362", '6"': "s364", '8"': "s366" },
  "16 ga": { '3-5/8"': "s368", '6"': "s370", '8"': "s372" },
  "14 ga": { '3-5/8"': "s374", '6"': "s376", '8"': "s378" },
  "12 ga": { '6"': "s380", '8"': "s382" },
};
const MS_TRACK_SEEDS = {
  "20 ga": { '1-5/8"': "s351", '2-1/2"': "s353", '3-5/8"': "s355", '6"': "s357" },
  "25 ga": { '3-5/8"': "s359", '6"': "s361" },
  "22 ga": { '3-5/8"': "s355", '6"': "s357" },
  "18 ga": { '3-5/8"': "s363", '6"': "s365", '8"': "s367" },
  "16 ga": { '3-5/8"': "s369", '6"': "s371", '8"': "s373" },
  "14 ga": { '3-5/8"': "s375", '6"': "s377", '8"': "s379" },
  "12 ga": { '6"': "s381", '8"': "s383" },
};

// Resolve size → closest available in a gauge row (for sizes like 4", 10" that lack exact seeds)
function findMSSize(gaugeRow, size) {
  if (!gaugeRow) return null;
  if (gaugeRow[size]) return gaugeRow[size];
  // Parse numeric inches for closest match
  const numMatch = size.match(/([\d\-/]+)/);
  const sizeNum = numMatch ? parseFloat(numMatch[1].replace(/-/, ".").replace(/\//, ".")) : 0;
  let bestId = null,
    bestDelta = Infinity;
  for (const [k, v] of Object.entries(gaugeRow)) {
    const km = k.match(/([\d\-/]+)/);
    const kn = km ? parseFloat(km[1].replace(/-/, ".").replace(/\//, ".")) : 0;
    const delta = Math.abs(kn - sizeNum);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestId = v;
    }
  }
  return bestId;
}

function resolveSpecSeed(moduleItemId, specs) {
  if (!specs) return null;
  const gauge = specs.MSGauge || "20 ga";
  const size = specs.MSStudSize || '3-5/8"';

  if (moduleItemId === "ext-ms-studs" || moduleItemId === "int-ms-studs") {
    return findMSSize(MS_STUD_SEEDS[gauge] || MS_STUD_SEEDS["20 ga"], size);
  }
  if (moduleItemId === "ext-ms-track" || moduleItemId === "int-ms-track") {
    return findMSSize(MS_TRACK_SEEDS[gauge] || MS_TRACK_SEEDS["20 ga"], size);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Look up cost for a module-derived item
// Returns { m, l, e } (material, labor, equipment per unit)
// specs: optional instance specs for dynamic gauge/size lookup
// ─────────────────────────────────────────────────────────────────────────────
export function getModuleItemCosts(moduleItemId, specs) {
  // Try dynamic spec-based lookup first (metal studs with gauge/size)
  const dynamicId = resolveSpecSeed(moduleItemId, specs);
  const seedId = dynamicId || SEED_MAP[moduleItemId];
  if (seedId) {
    const seed = SEED_ELEMENTS.find(s => s.id === seedId);
    if (seed) return { m: seed.material, l: seed.labor, e: seed.equipment };
  }
  return { m: 0, l: 0, e: 0 };
}

// Export the raw map for debugging / introspection
export { SEED_MAP };
