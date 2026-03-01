// Construction Cost Index — Historical cost data for escalation & normalization
// Based on BLS Producer Price Index for construction inputs + ENR Building Cost Index
// Used by: Cost History analytics, ROM calibration, database escalation
//
// Base year = 2020 (index 100). All values relative to 2020 baseline.
// Sources: BLS PPI, ENR BCI, industry consensus for projections.

// ─── Composite Index (all construction) ─────────────────────────────
// Weighted blend across all divisions — use when division-specific data isn't needed
export const COMPOSITE_INDEX = {
  2015: 87.2,
  2016: 86.8,
  2017: 89.5,
  2018: 93.8,
  2019: 94.6,
  2020: 100.0,  // base year
  2021: 114.2,  // post-COVID spike — lumber, steel, supply chain
  2022: 124.8,
  2023: 127.5,
  2024: 130.2,
  2025: 133.8,
  2026: 137.0,  // projected
};

// ─── Division-Level Indices ─────────────────────────────────────────
// More granular — different materials escalate at different rates
// Keys map to CSI division groups
export const DIVISION_INDICES = {
  // Concrete & Masonry (Div 03, 04)
  "concrete": {
    2015: 90.1, 2016: 90.5, 2017: 92.0, 2018: 95.2, 2019: 96.8,
    2020: 100.0, 2021: 108.5, 2022: 118.2, 2023: 122.4, 2024: 125.0,
    2025: 127.8, 2026: 130.5,
  },
  // Structural Steel & Metals (Div 05)
  "metals": {
    2015: 82.5, 2016: 79.8, 2017: 85.2, 2018: 94.5, 2019: 90.2,
    2020: 100.0, 2021: 132.5, 2022: 140.8, 2023: 135.2, 2024: 132.0,
    2025: 134.5, 2026: 137.0,
  },
  // Wood, Plastics & Composites (Div 06)
  "wood": {
    2015: 88.0, 2016: 89.5, 2017: 92.8, 2018: 98.5, 2019: 95.0,
    2020: 100.0, 2021: 145.0, 2022: 128.5, 2023: 118.0, 2024: 120.5,
    2025: 123.0, 2026: 125.5,
  },
  // Thermal & Moisture, Roofing (Div 07)
  "thermal": {
    2015: 88.5, 2016: 89.0, 2017: 91.5, 2018: 95.0, 2019: 96.2,
    2020: 100.0, 2021: 112.0, 2022: 122.5, 2023: 126.0, 2024: 128.5,
    2025: 131.2, 2026: 134.0,
  },
  // Openings — Doors, Windows, Glazing (Div 08)
  "openings": {
    2015: 89.0, 2016: 89.5, 2017: 91.0, 2018: 94.2, 2019: 95.8,
    2020: 100.0, 2021: 110.5, 2022: 120.0, 2023: 124.5, 2024: 127.0,
    2025: 129.8, 2026: 132.5,
  },
  // Finishes (Div 09)
  "finishes": {
    2015: 87.5, 2016: 88.0, 2017: 90.0, 2018: 93.5, 2019: 95.0,
    2020: 100.0, 2021: 112.8, 2022: 122.0, 2023: 126.5, 2024: 129.2,
    2025: 132.0, 2026: 135.0,
  },
  // Mechanical — Plumbing, HVAC, Fire Suppression (Div 21, 22, 23)
  "mechanical": {
    2015: 88.2, 2016: 88.8, 2017: 90.5, 2018: 94.0, 2019: 96.5,
    2020: 100.0, 2021: 110.0, 2022: 120.5, 2023: 126.8, 2024: 130.5,
    2025: 134.0, 2026: 137.5,
  },
  // Electrical & Communications (Div 26, 27, 28)
  "electrical": {
    2015: 85.0, 2016: 84.5, 2017: 87.0, 2018: 92.0, 2019: 94.5,
    2020: 100.0, 2021: 118.5, 2022: 130.2, 2023: 132.0, 2024: 133.5,
    2025: 135.8, 2026: 138.0,
  },
  // Sitework & Earthwork (Div 31, 32, 33)
  "sitework": {
    2015: 89.0, 2016: 89.5, 2017: 91.0, 2018: 94.5, 2019: 96.0,
    2020: 100.0, 2021: 108.0, 2022: 116.5, 2023: 120.0, 2024: 123.0,
    2025: 126.0, 2026: 129.0,
  },
  // General Conditions & Labor (Div 01) — heavily labor-driven
  "general": {
    2015: 86.0, 2016: 87.5, 2017: 89.0, 2018: 92.5, 2019: 95.5,
    2020: 100.0, 2021: 105.5, 2022: 112.0, 2023: 118.5, 2024: 123.0,
    2025: 127.5, 2026: 132.0,
  },
};

// ─── Division → Index Category Mapping ──────────────────────────────
// Maps CSI 2-digit division codes to the appropriate index category
export const DIVISION_TO_INDEX = {
  "01": "general",
  "02": "general",     // demo — labor-heavy
  "03": "concrete",
  "04": "concrete",    // masonry tracks with concrete
  "05": "metals",
  "06": "wood",
  "07": "thermal",
  "08": "openings",
  "09": "finishes",
  "10": "finishes",    // specialties — similar to finishes
  "11": "mechanical",  // equipment
  "14": "electrical",  // conveying — more electrical than mechanical
  "21": "mechanical",
  "22": "mechanical",
  "23": "mechanical",
  "26": "electrical",
  "27": "electrical",
  "28": "electrical",
  "31": "sitework",
  "32": "sitework",
  "33": "sitework",
};

// ─── Helpers ────────────────────────────────────────────────────────

/** Get the current year's index value (or latest available) */
export const getCurrentYear = () => new Date().getFullYear();

/** Get composite index for a year (interpolates between years if needed) */
export function getCompositeIndex(year) {
  const y = Math.round(year);
  if (COMPOSITE_INDEX[y] !== undefined) return COMPOSITE_INDEX[y];
  // Extrapolate at ~3% per year beyond known data
  const years = Object.keys(COMPOSITE_INDEX).map(Number).sort((a, b) => a - b);
  const maxYear = years[years.length - 1];
  const minYear = years[0];
  if (y > maxYear) return COMPOSITE_INDEX[maxYear] * Math.pow(1.03, y - maxYear);
  if (y < minYear) return COMPOSITE_INDEX[minYear] / Math.pow(1.03, minYear - y);
  // Interpolate
  const lower = years.filter(yr => yr <= y).pop();
  const upper = years.filter(yr => yr >= y).shift();
  if (lower === upper) return COMPOSITE_INDEX[lower];
  const ratio = (y - lower) / (upper - lower);
  return COMPOSITE_INDEX[lower] + ratio * (COMPOSITE_INDEX[upper] - COMPOSITE_INDEX[lower]);
}

/** Get division-specific index for a year */
export function getDivisionIndex(divCode, year) {
  const category = DIVISION_TO_INDEX[divCode];
  if (!category) return getCompositeIndex(year);
  const idx = DIVISION_INDICES[category];
  if (!idx) return getCompositeIndex(year);
  const y = Math.round(year);
  if (idx[y] !== undefined) return idx[y];
  // Extrapolate at ~3%
  const years = Object.keys(idx).map(Number).sort((a, b) => a - b);
  const maxYear = years[years.length - 1];
  const minYear = years[0];
  if (y > maxYear) return idx[maxYear] * Math.pow(1.03, y - maxYear);
  if (y < minYear) return idx[minYear] / Math.pow(1.03, minYear - y);
  const lower = years.filter(yr => yr <= y).pop();
  const upper = years.filter(yr => yr >= y).shift();
  if (lower === upper) return idx[lower];
  const ratio = (y - lower) / (upper - lower);
  return idx[lower] + ratio * (idx[upper] - idx[lower]);
}

/** Get all available years for trend display */
export function getAvailableYears() {
  return Object.keys(COMPOSITE_INDEX).map(Number).sort((a, b) => a - b);
}

/** Get year-over-year change for composite index */
export function getYoYChange(year) {
  const curr = getCompositeIndex(year);
  const prev = getCompositeIndex(year - 1);
  return prev > 0 ? ((curr - prev) / prev) * 100 : 0;
}

/** Get all division indices for a given year (for breakdown display) */
export function getAllDivisionIndices(year) {
  return Object.entries(DIVISION_INDICES).map(([category, data]) => {
    const y = Math.round(year);
    const current = data[y] || getCompositeIndex(y);
    const prevYear = data[y - 1] || getCompositeIndex(y - 1);
    const yoy = prevYear > 0 ? ((current - prevYear) / prevYear) * 100 : 0;
    return { category, index: current, yoy };
  });
}
