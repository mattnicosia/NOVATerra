// FRED API Configuration — Federal Reserve Economic Data
// Free API: https://fred.stlouisfed.org/docs/api/api_key.html

export const FRED_API_BASE = 'https://api.stlouisfed.org/fred/series/observations';

export const FRED_SERIES = {
  lumber:               { id: 'WPU101',  label: 'Lumber & Wood Products',    unit: 'Index',     color: 'yellow'  },
  steel:                { id: 'WPU1017', label: 'Steel Mill Products',       unit: 'Index',     color: 'blue'    },
  constructionPPI:      { id: 'PCU23',   label: 'Construction PPI',          unit: 'Index',     color: 'accent'  },
  constructionSpending: { id: 'TTLCONS', label: 'Construction Spending',     unit: '$M',        color: 'green'   },
  housingStarts:        { id: 'HOUST',   label: 'Housing Starts',            unit: 'Thousands', color: 'orange'  },
  buildingPermits:      { id: 'PERMIT',  label: 'Building Permits',          unit: 'Thousands', color: 'purple'  },
};

export const FRED_FETCH_CONFIG = {
  cacheTTL: 4 * 60 * 60 * 1000,  // 4 hours
  lookbackMonths: 60,              // 5 years of data
  retryAttempts: 2,
  retryDelay: 1000,
};

// Material series for the ticker bar
export const MATERIAL_SERIES = [
  { key: 'lumber',          label: 'Lumber',       icon: 'wood' },
  { key: 'steel',           label: 'Steel',        icon: 'metals' },
  { key: 'constructionPPI', label: 'Construction', icon: 'general' },
];

// Industry benchmark $/SF ranges by building type (curated from ENR/public industry data)
// Used for "NOVA vs Industry" comparison in Benchmarks section
export const INDUSTRY_BENCHMARKS = {
  "commercial-office":   { low: 150, mid: 250, high: 450,  label: "Commercial / Office" },
  "retail":              { low: 100, mid: 180, high: 350,  label: "Retail" },
  "industrial":          { low: 80,  mid: 140, high: 250,  label: "Industrial / Warehouse" },
  "healthcare":          { low: 300, mid: 500, high: 900,  label: "Healthcare / Medical" },
  "education":           { low: 200, mid: 350, high: 550,  label: "Education" },
  "hospitality":         { low: 180, mid: 300, high: 550,  label: "Hospitality" },
  "residential-multi":   { low: 120, mid: 220, high: 400,  label: "Multi-Family Residential" },
  "residential-single":  { low: 100, mid: 200, high: 500,  label: "Residential" },
  "mixed-use":           { low: 160, mid: 280, high: 500,  label: "Mixed-Use" },
  "government":          { low: 220, mid: 380, high: 600,  label: "Government / Municipal" },
  "religious":           { low: 120, mid: 220, high: 400,  label: "Religious / House of Worship" },
  "restaurant":          { low: 150, mid: 300, high: 550,  label: "Restaurant / Food Service" },
  "parking":             { low: 50,  mid: 90,  high: 160,  label: "Parking Structure" },
};

// Helper to compute MoM and YoY changes from a data series
export function computeDeltas(observations) {
  if (!observations || observations.length < 2) return { mom: null, yoy: null, current: null };
  const latest = observations[observations.length - 1];
  const prev = observations[observations.length - 2];
  const mom = prev.value > 0 ? Math.round(((latest.value - prev.value) / prev.value) * 1000) / 10 : null;

  // YoY — find observation ~12 months back
  const latestDate = new Date(latest.date);
  const yoyTarget = new Date(latestDate);
  yoyTarget.setFullYear(yoyTarget.getFullYear() - 1);
  const yoyObs = observations.reduce((closest, obs) => {
    const d = Math.abs(new Date(obs.date) - yoyTarget);
    return d < Math.abs(new Date(closest.date) - yoyTarget) ? obs : closest;
  }, observations[0]);
  const yoy = yoyObs.value > 0 ? Math.round(((latest.value - yoyObs.value) / yoyObs.value) * 1000) / 10 : null;

  return { mom, yoy, current: latest.value, currentDate: latest.date };
}
