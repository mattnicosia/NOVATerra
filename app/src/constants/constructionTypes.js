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
  { key: "budget", label: "Budget" },
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
