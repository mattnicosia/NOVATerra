import { vi } from "vitest";

vi.mock("@/constants/csi", () => ({
  CSI: {
    "03": { name: "Concrete" },
    "05": { name: "Metals" },
    "07": { name: "Thermal & Moisture Protection" },
    "09": { name: "Finishes" },
    "22": { name: "Plumbing" },
    "26": { name: "Electrical" },
  },
}));

import { normalizeCSI, analyzeGaps } from "@/utils/scopeGapEngine";

// ── normalizeCSI ───────────────────────────────────────────────

describe("normalizeCSI", () => {
  it("strips sub-section from dotted format (09.260 -> 09)", () => {
    expect(normalizeCSI("09.260")).toBe("09");
  });

  it("extracts 2-digit division from concatenated format (09260 -> 09)", () => {
    expect(normalizeCSI("09260")).toBe("09");
  });

  it("returns already-normalized 2-digit code unchanged (09 -> 09)", () => {
    expect(normalizeCSI("09")).toBe("09");
  });

  it("pads single-digit code to 2 digits (9 -> 09)", () => {
    expect(normalizeCSI("9")).toBe("09");
  });

  it("strips label text from division string (09 - Finishes -> 09)", () => {
    expect(normalizeCSI("09 - Finishes")).toBe("09");
  });

  it("returns null for null input", () => {
    expect(normalizeCSI(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(normalizeCSI(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeCSI("")).toBeNull();
  });

  it("returns null for non-numeric string", () => {
    expect(normalizeCSI("abc")).toBeNull();
  });
});

// ── analyzeGaps ────────────────────────────────────────────────

describe("analyzeGaps", () => {
  // Helper factories
  const makeEstimateItem = (overrides = {}) => ({
    id: "item-1",
    code: "09.260",
    division: "09 - Finishes",
    description: "Gypsum board",
    quantity: 1000,
    unit: "SF",
    material: 2.5,
    labor: 3.0,
    equipment: 0,
    subcontractor: 0,
    ...overrides,
  });

  const makeProposal = (overrides = {}) => ({
    lineItems: [
      {
        csiCode: "09.260",
        description: "Drywall",
        amount: 5500,
        quantity: 1000,
        unit: "SF",
      },
    ],
    exclusions: [],
    ...overrides,
  });

  // ── Empty / null inputs ──

  describe("empty inputs", () => {
    it("returns zeroed result when estimateItems is null", () => {
      const result = analyzeGaps(null, makeProposal());
      expect(result.coverageScore).toBe(0);
      expect(result.matched).toEqual([]);
      expect(result.missingFromProposal).toEqual([]);
      expect(result.extraInProposal).toEqual([]);
      expect(result.quantityMismatches).toEqual([]);
      expect(result.exclusionConflicts).toEqual([]);
    });

    it("returns zeroed result when proposal is null", () => {
      const result = analyzeGaps([makeEstimateItem()], null);
      expect(result.coverageScore).toBe(0);
      expect(result.matched).toEqual([]);
    });

    it("returns zeroed result when estimateItems is empty array", () => {
      const result = analyzeGaps([], makeProposal());
      expect(result.coverageScore).toBe(0);
    });
  });

  // ── Full coverage ──

  describe("full coverage", () => {
    it("returns coverageScore=100 when proposal covers all estimate divisions", () => {
      const items = [
        makeEstimateItem({ id: "1", code: "03.300", division: "03 - Concrete", description: "Concrete slab", quantity: 500, unit: "SF", material: 10, labor: 5 }),
        makeEstimateItem({ id: "2", code: "09.260", division: "09 - Finishes", description: "Gypsum board", quantity: 1000, unit: "SF", material: 2.5, labor: 3 }),
      ];
      const proposal = makeProposal({
        lineItems: [
          { csiCode: "03.300", description: "Concrete", amount: 7500, quantity: 500, unit: "SF" },
          { csiCode: "09.260", description: "Drywall", amount: 5500, quantity: 1000, unit: "SF" },
        ],
      });

      const result = analyzeGaps(items, proposal);
      expect(result.coverageScore).toBe(100);
      expect(result.missingFromProposal).toHaveLength(0);
    });
  });

  // ── Missing scope ──

  describe("missing scope", () => {
    it("identifies divisions in estimate but not in proposal", () => {
      const items = [
        makeEstimateItem({ id: "1", code: "03.300", division: "03", description: "Concrete slab", quantity: 500, unit: "SF", material: 10, labor: 5 }),
        makeEstimateItem({ id: "2", code: "05.120", division: "05", description: "Structural steel", quantity: 100, unit: "TON", material: 3500, labor: 1500 }),
        makeEstimateItem({ id: "3", code: "09.260", division: "09", description: "Gypsum board", quantity: 1000, unit: "SF", material: 2.5, labor: 3 }),
      ];
      const proposal = makeProposal({
        lineItems: [
          { csiCode: "03.300", description: "Concrete", amount: 7500, quantity: 500, unit: "SF" },
          { csiCode: "09.260", description: "Drywall", amount: 5500, quantity: 1000, unit: "SF" },
        ],
      });

      const result = analyzeGaps(items, proposal);
      expect(result.missingFromProposal.length).toBeGreaterThan(0);
      const missingDivs = result.missingFromProposal.map((m) => m.division);
      expect(missingDivs).toContain("05");
    });
  });

  // ── Extra in proposal ──

  describe("extra in proposal", () => {
    it("identifies divisions in proposal but not in estimate", () => {
      const items = [
        makeEstimateItem({ id: "1", code: "03.300", division: "03", description: "Concrete", quantity: 500, unit: "SF", material: 10, labor: 5 }),
      ];
      const proposal = makeProposal({
        lineItems: [
          { csiCode: "03.300", description: "Concrete", amount: 7500, quantity: 500, unit: "SF" },
          { csiCode: "22.100", description: "Plumbing rough-in", amount: 12000, quantity: 1, unit: "LS" },
        ],
      });

      const result = analyzeGaps(items, proposal);
      expect(result.extraInProposal.length).toBeGreaterThan(0);
      expect(result.extraInProposal.some((e) => e.description === "Plumbing rough-in")).toBe(true);
    });
  });

  // ── Quantity mismatch ──

  describe("quantity mismatches", () => {
    it("flags items where proposal qty differs by more than 20%", () => {
      const items = [
        makeEstimateItem({
          id: "1",
          code: "09.260",
          division: "09",
          description: "Gypsum board",
          quantity: 1000,
          unit: "SF",
          material: 2.5,
          labor: 3,
        }),
      ];
      const proposal = makeProposal({
        lineItems: [
          { csiCode: "09.260", description: "Drywall", amount: 2750, quantity: 500, unit: "SF" },
        ],
      });

      const result = analyzeGaps(items, proposal);
      expect(result.quantityMismatches.length).toBeGreaterThan(0);
      const mm = result.quantityMismatches[0];
      expect(mm.pctDiff).toBe(-50);
      expect(mm.estQty).toBe(1000);
      expect(mm.propQty).toBe(500);
    });
  });

  // ── Exclusion conflicts ──

  describe("exclusion conflicts", () => {
    it("detects conflicts between exclusion text and estimate items", () => {
      const items = [
        makeEstimateItem({
          id: "1",
          code: "09.910",
          division: "09",
          description: "Painting — 2 coats latex",
          quantity: 5000,
          unit: "SF",
          material: 0.8,
          labor: 1.5,
        }),
      ];
      const proposal = makeProposal({
        lineItems: [
          { csiCode: "09.260", description: "Drywall", amount: 5500, quantity: 1000, unit: "SF" },
        ],
        exclusions: ["Painting excluded"],
      });

      const result = analyzeGaps(items, proposal);
      expect(result.exclusionConflicts.length).toBeGreaterThan(0);
      expect(result.exclusionConflicts[0].exclusionText).toBe("Painting excluded");
      expect(result.exclusionConflicts[0].affectedDivision).toBe("09");
    });
  });

  // ── Coverage score calculation ──

  describe("coverage score", () => {
    it("calculates score as coveredValue / totalEstimateValue * 100", () => {
      // div 03: 500 * (10 + 5) = 7500
      // div 09: 1000 * (2.5 + 3) = 5500
      // Total = 13000. If proposal covers only div 03, coverage = 7500/13000 ~= 57.69 -> 58%
      const items = [
        makeEstimateItem({ id: "1", code: "03.300", division: "03", description: "Concrete slab", quantity: 500, unit: "SF", material: 10, labor: 5 }),
        makeEstimateItem({ id: "2", code: "09.260", division: "09", description: "Gypsum board", quantity: 1000, unit: "SF", material: 2.5, labor: 3 }),
      ];
      const proposal = makeProposal({
        lineItems: [
          { csiCode: "03.300", description: "Concrete", amount: 7500, quantity: 500, unit: "SF" },
        ],
      });

      const result = analyzeGaps(items, proposal);
      // coveredValue = 7500, totalEstimateValue = 13000
      expect(result.coverageScore).toBe(Math.round((7500 / 13000) * 100));
    });
  });
});
