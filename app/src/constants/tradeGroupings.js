// Trade Bundles — maps CSI divisions to how GCs actually organize & present estimates
// Each bundle has a label (how it appears on proposals/SOV), a sort order,
// and the CSI division codes that roll up into it.

export const TRADE_GROUPINGS = [
  { key: "general", label: "General Conditions", sort: 1, divisions: ["01"] },
  { key: "demo", label: "Demolition", sort: 2, divisions: ["02"] },
  { key: "sitework", label: "Sitework", sort: 3, divisions: ["31", "32", "33"] },
  { key: "concrete", label: "Concrete", sort: 4, divisions: ["03"] },
  { key: "masonry", label: "Masonry", sort: 5, divisions: ["04"] },
  { key: "steel", label: "Structural Steel", sort: 6, divisions: ["05"] },
  { key: "framing", label: "Rough Carpentry", sort: 7, divisions: [] }, // 06.1xx items
  { key: "finishCarp", label: "Finish Carpentry & Millwork", sort: 8, divisions: [] }, // 06.2xx–06.4xx items
  { key: "insulation", label: "Insulation", sort: 9, divisions: [] }, // 07.2xx items
  { key: "roofing", label: "Roofing & Waterproofing", sort: 10, divisions: [] }, // 07.1xx, 07.3xx–07.9xx items
  { key: "doors", label: "Doors & Hardware", sort: 11, divisions: [] }, // 08 doors/hardware
  { key: "windows", label: "Windows & Glazing", sort: 12, divisions: [] }, // 08 windows/curtain wall
  { key: "drywall", label: "Drywall & Metal Framing", sort: 13, divisions: [] }, // 09.1xx–09.2xx (includes metal studs from 09.110)
  { key: "tile", label: "Tile", sort: 14, divisions: [] }, // 09.3xx
  { key: "act", label: "Acoustical Ceilings", sort: 15, divisions: [] }, // 09.5xx
  { key: "flooring", label: "Flooring", sort: 16, divisions: [] }, // 09.6xx
  { key: "painting", label: "Painting", sort: 17, divisions: [] }, // 09.9xx
  { key: "specialties", label: "Specialties", sort: 18, divisions: ["10"] },
  { key: "elevator", label: "Elevator", sort: 19, divisions: ["14"] },
  { key: "fireSuppression", label: "Fire Protection", sort: 20, divisions: ["21"] },
  { key: "plumbing", label: "Plumbing & Plumbing Fixtures", sort: 21, divisions: ["22"] },
  { key: "hvac", label: "HVAC", sort: 22, divisions: ["23"] },
  { key: "electrical", label: "Electric & Lighting", sort: 23, divisions: ["26", "27", "28"] },
];

// Quick lookup: trade key → trade object
export const TRADE_MAP = Object.fromEntries(TRADE_GROUPINGS.map(t => [t.key, t]));

// Aliases: legacy/alternate trade keys that map to canonical keys
const TRADE_ALIASES = { metalFraming: "drywall" };
const resolveTradeKey = key => TRADE_ALIASES[key] || key;

// Resolve active bundles — checks databaseStore for custom overrides
import { useDatabaseStore } from "@/stores/databaseStore";
const getActiveBundles = () => {
  const custom = useDatabaseStore.getState().customBundles;
  return custom || TRADE_GROUPINGS;
};

const getActiveMap = () => Object.fromEntries(getActiveBundles().map(t => [t.key, t]));

// Given an item, resolve its trade bundle label for display
export const getTradeLabel = item => {
  if (item.trade) {
    const map = getActiveMap();
    const t = map[resolveTradeKey(item.trade)];
    return t ? t.label : item.trade;
  }
  return item.division || "Unassigned";
};

// Given an item, resolve its trade bundle sort order
export const getTradeSortOrder = item => {
  if (item.trade) {
    const map = getActiveMap();
    const t = map[resolveTradeKey(item.trade)];
    return t ? t.sort : 99;
  }
  return 99;
};

// Reverse lookup: trade label → trade key
export const getTradeKeyFromLabel = label => {
  const bundles = getActiveBundles();
  const match = bundles.find(t => t.label === label);
  return match ? match.key : "";
};

// Auto-detect trade from CSI code (fallback when no trade is set)
export const autoTradeFromCode = code => {
  if (!code) return "";
  const div = code.split(".")[0];
  const sub = code.split(".").slice(0, 2).join(".");

  // Division 06 splits by subdivision
  if (div === "06") {
    const subNum = parseInt(sub.split(".")[1] || "0");
    if (subNum < 200) return "framing"; // 06.1xx = Rough Carpentry
    return "finishCarp"; // 06.2xx+ = Finish Carpentry & Millwork
  }

  // Division 07 splits by subdivision
  if (div === "07") {
    const subNum = parseInt(sub.split(".")[1] || "0");
    if (subNum >= 200 && subNum < 300) return "insulation"; // 07.2xx = Insulation
    return "roofing"; // Everything else = Roofing & Waterproofing
  }

  // Division 08 splits: doors/hardware vs windows/glazing
  if (div === "08") {
    const subNum = parseInt(sub.split(".")[1] || "0");
    if (subNum >= 500 && subNum < 700) return "windows"; // 08.5xx = Windows
    if (subNum >= 400 && subNum < 500) return "windows"; // 08.4xx = Curtain wall / Storefront
    if (subNum >= 800 && subNum < 900) return "windows"; // 08.8xx = Glazing
    return "doors"; // 08.1xx–08.3xx, 08.7xx = Doors & Hardware
  }

  // Division 09 splits by finish type
  if (div === "09") {
    const subNum = parseInt(sub.split(".")[1] || "0");
    if (subNum >= 100 && subNum < 300) return "drywall"; // 09.1xx–09.2xx = Drywall & Metal Framing
    if (subNum >= 300 && subNum < 400) return "tile"; // 09.3xx = Tile
    if (subNum >= 500 && subNum < 600) return "act"; // 09.5xx = ACT
    if (subNum >= 600 && subNum < 700) return "flooring"; // 09.6xx = Flooring
    if (subNum >= 900) return "painting"; // 09.9xx = Painting
    return "drywall"; // fallback for 09
  }

  // Simple full-division mappings — use active bundles
  const bundles = getActiveBundles();
  for (const t of bundles) {
    if (t.divisions.includes(div)) return t.key;
  }

  return "";
};

// ── Certification Types ──
export const CERTIFICATION_TYPES = [
  { key: "MBE", label: "Minority Business Enterprise" },
  { key: "WBE", label: "Women's Business Enterprise" },
  { key: "DBE", label: "Disadvantaged Business Enterprise" },
  { key: "SBE", label: "Small Business Enterprise" },
  { key: "HUBZone", label: "HUBZone" },
  { key: "8a", label: "8(a)" },
  { key: "SDVOSB", label: "Service-Disabled Veteran-Owned" },
  { key: "VOSB", label: "Veteran-Owned Small Business" },
  { key: "LGBTBE", label: "LGBT Business Enterprise" },
];

// ── Market Regions ──
export const MARKET_REGIONS = [
  "Northeast",
  "Mid-Atlantic",
  "Southeast",
  "Midwest",
  "Southwest",
  "Mountain West",
  "Pacific Northwest",
  "West Coast",
  "National",
];

// ── Trade Colors — for badge/pill coloring ──
export const TRADE_COLORS = {
  general: "#6B7280",
  demo: "#EF4444",
  sitework: "#92400E",
  concrete: "#6B7280",
  masonry: "#B45309",
  steel: "#4B5563",
  framing: "#D97706",
  finishCarp: "#D97706",
  insulation: "#F59E0B",
  roofing: "#7C3AED",
  doors: "#8B5CF6",
  windows: "#3B82F6",
  drywall: "#9CA3AF",
  tile: "#10B981",
  act: "#6EE7B7",
  flooring: "#059669",
  painting: "#EC4899",
  specialties: "#8B5CF6",
  elevator: "#6366F1",
  fireSuppression: "#DC2626",
  plumbing: "#0EA5E9",
  hvac: "#0284C7",
  electrical: "#F59E0B",
};

// ── Fuzzy match free-text trade to trade keys ──
const FUZZY_ALIASES = {
  mechanical: ["hvac", "plumbing"],
  mep: ["hvac", "plumbing", "electrical"],
  glazing: ["windows"],
  "curtain wall": ["windows"],
  storefront: ["windows"],
  "metal studs": ["drywall"],
  "metal framing": ["drywall"],
  gypsum: ["drywall"],
  "gyp board": ["drywall"],
  acoustical: ["act"],
  ceiling: ["act"],
  ceilings: ["act"],
  millwork: ["finishCarp"],
  casework: ["finishCarp"],
  cabinetry: ["finishCarp"],
  cabinets: ["finishCarp"],
  carpentry: ["framing"],
  "wood framing": ["framing"],
  waterproofing: ["roofing"],
  "fire sprinkler": ["fireSuppression"],
  sprinkler: ["fireSuppression"],
  "fire alarm": ["electrical"],
  "low voltage": ["electrical"],
  earthwork: ["sitework"],
  excavation: ["sitework"],
  paving: ["sitework"],
  landscape: ["sitework"],
  landscaping: ["sitework"],
  structural: ["steel"],
  iron: ["steel"],
  "misc metals": ["steel"],
  ornamental: ["steel"],
  block: ["masonry"],
  brick: ["masonry"],
  stone: ["masonry"],
  terrazzo: ["flooring"],
  carpet: ["flooring"],
  vct: ["flooring"],
  lvt: ["flooring"],
  "wood floor": ["flooring"],
  epoxy: ["flooring"],
  stucco: ["painting"],
  coatings: ["painting"],
  "toilet partitions": ["specialties"],
  lockers: ["specialties"],
  signage: ["specialties"],
  abatement: ["demo"],
  "selective demo": ["demo"],
  hardware: ["doors"],
  "overhead doors": ["doors"],
  "garage doors": ["doors"],
};

export const fuzzyMatchTrade = freeText => {
  if (!freeText) return [];
  const lower = freeText.toLowerCase().trim();
  if (!lower) return [];

  const bundles = getActiveBundles();

  // 1. Direct key match
  const exact = bundles.find(t => t.key.toLowerCase() === lower);
  if (exact) return [exact.key];

  // 2. Label match (case-insensitive)
  const labelMatch = bundles.find(t => t.label.toLowerCase() === lower);
  if (labelMatch) return [labelMatch.key];

  // 3. Alias lookup
  for (const [alias, keys] of Object.entries(FUZZY_ALIASES)) {
    if (lower === alias || lower.includes(alias) || alias.includes(lower)) return keys;
  }

  // 4. Partial label match (contains)
  const partial = bundles.filter(t => t.label.toLowerCase().includes(lower) || lower.includes(t.label.toLowerCase()));
  if (partial.length > 0) return partial.map(t => t.key);

  // 5. No match — return empty (user's free text doesn't map)
  return [];
};
