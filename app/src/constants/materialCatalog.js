// materialCatalog.js — Construction material catalog for NOVA 3D model
// Each entry has: visual properties, cost data, schedule data, assembly specs
// Costs are national averages ($/unit installed) — refined by NOVA Core over time
//
// Categories: exterior-cladding, roofing, interior-wall, flooring,
//             ceiling, glazing, plumbing-fixture, concrete

export const MATERIAL_CATEGORIES = [
  { key: "exterior-cladding", label: "Exterior Cladding" },
  { key: "roofing", label: "Roofing" },
  { key: "interior-wall", label: "Interior Wall Finish" },
  { key: "flooring", label: "Flooring" },
  { key: "ceiling", label: "Ceiling" },
  { key: "glazing", label: "Glazing & Curtain Wall" },
  { key: "plumbing-fixture", label: "Plumbing Fixtures" },
  { key: "concrete", label: "Concrete & Masonry" },
];

// ── Exterior Cladding ────────────────────────────────────────────
const EXTERIOR_CLADDING = [
  {
    slug: "hardie-lap-siding",
    name: "James Hardie Lap Siding",
    manufacturer: "James Hardie",
    category: "exterior-cladding",
    visual: { color: "#E8DCC8", roughness: 0.6, metalness: 0, pattern: "horizontal-lap", patternScale: 7 },
    cost: { materialPerUnit: 4.25, laborPerUnit: 6.50, totalPerUnit: 10.75, unit: "SF" },
    schedule: { installRate: 200, crewSize: 3, leadTimeDays: 14 },
    assembly: {
      layers: [
        { name: "Hardie Plank 5/16\"", thickness: 0.3125 },
        { name: "Tyvek HomeWrap", thickness: 0.01 },
        { name: "OSB Sheathing 7/16\"", thickness: 0.4375 },
      ],
      rValue: 4, fireRating: "1-HR", stc: 38,
    },
    specSection: "07 46 23",
    ifcMaterial: "Fiber Cement Lap Siding",
  },
  {
    slug: "cedar-bevel-siding",
    name: "Western Red Cedar Bevel Siding",
    manufacturer: "Various",
    category: "exterior-cladding",
    visual: { color: "#C4956A", roughness: 0.7, metalness: 0, pattern: "horizontal-lap", patternScale: 8 },
    cost: { materialPerUnit: 8.50, laborPerUnit: 8.00, totalPerUnit: 16.50, unit: "SF" },
    schedule: { installRate: 160, crewSize: 3, leadTimeDays: 21 },
    assembly: {
      layers: [
        { name: "3/4\" WRC Bevel", thickness: 0.75 },
        { name: "Tyvek HomeWrap", thickness: 0.01 },
        { name: "OSB Sheathing 7/16\"", thickness: 0.4375 },
      ],
      rValue: 5, fireRating: "0-HR", stc: 36,
    },
    specSection: "07 46 13",
    ifcMaterial: "Western Red Cedar Siding",
  },
  {
    slug: "vinyl-siding",
    name: "Vinyl Siding Double 4\"",
    manufacturer: "CertainTeed",
    category: "exterior-cladding",
    visual: { color: "#D4D0C8", roughness: 0.4, metalness: 0, pattern: "horizontal-lap", patternScale: 4 },
    cost: { materialPerUnit: 2.50, laborPerUnit: 3.50, totalPerUnit: 6.00, unit: "SF" },
    schedule: { installRate: 300, crewSize: 3, leadTimeDays: 7 },
    assembly: {
      layers: [
        { name: "Vinyl Siding .044\"", thickness: 0.044 },
        { name: "Fanfold Insulation", thickness: 0.25 },
        { name: "OSB Sheathing 7/16\"", thickness: 0.4375 },
      ],
      rValue: 3, fireRating: "0-HR", stc: 32,
    },
    specSection: "07 46 43",
    ifcMaterial: "Vinyl Siding",
  },
  {
    slug: "metal-panel-ribbed",
    name: "Metal Wall Panel Ribbed 24ga",
    manufacturer: "MBCI",
    category: "exterior-cladding",
    visual: { color: "#C0C0C0", roughness: 0.2, metalness: 0.8, pattern: "vertical-rib", patternScale: 12 },
    cost: { materialPerUnit: 6.00, laborPerUnit: 5.00, totalPerUnit: 11.00, unit: "SF" },
    schedule: { installRate: 250, crewSize: 4, leadTimeDays: 21 },
    assembly: {
      layers: [
        { name: "24ga Steel Panel", thickness: 0.025 },
        { name: "Rigid Insulation 2\"", thickness: 2 },
        { name: "Steel Girt", thickness: 1.5 },
      ],
      rValue: 13, fireRating: "1-HR", stc: 35,
    },
    specSection: "07 42 13",
    ifcMaterial: "Metal Wall Panel",
  },
  {
    slug: "eifs-stucco",
    name: "EIFS / Synthetic Stucco",
    manufacturer: "Dryvit",
    category: "exterior-cladding",
    visual: { color: "#F5F0E8", roughness: 0.7, metalness: 0, pattern: "stucco", patternScale: 1 },
    cost: { materialPerUnit: 7.50, laborPerUnit: 9.50, totalPerUnit: 17.00, unit: "SF" },
    schedule: { installRate: 120, crewSize: 4, leadTimeDays: 14 },
    assembly: {
      layers: [
        { name: "EIFS Finish Coat", thickness: 0.125 },
        { name: "EPS Insulation 2\"", thickness: 2 },
        { name: "Base Coat + Mesh", thickness: 0.125 },
      ],
      rValue: 11, fireRating: "1-HR", stc: 40,
    },
    specSection: "07 24 13",
    ifcMaterial: "EIFS",
  },
  {
    slug: "brick-veneer",
    name: "Standard Brick Veneer",
    manufacturer: "Various",
    category: "exterior-cladding",
    visual: { color: "#B5651D", roughness: 0.8, metalness: 0, pattern: "brick", patternScale: 2.67 },
    cost: { materialPerUnit: 8.00, laborPerUnit: 14.00, totalPerUnit: 22.00, unit: "SF" },
    schedule: { installRate: 80, crewSize: 4, leadTimeDays: 21 },
    assembly: {
      layers: [
        { name: "Standard Brick 3-5/8\"", thickness: 3.625 },
        { name: "1\" Air Space", thickness: 1 },
        { name: "Building Wrap", thickness: 0.01 },
      ],
      rValue: 5, fireRating: "2-HR", stc: 45,
    },
    specSection: "04 21 13",
    ifcMaterial: "Brick Veneer",
  },
];

// ── Roofing ──────────────────────────────────────────────────────
const ROOFING = [
  {
    slug: "tpo-60mil",
    name: "TPO Membrane 60mil",
    manufacturer: "Carlisle",
    category: "roofing",
    visual: { color: "#E8E8E8", roughness: 0.3, metalness: 0, pattern: "smooth", patternScale: 1 },
    cost: { materialPerUnit: 3.50, laborPerUnit: 4.75, totalPerUnit: 8.25, unit: "SF" },
    schedule: { installRate: 400, crewSize: 5, leadTimeDays: 14 },
    assembly: {
      layers: [
        { name: "TPO Membrane 60mil", thickness: 0.06 },
        { name: "Polyiso Insulation 3\"", thickness: 3 },
        { name: "Vapor Barrier", thickness: 0.01 },
      ],
      rValue: 18, fireRating: "A", stc: 0,
    },
    specSection: "07 54 23",
    ifcMaterial: "TPO Roofing Membrane",
  },
  {
    slug: "epdm-60mil",
    name: "EPDM Membrane 60mil",
    manufacturer: "Firestone",
    category: "roofing",
    visual: { color: "#2D2D2D", roughness: 0.5, metalness: 0, pattern: "smooth", patternScale: 1 },
    cost: { materialPerUnit: 3.00, laborPerUnit: 4.00, totalPerUnit: 7.00, unit: "SF" },
    schedule: { installRate: 450, crewSize: 5, leadTimeDays: 10 },
    assembly: {
      layers: [
        { name: "EPDM Membrane 60mil", thickness: 0.06 },
        { name: "Polyiso Insulation 3\"", thickness: 3 },
        { name: "Vapor Barrier", thickness: 0.01 },
      ],
      rValue: 18, fireRating: "A", stc: 0,
    },
    specSection: "07 53 23",
    ifcMaterial: "EPDM Roofing Membrane",
  },
  {
    slug: "standing-seam-metal",
    name: "Standing Seam Metal Roof 24ga",
    manufacturer: "Berridge",
    category: "roofing",
    visual: { color: "#8B8B8B", roughness: 0.2, metalness: 0.7, pattern: "vertical-rib", patternScale: 16 },
    cost: { materialPerUnit: 8.00, laborPerUnit: 7.00, totalPerUnit: 15.00, unit: "SF" },
    schedule: { installRate: 150, crewSize: 4, leadTimeDays: 28 },
    assembly: {
      layers: [
        { name: "24ga Steel Panel", thickness: 0.025 },
        { name: "Underlayment", thickness: 0.0625 },
        { name: "Rigid Insulation 2\"", thickness: 2 },
      ],
      rValue: 13, fireRating: "A", stc: 30,
    },
    specSection: "07 41 13",
    ifcMaterial: "Standing Seam Metal Roof",
  },
  {
    slug: "asphalt-shingle",
    name: "Architectural Asphalt Shingle",
    manufacturer: "GAF",
    category: "roofing",
    visual: { color: "#4A4A4A", roughness: 0.8, metalness: 0, pattern: "shingle", patternScale: 5 },
    cost: { materialPerUnit: 2.25, laborPerUnit: 3.75, totalPerUnit: 6.00, unit: "SF" },
    schedule: { installRate: 500, crewSize: 5, leadTimeDays: 7 },
    assembly: {
      layers: [
        { name: "Architectural Shingle", thickness: 0.25 },
        { name: "Underlayment", thickness: 0.0625 },
        { name: "Plywood Sheathing 1/2\"", thickness: 0.5 },
      ],
      rValue: 1, fireRating: "A", stc: 0,
    },
    specSection: "07 31 13",
    ifcMaterial: "Asphalt Shingle",
  },
];

// ── Interior Wall ────────────────────────────────────────────────
const INTERIOR_WALL = [
  {
    slug: "gwb-1-layer",
    name: "5/8\" GWB on Metal Studs (1 Layer)",
    manufacturer: "USG",
    category: "interior-wall",
    visual: { color: "#F0EDE8", roughness: 0.9, metalness: 0, pattern: "smooth", patternScale: 1 },
    cost: { materialPerUnit: 2.80, laborPerUnit: 4.50, totalPerUnit: 7.30, unit: "SF" },
    schedule: { installRate: 350, crewSize: 3, leadTimeDays: 5 },
    assembly: {
      layers: [
        { name: "5/8\" GWB", thickness: 0.625 },
        { name: "3-5/8\" Metal Stud 20ga", thickness: 3.625 },
        { name: "5/8\" GWB", thickness: 0.625 },
      ],
      rValue: 4, fireRating: "1-HR", stc: 40,
    },
    specSection: "09 21 16",
    ifcMaterial: "Gypsum Board on Metal Studs",
  },
  {
    slug: "gwb-2-layer",
    name: "5/8\" GWB on Metal Studs (2 Layer)",
    manufacturer: "USG",
    category: "interior-wall",
    visual: { color: "#F0EDE8", roughness: 0.9, metalness: 0, pattern: "smooth", patternScale: 1 },
    cost: { materialPerUnit: 4.20, laborPerUnit: 6.00, totalPerUnit: 10.20, unit: "SF" },
    schedule: { installRate: 250, crewSize: 3, leadTimeDays: 5 },
    assembly: {
      layers: [
        { name: "5/8\" GWB (x2)", thickness: 1.25 },
        { name: "3-5/8\" Metal Stud 20ga", thickness: 3.625 },
        { name: "5/8\" GWB (x2)", thickness: 1.25 },
      ],
      rValue: 5, fireRating: "2-HR", stc: 50,
    },
    specSection: "09 21 16",
    ifcMaterial: "Gypsum Board on Metal Studs (2 Layer)",
  },
  {
    slug: "cmu-8-block",
    name: "CMU 8\" Block — Painted",
    manufacturer: "Various",
    category: "interior-wall",
    visual: { color: "#A0A0A0", roughness: 0.9, metalness: 0, pattern: "block", patternScale: 8 },
    cost: { materialPerUnit: 6.50, laborPerUnit: 10.50, totalPerUnit: 17.00, unit: "SF" },
    schedule: { installRate: 100, crewSize: 4, leadTimeDays: 10 },
    assembly: {
      layers: [{ name: "8\" CMU Block", thickness: 7.625 }],
      rValue: 2, fireRating: "2-HR", stc: 48,
    },
    specSection: "04 22 00",
    ifcMaterial: "Concrete Masonry Unit",
  },
];

// ── Flooring ─────────────────────────────────────────────────────
const FLOORING = [
  {
    slug: "lvt-plank",
    name: "Luxury Vinyl Tile Plank",
    manufacturer: "Shaw",
    category: "flooring",
    visual: { color: "#B8A088", roughness: 0.4, metalness: 0, pattern: "wood-plank", patternScale: 6 },
    cost: { materialPerUnit: 3.50, laborPerUnit: 3.00, totalPerUnit: 6.50, unit: "SF" },
    schedule: { installRate: 400, crewSize: 2, leadTimeDays: 10 },
    assembly: {
      layers: [{ name: "LVT Plank 5mm", thickness: 0.2 }, { name: "Underlayment", thickness: 0.08 }],
      rValue: 0, fireRating: "Class I", stc: 0,
    },
    specSection: "09 65 16",
    ifcMaterial: "Luxury Vinyl Tile",
  },
  {
    slug: "carpet-tile",
    name: "Carpet Tile 24\" × 24\"",
    manufacturer: "Interface",
    category: "flooring",
    visual: { color: "#7A7A7A", roughness: 0.9, metalness: 0, pattern: "carpet", patternScale: 2 },
    cost: { materialPerUnit: 2.75, laborPerUnit: 1.50, totalPerUnit: 4.25, unit: "SF" },
    schedule: { installRate: 600, crewSize: 2, leadTimeDays: 7 },
    assembly: {
      layers: [{ name: "Carpet Tile", thickness: 0.25 }],
      rValue: 1, fireRating: "Class I", stc: 0,
    },
    specSection: "09 68 13",
    ifcMaterial: "Carpet Tile",
  },
  {
    slug: "polished-concrete",
    name: "Polished Concrete Floor",
    manufacturer: "N/A",
    category: "flooring",
    visual: { color: "#BCBCBC", roughness: 0.3, metalness: 0.1, pattern: "smooth", patternScale: 1 },
    cost: { materialPerUnit: 2.00, laborPerUnit: 4.00, totalPerUnit: 6.00, unit: "SF" },
    schedule: { installRate: 500, crewSize: 3, leadTimeDays: 3 },
    assembly: {
      layers: [{ name: "Polished Concrete Slab", thickness: 0.25 }],
      rValue: 0, fireRating: "Class A", stc: 0,
    },
    specSection: "03 35 00",
    ifcMaterial: "Polished Concrete",
  },
  {
    slug: "ceramic-tile",
    name: "Ceramic Floor Tile 12\" × 12\"",
    manufacturer: "Daltile",
    category: "flooring",
    visual: { color: "#D4C8B8", roughness: 0.4, metalness: 0, pattern: "tile-grid", patternScale: 1 },
    cost: { materialPerUnit: 4.50, laborPerUnit: 7.50, totalPerUnit: 12.00, unit: "SF" },
    schedule: { installRate: 100, crewSize: 2, leadTimeDays: 10 },
    assembly: {
      layers: [
        { name: "Ceramic Tile 3/8\"", thickness: 0.375 },
        { name: "Thinset Mortar", thickness: 0.125 },
        { name: "Cement Board 1/4\"", thickness: 0.25 },
      ],
      rValue: 0, fireRating: "Class A", stc: 0,
    },
    specSection: "09 30 13",
    ifcMaterial: "Ceramic Tile",
  },
];

// ── Ceiling ──────────────────────────────────────────────────────
const CEILING = [
  {
    slug: "act-2x4",
    name: "Acoustical Ceiling Tile 2' × 4'",
    manufacturer: "Armstrong",
    category: "ceiling",
    visual: { color: "#F5F5F0", roughness: 0.9, metalness: 0, pattern: "tile-grid", patternScale: 4 },
    cost: { materialPerUnit: 2.25, laborPerUnit: 2.75, totalPerUnit: 5.00, unit: "SF" },
    schedule: { installRate: 500, crewSize: 3, leadTimeDays: 7 },
    assembly: {
      layers: [{ name: "ACT Panel 5/8\"", thickness: 0.625 }, { name: "T-Bar Grid", thickness: 1.5 }],
      rValue: 1, fireRating: "Class A", stc: 35,
    },
    specSection: "09 51 13",
    ifcMaterial: "Acoustical Ceiling Tile",
  },
  {
    slug: "gwb-ceiling",
    name: "5/8\" GWB Ceiling — Painted",
    manufacturer: "USG",
    category: "ceiling",
    visual: { color: "#FAFAF8", roughness: 0.9, metalness: 0, pattern: "smooth", patternScale: 1 },
    cost: { materialPerUnit: 3.00, laborPerUnit: 5.50, totalPerUnit: 8.50, unit: "SF" },
    schedule: { installRate: 250, crewSize: 3, leadTimeDays: 5 },
    assembly: {
      layers: [{ name: "5/8\" GWB", thickness: 0.625 }],
      rValue: 0, fireRating: "1-HR", stc: 30,
    },
    specSection: "09 21 16",
    ifcMaterial: "Gypsum Board Ceiling",
  },
];

// ── Glazing ──────────────────────────────────────────────────────
const GLAZING = [
  {
    slug: "curtain-wall-glass",
    name: "Curtain Wall — Insulated Glass",
    manufacturer: "Kawneer",
    category: "glazing",
    visual: { color: "#88C0D0", roughness: 0.1, metalness: 0.3, pattern: "glass", patternScale: 1, opacity: 0.4 },
    cost: { materialPerUnit: 35.00, laborPerUnit: 15.00, totalPerUnit: 50.00, unit: "SF" },
    schedule: { installRate: 50, crewSize: 4, leadTimeDays: 42 },
    assembly: {
      layers: [
        { name: "1\" Insulated Glass Unit", thickness: 1 },
        { name: "Aluminum Frame", thickness: 2 },
      ],
      rValue: 3, fireRating: "0-HR", stc: 32,
    },
    specSection: "08 44 13",
    ifcMaterial: "Curtain Wall Glass",
  },
  {
    slug: "storefront-glass",
    name: "Aluminum Storefront",
    manufacturer: "Kawneer",
    category: "glazing",
    visual: { color: "#A8D0E0", roughness: 0.1, metalness: 0.2, pattern: "glass", patternScale: 1, opacity: 0.5 },
    cost: { materialPerUnit: 25.00, laborPerUnit: 10.00, totalPerUnit: 35.00, unit: "SF" },
    schedule: { installRate: 80, crewSize: 3, leadTimeDays: 28 },
    assembly: {
      layers: [
        { name: "1\" Insulated Glass Unit", thickness: 1 },
        { name: "Aluminum Storefront Frame", thickness: 1.75 },
      ],
      rValue: 2, fireRating: "0-HR", stc: 30,
    },
    specSection: "08 41 13",
    ifcMaterial: "Aluminum Storefront",
  },
];

// ── Plumbing Fixtures ────────────────────────────────────────────
const PLUMBING_FIXTURE = [
  {
    slug: "kohler-simplice-faucet",
    name: "Kohler Simplice K-22036",
    manufacturer: "Kohler",
    category: "plumbing-fixture",
    visual: { color: "#C0C0C0", roughness: 0.1, metalness: 0.9, pattern: "chrome", patternScale: 1 },
    cost: { materialPerUnit: 485, laborPerUnit: 125, totalPerUnit: 610, unit: "EA" },
    schedule: { installRate: 4, crewSize: 1, leadTimeDays: 14 },
    assembly: {
      layers: [{ name: "Faucet Assembly", thickness: 0 }],
      rValue: 0, fireRating: "", stc: 0,
    },
    specSection: "22 41 16",
    ifcMaterial: "Plumbing Fixture - Faucet",
  },
  {
    slug: "delta-trinsic-faucet",
    name: "Delta Trinsic 559LF",
    manufacturer: "Delta",
    category: "plumbing-fixture",
    visual: { color: "#C0C0C0", roughness: 0.1, metalness: 0.9, pattern: "chrome", patternScale: 1 },
    cost: { materialPerUnit: 310, laborPerUnit: 115, totalPerUnit: 425, unit: "EA" },
    schedule: { installRate: 4, crewSize: 1, leadTimeDays: 7 },
    assembly: {
      layers: [{ name: "Faucet Assembly", thickness: 0 }],
      rValue: 0, fireRating: "", stc: 0,
    },
    specSection: "22 41 16",
    ifcMaterial: "Plumbing Fixture - Faucet",
  },
  {
    slug: "moen-align-faucet",
    name: "Moen Align 6192",
    manufacturer: "Moen",
    category: "plumbing-fixture",
    visual: { color: "#C0C0C0", roughness: 0.1, metalness: 0.9, pattern: "chrome", patternScale: 1 },
    cost: { materialPerUnit: 275, laborPerUnit: 115, totalPerUnit: 390, unit: "EA" },
    schedule: { installRate: 4, crewSize: 1, leadTimeDays: 10 },
    assembly: {
      layers: [{ name: "Faucet Assembly", thickness: 0 }],
      rValue: 0, fireRating: "", stc: 0,
    },
    specSection: "22 41 16",
    ifcMaterial: "Plumbing Fixture - Faucet",
  },
  {
    slug: "commercial-toilet",
    name: "Commercial Floor-Mount Toilet",
    manufacturer: "Kohler",
    category: "plumbing-fixture",
    visual: { color: "#FFFFFF", roughness: 0.2, metalness: 0.1, pattern: "porcelain", patternScale: 1 },
    cost: { materialPerUnit: 650, laborPerUnit: 350, totalPerUnit: 1000, unit: "EA" },
    schedule: { installRate: 3, crewSize: 1, leadTimeDays: 14 },
    assembly: {
      layers: [{ name: "Toilet + Flush Valve", thickness: 0 }],
      rValue: 0, fireRating: "", stc: 0,
    },
    specSection: "22 42 13",
    ifcMaterial: "Plumbing Fixture - Water Closet",
  },
  {
    slug: "commercial-lavatory",
    name: "Wall-Mount Lavatory w/ Faucet",
    manufacturer: "Kohler",
    category: "plumbing-fixture",
    visual: { color: "#FFFFFF", roughness: 0.2, metalness: 0.1, pattern: "porcelain", patternScale: 1 },
    cost: { materialPerUnit: 450, laborPerUnit: 280, totalPerUnit: 730, unit: "EA" },
    schedule: { installRate: 3, crewSize: 1, leadTimeDays: 14 },
    assembly: {
      layers: [{ name: "Lavatory + Faucet + Trap", thickness: 0 }],
      rValue: 0, fireRating: "", stc: 0,
    },
    specSection: "22 41 13",
    ifcMaterial: "Plumbing Fixture - Lavatory",
  },
];

// ── Concrete & Masonry ───────────────────────────────────────────
const CONCRETE = [
  {
    slug: "cast-concrete-wall",
    name: "Cast-in-Place Concrete Wall 8\"",
    manufacturer: "N/A",
    category: "concrete",
    visual: { color: "#BCBCBC", roughness: 0.95, metalness: 0, pattern: "smooth", patternScale: 1 },
    cost: { materialPerUnit: 12.00, laborPerUnit: 18.00, totalPerUnit: 30.00, unit: "SF" },
    schedule: { installRate: 50, crewSize: 6, leadTimeDays: 5 },
    assembly: {
      layers: [{ name: "8\" Cast Concrete", thickness: 8 }],
      rValue: 2, fireRating: "4-HR", stc: 55,
    },
    specSection: "03 30 00",
    ifcMaterial: "Cast-in-Place Concrete",
  },
  {
    slug: "cmu-12-grouted",
    name: "CMU 12\" Grouted & Reinforced",
    manufacturer: "Various",
    category: "concrete",
    visual: { color: "#A0A0A0", roughness: 0.9, metalness: 0, pattern: "block", patternScale: 8 },
    cost: { materialPerUnit: 9.00, laborPerUnit: 13.00, totalPerUnit: 22.00, unit: "SF" },
    schedule: { installRate: 80, crewSize: 4, leadTimeDays: 10 },
    assembly: {
      layers: [{ name: "12\" CMU Grouted", thickness: 11.625 }],
      rValue: 3, fireRating: "4-HR", stc: 55,
    },
    specSection: "04 22 00",
    ifcMaterial: "Concrete Masonry Unit Grouted",
  },
];

// ── Combined catalog ─────────────────────────────────────────────
export const MATERIAL_CATALOG = [
  ...EXTERIOR_CLADDING,
  ...ROOFING,
  ...INTERIOR_WALL,
  ...FLOORING,
  ...CEILING,
  ...GLAZING,
  ...PLUMBING_FIXTURE,
  ...CONCRETE,
];

// Slug → material index for O(1) lookup
export const MATERIAL_INDEX = Object.fromEntries(MATERIAL_CATALOG.map(m => [m.slug, m]));
