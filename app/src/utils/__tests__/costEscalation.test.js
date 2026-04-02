import { vi } from "vitest";

vi.mock("@/constants/constructionCostIndex", () => ({
  getCompositeIndex: (year) => {
    const idx = {
      2020: 100,
      2021: 105,
      2022: 112,
      2023: 118,
      2024: 124,
      2025: 130,
      2026: 137,
    };
    return idx[year] || 100;
  },
  getDivisionIndex: (divCode, year) => {
    const idx = { 2020: 100, 2022: 115, 2024: 130 };
    return idx[year] || 100;
  },
  getCurrentYear: () => 2026,
}));

import {
  extractYear,
  escalateCost,
  escalateDivisionCost,
  escalateDivisions,
  getEscalationFactor,
  normalizeEntry,
  formatEscalation,
} from "@/utils/costEscalation";

// ───────────────────────────────────────────────
// extractYear
// ───────────────────────────────────────────────
describe("extractYear", () => {
  it("parses ISO date string", () => {
    expect(extractYear("2023-05-15")).toBe(2023);
  });

  it("parses ISO date with time", () => {
    expect(extractYear("2021-12-31T23:59:59Z")).toBe(2021);
  });

  it('parses "Month Day, Year" format', () => {
    expect(extractYear("May 15, 2023")).toBe(2023);
  });

  it("returns plain year number as-is", () => {
    expect(extractYear(2023)).toBe(2023);
  });

  it("handles timestamp (large number)", () => {
    // 2023-10-22 approx
    const ts = new Date(2023, 9, 22).getTime();
    expect(extractYear(ts)).toBe(2023);
  });

  it("handles Date object", () => {
    expect(extractYear(new Date(2024, 0, 1))).toBe(2024);
  });

  it("returns current year (2026) for null", () => {
    expect(extractYear(null)).toBe(2026);
  });

  it("returns current year (2026) for undefined", () => {
    expect(extractYear(undefined)).toBe(2026);
  });

  it("returns current year for unparseable string", () => {
    expect(extractYear("not-a-date")).toBe(2026);
  });

  it("handles boundary year numbers", () => {
    expect(extractYear(1901)).toBe(1901);
    expect(extractYear(2099)).toBe(2099);
  });
});

// ───────────────────────────────────────────────
// escalateCost
// ───────────────────────────────────────────────
describe("escalateCost", () => {
  it("escalates 100000 from 2020 to 2026 correctly", () => {
    // 100000 * (137 / 100) = 137000
    expect(escalateCost(100000, 2020, 2026)).toBe(137000);
  });

  it("escalates between non-base years", () => {
    // 50000 * (137 / 118) = ~58050.847...
    expect(escalateCost(50000, 2023, 2026)).toBeCloseTo(58050.847, 0);
  });

  it("returns 0 for zero cost", () => {
    expect(escalateCost(0, 2020, 2026)).toBe(0);
  });

  it("returns 0 for negative cost", () => {
    expect(escalateCost(-5000, 2020, 2026)).toBe(0);
  });

  it("returns 0 for null cost", () => {
    expect(escalateCost(null, 2020, 2026)).toBe(0);
  });

  it("defaults toYear to current year (2026)", () => {
    expect(escalateCost(100000, 2020)).toBe(137000);
  });

  it("returns cost unchanged when same year", () => {
    // Both indices are the same, so factor = 1
    expect(escalateCost(100000, 2026, 2026)).toBe(100000);
  });
});

// ───────────────────────────────────────────────
// escalateDivisionCost
// ───────────────────────────────────────────────
describe("escalateDivisionCost", () => {
  it("escalates division cost from 2020 to 2024", () => {
    // 45000 * (130 / 100) = 58500
    expect(escalateDivisionCost(45000, "03", 2020, 2024)).toBe(58500);
  });

  it("returns 0 for zero cost", () => {
    expect(escalateDivisionCost(0, "03", 2020, 2024)).toBe(0);
  });

  it("returns 0 for negative cost", () => {
    expect(escalateDivisionCost(-100, "03", 2020, 2024)).toBe(0);
  });
});

// ───────────────────────────────────────────────
// getEscalationFactor
// ───────────────────────────────────────────────
describe("getEscalationFactor", () => {
  it("returns 1.37 for 2020 to 2026", () => {
    expect(getEscalationFactor(2020, 2026)).toBe(1.37);
  });

  it("returns 1 for same year", () => {
    expect(getEscalationFactor(2026, 2026)).toBe(1);
  });

  it("returns factor < 1 when going backward", () => {
    // 100 / 137 ~ 0.7299
    expect(getEscalationFactor(2026, 2020)).toBeCloseTo(0.7299, 3);
  });

  it("defaults toYear to 2026", () => {
    expect(getEscalationFactor(2020)).toBe(1.37);
  });
});

// ───────────────────────────────────────────────
// escalateDivisions
// ───────────────────────────────────────────────
describe("escalateDivisions", () => {
  it("escalates all divisions in the map", () => {
    const result = escalateDivisions({ "03": 45000, "05": 30000 }, 2020, 2024);
    // Both use getDivisionIndex: 2020=100, 2024=130 => factor 1.3
    expect(result["03"]).toBe(Math.round(45000 * 1.3));
    expect(result["05"]).toBe(Math.round(30000 * 1.3));
  });

  it("returns empty object for null divisions", () => {
    expect(escalateDivisions(null, 2020, 2024)).toEqual({});
  });

  it("returns empty object for empty divisions", () => {
    expect(escalateDivisions({}, 2020, 2024)).toEqual({});
  });

  it("rounds results to nearest integer", () => {
    const result = escalateDivisions({ "03": 33333 }, 2020, 2022);
    // 33333 * (115/100) = 38333.45 => rounded to 38333
    expect(result["03"]).toBe(Math.round(33333 * 1.15));
  });
});

// ───────────────────────────────────────────────
// formatEscalation
// ───────────────────────────────────────────────
describe("formatEscalation", () => {
  it('formats 1.15 as "+15%"', () => {
    expect(formatEscalation(1.15)).toBe("+15%");
  });

  it('formats 0.95 as "-5%"', () => {
    expect(formatEscalation(0.95)).toBe("-5%");
  });

  it('formats 1 as "0%"', () => {
    expect(formatEscalation(1)).toBe("0%");
  });

  it('formats null as "0%"', () => {
    expect(formatEscalation(null)).toBe("0%");
  });

  it('formats 0 as "0%"', () => {
    expect(formatEscalation(0)).toBe("0%");
  });

  it('formats 2.0 as "+100%"', () => {
    expect(formatEscalation(2.0)).toBe("+100%");
  });

  it('formats 1.005 as "0%" (rounds to nearest integer percent)', () => {
    expect(formatEscalation(1.004)).toBe("0%");
  });

  it('formats 1.375 as "+38%" (rounds)', () => {
    expect(formatEscalation(1.375)).toBe("+38%");
  });
});

// ───────────────────────────────────────────────
// normalizeEntry
// ───────────────────────────────────────────────
describe("normalizeEntry", () => {
  it("adjusts totalCost and divisions to target year", () => {
    const entry = {
      date: "2020-06-15",
      totalCost: 100000,
      divisions: { "03": 45000, "05": 30000 },
      projectSF: 5000,
    };
    const result = normalizeEntry(entry, 2026);

    expect(result.adjustedCost).toBe(Math.round(100000 * 1.37));
    expect(result.escalationFactor).toBe(1.37);
    expect(result.originalYear).toBe(2020);
    expect(result.targetYear).toBe(2026);
    expect(result.adjustedPerSF).toBe(Math.round((100000 * 1.37) / 5000));
    expect(result.adjustedDivisions).toBeDefined();
  });

  it("returns factor 1.0 when fromYear equals toYear", () => {
    const entry = {
      date: "2026-01-01",
      totalCost: 50000,
      divisions: {},
      projectSF: 1000,
    };
    const result = normalizeEntry(entry, 2026);

    expect(result.escalationFactor).toBe(1.0);
    expect(result.adjustedCost).toBe(50000);
  });

  it("handles entry with zero projectSF (no per-SF calc)", () => {
    const entry = {
      date: "2020-01-01",
      totalCost: 80000,
      divisions: {},
      projectSF: 0,
    };
    const result = normalizeEntry(entry, 2026);
    expect(result.adjustedPerSF).toBe(0);
  });

  it("handles entry with no totalCost", () => {
    const entry = {
      date: "2020-01-01",
      totalCost: 0,
      divisions: {},
      projectSF: 1000,
    };
    const result = normalizeEntry(entry, 2026);
    expect(result.adjustedCost).toBe(0);
  });

  it("preserves original entry fields via spread", () => {
    const entry = {
      date: "2022-03-01",
      totalCost: 200000,
      divisions: {},
      projectSF: 10000,
      projectName: "Test Project",
      location: "NYC",
    };
    const result = normalizeEntry(entry, 2026);
    expect(result.projectName).toBe("Test Project");
    expect(result.location).toBe("NYC");
  });

  it("defaults toYear to 2026 when omitted", () => {
    const entry = {
      date: "2020-06-15",
      totalCost: 100000,
      divisions: {},
      projectSF: 2000,
    };
    const result = normalizeEntry(entry);
    expect(result.targetYear).toBe(2026);
    expect(result.adjustedCost).toBe(Math.round(100000 * 1.37));
  });
});
