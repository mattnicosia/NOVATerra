// Construction Type Taxonomy — Two-Axis Classification System
// Building Type (what kind of building) × Work Type (what kind of work)
// Used by: Cost History, ProjectInfoPage, romEngine, calibration

// ─── Building Types ───────────────────────────────────────────
// Primary axis — drives $/SF benchmarks in romEngine
export const BUILDING_TYPES = [
  { key: "commercial-office", label: "Commercial / Office" },
  { key: "retail", label: "Retail" },
  { key: "industrial", label: "Industrial / Warehouse" },
  { key: "healthcare", label: "Healthcare / Medical" },
  { key: "education", label: "Education" },
  { key: "hospitality", label: "Hospitality" },
  { key: "residential-multi", label: "Multi-Family Residential" },
  { key: "residential-single", label: "Residential" },
  { key: "mixed-use", label: "Mixed-Use" },
  { key: "government", label: "Government / Municipal" },
  { key: "religious", label: "Religious / House of Worship" },
  { key: "restaurant", label: "Restaurant / Food Service" },
  { key: "parking", label: "Parking Structure" },
];

// ─── Work Types ───────────────────────────────────────────────
// Secondary axis — applies multiplier to ROM benchmarks
// multiplier: 1.0 = new construction baseline
export const WORK_TYPES = [
  { key: "new-construction", label: "New Construction", multiplier: 1.0 },
  { key: "renovation", label: "Renovation", multiplier: 1.15 },
  { key: "gut-renovation", label: "Gut Renovation", multiplier: 1.25 },
  { key: "tenant-fit-out", label: "Tenant Fit-Out", multiplier: 0.65 },
  { key: "interior-fit-out", label: "Interior Fit-Out", multiplier: 0.6 },
  { key: "addition", label: "Addition", multiplier: 1.1 },
  { key: "adaptive-reuse", label: "Adaptive Reuse", multiplier: 1.2 },
  { key: "historic-restoration", label: "Historic Restoration", multiplier: 1.35 },
  { key: "shell-core", label: "Shell & Core", multiplier: 0.7 },
  { key: "capital-improvement", label: "Capital Improvement", multiplier: 0.85 },
  { key: "demolition", label: "Demolition", multiplier: 0.3 },
  { key: "interior-demo", label: "Interior Demolition", multiplier: 0.2 },
];

// ─── Labor Types ─────────────────────────────────────────
export const LABOR_TYPES = [
  { key: "open-shop", label: "Open Shop", multiplier: 1.0 },
  { key: "prevailing", label: "Prevailing Wage", multiplier: 1.35 },
  { key: "union", label: "Union", multiplier: 1.45 },
];

export const LABOR_TYPE_MAP = Object.fromEntries(LABOR_TYPES.map(l => [l.key, l]));
export const getLaborTypeMultiplier = key => LABOR_TYPE_MAP[key]?.multiplier ?? 1.0;
export const getLaborTypeLabel = key => LABOR_TYPE_MAP[key]?.label || key || "";

// ─── Market / Location Adjustments ─────────────────────────────────
// Regional cost indices relative to national average (1.0)
// Based on RSMeans City Cost Index patterns for NY metro area
export const MARKET_REGIONS = [
  { key: "manhattan", label: "Manhattan", multiplier: 1.45, zip: /^100|^101|^102/ },
  { key: "brooklyn", label: "Brooklyn / Queens", multiplier: 1.30, zip: /^112|^111|^113|^114/ },
  { key: "bronx", label: "Bronx", multiplier: 1.25, zip: /^104/ },
  { key: "staten-island", label: "Staten Island", multiplier: 1.20, zip: /^103/ },
  { key: "nassau", label: "Nassau County", multiplier: 1.15, zip: /^115|^110|^116/ },
  { key: "suffolk-west", label: "Suffolk County (West)", multiplier: 1.10, zip: /^117|^117[0-5]/ },
  { key: "suffolk-east", label: "Suffolk County (East)", multiplier: 1.05, zip: /^117[6-9]|^119/ },
  { key: "westchester", label: "Westchester", multiplier: 1.20, zip: /^105|^106|^107|^108/ },
  { key: "rockland", label: "Rockland County", multiplier: 1.10, zip: /^109/ },
  { key: "hudson-valley", label: "Hudson Valley", multiplier: 1.05, zip: /^124|^125|^126|^128|^129/ },
  { key: "northern-nj", label: "Northern NJ", multiplier: 1.20, zip: /^07[0-4]/ },
  { key: "central-nj", label: "Central NJ", multiplier: 1.10, zip: /^07[5-9]|^08[0-9]/ },
  { key: "connecticut", label: "Connecticut", multiplier: 1.15, zip: /^06/ },
  { key: "south-florida", label: "South Florida", multiplier: 0.95, zip: /^33[0-4]/ },
  { key: "national", label: "National Average", multiplier: 1.0, zip: /.*/ },
];

export function getMarketMultiplier(locationOrZip) {
  if (!locationOrZip) return 1.0;
  const input = String(locationOrZip).trim();

  // Try ZIP match first
  const zipMatch = input.match(/\b(\d{5})\b/);
  if (zipMatch) {
    const zip = zipMatch[1];
    for (const region of MARKET_REGIONS) {
      if (region.zip.test(zip)) return region.multiplier;
    }
  }

  // Try keyword match
  const lower = input.toLowerCase();
  if (lower.includes("manhattan") || lower.includes("midtown") || lower.includes("downtown ny")) return 1.45;
  if (lower.includes("brooklyn") || lower.includes("queens")) return 1.30;
  if (lower.includes("bronx")) return 1.25;
  if (lower.includes("nassau")) return 1.15;
  if (lower.includes("suffolk") || lower.includes("long island")) return 1.10;
  if (lower.includes("westchester")) return 1.20;
  if (lower.includes("hudson valley") || lower.includes("rockland")) return 1.05;
  if (lower.includes("jersey") || lower.includes("nj")) return 1.15;
  if (lower.includes("connecticut") || lower.includes("ct")) return 1.15;
  if (lower.includes("miami") || lower.includes("florida") || lower.includes("fl")) return 0.95;

  return 1.0; // national average fallback
}

export function detectMarketRegion(locationOrZip) {
  if (!locationOrZip) return { key: "national", label: "National Average", multiplier: 1.0 };
  const mult = getMarketMultiplier(locationOrZip);
  const region = MARKET_REGIONS.find(r => r.multiplier === mult) || MARKET_REGIONS[MARKET_REGIONS.length - 1];
  return region;
}

// ─── Outcome Statuses ─────────────────────────────────────────
// Bid outcome tracking for Cost History analytics
export const OUTCOME_STATUSES = [
  { key: "pending", label: "Pending", color: "blue" },
  { key: "won", label: "Won", color: "green" },
  { key: "lost", label: "Lost", color: "red" },
  { key: "withdrawn", label: "Withdrawn", color: "orange" },
  { key: "no-bid", label: "No Bid", color: "textDim" },
  { key: "unknown", label: "Unknown", color: "textDim" },
];

// ─── Lost Reasons ─────────────────────────────────────────────
export const LOST_REASONS = [
  { key: "price", label: "Price" },
  { key: "not-proceeded", label: "Project Did Not Proceed" },
  { key: "schedule", label: "Schedule" },
  { key: "relationship", label: "Relationship" },
  { key: "scope", label: "Scope / Qualifications" },
  { key: "capacity", label: "Capacity / Resources" },
  { key: "other", label: "Other" },
];

// ─── Structural Systems ─────────────────────────────────────
// Drives Div 03/04/05/06 cost profiles — steel vs concrete vs wood vs masonry
export const STRUCTURAL_SYSTEMS = [
  { key: "steel-frame", label: "Steel Frame" },
  { key: "concrete-frame", label: "Concrete Frame" },
  { key: "wood-frame", label: "Wood Frame" },
  { key: "load-bearing-masonry", label: "Load-Bearing Masonry" },
  { key: "hybrid", label: "Hybrid / Mixed" },
  { key: "pre-engineered", label: "Pre-Engineered Metal" },
  { key: "tilt-up", label: "Tilt-Up Concrete" },
];

// ─── Delivery Methods ───────────────────────────────────────
// Project delivery — affects pricing strategy and win/loss patterns
export const DELIVERY_METHODS = [
  { key: "hard-bid", label: "Hard Bid / Lump Sum" },
  { key: "lump-sum", label: "Lump Sum" },
  { key: "negotiated", label: "Negotiated" },
  { key: "cm-at-risk", label: "CM at Risk" },
  { key: "cost-plus", label: "Cost-Plus" },
  { key: "design-build", label: "Design-Build" },
  { key: "gmp", label: "GMP" },
];

// ─── Lookup Helpers ───────────────────────────────────────────

/** Map: buildingType key → display label */
export const BUILDING_TYPE_MAP = Object.fromEntries(BUILDING_TYPES.map(b => [b.key, b.label]));

/** Map: workType key → { key, label, multiplier } */
export const WORK_TYPE_MAP = Object.fromEntries(WORK_TYPES.map(w => [w.key, w]));

/** Map: outcome key → { key, label, color } */
export const OUTCOME_MAP = Object.fromEntries(OUTCOME_STATUSES.map(o => [o.key, o]));

/** Get the ROM multiplier for a work type key. Falls back to 1.0 */
export const getWorkTypeMultiplier = key => WORK_TYPE_MAP[key]?.multiplier ?? 1.0;

/** Get display label for a building type key */
export const getBuildingTypeLabel = key => BUILDING_TYPE_MAP[key] || key || "Unclassified";

/** Get display label for a work type key */
export const getWorkTypeLabel = key => WORK_TYPE_MAP[key]?.label || key || "";

/** Map: structural system key → display label */
export const STRUCTURAL_SYSTEM_MAP = Object.fromEntries(STRUCTURAL_SYSTEMS.map(s => [s.key, s.label]));

/** Map: delivery method key → display label */
export const DELIVERY_METHOD_MAP = Object.fromEntries(DELIVERY_METHODS.map(d => [d.key, d.label]));

/** Get outcome display info */
export const getOutcomeInfo = key => OUTCOME_MAP[key] || { key: "pending", label: "Pending", color: "blue" };

/** Get display label for a structural system key */
export const getStructuralSystemLabel = key => STRUCTURAL_SYSTEM_MAP[key] || key || "";

/** Get display label for a delivery method key */
export const getDeliveryMethodLabel = key => DELIVERY_METHOD_MAP[key] || key || "";
