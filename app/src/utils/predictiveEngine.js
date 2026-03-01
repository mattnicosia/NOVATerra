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
} from './pdfExtractor';

import {
  analyzeDrawingGeometry,
  generateAutoMeasurements,
} from './geometryEngine';

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

  // Prefix match: tag letters match start of any description word
  if (tagLetters.length >= 1) {
    for (const word of descWords) {
      if (word.startsWith(tagLetters) && word.length > tagLetters.length) return 0.6;
    }
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

  // Try nearest tag first
  const nearest = findNearestTag(data, x, y, 150);
  if (nearest) {
    const relevance = scoreTagRelevance(nearest.text, description);
    if (relevance >= 0.3) {
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
    if (score > bestScore && relevance >= 0.3) {
      bestScore = score;
      bestTag = { ...item, distance: dist, relevance };
    }
  }

  if (bestTag) return bestTag;

  // Whole-page fallback: search ALL text items (including non-tag text like "DUPLEX", "2BR")
  // for description-relevant matches anywhere on the page
  let pagebestTag = null;
  let pagebestRelevance = 0;

  for (const item of data.text) {
    const t = item.text.trim();
    if (!t || t.length > 20) continue; // skip empty or very long text
    const relevance = scoreTagRelevance(t, description);
    if (relevance > pagebestRelevance && relevance >= 0.5) {
      pagebestRelevance = relevance;
      const dx = item.x - x;
      const dy = item.y - y;
      pagebestTag = { ...item, text: t, distance: Math.sqrt(dx * dx + dy * dy), relevance };
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
export async function runPredictions(drawing, takeoff, measurementType, clickPoint) {
  // Step 1: Extract page data (cached after first call)
  const data = await extractPageData(drawing);
  const description = takeoff.description || "";

  // Step 2: Find the tag nearest to where the user clicked (description-aware)
  const nearestTag = description
    ? findNearestRelevantTag(data, clickPoint.x, clickPoint.y, description)
    : findNearestTag(data, clickPoint.x, clickPoint.y, 150);
  if (!nearestTag) {
    return { tag: null, predictions: [], extractionStats: data.stats, message: "No tag found near click point" };
  }

  // Step 3: Get existing measurement positions to exclude
  const existingPositions = (takeoff.measurements || [])
    .filter(m => m.sheetId === drawing.id)
    .flatMap(m => m.points || []);

  // Step 4: Generate predictions based on measurement type
  let predictions;
  if (measurementType === "count") {
    predictions = predictCounts(data, nearestTag.text, existingPositions, description);
  } else {
    predictions = predictWalls(data, nearestTag.text, takeoff, existingPositions, description);
  }

  return {
    tag: nearestTag.text,
    tagPosition: { x: nearestTag.x, y: nearestTag.y },
    predictions,
    extractionStats: data.stats,
    totalInstances: findPlanTagInstances(data, nearestTag.text).length,
  };
}

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
        tag: labelText || `Room`,
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
  // Step 1: Extract page data (cached)
  const data = await extractPageData(drawing);
  const description = takeoff.description || "";

  const existingPositions = (takeoff.measurements || [])
    .filter(m => m.sheetId === drawing.id)
    .flatMap(m => m.points || []);

  // ── Phase 1: Tag detection (instant, free) ──
  // Use description-aware tag search when description is available
  const nearestTag = description
    ? findNearestRelevantTag(data, clickPoint.x, clickPoint.y, description)
    : findNearestTag(data, clickPoint.x, clickPoint.y, 150);

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

    // Apply relevance score to confidence
    if (relevance > 0 && relevance < 1) {
      predictions = predictions.map(p => ({
        ...p,
        confidence: Math.min(1, p.confidence * Math.max(relevance, 0.5)),
      }));
    }

    if (predictions.length > 0) {
      return {
        tag: nearestTag.text,
        tagPosition: { x: nearestTag.x, y: nearestTag.y },
        predictions,
        source: "tag",
        confidence: 0.85 * Math.max(relevance, 0.5),
        extractionStats: data.stats,
        totalInstances: findPlanTagInstances(data, nearestTag.text).length,
      };
    }
  }

  // ── Phase 2: Geometry detection (instant, free) ──
  // Works even without tags — analyzes vector geometry
  // Skip geometry fallback if description suggests non-geometric items (e.g., "Duplexes")
  const descRelatesToGeometry = !description || scoreTagRelevance("Wall", description) >= 0.3
    || scoreTagRelevance("Room", description) >= 0.3 || scoreTagRelevance("Floor", description) >= 0.3;

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
          };
        }
      }

      if (measurementType === "area" && geometry.rooms.length > 0) {
        const predictions = predictAreas(geometry, drawing.id, existingPositions, description);
        if (predictions.length > 0) {
          return {
            tag: "Rooms",
            predictions,
            source: "geometry",
            confidence: 0.7,
            extractionStats: data.stats,
            totalInstances: predictions.length,
          };
        }
      }
    } catch (err) {
      console.warn("Geometry prediction failed:", err);
    }
  }

  // ── Phase 3: Count via geometry (openings detection) ──
  // Only fall through to openings if the takeoff description relates to doors/windows,
  // or if no description is set (generic count)
  if (measurementType === "count") {
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
          };
        }
      }
    } catch (err) {
      console.warn("Opening detection failed:", err);
    }
  }

  // Phase 4: Vision API fallback would go here (future implementation)
  // For now, return empty
  return {
    tag: null,
    predictions: [],
    source: "none",
    confidence: 0,
    extractionStats: data.stats,
    message: "No predictions could be generated",
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
export async function runPredictionsForTag(drawing, tag, measurementType, excludePositions = []) {
  const data = await extractPageData(drawing);

  let predictions;
  if (measurementType === "count") {
    predictions = predictCounts(data, tag, excludePositions);
  } else {
    predictions = predictWalls(data, tag, null, excludePositions);
  }

  return {
    tag,
    predictions,
    extractionStats: data.stats,
    totalInstances: findPlanTagInstances(data, tag).length,
  };
}

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

// ══════════════════════════════════════════════════════════════════════
// PREDICTION STATE
// Manages active predictions for the UI
// ══════════════════════════════════════════════════════════════════════
const predictionState = {
  active: false,
  tag: null,
  predictions: [],
  accepted: new Set(),
  rejected: new Set(),
  scanning: false,
};

export function getPredictionState() { return { ...predictionState }; }

export function setPredictions(tag, predictions) {
  predictionState.active = true;
  predictionState.tag = tag;
  predictionState.predictions = predictions;
  predictionState.accepted.clear();
  predictionState.rejected.clear();
}

export function acceptPrediction(id) { predictionState.accepted.add(id); }
export function rejectPrediction(id) { predictionState.rejected.add(id); }

export function acceptAll() {
  predictionState.predictions.forEach(p => {
    if (!predictionState.rejected.has(p.id)) predictionState.accepted.add(p.id);
  });
}

export function getAcceptedPredictions() {
  return predictionState.predictions.filter(p =>
    predictionState.accepted.has(p.id) && !predictionState.rejected.has(p.id)
  );
}

export function clearPredictions() {
  predictionState.active = false;
  predictionState.tag = null;
  predictionState.predictions = [];
  predictionState.accepted.clear();
  predictionState.rejected.clear();
  predictionState.scanning = false;
}

export function setScanningState(scanning) {
  predictionState.scanning = scanning;
}
