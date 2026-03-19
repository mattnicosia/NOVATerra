import { describe, it, expect } from "vitest";
import {
  getMaterial,
  searchMaterials,
  getCategory,
  getCategories,
  computeSwapImpact,
  getMaterialsForElement,
} from "@/utils/materialEngine";

// ═══════════════════════════════════════════════════════════════════════
// getMaterial — lookup by slug
// ═══════════════════════════════════════════════════════════════════════
describe("getMaterial", () => {
  it("is a function", () => {
    expect(typeof getMaterial).toBe("function");
  });

  it("returns a material object for a known slug", () => {
    const m = getMaterial("hardie-lap-siding");
    expect(m).toBeDefined();
    expect(m.slug).toBe("hardie-lap-siding");
    expect(m.name).toBeTruthy();
    expect(m.category).toBeTruthy();
  });

  it("returns null for an unknown slug", () => {
    expect(getMaterial("nonexistent-material-xyz")).toBeNull();
  });

  it("material has required visual properties", () => {
    const m = getMaterial("hardie-lap-siding");
    expect(m.visual).toBeDefined();
    expect(typeof m.visual.color).toBe("string");
    expect(typeof m.visual.roughness).toBe("number");
    expect(m.visual.roughness).toBeGreaterThanOrEqual(0);
    expect(m.visual.roughness).toBeLessThanOrEqual(1);
  });

  it("material has required cost properties", () => {
    const m = getMaterial("hardie-lap-siding");
    expect(m.cost).toBeDefined();
    expect(typeof m.cost.materialPerUnit).toBe("number");
    expect(typeof m.cost.laborPerUnit).toBe("number");
    expect(typeof m.cost.totalPerUnit).toBe("number");
    expect(typeof m.cost.unit).toBe("string");
    expect(m.cost.totalPerUnit).toBeCloseTo(m.cost.materialPerUnit + m.cost.laborPerUnit, 1);
  });

  it("material has required schedule properties", () => {
    const m = getMaterial("hardie-lap-siding");
    expect(m.schedule).toBeDefined();
    expect(typeof m.schedule.installRate).toBe("number");
    expect(typeof m.schedule.crewSize).toBe("number");
    expect(typeof m.schedule.leadTimeDays).toBe("number");
  });

  it("material has assembly layers", () => {
    const m = getMaterial("hardie-lap-siding");
    expect(m.assembly).toBeDefined();
    expect(Array.isArray(m.assembly.layers)).toBe(true);
    expect(m.assembly.layers.length).toBeGreaterThan(0);
    m.assembly.layers.forEach(layer => {
      expect(typeof layer.name).toBe("string");
      expect(typeof layer.thickness).toBe("number");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// searchMaterials — text search across catalog
// ═══════════════════════════════════════════════════════════════════════
describe("searchMaterials", () => {
  it("is a function", () => {
    expect(typeof searchMaterials).toBe("function");
  });

  it("finds materials by name keyword", () => {
    const results = searchMaterials("hardie");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(m => m.slug.includes("hardie"))).toBe(true);
  });

  it("finds materials by manufacturer keyword", () => {
    const results = searchMaterials("kohler");
    expect(results.length).toBeGreaterThan(0);
  });

  it("is case-insensitive", () => {
    const upper = searchMaterials("BRICK");
    const lower = searchMaterials("brick");
    expect(upper.length).toBe(lower.length);
  });

  it("returns empty array for no matches", () => {
    expect(searchMaterials("zzzznonexistentzzzz")).toEqual([]);
  });

  it("returns empty array for empty query", () => {
    expect(searchMaterials("")).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getCategory / getCategories
// ═══════════════════════════════════════════════════════════════════════
describe("getCategory", () => {
  it("returns materials for a known category", () => {
    const results = getCategory("exterior-cladding");
    expect(results.length).toBeGreaterThan(0);
    results.forEach(m => {
      expect(m.category).toBe("exterior-cladding");
    });
  });

  it("returns empty array for unknown category", () => {
    expect(getCategory("fake-category")).toEqual([]);
  });
});

describe("getCategories", () => {
  it("returns an array of category objects", () => {
    const cats = getCategories();
    expect(Array.isArray(cats)).toBe(true);
    expect(cats.length).toBeGreaterThan(0);
    cats.forEach(c => {
      expect(typeof c.key).toBe("string");
      expect(typeof c.label).toBe("string");
      expect(typeof c.count).toBe("number");
      expect(c.count).toBeGreaterThan(0);
    });
  });

  it("includes at least exterior-cladding and roofing", () => {
    const cats = getCategories();
    const keys = cats.map(c => c.key);
    expect(keys).toContain("exterior-cladding");
    expect(keys).toContain("roofing");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getMaterialsForElement — suggest materials based on element type/trade
// ═══════════════════════════════════════════════════════════════════════
describe("getMaterialsForElement", () => {
  it("is a function", () => {
    expect(typeof getMaterialsForElement).toBe("function");
  });

  it("suggests exterior cladding for wall elements", () => {
    const results = getMaterialsForElement({ type: "wall", trade: "framing" });
    expect(results.length).toBeGreaterThan(0);
    // Should include exterior cladding options
    expect(results.some(m => m.category === "exterior-cladding")).toBe(true);
  });

  it("suggests roofing for slab elements with roofing trade", () => {
    const results = getMaterialsForElement({ type: "slab", trade: "roofing" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(m => m.category === "roofing")).toBe(true);
  });

  it("suggests flooring for slab elements with flooring trade", () => {
    const results = getMaterialsForElement({ type: "slab", trade: "flooring" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(m => m.category === "flooring")).toBe(true);
  });

  it("returns some materials even for unknown element types", () => {
    const results = getMaterialsForElement({ type: "object", trade: "plumbing" });
    expect(results.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// computeSwapImpact — calculate cost/schedule delta of switching materials
// ═══════════════════════════════════════════════════════════════════════
describe("computeSwapImpact", () => {
  it("is a function", () => {
    expect(typeof computeSwapImpact).toBe("function");
  });

  it("computes cost delta between two materials", () => {
    const from = getMaterial("hardie-lap-siding");
    const to = getMaterial("cedar-bevel-siding");
    const impact = computeSwapImpact(from.slug, to.slug, { areaSF: 1200 });

    expect(typeof impact.costDeltaPerUnit).toBe("number");
    expect(typeof impact.costDeltaTotal).toBe("number");
    expect(typeof impact.leadTimeDelta).toBe("number");
    expect(typeof impact.scheduleDaysDelta).toBe("number");

    // Cedar is more expensive than Hardie — delta should be positive
    expect(impact.costDeltaPerUnit).toBeGreaterThan(0);
    expect(impact.costDeltaTotal).toBeCloseTo(impact.costDeltaPerUnit * 1200, 0);
  });

  it("computes negative delta when swapping to cheaper material", () => {
    const impact = computeSwapImpact("cedar-bevel-siding", "vinyl-siding", { areaSF: 1000 });
    expect(impact.costDeltaPerUnit).toBeLessThan(0);
    expect(impact.costDeltaTotal).toBeLessThan(0);
  });

  it("returns zero deltas when swapping to same material", () => {
    const impact = computeSwapImpact("hardie-lap-siding", "hardie-lap-siding", { areaSF: 500 });
    expect(impact.costDeltaPerUnit).toBe(0);
    expect(impact.costDeltaTotal).toBe(0);
    expect(impact.leadTimeDelta).toBe(0);
  });

  it("returns null if either material not found", () => {
    expect(computeSwapImpact("nonexistent", "hardie-lap-siding", { areaSF: 100 })).toBeNull();
    expect(computeSwapImpact("hardie-lap-siding", "nonexistent", { areaSF: 100 })).toBeNull();
  });

  it("handles quantity for count-based items", () => {
    const impact = computeSwapImpact("kohler-simplice-faucet", "delta-trinsic-faucet", { quantity: 8 });
    expect(typeof impact.costDeltaTotal).toBe("number");
    // Should be delta * 8
    expect(impact.costDeltaTotal).toBeCloseTo(impact.costDeltaPerUnit * 8, 0);
  });
});
