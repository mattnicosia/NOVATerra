// yoloDetector.js — Browser-based YOLO object detection via ONNX Runtime Web
// Loads nova_takeoff_v2.onnx and runs inference on blueprint drawings.
// Returns bounding boxes with class predictions for 6 construction element types.
//
// Architecture:
//   1. Load ONNX model (lazy, cached after first load)
//   2. Preprocess image → 640x640 float32 tensor
//   3. Run inference → raw predictions
//   4. Post-process: NMS, confidence filtering
//   5. Return detections in pixel coordinates
//
// Classes:
//   0: schedule_table    — tables, schedules, legends
//   1: wall_linear       — wall line segments
//   2: floor_area        — floor/slab/ceiling areas
//   3: door_window       — doors and windows
//   4: fixture           — plumbing/electrical/HVAC fixtures
//   5: annotation        — dimensions, notes, callouts

import * as ort from "onnxruntime-web";

// ── Configuration ──
const MODEL_PATH = "/models/nova_takeoff_v2.onnx";
const MODEL_META_PATH = "/models/nova_takeoff_v2.json";
const INPUT_SIZE = 640;
const NUM_CLASSES = 6;

const CLASS_NAMES = [
  "schedule_table",
  "wall_linear",
  "floor_area",
  "door_window",
  "fixture",
  "annotation",
];

const CLASS_COLORS = {
  schedule_table: "#FF4444",
  wall_linear: "#44FF44",
  floor_area: "#4488FF",
  door_window: "#FF44FF",
  fixture: "#FFFF44",
  annotation: "#44FFFF",
};

// Default confidence thresholds per class (schedule_table + door_window are priority)
const DEFAULT_THRESHOLDS = {
  schedule_table: 0.25,
  wall_linear: 0.35,
  floor_area: 0.30,
  door_window: 0.25,
  fixture: 0.35,
  annotation: 0.40,
};

const NMS_IOU_THRESHOLD = 0.45;

// ── Singleton model session ──
let _session = null;
let _loading = null;
let _modelAvailable = null; // null = unknown, true/false = checked

/**
 * Check if the ONNX model file exists at the expected path.
 * Caches the result so we only check once.
 */
export async function isModelAvailable() {
  if (_modelAvailable !== null) return _modelAvailable;

  try {
    const resp = await fetch(MODEL_PATH, { method: "HEAD" });
    _modelAvailable = resp.ok;
  } catch {
    _modelAvailable = false;
  }

  return _modelAvailable;
}

/**
 * Load the ONNX model session. Lazy — first call downloads and initializes,
 * subsequent calls return the cached session instantly.
 */
async function getSession() {
  if (_session) return _session;
  if (_loading) return _loading;

  _loading = (async () => {
    console.log("[yoloDetector] Loading ONNX model...");
    const t0 = performance.now();

    // Configure ONNX Runtime for browser
    // WASM files are loaded from the onnxruntime-web CDN by default
    // which is the most reliable approach for production deployments
    ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency || 4, 4);
    ort.env.wasm.simd = true;
    ort.env.wasm.proxy = false; // Direct execution, no web worker proxy

    try {
      _session = await ort.InferenceSession.create(MODEL_PATH, {
        executionProviders: ["wasm"], // WebAssembly backend (universal)
        graphOptimizationLevel: "all",
      });

      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      console.log(`[yoloDetector] Model loaded in ${elapsed}s`);
      console.log(`[yoloDetector] Input: ${JSON.stringify(_session.inputNames)}`);
      console.log(`[yoloDetector] Output: ${JSON.stringify(_session.outputNames)}`);
    } catch (err) {
      console.error("[yoloDetector] Failed to load model:", err);
      _session = null;
      throw err;
    } finally {
      _loading = null;
    }

    return _session;
  })();

  return _loading;
}

/**
 * Preprocess an image for YOLO inference.
 * Resizes to 640x640, normalizes to [0, 1], returns Float32Array in NCHW format.
 *
 * @param {string|HTMLImageElement|HTMLCanvasElement} source — image data URL, Image, or Canvas
 * @returns {{ tensor: Float32Array, origWidth: number, origHeight: number, padX: number, padY: number, scale: number }}
 */
async function preprocess(source) {
  // Load image if string
  let img;
  if (typeof source === "string") {
    img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = source;
    });
  } else {
    img = source;
  }

  const origWidth = img.width || img.naturalWidth;
  const origHeight = img.height || img.naturalHeight;

  // Letterbox resize: scale to fit 640x640 while maintaining aspect ratio
  const scale = Math.min(INPUT_SIZE / origWidth, INPUT_SIZE / origHeight);
  const newW = Math.round(origWidth * scale);
  const newH = Math.round(origHeight * scale);
  const padX = Math.round((INPUT_SIZE - newW) / 2);
  const padY = Math.round((INPUT_SIZE - newH) / 2);

  // Draw to canvas with letterbox padding (gray background)
  const canvas = document.createElement("canvas");
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const ctx = canvas.getContext("2d");

  // Gray background (114/255 is YOLO standard padding color)
  ctx.fillStyle = `rgb(114, 114, 114)`;
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  ctx.drawImage(img, padX, padY, newW, newH);

  // Extract pixel data and convert to NCHW float32
  const imageData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const { data } = imageData;
  const pixels = INPUT_SIZE * INPUT_SIZE;
  const tensor = new Float32Array(3 * pixels);

  for (let i = 0; i < pixels; i++) {
    const j = i * 4;
    tensor[i] = data[j] / 255.0;               // R channel
    tensor[pixels + i] = data[j + 1] / 255.0;  // G channel
    tensor[2 * pixels + i] = data[j + 2] / 255.0; // B channel
  }

  return { tensor, origWidth, origHeight, padX, padY, scale };
}

/**
 * Post-process YOLO output: decode boxes, apply NMS, filter by confidence.
 *
 * YOLOv8 output shape: [1, 4+NC, N] where N is number of candidate boxes.
 * Each column: [x_center, y_center, width, height, cls0_conf, cls1_conf, ...]
 *
 * @param {Float32Array} output — raw model output
 * @param {number[]} outputShape — [batch, features, candidates]
 * @param {object} preprocessInfo — { padX, padY, scale, origWidth, origHeight }
 * @param {object} thresholds — per-class confidence thresholds
 * @returns {Array<{class: number, className: string, confidence: number, bbox: number[], color: string}>}
 */
function postprocess(output, outputShape, preprocessInfo, thresholds = DEFAULT_THRESHOLDS) {
  const { padX, padY, scale, origWidth, origHeight } = preprocessInfo;
  const [, features, candidates] = outputShape;

  const detections = [];

  for (let i = 0; i < candidates; i++) {
    // Extract box coordinates (in 640x640 space)
    const cx = output[0 * candidates + i];
    const cy = output[1 * candidates + i];
    const w = output[2 * candidates + i];
    const h = output[3 * candidates + i];

    // Find best class
    let bestClass = 0;
    let bestConf = 0;
    for (let c = 0; c < NUM_CLASSES; c++) {
      const conf = output[(4 + c) * candidates + i];
      if (conf > bestConf) {
        bestConf = conf;
        bestClass = c;
      }
    }

    // Apply per-class threshold
    const className = CLASS_NAMES[bestClass];
    const threshold = thresholds[className] || 0.3;
    if (bestConf < threshold) continue;

    // Convert from 640x640 letterbox space to original image coordinates
    const x1 = (cx - w / 2 - padX) / scale;
    const y1 = (cy - h / 2 - padY) / scale;
    const x2 = (cx + w / 2 - padX) / scale;
    const y2 = (cy + h / 2 - padY) / scale;

    // Clamp to image bounds
    const bbox = [
      Math.max(0, Math.min(x1, origWidth)),
      Math.max(0, Math.min(y1, origHeight)),
      Math.max(0, Math.min(x2, origWidth)),
      Math.max(0, Math.min(y2, origHeight)),
    ];

    // Skip degenerate boxes
    if (bbox[2] - bbox[0] < 5 || bbox[3] - bbox[1] < 5) continue;

    detections.push({
      class: bestClass,
      className,
      confidence: bestConf,
      bbox,
      color: CLASS_COLORS[className],
    });
  }

  // Non-maximum suppression per class
  return nms(detections, NMS_IOU_THRESHOLD);
}

/**
 * Non-maximum suppression — remove overlapping detections.
 */
function nms(detections, iouThreshold) {
  // Group by class
  const byClass = {};
  for (const det of detections) {
    if (!byClass[det.class]) byClass[det.class] = [];
    byClass[det.class].push(det);
  }

  const result = [];

  for (const cls of Object.keys(byClass)) {
    const dets = byClass[cls].sort((a, b) => b.confidence - a.confidence);
    const keep = [];

    for (const det of dets) {
      let dominated = false;
      for (const kept of keep) {
        if (iou(det.bbox, kept.bbox) > iouThreshold) {
          dominated = true;
          break;
        }
      }
      if (!dominated) keep.push(det);
    }

    result.push(...keep);
  }

  return result;
}

/**
 * Intersection over Union of two bounding boxes [x1, y1, x2, y2].
 */
function iou(a, b) {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]);
  const y2 = Math.min(a[3], b[3]);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (intersection === 0) return 0;

  const areaA = (a[2] - a[0]) * (a[3] - a[1]);
  const areaB = (b[2] - b[0]) * (b[3] - b[1]);

  return intersection / (areaA + areaB - intersection);
}

// ── Main API ──

/**
 * Run YOLO detection on a drawing image.
 *
 * @param {string|HTMLImageElement|HTMLCanvasElement} imageSource — data URL, Image, or Canvas
 * @param {object} [options]
 * @param {object} [options.thresholds] — per-class confidence thresholds
 * @param {string[]} [options.classFilter] — only return these classes
 * @returns {Promise<{ detections: Detection[], inferenceMs: number, modelLoaded: boolean }>}
 */
export async function detectObjects(imageSource, options = {}) {
  const { thresholds = DEFAULT_THRESHOLDS, classFilter } = options;

  const t0 = performance.now();

  // Load model
  const session = await getSession();

  // Preprocess
  const ppInfo = await preprocess(imageSource);
  const inputTensor = new ort.Tensor("float32", ppInfo.tensor, [1, 3, INPUT_SIZE, INPUT_SIZE]);

  // Run inference
  const inputName = session.inputNames[0];
  const results = await session.run({ [inputName]: inputTensor });

  // Get output
  const outputName = session.outputNames[0];
  const outputTensor = results[outputName];
  const output = outputTensor.data;
  const outputShape = outputTensor.dims;

  // Post-process
  let detections = postprocess(output, outputShape, ppInfo, thresholds);

  // Optional class filter
  if (classFilter && classFilter.length > 0) {
    detections = detections.filter((d) => classFilter.includes(d.className));
  }

  const inferenceMs = Math.round(performance.now() - t0);
  console.log(`[yoloDetector] ${detections.length} detections in ${inferenceMs}ms`);

  return { detections, inferenceMs, modelLoaded: true, imgWidth: ppInfo.origWidth, imgHeight: ppInfo.origHeight };
}

/**
 * Detect only schedule tables on a drawing.
 * Convenience wrapper with lower threshold for high recall.
 *
 * @param {string} imageSource — data URL of the drawing
 * @returns {Promise<Detection[]>} — schedule table detections
 */
export async function detectScheduleTables(imageSource) {
  const { detections, imgWidth, imgHeight } = await detectObjects(imageSource, {
    classFilter: ["schedule_table"],
    thresholds: { ...DEFAULT_THRESHOLDS, schedule_table: 0.15 },
  });
  return { detections, imgWidth, imgHeight };
}

/**
 * Detect walls, doors, and windows on a floor plan.
 * Replaces the classical CV wallDetector for YOLO-capable drawings.
 *
 * @param {string} imageSource — data URL of the floor plan
 * @returns {Promise<{ walls: Detection[], doorsWindows: Detection[], fixtures: Detection[] }>}
 */
export async function detectFloorPlanElements(imageSource) {
  const { detections } = await detectObjects(imageSource, {
    classFilter: ["wall_linear", "door_window", "fixture"],
    thresholds: {
      wall_linear: 0.30,
      door_window: 0.25,
      fixture: 0.30,
    },
  });

  return {
    walls: detections.filter((d) => d.className === "wall_linear"),
    doorsWindows: detections.filter((d) => d.className === "door_window"),
    fixtures: detections.filter((d) => d.className === "fixture"),
  };
}

/**
 * Render detection overlays onto a canvas for visualization.
 *
 * @param {HTMLCanvasElement} canvas — canvas to draw on (should already have the base image)
 * @param {Detection[]} detections — detections to render
 * @param {object} [options]
 * @param {boolean} [options.showLabels=true] — show class name + confidence
 * @param {boolean} [options.showBoxes=true] — show bounding boxes
 * @param {number} [options.lineWidth=2] — box line width
 */
export function renderDetections(canvas, detections, options = {}) {
  const { showLabels = true, showBoxes = true, lineWidth = 2 } = options;
  const ctx = canvas.getContext("2d");

  for (const det of detections) {
    const [x1, y1, x2, y2] = det.bbox;
    const w = x2 - x1;
    const h = y2 - y1;

    if (showBoxes) {
      ctx.strokeStyle = det.color;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(x1, y1, w, h);

      // Semi-transparent fill
      ctx.fillStyle = det.color + "15";
      ctx.fillRect(x1, y1, w, h);
    }

    if (showLabels) {
      const label = `${det.className} ${(det.confidence * 100).toFixed(0)}%`;
      ctx.font = `${Math.max(12, Math.min(16, h * 0.15))}px monospace`;
      const metrics = ctx.measureText(label);
      const textH = 16;

      // Label background
      ctx.fillStyle = det.color;
      ctx.fillRect(x1, y1 - textH - 2, metrics.width + 6, textH + 2);

      // Label text
      ctx.fillStyle = "#000000";
      ctx.fillText(label, x1 + 3, y1 - 4);
    }
  }
}

// Export constants for external use
export { CLASS_NAMES, CLASS_COLORS, DEFAULT_THRESHOLDS, INPUT_SIZE };
