// ═══════════════════════════════════════════════════════════════════════════════
// Template Matcher — Click One, Find All
// Captures a pixel template around a user's click, then sweeps the full drawing
// using Normalized Cross-Correlation (NCC) to find all matching instances.
// Zero API calls. Works offline. Runs in a Web Worker for performance.
// ═══════════════════════════════════════════════════════════════════════════════

import { uid } from "@/utils/format";

// ── Web Worker code (inlined as string → Blob URL) ──────────────────────────
const WORKER_CODE = `
"use strict";

// Convert RGBA Uint8ClampedArray to grayscale Float32Array
function toGrayscale(rgba, w, h) {
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    gray[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  }
  return gray;
}

// Compute mean & stdDev for a Float32Array
function stats(arr) {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  const mean = sum / arr.length;
  let sqSum = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - mean;
    sqSum += d * d;
  }
  return { mean, stdDev: Math.sqrt(sqSum / arr.length) };
}

// Build integral image + integral of squares for O(1) rect mean/variance
function buildIntegral(gray, w, h) {
  const intSum = new Float64Array(w * h);
  const intSq = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    let rowSum = 0, rowSqSum = 0;
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const v = gray[idx];
      rowSum += v;
      rowSqSum += v * v;
      intSum[idx] = rowSum + (y > 0 ? intSum[(y - 1) * w + x] : 0);
      intSq[idx] = rowSqSum + (y > 0 ? intSq[(y - 1) * w + x] : 0);
    }
  }
  return { intSum, intSq };
}

// Get rect sum from integral image (inclusive corners: x1,y1 to x2,y2)
function rectSum(integral, w, x1, y1, x2, y2) {
  const br = integral[y2 * w + x2];
  const tl = (x1 > 0 && y1 > 0) ? integral[(y1 - 1) * w + (x1 - 1)] : 0;
  const tr = (y1 > 0) ? integral[(y1 - 1) * w + x2] : 0;
  const bl = (x1 > 0) ? integral[y2 * w + (x1 - 1)] : 0;
  return br - tr - bl + tl;
}

// NCC sweep with two-pass: coarse then fine
function nccSweep(imgGray, imgW, imgH, intSum, intSq, tmplGray, tmplW, tmplH, tmplMean, tmplStdDev, threshold, step) {
  const tmplN = tmplW * tmplH;
  const matches = [];

  // Pre-compute template deviations from mean
  const tmplDev = new Float32Array(tmplN);
  for (let i = 0; i < tmplN; i++) tmplDev[i] = tmplGray[i] - tmplMean;

  const maxSx = imgW - tmplW;
  const maxSy = imgH - tmplH;

  for (let sy = 0; sy <= maxSy; sy += step) {
    for (let sx = 0; sx <= maxSx; sx += step) {
      // O(1) local mean & stdDev via integral images
      const x2 = sx + tmplW - 1, y2 = sy + tmplH - 1;
      const localSum = rectSum(intSum, imgW, sx, sy, x2, y2);
      const localSqSum = rectSum(intSq, imgW, sx, sy, x2, y2);
      const localMean = localSum / tmplN;
      const localVar = (localSqSum / tmplN) - (localMean * localMean);
      if (localVar < 25) continue; // skip uniform regions (stdDev < 5)
      const localStdDev = Math.sqrt(localVar);

      // NCC numerator (this is the expensive part)
      let nccNum = 0;
      for (let ty = 0; ty < tmplH; ty++) {
        const imgRow = (sy + ty) * imgW + sx;
        const tmplRow = ty * tmplW;
        for (let tx = 0; tx < tmplW; tx++) {
          nccNum += tmplDev[tmplRow + tx] * (imgGray[imgRow + tx] - localMean);
        }
      }

      const ncc = nccNum / (tmplN * tmplStdDev * localStdDev);
      if (ncc >= threshold) {
        matches.push({ x: sx + tmplW / 2, y: sy + tmplH / 2, score: ncc });
      }
    }
  }

  return matches;
}

// Non-max suppression: keep highest-scoring match within each neighborhood
function nonMaxSuppression(matches, minSep) {
  matches.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const m of matches) {
    let tooClose = false;
    for (const k of kept) {
      const dx = m.x - k.x, dy = m.y - k.y;
      if (dx * dx + dy * dy < minSep * minSep) { tooClose = true; break; }
    }
    if (!tooClose) kept.push(m);
  }
  return kept;
}

self.onmessage = function(e) {
  const { imgRGBA, imgW, imgH, tmplRGBA, tmplW, tmplH, threshold, step, minSeparation, excludePoints, excludeRadius } = e.data;

  try {
    // Convert to grayscale
    const imgGray = toGrayscale(new Uint8ClampedArray(imgRGBA), imgW, imgH);
    const tmplGray = toGrayscale(new Uint8ClampedArray(tmplRGBA), tmplW, tmplH);

    // Template stats
    const tmplStats = stats(tmplGray);
    if (tmplStats.stdDev < 5) {
      self.postMessage({ matches: [], reason: "uniform-template" });
      return;
    }

    // Build integral images
    const { intSum, intSq } = buildIntegral(imgGray, imgW, imgH);

    // Two-pass NCC: coarse scan → fine refinement
    const coarseStep = Math.max(step, 4);
    let coarseMatches = nccSweep(imgGray, imgW, imgH, intSum, intSq, tmplGray, tmplW, tmplH, tmplStats.mean, tmplStats.stdDev, threshold * 0.95, coarseStep);

    // Fine pass: re-scan neighborhoods of coarse matches at step=1
    let fineMatches = [];
    const visited = new Set();
    for (const cm of coarseMatches) {
      const rx1 = Math.max(0, Math.round(cm.x - tmplW / 2 - coarseStep * 2));
      const ry1 = Math.max(0, Math.round(cm.y - tmplH / 2 - coarseStep * 2));
      const rx2 = Math.min(imgW - tmplW, Math.round(cm.x - tmplW / 2 + coarseStep * 2));
      const ry2 = Math.min(imgH - tmplH, Math.round(cm.y - tmplH / 2 + coarseStep * 2));
      for (let sy = ry1; sy <= ry2; sy++) {
        for (let sx = rx1; sx <= rx2; sx++) {
          const key = sy * imgW + sx;
          if (visited.has(key)) continue;
          visited.add(key);
          const x2 = sx + tmplW - 1, y2 = sy + tmplH - 1;
          if (x2 >= imgW || y2 >= imgH) continue;
          const localSum = rectSum(intSum, imgW, sx, sy, x2, y2);
          const localSqSum = rectSum(intSq, imgW, sx, sy, x2, y2);
          const tmplN = tmplW * tmplH;
          const localMean = localSum / tmplN;
          const localVar = (localSqSum / tmplN) - (localMean * localMean);
          if (localVar < 25) continue;
          const localStdDev = Math.sqrt(localVar);
          let nccNum = 0;
          for (let ty = 0; ty < tmplH; ty++) {
            const imgRow = (sy + ty) * imgW + sx;
            const tmplRow = ty * tmplW;
            for (let tx = 0; tx < tmplW; tx++) {
              nccNum += (tmplGray[tmplRow + tx] - tmplStats.mean) * (imgGray[imgRow + tx] - localMean);
            }
          }
          const ncc = nccNum / (tmplN * tmplStats.stdDev * localStdDev);
          if (ncc >= threshold) {
            fineMatches.push({ x: sx + tmplW / 2, y: sy + tmplH / 2, score: ncc });
          }
        }
      }
    }

    // Merge coarse + fine, deduplicate via NMS
    let allMatches = [...coarseMatches.filter(m => m.score >= threshold), ...fineMatches];
    allMatches = nonMaxSuppression(allMatches, minSeparation);

    // Exclude points near existing measurements
    if (excludePoints && excludePoints.length > 0) {
      const er2 = excludeRadius * excludeRadius;
      allMatches = allMatches.filter(m => {
        for (const ep of excludePoints) {
          const dx = m.x - ep.x, dy = m.y - ep.y;
          if (dx * dx + dy * dy < er2) return false;
        }
        return true;
      });
    }

    self.postMessage({ matches: allMatches });
  } catch (err) {
    self.postMessage({ matches: [], error: err.message });
  }
};
`;

// ── Worker lifecycle ─────────────────────────────────────────────────────────
let _worker = null;
let _workerTimeout = null;

function getWorker() {
  if (_worker) {
    clearTimeout(_workerTimeout);
  } else {
    const blob = new Blob([WORKER_CODE], { type: "application/javascript" });
    _worker = new Worker(URL.createObjectURL(blob));
  }
  // Auto-terminate after 30s of inactivity
  _workerTimeout = setTimeout(() => {
    if (_worker) {
      _worker.terminate();
      _worker = null;
    }
  }, 30000);
  return _worker;
}

// ── Load image to offscreen canvas and extract ImageData ─────────────────────
function loadImageData(imageSource) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height);
      resolve({ imageData: data, width: img.width, height: img.height });
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageSource;
  });
}

// ── Capture template around a click point ────────────────────────────────────
function extractTemplate(imageData, imgW, imgH, clickX, clickY, size) {
  const half = Math.floor(size / 2);
  const x = Math.max(0, Math.min(Math.round(clickX) - half, imgW - size));
  const y = Math.max(0, Math.min(Math.round(clickY) - half, imgH - size));

  // Extract sub-rect from ImageData
  const canvas = document.createElement("canvas");
  canvas.width = imgW;
  canvas.height = imgH;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(imageData, 0, 0);
  const tmplData = ctx.getImageData(x, y, size, size);

  return { imageData: tmplData, x, y, width: size, height: size };
}

// ── Public API: smartCountFromClick ──────────────────────────────────────────
/**
 * Click one instance, find all matching instances on the drawing.
 * @param {string} imageSource — data URL of the rendered drawing
 * @param {{x:number, y:number}} clickPoint — click position in image pixels
 * @param {{x:number, y:number}[]} existingPoints — already-placed measurements to exclude
 * @param {object} options
 * @returns {Promise<{predictions: Array, stats: object}>}
 */
export async function smartCountFromClick(imageSource, clickPoint, existingPoints = [], options = {}) {
  const {
    templateSize = 64,
    threshold = 0.88,
    step = 2,
    minSeparation = 30,
    excludeRadius = 25,
    tag = "item",
    drawingId = "",
  } = options;

  const t0 = performance.now();

  // Load full image
  const { imageData, width, height } = await loadImageData(imageSource);

  // Extract template around click
  const template = extractTemplate(imageData, width, height, clickPoint.x, clickPoint.y, templateSize);

  // Check if template is too uniform (clicked on blank space)
  const tmplPixels = template.imageData.data;
  let graySum = 0,
    graySqSum = 0;
  const tmplN = templateSize * templateSize;
  for (let i = 0; i < tmplN; i++) {
    const g = 0.299 * tmplPixels[i * 4] + 0.587 * tmplPixels[i * 4 + 1] + 0.114 * tmplPixels[i * 4 + 2];
    graySum += g;
    graySqSum += g * g;
  }
  const tmplMean = graySum / tmplN;
  const tmplStdDev = Math.sqrt(graySqSum / tmplN - tmplMean * tmplMean);

  if (tmplStdDev < 8) {
    return {
      predictions: [],
      stats: { scanTime: performance.now() - t0, reason: "uniform-template", matchesFound: 0 },
    };
  }

  // Include click point itself in exclusions
  const allExclusions = [clickPoint, ...existingPoints];

  // Run NCC in Web Worker
  const worker = getWorker();
  const matches = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Template match timeout")), 10000);
    worker.onmessage = e => {
      clearTimeout(timeout);
      resolve(e.data.matches || []);
    };
    worker.onerror = err => {
      clearTimeout(timeout);
      reject(err);
    };

    // Transfer pixel data to worker (copies, but fast)
    worker.postMessage({
      imgRGBA: imageData.data.buffer.slice(0),
      imgW: width,
      imgH: height,
      tmplRGBA: template.imageData.data.buffer.slice(0),
      tmplW: templateSize,
      tmplH: templateSize,
      threshold,
      step,
      minSeparation,
      excludePoints: allExclusions,
      excludeRadius,
    });
  });

  const scanTime = performance.now() - t0;

  // Convert matches to prediction objects
  const predictions = matches.map((m, _i) => ({
    id: `tpl-${drawingId}-${uid()}`,
    type: "count",
    point: { x: m.x, y: m.y },
    tag,
    label: tag,
    confidence: m.score,
    source: "template",
  }));

  return {
    predictions,
    stats: {
      scanTime: Math.round(scanTime),
      matchesFound: predictions.length,
      templateSize,
      threshold,
      imageSize: `${width}x${height}`,
    },
  };
}
