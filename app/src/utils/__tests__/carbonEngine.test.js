import { vi } from "vitest";

vi.mock("@/constants/embodiedCarbonDb", () => ({
  CARBON_FACTORS: {
    "03.310": {
      items: [{ name: "Concrete slab", kgCO2ePerUnit: 35, source: "ice", confidence: "high" }],
    },
    "03": {
      items: [{ name: "Concrete general", kgCO2ePerUnit: 30, source: "ice", confidence: "medium" }],
    },
    "05.120": {
      items: [
        { name: "Structural steel", kgCO2ePerUnit: 1.46, source: "ice", confidence: "high" },
        { name: "Steel beam", kgCO2ePerUnit: 1.5, source: "ice", confidence: "high" },
      ],
    },
  },
  CARBON_TRADE_DEFAULTS: { concrete: 0.5, steel: 0.8, drywall: 0.2 },
  CARBON_BENCHMARKS: {
    office: { low: 25, typical: 45, high: 70 },
    healthcare: { low: 35, typical: 60, high: 90 },
  },
}));

import {
  resolveCarbonFactor,
  calcItemCarbon,
  calcProjectCarbon,
  getCarbonBenchmark,
  calcCarbonScore,
  formatCarbon,
} from "@/utils/carbonEngine";

// ── resolveCarbonFactor ───────────────────────────────────────────────

describe("resolveCarbonFactor", () => {
  it("exact code match returns correct factor", () => {
    const f = resolveCarbonFactor("03.310", "", "");
    expect(f.kgCO2ePerUnit).toBe(35);
    expect(f.matchType).toBe("exact");
    expect(f.source).toBe("ice");
    expect(f.confidence).toBe("high");
  });

  it("name matching within exact code picks the best item", () => {
    const f = resolveCarbonFactor("05.120", "", "steel beam");
    expect(f.kgCO2ePerUnit).toBe(1.5);
    expect(f.matchType).toBe("exact");
  });

  it("falls back to first item when name does not match", () => {
    const f = resolveCarbonFactor("05.120", "", "unknown item");
    expect(f.kgCO2ePerUnit).toBe(1.46);
    expect(f.matchType).toBe("exact");
  });

  it("prefix match when exact code not found", () => {
    // "03.999" does not exist, but "03" prefix does
    const f = resolveCarbonFactor("03.999", "", "");
    expect(f.kgCO2ePerUnit).toBe(30);
    expect(f.matchType).toBe("prefix");
  });

  it("trade default when no code matches", () => {
    const f = resolveCarbonFactor("", "concrete", "");
    expect(f.kgCO2ePerUnit).toBe(0.5);
    expect(f.matchType).toBe("trade-default");
    expect(f.confidence).toBe("low");
  });

  it("returns zero factor when no code and no trade match", () => {
    const f = resolveCarbonFactor("", "", "");
    expect(f.kgCO2ePerUnit).toBe(0);
    expect(f.matchType).toBe("none");
  });

  it("handles null/undefined inputs gracefully", () => {
    const f = resolveCarbonFactor(null, undefined, null);
    expect(f.kgCO2ePerUnit).toBe(0);
    expect(f.matchType).toBe("none");
  });
});

// ── calcItemCarbon ────────────────────────────────────────────────────

describe("calcItemCarbon", () => {
  it("per-unit calculation with exact code match", () => {
    const result = calcItemCarbon({
      code: "03.310",
      trade: "concrete",
      name: "Concrete slab",
      quantity: 100,
      material: 5000,
    });
    // quantity * factor = 100 * 35 = 3500
    expect(result.kgCO2e).toBe(3500);
    expect(result.matchType).toBe("exact");
  });

  it("trade-default uses material cost instead of quantity", () => {
    const result = calcItemCarbon({
      code: "",
      trade: "concrete",
      name: "",
      quantity: 999,
      material: 10000,
    });
    // trade-default: materialCost * factor = 10000 * 0.5 = 5000
    expect(result.kgCO2e).toBe(5000);
    expect(result.matchType).toBe("trade-default");
  });

  it("returns zero for items with no matching factor", () => {
    const result = calcItemCarbon({
      code: "",
      trade: "",
      name: "",
      quantity: 50,
      material: 1000,
    });
    expect(result.kgCO2e).toBe(0);
    expect(result.matchType).toBe("none");
  });

  it("handles null item gracefully", () => {
    const result = calcItemCarbon(null);
    expect(result.kgCO2e).toBe(0);
  });
});

// ── calcProjectCarbon ─────────────────────────────────────────────────

describe("calcProjectCarbon", () => {
  it("aggregates multiple items correctly", () => {
    const items = [
      { id: "1", code: "03.310", trade: "concrete", name: "Slab", quantity: 100, material: 5000 },
      { id: "2", code: "05.120", trade: "steel", name: "Structural steel", quantity: 200, material: 8000 },
    ];
    const result = calcProjectCarbon(items, 10000);

    // Item 1: 100 * 35 = 3500
    // Item 2: 200 * 1.46 = 292
    expect(result.totalKgCO2e).toBeCloseTo(3792, 0);
    expect(result.totalTonnesCO2e).toBeCloseTo(3.792, 2);
    expect(result.kgCO2ePerSF).toBeCloseTo(0.3792, 3);
  });

  it("groups by division and trade", () => {
    const items = [
      { id: "1", code: "03.310", trade: "concrete", name: "Slab", quantity: 50, material: 0 },
      { id: "2", code: "03.310", trade: "concrete", name: "Footing", quantity: 50, material: 0 },
      { id: "3", code: "05.120", trade: "steel", name: "Beam", quantity: 100, material: 0 },
    ];
    const result = calcProjectCarbon(items, 5000);

    // Division "03": 50*35 + 50*35 = 3500
    expect(result.byDivision["03"]).toBe(3500);
    // Division "05": name "Beam" matches "Steel beam" (contains), so factor=1.5 → 100*1.5=150
    expect(result.byDivision["05"]).toBe(150);
    // Trade grouping
    expect(result.byTrade["concrete"]).toBe(3500);
    expect(result.byTrade["steel"]).toBe(150);
  });

  it("top contributors are sorted by kgCO2e descending", () => {
    const items = [
      { id: "1", code: "03.310", trade: "concrete", name: "Big slab", quantity: 1000, material: 0 },
      { id: "2", code: "05.120", trade: "steel", name: "Small beam", quantity: 10, material: 0 },
    ];
    const result = calcProjectCarbon(items, 1000);

    expect(result.topContributors[0].kgCO2e).toBeGreaterThan(result.topContributors[1].kgCO2e);
    expect(result.topContributors[0].id).toBe("1");
  });

  it("handles empty items array", () => {
    const result = calcProjectCarbon([], 5000);
    expect(result.totalKgCO2e).toBe(0);
    expect(result.kgCO2ePerSF).toBe(0);
    expect(result.topContributors).toHaveLength(0);
  });

  it("handles null items gracefully", () => {
    const result = calcProjectCarbon(null, 5000);
    expect(result.totalKgCO2e).toBe(0);
  });
});

// ── getCarbonBenchmark ────────────────────────────────────────────────

describe("getCarbonBenchmark", () => {
  it("returns office benchmark", () => {
    const bm = getCarbonBenchmark("office");
    expect(bm.low).toBe(25);
    expect(bm.typical).toBe(45);
    expect(bm.high).toBe(70);
  });

  it("returns healthcare benchmark", () => {
    const bm = getCarbonBenchmark("healthcare");
    expect(bm.low).toBe(35);
    expect(bm.typical).toBe(60);
    expect(bm.high).toBe(90);
  });

  it("falls back to office for unknown building types", () => {
    const bm = getCarbonBenchmark("spaceship");
    expect(bm.low).toBe(25);
  });
});

// ── calcCarbonScore ───────────────────────────────────────────────────

describe("calcCarbonScore", () => {
  it("at or below low benchmark returns 100", () => {
    expect(calcCarbonScore(20, "office")).toBe(100);
    expect(calcCarbonScore(25, "office")).toBe(100);
  });

  it("at typical benchmark returns 50", () => {
    expect(calcCarbonScore(45, "office")).toBe(50);
  });

  it("between low and typical is proportional (50-100)", () => {
    const score = calcCarbonScore(35, "office");
    // 35 is midway between low=25 and typical=45 → score = 100 - (10/20)*50 = 75
    expect(score).toBe(75);
  });

  it("at 2x high benchmark (ceiling) returns 0", () => {
    // ceiling = 70 * 2 = 140
    expect(calcCarbonScore(140, "office")).toBe(0);
  });

  it("above ceiling returns 0", () => {
    expect(calcCarbonScore(200, "office")).toBe(0);
  });

  it("between typical and ceiling is proportional (0-50)", () => {
    // typical=45, ceiling=140, range=95
    // At high=70: score = 50 - ((70-45)/95)*50 = 50 - 13.16 ≈ 36.84
    const score = calcCarbonScore(70, "office");
    expect(score).toBeCloseTo(36.84, 0);
  });
});

// ── formatCarbon ──────────────────────────────────────────────────────

describe("formatCarbon", () => {
  it("formats values less than 1 as kg with 2 decimals", () => {
    expect(formatCarbon(0.5)).toBe("0.50 kg");
  });

  it("formats values 1-999 as whole kg", () => {
    expect(formatCarbon(500)).toBe("500 kg");
  });

  it("formats values 1000-999999 as tonnes", () => {
    expect(formatCarbon(5000)).toBe("5.0 tonnes");
  });

  it("formats values >= 1000000 as kt", () => {
    expect(formatCarbon(1500000)).toBe("1.5 kt");
  });

  it("handles zero", () => {
    expect(formatCarbon(0)).toBe("0.00 kg");
  });

  it("handles null/undefined as zero", () => {
    expect(formatCarbon(null)).toBe("0.00 kg");
    expect(formatCarbon(undefined)).toBe("0.00 kg");
  });
});
