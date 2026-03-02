// ══════════════════════════════════════════════════════════════════════
// Predictive Takeoff Engine — auto-detects matching elements on drawings
// Uses PDF text extraction + vector geometry for tag-based predictions
// ══════════════════════════════════════════════════════════════════════

import {
  extractPageData,
  findNearestTag,
  findAdjacentText,
  findPlanTagInstances,
  isExtracted,
  isLikelyTag,
  detectScheduleRegions,
  isInScheduleRegion,
  getScheduleRegions,
} from './pdfExtractor';

import {
  analyzeDrawingGeometry,
  generateAutoMeasurements,
} from './geometryEngine';

// ══════════════════════════════════════════════════════════════════════
// PREDICTION LEARNING RECORD — accumulates accept/reject feedback
// Persists during the app session, modulates confidence for future predictions
// ══════════════════════════════════════════════════════════════════════
const _learningRecord = new Map(); // key: `${tag}::${strategy}` → { accepts, rejects, lastUsed }

/**
 * Record a user accept/reject for a prediction tag + strategy
 * Called from TakeoffsPage when user accepts or rejects predictions
 */
export function recordPredictionFeedback(tag, strategy, accepted) {
  if (!tag) return;
  const key = `${tag.toUpperCase()}::${strategy || "tag-based"}`;
  const entry = _learningRecord.get(key) || { accepts: 0, rejects: 0, lastUsed: 0 };
  if (accepted) entry.accepts++; else entry.rejects++;
  entry.lastUsed = Date.now();
  _learningRecord.set(key, entry);

  // LRU eviction: cap at 50 entries
  if (_learningRecord.size > 50) {
    let oldest = null, oldestKey = null;
    _learningRecord.forEach((v, k) => { if (!oldest || v.lastUsed < oldest) { oldest = v.lastUsed; oldestKey = k; } });
    if (oldestKey) _learningRecord.delete(oldestKey);
  }
}

/**
 * Get a confidence multiplier based on historical accept/reject ratio for a tag
 * Returns 0.7–1.2 multiplier (penalizes low-accept tags, boosts high-accept tags)
 */
export function getLearningMultiplier(tag, strategy) {
  if (!tag) return 1.0;
  const key = `${tag.toUpperCase()}::${strategy || "tag-based"}`;
  const entry = _learningRecord.get(key);
  if (!entry || (entry.accepts + entry.rejects) < 2) return 1.0; // Not enough data
  const total = entry.accepts + entry.rejects;
  const ratio = entry.accepts / total;
  // Map ratio: 0% → 0.7x, 50% → 1.0x, 100% → 1.2x
  return 0.7 + ratio * 0.5;
}

// ══════════════════════════════════════════════════════════════════════
// WARM PREDICTION CACHE — pre-compute tag analysis before user clicks
// ══════════════════════════════════════════════════════════════════════
const _warmCache = new Map(); // key: `${drawingId}::${description}` → { strategy, data, scheduleRegions, tagScores, allTags, timestamp }

function _warmCacheEvict() {
  if (_warmCache.size <= 5) return;
  let oldest = null, oldestKey = null;
  _warmCache.forEach((v, k) => { if (!oldest || v.timestamp < oldest) { oldest = v.timestamp; oldestKey = k; } });
  if (oldestKey) _warmCache.delete(oldestKey);
}

/**
 * Pre-compute tag analysis for a drawing + description combination.
 * Call this when engaging measurement mode so data is warm before user clicks.
 */
export async function warmPredictions(drawing, description) {
  const key = `${drawing.id}::${description || ""}`;
  if (_warmCache.has(key)) return; // already warm

  try {
    const data = await extractPageData(drawing);
    const strategy = classifyTakeoffStrategy(description);

    // For surface strategies, no tag work needed — just cache the strategy
    if (strategy === "exterior-surface" || strategy === "interior-surface") {
      // Also pre-warm geometry in background
      analyzeDrawingGeometry(drawing).catch(() => {});
      _warmCache.set(key, { strategy, data, timestamp: Date.now() });
      _warmCacheEvict();
      return;
    }

    // For tag-based/structural: pre-score all tags against the description
    // Use combined schedule regions (detected + external from scan system)
    const scheduleRegions = getScheduleRegions(drawing.id) || data.scheduleRegions || detectScheduleRegions(data);
    const headerPositions = findScheduleHeaderPositions(data.text);
    const tagScores = new Map(); // tagText → relevance score
    const allTags = [];

    for (const item of data.text) {
      if (!isLikelyTag(item.text)) continue;
      if (isInScheduleRegion(item.x, item.y, scheduleRegions)) continue;
      // Suppress tags near schedule header keywords
      if (headerPositions.length > 0 && isNearScheduleHeader(item, headerPositions)) continue;
      const score = description ? scoreTagRelevance(item.text, description) : 0;
      tagScores.set(item.text, Math.max(tagScores.get(item.text) || 0, score));
      allTags.push(item);
    }

    _warmCache.set(key, { strategy, data, scheduleRegions, tagScores, allTags, timestamp: Date.now() });
    _warmCacheEvict();
  } catch (err) {
    console.warn("[NOVA Warm] Failed:", err.message);
  }
}

/**
 * Retrieve warm cache data for a drawing + description.
 * Returns null if not warmed yet.
 */
export function getWarmData(drawingId, description) {
  return _warmCache.get(`${drawingId}::${description || ""}`) || null;
}

// ══════════════════════════════════════════════════════════════════════
// SCHEDULE HEADER KEYWORD SUPPRESSION
// Tags that appear near schedule column headers are schedule entries,
// not plan-area tags. This catches schedules missed by region detection.
// ══════════════════════════════════════════════════════════════════════
const SCHEDULE_HEADER_WORDS = new Set([
  'SCHEDULE', 'LEGEND', 'KEY', 'NOTES', 'SPECIFICATIONS', 'SPEC',
  'ABBREVIATIONS', 'MARK', 'TYPE', 'SIZE', 'DESCRIPTION', 'MANUFACTURER',
  'MODEL', 'QUANTITY', 'QTY', 'REMARKS', 'HEIGHT', 'WIDTH', 'THICKNESS',
  'RATING', 'FINISH', 'MATERIAL', 'CATALOG', 'CAT#', 'SERIES',
  'HARDWARE', 'GLASS', 'FRAME', 'DETAIL', 'NOTE', 'COLOR', 'GAUGE',
  'HEAD', 'JAMB', 'SILL', 'LOUVER', 'CFM', 'BTU', 'VOLTS', 'AMPS',
  'WATTS', 'HP', 'RPM', 'GPM', 'MOUNTING', 'LOCATION', 'DOOR',
  'WINDOW', 'FIXTURE', 'EQUIPMENT', 'SYMBOL',
]);

/**
 * Pre-compute positions of schedule header keywords on a page.
 * Returns an array of {x, y} positions for known schedule headers.
 */
function findScheduleHeaderPositions(textItems) {
  const positions = [];
  for (const item of textItems) {
    const word = item.text.trim().toUpperCase();
    if (SCHEDULE_HEADER_WORDS.has(word)) {
      positions.push({ x: item.x, y: item.y });
    }
  }
  return positions;
}

/**
 * Check if a text item is near a schedule header keyword.
 * Tags within ~100px vertically of schedule headers are likely schedule entries.
 */
function isNearScheduleHeader(item, headerPositions, radius = 100) {
  for (const hp of headerPositions) {
    // Check horizontal overlap (same column region) AND vertical proximity
    const dx = Math.abs(item.x - hp.x);
    const dy = Math.abs(item.y - hp.y);
    // Schedule entries are typically below headers in the same column (within 300px horizontal, 200px vertical)
    if (dx < 300 && dy < 200 && dy > 0) return true;
  }
  return false;
}

// ══════════════════════════════════════════════════════════════════════
// DESCRIPTION-AWARE FILTERING
// Scores how well a tag matches a takeoff description, detects differentiators
// ══════════════════════════════════════════════════════════════════════

// Common construction abbreviation map (prefix → expanded words)
const ABBREV_MAP = {
  D: ["duplex", "door"],
  S: ["single", "slab"],
  T: ["triplex", "tee"],
  W: ["window", "wall"],
  IW: ["interior wall"],
  EW: ["exterior wall"],
  BR: ["bedroom"],
  BA: ["bathroom", "bath"],
  KIT: ["kitchen"],
  LR: ["living room"],
  COL: ["column"],
  FTG: ["footing"],
  BM: ["beam"],
  HDR: ["header"],
  STR: ["stair"],
  CLG: ["ceiling"],
  FLR: ["floor"],
  RF: ["roof"],
  DK: ["deck"],
  GAR: ["garage"],
  PTN: ["partition"],
  CMU: ["cmu", "block"],
  CLR: ["clear"],
  RM: ["room"],
  CL: ["closet"],
  HW: ["hallway"],
  ENT: ["entry"],
  PR: ["porch"],
  UT: ["utility"],
};

// ══════════════════════════════════════════════════════════════════════
// TAKEOFF STRATEGY CLASSIFICATION
// Categorizes takeoff descriptions into prediction strategies so the engine
// doesn't show irrelevant results (e.g., window tags for siding takeoffs)
// ══════════════════════════════════════════════════════════════════════

// Exterior surface items — measured by area/linear along building exterior.
// These have no plan tags; they relate to exterior walls, not rooms or openings.
const EXTERIOR_SURFACE_TERMS = [
  "siding", "cladding", "sheathing", "stucco", "eifs", "dryvit", "hardie",
  "lap", "board and batten", "vinyl", "fiber cement", "metal panel",
  "rain screen", "rainscreen", "facade", "veneer", "brick veneer",
  "stone veneer", "waterproofing", "weather barrier", "house wrap",
  "tyvek", "vapor barrier", "air barrier", "flashing", "soffit", "fascia",
  "trim", "exterior trim", "cornice", "exterior finish", "exterior paint",
  "exterior coating", "exterior insulation",
];

// Interior surface items — measured by area on interior walls/ceilings
const INTERIOR_SURFACE_TERMS = [
  "drywall", "gypsum", "gyp", "plaster", "paint", "primer", "texture",
  "wallpaper", "wainscot", "paneling", "tile", "backsplash", "acoustic",
  "ceiling tile", "ceiling grid", "suspended ceiling", "drop ceiling",
  "interior finish", "interior paint", "interior coating",
  "flooring", "hardwood", "carpet", "lvp", "vinyl plank", "vinyl tile",
  "lvt", "laminate", "epoxy floor", "epoxy coating", "polished concrete",
  "terrazzo", "rubber flooring", "sheet vinyl", "vct", "porcelain tile",
  "ceramic tile", "wood floor", "bamboo", "cork floor", "linoleum",
];

// Structural items that relate to geometry (walls, floors)
const STRUCTURAL_GEOMETRY_TERMS = [
  "wall", "partition", "framing", "stud", "plate", "header", "joist",
  "rafter", "truss", "beam", "column", "footing", "foundation",
  "slab", "floor", "roof", "deck", "shear wall", "bracing",
  "blocking", "furring", "insulation", "batt",
];

/**
 * Classify a takeoff description into a prediction strategy.
 * Returns: "exterior-surface" | "interior-surface" | "structural" | "tag-based" | "general"
 */
export function classifyTakeoffStrategy(description) {
  if (!description) return "general";
  const desc = description.toLowerCase();

  if (EXTERIOR_SURFACE_TERMS.some(t => desc.includes(t))) return "exterior-surface";
  if (INTERIOR_SURFACE_TERMS.some(t => desc.includes(t))) return "interior-surface";
  if (STRUCTURAL_GEOMETRY_TERMS.some(t => desc.includes(t))) return "structural";

  return "tag-based"; // default: try to find plan tags
}

/**
 * Score 0.0–1.0 how well a tag matches a takeoff description
 * 1.0  = tag text literally found in description
 * 0.85 = tag prefix expands to a word in description via ABBREV_MAP
 * 0.6  = tag prefix matches start of a description word
 * 0.0  = no relationship
 */
export function scoreTagRelevance(tagText, description) {
  if (!tagText || !description) return 0;
  const tag = tagText.trim().toUpperCase();
  const desc = description.toUpperCase();
  const descWords = desc.split(/[\s,\-\/]+/).filter(Boolean);

  // Exact: tag text literally appears in description (or vice versa)
  if (desc.includes(tag)) return 1.0;
  if (tag.length >= 3 && descWords.some(w => w.includes(tag))) return 1.0;
  // Reverse: description word appears in tag (e.g., tag="DUPLEX A", desc="Duplexes")
  for (const w of descWords) {
    if (w.length >= 3 && tag.includes(w)) return 0.95;
    // Stem match: "DUPLEXES" → "DUPLEX" matches tag "DUPLEX"
    const stem = w.replace(/(E?S|ING|ED)$/, "");
    if (stem.length >= 3 && (tag.includes(stem) || stem.includes(tag))) return 0.9;
  }

  // Abbreviation: tag prefix (letters only) expands to a description word
  const tagLetters = tag.replace(/[^A-Z]/g, "");
  if (tagLetters && ABBREV_MAP[tagLetters]) {
    const expansions = ABBREV_MAP[tagLetters];
    for (const exp of expansions) {
      if (desc.toLowerCase().includes(exp)) return 0.85;
    }
  }

  // Reverse abbreviation: description words (as abbreviations) expand to match tag text
  // Example: description="W" → ABBREV_MAP["W"] = ["window"] → tag "WINDOW" matches
  for (const word of descWords) {
    const wordLetters = word.replace(/[^A-Z]/g, "");
    if (wordLetters && ABBREV_MAP[wordLetters]) {
      for (const exp of ABBREV_MAP[wordLetters]) {
        if (tag.toLowerCase().includes(exp)) return 0.8;
      }
    }
  }

  // Prefix match: tag letters match start of any description word
  // Require at least 2-letter prefix to avoid false positives (e.g., "S" matching "Siding")
  if (tagLetters.length >= 2) {
    for (const word of descWords) {
      if (word.startsWith(tagLetters) && word.length > tagLetters.length) return 0.6;
    }
  }

  // Reverse prefix: description word is a prefix of tag (e.g., desc="WIN" matches tag "WINDOW")
  for (const word of descWords) {
    if (word.length >= 2 && tag.startsWith(word) && tag.length > word.length) return 0.6;
  }

  return 0;
}

/**
 * Detect differentiator symbols near a tag position that modulate confidence.
 * Looks for 1-3 char adjacent text (e.g., "D" near "2BR" = Duplex confirmation).
 * Returns { text, matches, confidenceModifier }
 */
export function detectDifferentiator(extractedData, tagX, tagY, description) {
  if (!description) return null;
  const adjacent = findAdjacentText(extractedData, tagX, tagY, 80);
  if (adjacent.length === 0) return null;

  const desc = description.toUpperCase();
  const descWords = desc.split(/[\s,\-\/]+/).filter(Boolean);

  // Known differentiator patterns
  const diffPatterns = [
    /^[DSTMQ]$/i,                 // Single-letter type codes: D=Duplex, S=Single, T=Triplex
    /^[0-9]BR$/i,                 // Bedroom counts: 1BR, 2BR, 3BR
    /^[A-Z]$/i,                   // Single letter type codes
    /^[A-Z][0-9]$/i,              // Type + number: A1, B2
  ];

  for (const adj of adjacent) {
    const t = adj.text.toUpperCase();
    const isDiff = diffPatterns.some(p => p.test(t));
    if (!isDiff) continue;

    // Check if this differentiator confirms the takeoff description
    const letterPart = t.replace(/[^A-Z]/g, "");
    let matches = false;

    // Check abbreviation map
    if (ABBREV_MAP[letterPart]) {
      matches = ABBREV_MAP[letterPart].some(exp => desc.toLowerCase().includes(exp));
    }
    // Check direct inclusion in description
    if (!matches) {
      matches = descWords.some(w => w.startsWith(letterPart) || w.includes(t));
    }

    return {
      text: adj.text,
      matches,
      confidenceModifier: matches ? 1.15 : 0.4,
    };
  }

  return null;
}

/**
 * Find the nearest tag that is relevant to the takeoff description.
 * Checks nearest first — if relevance ≥ 0.3, uses it.
 * Otherwise searches wider for the most relevant tag.
 * Falls through to null if nothing relevant found.
 */
export function findNearestRelevantTag(data, x, y, description) {
  if (!data?.text) return null;

  // Try nearest tag first — require 0.5 relevance to reduce false positives
  const nearest = findNearestTag(data, x, y, 150);
  if (nearest) {
    const relevance = scoreTagRelevance(nearest.text, description);
    if (relevance >= 0.5) {
      return { ...nearest, relevance };
    }
  }

  // Search wider radius for any relevant tag (must pass isLikelyTag to avoid noise)
  let bestTag = null;
  let bestScore = 0;

  for (const item of data.text) {
    if (!isLikelyTag(item.text)) continue;
    const dx = item.x - x;
    const dy = item.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 300) continue; // wider search radius

    const relevance = scoreTagRelevance(item.text, description);
    // Weight by relevance, penalize distance
    const score = relevance * (1 - dist / 400);
    if (score > bestScore && relevance >= 0.5) {
      bestScore = score;
      bestTag = { ...item, distance: dist, relevance };
    }
  }

  if (bestTag) return bestTag;

  // Constrained fallback: search text within 500px of click point (NOT whole page)
  // for description-relevant matches. Filter out schedule/legend regions.
  const scheduleRegions = data.scheduleRegions || detectScheduleRegions(data);
  const headerPositions = findScheduleHeaderPositions(data.text);
  const fallbackRadius = 500;
  let pagebestTag = null;
  let pagebestScore = 0;

  for (const item of data.text) {
    const t = item.text.trim();
    if (!t || t.length > 20) continue; // skip empty or very long text
    const dx = item.x - x;
    const dy = item.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > fallbackRadius) continue; // constrain to nearby area
    if (isInScheduleRegion(item.x, item.y, scheduleRegions)) continue;
    if (headerPositions.length > 0 && isNearScheduleHeader(item, headerPositions)) continue;
    const relevance = scoreTagRelevance(t, description);
    if (relevance < 0.5) continue;
    // Weight by relevance AND distance (closer = better)
    const score = relevance * (1 - dist / (fallbackRadius * 1.2));
    if (score > pagebestScore) {
      pagebestScore = score;
      pagebestTag = { ...item, text: t, distance: dist, relevance };
    }
  }

  return pagebestTag;
}

// ══════════════════════════════════════════════════════════════════════
// WALL GEOMETRY ASSOCIATION
// Given a tag position, find nearby wall line segments and trace the wall
// ══════════════════════════════════════════════════════════════════════

// Find line segments near a point, sorted by distance
function findNearbyLines(lines, x, y, radius = 120) {
  return lines
    .map(line => {
      // Distance from point to line segment
      const dx = line.x2 - line.x1;
      const dy = line.y2 - line.y1;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1) return null;
      const t = Math.max(0, Math.min(1, ((x - line.x1) * dx + (y - line.y1) * dy) / len2));
      const projX = line.x1 + t * dx;
      const projY = line.y1 + t * dy;
      const dist = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);
      return { ...line, distance: dist, projX, projY };
    })
    .filter(l => l && l.distance < radius)
    .sort((a, b) => a.distance - b.distance);
}

// Detect parallel line pairs (wall boundaries) near a tag
// Walls in CAD drawings are typically 2 parallel lines at consistent spacing
function detectWallSegment(lines, tagX, tagY, searchRadius = 150) {
  const nearby = findNearbyLines(lines, tagX, tagY, searchRadius);
  if (nearby.length < 2) return null;

  // Filter to substantial line segments (> 30px = likely wall edges, not hatching)
  const substantial = nearby.filter(l => l.length > 30);
  if (substantial.length < 1) return null;

  // Find the line closest to the tag — this is likely one edge of the wall
  const primaryLine = substantial[0];

  // Look for a parallel line (within 5° angle tolerance, within wall-width distance)
  const primaryAngle = Math.atan2(primaryLine.y2 - primaryLine.y1, primaryLine.x2 - primaryLine.x1);
  const maxWallWidth = 50; // px — ~8" at typical drawing scale
  const angleTolerance = 5 * (Math.PI / 180); // 5 degrees

  let bestParallel = null;
  let bestDist = maxWallWidth;

  for (const line of substantial.slice(1)) {
    const angle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1);
    const angleDiff = Math.abs(angle - primaryAngle);
    const isParallel = angleDiff < angleTolerance || Math.abs(angleDiff - Math.PI) < angleTolerance;

    if (isParallel) {
      // Distance between parallel lines (perpendicular distance)
      const mid1X = (line.x1 + line.x2) / 2;
      const mid1Y = (line.y1 + line.y2) / 2;
      const perpDist = findNearbyLines([primaryLine], mid1X, mid1Y, maxWallWidth);
      if (perpDist.length > 0 && perpDist[0].distance < bestDist && perpDist[0].distance > 3) {
        bestDist = perpDist[0].distance;
        bestParallel = line;
      }
    }
  }

  // Build wall centerline from primary line (or parallel pair midpoint)
  if (bestParallel) {
    // Centerline between the two parallel lines
    return {
      type: "wall",
      points: [
        { x: (primaryLine.x1 + bestParallel.x1) / 2, y: (primaryLine.y1 + bestParallel.y1) / 2 },
        { x: (primaryLine.x2 + bestParallel.x2) / 2, y: (primaryLine.y2 + bestParallel.y2) / 2 },
      ],
      wallWidth: bestDist,
      confidence: 0.88,
      sourceLines: [primaryLine, bestParallel],
    };
  }

  // Fallback: use the primary line as the wall centerline
  return {
    type: "wall",
    points: [
      { x: primaryLine.x1, y: primaryLine.y1 },
      { x: primaryLine.x2, y: primaryLine.y2 },
    ],
    wallWidth: null,
    confidence: 0.65,
    sourceLines: [primaryLine],
  };
}

// ══════════════════════════════════════════════════════════════════════
// CONNECTED WALL TRACING
// From a starting wall segment, trace connected wall segments that share endpoints
// ══════════════════════════════════════════════════════════════════════
function traceConnectedWalls(lines, startSegment, maxGap = 15) {
  const segments = [startSegment];
  const used = new Set();
  used.add(`${startSegment.points[0].x},${startSegment.points[0].y},${startSegment.points[1].x},${startSegment.points[1].y}`);

  let changed = true;
  while (changed) {
    changed = false;
    const lastSeg = segments[segments.length - 1];
    const firstSeg = segments[0];

    // Try to extend from the end
    const endPt = lastSeg.points[lastSeg.points.length - 1];
    const nearEnd = findNearbyLines(lines, endPt.x, endPt.y, maxGap);
    for (const line of nearEnd) {
      const key = `${line.x1},${line.y1},${line.x2},${line.y2}`;
      if (used.has(key)) continue;
      if (line.length < 20) continue;

      // Check if this line connects to our endpoint
      const d1 = Math.sqrt((line.x1 - endPt.x) ** 2 + (line.y1 - endPt.y) ** 2);
      const d2 = Math.sqrt((line.x2 - endPt.x) ** 2 + (line.y2 - endPt.y) ** 2);

      if (d1 < maxGap) {
        segments.push({
          type: "wall",
          points: [{ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }],
          confidence: 0.75,
          sourceLines: [line],
        });
        used.add(key);
        changed = true;
        break;
      } else if (d2 < maxGap) {
        segments.push({
          type: "wall",
          points: [{ x: line.x2, y: line.y2 }, { x: line.x1, y: line.y1 }],
          confidence: 0.75,
          sourceLines: [line],
        });
        used.add(key);
        changed = true;
        break;
      }
    }
  }

  // Merge all segment points into one polyline
  const allPoints = [segments[0].points[0]];
  for (const seg of segments) {
    allPoints.push(seg.points[seg.points.length - 1]);
  }

  return allPoints;
}

// ══════════════════════════════════════════════════════════════════════
// PREDICTION GENERATORS
// ══════════════════════════════════════════════════════════════════════

let _predictionId = 0;
function nextPredId() { return `pred-${++_predictionId}-${Date.now().toString(36)}`; }

/**
 * Generate count predictions (fixtures, devices, footings, etc.)
 * Each tag instance = one count marker at the tag position
 * @param {string} takeoffDescription - Description of the active takeoff for differentiator detection
 */
export function predictCounts(extractedData, tag, excludePositions = [], takeoffDescription = "") {
  const instances = findPlanTagInstances(extractedData, tag);

  return instances
    .filter(inst => {
      // Skip if too close to an existing measurement
      return !excludePositions.some(p =>
        Math.sqrt((p.x - inst.x) ** 2 + (p.y - inst.y) ** 2) < 40
      );
    })
    .map(inst => {
      let confidence = 0.92;
      let differentiator = null;

      if (takeoffDescription) {
        differentiator = detectDifferentiator(extractedData, inst.x, inst.y, takeoffDescription);
        if (differentiator) {
          confidence = Math.min(1, confidence * differentiator.confidenceModifier);
        }
      }

      return {
        id: nextPredId(),
        type: "count",
        tag,
        point: { x: inst.x, y: inst.y },
        confidence,
        tagItem: inst,
        ...(differentiator ? { differentiator: { text: differentiator.text, matches: differentiator.matches } } : {}),
      };
    });
}

/**
 * Generate wall predictions
 * Each tag instance → detect wall geometry → trace wall segment
 * @param {string} takeoffDescription - Description of the active takeoff for differentiator detection
 */
export function predictWalls(extractedData, tag, existingMeasurement = null, excludePositions = [], takeoffDescription = "") {
  const instances = findPlanTagInstances(extractedData, tag);

  return instances
    .filter(inst => {
      return !excludePositions.some(p =>
        Math.sqrt((p.x - inst.x) ** 2 + (p.y - inst.y) ** 2) < 40
      );
    })
    .map(inst => {
      let differentiator = null;
      if (takeoffDescription) {
        differentiator = detectDifferentiator(extractedData, inst.x, inst.y, takeoffDescription);
      }
      const confMod = differentiator ? differentiator.confidenceModifier : 1;
      const diffMeta = differentiator ? { differentiator: { text: differentiator.text, matches: differentiator.matches } } : {};

      const segment = detectWallSegment(extractedData.lines, inst.x, inst.y);
      if (!segment) {
        return {
          id: nextPredId(),
          type: "wall-tag",
          tag,
          point: { x: inst.x, y: inst.y },
          confidence: Math.min(1, 0.5 * confMod),
          tagItem: inst,
          needsManualTrace: true,
          ...diffMeta,
        };
      }

      return {
        id: nextPredId(),
        type: "wall",
        tag,
        points: segment.points,
        wallWidth: segment.wallWidth,
        confidence: Math.min(1, segment.confidence * confMod),
        tagItem: inst,
        sourceLines: segment.sourceLines,
        ...diffMeta,
      };
    });
}

// ══════════════════════════════════════════════════════════════════════
// MAIN PREDICTION ORCHESTRATOR
// ══════════════════════════════════════════════════════════════════════

/**
 * Run predictions for a takeoff on a drawing
 * @param {Object} drawing - Drawing object with PDF data
 * @param {Object} takeoff - The takeoff being measured
 * @param {string} measurementType - "count" | "linear" | "area"
 * @param {Object} clickPoint - Where the user clicked {x, y} in canvas coords
 * @returns {Object} { tag, predictions[], extractionStats }
 */
/**
 * Generate area predictions from geometry analysis (rooms)
 * @param {Object} geometryResult - Output from analyzeDrawingGeometry()
 * @param {string} drawingId - The drawing ID for sheetId
 * @param {Array} excludePositions - Existing measurement centroids to skip
 * @param {string} takeoffDescription - Description for relevance filtering
 * @returns {Array} Prediction objects for rooms
 */
export function predictAreas(geometryResult, drawingId, excludePositions = [], takeoffDescription = "") {
  if (!geometryResult || !geometryResult.rooms) return [];

  return geometryResult.rooms
    .filter(room => {
      // Skip rooms whose centroid is near an existing measurement
      return !excludePositions.some(p =>
        Math.sqrt((p.x - room.centroid.x) ** 2 + (p.y - room.centroid.y) ** 2) < 60
      );
    })
    .map(room => {
      const label = geometryResult.roomLabels.find(rl => rl.roomId === room.id);
      const labelText = label?.label || "";

      // Score room label against takeoff description
      let confidence = room.confidence;
      if (takeoffDescription && labelText) {
        const relevance = scoreTagRelevance(labelText, takeoffDescription);
        if (relevance < 0.15) return null; // Filter out irrelevant rooms
        confidence = confidence * Math.max(relevance, 0.3);
      } else if (!labelText) {
        // No label — neutral confidence
        confidence = 0.5;
      }

      return {
        id: nextPredId(),
        type: "area",
        tag: labelText || takeoffDescription || `Room`,
        points: room.polygon,
        point: room.centroid,
        area: room.area,
        perimeter: room.perimeter,
        confidence,
        roomId: room.id,
        source: "geometry",
      };
    })
    .filter(Boolean);
}

/**
 * Smart predictions cascade — tries tag detection first, then geometry, then vision
 * This is the main entry point for the self-correcting prediction system
 * @param {Object} drawing - Drawing object with PDF data
 * @param {Object} takeoff - The takeoff being measured
 * @param {string} measurementType - "count" | "linear" | "area"
 * @param {Object} clickPoint - Where the user clicked {x, y}
 * @returns {Object} { tag, predictions[], source, confidence, totalInstances }
 */
export async function runSmartPredictions(drawing, takeoff, measurementType, clickPoint) {
  const description = takeoff.description || "";

  // Step 1: Check warm cache first, fall back to extraction
  const warm = getWarmData(drawing.id, description);
  const data = warm?.data || await extractPageData(drawing);

  const existingPositions = (takeoff.measurements || [])
    .filter(m => m.sheetId === drawing.id)
    .flatMap(m => m.points || []);

  // Step 2: Classify takeoff strategy (use warm cache if available)
  const strategy = warm?.strategy || classifyTakeoffStrategy(description);
  console.log("[NOVA] Strategy:", strategy, "for", JSON.stringify(description), "measureType:", measurementType, warm ? "(warm)" : "");

  // ── SURFACE strategies: geometry only, NO tag detection ──
  // Surface items (siding, stucco, drywall, paint) must NEVER use tag detection.
  // Descriptions like "Black Metal Siding" contain common words ("METAL") that
  // appear everywhere on plans (window schedules, material callouts) and produce
  // garbage predictions. Only geometry-based predictions are valid for surfaces.
  if (strategy === "exterior-surface" || strategy === "interior-surface") {
    try {
      const geometry = await analyzeDrawingGeometry(drawing);

      if ((measurementType === "linear" || measurementType === "area") && geometry.walls.length > 0) {
        const wallMeasurements = generateAutoMeasurements(geometry, drawing.id, {
          includeWalls: true, includeRooms: false, includeOpenings: false,
        });
        const predictions = wallMeasurements
          .filter(m => {
            const centerX = (m.points[0].x + m.points[1].x) / 2;
            const centerY = (m.points[0].y + m.points[1].y) / 2;
            const dist = Math.sqrt((centerX - clickPoint.x) ** 2 + (centerY - clickPoint.y) ** 2);
            return dist < 600;
          })
          .filter(m => !existingPositions.some(p =>
            Math.sqrt((p.x - m.points[0].x) ** 2 + (p.y - m.points[0].y) ** 2) < 40
          ))
          .map(m => ({
            id: nextPredId(),
            type: "wall",
            tag: description || (strategy === "exterior-surface" ? "Exterior Wall" : "Interior Wall"),
            points: m.points,
            wallWidth: m.wallWidth,
            confidence: (m.confidence || 0.7) * 0.65,
            source: "geometry",
          }));

        if (predictions.length > 0) {
          return {
            tag: description || (strategy === "exterior-surface" ? "Exterior" : "Interior"),
            predictions,
            source: "geometry",
            confidence: 0.55,
            extractionStats: data.stats,
            totalInstances: predictions.length,
            strategy,
            takeoffId: takeoff.id,
          };
        }
      }

      // Interior surfaces can also match rooms
      if (strategy === "interior-surface" && measurementType === "area" && geometry.rooms.length > 0) {
        const predictions = predictAreas(geometry, drawing.id, existingPositions, description);
        if (predictions.length > 0) {
          return {
            tag: description || "Interior Surface",
            predictions,
            source: "geometry",
            confidence: 0.65,
            extractionStats: data.stats,
            totalInstances: predictions.length,
            strategy,
            takeoffId: takeoff.id,
          };
        }
      }
    } catch (err) {
      console.warn("[NOVA] Geometry failed for", strategy, ":", err);
    }

    // No geometry — surface items cannot use tag detection, return empty.
    // Future: Vision API will handle texture/pattern recognition for surfaces.
    return {
      tag: null,
      predictions: [],
      source: "none",
      confidence: 0,
      extractionStats: data.stats,
      strategy,
      takeoffId: takeoff.id,
      message: strategy === "exterior-surface"
        ? `NOVA recognizes "${description}" as an exterior surface. Automatic predictions for surfaces require drawing geometry or future vision analysis. Measure manually for now.`
        : `NOVA recognizes "${description}" as an interior surface. Automatic predictions for surfaces require room geometry or future vision analysis. Measure manually for now.`,
    };
  }

  // ── Phase 1: Tag detection (instant, free) ──
  // Use warm cache tag scores when available to skip re-scoring
  let nearestTag;
  if (warm?.tagScores && warm.tagScores.size > 0 && description) {
    // Fast path: use pre-scored tags from warm cache
    const scheduleRegions = warm.scheduleRegions || getScheduleRegions(drawing.id) || detectScheduleRegions(data);
    let bestTag = null, bestScore = 0;
    for (const item of (warm.allTags || [])) {
      if (isInScheduleRegion(item.x, item.y, scheduleRegions)) continue;
      const dx = item.x - clickPoint.x, dy = item.y - clickPoint.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 300) continue;
      const relevance = warm.tagScores.get(item.text) || 0;
      if (relevance < 0.5) continue;
      const score = relevance * (1 - dist / 400);
      if (score > bestScore) { bestScore = score; bestTag = { ...item, distance: dist, relevance }; }
    }
    // Also check nearest within tight radius (even if score lower)
    if (!bestTag) {
      const nearest = findNearestTag(data, clickPoint.x, clickPoint.y, 150);
      if (nearest) {
        const relevance = warm.tagScores.get(nearest.text) ?? scoreTagRelevance(nearest.text, description);
        if (relevance >= 0.5) bestTag = { ...nearest, relevance };
      }
    }
    nearestTag = bestTag;
  } else {
    // Standard path: no warm cache
    nearestTag = description
      ? findNearestRelevantTag(data, clickPoint.x, clickPoint.y, description)
      : findNearestTag(data, clickPoint.x, clickPoint.y, 150);
  }

  if (nearestTag) {
    const relevance = nearestTag.relevance ?? scoreTagRelevance(nearestTag.text, description);
    let predictions;
    if (measurementType === "count") {
      predictions = predictCounts(data, nearestTag.text, existingPositions, description);
    } else if (measurementType === "linear") {
      predictions = predictWalls(data, nearestTag.text, takeoff, existingPositions, description);
    } else if (measurementType === "area") {
      try {
        const geometry = await analyzeDrawingGeometry(drawing);
        predictions = predictAreas(geometry, drawing.id, existingPositions, description);
      } catch (err) {
        console.warn("Geometry analysis failed for area predictions:", err);
        predictions = [];
      }
    } else {
      predictions = predictCounts(data, nearestTag.text, existingPositions, description);
    }

    // Apply relevance score and learning multiplier to confidence
    const learnMult = getLearningMultiplier(nearestTag.text, strategy);
    if (relevance > 0 && relevance < 1) {
      predictions = predictions.map(p => ({
        ...p,
        confidence: Math.min(1, p.confidence * Math.max(relevance, 0.5) * learnMult),
      }));
    } else {
      predictions = predictions.map(p => ({
        ...p,
        confidence: Math.min(1, p.confidence * learnMult),
      }));
    }

    if (predictions.length > 0) {
      return {
        tag: nearestTag.text,
        tagPosition: { x: nearestTag.x, y: nearestTag.y },
        predictions,
        source: "tag",
        confidence: Math.min(1, 0.85 * Math.max(relevance, 0.5) * learnMult),
        extractionStats: data.stats,
        totalInstances: findPlanTagInstances(data, nearestTag.text).length,
        strategy,
        takeoffId: takeoff.id,
      };
    }
  }

  // ── Phase 2: Geometry detection (instant, free) ──
  // Works even without tags — analyzes vector geometry
  // Allow geometry for: structural items, items with wall/room/floor in name,
  // or items with no description (generic fallback)
  const descRelatesToGeometry = !description
    || strategy === "structural"
    || scoreTagRelevance("Wall", description) >= 0.3
    || scoreTagRelevance("Room", description) >= 0.3
    || scoreTagRelevance("Floor", description) >= 0.3
    || scoreTagRelevance("Ceiling", description) >= 0.3;

  if ((measurementType === "linear" || measurementType === "area") && descRelatesToGeometry) {
    try {
      const geometry = await analyzeDrawingGeometry(drawing);

      if (measurementType === "linear" && geometry.walls.length > 0) {
        // Find walls near the click point and generate wall predictions
        const wallMeasurements = generateAutoMeasurements(geometry, drawing.id, {
          includeWalls: true, includeRooms: false, includeOpenings: false,
        });
        const predictions = wallMeasurements
          .filter(m => {
            // Only walls within reasonable distance of click
            const centerX = (m.points[0].x + m.points[1].x) / 2;
            const centerY = (m.points[0].y + m.points[1].y) / 2;
            const dist = Math.sqrt((centerX - clickPoint.x) ** 2 + (centerY - clickPoint.y) ** 2);
            return dist < 500; // Wide radius for wall chains
          })
          .filter(m => {
            return !existingPositions.some(p =>
              Math.sqrt((p.x - m.points[0].x) ** 2 + (p.y - m.points[0].y) ** 2) < 40
            );
          })
          .map(m => ({
            id: nextPredId(),
            type: "wall",
            tag: m.tag || "Wall",
            points: m.points,
            wallWidth: m.wallWidth,
            confidence: m.confidence || 0.75,
            source: "geometry",
          }));

        if (predictions.length > 0) {
          return {
            tag: predictions[0].tag,
            predictions,
            source: "geometry",
            confidence: 0.75,
            extractionStats: data.stats,
            totalInstances: predictions.length,
            strategy,
          };
        }
      }

      if (measurementType === "area" && geometry.rooms.length > 0) {
        const predictions = predictAreas(geometry, drawing.id, existingPositions, description);
        if (predictions.length > 0) {
          return {
            tag: description || "Rooms",
            predictions,
            source: "geometry",
            confidence: 0.7,
            extractionStats: data.stats,
            totalInstances: predictions.length,
            strategy,
            takeoffId: takeoff.id,
          };
        }
      }
    } catch (err) {
      console.warn("Geometry prediction failed:", err);
    }
  }

  // ── Phase 3: Count via geometry (openings detection) ──
  // Only fall through to openings if the takeoff description relates to doors/windows,
  // or if no description is set (generic count).
  // NEVER show openings for items classified as surfaces or structural.
  if (measurementType === "count" && strategy === "tag-based") {
    try {
      const geometry = await analyzeDrawingGeometry(drawing);
      if (geometry.openings.length > 0) {
        const predictions = geometry.openings
          .filter(o => {
            // Filter by description relevance — skip openings unrelated to the takeoff
            if (description) {
              const openingLabel = o.type === "door" ? "Door" : "Window";
              const relevance = scoreTagRelevance(openingLabel, description);
              if (relevance < 0.15) return false;
            }
            return !existingPositions.some(p =>
              Math.sqrt((p.x - o.position.x) ** 2 + (p.y - o.position.y) ** 2) < 40
            );
          })
          .map(o => ({
            id: nextPredId(),
            type: "count",
            tag: o.type === "door" ? "Door" : "Window",
            point: o.position,
            confidence: o.confidence,
            source: "geometry",
          }));

        if (predictions.length > 0) {
          return {
            tag: predictions[0].tag,
            predictions,
            source: "geometry",
            confidence: 0.6,
            extractionStats: data.stats,
            totalInstances: predictions.length,
            strategy,
            takeoffId: takeoff.id,
          };
        }
      }
    } catch (err) {
      console.warn("Opening detection failed:", err);
    }
  }

  // Phase 4: Vision API fallback would go here (future implementation)
  return {
    tag: null,
    predictions: [],
    source: "none",
    confidence: 0,
    extractionStats: data.stats,
    strategy,
    takeoffId: takeoff.id,
    message: description
      ? `No predictions for "${description}" — NOVA couldn't find matching tags or geometry. Measure manually.`
      : "No predictions could be generated",
  };
}

/**
 * Check if a point is near any pending prediction
 * Used for proximity auto-accept
 * @returns {Object|null} The nearest prediction within radius, or null
 */
export function findNearbyPrediction(predictions, point, acceptedIds, rejectedIds, radius = 30) {
  if (!predictions || !point) return null;

  let nearest = null;
  let nearestDist = radius;

  for (const pred of predictions) {
    if (acceptedIds.includes(pred.id) || rejectedIds.includes(pred.id)) continue;

    // Get prediction center point
    const predPt = pred.point || (pred.points ? { x: pred.points[0].x, y: pred.points[0].y } : null);
    if (!predPt) continue;

    const dist = Math.sqrt((point.x - predPt.x) ** 2 + (point.y - predPt.y) ** 2);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = pred;
    }
  }

  return nearest;
}

/**
 * Run predictions using a known tag (e.g., from a previous detection)
 */
/**
 * Cross-sheet scanning — find tag instances across all drawings
 */
export async function scanAllSheets(drawings, tag, measurementType) {
  const results = [];

  for (const drawing of drawings) {
    if (!drawing.data || drawing.type !== "pdf") continue;

    try {
      const data = await extractPageData(drawing);
      const instances = findPlanTagInstances(data, tag);
      if (instances.length > 0) {
        results.push({
          drawingId: drawing.id,
          sheetNumber: drawing.sheetNumber || drawing.label || "?",
          instanceCount: instances.length,
          instances,
        });
      }
    } catch (e) {
      console.warn(`Failed to scan sheet ${drawing.id}:`, e);
    }
  }

  return results;
}

// (Prediction state is managed via Zustand takeoffsStore — no module-level state needed)
