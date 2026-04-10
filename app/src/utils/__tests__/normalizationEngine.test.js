import { vi } from "vitest";

vi.mock("@/constants/locationFactors", () => ({
  resolveLocationFactors: (zip) => {
    const factors = {
      "10001": { label: "New York, NY", mat: 1.15, lab: 1.35, equip: 1.10 },
      "30301": { label: "Atlanta, GA", mat: 0.95, lab: 0.85, equip: 0.95 },
      "": { label: "National Average", mat: 1.0, lab: 1.0, equip: 1.0 },
    };
    return factors[zip] || factors[""];
  },
}));

import {
  normalizePerSF,
  denormalizePerSF,
  normalizeProposal,
  getNormalizationTrace,
} from "@/utils/normalizationEngine";

// ── normalizePerSF ────────────────────────────────────────────────────

describe("normalizePerSF", () => {
  it("normalizes NYC union correctly", () => {
    // location = 1.35*0.7 + 1.15*0.2 + 1.10*0.1 = 0.945 + 0.23 + 0.11 = 1.285
    // labor = 1.45 (union)
    // combined = 1.285 * 1.45 = 1.86325
    // normalized = 100 / 1.86325 ≈ 53.67
    const result = normalizePerSF(100, "10001", "union");
    expect(result.normalized).toBeCloseTo(53.67, 1);
    expect(result.locationFactor).toBeCloseTo(1.285, 2);
    expect(result.laborFactor).toBe(1.45);
    expect(result.combinedFactor).toBeCloseTo(1.863, 2);
    expect(result.raw).toBe(100);
  });

  it("normalizes Atlanta open-shop correctly", () => {
    // location = 0.85*0.7 + 0.95*0.2 + 0.95*0.1 = 0.595 + 0.19 + 0.095 = 0.88
    // labor = 1.0 (open-shop)
    // combined = 0.88 * 1.0 = 0.88
    // normalized = 50 / 0.88 ≈ 56.82
    const result = normalizePerSF(50, "30301", "open-shop");
    expect(result.normalized).toBeCloseTo(56.82, 1);
    expect(result.locationFactor).toBeCloseTo(0.88, 2);
    expect(result.laborFactor).toBe(1.0);
    expect(result.combinedFactor).toBeCloseTo(0.88, 2);
  });

  it("national average open-shop is a no-op", () => {
    // location = 1.0, labor = 1.0, combined = 1.0
    const result = normalizePerSF(75, "", "");
    expect(result.normalized).toBe(75);
    expect(result.locationFactor).toBe(1.0);
    expect(result.laborFactor).toBe(1.0);
    expect(result.combinedFactor).toBe(1.0);
  });

  it("includes locationLabel from resolveLocationFactors", () => {
    const result = normalizePerSF(100, "10001", "union");
    expect(result.locationLabel).toBe("New York, NY");
  });
});

// ── denormalizePerSF ──────────────────────────────────────────────────

describe("denormalizePerSF", () => {
  it("round-trips NYC union (normalize then denormalize)", () => {
    const original = 100;
    const normalized = normalizePerSF(original, "10001", "union");
    const restored = denormalizePerSF(normalized.normalized, "10001", "union");
    expect(restored.denormalized).toBeCloseTo(original, 0);
  });

  it("cross-market: NYC union normalized then denormalized to Atlanta open-shop", () => {
    const nycResult = normalizePerSF(100, "10001", "union");
    const atlResult = denormalizePerSF(nycResult.normalized, "30301", "open-shop");
    // Atlanta open-shop is a cheaper market, so denormalized should be < 100
    expect(atlResult.denormalized).toBeLessThan(100);
    // Combined Atlanta factor = 0.88, so roughly 53.67 * 0.88 ≈ 47.23
    expect(atlResult.denormalized).toBeCloseTo(47.23, 0);
  });

  it("returns baseline and factor information", () => {
    const result = denormalizePerSF(50, "10001", "union");
    expect(result.baseline).toBe(50);
    expect(result.locationFactor).toBeCloseTo(1.285, 2);
    expect(result.laborFactor).toBe(1.45);
  });
});

// ── normalizeProposal ─────────────────────────────────────────────────

describe("normalizeProposal", () => {
  it("normalizes a full proposal with divisions and markups", () => {
    const proposal = {
      id: "test-1",
      projectName: "Test Office Build",
      projectSF: 10000,
      zipCode: "10001",
      laborType: "union",
      totalCost: 500000,
      divisions: { "03": 200000, "05": 150000, "09": 150000 },
      markups: [
        { label: "OH&P", type: "percent", inputValue: 10, calculatedAmount: 50000, category: "overhead" },
      ],
    };

    const result = normalizeProposal(proposal);

    expect(result.proposalId).toBe("test-1");
    expect(result.projectSF).toBe(10000);
    expect(result.raw.zip).toBe("10001");
    expect(result.normalization.laborFactor).toBe(1.45);
    expect(result.normalization.combinedFactor).toBeCloseTo(1.863, 2);

    // Each division should have rawTotal, rawPerSF, normalizedPerSF, normalizedTotal
    expect(result.divisions["03"]).toBeDefined();
    expect(result.divisions["03"].rawTotal).toBe(200000);
    expect(result.divisions["03"].rawPerSF).toBe(20); // 200000 / 10000
    expect(result.divisions["03"].normalizedPerSF).toBeCloseTo(11.12, 1); // 20 / (1.285 * 1.40)

    // Normalized total should be less than raw total (NYC union > national avg)
    expect(result.normalized.totalCost).toBeLessThan(500000);

    // Markups
    expect(result.markups.rawMarkupTotal).toBe(50000);
    expect(result.markups.markupPctOfDirect).toBeCloseTo(10, 0);
  });

  it("handles empty divisions gracefully", () => {
    const proposal = {
      id: "empty-1",
      projectSF: 5000,
      zipCode: "10001",
      laborType: "union",
      totalCost: 0,
      divisions: {},
    };

    const result = normalizeProposal(proposal);
    expect(Object.keys(result.divisions)).toHaveLength(0);
    expect(result.normalized.totalCost).toBe(0);
  });

  it("handles zero SF without division by zero", () => {
    const proposal = {
      id: "zero-sf",
      projectSF: 0,
      zipCode: "30301",
      laborType: "open-shop",
      totalCost: 100000,
      divisions: { "03": 100000 },
    };

    const result = normalizeProposal(proposal);
    // rawPerSF should be 0 (no SF to divide by)
    expect(result.divisions["03"].rawPerSF).toBe(0);
    expect(result.raw.totalPerSF).toBe(0);
    expect(result.normalized.totalPerSF).toBe(0);
    // Should not throw
    expect(result.normalized.totalCost).toBeGreaterThan(0);
  });
});

// ── getNormalizationTrace ─────────────────────────────────────────────

describe("getNormalizationTrace", () => {
  it("returns summary and division traces", () => {
    const proposal = {
      id: "trace-1",
      projectName: "Trace Test",
      projectSF: 5000,
      zipCode: "10001",
      laborType: "prevailing",
      totalCost: 250000,
      divisions: { "03": 150000, "09": 100000 },
    };

    const trace = getNormalizationTrace(proposal);

    expect(trace.summary.project).toBe("Trace Test");
    expect(trace.summary.sf).toBe(5000);
    expect(trace.summary.rawTotal).toBe(250000);
    expect(trace.factors.location).toContain("New York, NY");
    expect(trace.divisions).toHaveLength(2);
    expect(trace.divisions[0].formula).toContain("baseline");
  });
});
