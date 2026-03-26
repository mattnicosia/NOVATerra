// Scope Templates — building-type-specific scope items
// Each template defines the typical scope for that building type.
// Items include: CSI division, description, quantity formula, unit, typical unit cost range.
// Quantity formulas reference: SF (project square footage), FLOORS (floor count), PERIM (perimeter estimate).
//
// These are NOT AI-generated. They encode Matt's 15+ years of estimating experience.
// Each item answers: "What does this building type ALWAYS need?"

// ── Helper: estimate perimeter from SF (assumes roughly rectangular, 1.5:1 ratio) ──
function estimatePerimeter(sf, floors = 1) {
  const floorSF = sf / Math.max(floors, 1);
  const ratio = 1.5;
  const depth = Math.sqrt(floorSF / ratio);
  const width = depth * ratio;
  return Math.round(2 * (width + depth));
}

// ── Scope item factory ──
function item(division, code, description, qtyFn, unit, lowRate, highRate, opts = {}) {
  return { division, code, description, qtyFn, unit, lowRate, highRate, ...opts };
}

// ── SHARED ITEMS — appear in most building types ──
const COMMON_GENERAL = [
  item("01", "01 10 00", "General Conditions", (sf) => 1, "LS", null, null, { pctOfTotal: [0.08, 0.12], note: "8-12% of total construction cost" }),
  item("01", "01 50 00", "Temporary Facilities & Controls", (sf) => 1, "LS", null, null, { pctOfTotal: [0.02, 0.04] }),
  item("01", "01 74 00", "Final Cleaning", (sf) => sf, "SF", 0.35, 0.75),
];

const COMMON_SITEWORK = [
  item("02", "02 41 00", "Demolition (Selective)", (sf) => sf * 0.3, "SF", 3, 8, { workType: ["renovation", "tenant-improvement"] }),
  item("31", "31 10 00", "Site Clearing", (sf) => sf * 0.5, "SF", 0.50, 2.00, { workType: ["", "addition"] }),
  item("31", "31 23 00", "Excavation & Fill", (sf) => sf * 0.15, "CY", 8, 25, { workType: ["", "addition"] }),
];

const COMMON_CONCRETE = [
  item("03", "03 30 00", "Cast-in-Place Concrete (SOG)", (sf, floors) => sf / Math.max(floors, 1), "SF", 6, 12),
  item("03", "03 11 00", "Concrete Forming", (sf, floors) => sf / Math.max(floors, 1) * 0.3, "SF", 4, 10),
  item("03", "03 21 00", "Reinforcing Steel", (sf, floors) => sf / Math.max(floors, 1) * 0.001, "TON", 1800, 2800),
];

const COMMON_METALS = [
  item("05", "05 12 00", "Structural Steel Framing", (sf) => sf * 0.008, "TON", 3500, 5500),
  item("05", "05 50 00", "Metal Fabrications (Misc. Metals)", (sf) => 1, "LS", null, null, { pctOfTotal: [0.01, 0.025] }),
];

const COMMON_WOOD = [
  item("06", "06 10 00", "Rough Carpentry", (sf) => sf, "SF", 2, 6),
  item("06", "06 20 00", "Finish Carpentry", (sf, floors, perim) => perim * Math.max(floors, 1), "LF", 8, 20),
];

const COMMON_THERMAL = [
  item("07", "07 21 00", "Building Insulation", (sf, floors, perim) => perim * 10 * Math.max(floors, 1), "SF", 1.50, 4.00),
  item("07", "07 92 00", "Joint Sealants", (sf, floors, perim) => perim * Math.max(floors, 1) * 2, "LF", 2, 6),
];

const COMMON_DOORS = [
  item("08", "08 11 00", "Metal Doors & Frames", (sf) => Math.max(2, Math.round(sf / 300)), "EA", 800, 1800),
  item("08", "08 71 00", "Door Hardware", (sf) => Math.max(2, Math.round(sf / 300)), "EA", 350, 800),
];

const COMMON_DRYWALL = [
  item("09", "09 21 16", "Gypsum Board Assemblies (Walls)", (sf, floors, perim) => (perim + sf / 200 * 10) * 10 * Math.max(floors, 1), "SF", 3, 7),
  item("09", "09 22 16", "Metal Stud Framing", (sf, floors, perim) => (perim + sf / 200 * 10) * 10 * Math.max(floors, 1), "SF", 2, 5),
];

const COMMON_FINISHES = [
  item("09", "09 51 00", "Acoustical Ceilings", (sf, floors) => sf * 0.7, "SF", 3, 8),
  item("09", "09 91 00", "Painting", (sf, floors, perim) => (perim + sf / 200 * 10) * 10 * Math.max(floors, 1) * 2, "SF", 0.80, 2.50),
];

const COMMON_FLOORING = [
  item("09", "09 65 00", "Resilient Flooring (VCT/LVT)", (sf) => sf * 0.6, "SF", 4, 10),
];

const COMMON_SPECIALTIES = [
  item("10", "10 14 00", "Signage", (sf) => 1, "LS", 2000, 8000),
  item("10", "10 28 00", "Toilet Accessories", (sf) => Math.max(1, Math.round(sf / 2000)), "SET", 800, 2000),
];

const COMMON_PLUMBING = [
  item("22", "22 10 00", "Plumbing Piping", (sf) => sf, "SF", 4, 12),
  item("22", "22 40 00", "Plumbing Fixtures", (sf) => Math.max(2, Math.round(sf / 500)), "EA", 800, 2500),
];

const COMMON_HVAC = [
  item("23", "23 00 00", "HVAC System", (sf) => sf, "SF", 12, 30),
];

const COMMON_ELECTRICAL = [
  item("26", "26 05 00", "Electrical Wiring & Devices", (sf) => sf, "SF", 8, 20),
  item("26", "26 20 00", "Electrical Distribution", (sf) => 1, "LS", null, null, { pctOfTotal: [0.03, 0.06] }),
  item("26", "26 51 00", "Lighting", (sf) => sf, "SF", 3, 10),
];

const COMMON_FIRE = [
  item("21", "21 10 00", "Fire Suppression (Sprinklers)", (sf) => sf, "SF", 3, 7),
  item("28", "28 31 00", "Fire Detection & Alarm", (sf) => sf, "SF", 2, 5),
];

// ════════════════════════════════════════════════════════════════
// BUILDING TYPE TEMPLATES
// ════════════════════════════════════════════════════════════════

const TEMPLATES = {
  "commercial-office": {
    label: "Commercial Office",
    items: [
      ...COMMON_GENERAL,
      ...COMMON_SITEWORK,
      ...COMMON_CONCRETE,
      ...COMMON_METALS,
      ...COMMON_THERMAL,
      ...COMMON_DOORS,
      item("08", "08 44 00", "Curtain Wall / Storefront", (sf, floors, perim) => perim * 10 * 0.4, "SF", 45, 85),
      item("08", "08 80 00", "Glazing", (sf, floors, perim) => perim * 10 * 0.3, "SF", 25, 55),
      ...COMMON_DRYWALL,
      ...COMMON_FINISHES,
      item("09", "09 68 00", "Carpet Tile", (sf) => sf * 0.5, "SF", 4, 9),
      ...COMMON_FLOORING,
      ...COMMON_SPECIALTIES,
      item("14", "14 20 00", "Elevators", (sf, floors) => floors > 2 ? Math.ceil(sf / 20000) : 0, "EA", 80000, 150000),
      ...COMMON_PLUMBING,
      ...COMMON_HVAC,
      ...COMMON_ELECTRICAL,
      ...COMMON_FIRE,
    ],
  },

  "retail": {
    label: "Retail",
    items: [
      ...COMMON_GENERAL,
      ...COMMON_SITEWORK,
      ...COMMON_CONCRETE,
      item("05", "05 50 00", "Metal Fabrications (Misc. Metals)", (sf) => 1, "LS", null, null, { pctOfTotal: [0.01, 0.02] }),
      ...COMMON_THERMAL,
      ...COMMON_DOORS,
      item("08", "08 44 00", "Storefront System", (sf, floors, perim) => perim * 0.6 * 10, "SF", 45, 85),
      item("08", "08 80 00", "Glazing", (sf, floors, perim) => perim * 0.4 * 10, "SF", 25, 55),
      ...COMMON_DRYWALL,
      ...COMMON_FINISHES,
      ...COMMON_FLOORING,
      item("09", "09 30 00", "Ceramic Tile", (sf) => sf * 0.15, "SF", 12, 25),
      ...COMMON_SPECIALTIES,
      item("10", "10 11 00", "Visual Display Boards", (sf) => 1, "LS", 1500, 5000),
      ...COMMON_PLUMBING,
      ...COMMON_HVAC,
      ...COMMON_ELECTRICAL,
      ...COMMON_FIRE,
    ],
  },

  "restaurant": {
    label: "Restaurant",
    items: [
      ...COMMON_GENERAL,
      ...COMMON_SITEWORK,
      ...COMMON_CONCRETE,
      item("05", "05 50 00", "Metal Fabrications (Stainless, Shelving)", (sf) => 1, "LS", null, null, { pctOfTotal: [0.02, 0.04] }),
      ...COMMON_THERMAL,
      ...COMMON_DOORS,
      item("08", "08 44 00", "Storefront / Entry System", (sf, floors, perim) => perim * 0.3 * 10, "SF", 50, 90),
      ...COMMON_DRYWALL,
      item("09", "09 30 00", "Ceramic/Porcelain Tile (Kitchen + Restrooms)", (sf) => sf * 0.35, "SF", 12, 28),
      item("09", "09 65 19", "Quarry Tile (Kitchen Floor)", (sf) => sf * 0.25, "SF", 15, 30),
      item("09", "09 65 00", "Resilient Flooring (FOH)", (sf) => sf * 0.3, "SF", 5, 12),
      item("09", "09 77 00", "FRP Wall Panels (Kitchen)", (sf) => sf * 0.2 * 8, "SF", 4, 8),
      ...COMMON_FINISHES,
      ...COMMON_SPECIALTIES,
      // Restaurant-specific
      item("11", "11 40 00", "Food Service Equipment", (sf) => 1, "LS", null, null, { pctOfTotal: [0.15, 0.25], note: "Owner-furnished equipment may reduce this" }),
      item("11", "11 41 00", "Kitchen Exhaust Hood + Ansul", (sf) => Math.max(1, Math.ceil(sf / 2000)), "EA", 15000, 35000),
      item("11", "11 42 00", "Walk-in Cooler/Freezer", (sf) => sf > 1500 ? 2 : 1, "EA", 12000, 25000),
      item("22", "22 10 00", "Plumbing Piping (Heavy)", (sf) => sf, "SF", 8, 18),
      item("22", "22 13 00", "Grease Interceptor", (sf) => 1, "EA", 4000, 12000),
      item("22", "22 40 00", "Plumbing Fixtures (3-Comp Sink, Handwash, etc.)", (sf) => Math.max(4, Math.round(sf / 250)), "EA", 1200, 3000),
      item("22", "22 11 00", "Gas Piping", (sf) => sf * 0.3, "LF", 15, 35),
      item("23", "23 00 00", "HVAC System (Kitchen + Dining)", (sf) => sf, "SF", 18, 40),
      item("23", "23 37 00", "Makeup Air Unit", (sf) => Math.ceil(sf / 2000), "EA", 8000, 20000),
      ...COMMON_ELECTRICAL,
      item("26", "26 51 00", "Lighting (Decorative + Task)", (sf) => sf, "SF", 5, 15),
      ...COMMON_FIRE,
    ],
  },

  "healthcare": {
    label: "Healthcare",
    items: [
      ...COMMON_GENERAL,
      ...COMMON_SITEWORK,
      ...COMMON_CONCRETE,
      ...COMMON_METALS,
      ...COMMON_THERMAL,
      item("08", "08 11 00", "Metal Doors & Frames (Rated)", (sf) => Math.max(4, Math.round(sf / 200)), "EA", 1200, 2500),
      item("08", "08 71 00", "Door Hardware (ADA + Rated)", (sf) => Math.max(4, Math.round(sf / 200)), "EA", 500, 1200),
      item("08", "08 44 00", "Storefront / Curtain Wall", (sf, floors, perim) => perim * 10 * 0.3, "SF", 50, 90),
      item("09", "09 21 16", "Gypsum Board (Type X + Lead-Lined)", (sf, floors, perim) => (perim + sf / 150 * 12) * 12 * Math.max(floors, 1), "SF", 5, 12),
      item("09", "09 22 16", "Metal Stud Framing", (sf, floors, perim) => (perim + sf / 150 * 12) * 12 * Math.max(floors, 1), "SF", 3, 7),
      item("09", "09 30 00", "Ceramic Tile (Restrooms + Exam)", (sf) => sf * 0.2, "SF", 12, 28),
      item("09", "09 51 00", "Acoustical Ceilings (Cleanroom-rated)", (sf) => sf * 0.7, "SF", 5, 12),
      item("09", "09 65 00", "Sheet Vinyl / Rubber Flooring", (sf) => sf * 0.5, "SF", 6, 14),
      item("09", "09 91 00", "Painting (Anti-microbial)", (sf, floors, perim) => (perim + sf / 150 * 12) * 12 * Math.max(floors, 1) * 2, "SF", 1.50, 3.50),
      ...COMMON_SPECIALTIES,
      item("10", "10 22 00", "Cubicle Curtains & Tracks", (sf) => Math.round(sf / 200), "EA", 400, 800),
      item("11", "11 73 00", "Medical Equipment (Owner)", (sf) => 1, "LS", null, null, { note: "Typically owner-furnished. Verify." }),
      item("14", "14 20 00", "Elevators", (sf, floors) => floors > 1 ? Math.ceil(sf / 15000) : 0, "EA", 100000, 180000),
      item("22", "22 10 00", "Plumbing (Medical Gas + Domestic)", (sf) => sf, "SF", 10, 22),
      item("22", "22 60 00", "Medical Gas Systems", (sf) => sf * 0.3, "SF", 15, 35),
      item("22", "22 40 00", "Plumbing Fixtures", (sf) => Math.max(4, Math.round(sf / 300)), "EA", 1200, 3500),
      item("23", "23 00 00", "HVAC (100% OA + Precision)", (sf) => sf, "SF", 25, 50),
      item("26", "26 05 00", "Electrical (Emergency + Normal)", (sf) => sf, "SF", 12, 28),
      item("26", "26 32 00", "Emergency Generator", (sf) => sf > 5000 ? 1 : 0, "EA", 50000, 150000),
      item("26", "26 51 00", "Lighting (Medical-grade)", (sf) => sf, "SF", 6, 15),
      ...COMMON_FIRE,
      item("27", "27 10 00", "Structured Cabling / Nurse Call", (sf) => sf, "SF", 3, 8),
    ],
  },

  "education": {
    label: "Education",
    items: [
      ...COMMON_GENERAL,
      ...COMMON_SITEWORK,
      ...COMMON_CONCRETE,
      ...COMMON_METALS,
      ...COMMON_WOOD,
      ...COMMON_THERMAL,
      ...COMMON_DOORS,
      item("08", "08 44 00", "Storefront / Glazing", (sf, floors, perim) => perim * 10 * 0.25, "SF", 45, 80),
      ...COMMON_DRYWALL,
      item("09", "09 30 00", "Ceramic Tile (Restrooms)", (sf) => sf * 0.08, "SF", 12, 25),
      item("09", "09 51 00", "Acoustical Ceilings", (sf) => sf * 0.75, "SF", 4, 9),
      item("09", "09 65 00", "Resilient Flooring (Classrooms)", (sf) => sf * 0.5, "SF", 5, 11),
      item("09", "09 68 00", "Carpet (Admin Areas)", (sf) => sf * 0.15, "SF", 4, 8),
      ...COMMON_FINISHES,
      ...COMMON_SPECIALTIES,
      item("10", "10 51 00", "Lockers", (sf) => Math.round(sf / 100), "EA", 200, 500),
      item("11", "11 61 00", "Projection Screens / AV", (sf) => Math.round(sf / 800), "EA", 2000, 6000),
      item("12", "12 50 00", "Furniture (Classroom)", (sf) => 1, "LS", null, null, { pctOfTotal: [0.03, 0.06], note: "Owner-furnished possible" }),
      item("14", "14 20 00", "Elevators", (sf, floors) => floors > 1 ? 1 : 0, "EA", 80000, 140000),
      ...COMMON_PLUMBING,
      item("22", "22 14 00", "Drinking Fountains (ADA)", (sf) => Math.max(1, Math.round(sf / 3000)), "EA", 2000, 4000),
      ...COMMON_HVAC,
      ...COMMON_ELECTRICAL,
      item("27", "27 10 00", "Structured Cabling / Data", (sf) => sf, "SF", 2, 6),
      ...COMMON_FIRE,
    ],
  },

  "residential-single": {
    label: "Residential - Single Family",
    items: [
      ...COMMON_GENERAL,
      item("31", "31 10 00", "Site Clearing & Grading", (sf) => sf * 2, "SF", 0.30, 1.00),
      item("31", "31 23 00", "Excavation (Foundation)", (sf) => sf * 0.2, "CY", 8, 20),
      item("31", "31 60 00", "Foundation Drainage", (sf, floors, perim) => perim, "LF", 10, 25),
      item("03", "03 30 00", "Concrete (Foundation + SOG)", (sf) => sf, "SF", 8, 16),
      item("03", "03 45 00", "Concrete Foundation Walls", (sf, floors, perim) => perim * 4, "SF", 12, 22),
      item("06", "06 10 00", "Wood Framing (Walls + Roof)", (sf) => sf, "SF", 10, 22),
      item("06", "06 20 00", "Finish Carpentry (Trim, Casing)", (sf) => sf * 0.5, "LF", 6, 15),
      item("06", "06 41 00", "Cabinetry (Kitchen + Bath)", (sf) => sf * 0.05, "LF", 250, 600),
      item("07", "07 21 00", "Insulation (Walls + Attic)", (sf) => sf * 2, "SF", 1.50, 3.50),
      item("07", "07 31 00", "Roofing (Asphalt Shingles)", (sf) => sf * 0.6, "SF", 4, 9),
      item("07", "07 46 00", "Siding / Exterior Cladding", (sf, floors, perim) => perim * 9 * Math.max(floors, 1), "SF", 6, 18),
      item("08", "08 11 00", "Doors (Interior + Exterior)", (sf) => Math.max(4, Math.round(sf / 150)), "EA", 400, 1200),
      item("08", "08 51 00", "Windows", (sf) => Math.max(4, Math.round(sf / 120)), "EA", 400, 1200),
      item("09", "09 29 00", "Drywall", (sf) => sf * 3.5, "SF", 1.80, 3.50),
      item("09", "09 30 00", "Ceramic Tile (Bathrooms + Kitchen)", (sf) => sf * 0.1, "SF", 10, 25),
      item("09", "09 64 00", "Hardwood Flooring", (sf) => sf * 0.3, "SF", 8, 16),
      item("09", "09 65 00", "Resilient Flooring", (sf) => sf * 0.15, "SF", 4, 10),
      item("09", "09 68 00", "Carpet", (sf) => sf * 0.25, "SF", 3, 8),
      item("09", "09 91 00", "Painting (Interior + Exterior)", (sf) => sf * 5, "SF", 0.60, 1.50),
      item("12", "12 35 00", "Countertops (Granite/Quartz)", (sf) => sf * 0.02, "LF", 60, 150),
      item("22", "22 10 00", "Plumbing (Rough + Finish)", (sf) => sf, "SF", 8, 18),
      item("22", "22 40 00", "Plumbing Fixtures", (sf) => Math.max(3, Math.round(sf / 250)), "EA", 500, 2000),
      item("23", "23 00 00", "HVAC System", (sf) => sf, "SF", 10, 22),
      item("26", "26 00 00", "Electrical (Full House)", (sf) => sf, "SF", 8, 18),
      item("26", "26 51 00", "Lighting Fixtures", (sf) => Math.round(sf / 80), "EA", 100, 500),
      item("32", "32 10 00", "Driveway / Walkways", (sf) => sf * 0.15, "SF", 6, 14),
      item("32", "32 90 00", "Landscaping", (sf) => 1, "LS", null, null, { pctOfTotal: [0.02, 0.05] }),
    ],
  },

  "residential-multi": {
    label: "Residential - Multi-Family",
    items: [
      ...COMMON_GENERAL,
      ...COMMON_SITEWORK,
      ...COMMON_CONCRETE,
      ...COMMON_METALS,
      item("06", "06 10 00", "Wood/Light Gauge Framing", (sf) => sf, "SF", 8, 18),
      ...COMMON_THERMAL,
      item("07", "07 31 00", "Roofing", (sf, floors) => sf / Math.max(floors, 1), "SF", 6, 14),
      item("07", "07 46 00", "Siding / Cladding", (sf, floors, perim) => perim * 10 * Math.max(floors, 1), "SF", 8, 20),
      item("08", "08 11 00", "Doors (Unit + Common)", (sf) => Math.round(sf / 150), "EA", 600, 1500),
      item("08", "08 51 00", "Windows", (sf) => Math.round(sf / 100), "EA", 400, 1000),
      ...COMMON_DRYWALL,
      item("09", "09 30 00", "Ceramic Tile (Bathrooms)", (sf) => sf * 0.08, "SF", 10, 22),
      item("09", "09 64 00", "Hardwood/LVP (Units)", (sf) => sf * 0.35, "SF", 5, 12),
      ...COMMON_FLOORING,
      ...COMMON_FINISHES,
      item("06", "06 41 00", "Cabinetry (Kitchens + Baths)", (sf) => sf * 0.03, "LF", 200, 500),
      item("12", "12 35 00", "Countertops", (sf) => sf * 0.015, "LF", 50, 120),
      ...COMMON_SPECIALTIES,
      item("14", "14 20 00", "Elevators", (sf, floors) => floors > 3 ? Math.ceil(sf / 30000) : 0, "EA", 80000, 150000),
      ...COMMON_PLUMBING,
      ...COMMON_HVAC,
      ...COMMON_ELECTRICAL,
      ...COMMON_FIRE,
    ],
  },

  "hospitality": {
    label: "Hospitality",
    items: [
      ...COMMON_GENERAL,
      ...COMMON_SITEWORK,
      ...COMMON_CONCRETE,
      ...COMMON_METALS,
      ...COMMON_THERMAL,
      item("08", "08 11 00", "Doors (Guest + Service)", (sf) => Math.round(sf / 120), "EA", 800, 2000),
      item("08", "08 44 00", "Curtain Wall / Storefront (Lobby)", (sf, floors, perim) => perim * 12 * 0.3, "SF", 55, 95),
      item("08", "08 51 00", "Windows", (sf) => Math.round(sf / 80), "EA", 500, 1200),
      ...COMMON_DRYWALL,
      item("09", "09 30 00", "Ceramic/Porcelain Tile", (sf) => sf * 0.2, "SF", 12, 30),
      item("09", "09 68 00", "Carpet (Guest Rooms + Corridors)", (sf) => sf * 0.4, "SF", 5, 14),
      ...COMMON_FINISHES,
      item("12", "12 00 00", "Furnishings (FF&E)", (sf) => 1, "LS", null, null, { pctOfTotal: [0.10, 0.20], note: "Typically separate FF&E budget" }),
      ...COMMON_SPECIALTIES,
      item("14", "14 20 00", "Elevators", (sf, floors) => Math.max(1, Math.ceil(floors / 5)), "EA", 100000, 180000),
      ...COMMON_PLUMBING,
      ...COMMON_HVAC,
      ...COMMON_ELECTRICAL,
      ...COMMON_FIRE,
    ],
  },

  "industrial": {
    label: "Industrial",
    items: [
      ...COMMON_GENERAL,
      ...COMMON_SITEWORK,
      item("03", "03 30 00", "Concrete (Heavy-Duty SOG)", (sf) => sf, "SF", 8, 16),
      item("05", "05 12 00", "Structural Steel (Pre-Engineered)", (sf) => sf * 0.01, "TON", 3000, 5000),
      item("07", "07 41 00", "Metal Wall Panels", (sf, floors, perim) => perim * 24, "SF", 8, 18),
      item("07", "07 54 00", "Metal Roofing (Standing Seam)", (sf) => sf, "SF", 8, 16),
      item("07", "07 21 00", "Insulation", (sf, floors, perim) => perim * 24 + sf, "SF", 1.50, 3.50),
      item("08", "08 11 00", "Doors (Overhead + Personnel)", (sf) => Math.max(2, Math.round(sf / 2000) + 2), "EA", 2000, 8000),
      item("09", "09 90 00", "Painting / Coatings", (sf) => sf * 0.3, "SF", 1.50, 4.00),
      item("22", "22 10 00", "Plumbing (Basic)", (sf) => sf, "SF", 2, 6),
      item("23", "23 00 00", "HVAC (Warehouse Heating)", (sf) => sf, "SF", 4, 12),
      item("26", "26 00 00", "Electrical (Heavy Power)", (sf) => sf, "SF", 8, 20),
      item("26", "26 51 00", "High Bay Lighting", (sf) => sf, "SF", 2, 6),
      ...COMMON_FIRE,
      item("32", "32 12 00", "Paving (Parking + Loading)", (sf) => sf * 0.5, "SF", 4, 10),
    ],
  },

  "mixed-use": {
    label: "Mixed-Use",
    items: [
      ...COMMON_GENERAL,
      ...COMMON_SITEWORK,
      ...COMMON_CONCRETE,
      ...COMMON_METALS,
      ...COMMON_THERMAL,
      item("08", "08 11 00", "Doors (Commercial + Residential)", (sf) => Math.round(sf / 130), "EA", 700, 1600),
      item("08", "08 44 00", "Storefront (Ground Floor)", (sf, floors, perim) => perim * 12 * 0.3, "SF", 50, 90),
      item("08", "08 51 00", "Windows (Upper Floors)", (sf, floors) => Math.round(sf / 100), "EA", 400, 1000),
      ...COMMON_DRYWALL,
      item("09", "09 30 00", "Ceramic Tile", (sf) => sf * 0.1, "SF", 12, 25),
      ...COMMON_FLOORING,
      ...COMMON_FINISHES,
      ...COMMON_SPECIALTIES,
      item("14", "14 20 00", "Elevators", (sf, floors) => floors > 3 ? Math.ceil(sf / 25000) : 0, "EA", 90000, 160000),
      ...COMMON_PLUMBING,
      ...COMMON_HVAC,
      ...COMMON_ELECTRICAL,
      ...COMMON_FIRE,
    ],
  },

  "government": {
    label: "Government",
    items: [
      ...COMMON_GENERAL,
      ...COMMON_SITEWORK,
      ...COMMON_CONCRETE,
      ...COMMON_METALS,
      ...COMMON_WOOD,
      ...COMMON_THERMAL,
      item("08", "08 11 00", "Doors (Security-Rated)", (sf) => Math.round(sf / 200), "EA", 1500, 3500),
      item("08", "08 44 00", "Bullet-Resistant Glazing", (sf, floors, perim) => perim * 3, "SF", 80, 200),
      ...COMMON_DRYWALL,
      ...COMMON_FINISHES,
      ...COMMON_FLOORING,
      item("09", "09 30 00", "Ceramic Tile", (sf) => sf * 0.1, "SF", 12, 25),
      ...COMMON_SPECIALTIES,
      item("14", "14 20 00", "Elevators", (sf, floors) => floors > 1 ? 1 : 0, "EA", 100000, 180000),
      ...COMMON_PLUMBING,
      ...COMMON_HVAC,
      ...COMMON_ELECTRICAL,
      item("28", "28 10 00", "Access Control / Security", (sf) => sf, "SF", 3, 10),
      ...COMMON_FIRE,
    ],
  },

  "religious": {
    label: "Religious",
    items: [
      ...COMMON_GENERAL,
      ...COMMON_SITEWORK,
      ...COMMON_CONCRETE,
      ...COMMON_METALS,
      ...COMMON_WOOD,
      item("06", "06 60 00", "Millwork (Pews, Altar, Trim)", (sf) => 1, "LS", null, null, { pctOfTotal: [0.04, 0.08] }),
      ...COMMON_THERMAL,
      ...COMMON_DOORS,
      item("08", "08 51 00", "Stained Glass / Windows", (sf) => Math.round(sf / 150), "EA", 1500, 8000),
      ...COMMON_DRYWALL,
      ...COMMON_FINISHES,
      item("09", "09 68 00", "Carpet (Sanctuary)", (sf) => sf * 0.5, "SF", 5, 12),
      ...COMMON_SPECIALTIES,
      ...COMMON_PLUMBING,
      item("23", "23 00 00", "HVAC (High Volume Sanctuary)", (sf) => sf, "SF", 14, 30),
      ...COMMON_ELECTRICAL,
      item("26", "26 51 00", "Lighting (Decorative + Architectural)", (sf) => sf, "SF", 6, 18),
      item("27", "27 41 00", "Audio/Visual Systems", (sf) => 1, "LS", 15000, 80000),
      ...COMMON_FIRE,
    ],
  },

  "parking": {
    label: "Parking",
    items: [
      ...COMMON_GENERAL,
      ...COMMON_SITEWORK,
      item("03", "03 30 00", "Cast-in-Place Concrete (Structure)", (sf) => sf, "SF", 15, 30),
      item("03", "03 40 00", "Precast Concrete", (sf) => sf * 0.5, "SF", 12, 25),
      item("05", "05 12 00", "Structural Steel", (sf) => sf * 0.005, "TON", 3500, 5500),
      item("05", "05 52 00", "Metal Railings / Guard Rails", (sf, floors, perim) => perim * Math.max(floors, 1), "LF", 80, 200),
      item("07", "07 10 00", "Waterproofing (Deck Coating)", (sf) => sf, "SF", 3, 8),
      item("07", "07 92 00", "Joint Sealants (Expansion Joints)", (sf, floors, perim) => perim * Math.max(floors, 1) * 2, "LF", 8, 20),
      item("09", "09 90 00", "Striping / Painting", (sf) => sf, "SF", 0.30, 0.80),
      item("14", "14 20 00", "Elevators", (sf, floors) => floors > 2 ? Math.ceil(floors / 4) : 0, "EA", 80000, 140000),
      item("22", "22 10 00", "Plumbing (Floor Drains)", (sf) => sf, "SF", 0.50, 2.00),
      item("23", "23 34 00", "Ventilation (CO Monitoring)", (sf) => sf, "SF", 2, 6),
      item("26", "26 00 00", "Electrical (Lighting + Power)", (sf) => sf, "SF", 4, 10),
      item("26", "26 51 00", "Parking Lighting (LED)", (sf) => sf, "SF", 2, 5),
      ...COMMON_FIRE,
      item("28", "28 10 00", "Parking Access Control / CCTV", (sf) => 1, "LS", 15000, 50000),
    ],
  },
};

// ════════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════════

/**
 * Generate a scope template for a given building type and SF.
 * Returns an array of line items with calculated quantities and cost ranges.
 */
export function generateScopeTemplate(buildingType, sf, opts = {}) {
  const { floors = 1, workType = "" } = opts;
  const template = TEMPLATES[buildingType];
  if (!template) return { items: [], label: "Unknown", buildingType };

  const perim = estimatePerimeter(sf, floors);
  const items = [];

  for (const tmpl of template.items) {
    // Filter by work type if specified
    if (tmpl.workType && workType && !tmpl.workType.includes(workType)) continue;
    if (tmpl.workType && !workType && !tmpl.workType.includes("")) continue;

    // Calculate quantity
    let qty = tmpl.qtyFn(sf, floors, perim);
    if (qty <= 0) continue;
    qty = Math.round(qty * 100) / 100; // round to 2 decimals

    // Calculate cost range
    let lowCost, highCost, midCost;
    if (tmpl.pctOfTotal) {
      // Percentage-based items — will be calculated after total is known
      lowCost = null;
      highCost = null;
      midCost = null;
    } else {
      lowCost = Math.round(qty * tmpl.lowRate);
      highCost = Math.round(qty * tmpl.highRate);
      midCost = Math.round((lowCost + highCost) / 2);
    }

    items.push({
      division: tmpl.division,
      code: tmpl.code,
      description: tmpl.description,
      qty,
      unit: tmpl.unit,
      lowRate: tmpl.lowRate,
      highRate: tmpl.highRate,
      midRate: tmpl.lowRate && tmpl.highRate ? Math.round((tmpl.lowRate + tmpl.highRate) / 2 * 100) / 100 : null,
      lowCost,
      highCost,
      midCost,
      pctOfTotal: tmpl.pctOfTotal || null,
      note: tmpl.note || null,
      source: "template",
      confidence: "BASELINE",
    });
  }

  // Calculate total of non-percentage items first
  const directTotal = {
    low: items.filter(i => i.lowCost).reduce((sum, i) => sum + i.lowCost, 0),
    mid: items.filter(i => i.midCost).reduce((sum, i) => sum + i.midCost, 0),
    high: items.filter(i => i.highCost).reduce((sum, i) => sum + i.highCost, 0),
  };

  // Now calculate percentage-based items
  for (const item of items) {
    if (item.pctOfTotal) {
      const [lowPct, highPct] = item.pctOfTotal;
      item.lowCost = Math.round(directTotal.low * lowPct);
      item.highCost = Math.round(directTotal.high * highPct);
      item.midCost = Math.round((item.lowCost + item.highCost) / 2);
      item.lowRate = null;
      item.highRate = null;
      item.midRate = null;
    }
  }

  // Grand totals
  const grandTotal = {
    low: items.reduce((sum, i) => sum + (i.lowCost || 0), 0),
    mid: items.reduce((sum, i) => sum + (i.midCost || 0), 0),
    high: items.reduce((sum, i) => sum + (i.highCost || 0), 0),
  };

  return {
    buildingType,
    label: template.label,
    sf,
    floors,
    workType,
    perimeter: perim,
    items,
    itemCount: items.length,
    grandTotal,
    perSF: {
      low: Math.round(grandTotal.low / sf * 100) / 100,
      mid: Math.round(grandTotal.mid / sf * 100) / 100,
      high: Math.round(grandTotal.high / sf * 100) / 100,
    },
  };
}

/**
 * Get available building types.
 */
export function getScopeTemplateTypes() {
  return Object.entries(TEMPLATES).map(([key, t]) => ({
    value: key,
    label: t.label,
    itemCount: t.items.length,
  }));
}

/**
 * Get a specific template's items (for preview without quantities).
 */
export function getScopeTemplatePreview(buildingType) {
  const template = TEMPLATES[buildingType];
  if (!template) return null;
  return {
    label: template.label,
    items: template.items.map(i => ({
      division: i.division,
      code: i.code,
      description: i.description,
      unit: i.unit,
    })),
  };
}
