import { describe, it, expect } from "vitest";
import {
  snapToOrthogonal,
  alignColinearSegments,
  simplifyPath,
  cleanPath,
} from "@/utils/geometrySnapping";

// ── Helper: round points to N decimal places for assertion stability ──
const round = (path, d = 4) =>
  path.map(p => ({ x: +(p.x.toFixed(d)), z: +(p.z.toFixed(d)) }));

// ═══════════════════════════════════════════════════════════════════════
// snapToOrthogonal
// ═══════════════════════════════════════════════════════════════════════
describe("snapToOrthogonal", () => {
  it("is a function", () => {
    expect(typeof snapToOrthogonal).toBe("function");
  });

  it("returns the same path for a perfectly horizontal line", () => {
    const path = [{ x: 0, z: 0 }, { x: 10, z: 0 }];
    const result = snapToOrthogonal(path);
    expect(result).toEqual(path);
  });

  it("returns the same path for a perfectly vertical line", () => {
    const path = [{ x: 0, z: 0 }, { x: 0, z: 10 }];
    const result = snapToOrthogonal(path);
    expect(result).toEqual(path);
  });

  it("snaps a nearly-horizontal segment to horizontal", () => {
    // 5° off horizontal — should snap
    const path = [{ x: 0, z: 0 }, { x: 10, z: 0.87 }]; // ~5° angle
    const result = snapToOrthogonal(path);
    expect(result[0]).toEqual({ x: 0, z: 0 });
    expect(result[1].x).toBeCloseTo(10, 0);
    expect(result[1].z).toBeCloseTo(0, 1); // snapped to z=0
  });

  it("snaps a nearly-vertical segment to vertical", () => {
    // 85° — should snap to 90°
    const path = [{ x: 0, z: 0 }, { x: 0.87, z: 10 }];
    const result = snapToOrthogonal(path);
    expect(result[1].x).toBeCloseTo(0, 1); // snapped to x=0
    expect(result[1].z).toBeCloseTo(10, 0);
  });

  it("preserves a diagonal segment outside tolerance", () => {
    // 45° diagonal — well outside 15° tolerance from any 90° axis
    const path = [{ x: 0, z: 0 }, { x: 10, z: 10 }];
    const result = snapToOrthogonal(path);
    expect(result[1].x).toBeCloseTo(10, 1);
    expect(result[1].z).toBeCloseTo(10, 1);
  });

  it("preserves a 30° diagonal (outside tolerance)", () => {
    // 30° from horizontal — 15° tolerance means max snap at ±15° from axis
    const path = [{ x: 0, z: 0 }, { x: 8.66, z: 5 }]; // 30°
    const result = snapToOrthogonal(path);
    // Should NOT snap — 30° is 30° from 0° axis, beyond 15° tolerance
    expect(result[1].x).toBeCloseTo(8.66, 1);
    expect(result[1].z).toBeCloseTo(5, 1);
  });

  it("handles multi-segment path (L-shaped wall)", () => {
    // Right-angle L: go right, then up — both already orthogonal
    const path = [
      { x: 0, z: 0 },
      { x: 10, z: 0.5 },  // nearly horizontal
      { x: 10.3, z: 8 },  // nearly vertical
    ];
    const result = snapToOrthogonal(path);
    // First segment should snap horizontal
    expect(result[1].z).toBeCloseTo(0, 0);
    // Second segment should snap vertical (x stays at segment start x)
    expect(result[2].x).toBeCloseTo(result[1].x, 0);
  });

  it("handles a rectangle (4 segments, all near-orthogonal)", () => {
    const path = [
      { x: 0, z: 0 },
      { x: 20, z: 0.3 },    // nearly right
      { x: 20.2, z: 15 },   // nearly up
      { x: 0.1, z: 15.2 },  // nearly left
      { x: -0.1, z: 0.1 },  // nearly down (back to start)
    ];
    const result = snapToOrthogonal(path);
    // All segments should be axis-aligned
    // Segment 0→1: horizontal
    expect(result[1].z).toBeCloseTo(result[0].z, 0);
    // Segment 1→2: vertical
    expect(result[2].x).toBeCloseTo(result[1].x, 0);
    // Segment 2→3: horizontal
    expect(result[3].z).toBeCloseTo(result[2].z, 0);
    // Segment 3→4: vertical
    expect(result[4].x).toBeCloseTo(result[3].x, 0);
  });

  it("respects custom tolerance", () => {
    // 20° off horizontal — default 15° would NOT snap, but tolerance=25 should snap
    const path = [{ x: 0, z: 0 }, { x: 10, z: 3.64 }]; // ~20° angle
    const result = snapToOrthogonal(path, { angleTolerance: 25 });
    expect(result[1].z).toBeCloseTo(0, 0);
  });

  it("returns empty array for empty input", () => {
    expect(snapToOrthogonal([])).toEqual([]);
  });

  it("returns single point for single-point input", () => {
    const path = [{ x: 5, z: 3 }];
    expect(snapToOrthogonal(path)).toEqual(path);
  });

  it("handles zero-length segment (duplicate points)", () => {
    const path = [{ x: 5, z: 3 }, { x: 5, z: 3 }];
    const result = snapToOrthogonal(path);
    expect(result.length).toBe(2);
    // Should not throw — zero-length segment is preserved as-is
  });

  it("snaps segments going in negative directions", () => {
    // Going left (180°) with slight downward drift
    const path = [{ x: 10, z: 0 }, { x: 0, z: 0.5 }];
    const result = snapToOrthogonal(path);
    expect(result[1].z).toBeCloseTo(0, 0);
  });

  it("snaps segments going straight down (270°)", () => {
    // Going down with slight rightward drift
    const path = [{ x: 0, z: 10 }, { x: 0.5, z: 0 }];
    const result = snapToOrthogonal(path);
    expect(result[1].x).toBeCloseTo(0, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// alignColinearSegments
// ═══════════════════════════════════════════════════════════════════════
describe("alignColinearSegments", () => {
  it("is a function", () => {
    expect(typeof alignColinearSegments).toBe("function");
  });

  it("merges two vertical segments with close X values", () => {
    // Two vertical wall segments at x=10.0 and x=10.3 — should align
    const path = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },    // horizontal
      { x: 10, z: 10 },   // vertical at x=10
      { x: 20, z: 10 },   // horizontal
      { x: 20, z: 20 },   // vertical at x=20
    ];
    const path2 = [
      { x: 0, z: 0 },
      { x: 10.3, z: 0 },
      { x: 10.3, z: 10 },
      { x: 20, z: 10 },
      { x: 20, z: 20 },
    ];
    // Both paths when aligned should share x coordinates
    const result = alignColinearSegments([path, path2]);
    // Points at ~10 and ~10.3 should merge to a common X
    const xValues = result[0].filter((_, i) => i === 1 || i === 2).map(p => p.x);
    const x2Values = result[1].filter((_, i) => i === 1 || i === 2).map(p => p.x);
    // All should be the same value (median of cluster)
    expect(xValues[0]).toBeCloseTo(x2Values[0], 1);
  });

  it("does not merge segments far apart", () => {
    const path1 = [{ x: 0, z: 0 }, { x: 0, z: 10 }]; // vertical at x=0
    const path2 = [{ x: 5, z: 0 }, { x: 5, z: 10 }]; // vertical at x=5
    const result = alignColinearSegments([path1, path2], { clusterTolerance: 1 });
    // 5ft apart — should NOT merge with 1ft tolerance
    expect(result[0][0].x).toBeCloseTo(0, 1);
    expect(result[1][0].x).toBeCloseTo(5, 1);
  });

  it("returns input unchanged for single path with no clusters", () => {
    const path = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 }];
    const result = alignColinearSegments([path]);
    expect(round(result[0])).toEqual(round(path));
  });

  it("handles empty input", () => {
    expect(alignColinearSegments([])).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// simplifyPath
// ═══════════════════════════════════════════════════════════════════════
describe("simplifyPath", () => {
  it("is a function", () => {
    expect(typeof simplifyPath).toBe("function");
  });

  it("removes micro-jitter points on a straight line", () => {
    // Straight horizontal line with tiny deviations
    const path = [
      { x: 0, z: 0 },
      { x: 3, z: 0.01 },  // micro-jitter
      { x: 6, z: -0.01 }, // micro-jitter
      { x: 10, z: 0 },
    ];
    const result = simplifyPath(path, { epsilon: 0.1 });
    // Should reduce to just start and end
    expect(result.length).toBe(2);
    expect(result[0]).toEqual({ x: 0, z: 0 });
    expect(result[1]).toEqual({ x: 10, z: 0 });
  });

  it("preserves real corners", () => {
    // L-shaped path — the corner is significant
    const path = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 8 },
    ];
    const result = simplifyPath(path, { epsilon: 0.1 });
    expect(result.length).toBe(3); // all 3 points matter
  });

  it("preserves single-point and two-point paths", () => {
    expect(simplifyPath([{ x: 0, z: 0 }])).toEqual([{ x: 0, z: 0 }]);
    expect(simplifyPath([{ x: 0, z: 0 }, { x: 5, z: 5 }])).toEqual([
      { x: 0, z: 0 },
      { x: 5, z: 5 },
    ]);
  });

  it("returns empty for empty input", () => {
    expect(simplifyPath([])).toEqual([]);
  });

  it("uses default epsilon when not specified", () => {
    // With a reasonable default, jitter < 0.5 ft should be removed
    const path = [
      { x: 0, z: 0 },
      { x: 5, z: 0.1 },
      { x: 10, z: 0 },
    ];
    const result = simplifyPath(path);
    expect(result.length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// cleanPath — the chained convenience function
// ═══════════════════════════════════════════════════════════════════════
describe("cleanPath", () => {
  it("is a function", () => {
    expect(typeof cleanPath).toBe("function");
  });

  it("chains simplify → snap → removes zero-length segments", () => {
    // Messy L-shaped wall with jitter and slight angles
    const path = [
      { x: 0, z: 0 },
      { x: 3, z: 0.05 },   // jitter on a horizontal run
      { x: 6, z: -0.03 },  // jitter
      { x: 10, z: 0.4 },   // end of horizontal (slightly off)
      { x: 10.3, z: 5 },   // vertical segment (slightly off)
      { x: 10.2, z: 10 },  // more vertical
    ];
    const result = cleanPath(path);
    // After simplify: jitter points removed
    // After snap: horizontal segments → z constant, vertical → x constant
    // Should be a clean L-shape
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.length).toBeLessThanOrEqual(4);

    // First segment should be horizontal
    expect(Math.abs(result[1].z - result[0].z)).toBeLessThan(0.5);
  });

  it("filters out zero-length segments after snapping", () => {
    // Two points very close together that collapse to same point after snap
    const path = [
      { x: 0, z: 0 },
      { x: 10, z: 0.2 },
      { x: 10.1, z: 0.3 }, // very close to previous after snap
      { x: 10.2, z: 8 },
    ];
    const result = cleanPath(path);
    // No two consecutive points should be identical
    for (let i = 1; i < result.length; i++) {
      const dx = Math.abs(result[i].x - result[i - 1].x);
      const dz = Math.abs(result[i].z - result[i - 1].z);
      expect(dx + dz).toBeGreaterThan(0.01);
    }
  });

  it("returns empty for empty input", () => {
    expect(cleanPath([])).toEqual([]);
  });

  it("returns single point for single-point input", () => {
    expect(cleanPath([{ x: 5, z: 3 }])).toEqual([{ x: 5, z: 3 }]);
  });

  it("handles already-clean orthogonal path (no changes)", () => {
    const path = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 8 },
    ];
    const result = cleanPath(path);
    expect(round(result)).toEqual(round(path));
  });
});
