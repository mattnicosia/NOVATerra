import { describe, it, expect } from "vitest";

// templateMatcher.js relies heavily on Web Worker + DOM (Image, canvas, document.createElement).
// We test the pure algorithmic logic by reimplementing the key functions from WORKER_CODE
// that run inside the worker, since they can't be imported directly.

// ─── Reimplemented pure functions from WORKER_CODE ───────────────

function toGrayscale(rgba, w, h) {
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    gray[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  }
  return gray;
}

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

function buildIntegral(gray, w, h) {
  const intSum = new Float64Array(w * h);
  const intSq = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    let rowSum = 0,
      rowSqSum = 0;
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

function rectSum(integral, w, x1, y1, x2, y2) {
  const br = integral[y2 * w + x2];
  const tl = x1 > 0 && y1 > 0 ? integral[(y1 - 1) * w + (x1 - 1)] : 0;
  const tr = y1 > 0 ? integral[(y1 - 1) * w + x2] : 0;
  const bl = x1 > 0 ? integral[y2 * w + (x1 - 1)] : 0;
  return br - tr - bl + tl;
}

function nonMaxSuppression(matches, minSep) {
  matches.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const m of matches) {
    let tooClose = false;
    for (const k of kept) {
      const dx = m.x - k.x,
        dy = m.y - k.y;
      if (dx * dx + dy * dy < minSep * minSep) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) kept.push(m);
  }
  return kept;
}

// ─── extractTemplate bounds clamping ─────────────────────────────

function extractTemplateBounds(imgW, imgH, clickX, clickY, size) {
  const half = Math.floor(size / 2);
  const x = Math.max(0, Math.min(Math.round(clickX) - half, imgW - size));
  const y = Math.max(0, Math.min(Math.round(clickY) - half, imgH - size));
  return { x, y, width: size, height: size };
}

// ─── Tests ───────────────────────────────────────────────────────

describe("toGrayscale()", () => {
  it("converts pure red to ~76.245", () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255]);
    const gray = toGrayscale(rgba, 1, 1);
    expect(gray[0]).toBeCloseTo(0.299 * 255, 1);
  });

  it("converts pure green to ~149.685", () => {
    const rgba = new Uint8ClampedArray([0, 255, 0, 255]);
    const gray = toGrayscale(rgba, 1, 1);
    expect(gray[0]).toBeCloseTo(0.587 * 255, 1);
  });

  it("converts pure blue to ~29.07", () => {
    const rgba = new Uint8ClampedArray([0, 0, 255, 255]);
    const gray = toGrayscale(rgba, 1, 1);
    expect(gray[0]).toBeCloseTo(0.114 * 255, 1);
  });

  it("converts white to 255", () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255]);
    const gray = toGrayscale(rgba, 1, 1);
    expect(gray[0]).toBeCloseTo(255, 0);
  });

  it("converts black to 0", () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255]);
    const gray = toGrayscale(rgba, 1, 1);
    expect(gray[0]).toBe(0);
  });

  it("handles a 2x2 image", () => {
    const rgba = new Uint8ClampedArray([
      255,
      0,
      0,
      255, // red
      0,
      255,
      0,
      255, // green
      0,
      0,
      255,
      255, // blue
      255,
      255,
      255,
      255, // white
    ]);
    const gray = toGrayscale(rgba, 2, 2);
    expect(gray.length).toBe(4);
    expect(gray[3]).toBeCloseTo(255, 0); // white
  });
});

describe("stats()", () => {
  it("computes correct mean", () => {
    const arr = new Float32Array([10, 20, 30, 40, 50]);
    const s = stats(arr);
    expect(s.mean).toBe(30);
  });

  it("computes correct stdDev", () => {
    const arr = new Float32Array([10, 20, 30, 40, 50]);
    const s = stats(arr);
    // Variance = ((−20)²+(−10)²+0+10²+20²)/5 = (400+100+0+100+400)/5 = 200
    // stdDev = sqrt(200) ≈ 14.14
    expect(s.stdDev).toBeCloseTo(14.14, 1);
  });

  it("returns 0 stdDev for uniform array", () => {
    const arr = new Float32Array([42, 42, 42, 42]);
    const s = stats(arr);
    expect(s.mean).toBe(42);
    expect(s.stdDev).toBe(0);
  });

  it("handles single-element array", () => {
    const arr = new Float32Array([7]);
    const s = stats(arr);
    expect(s.mean).toBe(7);
    expect(s.stdDev).toBe(0);
  });
});

describe("buildIntegral() + rectSum()", () => {
  it("integral image sums match direct computation", () => {
    // 3x3 image where pixel = x + y*3 + 1 (1-indexed)
    const w = 3,
      h = 3;
    const gray = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const { intSum } = buildIntegral(gray, w, h);

    // Full image sum should be 1+2+...+9 = 45
    expect(rectSum(intSum, w, 0, 0, 2, 2)).toBe(45);

    // Top-left 2x2: 1+2+4+5 = 12
    expect(rectSum(intSum, w, 0, 0, 1, 1)).toBe(12);

    // Bottom-right 2x2: 5+6+8+9 = 28
    expect(rectSum(intSum, w, 1, 1, 2, 2)).toBe(28);

    // Single pixel top-left: 1
    expect(rectSum(intSum, w, 0, 0, 0, 0)).toBe(1);

    // Single pixel bottom-right: 9
    expect(rectSum(intSum, w, 2, 2, 2, 2)).toBe(9);
  });

  it("integral squared sums match direct computation", () => {
    const w = 2,
      h = 2;
    const gray = new Float32Array([1, 2, 3, 4]);
    const { intSq } = buildIntegral(gray, w, h);

    // Full sum of squares: 1+4+9+16 = 30
    expect(rectSum(intSq, w, 0, 0, 1, 1)).toBe(30);
  });
});

describe("nonMaxSuppression()", () => {
  it("keeps highest-scoring match when two are close", () => {
    const matches = [
      { x: 100, y: 100, score: 0.95 },
      { x: 105, y: 102, score: 0.9 }, // ~5.4px away
    ];
    const kept = nonMaxSuppression([...matches], 20);
    expect(kept.length).toBe(1);
    expect(kept[0].score).toBe(0.95);
  });

  it("keeps both when matches are far apart", () => {
    const matches = [
      { x: 100, y: 100, score: 0.95 },
      { x: 300, y: 300, score: 0.9 },
    ];
    const kept = nonMaxSuppression([...matches], 20);
    expect(kept.length).toBe(2);
  });

  it("returns empty for empty input", () => {
    expect(nonMaxSuppression([], 20)).toEqual([]);
  });

  it("handles single match", () => {
    const kept = nonMaxSuppression([{ x: 50, y: 50, score: 0.99 }], 20);
    expect(kept.length).toBe(1);
  });

  it("suppresses a cluster of nearby matches correctly", () => {
    const matches = [
      { x: 100, y: 100, score: 0.8 },
      { x: 102, y: 101, score: 0.85 },
      { x: 104, y: 100, score: 0.95 }, // highest
      { x: 103, y: 102, score: 0.9 },
    ];
    const kept = nonMaxSuppression([...matches], 20);
    expect(kept.length).toBe(1);
    expect(kept[0].score).toBe(0.95);
  });

  it("keeps matches in separate clusters", () => {
    const matches = [
      { x: 10, y: 10, score: 0.95 },
      { x: 12, y: 11, score: 0.9 }, // cluster 1
      { x: 200, y: 200, score: 0.92 },
      { x: 203, y: 201, score: 0.88 }, // cluster 2
    ];
    const kept = nonMaxSuppression([...matches], 20);
    expect(kept.length).toBe(2);
  });
});

describe("extractTemplate bounds clamping", () => {
  it("clamps to top-left corner", () => {
    const b = extractTemplateBounds(1000, 1000, 5, 5, 64);
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
  });

  it("clamps to bottom-right corner", () => {
    const b = extractTemplateBounds(1000, 1000, 995, 990, 64);
    expect(b.x).toBeLessThanOrEqual(1000 - 64);
    expect(b.y).toBeLessThanOrEqual(1000 - 64);
  });

  it("centers template around click in middle of image", () => {
    const b = extractTemplateBounds(1000, 1000, 500, 500, 64);
    expect(b.x).toBe(500 - 32);
    expect(b.y).toBe(500 - 32);
    expect(b.width).toBe(64);
    expect(b.height).toBe(64);
  });

  it("handles click exactly at edge", () => {
    const b = extractTemplateBounds(100, 100, 0, 0, 64);
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
  });

  it("handles very small image", () => {
    // Image is exactly template size
    const b = extractTemplateBounds(64, 64, 32, 32, 64);
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
  });
});
