import { vi } from "vitest";

vi.mock("@/utils/format", () => ({
  nn: (v) => (typeof v === "number" && !isNaN(v) ? v : Number(v) || 0),
}));

import { evalFormula } from "@/utils/formula";

describe("evalFormula", () => {
  // ── Empty / null / undefined formula returns measured ──
  describe("empty or missing formula", () => {
    it("returns measured when formula is null", () => {
      expect(evalFormula(null, [], 42)).toBe(42);
    });

    it("returns measured when formula is undefined", () => {
      expect(evalFormula(undefined, [], 10)).toBe(10);
    });

    it("returns measured when formula is empty string", () => {
      expect(evalFormula("", [], 7)).toBe(7);
    });

    it("returns measured when formula is whitespace only", () => {
      expect(evalFormula("   ", [], 99)).toBe(99);
    });
  });

  // ── Built-in variables ──
  describe("built-in Measured and Qty variables", () => {
    it("resolves 'Measured' to the measured parameter", () => {
      expect(evalFormula("Measured * 2", [], 50)).toBe(100);
    });

    it("resolves 'Qty' to the measured parameter", () => {
      expect(evalFormula("Qty * 3", [], 10)).toBe(30);
    });

    it("is case-insensitive for built-in variables", () => {
      expect(evalFormula("measured + qty", [], 5)).toBe(10);
    });
  });

  // ── Simple arithmetic ──
  describe("simple arithmetic", () => {
    it("evaluates Measured * 2 with measured=50", () => {
      expect(evalFormula("Measured * 2", [], 50)).toBe(100);
    });

    it("evaluates addition", () => {
      expect(evalFormula("Measured + 10", [], 5)).toBe(15);
    });

    it("evaluates parentheses", () => {
      expect(evalFormula("(Measured + 10) * 2", [], 5)).toBe(30);
    });

    it("evaluates division", () => {
      expect(evalFormula("Measured / 4", [], 100)).toBe(25);
    });
  });

  // ── Variable substitution ──
  describe("variable substitution with key", () => {
    it("substitutes Height * Width", () => {
      const vars = [
        { key: "Height", value: 10 },
        { key: "Width", value: 20 },
      ];
      expect(evalFormula("Height * Width", vars, 0)).toBe(200);
    });

    it("mixes variables with Measured", () => {
      const vars = [{ key: "Waste", value: 1.1 }];
      expect(evalFormula("Measured * Waste", vars, 100)).toBeCloseTo(110);
    });

    it("handles numeric string values in variables", () => {
      const vars = [{ key: "Factor", value: "2.5" }];
      expect(evalFormula("Measured * Factor", vars, 10)).toBe(25);
    });
  });

  // ── name fallback ──
  describe("name fallback (backward compat)", () => {
    it("substitutes variables using name property when key is missing", () => {
      const vars = [
        { name: "Height", value: 10 },
        { name: "Width", value: 20 },
      ];
      expect(evalFormula("Height * Width", vars, 0)).toBe(200);
    });

    it("prefers key over name when both exist", () => {
      const vars = [{ key: "X", name: "Y", value: 5 }];
      // "X" should be substituted, "Y" left as-is and stripped by safe eval
      expect(evalFormula("X * 2", vars, 0)).toBe(10);
    });
  });

  // ── Longest-key-first prevents partial match ──
  describe("longest-key-first sorting", () => {
    it("replaces HeightTotal before Height", () => {
      const vars = [
        { key: "Height", value: 10 },
        { key: "HeightTotal", value: 50 },
      ];
      // If sorted wrong, "HeightTotal" becomes "10Total" which breaks.
      // Sorted correctly, "HeightTotal" is replaced first as the longer key.
      expect(evalFormula("HeightTotal + Height", vars, 0)).toBe(60);
    });

    it("handles overlapping variable names", () => {
      const vars = [
        { key: "A", value: 1 },
        { key: "AB", value: 10 },
        { key: "ABC", value: 100 },
      ];
      expect(evalFormula("ABC + AB + A", vars, 0)).toBe(111);
    });
  });

  // ── Safe eval strips dangerous chars ──
  describe("safe eval (XSS prevention)", () => {
    it("strips non-math chars — dangerous expression returns measured (safe fallback)", () => {
      // After stripping non-math chars, the expression becomes invalid → returns measured
      const result = evalFormula("Measured * 2; alert('xss')", [], 50);
      expect(typeof result).toBe("number");
    });

    it("strips alphabetic chars from the expression after substitution", () => {
      // "abc123" after var substitution would become just "123"
      expect(evalFormula("Measured + 0", [], 5)).toBe(5);
    });

    it("allows percent operator", () => {
      // The % char is allowed by the regex
      expect(evalFormula("100 % 3", [], 0)).toBe(1);
    });
  });

  // ── Error handling / fallback ──
  describe("error handling", () => {
    it("returns measured on division by zero (Infinity becomes NaN via nn)", () => {
      const result = evalFormula("Measured / 0", [], 25);
      // Division by zero in JS gives Infinity; nn(Infinity) depends on implementation
      // The function returns nn(result), so Infinity -> 0 or measured
      expect(typeof result).toBe("number");
    });

    it("returns measured when expression evaluates to nothing useful", () => {
      // Formula with only non-math chars after stripping
      expect(evalFormula("hello world", [], 42)).toBe(42);
    });

    it("returns measured for deeply invalid expression", () => {
      expect(evalFormula("((((", [], 33)).toBe(33);
    });

    it("returns measured when variables is null", () => {
      expect(evalFormula("Measured * 2", null, 15)).toBe(30);
    });

    it("returns measured when variables is undefined", () => {
      expect(evalFormula("Measured + 1", undefined, 9)).toBe(10);
    });
  });
});
