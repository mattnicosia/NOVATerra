import { describe, it, expect } from "vitest";
import { unitToTool, evalFormula } from "@/hooks/useMeasurementEngine";

/**
 * Tests for the pure helper functions exported from useMeasurementEngine.
 * These are deterministic functions with no store dependencies.
 */

// ── unitToTool ────────────────────────────────────────────────────

describe("unitToTool", () => {
  it("maps count units to 'count'", () => {
    expect(unitToTool("EA")).toBe("count");
    expect(unitToTool("SET")).toBe("count");
    expect(unitToTool("PAIR")).toBe("count");
    expect(unitToTool("BOX")).toBe("count");
    expect(unitToTool("ROLL")).toBe("count");
    expect(unitToTool("PALLET")).toBe("count");
    expect(unitToTool("BAG")).toBe("count");
  });

  it("maps linear units to 'linear'", () => {
    expect(unitToTool("LF")).toBe("linear");
    expect(unitToTool("VLF")).toBe("linear");
  });

  it("maps area/volume units to 'area' (default)", () => {
    expect(unitToTool("SF")).toBe("area");
    expect(unitToTool("SY")).toBe("area");
    expect(unitToTool("CY")).toBe("area");
    expect(unitToTool("GAL")).toBe("area");
  });

  it("is case-insensitive", () => {
    expect(unitToTool("ea")).toBe("count");
    expect(unitToTool("lf")).toBe("linear");
    expect(unitToTool("sf")).toBe("area");
    expect(unitToTool("Ea")).toBe("count");
    expect(unitToTool("Lf")).toBe("linear");
  });

  it("defaults to 'area' for null/undefined/empty", () => {
    expect(unitToTool(null)).toBe("area");
    expect(unitToTool(undefined)).toBe("area");
    expect(unitToTool("")).toBe("area");
  });

  it("defaults to 'area' for unknown units", () => {
    expect(unitToTool("TONS")).toBe("area");
    expect(unitToTool("MBF")).toBe("area");
    expect(unitToTool("SQFT")).toBe("area");
  });
});

// ── evalFormula ───────────────────────────────────────────────────

describe("evalFormula", () => {
  describe("passthrough behavior", () => {
    it("returns measured value when formula is empty", () => {
      expect(evalFormula("", [], 42)).toBe(42);
    });

    it("returns measured value when formula is null/undefined", () => {
      expect(evalFormula(null, [], 42)).toBe(42);
      expect(evalFormula(undefined, [], 42)).toBe(42);
    });

    it("returns measured value when formula is whitespace-only", () => {
      expect(evalFormula("   ", [], 42)).toBe(42);
      expect(evalFormula("\t", [], 42)).toBe(42);
    });
  });

  describe("built-in variable substitution", () => {
    it("substitutes 'Measured' keyword", () => {
      expect(evalFormula("Measured * 2", [], 10)).toBe(20);
      expect(evalFormula("Measured + 5", [], 10)).toBe(15);
      expect(evalFormula("Measured / 4", [], 100)).toBe(25);
      expect(evalFormula("Measured - 3", [], 10)).toBe(7);
    });

    it("substitutes 'Qty' keyword (alias for Measured)", () => {
      expect(evalFormula("Qty * 3", [], 5)).toBe(15);
      expect(evalFormula("Qty + 10", [], 20)).toBe(30);
    });

    it("is case-insensitive for built-in keywords", () => {
      expect(evalFormula("measured * 2", [], 10)).toBe(20);
      expect(evalFormula("MEASURED * 2", [], 10)).toBe(20);
      expect(evalFormula("qty * 3", [], 5)).toBe(15);
      expect(evalFormula("QTY * 3", [], 5)).toBe(15);
    });
  });

  describe("custom variable substitution", () => {
    it("substitutes single custom variable", () => {
      const vars = [{ key: "Width", value: 4 }];
      expect(evalFormula("Width * 2", vars, 0)).toBe(8);
    });

    it("substitutes multiple custom variables", () => {
      const vars = [
        { key: "Width", value: 4 },
        { key: "Height", value: 8 },
      ];
      expect(evalFormula("Width * Height", vars, 0)).toBe(32);
    });

    it("combines Measured with custom variables", () => {
      const vars = [{ key: "Waste", value: 10 }];
      expect(evalFormula("Measured * (1 + Waste / 100)", vars, 100)).toBeCloseTo(110);
    });

    it("handles variables with numeric string values", () => {
      const vars = [{ key: "Factor", value: "1.5" }];
      expect(evalFormula("Measured * Factor", vars, 10)).toBe(15);
    });

    it("substitutes longer variable names first to prevent partial matches", () => {
      const vars = [
        { key: "WidthFt", value: 10 },
        { key: "Width", value: 5 },
      ];
      // WidthFt should be substituted before Width to prevent "10Ft" partial
      expect(evalFormula("WidthFt + Width", vars, 0)).toBe(15);
    });

    it("ignores variables with empty keys", () => {
      const vars = [
        { key: "", value: 99 },
        { key: "X", value: 5 },
      ];
      expect(evalFormula("X * 2", vars, 0)).toBe(10);
    });
  });

  describe("arithmetic operations", () => {
    it("handles addition", () => {
      expect(evalFormula("Measured + 5", [], 10)).toBe(15);
    });

    it("handles subtraction", () => {
      expect(evalFormula("Measured - 3", [], 10)).toBe(7);
    });

    it("handles multiplication", () => {
      expect(evalFormula("Measured * 2.5", [], 10)).toBe(25);
    });

    it("handles division", () => {
      expect(evalFormula("Measured / 3", [], 9)).toBe(3);
    });

    it("handles parentheses", () => {
      expect(evalFormula("(Measured + 10) * 2", [], 5)).toBe(30);
    });

    it("handles nested parentheses", () => {
      expect(evalFormula("((Measured + 2) * 3) - 1", [], 4)).toBe(17);
    });

    it("handles percentage operations", () => {
      expect(evalFormula("Measured * 1.15", [], 100)).toBeCloseTo(115);
      expect(evalFormula("Measured * 0.85", [], 200)).toBeCloseTo(170);
    });

    it("handles decimal numbers", () => {
      expect(evalFormula("Measured * 0.125", [], 80)).toBeCloseTo(10);
    });
  });

  describe("error handling", () => {
    it("returns measured value for unparseable formulas", () => {
      expect(evalFormula("definitely not math", [], 42)).toBe(42);
    });

    it("returns measured value when formula has only unsafe characters", () => {
      expect(evalFormula("abc def ghi", [], 42)).toBe(42);
    });

    it("handles division by zero (returns Infinity)", () => {
      expect(evalFormula("Measured / 0", [], 42)).toBe(Infinity);
    });

    it("returns measured value for null variables array", () => {
      expect(evalFormula("Measured * 2", null, 10)).toBe(20);
    });
  });

  describe("edge cases", () => {
    it("handles zero measured value", () => {
      expect(evalFormula("Measured * 2", [], 0)).toBe(0);
    });

    it("handles negative measured value", () => {
      expect(evalFormula("Measured * 2", [], -5)).toBe(-10);
    });

    it("handles very large numbers", () => {
      expect(evalFormula("Measured * 1000", [], 1000000)).toBe(1000000000);
    });

    it("handles formula with no variable references", () => {
      expect(evalFormula("2 + 3", [], 42)).toBe(5);
    });

    it("handles formula with only a number", () => {
      expect(evalFormula("144", [], 42)).toBe(144);
    });
  });
});
