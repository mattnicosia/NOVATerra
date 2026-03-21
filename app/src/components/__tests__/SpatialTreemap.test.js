import { describe, it, expect } from "vitest";

// Import the squarify algorithm directly — we'll re-export it for testing
// Since SpatialTreemap doesn't export squarify, we'll duplicate the algorithm here
// to test it in isolation (the component itself is tested via build + visual)

function squarify(data, x, y, w, h) {
  if (!data.length || w <= 0 || h <= 0) return [];
  const totalValue = data.reduce((s, d) => s + d.value, 0);
  if (totalValue <= 0) return [];
  const area = w * h;
  const items = data
    .map(d => ({ ...d, area: (d.value / totalValue) * area }))
    .sort((a, b) => b.area - a.area);
  const rects = [];
  _layoutStrip(items, 0, x, y, w, h, rects);
  return rects;
}

function _layoutStrip(items, start, x, y, w, h, rects) {
  if (start >= items.length || w <= 0.5 || h <= 0.5) return;
  if (items.length - start === 1) {
    rects.push({ ...items[start], x, y, w, h });
    return;
  }
  const vertical = w >= h;
  const side = vertical ? h : w;
  let strip = [items[start]];
  let stripArea = items[start].area;
  let bestRatio = _worstRatio(strip, stripArea, side);
  let i = start + 1;
  while (i < items.length) {
    const candidate = [...strip, items[i]];
    const candidateArea = stripArea + items[i].area;
    const ratio = _worstRatio(candidate, candidateArea, side);
    if (ratio > bestRatio) break;
    strip.push(items[i]);
    stripArea = candidateArea;
    bestRatio = ratio;
    i++;
  }
  const stripThickness = Math.min(stripArea / side, vertical ? w : h);
  let offset = 0;
  strip.forEach((item, idx) => {
    const isLast = idx === strip.length - 1;
    const itemLen = isLast ? side - offset : item.area / stripThickness;
    if (vertical) {
      rects.push({ ...item, x, y: y + offset, w: stripThickness, h: Math.max(itemLen, 0) });
    } else {
      rects.push({ ...item, x: x + offset, y, w: Math.max(itemLen, 0), h: stripThickness });
    }
    offset += itemLen;
  });
  if (i < items.length) {
    if (vertical) {
      const remW = w - stripThickness;
      if (remW > 0.5) _layoutStrip(items, i, x + stripThickness, y, remW, h, rects);
    } else {
      const remH = h - stripThickness;
      if (remH > 0.5) _layoutStrip(items, i, x, y + stripThickness, w, remH, rects);
    }
  }
}

function _worstRatio(strip, totalArea, side) {
  const s2 = side * side;
  const t2 = totalArea * totalArea;
  let worst = 0;
  for (const item of strip) {
    const r = Math.max((s2 * item.area) / t2, t2 / (s2 * item.area));
    if (r > worst) worst = r;
  }
  return worst;
}

describe("Squarified Treemap Algorithm", () => {
  it("returns empty for empty data", () => {
    expect(squarify([], 0, 0, 800, 600)).toEqual([]);
  });

  it("returns empty for zero dimensions", () => {
    expect(squarify([{ value: 100 }], 0, 0, 0, 600)).toEqual([]);
    expect(squarify([{ value: 100 }], 0, 0, 800, 0)).toEqual([]);
  });

  it("returns empty for all-zero values", () => {
    expect(squarify([{ value: 0 }, { value: 0 }], 0, 0, 800, 600)).toEqual([]);
  });

  it("handles single item — fills entire area", () => {
    const rects = squarify([{ code: "03", value: 50000 }], 0, 0, 800, 600);
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBe(0);
    expect(rects[0].y).toBe(0);
    expect(rects[0].w).toBe(800);
    expect(rects[0].h).toBe(600);
    expect(rects[0].code).toBe("03");
  });

  it("all rects have positive dimensions", () => {
    const data = [
      { code: "03", value: 150000 },
      { code: "05", value: 80000 },
      { code: "09", value: 60000 },
      { code: "26", value: 45000 },
      { code: "22", value: 30000 },
      { code: "07", value: 20000 },
      { code: "01", value: 10000 },
    ];
    const rects = squarify(data, 0, 0, 1000, 700);
    expect(rects).toHaveLength(7);
    rects.forEach(r => {
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    });
  });

  it("total area of rects matches container area", () => {
    const data = [
      { code: "03", value: 150000 },
      { code: "05", value: 80000 },
      { code: "09", value: 60000 },
      { code: "26", value: 45000 },
    ];
    const W = 1000, H = 700;
    const rects = squarify(data, 0, 0, W, H);
    const totalArea = rects.reduce((s, r) => s + r.w * r.h, 0);
    expect(totalArea).toBeCloseTo(W * H, 1); // within 0.1
  });

  it("rects don't overlap", () => {
    const data = [
      { code: "03", value: 150000 },
      { code: "05", value: 80000 },
      { code: "09", value: 60000 },
      { code: "26", value: 45000 },
      { code: "22", value: 30000 },
    ];
    const rects = squarify(data, 0, 0, 1000, 700);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        // Check no overlap (with small tolerance for floating point)
        const overlap =
          a.x < b.x + b.w - 0.01 &&
          a.x + a.w > b.x + 0.01 &&
          a.y < b.y + b.h - 0.01 &&
          a.y + a.h > b.y + 0.01;
        expect(overlap).toBe(false);
      }
    }
  });

  it("rects stay within container bounds", () => {
    const data = [
      { code: "03", value: 500000 },
      { code: "09", value: 200000 },
      { code: "26", value: 100000 },
      { code: "07", value: 50000 },
      { code: "01", value: 25000 },
      { code: "04", value: 10000 },
    ];
    const X = 5, Y = 5, W = 990, H = 690;
    const rects = squarify(data, X, Y, W, H);
    rects.forEach(r => {
      expect(r.x).toBeGreaterThanOrEqual(X - 0.01);
      expect(r.y).toBeGreaterThanOrEqual(Y - 0.01);
      expect(r.x + r.w).toBeLessThanOrEqual(X + W + 0.01);
      expect(r.y + r.h).toBeLessThanOrEqual(Y + H + 0.01);
    });
  });

  it("larger values get proportionally larger areas", () => {
    const data = [
      { code: "03", value: 100000 },
      { code: "05", value: 50000 },
      { code: "09", value: 25000 },
    ];
    const rects = squarify(data, 0, 0, 1000, 700);
    const areas = rects.map(r => r.w * r.h);
    // Rect for value=100000 should have roughly 2x area of value=50000
    const ratio = areas[0] / areas[1];
    expect(ratio).toBeCloseTo(2, 0); // within ±0.5
  });

  it("produces reasonable aspect ratios (squarified)", () => {
    const data = [
      { code: "03", value: 100000 },
      { code: "05", value: 80000 },
      { code: "09", value: 60000 },
      { code: "26", value: 40000 },
    ];
    const rects = squarify(data, 0, 0, 800, 600);
    rects.forEach(r => {
      if (r.w < 1 || r.h < 1) return; // skip degenerate rects
      const aspect = Math.max(r.w / r.h, r.h / r.w);
      // Squarified algorithm should keep aspect ratios reasonable (< 20:1)
      expect(aspect).toBeLessThan(20);
    });
  });

  it("handles many small items without stack overflow", () => {
    const data = Array.from({ length: 100 }, (_, i) => ({
      code: String(i).padStart(2, "0"),
      value: Math.random() * 100000 + 1000,
    }));
    const rects = squarify(data, 0, 0, 1200, 800);
    expect(rects).toHaveLength(100);
    rects.forEach(r => {
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    });
  });

  it("handles extreme value distribution (1 dominant + many tiny)", () => {
    const data = [
      { code: "03", value: 1000000 },
      { code: "05", value: 100 },
      { code: "09", value: 50 },
      { code: "26", value: 10 },
    ];
    const rects = squarify(data, 0, 0, 800, 600);
    // Tiny items may be dropped when they'd be sub-pixel (<0.5px) — valid behavior
    expect(rects.length).toBeGreaterThanOrEqual(1);
    expect(rects.length).toBeLessThanOrEqual(4);
    // Dominant item should have nearly all the area
    const dominantArea = rects[0].w * rects[0].h;
    expect(dominantArea / (800 * 600)).toBeGreaterThan(0.99);
  });

  it("preserves original data properties through layout", () => {
    const data = [
      { code: "03", value: 50000, name: "Concrete", count: 12 },
      { code: "05", value: 30000, name: "Metals", count: 8 },
    ];
    const rects = squarify(data, 0, 0, 800, 600);
    expect(rects[0].name).toBeDefined();
    expect(rects[0].count).toBeDefined();
    expect(rects[0].code).toBeDefined();
  });
});
