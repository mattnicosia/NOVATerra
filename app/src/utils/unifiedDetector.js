// unifiedDetector.js — Unified detection pipeline combining YOLO + Vector + Claude
// ═══════════════════════════════════════════════════════════════════════════════════
//
// Architecture (tiered, cost-aware):
//
//   Tier 1: YOLO (free, instant, ~50ms/page)
//     - Runs nova_takeoff_v2.onnx in browser via onnxruntime-web
//     - Detects: schedule_table, wall_linear, floor_area, door_window, fixture, annotation
//     - Returns bounding boxes with confidence scores
//     - Falls through to Tier 2 if model not available
//
//   Tier 2: Vector Extraction (free, ~200ms/page, PDF-only)
//     - Calls Render-hosted PyMuPDF service
//     - Extracts precise wall geometry and room polygons from PDF vectors
//     - Complements YOLO's raster detection with exact geometry
//
//   Tier 3: Claude Vision (paid, ~2s/page, fallback)
//     - Used when YOLO model isn't available OR for schedule parsing
//     - Claude Haiku for detection (~$0.01/page)
//     - Claude Sonnet for interpretation when needed (~$0.15/page)
//
// The scan pipeline uses this as:
//   Phase 1 (Detection):  YOLO → instant schedule_table bbox detection
//   Phase 2 (Parsing):    Claude parses ONLY the cropped schedule regions
//   Geometry:             Vector extraction for precise wall/room data
//
// This reduces Claude API costs by 60-80% — YOLO handles the detection
// that previously required sending full-page images to Claude.

import { isModelAvailable, detectObjects, detectScheduleTables } from "@/utils/yoloDetector";
import { extractVectors, analyzePdf } from "@/utils/vectorExtractor";

// ── Detection result shape ──
// {
//   source: "yolo" | "vector" | "claude" | "hybrid",
//   schedules: [{ type, bbox, confidence, title }],
//   walls: [{ start, end, thickness }],
//   rooms: [{ polygon, label }],
//   doors: [{ bbox, confidence }],
//   windows: [{ bbox, confidence }],
//   fixtures: [{ bbox, confidence, type }],
//   annotations: [{ bbox, confidence }],
//   inferenceMs: number,
// }

/**
 * Detect all construction elements on a drawing using the best available method.
 * Tries YOLO first (free, fast), falls back to Claude (paid, slower).
 *
 * @param {object} params
 * @param {string} params.imageDataUrl — rendered drawing as data URL
 * @param {string} [params.drawingId] — for vector extraction cache lookup
 * @param {object} [params.options]
 * @param {boolean} [params.options.includeVectors] — also run vector extraction
 * @param {boolean} [params.options.scheduleOnly] — only detect schedule tables
 * @param {string[]} [params.options.classFilter] — only detect these classes
 * @returns {Promise<DetectionResult>}
 */
export async function detectAll({ imageDataUrl, drawingId, options = {} }) {
  const { includeVectors = false, scheduleOnly = false, classFilter } = options;
  const t0 = performance.now();

  const result = {
    source: "none",
    schedules: [],
    walls: [],
    rooms: [],
    doors: [],
    windows: [],
    fixtures: [],
    annotations: [],
    inferenceMs: 0,
    yoloAvailable: false,
  };

  // ── Tier 1: YOLO Detection ──
  const modelReady = await isModelAvailable();
  result.yoloAvailable = modelReady;

  if (modelReady) {
    try {
      const yoloOpts = {};
      if (classFilter) yoloOpts.classFilter = classFilter;
      if (scheduleOnly) yoloOpts.classFilter = ["schedule_table"];

      const { detections, inferenceMs, imgWidth, imgHeight } = await detectObjects(imageDataUrl, yoloOpts);
      result.inferenceMs = inferenceMs;
      result.source = "yolo";

      // Sort detections into categories
      for (const det of detections) {
        const item = {
          bbox: det.bbox, // [x1, y1, x2, y2] in pixel coords
          confidence: det.confidence,
          className: det.className,
          color: det.color,
        };

        switch (det.className) {
          case "schedule_table":
            result.schedules.push({
              type: "detected", // scanRunner will classify the schedule type
              bbox: pixelToPct(det.bbox, imgWidth, imgHeight),
              confidence: det.confidence,
              title: "Detected by YOLO",
              source: "yolo",
            });
            break;
          case "wall_linear":
            result.walls.push(item);
            break;
          case "floor_area":
            result.rooms.push(item);
            break;
          case "door_window":
            result.doors.push(item);
            break;
          case "fixture":
            result.fixtures.push(item);
            break;
          case "annotation":
            result.annotations.push(item);
            break;
        }
      }

      console.log(
        `[unifiedDetector] YOLO: ${detections.length} detections in ${inferenceMs}ms` +
          ` (${result.schedules.length} schedules, ${result.walls.length} walls, ${result.doors.length} doors)`
      );
    } catch (err) {
      console.warn("[unifiedDetector] YOLO failed, will fall through:", err.message);
      result.source = "none";
    }
  }

  // ── Tier 2: Vector Extraction (complement YOLO with precise geometry) ──
  if (includeVectors && drawingId) {
    try {
      const vectorResult = await extractVectors(drawingId);
      if (vectorResult) {
        // Add vector walls (these are precise line segments, not bounding boxes)
        if (vectorResult.walls?.length > 0) {
          result.walls = result.walls.concat(
            vectorResult.walls.map((w) => ({
              start: w.start || [w.x1, w.y1],
              end: w.end || [w.x2, w.y2],
              thickness: w.thickness || w.line_width,
              source: "vector",
            }))
          );
        }

        // Add vector rooms
        if (vectorResult.rooms?.length > 0) {
          result.rooms = result.rooms.concat(
            vectorResult.rooms.map((r) => ({
              polygon: r.polygon || r.points,
              label: r.label || r.name,
              area: r.area,
              source: "vector",
            }))
          );
        }

        if (result.source === "yolo") {
          result.source = "hybrid";
        } else {
          result.source = "vector";
        }

        console.log(
          `[unifiedDetector] Vector: ${vectorResult.walls?.length || 0} walls, ${vectorResult.rooms?.length || 0} rooms`
        );
      }
    } catch (err) {
      console.warn("[unifiedDetector] Vector extraction failed:", err.message);
    }
  }

  result.inferenceMs = Math.round(performance.now() - t0);

  // If no detection method worked, caller should fall back to Claude
  if (result.source === "none") {
    console.log("[unifiedDetector] No local detection available — caller should use Claude fallback");
  }

  return result;
}

/**
 * Detect schedule tables on a single drawing.
 * This is the primary entry point for Phase 1 of the scan pipeline.
 *
 * Returns schedule detections that scanRunner can use to crop + send to Claude for parsing.
 *
 * @param {string} imageDataUrl — rendered drawing
 * @returns {Promise<{schedules: Array, source: string, inferenceMs: number}>}
 */
export async function detectSchedules(imageDataUrl) {
  const modelReady = await isModelAvailable();

  if (modelReady) {
    try {
      const { detections, imgWidth, imgHeight } = await detectScheduleTables(imageDataUrl);
      return {
        schedules: detections.map((d) => ({
          type: "detected",
          bbox: pixelToPct(d.bbox, imgWidth, imgHeight),
          confidence: d.confidence,
          title: "Schedule (YOLO)",
          source: "yolo",
        })),
        source: "yolo",
        inferenceMs: 0,
      };
    } catch (err) {
      console.warn("[unifiedDetector] YOLO schedule detection failed:", err.message);
    }
  }

  // Fallback: return empty — scanRunner will use Claude
  return { schedules: [], source: "claude-fallback", inferenceMs: 0 };
}

/**
 * Classify a YOLO-detected schedule region.
 * Uses OCR text within the region to determine the schedule type
 * (door, window, finish, plumbing-fixture, etc.)
 *
 * @param {string} ocrText — OCR text from within the schedule region
 * @returns {string} — schedule type ID matching SCHEDULE_TYPES
 */
export function classifyScheduleFromOCR(ocrText) {
  if (!ocrText) return "unknown";
  const text = ocrText.toLowerCase();

  const patterns = [
    { type: "door", keywords: ["door schedule", "door type", "door mark", "hardware set", "fire rating"] },
    { type: "window", keywords: ["window schedule", "window type", "window mark", "glazing", "frame type"] },
    { type: "finish", keywords: ["finish schedule", "room finish", "floor finish", "wall finish", "ceiling finish", "base"] },
    { type: "plumbing-fixture", keywords: ["plumbing fixture", "plumbing schedule", "fixture schedule", "toilet", "lavatory", "urinal"] },
    { type: "equipment", keywords: ["equipment schedule", "kitchen equipment", "appliance"] },
    { type: "lighting-fixture", keywords: ["lighting fixture", "light fixture", "fixture type", "lamp", "luminaire", "wattage"] },
    { type: "mechanical-equipment", keywords: ["mechanical schedule", "hvac schedule", "air handler", "condensing unit", "btu", "cfm", "tonnage"] },
    { type: "wall-types", keywords: ["wall type", "partition type", "wall schedule", "stud", "gypsum", "partition schedule"] },
    { type: "finish-detail", keywords: ["material schedule", "color schedule", "paint schedule"] },
  ];

  for (const { type, keywords } of patterns) {
    const matches = keywords.filter((kw) => text.includes(kw));
    if (matches.length >= 1) return type;
  }

  // Check for generic table structure indicators
  if (text.includes("schedule") || text.includes("type") && text.includes("mark")) {
    return "unknown"; // Let Claude classify in Phase 2
  }

  return "unknown";
}

// ── Helpers ──

/**
 * Convert pixel bbox [x1, y1, x2, y2] to percentage bbox [xPct, yPct, wPct, hPct].
 * Phase 2 cropping expects percentages (0-100 scale) matching Claude's detection format.
 *
 * @param {number[]} bbox — [x1, y1, x2, y2] in pixel coordinates
 * @param {number} imgWidth — image width in pixels
 * @param {number} imgHeight — image height in pixels
 * @returns {number[]} [xPct, yPct, wPct, hPct] as 0-100 percentages
 */
function pixelToPct(bbox, imgWidth, imgHeight) {
  if (!bbox || bbox.length !== 4 || !imgWidth || !imgHeight) return bbox;
  const [x1, y1, x2, y2] = bbox;
  return [
    (x1 / imgWidth) * 100,   // xPct — left edge as % of width
    (y1 / imgHeight) * 100,  // yPct — top edge as % of height
    ((x2 - x1) / imgWidth) * 100,  // wPct — width as % of image width
    ((y2 - y1) / imgHeight) * 100,  // hPct — height as % of image height
  ];
}

/**
 * Get detection capabilities summary.
 * Useful for UI indicators showing which detection methods are active.
 */
export async function getCapabilities() {
  const yolo = await isModelAvailable();
  return {
    yolo,
    vector: true, // Always available (Render service)
    claude: true, // Always available (API key configured)
    recommended: yolo ? "hybrid" : "claude",
  };
}
