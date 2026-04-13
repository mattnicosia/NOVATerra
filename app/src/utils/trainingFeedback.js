// trainingFeedback.js — Active learning feedback loop
// ════════════════════════════════════════════════════
//
// Captures user corrections to YOLO detections and exports them
// as YOLO-format training data for model retraining.
//
// Flow:
//   1. YOLO detects elements on a drawing → shows bounding boxes
//   2. User corrects: moves boxes, adds missed ones, removes false positives
//   3. Corrections stored in IndexedDB via correctionStore
//   4. Export function generates YOLO label files + images for retraining
//   5. Run prepare_and_train.py with the expanded dataset
//
// This creates a self-improving loop:
//   Deploy model → Users correct → Export corrections → Retrain → Deploy better model

import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";

const DB_NAME = "nova-training-feedback";
const DB_VERSION = 1;
const STORE_NAME = "corrections";

const CLASS_NAMES = [
  "schedule_table",
  "wall_linear",
  "floor_area",
  "door_window",
  "fixture",
  "annotation",
];

// ── IndexedDB for corrections ──

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("drawingId", "drawingId", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("exported", "exported", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Record a user correction to a YOLO detection.
 *
 * @param {object} correction
 * @param {string} correction.drawingId — which drawing
 * @param {string} correction.action — "add" | "remove" | "move" | "reclassify"
 * @param {number} correction.classId — class index (0-5)
 * @param {number[]} correction.bbox — [x1, y1, x2, y2] in pixel coords
 * @param {number[]} [correction.originalBbox] — original bbox before move
 * @param {number} [correction.originalClassId] — original class before reclassify
 * @param {number} correction.imageWidth — image width in pixels
 * @param {number} correction.imageHeight — image height in pixels
 */
export async function recordCorrection(correction) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const record = {
    id: `${correction.drawingId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...correction,
    timestamp: Date.now(),
    exported: false,
  };

  await new Promise((resolve, reject) => {
    const req = store.put(record);
    req.onsuccess = resolve;
    req.onerror = reject;
  });

  console.log(
    `[trainingFeedback] Recorded ${correction.action}: ${CLASS_NAMES[correction.classId]} on ${correction.drawingId.slice(0, 8)}`
  );
}

/**
 * Record that a YOLO detection was confirmed correct (positive feedback).
 * This strengthens the model's confidence in similar detections.
 */
export async function confirmDetection(drawingId, classId, bbox, imageWidth, imageHeight) {
  return recordCorrection({
    drawingId,
    action: "confirm",
    classId,
    bbox,
    imageWidth,
    imageHeight,
  });
}

/**
 * Record a missed detection (user adds a box the model missed).
 */
export async function addMissedDetection(drawingId, classId, bbox, imageWidth, imageHeight) {
  return recordCorrection({
    drawingId,
    action: "add",
    classId,
    bbox,
    imageWidth,
    imageHeight,
  });
}

/**
 * Record a false positive (user removes an incorrect detection).
 */
export async function removeFalsePositive(drawingId, classId, bbox, imageWidth, imageHeight) {
  return recordCorrection({
    drawingId,
    action: "remove",
    classId,
    bbox,
    imageWidth,
    imageHeight,
  });
}

/**
 * Get all unexported corrections.
 */
export async function getUnexportedCorrections() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const index = store.index("exported");

  return new Promise((resolve, reject) => {
    const req = index.getAll(false);
    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}

/**
 * Get correction statistics.
 */
export async function getCorrectionStats() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result;
      const stats = {
        total: all.length,
        unexported: all.filter((r) => !r.exported).length,
        byAction: {},
        byClass: {},
        drawings: new Set(all.map((r) => r.drawingId)).size,
      };

      for (const r of all) {
        stats.byAction[r.action] = (stats.byAction[r.action] || 0) + 1;
        const className = CLASS_NAMES[r.classId] || "unknown";
        stats.byClass[className] = (stats.byClass[className] || 0) + 1;
      }

      resolve(stats);
    };
    req.onerror = reject;
  });
}

/**
 * Export corrections as YOLO training data.
 * Generates label files that can be added to training/dataset/train/labels/
 *
 * Returns an object with:
 *   - labels: Map<drawingId, string> — YOLO label file contents
 *   - images: Map<drawingId, string> — base64 image data for each drawing
 *   - summary: { total, byClass, byAction }
 *
 * After export, marks corrections as exported in IDB.
 */
export async function exportTrainingData() {
  const corrections = await getUnexportedCorrections();
  if (corrections.length === 0) {
    return { labels: new Map(), images: new Map(), summary: { total: 0 } };
  }

  // Group corrections by drawing
  const byDrawing = {};
  for (const corr of corrections) {
    if (!byDrawing[corr.drawingId]) byDrawing[corr.drawingId] = [];
    byDrawing[corr.drawingId].push(corr);
  }

  const labels = new Map();
  const images = new Map();
  const summary = { total: corrections.length, byClass: {}, byAction: {} };

  for (const [drawingId, drawingCorrections] of Object.entries(byDrawing)) {
    // Get the drawing's current image
    const { drawings, pdfCanvases } = useDrawingPipelineStore.getState();
    const drawing = drawings.find((d) => d.id === drawingId);
    if (!drawing) continue;

    const imgData = pdfCanvases[drawingId] || drawing.data;
    if (imgData) images.set(drawingId, imgData);

    // Build YOLO label lines from corrections
    const yoloLines = [];

    for (const corr of drawingCorrections) {
      // Track stats
      const className = CLASS_NAMES[corr.classId] || "unknown";
      summary.byClass[className] = (summary.byClass[className] || 0) + 1;
      summary.byAction[corr.action] = (summary.byAction[corr.action] || 0) + 1;

      // Only "add", "confirm", and "move" produce labels
      // "remove" means don't include that detection
      if (corr.action === "remove") continue;

      const bbox = corr.action === "move" && corr.bbox ? corr.bbox : corr.bbox;
      if (!bbox || bbox.length !== 4) continue;

      const [x1, y1, x2, y2] = bbox;
      const w = x2 - x1;
      const h = y2 - y1;
      if (w < 5 || h < 5) continue;

      // Convert to YOLO format (normalized center + size)
      const xCenter = (x1 + x2) / 2 / corr.imageWidth;
      const yCenter = (y1 + y2) / 2 / corr.imageHeight;
      const normW = w / corr.imageWidth;
      const normH = h / corr.imageHeight;

      yoloLines.push(`${corr.classId} ${xCenter.toFixed(6)} ${yCenter.toFixed(6)} ${normW.toFixed(6)} ${normH.toFixed(6)}`);
    }

    if (yoloLines.length > 0) {
      labels.set(drawingId, yoloLines.join("\n") + "\n");
    }
  }

  // Mark all as exported
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const corr of corrections) {
    corr.exported = true;
    store.put(corr);
  }

  console.log(
    `[trainingFeedback] Exported ${corrections.length} corrections across ${Object.keys(byDrawing).length} drawings`
  );

  return { labels, images, summary };
}

/**
 * Download exported training data as a ZIP-compatible bundle.
 * Creates files that can be placed directly into training/dataset/train/
 */
export async function downloadTrainingBundle() {
  const { labels, images, summary } = await exportTrainingData();

  if (labels.size === 0) {
    console.log("[trainingFeedback] No corrections to export");
    return null;
  }

  // Create a simple downloadable text manifest
  const manifest = {
    exported: new Date().toISOString(),
    corrections: summary.total,
    drawings: labels.size,
    byClass: summary.byClass,
    byAction: summary.byAction,
    files: [],
  };

  // For each drawing, create label content
  const allContent = [];
  let idx = 0;
  for (const [drawingId, labelContent] of labels) {
    const filename = `feedback_${drawingId.slice(0, 12)}_${idx}`;
    manifest.files.push({
      label: `${filename}.txt`,
      image: `${filename}.jpg`,
      drawingId,
    });
    allContent.push(`=== ${filename}.txt ===\n${labelContent}`);
    idx++;
  }

  // Download as a text file (user can split into individual files)
  const blob = new Blob(
    [
      `NOVATerra Training Feedback Export\n`,
      `${"=".repeat(40)}\n`,
      `${JSON.stringify(manifest, null, 2)}\n\n`,
      ...allContent.map((c) => `\n${c}`),
    ],
    { type: "text/plain" }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nova-training-feedback-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);

  return manifest;
}
