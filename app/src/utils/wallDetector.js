// wallDetector.js — Classical CV wall detection from floor plan images
// Detects wall line segments from rendered PDF floor plans using:
// 1. Grayscale conversion + adaptive thresholding
// 2. Edge detection (Sobel operator)
// 3. Hough line transform
// 4. Wall filtering (length, parallelism, thickness clustering)
// 5. Pixel → feet conversion via calibration
//
// No external dependencies — pure canvas-based CV.

import { getPxPerFoot } from "@/utils/geometryBuilder";

// ── Configuration ──
const CONFIG = {
  // Edge detection
  sobelThreshold: 60,        // Higher threshold = only strong edges (thick lines)

  // Hough transform
  houghRhoStep: 1,           // Distance resolution in pixels
  houghThetaSteps: 180,      // Angle resolution (180 = 1° steps)
  houghThreshold: 0.20,      // Lower = more lines detected, filtered later

  // Line weight filtering (KEY for construction drawings)
  minLineWeightPx: 2.5,      // Minimum stroke width in pixels to be a wall
  // Walls: 2-6px, Dimensions/grids: 0.5-1.5px, Text: variable

  // Wall filtering
  minWallLengthFt: 4,        // Minimum wall length in feet (raised from 3)
  maxWallLengthFt: 120,      // Maximum wall length (lowered — skip sheet-spanning lines)
  wallThicknessRange: [0.3, 1.5], // Wall thickness range in feet
  mergeDistancePx: 10,       // Merge lines closer than this (pixels)
  mergeAngleDeg: 5,          // Merge lines within this angle difference

  // Parallel line clustering
  parallelAngleDeg: 3,       // Max angle diff to consider lines parallel
  parallelDistRange: [4, 25], // Min/max pixel distance for parallel wall edges (narrowed)

  // Title block exclusion (percentage of sheet to ignore from edges)
  titleBlockMargin: 0.08,    // Ignore 8% from each edge (title block, borders)
};

// ── Main export ──

/**
 * Detects wall segments from a floor plan image.
 * @param {string} imageDataUrl - Base64 data URL of the rendered floor plan
 * @param {string} drawingId - Drawing ID for calibration lookup
 * @param {object} options - Override config options
 * @returns {Promise<{walls: Array<{id, start, end, thickness}>, debugCanvas?: HTMLCanvasElement}>}
 */
export async function detectWalls(imageDataUrl, drawingId, options = {}) {
  const cfg = { ...CONFIG, ...options };
  const ppf = getPxPerFoot(drawingId);
  if (!ppf) {
    console.warn("[wallDetector] No calibration for drawing", drawingId);
    return { walls: [], error: "No calibration" };
  }

  // Load image
  const img = await loadImage(imageDataUrl);
  const { width, height } = img;

  console.log(`[wallDetector] Processing ${width}x${height} image, ppf=${ppf.toFixed(1)}`);

  // Create working canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  // Get pixel data
  const imageData = ctx.getImageData(0, 0, width, height);

  // Step 0: Define title block exclusion zone (ignore sheet borders)
  const margin = cfg.titleBlockMargin;
  const cropX1 = Math.floor(width * margin);
  const cropY1 = Math.floor(height * margin);
  const cropX2 = Math.floor(width * (1 - margin));
  const cropY2 = Math.floor(height * (1 - margin * 2.5)); // bottom has title block, crop more
  console.log(`[wallDetector] Crop zone: (${cropX1},${cropY1}) to (${cropX2},${cropY2})`);

  // Step 1: Grayscale
  const gray = toGrayscale(imageData);

  // Step 2: Measure line weights across the image
  // Walls have thick strokes (2-6px), dimensions/grids have thin strokes (0.5-1.5px)
  const lineWeights = measureLineWeights(gray, width, height);
  console.log(`[wallDetector] Line weight analysis: median=${lineWeights.median.toFixed(1)}px, p75=${lineWeights.p75.toFixed(1)}px`);

  // Step 3: Adaptive threshold — only keep THICK dark strokes
  // Use a stricter threshold that favors heavy line weights
  const binary = adaptiveThreshold(gray, width, height, 31, 8);

  // Step 3b: Erode thin lines (remove 1px strokes, keep 2px+ strokes)
  const eroded = erodeThickOnly(binary, width, height, cfg.minLineWeightPx);

  // Step 4: Sobel edge detection on thick-line-only image
  const edges = sobelEdges(eroded, width, height, cfg.sobelThreshold);

  // Step 4b: Zero out edges in title block zone
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < cropX1 || x > cropX2 || y < cropY1 || y > cropY2) {
        edges[y * width + x] = 0;
      }
    }
  }

  // Step 5: Hough line detection
  const lines = houghLines(edges, width, height, cfg);
  console.log(`[wallDetector] Hough detected ${lines.length} raw lines`);

  // Step 6: Merge similar lines
  const merged = mergeLines(lines, cfg);
  console.log(`[wallDetector] After merge: ${merged.length} lines`);

  // Step 7: Find parallel line pairs (wall edges)
  const wallCandidates = findParallelPairs(merged, cfg);
  console.log(`[wallDetector] Found ${wallCandidates.length} wall candidates`);

  // Step 7: Filter by length and convert to feet-space
  const walls = wallCandidates
    .map((w, i) => {
      const lengthPx = Math.sqrt(
        (w.end[0] - w.start[0]) ** 2 + (w.end[1] - w.start[1]) ** 2
      );
      const lengthFt = lengthPx / ppf;
      const thicknessFt = w.thicknessPx / ppf;

      if (lengthFt < cfg.minWallLengthFt || lengthFt > cfg.maxWallLengthFt) return null;
      if (thicknessFt < cfg.wallThicknessRange[0] || thicknessFt > cfg.wallThicknessRange[1]) return null;

      return {
        id: `detected-wall-${i}`,
        start: [w.start[0] / ppf, w.start[1] / ppf],
        end: [w.end[0] / ppf, w.end[1] / ppf],
        thickness: thicknessFt,
        confidence: w.confidence || 0.5,
        lengthFt,
        _pixelStart: w.start,
        _pixelEnd: w.end,
      };
    })
    .filter(Boolean);

  console.log(`[wallDetector] Final: ${walls.length} walls detected`);

  // Optional: render debug visualization
  const debugCanvas = renderDebug(img, lines, wallCandidates, walls, ppf);

  return { walls, debugCanvas, rawLineCount: lines.length };
}

// ── Image loading ──

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ── Grayscale conversion ──

function toGrayscale(imageData) {
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const j = i * 4;
    // Luminance formula
    gray[i] = Math.round(0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]);
  }
  return gray;
}

// ── Adaptive threshold ──
// Isolates dark lines (walls) on light background (paper)

function adaptiveThreshold(gray, width, height, blockSize = 31, C = 10) {
  const binary = new Uint8Array(width * height);
  const half = Math.floor(blockSize / 2);

  // Compute integral image for fast local mean
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] =
        rowSum + integral[y * (width + 1) + (x + 1)];
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - half);
      const y1 = Math.max(0, y - half);
      const x2 = Math.min(width - 1, x + half);
      const y2 = Math.min(height - 1, y + half);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);

      const sum =
        integral[(y2 + 1) * (width + 1) + (x2 + 1)] -
        integral[y1 * (width + 1) + (x2 + 1)] -
        integral[(y2 + 1) * (width + 1) + x1] +
        integral[y1 * (width + 1) + x1];

      const mean = sum / count;
      // Pixel is "dark" (wall) if significantly below local mean
      binary[y * width + x] = gray[y * width + x] < mean - C ? 255 : 0;
    }
  }

  return binary;
}

// ── Line weight measurement ──
// Samples horizontal and vertical cross-sections to measure stroke widths

function measureLineWeights(gray, width, height) {
  const weights = [];
  const sampleCount = 200;

  // Sample random rows for horizontal line weights
  for (let s = 0; s < sampleCount; s++) {
    const y = Math.floor(Math.random() * height);
    let inDark = false;
    let darkStart = 0;

    for (let x = 0; x < width; x++) {
      const dark = gray[y * width + x] < 128;
      if (dark && !inDark) {
        inDark = true;
        darkStart = x;
      } else if (!dark && inDark) {
        inDark = false;
        const w = x - darkStart;
        if (w >= 1 && w <= 20) weights.push(w);
      }
    }
  }

  // Sample random columns for vertical line weights
  for (let s = 0; s < sampleCount; s++) {
    const x = Math.floor(Math.random() * width);
    let inDark = false;
    let darkStart = 0;

    for (let y = 0; y < height; y++) {
      const dark = gray[y * width + x] < 128;
      if (dark && !inDark) {
        inDark = true;
        darkStart = y;
      } else if (!dark && inDark) {
        inDark = false;
        const w = y - darkStart;
        if (w >= 1 && w <= 20) weights.push(w);
      }
    }
  }

  weights.sort((a, b) => a - b);
  const median = weights[Math.floor(weights.length / 2)] || 1;
  const p75 = weights[Math.floor(weights.length * 0.75)] || 2;
  const p90 = weights[Math.floor(weights.length * 0.90)] || 3;

  return { median, p75, p90, count: weights.length };
}

// ── Erosion filter — remove thin strokes ──
// Only keeps dark pixels that have thick neighborhoods (wall-weight lines)

function erodeThickOnly(binary, width, height, minWeight) {
  const result = new Uint8Array(width * height);
  const radius = Math.max(1, Math.floor(minWeight / 2));

  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      if (binary[y * width + x] === 0) continue;

      // Check if this pixel has enough dark neighbors in a cross pattern
      // (indicates it's part of a thick stroke, not a thin line)
      let hCount = 0, vCount = 0;

      for (let dx = -radius; dx <= radius; dx++) {
        if (binary[y * width + (x + dx)] > 0) hCount++;
      }
      for (let dy = -radius; dy <= radius; dy++) {
        if (binary[(y + dy) * width + x] > 0) vCount++;
      }

      // Keep pixel if it's part of a thick horizontal OR vertical stroke
      if (hCount >= radius + 1 || vCount >= radius + 1) {
        result[y * width + x] = 255;
      }
    }
  }

  return result;
}

// ── Sobel edge detection ──

function sobelEdges(binary, width, height, threshold) {
  const edges = new Uint8Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      // Sobel kernels
      const gx =
        -binary[(y - 1) * width + (x - 1)] + binary[(y - 1) * width + (x + 1)] +
        -2 * binary[y * width + (x - 1)] + 2 * binary[y * width + (x + 1)] +
        -binary[(y + 1) * width + (x - 1)] + binary[(y + 1) * width + (x + 1)];

      const gy =
        -binary[(y - 1) * width + (x - 1)] - 2 * binary[(y - 1) * width + x] - binary[(y - 1) * width + (x + 1)] +
        binary[(y + 1) * width + (x - 1)] + 2 * binary[(y + 1) * width + x] + binary[(y + 1) * width + (x + 1)];

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[y * width + x] = magnitude > threshold ? 255 : 0;
    }
  }

  return edges;
}

// ── Hough line transform ──
// Returns lines as { rho, theta, votes, x1, y1, x2, y2 }

function houghLines(edges, width, height, cfg) {
  const { houghRhoStep, houghThetaSteps, houghThreshold } = cfg;
  const diagonal = Math.sqrt(width * width + height * height);
  const maxRho = Math.ceil(diagonal / houghRhoStep);
  const rhoOffset = maxRho; // shift so negative rho maps to positive index

  // Precompute sin/cos tables
  const sinTable = new Float64Array(houghThetaSteps);
  const cosTable = new Float64Array(houghThetaSteps);
  for (let t = 0; t < houghThetaSteps; t++) {
    const theta = (t / houghThetaSteps) * Math.PI;
    sinTable[t] = Math.sin(theta);
    cosTable[t] = Math.cos(theta);
  }

  // Accumulator
  const accW = 2 * maxRho + 1;
  const accumulator = new Int32Array(accW * houghThetaSteps);

  // Vote
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (edges[y * width + x] === 0) continue;
      for (let t = 0; t < houghThetaSteps; t++) {
        const rho = Math.round(x * cosTable[t] + y * sinTable[t]);
        const rhoIdx = rho + rhoOffset;
        accumulator[rhoIdx * houghThetaSteps + t]++;
      }
    }
  }

  // Find peaks above threshold
  const minVotes = Math.round(
    Math.min(width, height) * houghThreshold
  );
  const peaks = [];

  for (let r = 0; r < accW; r++) {
    for (let t = 0; t < houghThetaSteps; t++) {
      const votes = accumulator[r * houghThetaSteps + t];
      if (votes < minVotes) continue;

      // Non-maximum suppression (simple 3x3)
      let isMax = true;
      for (let dr = -1; dr <= 1 && isMax; dr++) {
        for (let dt = -1; dt <= 1 && isMax; dt++) {
          if (dr === 0 && dt === 0) continue;
          const nr = r + dr, nt = (t + dt + houghThetaSteps) % houghThetaSteps;
          if (nr >= 0 && nr < accW) {
            if (accumulator[nr * houghThetaSteps + nt] > votes) isMax = false;
          }
        }
      }

      if (isMax) {
        const rho = (r - rhoOffset) * houghRhoStep;
        const theta = (t / houghThetaSteps) * Math.PI;

        // Convert to segment endpoints (clip to image bounds)
        const { x1, y1, x2, y2 } = rhoThetaToSegment(rho, theta, width, height);
        peaks.push({ rho, theta, votes, x1, y1, x2, y2 });
      }
    }
  }

  // Sort by votes descending
  peaks.sort((a, b) => b.votes - a.votes);

  // Limit to top N to avoid overwhelming the merger
  return peaks.slice(0, 500);
}

function rhoThetaToSegment(rho, theta, width, height) {
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  // If line is more horizontal (theta near 0 or PI)
  if (Math.abs(sinT) > 0.001) {
    const x1 = 0;
    const y1 = (rho - x1 * cosT) / sinT;
    const x2 = width;
    const y2 = (rho - x2 * cosT) / sinT;
    return { x1, y1: Math.round(y1), x2, y2: Math.round(y2) };
  } else {
    const y1 = 0;
    const x1 = (rho - y1 * sinT) / cosT;
    const y2 = height;
    const x2 = (rho - y2 * sinT) / cosT;
    return { x1: Math.round(x1), y1, x2: Math.round(x2), y2 };
  }
}

// ── Line merging ──
// Merge lines that are very close in angle and position

function mergeLines(lines, cfg) {
  const { mergeDistancePx, mergeAngleDeg } = cfg;
  const angleThresh = (mergeAngleDeg * Math.PI) / 180;
  const used = new Set();
  const merged = [];

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;

    const group = [lines[i]];
    used.add(i);

    for (let j = i + 1; j < lines.length; j++) {
      if (used.has(j)) continue;

      const angleDiff = Math.abs(lines[i].theta - lines[j].theta);
      const rhoDiff = Math.abs(lines[i].rho - lines[j].rho);

      if (angleDiff < angleThresh && rhoDiff < mergeDistancePx) {
        group.push(lines[j]);
        used.add(j);
      }
    }

    // Average the group
    const avgRho = group.reduce((s, l) => s + l.rho, 0) / group.length;
    const avgTheta = group.reduce((s, l) => s + l.theta, 0) / group.length;
    const totalVotes = group.reduce((s, l) => s + l.votes, 0);

    const { x1, y1, x2, y2 } = rhoThetaToSegment(avgRho, avgTheta,
      Math.max(...group.map(l => Math.max(l.x1, l.x2))),
      Math.max(...group.map(l => Math.max(l.y1, l.y2)))
    );

    merged.push({ rho: avgRho, theta: avgTheta, votes: totalVotes, x1, y1, x2, y2 });
  }

  return merged;
}

// ── Parallel line pair detection ──
// Walls appear as two parallel lines (inner and outer edges)

function findParallelPairs(lines, cfg) {
  const { parallelAngleDeg, parallelDistRange } = cfg;
  const angleThresh = (parallelAngleDeg * Math.PI) / 180;
  const [minDist, maxDist] = parallelDistRange;
  const walls = [];
  const used = new Set();

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;

    let bestMatch = null;
    let bestDist = Infinity;

    for (let j = i + 1; j < lines.length; j++) {
      if (used.has(j)) continue;

      const angleDiff = Math.abs(lines[i].theta - lines[j].theta);
      if (angleDiff > angleThresh) continue;

      const dist = Math.abs(lines[i].rho - lines[j].rho);
      if (dist < minDist || dist > maxDist) continue;

      if (dist < bestDist) {
        bestDist = dist;
        bestMatch = j;
      }
    }

    if (bestMatch !== null) {
      used.add(i);
      used.add(bestMatch);

      const l1 = lines[i];
      const l2 = lines[bestMatch];

      // Wall centerline = average of the two parallel lines
      const avgRho = (l1.rho + l2.rho) / 2;
      const avgTheta = (l1.theta + l2.theta) / 2;
      const thicknessPx = Math.abs(l1.rho - l2.rho);

      // Use the longer line's extent
      const len1 = Math.sqrt((l1.x2 - l1.x1) ** 2 + (l1.y2 - l1.y1) ** 2);
      const len2 = Math.sqrt((l2.x2 - l2.x1) ** 2 + (l2.y2 - l2.y1) ** 2);
      const longer = len1 > len2 ? l1 : l2;

      walls.push({
        start: [longer.x1, longer.y1],
        end: [longer.x2, longer.y2],
        thicknessPx,
        confidence: (l1.votes + l2.votes) / (2 * Math.max(l1.votes, l2.votes)),
      });
    }
  }

  // Also add strong single lines as potential walls (interior partitions
  // may only show one edge due to line weight)
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    if (lines[i].votes > lines[0].votes * 0.5) { // strong line
      walls.push({
        start: [lines[i].x1, lines[i].y1],
        end: [lines[i].x2, lines[i].y2],
        thicknessPx: 6, // assume ~6px default wall thickness
        confidence: 0.3, // lower confidence for single-line walls
      });
    }
  }

  return walls;
}

// ── Debug visualization ──

function renderDebug(img, rawLines, wallCandidates, walls, ppf) {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");

  // Draw original image faded
  ctx.globalAlpha = 0.3;
  ctx.drawImage(img, 0, 0);
  ctx.globalAlpha = 1;

  // Draw raw Hough lines (thin, gray)
  ctx.strokeStyle = "rgba(100,100,100,0.2)";
  ctx.lineWidth = 1;
  for (const l of rawLines) {
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();
  }

  // Draw detected walls (thick, colored by confidence)
  for (const w of walls) {
    const [x1, y1] = w._pixelStart || w.start.map(v => v * ppf);
    const [x2, y2] = w._pixelEnd || w.end.map(v => v * ppf);

    ctx.strokeStyle = w.confidence > 0.5 ? "#00FF00" : "#FFAA00";
    ctx.lineWidth = Math.max(2, w.thickness * ppf);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Label count
  ctx.fillStyle = "#00FF00";
  ctx.font = "16px monospace";
  ctx.fillText(`${walls.length} walls detected`, 10, 20);

  return canvas;
}
