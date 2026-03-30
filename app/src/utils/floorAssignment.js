// floorAssignment.js — Infer floor/level from drawing sheet numbers and titles
// Maps plan drawings to floor indices + elevations for multi-story shell rendering

/**
 * Infer floor number and label from a drawing's sheet metadata.
 * Follows AIA sheet numbering: A1xx = Floor 1, A2xx = Floor 2, etc.
 * @param {Object} drawing - Drawing object from drawingsStore
 * @returns {{ floor: number, label: string }}
 */
export function inferFloorFromSheet(drawing) {
  const num = (drawing.sheetNumber || "").toUpperCase().trim();
  const title = (drawing.sheetTitle || drawing.label || "").toLowerCase().trim();

  // Check title keywords first (most explicit)
  if (/basement|lower\s*level|below\s*grade/i.test(title)) return { floor: -1, label: "Basement" };
  if (/\broof\b|rooftop|penthouse/i.test(title)) return { floor: 99, label: "Roof" };
  if (/\bground\b|ground\s*floor/i.test(title)) return { floor: 1, label: "Ground Floor" };

  // Ordinal/cardinal floor names
  const floorNames = {
    first: 1,
    "1st": 1,
    second: 2,
    "2nd": 2,
    third: 3,
    "3rd": 3,
    fourth: 4,
    "4th": 4,
    fifth: 5,
    "5th": 5,
    sixth: 6,
    "6th": 6,
    seventh: 7,
    "7th": 7,
    eighth: 8,
    "8th": 8,
    ninth: 9,
    "9th": 9,
    tenth: 10,
    "10th": 10,
  };

  for (const [name, floor] of Object.entries(floorNames)) {
    if (title.includes(name)) return { floor, label: `Floor ${floor}` };
  }

  // Floor number from title (e.g., "Floor Plan - Level 3")
  const levelMatch = title.match(/(?:level|floor|story|storey)\s*(\d+)/i);
  if (levelMatch) {
    const f = parseInt(levelMatch[1]);
    return { floor: f, label: `Floor ${f}` };
  }

  // NOTE: AIA sheet numbering (A-1xx, A-2xx) indicates drawing SERIES, not building floor.
  // A-1xx = Plans, A-2xx = Elevations, A-3xx = Sections, A-4xx = Details.
  // Do NOT infer floor from sheet number — only use title keywords (handled above).

  // Basement from sheet number (rare but valid)
  if (num.startsWith("AB") || num.startsWith("B")) return { floor: -1, label: "Basement" };

  // Default to Floor 1
  return { floor: 1, label: "Floor 1" };
}

/**
 * Standard floor definitions for the floor picker UI.
 * Covers below-grade through 10 stories plus roof.
 */
export const FLOOR_OPTIONS = [
  { floor: -3, label: "Sub-Basement 2" },
  { floor: -2, label: "Sub-Basement" },
  { floor: -1, label: "Basement" },
  { floor: 0, label: "Grade" },
  { floor: 1, label: "Floor 1" },
  { floor: 2, label: "Floor 2" },
  { floor: 3, label: "Floor 3" },
  { floor: 4, label: "Floor 4" },
  { floor: 5, label: "Floor 5" },
  { floor: 6, label: "Floor 6" },
  { floor: 7, label: "Floor 7" },
  { floor: 8, label: "Floor 8" },
  { floor: 9, label: "Floor 9" },
  { floor: 10, label: "Floor 10" },
  { floor: 99, label: "Roof" },
];

/**
 * Build a floor map from all drawings.
 * Groups drawings by floor and assigns elevations using per-floor heights.
 * Elevations are stacked: Floor 1 starts at 0, Floor 2 = Floor1Height, etc.
 * @param {Array} drawings - Drawings from drawingsStore
 * @param {number} defaultHeight - Default floor height in feet (fallback)
 * @param {Object} floorHeights - Per-floor height overrides: { [label]: number }
 * @param {Object} floorOverrides - Per-drawing floor overrides: { [drawingId]: { floor, label } }
 * @returns {Object} Map of drawingId → { floor, elevation, label, height }
 */
export function buildFloorMap(drawings, defaultHeight = 12, floorHeights = {}, floorOverrides = {}) {
  // First pass: infer floor + label for each drawing (user overrides take priority)
  const entries = drawings.map(d => {
    const override = floorOverrides[d.id];
    if (override) return { id: d.id, floor: override.floor, label: override.label };
    return { id: d.id, ...inferFloorFromSheet(d) };
  });

  // Collect unique floors sorted by floor number
  const uniqueFloors = [...new Map(entries.map(e => [e.label, e])).values()].sort((a, b) => a.floor - b.floor);

  // Get height for a floor label
  const getHeight = label => {
    if (floorHeights[label] && floorHeights[label] >= 1) return floorHeights[label];
    return defaultHeight;
  };

  // Compute stacked elevations bottom-up
  // Basement floors go below 0, above-grade floors stack upward from 0
  const elevations = {};
  let currentElev = 0;

  // Above-grade floors (floor >= 0, not roof) — includes Grade (0) and above
  const aboveGrade = uniqueFloors.filter(f => f.floor >= 0 && f.floor < 99);
  aboveGrade.forEach((f, _i) => {
    elevations[f.label] = currentElev;
    currentElev += getHeight(f.label);
  });

  // Below-grade floors (floor < 0)
  const belowGrade = uniqueFloors.filter(f => f.floor < 0).sort((a, b) => b.floor - a.floor);
  let belowElev = 0;
  belowGrade.forEach(f => {
    belowElev -= getHeight(f.label);
    elevations[f.label] = belowElev;
  });

  // Roof — sits on top of highest above-grade floor
  const roofFloors = uniqueFloors.filter(f => f.floor === 99);
  roofFloors.forEach(f => {
    elevations[f.label] = currentElev;
  });

  // Build the final map
  const floorMap = {};
  entries.forEach(e => {
    floorMap[e.id] = {
      floor: e.floor,
      elevation: elevations[e.label] ?? 0,
      label: e.label,
      height: getHeight(e.label),
    };
  });

  return floorMap;
}
