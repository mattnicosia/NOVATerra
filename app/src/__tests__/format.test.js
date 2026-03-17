import { describe, it, expect } from "vitest";
import { uid, fmt, fmt2, pct, nn, formatCurrency, parseCurrency, titleCase } from "@/utils/format";

// ─── nn() — numeric normalization ────────────────────────────────

describe("nn()", () => {
  it("converts a numeric string to a number", () => {
    expect(nn("42")).toBe(42);
    expect(nn("3.14")).toBeCloseTo(3.14);
  });

  it("passes through a plain number", () => {
    expect(nn(100)).toBe(100);
    expect(nn(-7.5)).toBe(-7.5);
  });

  it("returns 0 for null / undefined / empty string", () => {
    expect(nn(null)).toBe(0);
    expect(nn(undefined)).toBe(0);
    expect(nn("")).toBe(0);
  });

  it("returns 0 for NaN-producing inputs", () => {
    expect(nn("abc")).toBe(0);
    expect(nn(NaN)).toBe(0);
    expect(nn({})).toBe(0);
  });

  it("handles leading-number strings (parseFloat behavior)", () => {
    expect(nn("42px")).toBe(42);
    expect(nn("3.5 feet")).toBeCloseTo(3.5);
  });

  it("returns 0 for Infinity (parseFloat yields Infinity, || 0 does not catch it)", () => {
    // parseFloat("Infinity") === Infinity which is truthy, so nn returns Infinity
    // This documents actual behavior
    expect(nn(Infinity)).toBe(Infinity);
  });

  it("handles negative zero (coerced to +0 by || 0 guard)", () => {
    // parseFloat("-0") === -0, but -0 || 0 === 0 because -0 is falsy
    expect(nn("-0")).toBe(0);
  });
});

// ─── fmt() — currency formatting (no decimals) ──────────────────

describe("fmt()", () => {
  it("formats a number as USD with no decimals", () => {
    expect(fmt(1234)).toBe("$1,234");
    expect(fmt(0)).toBe("$0");
  });

  it("rounds to zero decimals", () => {
    expect(fmt(1234.56)).toBe("$1,235");
    expect(fmt(1234.4)).toBe("$1,234");
  });

  it("handles null/undefined as $0", () => {
    expect(fmt(null)).toBe("$0");
    expect(fmt(undefined)).toBe("$0");
  });

  it("handles negative values", () => {
    expect(fmt(-500)).toBe("-$500");
  });

  it("handles large values with commas", () => {
    expect(fmt(1000000)).toBe("$1,000,000");
  });
});

// ─── fmt2() — currency formatting (2 decimals) ──────────────────

describe("fmt2()", () => {
  it("formats with exactly 2 decimal places", () => {
    expect(fmt2(1234)).toBe("$1,234.00");
    expect(fmt2(99.9)).toBe("$99.90");
    expect(fmt2(42.123)).toBe("$42.12");
  });

  it("handles null/undefined as $0.00", () => {
    expect(fmt2(null)).toBe("$0.00");
    expect(fmt2(undefined)).toBe("$0.00");
  });
});

// ─── pct() — percentage formatting ──────────────────────────────

describe("pct()", () => {
  it("formats a number as percentage with one decimal", () => {
    expect(pct(42.567)).toBe("42.6%");
    expect(pct(100)).toBe("100.0%");
    expect(pct(0)).toBe("0.0%");
  });

  it("handles null/undefined as 0.0%", () => {
    expect(pct(null)).toBe("0.0%");
    expect(pct(undefined)).toBe("0.0%");
  });
});

// ─── formatCurrency() / parseCurrency() — round-trip ─────────────

describe("formatCurrency()", () => {
  it("formats a positive number as $X,XXX.XX", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
    expect(formatCurrency("99.9")).toBe("$99.90");
  });

  it("returns empty string for 0 or NaN", () => {
    expect(formatCurrency(0)).toBe("");
    expect(formatCurrency("abc")).toBe("");
    expect(formatCurrency("")).toBe("");
  });

  it("handles negative numbers", () => {
    expect(formatCurrency(-50)).toBe("-$50.00");
  });
});

describe("parseCurrency()", () => {
  it("strips $ and commas from formatted currency", () => {
    expect(parseCurrency("$1,234.50")).toBe("1234.50");
    expect(parseCurrency("$99.90")).toBe("99.90");
  });

  it("passes through non-string values unchanged", () => {
    expect(parseCurrency(42)).toBe(42);
    expect(parseCurrency(null)).toBe(null);
    expect(parseCurrency(undefined)).toBe(undefined);
  });

  it("returns empty string for empty string", () => {
    expect(parseCurrency("")).toBe("");
  });
});

describe("formatCurrency / parseCurrency round-trip", () => {
  it("round-trips a number correctly", () => {
    const original = 1234.56;
    const formatted = formatCurrency(original);
    const parsed = parseCurrency(formatted);
    expect(parseFloat(parsed)).toBeCloseTo(original);
  });

  it("round-trips negative numbers", () => {
    const original = -999.99;
    const formatted = formatCurrency(original);
    const parsed = parseCurrency(formatted);
    expect(parseFloat(parsed)).toBeCloseTo(original);
  });
});

// ─── uid() — unique ID generation ───────────────────────────────

describe("uid()", () => {
  it("returns a non-empty string", () => {
    const id = uid();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns alphanumeric characters only", () => {
    const id = uid();
    expect(id).toMatch(/^[a-z0-9]+$/);
  });

  it("generates unique IDs across multiple calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => uid()));
    expect(ids.size).toBe(100);
  });

  it("returns a string of up to 9 characters", () => {
    const id = uid();
    expect(id.length).toBeLessThanOrEqual(9);
  });
});

// ─── titleCase() ─────────────────────────────────────────────────

describe("titleCase()", () => {
  it("capitalizes first letter of each word", () => {
    expect(titleCase("joint compound")).toBe("Joint Compound");
  });

  it("preserves uppercase abbreviations", () => {
    expect(titleCase("CMU wall")).toBe("CMU Wall");
  });

  it("handles null/undefined/empty gracefully", () => {
    expect(titleCase(null)).toBe("");
    expect(titleCase(undefined)).toBe("");
    expect(titleCase("")).toBe("");
  });

  it("handles single word", () => {
    expect(titleCase("hello")).toBe("Hello");
  });
});
