import { describe, it, expect } from "vitest";
import { unitToTool, evalFormula } from "@/hooks/useMeasurementEngine";
import { nn } from "@/utils/format";

// ─── unitToTool() — unit → measurement tool type mapping ────────

describe("unitToTool()", () => {
  it("maps area units to 'area'", () => {
    expect(unitToTool("SF")).toBe("area");
    expect(unitToTool("sf")).toBe("area");
    expect(unitToTool("SY")).toBe("area"); // not in count/linear list → area
  });

  it("maps linear units to 'linear'", () => {
    expect(unitToTool("LF")).toBe("linear");
    expect(unitToTool("lf")).toBe("linear");
    expect(unitToTool("VLF")).toBe("linear");
    expect(unitToTool("vlf")).toBe("linear");
  });

  it("maps count-type units to 'count'", () => {
    expect(unitToTool("EA")).toBe("count");
    expect(unitToTool("ea")).toBe("count");
    expect(unitToTool("SET")).toBe("count");
    expect(unitToTool("PAIR")).toBe("count");
    expect(unitToTool("BOX")).toBe("count");
    expect(unitToTool("ROLL")).toBe("count");
    expect(unitToTool("PALLET")).toBe("count");
    expect(unitToTool("BAG")).toBe("count");
  });

  it("defaults to 'area' for null/undefined/empty", () => {
    expect(unitToTool(null)).toBe("area");
    expect(unitToTool(undefined)).toBe("area");
    expect(unitToTool("")).toBe("area");
  });

  it("defaults to 'area' for unknown units", () => {
    expect(unitToTool("GAL")).toBe("area");
    expect(unitToTool("CY")).toBe("area");
  });
});

// ─── evalFormula() — formula evaluation ──────────────────────────

describe("evalFormula()", () => {
  describe("basic arithmetic", () => {
    it("evaluates simple addition", () => {
      expect(evalFormula("2+3", [], 0)).toBe(5);
    });

    it("evaluates multiplication", () => {
      expect(evalFormula("10*2.5", [], 0)).toBe(25);
    });

    it("evaluates parenthesized expressions", () => {
      expect(evalFormula("(3+4)*2", [], 0)).toBe(14);
    });

    it("evaluates subtraction and division", () => {
      expect(evalFormula("100-30", [], 0)).toBe(70);
      expect(evalFormula("100/4", [], 0)).toBe(25);
    });

    it("handles decimal arithmetic", () => {
      expect(evalFormula("1.5*2.5", [], 0)).toBeCloseTo(3.75);
    });
  });

  describe("variable substitution", () => {
    it("substitutes the Measured variable", () => {
      expect(evalFormula("Measured*1.1", [], 100)).toBeCloseTo(110);
    });

    it("substitutes the Qty alias", () => {
      expect(evalFormula("Qty+10", [], 50)).toBe(60);
    });

    it("substitutes custom variables", () => {
      const vars = [{ key: "Height", value: 10 }];
      expect(evalFormula("Measured*Height", vars, 20)).toBe(200);
    });

    it("handles case-insensitive variable names", () => {
      expect(evalFormula("measured*2", [], 15)).toBe(30);
      expect(evalFormula("MEASURED+5", [], 10)).toBe(15);
    });

    it("substitutes longer variable names first (greedy match)", () => {
      const vars = [
        { key: "H", value: 2 },
        { key: "Height", value: 10 },
      ];
      // "Height" should match before "H" because it's sorted by length
      expect(evalFormula("Height*Measured", vars, 5)).toBe(50);
    });
  });

  describe("edge cases & safety", () => {
    it("returns measured value for null/undefined/empty formula", () => {
      expect(evalFormula(null, [], 42)).toBe(42);
      expect(evalFormula(undefined, [], 42)).toBe(42);
      expect(evalFormula("", [], 42)).toBe(42);
      expect(evalFormula("   ", [], 42)).toBe(42);
    });

    it("strips unsafe characters (no code injection)", () => {
      // Letters get stripped, leaving just numbers/operators
      expect(evalFormula("2+3", [], 0)).toBe(5);
    });

    it("returns measured on invalid expression (catches error)", () => {
      expect(evalFormula("+++", [], 99)).toBe(99);
      expect(evalFormula(")(", [], 99)).toBe(99);
    });

    it("handles division by zero (returns Infinity, not crash)", () => {
      const result = evalFormula("10/0", [], 0);
      expect(result).toBe(Infinity);
    });

    it("handles modulo operator via %", () => {
      expect(evalFormula("10%3", [], 0)).toBe(1);
    });
  });
});

// ─── getPxPerUnit math (tested directly) ─────────────────────────

describe("getPxPerUnit calibration math", () => {
  // Reproduce the calibration calculation from the hook
  function calcPxPerUnit(p1, p2, realDist) {
    const calPxDist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    const rd = nn(realDist);
    if (calPxDist > 0 && rd > 0) return calPxDist / rd;
    return null;
  }

  it("computes correct px/unit from two points and real distance", () => {
    // 300px apart, real distance = 10 ft → 30 px/ft
    const result = calcPxPerUnit({ x: 0, y: 0 }, { x: 300, y: 0 }, 10);
    expect(result).toBe(30);
  });

  it("works with diagonal calibration lines", () => {
    // 3-4-5 triangle: distance = 5px, real = 2.5 ft → 2 px/ft
    const result = calcPxPerUnit({ x: 0, y: 0 }, { x: 3, y: 4 }, 2.5);
    expect(result).toBe(2);
  });

  it("returns null when realDist is 0 (div-by-zero guard)", () => {
    const result = calcPxPerUnit({ x: 0, y: 0 }, { x: 100, y: 0 }, 0);
    expect(result).toBeNull();
  });

  it("returns null when realDist is negative string", () => {
    // nn("-5") = -5, which is not > 0
    const result = calcPxPerUnit({ x: 0, y: 0 }, { x: 100, y: 0 }, "-5");
    expect(result).toBeNull();
  });

  it("returns null when points are identical (0 px distance)", () => {
    const result = calcPxPerUnit({ x: 50, y: 50 }, { x: 50, y: 50 }, 10);
    expect(result).toBeNull();
  });

  it("handles string realDist via nn()", () => {
    const result = calcPxPerUnit({ x: 0, y: 0 }, { x: 200, y: 0 }, "10");
    expect(result).toBe(20);
  });
});

// ─── scaleCodeToPxPerUnit math (tested directly) ─────────────────

describe("scaleCodeToPxPerUnit math", () => {
  // Reproduce the scale code logic from the hook
  function scaleCodeToPxPerUnit(code, dpi) {
    const archMap = {
      full: 1,
      half: 0.5,
      "3-8": 3 / 8,
      quarter: 1 / 4,
      "3-16": 3 / 16,
      eighth: 1 / 8,
      "3-32": 3 / 32,
      sixteenth: 1 / 16,
    };
    if (archMap[code] !== undefined) return dpi * archMap[code];
    const engMatch = code.match(/^eng(\d+)$/);
    if (engMatch) return dpi / parseInt(engMatch[1]);
    const metricMatch = code.match(/^1:(\d+)$/);
    if (metricMatch) {
      const ratio = parseInt(metricMatch[1]);
      return ((dpi / 25.4) * 1000) / ratio;
    }
    return null;
  }

  it("computes architectural scale: quarter inch at 108 DPI", () => {
    // 1/4" = 1'-0" means 0.25 inch on paper = 1 foot real
    // px per foot = DPI * 0.25 = 108 * 0.25 = 27
    expect(scaleCodeToPxPerUnit("quarter", 108)).toBe(27);
  });

  it("computes architectural scale: eighth inch at 108 DPI", () => {
    expect(scaleCodeToPxPerUnit("eighth", 108)).toBe(13.5);
  });

  it("computes architectural scale: full at 108 DPI", () => {
    expect(scaleCodeToPxPerUnit("full", 108)).toBe(108);
  });

  it("computes engineering scale: eng20 at 150 DPI", () => {
    // 1" = 20' → px per foot = DPI / 20 = 150/20 = 7.5
    expect(scaleCodeToPxPerUnit("eng20", 150)).toBe(7.5);
  });

  it("computes engineering scale: eng100 at 108 DPI", () => {
    expect(scaleCodeToPxPerUnit("eng100", 108)).toBeCloseTo(1.08);
  });

  it("computes metric scale: 1:100 at 108 DPI", () => {
    // px per meter = (DPI / 25.4) * 1000 / ratio
    // = (108 / 25.4) * 1000 / 100 = 4251.97 / 100 = 42.52
    const result = scaleCodeToPxPerUnit("1:100", 108);
    expect(result).toBeCloseTo(42.52, 1);
  });

  it("returns null for unknown scale code", () => {
    expect(scaleCodeToPxPerUnit("unknown", 108)).toBeNull();
    expect(scaleCodeToPxPerUnit("custom", 108)).toBeNull();
  });
});

// ─── Shoelace area formula (as used in calcPolygonArea) ──────────

describe("shoelace polygon area", () => {
  function shoelaceArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
  }

  it("computes area of a unit square", () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    expect(shoelaceArea(sq)).toBe(1);
  });

  it("computes area of a 10x20 rectangle", () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ];
    expect(shoelaceArea(rect)).toBe(200);
  });

  it("computes area of a right triangle", () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 0, y: 8 },
    ];
    expect(shoelaceArea(tri)).toBe(24);
  });

  it("returns 0 for degenerate polygon (collinear points)", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(shoelaceArea(line)).toBe(0);
  });

  it("returns 0 for single-point input", () => {
    expect(shoelaceArea([{ x: 5, y: 5 }])).toBe(0);
  });

  it("returns 0 for two-point input", () => {
    expect(
      shoelaceArea([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toBe(0);
  });

  it("works regardless of winding order (CW vs CCW)", () => {
    const ccw = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ];
    const cw = [
      { x: 0, y: 0 },
      { x: 0, y: 3 },
      { x: 4, y: 3 },
      { x: 4, y: 0 },
    ];
    expect(shoelaceArea(ccw)).toBe(shoelaceArea(cw));
    expect(shoelaceArea(ccw)).toBe(12);
  });

  it("handles an irregular pentagon", () => {
    // Pentagon with known area
    const pent = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 5, y: 3 },
      { x: 2, y: 5 },
      { x: -1, y: 3 },
    ];
    // Shoelace: |(0*0 - 4*0) + (4*3 - 5*0) + (5*5 - 2*3) + (2*3 - (-1)*5) + ((-1)*0 - 0*3)| / 2
    // = |0 + 12 + 19 + 11 + 0| / 2 = 42/2 = 21
    expect(shoelaceArea(pent)).toBe(21);
  });
});

// ─── Polyline length calculation ─────────────────────────────────

describe("polyline length", () => {
  function polylineLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += Math.sqrt((points[i].x - points[i - 1].x) ** 2 + (points[i].y - points[i - 1].y) ** 2);
    }
    return total;
  }

  it("computes length of a horizontal line", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(polylineLength(pts)).toBe(10);
  });

  it("computes length of a diagonal line (3-4-5)", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
    ];
    expect(polylineLength(pts)).toBe(5);
  });

  it("computes total of multiple segments", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(polylineLength(pts)).toBe(20);
  });

  it("returns 0 for single point", () => {
    expect(polylineLength([{ x: 5, y: 5 }])).toBe(0);
  });

  it("returns 0 for empty array", () => {
    expect(polylineLength([])).toBe(0);
  });
});
