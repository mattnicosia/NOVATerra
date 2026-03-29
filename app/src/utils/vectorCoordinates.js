// vectorCoordinates.js — Coordinate conversion between PDF vector space and NOVATerra spaces
//
// THREE COORDINATE SPACES:
//   1. PDF Points (72 DPI) — raw output from PyMuPDF vector extraction
//   2. Canvas Pixels (108 DPI) — rendered PDF at scale 1.5, where takeoff measurements live
//   3. Feet — real-world dimensions, used by 3D rendering (geometryBuilder, BlueprintTab, etc.)
//
// Conversion chain:
//   PDF Points × 1.5 = Canvas Pixels
//   Canvas Pixels ÷ getPxPerFoot(drawingId) = Feet
//   PDF Points × 1.5 ÷ getPxPerFoot(drawingId) = Feet (combined)

import { getPxPerFoot } from "@/utils/geometryBuilder";

// The scale factor used when rendering PDFs to canvas images
// Must match pdfExtractor.js viewport scale and uploadPipeline.js render scale
const PDF_TO_CANVAS_SCALE = 1.5;

/**
 * Convert a point from PDF coordinate space (72 DPI) to canvas pixel space (108 DPI).
 * This makes vector-extracted coordinates compatible with takeoff measurement coordinates.
 */
export function pdfPointToCanvasPixel(point) {
  return {
    x: point.x * PDF_TO_CANVAS_SCALE,
    y: point.y * PDF_TO_CANVAS_SCALE,
  };
}

/**
 * Convert a point from PDF coordinate space directly to feet.
 * Requires a calibrated drawing (getPxPerFoot must return a value).
 * Returns null if drawing is not calibrated.
 */
export function pdfPointToFeet(point, drawingId) {
  const ppf = getPxPerFoot(drawingId);
  if (!ppf) return null;
  return {
    x: (point.x * PDF_TO_CANVAS_SCALE) / ppf,
    y: (point.y * PDF_TO_CANVAS_SCALE) / ppf,
  };
}

/**
 * Convert a wall segment (start + end in PDF points) to feet.
 * Returns null if drawing is not calibrated.
 */
export function wallSegmentToFeet(segment, drawingId) {
  const ppf = getPxPerFoot(drawingId);
  if (!ppf) return null;
  const scale = PDF_TO_CANVAS_SCALE / ppf;
  return {
    start: [segment.start[0] * scale, segment.start[1] * scale],
    end: [segment.end[0] * scale, segment.end[1] * scale],
    thickness: segment.thickness ? segment.thickness * scale : 0.5, // default 6" wall
    weight: segment.weight,
    id: segment.id,
    floorLabel: segment.floorLabel,
    elevation: segment.elevation,
  };
}

/**
 * Convert a room polygon (array of [x, y] points in PDF points) to feet.
 * Returns null if drawing is not calibrated.
 */
export function roomPolygonToFeet(polygon, drawingId) {
  const ppf = getPxPerFoot(drawingId);
  if (!ppf) return null;
  const scale = PDF_TO_CANVAS_SCALE / ppf;
  return polygon.map(([x, y]) => [x * scale, y * scale]);
}

/**
 * Convert an entire floor's worth of vector data to feet-space.
 * Input: { walls: [...], rooms: [...] } in PDF points
 * Output: same structure in feet, or null if uncalibrated
 */
export function convertFloorToFeet(floorData, drawingId) {
  const ppf = getPxPerFoot(drawingId);
  if (!ppf) return null;
  const scale = PDF_TO_CANVAS_SCALE / ppf;

  return {
    walls: (floorData.walls || []).map(w => ({
      ...w,
      start: [w.start[0] * scale, w.start[1] * scale],
      end: [w.end[0] * scale, w.end[1] * scale],
      thickness: w.thickness ? w.thickness * scale : 0.5,
      lengthFt: w.lengthFt || (Math.sqrt(
        ((w.end[0] - w.start[0]) * scale) ** 2 +
        ((w.end[1] - w.start[1]) * scale) ** 2
      )),
    })),
    rooms: (floorData.rooms || []).map(r => ({
      ...r,
      polygon: r.polygon ? r.polygon.map(([x, y]) => [x * scale, y * scale]) : [],
      areaSF: r.areaSF, // already in SF from detection
    })),
    widthFt: floorData.pageWidth ? (floorData.pageWidth * scale) : null,
    depthFt: floorData.pageHeight ? (floorData.pageHeight * scale) : null,
  };
}

/**
 * Check if a drawing has the data needed for the Architect Sketch.
 * Returns { canRender, reason } indicating if we can render and why not.
 */
export function canRenderArchitectSketch(drawingId) {
  const ppf = getPxPerFoot(drawingId);
  if (!ppf) {
    return {
      canRender: false,
      reason: "Drawing not calibrated. Set the scale on the Takeoffs page first.",
    };
  }
  return { canRender: true, reason: null };
}

/**
 * Compute the conversion factor from PDF points to feet for a specific drawing.
 * Returns null if uncalibrated. Useful for passing to external processing (Python, workers).
 */
export function getConversionFactor(drawingId) {
  const ppf = getPxPerFoot(drawingId);
  if (!ppf) return null;
  return PDF_TO_CANVAS_SCALE / ppf; // multiply PDF point coordinate by this to get feet
}

/**
 * Convert Bezier curve control points to a polyline approximation.
 * Input: [p0, p1, p2, p3] — cubic Bezier control points in any coordinate space
 * Output: array of [x, y] points approximating the curve
 * segments: number of line segments (higher = smoother, default 8)
 */
export function bezierToPolyline(p0, p1, p2, p3, segments = 8) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const x = mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0];
    const y = mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1];
    points.push([x, y]);
  }
  return points;
}
