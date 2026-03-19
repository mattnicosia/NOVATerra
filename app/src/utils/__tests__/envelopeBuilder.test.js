import { describe, it, expect } from "vitest";
import { generateBuildingEnvelope } from "@/utils/envelopeBuilder";

// Simple rectangular footprint: 80ft × 50ft
const RECT_FOOTPRINT = [
  { x: 0, z: 0 },
  { x: 80, z: 0 },
  { x: 80, z: 50 },
  { x: 0, z: 50 },
];

// L-shaped footprint
const L_FOOTPRINT = [
  { x: 0, z: 0 },
  { x: 60, z: 0 },
  { x: 60, z: 30 },
  { x: 40, z: 30 },
  { x: 40, z: 50 },
  { x: 0, z: 50 },
];

// Typical 3-story building with basement
const FLOORS_WITH_BASEMENT = [
  { label: "Basement", height: 10 },
  { label: "Level 1", height: 14 },
  { label: "Level 2", height: 12 },
  { label: "Level 3", height: 12 },
];

// Simple 2-story, no basement
const FLOORS_SIMPLE = [
  { label: "Level 1", height: 12 },
  { label: "Level 2", height: 12 },
];

describe("generateBuildingEnvelope", () => {
  it("is a function", () => {
    expect(typeof generateBuildingEnvelope).toBe("function");
  });

  it("returns empty array for empty footprint", () => {
    expect(generateBuildingEnvelope([], FLOORS_SIMPLE)).toEqual([]);
  });

  it("returns empty array for footprint with < 3 points", () => {
    expect(generateBuildingEnvelope([{ x: 0, z: 0 }, { x: 10, z: 0 }], FLOORS_SIMPLE)).toEqual([]);
  });

  it("returns empty array for empty floors", () => {
    expect(generateBuildingEnvelope(RECT_FOOTPRINT, [])).toEqual([]);
  });

  // ── Element counts ─────────────────────────────────────────────
  describe("element counts", () => {
    it("produces correct count for 2-story rectangular building", () => {
      const els = generateBuildingEnvelope(RECT_FOOTPRINT, FLOORS_SIMPLE);
      // Per floor: 4 wall segments + 1 floor slab = 5
      // 2 floors × 5 = 10 + 1 roof slab = 11
      const walls = els.filter(e => e.type === "wall");
      const slabs = els.filter(e => e.type === "slab");
      expect(walls.length).toBe(8); // 4 walls × 2 floors
      expect(slabs.length).toBe(3); // 2 floor slabs + 1 roof
      expect(els.length).toBe(11);
    });

    it("produces correct count for L-shaped building", () => {
      const els = generateBuildingEnvelope(L_FOOTPRINT, FLOORS_SIMPLE);
      // L-shape has 6 edges per floor
      const walls = els.filter(e => e.type === "wall");
      expect(walls.length).toBe(12); // 6 walls × 2 floors
    });
  });

  // ── Envelope flag ──────────────────────────────────────────────
  it("marks all elements with isEnvelope: true", () => {
    const els = generateBuildingEnvelope(RECT_FOOTPRINT, FLOORS_SIMPLE);
    expect(els.every(e => e.isEnvelope === true)).toBe(true);
  });

  // ── IDs are unique ─────────────────────────────────────────────
  it("generates unique IDs for all elements", () => {
    const els = generateBuildingEnvelope(RECT_FOOTPRINT, FLOORS_WITH_BASEMENT);
    const ids = els.map(e => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  // ── Elevations ─────────────────────────────────────────────────
  describe("elevations", () => {
    it("stacks above-grade floors starting at 0", () => {
      const els = generateBuildingEnvelope(RECT_FOOTPRINT, FLOORS_SIMPLE);
      const slabs = els.filter(e => e.type === "slab");
      const elevations = slabs.map(e => e.geometry.elevation).sort((a, b) => a - b);
      // Level 1 slab at 0, Level 2 slab at 12, roof at 24
      expect(elevations).toEqual([0, 12, 24]);
    });

    it("places basement floors at negative elevation", () => {
      const els = generateBuildingEnvelope(RECT_FOOTPRINT, FLOORS_WITH_BASEMENT);
      const basementEls = els.filter(e => e.isBelow === true);
      expect(basementEls.length).toBeGreaterThan(0);
      // All basement elements should have negative elevation
      basementEls.forEach(e => {
        expect(e.geometry.elevation).toBeLessThan(0);
      });
    });

    it("basement elevation is at -height of basement", () => {
      const els = generateBuildingEnvelope(RECT_FOOTPRINT, FLOORS_WITH_BASEMENT);
      const basementSlabs = els.filter(e => e.type === "slab" && e.isBelow === true);
      expect(basementSlabs.length).toBe(1);
      expect(basementSlabs[0].geometry.elevation).toBe(-10); // basement height = 10
    });

    it("above-grade floors start at 0 even when basement exists", () => {
      const els = generateBuildingEnvelope(RECT_FOOTPRINT, FLOORS_WITH_BASEMENT);
      const aboveSlabs = els.filter(e => e.type === "slab" && !e.isBelow);
      const elevations = aboveSlabs.map(e => e.geometry.elevation).sort((a, b) => a - b);
      // Level 1 at 0, Level 2 at 14, Level 3 at 26, roof at 38
      expect(elevations).toEqual([0, 14, 26, 38]);
    });
  });

  // ── Wall geometry ──────────────────────────────────────────────
  describe("wall geometry", () => {
    it("walls have correct height matching floor height", () => {
      const els = generateBuildingEnvelope(RECT_FOOTPRINT, FLOORS_SIMPLE);
      const walls = els.filter(e => e.type === "wall" && e.level === 0);
      // Level 1 walls should have height 12
      walls.forEach(w => {
        expect(w.geometry.height).toBe(12);
      });
    });

    it("walls connect consecutive footprint points", () => {
      const els = generateBuildingEnvelope(RECT_FOOTPRINT, FLOORS_SIMPLE);
      const level0walls = els.filter(e => e.type === "wall" && e.level === 0);
      // First wall should go from point 0 to point 1
      expect(level0walls[0].geometry.path[0]).toEqual(RECT_FOOTPRINT[0]);
      expect(level0walls[0].geometry.path[1]).toEqual(RECT_FOOTPRINT[1]);
      // Last wall should close the polygon (point 3 to point 0)
      const lastWall = level0walls[level0walls.length - 1];
      expect(lastWall.geometry.path[0]).toEqual(RECT_FOOTPRINT[3]);
      expect(lastWall.geometry.path[1]).toEqual(RECT_FOOTPRINT[0]);
    });

    it("walls have extrudedPath geometry kind", () => {
      const els = generateBuildingEnvelope(RECT_FOOTPRINT, FLOORS_SIMPLE);
      els.filter(e => e.type === "wall").forEach(w => {
        expect(w.geometry.kind).toBe("extrudedPath");
      });
    });
  });

  // ── Slab geometry ──────────────────────────────────────────────
  describe("slab geometry", () => {
    it("slabs have polygon geometry kind", () => {
      const els = generateBuildingEnvelope(RECT_FOOTPRINT, FLOORS_SIMPLE);
      els.filter(e => e.type === "slab").forEach(s => {
        expect(s.geometry.kind).toBe("polygon");
      });
    });

    it("slab points match the footprint", () => {
      const els = generateBuildingEnvelope(RECT_FOOTPRINT, FLOORS_SIMPLE);
      const slab = els.find(e => e.type === "slab" && e.level === 0);
      expect(slab.geometry.points).toEqual(RECT_FOOTPRINT);
    });

    it("roof slab exists at top of building", () => {
      const els = generateBuildingEnvelope(RECT_FOOTPRINT, FLOORS_SIMPLE);
      const roof = els.find(e => e.isRoof === true);
      expect(roof).toBeDefined();
      expect(roof.type).toBe("slab");
      expect(roof.geometry.elevation).toBe(24); // 12 + 12
    });
  });

  // ── Floor height overrides ─────────────────────────────────────
  it("respects floorHeights override map", () => {
    const overrides = { "Level 1": 16, "Level 2": 10 };
    const els = generateBuildingEnvelope(RECT_FOOTPRINT, FLOORS_SIMPLE, overrides);
    const slabs = els.filter(e => e.type === "slab" && !e.isBelow);
    const elevations = slabs.map(e => e.geometry.elevation).sort((a, b) => a - b);
    // Level 1 at 0, Level 2 at 16, roof at 26
    expect(elevations).toEqual([0, 16, 26]);
  });

  // ── Descriptions ───────────────────────────────────────────────
  it("includes floor label in descriptions", () => {
    const els = generateBuildingEnvelope(RECT_FOOTPRINT, FLOORS_SIMPLE);
    const level1wall = els.find(e => e.type === "wall" && e.level === 0);
    expect(level1wall.description).toContain("Level 1");
  });

  // ── Trade and color ────────────────────────────────────────────
  it("assigns envelope trade and neutral color", () => {
    const els = generateBuildingEnvelope(RECT_FOOTPRINT, FLOORS_SIMPLE);
    els.forEach(e => {
      expect(e.trade).toBe("envelope");
      expect(typeof e.color).toBe("string");
    });
  });
});
