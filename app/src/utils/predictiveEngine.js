// ══════════════════════════════════════════════════════════════════════
// Predictive Takeoff Engine — auto-detects matching elements on drawings
// Uses PDF text extraction + vector geometry for tag-based predictions
// ══════════════════════════════════════════════════════════════════════

import {
  extractPageData,
  findNearestTag,
  findPlanTagInstances,
  isExtracted,
} from './pdfExtractor';

import {
  analyzeDrawingGeometry,
  generateAutoMeasurements,
} from './geometryEngine';

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
 */
export function predictCounts(extractedData, tag, excludePositions = []) {
  const instances = findPlanTagInstances(extractedData, tag);

  return instances
    .filter(inst => {
      // Skip if too close to an existing measurement
      return !excludePositions.some(p =>
        Math.sqrt((p.x - inst.x) ** 2 + (p.y - inst.y) ** 2) < 40
      );
    })
    .map(inst => ({
      id: nextPredId(),
      type: "count",
      tag,
      point: { x: inst.x, y: inst.y },
      confidence: 0.92,
      tagItem: inst,
    }));
}

/**
 * Generate wall predictions
 * Each tag instance → detect wall geometry → trace wall segment
 */
export function predictWalls(extractedData, tag, existingMeasurement = null, excludePositions = []) {
  const instances = findPlanTagInstances(extractedData, tag);

  return instances
    .filter(inst => {
      return !excludePositions.some(p =>
        Math.sqrt((p.x - inst.x) ** 2 + (p.y - inst.y) ** 2) < 40
      );
    })
    .map(inst => {
      const segment = detectWallSegment(extractedData.lines, inst.x, inst.y);
      if (!segment) {
        // Fallback: just mark the tag position (user can trace manually)
        return {
          id: nextPredId(),
          type: "wall-tag",
          tag,
          point: { x: inst.x, y: inst.y },
          confidence: 0.5,
          tagItem: inst,
          needsManualTrace: true,
        };
      }

      return {
        id: nextPredId(),
        type: "wall",
        tag,
        points: segment.points,
        wallWidth: segment.wallWidth,
        confidence: segment.confidence,
        tagItem: inst,
        sourceLines: segment.sourceLines,
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

  // Step 2: Find the tag nearest to where the user clicked
  const nearestTag = findNearestTag(data, clickPoint.x, clickPoint.y, 150);
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
    predictions = predictCounts(data, nearestTag.text, existingPositions);
  } else {
    predictions = predictWalls(data, nearestTag.text, takeoff, existingPositions);
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
 * @returns {Array} Prediction objects for rooms
 */
export function predictAreas(geometryResult, drawingId, excludePositions = []) {
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
      return {
        id: nextPredId(),
        type: "area",
        tag: label?.label || `Room`,
        points: room.polygon,
        point: room.centroid, // For rendering/centering
        area: room.area,
        perimeter: room.perimeter,
        confidence: room.confidence,
        roomId: room.id,
        source: "geometry",
      };
    });
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

  const existingPositions = (takeoff.measurements || [])
    .filter(m => m.sheetId === drawing.id)
    .flatMap(m => m.points || []);

  // ── Phase 1: Tag detection (instant, free) ──
  const nearestTag = findNearestTag(data, clickPoint.x, clickPoint.y, 150);

  if (nearestTag) {
    let predictions;
    if (measurementType === "count") {
      predictions = predictCounts(data, nearestTag.text, existingPositions);
    } else if (measurementType === "linear") {
      predictions = predictWalls(data, nearestTag.text, takeoff, existingPositions);
    } else if (measurementType === "area") {
      // For area with a tag, try geometry-based room detection
      try {
        const geometry = await analyzeDrawingGeometry(drawing);
        predictions = predictAreas(geometry, drawing.id, existingPositions);
      } catch (err) {
        console.warn("Geometry analysis failed for area predictions:", err);
        predictions = [];
      }
    } else {
      predictions = predictCounts(data, nearestTag.text, existingPositions);
    }

    if (predictions.length > 0) {
      return {
        tag: nearestTag.text,
        tagPosition: { x: nearestTag.x, y: nearestTag.y },
        predictions,
        source: "tag",
        confidence: 0.85,
        extractionStats: data.stats,
        totalInstances: findPlanTagInstances(data, nearestTag.text).length,
      };
    }
  }

  // ── Phase 2: Geometry detection (instant, free) ──
  // Works even without tags — analyzes vector geometry
  if (measurementType === "linear" || measurementType === "area") {
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
        const predictions = predictAreas(geometry, drawing.id, existingPositions);
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
  if (measurementType === "count") {
    try {
      const geometry = await analyzeDrawingGeometry(drawing);
      if (geometry.openings.length > 0) {
        const predictions = geometry.openings
          .filter(o => {
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
