// envelopeBuilder.js — Generates a 3D building shell from footprint polygon + floor data
// Pure function: no store access, no side effects. Testable in isolation.
//
// Input:
//   footprint: [{x, z}, ...] — building perimeter polygon in feet-space
//   floors: [{ label, height }, ...] — floor definitions from projectStore
//   floorHeights: { [label]: number } — optional per-floor height overrides from modelStore
//
// Output:
//   Array of element descriptors compatible with SceneViewer (same shape as geometryBuilder)

const ENVELOPE_COLOR = "#8B9DAF"; // neutral blue-gray for shell elements
const BELOW_GRADE_COLOR = "#6B7280"; // darker gray for below-grade
const WALL_THICKNESS = 0.5; // 6 inches in feet
const SLAB_THICKNESS = 0.5; // 6 inches in feet

// Regex patterns for below-grade floor detection
const BELOW_GRADE_RE = /\b(basement|below.?grade|sub.?grade|underground|foundation|cellar|lower\s*level|b\d\b)/i;

/**
 * Generate a 3D building envelope from a footprint polygon and floor definitions.
 *
 * @param {Array<{x:number, z:number}>} footprint — Building perimeter polygon in feet
 * @param {Array<{label:string, height:number}>} floors — Floor definitions
 * @param {Object} [floorHeights] — Optional per-floor height overrides { [label]: feet }
 * @returns {Array<Object>} Element descriptors for SceneViewer
 */
export function generateBuildingEnvelope(footprint, floors, floorHeights = {}) {
  if (!footprint || footprint.length < 3) return [];
  if (!floors || floors.length === 0) return [];

  const elements = [];

  // Separate below-grade and above-grade floors
  const belowGrade = [];
  const aboveGrade = [];

  for (const floor of floors) {
    if (BELOW_GRADE_RE.test(floor.label)) {
      belowGrade.push(floor);
    } else {
      aboveGrade.push(floor);
    }
  }

  // ── Below-grade floors (stack downward from elevation 0) ──────
  let belowElev = 0;
  for (let i = 0; i < belowGrade.length; i++) {
    const floor = belowGrade[i];
    const h = floorHeights[floor.label] || floor.height || 10;
    belowElev -= h; // go deeper

    // Floor slab at the bottom of this below-grade level
    elements.push(_makeSlab({
      footprint,
      floorIndex: -(i + 1),
      label: floor.label,
      elevation: belowElev,
      isBelow: true,
      isRoof: false,
    }));

    // Walls for this below-grade level
    _addWalls(elements, {
      footprint,
      floorIndex: -(i + 1),
      label: floor.label,
      elevation: belowElev,
      height: h,
      isBelow: true,
    });
  }

  // ── Above-grade floors (stack upward from elevation 0) ────────
  let aboveElev = 0;
  for (let i = 0; i < aboveGrade.length; i++) {
    const floor = aboveGrade[i];
    const h = floorHeights[floor.label] || floor.height || 12;

    // Floor slab at this level
    elements.push(_makeSlab({
      footprint,
      floorIndex: i,
      label: floor.label,
      elevation: aboveElev,
      isBelow: false,
      isRoof: false,
    }));

    // Walls for this level
    _addWalls(elements, {
      footprint,
      floorIndex: i,
      label: floor.label,
      elevation: aboveElev,
      height: h,
      isBelow: false,
    });

    aboveElev += h;
  }

  // ── Roof slab at the very top ─────────────────────────────────
  elements.push(_makeSlab({
    footprint,
    floorIndex: aboveGrade.length,
    label: "Roof",
    elevation: aboveElev,
    isBelow: false,
    isRoof: true,
  }));

  return elements;
}

// ── Internal helpers ──────────────────────────────────────────────

function _makeSlab({ footprint, floorIndex, label, elevation, isBelow, isRoof }) {
  return {
    id: `envelope-slab-${floorIndex}`,
    type: "slab",
    trade: "envelope",
    division: "",
    description: isRoof ? "Roof Slab" : `${label} — Floor Slab`,
    cost: 0,
    linkedItemId: null,
    color: isBelow ? BELOW_GRADE_COLOR : ENVELOPE_COLOR,
    level: floorIndex,
    isEnvelope: true,
    isBelow,
    isRoof: isRoof || false,
    geometry: {
      kind: "polygon",
      points: footprint,
      thickness: SLAB_THICKNESS,
      elevation,
    },
  };
}

function _addWalls(elements, { footprint, floorIndex, label, elevation, height, isBelow }) {
  for (let j = 0; j < footprint.length; j++) {
    const a = footprint[j];
    const b = footprint[(j + 1) % footprint.length];

    elements.push({
      id: `envelope-wall-${floorIndex}-${j}`,
      type: "wall",
      trade: "envelope",
      division: "",
      description: `${label} — Exterior Wall`,
      cost: 0,
      linkedItemId: null,
      color: isBelow ? BELOW_GRADE_COLOR : ENVELOPE_COLOR,
      level: floorIndex,
      isEnvelope: true,
      isBelow,
      geometry: {
        kind: "extrudedPath",
        path: [a, b],
        height,
        thickness: WALL_THICKNESS,
        elevation,
      },
    });
  }
}
