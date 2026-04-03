// ROM Engine — Rough Order of Magnitude cost estimation
// Generates division-level $/SF ranges and schedule-derived line items

import { SEED_ELEMENTS } from "@/constants/seedAssemblies";
import { callAnthropic } from "@/utils/ai";
import { searchSimilar } from "@/utils/vectorSearch";
import { getWorkTypeMultiplier, getLaborTypeMultiplier, getMarketMultiplier, detectMarketRegion } from "@/constants/constructionTypes";
import { SUBDIVISION_BENCHMARKS, DEFAULT_SUBDIVISIONS } from "@/constants/subdivisionBenchmarks";
import { computeSubdivisionBreakdown } from "@/utils/confidenceEngine";
import { generateAllSubdivisions } from "@/utils/subdivisionAI";

// ─── Benchmark Sample Counts — how many real proposals calibrate each type ──
// Source: 32 Montana GC proposals + 25 Violante sub proposals = 57 total
// Sample counts from 85 real proposals (Montana + Violante + Dropbox GC)
const BENCHMARK_SAMPLE_COUNTS = {
  "residential-single":{ _default: 21, "01": 21, "06": 21, "09": 20, "03": 18 },
  retail:              { _default: 6, "21": 6, "22": 6, "23": 6, "26": 6 },
  industrial:          { _default: 5, "26": 5, "01": 5, "22": 4, "23": 4 },
  restaurant:          { _default: 4, "22": 4, "23": 4, "26": 4, "03": 4 },
  healthcare:          { _default: 4, "22": 4, "01": 4, "02": 4, "09": 4 },
  "commercial-office": { _default: 3, "22": 3, "26": 3, "02": 3, "09": 3 },
  "residential-multi": { _default: 3, "26": 3, "05": 3, "06": 3, "09": 3 },
  education:           { _default: 2, "22": 2, "23": 2, "26": 2 },
  government:          { _default: 2, "22": 2, "23": 2 },
  hospitality:         { _default: 2 },
  "mixed-use":         { _default: 1 },
  religious:           { _default: 0 },
  parking:             { _default: 0 },
};

// ─── Division Benchmarks ($/SF by job type) ───────────────────────────
// Low = budget/value, Mid = typical, High = premium/complex
const BENCHMARKS = {
  // Commercial office — FROM 3 REAL PROPOSALS ($476/SF mid)
  // Spark Newburgh, 125 Broad St, Brewster Breakroom
  "commercial-office": {
    "01": { label: "General Requirements", low: 41, mid: 41, high: 41 },
    "02": { label: "Existing Conditions/Demo", low: 2, mid: 3, high: 6 },
    "03": { label: "Concrete", low: 0, mid: 22, high: 43 },
    "04": { label: "Masonry", low: 4, mid: 4, high: 4 },
    "05": { label: "Structural Steel", low: 43, mid: 43, high: 43 },
    "06": { label: "Wood, Plastics & Composites", low: 12, mid: 35, high: 59 },
    "07": { label: "Thermal & Moisture", low: 49, mid: 49, high: 49 },
    "08": { label: "Openings", low: 7, mid: 14, high: 21 },
    "09": { label: "Finishes", low: 19, mid: 36, high: 53 },
    10: { label: "Specialties", low: 4, mid: 4, high: 4 },
    21: { label: "Fire Suppression", low: 2, mid: 5, high: 7 },
    22: { label: "Plumbing", low: 0, mid: 33, high: 65 },
    23: { label: "HVAC", low: 2, mid: 14, high: 27 },
    26: { label: "Electrical", low: 6, mid: 32, high: 62 },
    28: { label: "Electronic Safety", low: 1, mid: 2, high: 3 },
    31: { label: "Earthwork", low: 58, mid: 58, high: 58 },
    32: { label: "Exterior Improvements", low: 79, mid: 79, high: 79 },
  },
  // Retail — FROM 6 REAL PROPOSALS ($279/SF mid)
  retail: {
    "01": { label: "General Requirements", low: 22, mid: 26, high: 31 },
    "02": { label: "Existing Conditions/Demo", low: 0, mid: 3, high: 5 },
    "03": { label: "Concrete", low: 1, mid: 6, high: 20 },
    "06": { label: "Wood, Plastics & Composites", low: 1, mid: 9, high: 25 },
    "07": { label: "Thermal & Moisture", low: 0, mid: 3, high: 4 },
    "09": { label: "Finishes (D&C, ACT, Paint, Flooring)", low: 32, mid: 37, high: 43 },
    21: { label: "Fire Suppression", low: 1, mid: 5, high: 15 },
    22: { label: "Plumbing", low: 4, mid: 13, high: 23 },
    23: { label: "HVAC", low: 8, mid: 34, high: 46 },
    26: { label: "Electrical", low: 12, mid: 45, high: 65 },
    27: { label: "Communications", low: 0, mid: 3, high: 6 },
    28: { label: "Electronic Safety", low: 2, mid: 7, high: 11 },
  },
  // Healthcare — FROM 4 REAL PROPOSALS ($478/SF mid)
  // Edge Dental $486, 301 N Main Medical $667, Venus & Venum $549, Integrative $126
  healthcare: {
    "01": { label: "General Requirements", low: 7, mid: 39, high: 68 },
    "02": { label: "Existing Conditions/Demo", low: 2, mid: 10, high: 17 },
    "03": { label: "Concrete", low: 7, mid: 21, high: 38 },
    "04": { label: "Masonry", low: 6, mid: 8, high: 10 },
    "05": { label: "Structural Steel", low: 3, mid: 57, high: 112 },
    "06": { label: "Wood & Plastics", low: 14, mid: 36, high: 62 },
    "07": { label: "Thermal & Moisture", low: 36, mid: 49, high: 62 },
    "08": { label: "Openings", low: 1, mid: 21, high: 36 },
    "09": { label: "Finishes", low: 25, mid: 42, high: 59 },
    21: { label: "Fire Suppression", low: 8, mid: 14, high: 19 },
    22: { label: "Plumbing (Medical Gas)", low: 12, mid: 30, high: 49 },
    23: { label: "HVAC (Clean Air)", low: 29, mid: 46, high: 71 },
    26: { label: "Electrical", low: 30, mid: 35, high: 42 },
    27: { label: "Communications", low: 1, mid: 3, high: 8 },
    28: { label: "Electronic Safety", low: 7, mid: 8, high: 10 },
    31: { label: "Earthwork / Site", low: 1, mid: 23, high: 43 },
    32: { label: "Exterior Improvements", low: 5, mid: 26, high: 46 },
  },
  education: {
    "01": { label: "General Requirements", low: 3, mid: 6, high: 10 },
    "03": { label: "Concrete", low: 6, mid: 12, high: 20 },
    "04": { label: "Masonry", low: 3, mid: 8, high: 14 },
    "05": { label: "Structural Steel", low: 5, mid: 10, high: 18 },
    "07": { label: "Thermal & Moisture", low: 3, mid: 7, high: 12 },
    "08": { label: "Openings", low: 5, mid: 10, high: 16 },
    "09": { label: "Finishes", low: 8, mid: 14, high: 22 },
    22: { label: "Plumbing", low: 4, mid: 8, high: 14 },
    23: { label: "HVAC", low: 8, mid: 14, high: 22 },
    26: { label: "Electrical", low: 6, mid: 12, high: 18 },
  },
  // Industrial — FROM 5 REAL PROPOSALS ($206/SF mid)
  // RRIS, Bearsville, Kulka Self-Storage, Big Geyser, Chartwell
  industrial: {
    "01": { label: "General Requirements", low: 1, mid: 10, high: 37 },
    "02": { label: "Existing Conditions", low: 3, mid: 5, high: 8 },
    "03": { label: "Concrete (SOG/Foundation)", low: 13, mid: 31, high: 70 },
    "04": { label: "Masonry", low: 2, mid: 10, high: 18 },
    "05": { label: "Structural Steel", low: 16, mid: 47, high: 78 },
    "07": { label: "Thermal & Moisture / Roofing", low: 7, mid: 18, high: 29 },
    "08": { label: "Openings (OH Doors)", low: 2, mid: 3, high: 5 },
    "09": { label: "Finishes", low: 4, mid: 8, high: 16 },
    21: { label: "Fire Suppression", low: 3, mid: 4, high: 4 },
    22: { label: "Plumbing", low: 0, mid: 2, high: 6 },
    23: { label: "HVAC", low: 0, mid: 3, high: 6 },
    26: { label: "Electrical (3-Phase)", low: 0, mid: 10, high: 25 },
    31: { label: "Earthwork", low: 5, mid: 16, high: 30 },
    32: { label: "Exterior / Paving", low: 1, mid: 12, high: 25 },
  },
  // Residential multi-family — FROM 3 REAL PROPOSALS ($347/SF mid)
  // Westerly (20 units), 306 W 48th (lobby reno), 1-3 S Broadway Nyack
  "residential-multi": {
    "01": { label: "General Requirements", low: 12, mid: 14, high: 17 },
    "02": { label: "Existing Conditions/Demo", low: 7, mid: 16, high: 25 },
    "03": { label: "Concrete", low: 3, mid: 8, high: 13 },
    "04": { label: "Masonry", low: 2, mid: 9, high: 16 },
    "05": { label: "Structural Steel", low: 1, mid: 4, high: 8 },
    "06": { label: "Wood Framing", low: 25, mid: 50, high: 72 },
    "07": { label: "Thermal & Moisture", low: 9, mid: 23, high: 37 },
    "08": { label: "Openings", low: 1, mid: 13, high: 21 },
    "09": { label: "Finishes (per unit)", low: 43, mid: 61, high: 70 },
    10: { label: "Specialties", low: 1, mid: 2, high: 3 },
    11: { label: "Equipment / Appliances", low: 4, mid: 7, high: 10 },
    14: { label: "Conveying", low: 7, mid: 7, high: 7 },
    21: { label: "Fire Suppression", low: 5, mid: 9, high: 12 },
    22: { label: "Plumbing (per unit)", low: 17, mid: 22, high: 28 },
    23: { label: "HVAC", low: 17, mid: 20, high: 22 },
    26: { label: "Electrical", low: 10, mid: 18, high: 30 },
    27: { label: "Communications", low: 2, mid: 3, high: 4 },
    28: { label: "Electronic Safety", low: 1, mid: 4, high: 7 },
  },
  hospitality: {
    "01": { label: "General Requirements", low: 4, mid: 8, high: 14 },
    "02": { label: "Existing Conditions/Demo", low: 1, mid: 3, high: 8 },
    "03": { label: "Concrete", low: 8, mid: 14, high: 22 },
    "04": { label: "Masonry", low: 2, mid: 5, high: 10 },
    "05": { label: "Structural Steel", low: 6, mid: 12, high: 20 },
    "06": { label: "Wood & Plastics", low: 5, mid: 10, high: 18 },
    "07": { label: "Thermal & Moisture", low: 4, mid: 8, high: 14 },
    "08": { label: "Openings", low: 6, mid: 12, high: 20 },
    "09": { label: "Finishes", low: 12, mid: 20, high: 32 },
    10: { label: "Specialties", low: 2, mid: 5, high: 10 },
    14: { label: "Conveying", low: 2, mid: 6, high: 14 },
    21: { label: "Fire Suppression", low: 3, mid: 5, high: 8 },
    22: { label: "Plumbing", low: 6, mid: 12, high: 20 },
    23: { label: "HVAC", low: 10, mid: 18, high: 28 },
    26: { label: "Electrical", low: 8, mid: 14, high: 22 },
    27: { label: "Communications", low: 2, mid: 4, high: 8 },
  },
  // Residential single-family — FROM 21 REAL NY PROJECTS ($660/SF mid)
  // Sources: 21 Montana/BLDG proposals (2024-2026) — actual per-division $/SF
  "residential-single": {
    "01": { label: "General Requirements", low: 6, mid: 54, high: 113 },
    "02": { label: "Existing Conditions/Demo", low: 1, mid: 8, high: 14 },
    "03": { label: "Concrete (Foundation/Slab)", low: 1, mid: 27, high: 64 },
    "04": { label: "Masonry", low: 0, mid: 5, high: 24 },
    "05": { label: "Structural Steel", low: 1, mid: 18, high: 132 },
    "06": { label: "Wood Framing & Finish Carpentry", low: 3, mid: 84, high: 163 },
    "07": { label: "Thermal & Moisture / Roofing", low: 6, mid: 65, high: 130 },
    "08": { label: "Windows & Doors", low: 19, mid: 41, high: 94 },
    "09": { label: "Finishes (Drywall, Paint, Tile, Flooring)", low: 11, mid: 53, high: 144 },
    10: { label: "Specialties", low: 1, mid: 15, high: 171 },
    11: { label: "Equipment / Appliances", low: 0, mid: 7, high: 15 },
    22: { label: "Plumbing", low: 11, mid: 22, high: 35 },
    23: { label: "HVAC", low: 4, mid: 33, high: 87 },
    26: { label: "Electrical", low: 5, mid: 31, high: 84 },
    31: { label: "Earthwork / Site", low: 2, mid: 29, high: 90 },
    32: { label: "Exterior Improvements", low: 4, mid: 23, high: 94 },
    33: { label: "Utilities", low: 0, mid: 15, high: 52 },
  },
  "mixed-use": {
    "01": { label: "General Requirements", low: 3, mid: 7, high: 12 },
    "02": { label: "Existing Conditions/Demo", low: 1, mid: 3, high: 8 },
    "03": { label: "Concrete", low: 8, mid: 14, high: 22 },
    "04": { label: "Masonry", low: 2, mid: 5, high: 10 },
    "05": { label: "Structural Steel", low: 6, mid: 12, high: 20 },
    "06": { label: "Wood & Plastics", low: 4, mid: 10, high: 18 },
    "07": { label: "Thermal & Moisture", low: 4, mid: 8, high: 14 },
    "08": { label: "Openings", low: 6, mid: 11, high: 18 },
    "09": { label: "Finishes", low: 8, mid: 14, high: 24 },
    10: { label: "Specialties", low: 1, mid: 3, high: 6 },
    14: { label: "Conveying", low: 1, mid: 5, high: 12 },
    21: { label: "Fire Suppression", low: 2, mid: 4, high: 7 },
    22: { label: "Plumbing", low: 5, mid: 10, high: 18 },
    23: { label: "HVAC", low: 8, mid: 14, high: 22 },
    26: { label: "Electrical", low: 6, mid: 12, high: 20 },
    31: { label: "Earthwork", low: 2, mid: 5, high: 10 },
  },
  government: {
    "01": { label: "General Requirements", low: 4, mid: 8, high: 14 },
    "02": { label: "Existing Conditions/Demo", low: 1, mid: 3, high: 8 },
    "03": { label: "Concrete", low: 8, mid: 14, high: 22 },
    "04": { label: "Masonry", low: 3, mid: 8, high: 14 },
    "05": { label: "Structural Steel", low: 6, mid: 12, high: 20 },
    "06": { label: "Wood & Plastics", low: 3, mid: 6, high: 12 },
    "07": { label: "Thermal & Moisture", low: 4, mid: 8, high: 14 },
    "08": { label: "Openings", low: 5, mid: 10, high: 18 },
    "09": { label: "Finishes", low: 8, mid: 14, high: 22 },
    10: { label: "Specialties", low: 1, mid: 3, high: 6 },
    21: { label: "Fire Suppression", low: 2, mid: 4, high: 7 },
    22: { label: "Plumbing", low: 4, mid: 8, high: 14 },
    23: { label: "HVAC", low: 8, mid: 14, high: 22 },
    26: { label: "Electrical", low: 7, mid: 13, high: 20 },
    28: { label: "Electronic Safety", low: 2, mid: 5, high: 10 },
  },
  religious: {
    "01": { label: "General Requirements", low: 3, mid: 6, high: 10 },
    "03": { label: "Concrete", low: 6, mid: 10, high: 16 },
    "04": { label: "Masonry", low: 4, mid: 8, high: 15 },
    "05": { label: "Structural Steel", low: 4, mid: 8, high: 14 },
    "06": { label: "Wood & Plastics", low: 5, mid: 10, high: 20 },
    "07": { label: "Thermal & Moisture", low: 3, mid: 7, high: 12 },
    "08": { label: "Openings", low: 6, mid: 12, high: 22 },
    "09": { label: "Finishes", low: 10, mid: 18, high: 30 },
    10: { label: "Specialties", low: 2, mid: 4, high: 8 },
    22: { label: "Plumbing", low: 3, mid: 6, high: 10 },
    23: { label: "HVAC", low: 6, mid: 12, high: 20 },
    26: { label: "Electrical", low: 5, mid: 10, high: 18 },
    27: { label: "Communications", low: 2, mid: 4, high: 8 },
  },
  // Restaurant benchmarks recalibrated from Violante + Montana real proposals (2024-2026)
  // D&C range: $7-168/SF (14 data points) — mid ~$38/SF for standard TI
  // Varo Spa (full GC): $157.57/SF total across all trades
  // Restaurant — FROM 4 REAL PROPOSALS ($536/SF mid)
  // Chipotle, Shake Shack, HUTS Dixon, Greenmount Ave
  restaurant: {
    "01": { label: "General Requirements", low: 23, mid: 49, high: 72 },
    "02": { label: "Existing Conditions/Demo", low: 6, mid: 10, high: 18 },
    "03": { label: "Concrete", low: 10, mid: 21, high: 42 },
    "04": { label: "Masonry", low: 10, mid: 13, high: 16 },
    "05": { label: "Structural Steel", low: 1, mid: 14, high: 36 },
    "06": { label: "Wood, Plastics & Composites", low: 5, mid: 25, high: 51 },
    "07": { label: "Thermal & Moisture", low: 3, mid: 20, high: 48 },
    "08": { label: "Openings", low: 3, mid: 20, high: 33 },
    "09": { label: "Finishes (D&C, ACT, Paint, Tile, Flooring)", low: 34, mid: 53, high: 68 },
    10: { label: "Specialties (FRP, Bath Acc, Signage)", low: 6, mid: 8, high: 9 },
    22: { label: "Plumbing", low: 37, mid: 49, high: 58 },
    23: { label: "HVAC", low: 12, mid: 33, high: 47 },
    26: { label: "Electrical", low: 36, mid: 51, high: 68 },
    28: { label: "Electronic Safety", low: 5, mid: 7, high: 9 },
    31: { label: "Earthwork", low: 12, mid: 35, high: 58 },
  },
  parking: {
    "01": { label: "General Requirements", low: 1, mid: 3, high: 6 },
    "02": { label: "Existing Conditions/Demo", low: 0, mid: 2, high: 5 },
    "03": { label: "Concrete", low: 15, mid: 25, high: 40 },
    "05": { label: "Structural Steel", low: 8, mid: 14, high: 22 },
    "07": { label: "Thermal & Moisture", low: 2, mid: 4, high: 8 },
    "09": { label: "Finishes", low: 1, mid: 2, high: 4 },
    14: { label: "Conveying", low: 0, mid: 2, high: 6 },
    22: { label: "Plumbing", low: 0, mid: 1, high: 3 },
    26: { label: "Electrical", low: 3, mid: 6, high: 12 },
    28: { label: "Electronic Safety", low: 1, mid: 3, high: 6 },
    31: { label: "Earthwork", low: 2, mid: 5, high: 10 },
    32: { label: "Exterior Improvements", low: 1, mid: 3, high: 6 },
  },
};

// Default fallback for unknown job types
const DEFAULT_BENCHMARKS = BENCHMARKS["commercial-office"];

// ─── Building Parameter Multipliers ───────────────────────────────────
// Adjusts $/SF per division based on floor count, room counts, etc.
export function getBuildingParamMultipliers(buildingParams = {}) {
  const mults = {}; // { divCode: multiplier }
  const floors = parseInt(buildingParams.floorCount) || 0;
  const basements = parseInt(buildingParams.basementCount) || 0;
  const rooms = buildingParams.roomCounts || {};

  if (floors <= 0 && basements <= 0 && Object.keys(rooms).length === 0) return mults;

  // ── Floor count impacts ──
  if (floors > 0) {
    // Multi-story structural premium: steel/concrete costs increase with height
    if (floors >= 4) {
      mults["03"] = 1 + (floors - 3) * 0.04; // Concrete: +4% per floor above 3
      mults["05"] = 1 + (floors - 3) * 0.05; // Metals: +5% per floor above 3
    }
    // Conveying (elevators): significant jump for 2+ stories
    if (floors >= 2) {
      mults["14"] = 1 + (floors - 1) * 0.15; // Elevators: +15% per floor above 1
    }
    // Fire suppression required at certain thresholds
    if (floors >= 3) {
      mults["21"] = 1 + (floors - 2) * 0.08; // Fire suppression: +8% per floor above 2
    }
    // Vertical MEP runs increase with height
    if (floors >= 3) {
      mults["22"] = (mults["22"] || 1) + (floors - 2) * 0.03; // Plumbing: +3%
      mults["23"] = (mults["23"] || 1) + (floors - 2) * 0.04; // HVAC: +4%
      mults["26"] = (mults["26"] || 1) + (floors - 2) * 0.03; // Electrical: +3%
    }
  }

  // ── Basement impacts ──
  if (basements > 0) {
    mults["02"] = (mults["02"] || 1) + basements * 0.15; // Demo/excavation: +15% per basement
    mults["03"] = (mults["03"] || 1) + basements * 0.1; // Concrete: +10% (foundations, retaining)
    mults["07"] = (mults["07"] || 1) + basements * 0.08; // Waterproofing: +8%
    mults["31"] = (mults["31"] || 1) + basements * 0.2; // Earthwork: +20% per basement
  }

  // ── Room count impacts ──
  // High bathroom count → more plumbing
  const baths = parseInt(rooms.bathrooms) || 0;
  if (baths > 4) {
    mults["22"] = (mults["22"] || 1) + (baths - 4) * 0.02; // Plumbing: +2% per bathroom above 4
  }

  // Kitchen count → equipment + plumbing + electrical
  const kitchens = parseInt(rooms.kitchens) || 0;
  if (kitchens > 0) {
    mults["11"] = (mults["11"] || 1) + kitchens * 0.1; // Equipment: +10% per kitchen
    mults["22"] = (mults["22"] || 1) + kitchens * 0.05; // Plumbing: +5% per kitchen
  }

  // Elevators → direct conveying cost
  const elevators = parseInt(rooms.elevators) || 0;
  if (elevators > 0) {
    mults["14"] = (mults["14"] || 1) + (elevators - 1) * 0.25; // +25% per additional elevator
  }

  // Server rooms → electrical + HVAC (cooling)
  const serverRooms = parseInt(rooms.serverRooms) || 0;
  if (serverRooms > 0) {
    mults["23"] = (mults["23"] || 1) + serverRooms * 0.06; // HVAC: +6% per server room
    mults["26"] = (mults["26"] || 1) + serverRooms * 0.04; // Electrical: +4%
    mults["27"] = (mults["27"] || 1) + serverRooms * 0.08; // Communications: +8%
  }

  // Residential units → finish + plumbing multiplier
  const units = parseInt(rooms.residentialUnits) || 0;
  if (units > 4) {
    mults["09"] = (mults["09"] || 1) + (units - 4) * 0.01; // Finishes: +1% per unit above 4
    mults["22"] = (mults["22"] || 1) + (units - 4) * 0.01; // Plumbing: +1%
  }

  // Cap multipliers at reasonable bounds (0.5x – 2.5x)
  Object.keys(mults).forEach(k => {
    mults[k] = Math.max(0.5, Math.min(2.5, mults[k]));
  });

  return mults;
}

// ─── Baseline ROM Generation ──────────────────────────────────────────
// Signature: (projectSF, buildingType, workType?, calibrationFactors?, buildingParams?)
// buildingParams can include: { laborType, location, floorCount, ... }
// Backward compat: (projectSF, jobType, calibrationFactors) still works
export function generateBaselineROM(projectSF, buildingTypeOrJobType, workTypeOrCalib, maybeCalib, buildingParams) {
  // Detect old 3-arg signature vs new 4-arg
  let buildingType, workType, calibrationFactors;
  if (typeof workTypeOrCalib === "string") {
    buildingType = buildingTypeOrJobType;
    workType = workTypeOrCalib;
    calibrationFactors = maybeCalib || {};
  } else {
    buildingType = buildingTypeOrJobType;
    workType = null;
    calibrationFactors = workTypeOrCalib || {};
  }

  const sf = parseFloat(projectSF) || 0;
  const benchmarks = BENCHMARKS[buildingType] || DEFAULT_BENCHMARKS;
  const params = buildingParams || {};

  // ── Multipliers ──
  const workMultiplier = workType ? getWorkTypeMultiplier(workType) : 1.0;
  const laborMultiplier = params.laborType ? getLaborTypeMultiplier(params.laborType) : 1.0;
  const marketMultiplier = params.location ? getMarketMultiplier(params.location) : 1.0;
  const bpMults = getBuildingParamMultipliers(params);

  // Combined multiplier applied to every division
  const combinedMultiplier = workMultiplier * laborMultiplier * marketMultiplier;

  // Detect market region for display
  const marketRegion = params.location ? detectMarketRegion(params.location) : null;

  const divisions = {};
  let totalLow = 0,
    totalMid = 0,
    totalHigh = 0;

  Object.entries(benchmarks).forEach(([div, range]) => {
    // Apply: calibration × work type × labor type × market × building params
    // calibrationFactors[div] can be a number (legacy) or { factor, count, confidence } (new)
    const calEntry = calibrationFactors[div];
    const calFactor = typeof calEntry === "number" ? calEntry : (calEntry?.factor || 1);
    const factor = calFactor * combinedMultiplier * (bpMults[div] || 1);
    let low = range.low * factor;
    let mid = range.mid * factor;
    let high = range.high * factor;

    // ── Trade Pricing Index supplemental calibration ──
    // If tradePricingIndex is provided and has 3+ samples for this division,
    // blend the index median with the baseline. Weight caps at 60% at 20 samples.
    const tpi = calibrationFactors?._tradePricingIndex?.[div];
    if (tpi?.lump_sum_per_sf && tpi.lump_sum_per_sf.sampleCount >= 3 && sf > 0) {
      const idxPerSF = tpi.lump_sum_per_sf.median / sf; // Normalize to $/SF
      if (idxPerSF > 0 && isFinite(idxPerSF)) {
        const idxWeight = Math.min(0.6, tpi.lump_sum_per_sf.sampleCount / 33);
        const baseWeight = 1 - idxWeight;
        mid = mid * baseWeight + idxPerSF * idxWeight;
        low = low * baseWeight + (tpi.lump_sum_per_sf.p25 / sf) * idxWeight;
        high = high * baseWeight + (tpi.lump_sum_per_sf.p75 / sf) * idxWeight;
      }
    }

    // Confidence metadata — based on calibration data quality for this building type
    const tpiSamples = tpi?.lump_sum_per_sf?.sampleCount || 0;
    const calCount = typeof calEntry === "object" ? (calEntry.count || 0) : 0;
    const baseSamples = BENCHMARK_SAMPLE_COUNTS[buildingType]?.[div] || BENCHMARK_SAMPLE_COUNTS[buildingType]?._default || 0;
    const totalSamples = baseSamples + tpiSamples + calCount;
    const confLevel = totalSamples >= 8 ? "strong" : totalSamples >= 3 ? "moderate" : "baseline";

    divisions[div] = {
      label: range.label,
      name: range.label,
      perSF: { low: Math.round(low * 100) / 100, mid: Math.round(mid * 100) / 100, high: Math.round(high * 100) / 100 },
      total:
        sf > 0
          ? { low: Math.round(sf * low), mid: Math.round(sf * mid), high: Math.round(sf * high) }
          : { low: 0, mid: 0, high: 0 },
      sampleCount: totalSamples,
      confidence: confLevel,
    };

    totalLow += sf * low;
    totalMid += sf * mid;
    totalHigh += sf * high;
  });

  return {
    projectSF: sf,
    sfMissing: sf === 0,
    jobType: buildingType || "commercial-office",
    buildingType: buildingType || "commercial-office",
    workType: workType || "",
    laborType: params.laborType || "open-shop",
    location: params.location || "",
    // Multipliers (for display in the deliverable)
    workMultiplier,
    laborMultiplier,
    marketMultiplier,
    combinedMultiplier,
    marketRegion: marketRegion ? { key: marketRegion.key, label: marketRegion.label, multiplier: marketRegion.multiplier } : null,
    // Divisions + totals
    divisions,
    totals: {
      low: Math.round(totalLow),
      mid: Math.round(totalMid),
      high: Math.round(totalHigh),
    },
    perSF: {
      low: sf > 0 ? Math.round((totalLow / sf) * 100) / 100 : 0,
      mid: sf > 0 ? Math.round((totalMid / sf) * 100) / 100 : 0,
      high: sf > 0 ? Math.round((totalHigh / sf) * 100) / 100 : 0,
    },
    // Calibration info
    calibrated: Object.keys(calibrationFactors).length > 0,
    calibrationCount: Object.keys(calibrationFactors).length,
    buildingParamAdjusted: Object.keys(bpMults).length > 0,
    buildingParamMultipliers: bpMults,
    // Adjustment summary (for the deliverable)
    adjustments: [
      workMultiplier !== 1.0 ? { label: `Work type: ${workType}`, multiplier: workMultiplier } : null,
      laborMultiplier !== 1.0 ? { label: `Labor: ${params.laborType}`, multiplier: laborMultiplier } : null,
      marketMultiplier !== 1.0 ? { label: `Market: ${marketRegion?.label || params.location}`, multiplier: marketMultiplier } : null,
    ].filter(Boolean),
  };
}

// ─── AI SF Estimation ─────────────────────────────────────────────────
// When project SF is unknown, ask AI to estimate it from drawings + schedules
export async function estimateProjectSF({ drawings, schedules, projectContext }) {
  try {
    const drawingSummary = drawings
      .map(d => `${d.sheetNumber || d.label || "Sheet"}: ${d.sheetTitle || "Untitled"}`)
      .join("\n");

    const scheduleSummary = schedules
      .map(s => `${s.type}: ${s.entries?.length || 0} entries (from ${s.sheetLabel || "sheet"})`)
      .join("\n");

    const result = await callAnthropic({
      max_tokens: 500,
      system:
        "You are a senior construction estimator. Based on drawing sheets and schedule data, estimate the approximate building square footage.",
      messages: [
        {
          role: "user",
          content: `I need to estimate the total building square footage for a project. I don't have it entered yet.

Drawing sheets:
${drawingSummary || "(no drawings)"}

Detected schedules:
${scheduleSummary || "(none)"}

${projectContext || ""}

Based on the drawing types, number of sheets, and schedule complexity, estimate the approximate total building gross square footage.

Return ONLY a JSON object: {"estimatedSF": <number>, "confidence": "high"|"medium"|"low", "reasoning": "<brief explanation>"}`,
        },
      ],
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.warn("[estimateProjectSF] Failed:", err.message);
    return null;
  }
}

// ─── Schedule → Line Items ────────────────────────────────────────────
// Match parsed schedule entries to seed elements for itemized costs

// Helper: check if a finish value is effectively "none"
function isNone(val) {
  if (!val) return true;
  const v = val.toLowerCase().trim();
  return v === "none" || v === "n/a" || v === "-" || v === "--" || v === "—" || v === "";
}

// ─── Extract Building Parameters from Parsed Schedules ───────────────
// Analyze finish schedules and other schedule types to infer room counts,
// floor count, and other building parameters
export function extractBuildingParamsFromSchedules(schedules) {
  const roomCounts = {};
  const detectedFloors = new Set();

  // ── Layer 1: Finish material inference ──
  // When a room name doesn't match any regex, the FINISHES tell us what the room is.
  // Ceramic tile on floor + tile on walls = bathroom (nobody tiles every wall of a bedroom).
  // Tile floor + partial-height tile on walls = kitchen (backsplash).
  // Concrete/epoxy floor + exposed or painted walls = garage/utility.
  function inferRoomFromFinishes(entry) {
    const floor = (entry.floor || "").toLowerCase();
    const walls = [entry.north_wall, entry.south_wall, entry.east_wall, entry.west_wall, entry.walls]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const ceiling = (entry.ceiling || "").toLowerCase();
    const notes = (entry.notes || "").toLowerCase();

    const tileFloor = /ceramic|porcelain|mosaic|marble|stone/.test(floor);
    const tileWalls = /ceramic|porcelain|tile|mosaic|marble/.test(walls);
    const partialTileWalls = /to\s*\d|backsplash|wainscot|bead\s*board/.test(walls) && tileWalls;
    const fullTileWalls = tileWalls && /full|ceil|floor.to|ftc|f\.t\.c/i.test(walls);
    const moistureCeiling = /moisture|greenboard|cement\s*board|dens/i.test(ceiling) || /gwb.*paint/i.test(ceiling);
    const concreteFloor = /concrete|epoxy|sealed|polished/i.test(floor);

    // Bathroom: tile floor + full-height tile walls, OR any mention of shower/wc/tub in notes
    if (tileFloor && (fullTileWalls || (tileWalls && moistureCeiling))) return "bathroom";
    if (/shower|tub|wc|water\s*closet|toilet|lav/.test(notes)) return "bathroom";

    // Kitchen: tile floor + partial-height tile walls (backsplash pattern)
    if (tileFloor && partialTileWalls && !fullTileWalls) return "kitchen";
    if (/range|oven|dishwasher|cook|appliance/.test(notes)) return "kitchen";

    // Garage/utility: concrete or epoxy floor
    if (concreteFloor && /exposed|unfinished|none|n\/a/.test(walls)) return "garage";
    if (concreteFloor && /paint|seal/.test(walls)) return "utility";

    // Laundry: vinyl/VCT floor + moisture-resistant ceiling (small room)
    if (/vinyl|vct|lvt|sheet/.test(floor) && moistureCeiling) return "laundry";

    return null;
  }

  for (const schedule of schedules) {
    const { type, entries } = schedule;
    if (!entries || entries.length === 0) continue;

    if (type === "finish") {
      for (const entry of entries) {
        const room = (entry.room || "").toLowerCase();
        if (!room) continue;

        let matchedByName = false;

        // ── Pass 1: Room name regex (explicit labels) ──
        if (/\b(bath|bathroom|restroom|toilet|lavatory|wc|washroom|powder|ensuite|en-suite)\b/.test(room)) {
          roomCounts.bathrooms = (roomCounts.bathrooms || 0) + 1;
          matchedByName = true;
        }
        if (/\b(kitchen|kitchenette|pantry|kit)\b/.test(room)) {
          roomCounts.kitchens = (roomCounts.kitchens || 0) + 1;
          matchedByName = true;
        }
        if (/\b(stair|stairs|staircase|stairwell|stairway)\b/.test(room)) {
          roomCounts.staircases = (roomCounts.staircases || 0) + 1;
          matchedByName = true;
        }
        if (/\b(laundry|mud\s*room|wash\s*room)\b/.test(room) && !/\b(bath|restroom|toilet)\b/.test(room)) {
          roomCounts.storageRooms = (roomCounts.storageRooms || 0) + 1;
          matchedByName = true;
        }
        // Remaining types — lower priority, else-if is fine
        if (/\b(office|exec\b|director|manager|workspace)\b/.test(room)) {
          roomCounts.offices = (roomCounts.offices || 0) + 1;
          matchedByName = true;
        } else if (/\b(conference|meeting|board\s*room|huddle)\b/.test(room)) {
          roomCounts.conferenceRooms = (roomCounts.conferenceRooms || 0) + 1;
          matchedByName = true;
        } else if (/\b(break\s*room|lounge|lunchroom|cafeteria)\b/.test(room)) {
          roomCounts.breakRooms = (roomCounts.breakRooms || 0) + 1;
          matchedByName = true;
        } else if (/\b(lobby|reception|entry|foyer|vestibule|atrium)\b/.test(room)) {
          roomCounts.lobbies = (roomCounts.lobbies || 0) + 1;
          matchedByName = true;
        } else if (/\b(server|it\s*room|data|telecom|mdf|idf)\b/.test(room)) {
          roomCounts.serverRooms = (roomCounts.serverRooms || 0) + 1;
          matchedByName = true;
        } else if (/\b(storage|utility|janitor|mechanical|electrical\s*room|mech)\b/.test(room)) {
          roomCounts.storageRooms = (roomCounts.storageRooms || 0) + 1;
          matchedByName = true;
        } else if (/\b(elevator|elev|lift)\b/.test(room)) {
          roomCounts.elevators = (roomCounts.elevators || 0) + 1;
          matchedByName = true;
        } else if (/\b(unit|apt|apartment|suite|bedroom)\b/.test(room)) {
          roomCounts.residentialUnits = (roomCounts.residentialUnits || 0) + 1;
          matchedByName = true;
        }

        // ── Pass 2: Finish material inference (when room name didn't match) ──
        // A room labeled "201" with ceramic tile floor + full-height tile walls = bathroom
        if (!matchedByName) {
          const inferred = inferRoomFromFinishes(entry);
          if (inferred === "bathroom") roomCounts.bathrooms = (roomCounts.bathrooms || 0) + 1;
          else if (inferred === "kitchen") roomCounts.kitchens = (roomCounts.kitchens || 0) + 1;
          else if (inferred === "garage") roomCounts.parkingSpaces = (roomCounts.parkingSpaces || 0) + 1;
          else if (inferred === "utility" || inferred === "laundry")
            roomCounts.storageRooms = (roomCounts.storageRooms || 0) + 1;
        }

        // Detect floor from room name — require explicit floor indicators
        // Pattern 1: ordinal REQUIRED before floor/level (e.g., "1st Floor Hall", "2nd Fl Bath")
        // Pattern 2: "floor"/"level" before number (e.g., "Floor 2", "Level 3")
        // This prevents room numbers (e.g., "Room 105") from false-matching near "floor" text
        const floorMatch =
          room.match(/\b(\d+)(?:st|nd|rd|th)\s*(?:fl(?:oor)?|level)\b/i) ||
          room.match(/\b(?:fl(?:oor)?|level)\s*#?(\d+)\b/i);
        if (floorMatch) detectedFloors.add(parseInt(floorMatch[1]));
      }
    }

    // ── Layer 2: Plumbing fixture cross-reference ──
    if (type === "plumbing-fixture") {
      const toilets = entries.filter(e => /toilet|water closet|wc|urinal/i.test(e.fixture_type || ""));
      const sinks = entries.filter(e => /lavatory|sink|basin/i.test(e.fixture_type || ""));
      const kitchenSinks = entries.filter(e => /kitchen\s*sink|k\.?s\.?/i.test(e.fixture_type || e.mark || ""));
      const washerConns = entries.filter(e => /washer|washing|laundry|clothes/i.test(e.fixture_type || ""));

      // Bathroom count: take max of finish-schedule count and toilet count
      if (toilets.length > 0 || sinks.length > 0) {
        // Each bathroom has at least 1 toilet; non-bathroom sinks (kitchen, utility) don't count
        const bathroomSinks = sinks.length - kitchenSinks.length - washerConns.length;
        const fixtureEstimate = Math.max(toilets.length, Math.ceil(Math.max(0, bathroomSinks) / 1.5));
        roomCounts.bathrooms = Math.max(roomCounts.bathrooms || 0, fixtureEstimate);
      }

      // Kitchen: if plumbing schedule has a kitchen sink, there's at least 1 kitchen
      if (kitchenSinks.length > 0) {
        roomCounts.kitchens = Math.max(roomCounts.kitchens || 0, 1);
      }
    }

    // Equipment schedule → kitchen detection
    if (type === "equipment") {
      const kitchenEquip = entries.filter(e =>
        /oven|range|fryer|dishwasher|hood|refrigerator|freezer|mixer/i.test(e.description || ""),
      );
      if (kitchenEquip.length > 0) {
        roomCounts.kitchens = Math.max(roomCounts.kitchens || 0, 1);
      }
    }
  }

  return {
    roomCounts,
    floorCount: detectedFloors.size > 0 ? Math.min(Math.max(...detectedFloors), 99) : 0,
    detectedFloors: [...detectedFloors].sort((a, b) => a - b),
  };
}

export async function generateScheduleLineItems(schedules) {
  const lineItems = [];

  for (const schedule of schedules) {
    const { type, entries, sheetId } = schedule;
    if (!entries || entries.length === 0) continue;

    switch (type) {
      case "wall-types":
        for (const entry of entries) {
          if (!entry.typeLabel) continue;
          // Match material to seed elements
          const material = (entry.material || "").toLowerCase();
          if (material.includes("metal stud") || material.includes("steel stud")) {
            const seedMatch = await findSeedByVector(["metal stud", "wall"], entry.studs);
            lineItems.push({
              code: "05.400",
              description:
                `Wall Type ${entry.typeLabel}: ${entry.material || "Metal Stud"} ${entry.studs || ""} @ ${entry.height || ""}' — ${entry.insulation || ""}`.trim(),
              unit: "SF",
              seedId: seedMatch?.id,
              m: seedMatch?.material || 0,
              l: seedMatch?.labor || 0,
              e: seedMatch?.equipment || 0,
              qty: 0, // to be determined from takeoffs
              source: { type, sheetId, entry: entry.typeLabel },
              confidence: seedMatch ? "high" : "low",
            });
          }
          if (entry.drywall && entry.drywall.toLowerCase() !== "none") {
            lineItems.push({
              code: "09.250",
              description: `Drywall — ${entry.typeLabel}: ${entry.drywall}`,
              unit: "SF",
              m: 0,
              l: 0,
              e: 0,
              qty: 0,
              source: { type, sheetId, entry: entry.typeLabel },
              confidence: "medium",
            });
          }
          if (entry.insulation && entry.insulation.toLowerCase() !== "none") {
            lineItems.push({
              code: "07.210",
              description: `Insulation — ${entry.typeLabel}: ${entry.insulation}`,
              unit: "SF",
              m: 0,
              l: 0,
              e: 0,
              qty: 0,
              source: { type, sheetId, entry: entry.typeLabel },
              confidence: "medium",
            });
          }
        }
        break;

      case "door":
        for (const entry of entries) {
          if (!entry.mark && !entry.type) continue;
          const seedMatch = await findSeedByVector(["door", entry.material, entry.type]);
          const doorQty = parseInt(entry.quantity) || 1;
          const doorQtySource =
            entry.quantity != null && parseInt(entry.quantity) > 0
              ? entry._counted
                ? "floor-plan"
                : "schedule"
              : "default";
          lineItems.push({
            code: "08.110",
            description:
              `Door ${entry.mark || ""}: ${entry.width || ""}x${entry.height || ""} ${entry.material || ""} ${entry.type || ""}${entry.fire_rating && entry.fire_rating !== "None" ? ` (${entry.fire_rating} rated)` : ""}`.trim(),
            unit: "EA",
            seedId: seedMatch?.id,
            m: seedMatch?.material || 0,
            l: seedMatch?.labor || 0,
            e: seedMatch?.equipment || 0,
            qty: doorQty,
            qtySource: doorQtySource,
            source: { type, sheetId, entry: entry.mark },
            confidence: seedMatch ? "high" : "medium",
          });
          // Frame line item
          if (entry.frame) {
            lineItems.push({
              code: "08.110",
              description: `Door Frame ${entry.mark || ""}: ${entry.frame} frame`,
              unit: "EA",
              m: 0,
              l: 0,
              e: 0,
              qty: doorQty,
              qtySource: doorQtySource,
              source: { type, sheetId, entry: entry.mark },
              confidence: "low",
            });
          }
          // Hardware
          if (entry.hardware) {
            lineItems.push({
              code: "08.710",
              description: `Hardware ${entry.mark || ""}: ${entry.hardware}`,
              unit: "EA",
              m: 0,
              l: 0,
              e: 0,
              qty: doorQty,
              qtySource: doorQtySource,
              source: { type, sheetId, entry: entry.mark },
              confidence: "low",
            });
          }
        }
        break;

      case "window":
        for (const entry of entries) {
          if (!entry.mark && !entry.type) continue;
          const seedMatch = await findSeedByVector(["window", entry.frame, entry.type]);
          lineItems.push({
            code: "08.510",
            description:
              `Window ${entry.mark || ""}: ${entry.width || ""}x${entry.height || ""} ${entry.frame || ""} ${entry.type || ""} ${entry.glazing || ""}`.trim(),
            unit: "EA",
            seedId: seedMatch?.id,
            m: seedMatch?.material || 0,
            l: seedMatch?.labor || 0,
            e: seedMatch?.equipment || 0,
            qty: parseInt(entry.quantity) || 1,
            qtySource:
              entry.quantity != null && parseInt(entry.quantity) > 0
                ? entry._counted
                  ? "floor-plan"
                  : "schedule"
                : "default",
            source: { type, sheetId, entry: entry.mark },
            confidence: seedMatch ? "high" : "medium",
          });
        }
        break;

      case "finish":
        for (const entry of entries) {
          if (!entry.room) continue;

          // ── Floor finish ──
          if (entry.floor && !isNone(entry.floor)) {
            const floorLower = entry.floor.toLowerCase();
            let floorCode = "09.600"; // generic flooring
            if (floorLower.includes("carpet")) floorCode = "09.680";
            else if (floorLower.includes("vct") || floorLower.includes("vinyl")) floorCode = "09.650";
            else if (floorLower.includes("ceramic") || floorLower.includes("porcelain") || floorLower.includes("tile"))
              floorCode = "09.310";
            else if (floorLower.includes("terrazzo")) floorCode = "09.340";
            else if (floorLower.includes("epoxy") || floorLower.includes("resinous")) floorCode = "09.670";
            else if (floorLower.includes("wood") || floorLower.includes("hardwood")) floorCode = "09.640";
            else if (floorLower.includes("rubber")) floorCode = "09.650";
            else if (floorLower.includes("polish") || floorLower.includes("seal")) floorCode = "03.350";
            lineItems.push({
              code: floorCode,
              description: `Flooring — ${entry.room}: ${entry.floor}`,
              unit: "SF",
              m: 0,
              l: 0,
              e: 0,
              qty: 0,
              source: { type, sheetId, entry: entry.room },
              confidence: "medium",
            });
          }

          // ── Base finish ──
          if (entry.base && !isNone(entry.base)) {
            const baseLower = entry.base.toLowerCase();
            let baseCode = "09.650"; // generic base
            if (baseLower.includes("rubber")) baseCode = "09.650";
            else if (baseLower.includes("ceramic") || baseLower.includes("tile")) baseCode = "09.310";
            else if (baseLower.includes("wood")) baseCode = "06.220";
            lineItems.push({
              code: baseCode,
              description: `Base — ${entry.room}: ${entry.base}`,
              unit: "LF",
              m: 0,
              l: 0,
              e: 0,
              qty: 0,
              source: { type, sheetId, entry: entry.room },
              confidence: "medium",
            });
          }

          // ── Wall finishes — check all wall fields ──
          const wallFields = ["north_wall", "south_wall", "east_wall", "west_wall"];
          const wallFinishes = new Set(); // dedupe identical finishes per room
          wallFields.forEach(wf => {
            const val = entry[wf];
            if (val && !isNone(val) && !wallFinishes.has(val)) {
              wallFinishes.add(val);
              const wallLower = val.toLowerCase();
              let wallCode = "09.910"; // default: painting
              let wallUnit = "SF";
              if (
                wallLower.includes("paint") ||
                wallLower.includes("gwb") ||
                wallLower.includes("gypsum") ||
                wallLower.includes("drywall") ||
                wallLower.includes("level")
              ) {
                wallCode = "09.910"; // painting
              } else if (
                wallLower.includes("ceramic") ||
                wallLower.includes("porcelain") ||
                wallLower.includes("tile")
              ) {
                wallCode = "09.310"; // ceramic tile
              } else if (wallLower.includes("frp") || wallLower.includes("fiber")) {
                wallCode = "09.770"; // FRP panels
              } else if (
                wallLower.includes("vinyl") ||
                wallLower.includes("wallcovering") ||
                wallLower.includes("wall covering")
              ) {
                wallCode = "09.720"; // wall coverings
              } else if (wallLower.includes("cmu") || wallLower.includes("block") || wallLower.includes("masonry")) {
                wallCode = "04.200"; // masonry
              } else if (wallLower.includes("panel") || wallLower.includes("acoustic")) {
                wallCode = "09.510"; // acoustical treatment
              } else if (wallLower.includes("epoxy")) {
                wallCode = "09.670"; // epoxy coating
              }
              lineItems.push({
                code: wallCode,
                description: `Wall Finish — ${entry.room}: ${val}`,
                unit: wallUnit,
                m: 0,
                l: 0,
                e: 0,
                qty: 0,
                source: { type, sheetId, entry: entry.room },
                confidence: "medium",
              });
            }
          });

          // ── Ceiling finish ──
          if (entry.ceiling && !isNone(entry.ceiling) && entry.ceiling.toLowerCase() !== "exposed") {
            const ceilLower = entry.ceiling.toLowerCase();
            let ceilCode = "09.510"; // default: acoustical ceiling
            if (
              ceilLower.includes("act") ||
              ceilLower.includes("acoustic") ||
              ceilLower.includes("armstrong") ||
              ceilLower.includes("2x")
            ) {
              ceilCode = "09.510"; // ACT
            } else if (
              ceilLower.includes("gwb") ||
              ceilLower.includes("gypsum") ||
              ceilLower.includes("drywall") ||
              ceilLower.includes("paint")
            ) {
              ceilCode = "09.250"; // GWB ceiling
            } else if (ceilLower.includes("metal") || ceilLower.includes("linear")) {
              ceilCode = "09.540"; // specialty ceiling
            } else if (ceilLower.includes("wood") || ceilLower.includes("plank")) {
              ceilCode = "09.540"; // specialty ceiling
            }
            lineItems.push({
              code: ceilCode,
              description: `Ceiling — ${entry.room}: ${entry.ceiling}`,
              unit: "SF",
              m: 0,
              l: 0,
              e: 0,
              qty: 0,
              source: { type, sheetId, entry: entry.room },
              confidence: "medium",
            });
          }
        }
        break;

      case "plumbing-fixture":
        for (const entry of entries) {
          if (!entry.mark && !entry.fixture_type) continue;
          const seedMatch = await findSeedByVector(["plumbing", entry.fixture_type]);
          lineItems.push({
            code: "22.400",
            description:
              `${entry.fixture_type || "Plumbing Fixture"} ${entry.mark || ""}${entry.manufacturer ? ` (${entry.manufacturer})` : ""}${entry.model ? ` ${entry.model}` : ""}`.trim(),
            unit: "EA",
            seedId: seedMatch?.id,
            m: seedMatch?.material || 0,
            l: seedMatch?.labor || 0,
            e: seedMatch?.equipment || 0,
            qty: parseInt(entry.quantity) || 1,
            qtySource:
              entry.quantity != null && parseInt(entry.quantity) > 0
                ? entry._counted
                  ? "floor-plan"
                  : "schedule"
                : "default",
            source: { type, sheetId, entry: entry.mark },
            confidence: seedMatch ? "high" : "medium",
          });
        }
        break;

      case "equipment":
        for (const entry of entries) {
          if (!entry.mark && !entry.description) continue;
          lineItems.push({
            code: "11.400",
            description:
              `Equipment ${entry.mark || ""}: ${entry.description || ""}${entry.size ? ` (${entry.size})` : ""}`.trim(),
            unit: "EA",
            m: 0,
            l: 0,
            e: 0,
            qty: parseInt(entry.quantity) || 1,
            qtySource:
              entry.quantity != null && parseInt(entry.quantity) > 0
                ? entry._counted
                  ? "floor-plan"
                  : "schedule"
                : "default",
            source: { type, sheetId, entry: entry.mark },
            confidence: "low",
          });
        }
        break;

      case "lighting-fixture":
        for (const entry of entries) {
          if (!entry.mark && !entry.description) continue;
          lineItems.push({
            code: "26.510",
            description:
              `Lighting ${entry.mark || ""}: ${entry.description || ""}${entry.lamp_type ? ` (${entry.lamp_type})` : ""}${entry.wattage ? ` ${entry.wattage}W` : ""}`.trim(),
            unit: "EA",
            m: 0,
            l: 0,
            e: 0,
            qty: parseInt(entry.quantity) || 0,
            qtySource:
              entry.quantity != null && parseInt(entry.quantity) > 0
                ? entry._counted
                  ? "floor-plan"
                  : "schedule"
                : "default",
            source: { type, sheetId, entry: entry.mark },
            confidence: "medium",
          });
        }
        break;

      case "mechanical-equipment":
        for (const entry of entries) {
          if (!entry.mark && !entry.description) continue;
          lineItems.push({
            code: "23.300",
            description:
              `Mech Equip ${entry.mark || ""}: ${entry.description || ""}${entry.capacity_tons_cfm ? ` (${entry.capacity_tons_cfm})` : ""}${entry.voltage ? `, ${entry.voltage}` : ""}`.trim(),
            unit: "EA",
            m: 0,
            l: 0,
            e: 0,
            qty: parseInt(entry.quantity) || 1,
            qtySource:
              entry.quantity != null && parseInt(entry.quantity) > 0
                ? entry._counted
                  ? "floor-plan"
                  : "schedule"
                : "default",
            source: { type, sheetId, entry: entry.mark },
            confidence: "low",
          });
        }
        break;

      case "finish-detail":
        for (const entry of entries) {
          if (!entry.material_type) continue;
          lineItems.push({
            code: "09.900",
            description:
              `${entry.material_type}: ${entry.manufacturer || ""} ${entry.product || ""} — ${entry.color || ""} ${entry.application_area ? `(${entry.application_area})` : ""}`.trim(),
            unit: "SF",
            m: 0,
            l: 0,
            e: 0,
            qty: 0,
            source: { type, sheetId, entry: entry.material_type },
            confidence: "low",
          });
        }
        break;
    }
  }

  // Add scheduleType for section-level grouping in import UI
  lineItems.forEach(li => {
    if (li.source?.type) li.scheduleType = li.source.type;
  });

  return lineItems;
}

// ─── Seed Element Matching ────────────────────────────────────────────

/** Vector-powered seed matching — async, falls back to keyword scoring */
async function findSeedByVector(keywords, sizeHint) {
  const query = keywords.filter(Boolean).join(" ") + (sizeHint ? ` ${sizeHint}` : "");
  try {
    const { results } = await searchSimilar(query, {
      kinds: ["seed_element"],
      limit: 1,
      threshold: 0.35,
    });
    if (results && results.length > 0) {
      const match = results[0];
      return {
        id: match.source_id,
        name: match.metadata?.name,
        code: match.metadata?.code,
        unit: match.metadata?.unit,
        trade: match.metadata?.trade,
        material: match.metadata?.material || 0,
        labor: match.metadata?.labor || 0,
        equipment: match.metadata?.equipment || 0,
        subcontractor: match.metadata?.subcontractor || 0,
        similarity: match.similarity,
      };
    }
    return null;
  } catch {
    // Fallback to keyword matching if vector search is unavailable
    return findSeedByKeywords(keywords, sizeHint);
  }
}

/** Legacy keyword-scoring fallback */
function findSeedByKeywords(keywords, sizeHint) {
  const terms = keywords.filter(Boolean).map(k => k.toLowerCase());
  let best = null;
  let bestScore = 0;

  SEED_ELEMENTS.forEach(seed => {
    const name = seed.name.toLowerCase();
    let score = 0;
    terms.forEach(term => {
      if (name.includes(term)) score += 2;
      // Partial word match
      const words = term.split(/\s+/);
      words.forEach(w => {
        if (w.length > 2 && name.includes(w)) score += 1;
      });
    });
    // Size hint bonus
    if (sizeHint && name.includes(sizeHint.toLowerCase())) score += 3;
    if (score > bestScore) {
      bestScore = score;
      best = seed;
    }
  });

  return bestScore >= 2 ? best : null;
}

// ─── AI-Augmented ROM ─────────────────────────────────────────────────
// Single AI call to refine ROM based on parsed schedules + project context
export async function augmentROMWithAI({ baseline, scheduleItems, projectContext, notesContext }) {
  const scheduleSummary = scheduleItems
    .map(li => `${li.code} ${li.description} (${li.unit}${li.qty ? `, qty: ${li.qty}` : ""})`)
    .join("\n");

  const divisionSummary = Object.entries(baseline.divisions)
    .map(
      ([div, data]) => `Div ${div} ${data.label}: $${data.perSF.low}-$${data.perSF.high}/SF (mid: $${data.perSF.mid})`,
    )
    .join("\n");

  try {
    const result = await callAnthropic({
      max_tokens: 3000,
      system: `You are a senior construction cost estimator. You're reviewing a ROM (Rough Order of Magnitude) estimate for a ${baseline.projectSF} SF ${baseline.jobType} project. Adjust the baseline $/SF ranges based on the detected schedule details. Be practical — schedules reveal actual scope complexity.`,
      messages: [
        {
          role: "user",
          content: `Here is the baseline ROM by division:
${divisionSummary}

Detected schedule line items:
${scheduleSummary || "(no schedule items detected)"}

${projectContext ? `Project context:\n${projectContext}` : ""}

${notesContext ? `${notesContext}\n` : ""}Based on the detected schedules${notesContext ? " and drawing notes" : ""}, refine the ROM estimates. If schedules reveal above-average complexity (many door types, high-end finishes, extensive mechanical equipment), increase the relevant divisions. If schedules show basic/standard selections, keep baseline or reduce slightly.

Return ONLY a JSON object with:
{
  "adjustments": {
    "<div_code>": { "mid": <adjusted_$/SF>, "reason": "<brief reason>" }
  },
  "notes": "<overall assessment in 1-2 sentences>"
}

Only include divisions that need adjustment. Use the 2-digit division code (e.g., "08", "09", "23").`,
        },
      ],
    });

    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { ...baseline, aiNotes: "AI response did not contain valid JSON" };
      const parsed = JSON.parse(jsonMatch[0]);

      // Apply adjustments to baseline
      const adjusted = JSON.parse(JSON.stringify(baseline)); // deep clone
      if (parsed.adjustments) {
        Object.entries(parsed.adjustments).forEach(([div, adj]) => {
          if (adjusted.divisions[div] && adj.mid) {
            const oldMid = adjusted.divisions[div].perSF.mid;
            const ratio = adj.mid / oldMid;
            adjusted.divisions[div].perSF.low = Math.round(adjusted.divisions[div].perSF.low * ratio * 100) / 100;
            adjusted.divisions[div].perSF.mid = Math.round(adj.mid * 100) / 100;
            adjusted.divisions[div].perSF.high = Math.round(adjusted.divisions[div].perSF.high * ratio * 100) / 100;
            // Recalculate totals
            const sf = adjusted.projectSF;
            adjusted.divisions[div].total = {
              low: Math.round(sf * adjusted.divisions[div].perSF.low),
              mid: Math.round(sf * adjusted.divisions[div].perSF.mid),
              high: Math.round(sf * adjusted.divisions[div].perSF.high),
            };
            adjusted.divisions[div].aiReason = adj.reason;
          }
        });

        // Recalculate totals
        let totalLow = 0,
          totalMid = 0,
          totalHigh = 0;
        Object.values(adjusted.divisions).forEach(d => {
          totalLow += d.total.low;
          totalMid += d.total.mid;
          totalHigh += d.total.high;
        });
        adjusted.totals = { low: totalLow, mid: totalMid, high: totalHigh };
      }

      adjusted.aiAugmented = true;
      adjusted.aiNotes = parsed.notes || "";
      return adjusted;
    } catch {
      return { ...baseline, aiNotes: "Failed to parse AI adjustments" };
    }
  } catch (err) {
    console.warn("[romEngine] AI augmentation failed:", err.message);
    return { ...baseline, aiNotes: `AI error: ${err.message}` };
  }
}

// ─── Calibration ──────────────────────────────────────────────────────
// Compare ROM prediction vs actual estimate to derive calibration factors
export function computeCalibration(romPrediction, actuals) {
  if (!romPrediction?.divisions || !actuals?.divisions) return {};

  const calibration = {};
  Object.keys(romPrediction.divisions).forEach(div => {
    const predicted = romPrediction.divisions[div]?.total?.mid || 0;
    const actual = actuals.divisions[div] || 0;
    if (predicted > 0 && actual > 0) {
      calibration[div] = Math.round((actual / predicted) * 100) / 100;
    }
  });
  return calibration;
}

// ─── Subdivision-Level ROM Generation ────────────────────────────────
// Takes a baseline ROM and enriches it with subdivision-level detail
// using the confidence-weighted engine (baseline benchmarks + user + LLM).
export async function generateSubdivisionROM({
  baselineRom,
  buildingType,
  userOverrides,
  llmRefinements,
  calibrationFactors,
  engineConfig,
  generateLlm = false,
  seedElements,
  signal,
  onProgress,
}) {
  if (!baselineRom?.divisions) return baselineRom;

  const bt = buildingType || baselineRom.buildingType || baselineRom.jobType || "commercial-office";
  const benchmarkSubs = SUBDIVISION_BENCHMARKS[bt] || {};
  const subdivisions = {};

  // Step 1: If LLM generation requested, generate subdivisions via AI
  let llmData = llmRefinements || {};
  if (generateLlm) {
    try {
      const generated = await generateAllSubdivisions({
        romResult: baselineRom,
        buildingType: bt,
        seedElements: seedElements || SEED_ELEMENTS,
        signal,
        onProgress,
      });
      // Merge generated data into llmData
      Object.entries(generated).forEach(([_divCode, subs]) => {
        subs.forEach(sub => {
          llmData[sub.code] = {
            pctOfDiv: sub.pctOfDiv,
            reasoning: `LLM-generated for ${bt}`,
            generatedAt: sub.generatedAt,
            validated: false,
          };
        });
      });
    } catch (err) {
      if (err.name === "AbortError") throw err;
      console.warn("[romEngine] LLM subdivision generation failed:", err.message);
    }
  }

  // Step 2: For each division, compute subdivision breakdowns
  Object.entries(baselineRom.divisions).forEach(([divCode, divData]) => {
    const baselineSubs = benchmarkSubs[divCode] || DEFAULT_SUBDIVISIONS[divCode];
    if (!baselineSubs || !baselineSubs.length) return;

    const result = computeSubdivisionBreakdown({
      divisionCode: divCode,
      divisionData: divData,
      baselineSubdivisions: baselineSubs,
      userOverrides: userOverrides || {},
      llmRefinements: llmData,
      calibrationFactors: calibrationFactors || {},
      engineConfig,
    });

    if (result.length > 0) {
      subdivisions[divCode] = result;
    }
  });

  return {
    ...baselineRom,
    subdivisions,
    subdivisionGenerated: true,
    subdivisionBuildingType: bt,
  };
}
