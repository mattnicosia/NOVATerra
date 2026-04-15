import { describe, it, expect } from "vitest";
import {
  normalizeCode,
  divisionFromCode,
  subdivisionFromCode,
  sortCodes,
  sortDivisionNames,
} from "@/utils/csiFormat";

// ═════════════════════════════════════════════════════════════════════
// normalizeCode
// ═════════════════════════════════════════════════════════════════════

describe("normalizeCode", () => {
  it("pads single-digit division to 2 digits", () => {
    expect(normalizeCode("6")).toBe("06");
    expect(normalizeCode("3")).toBe("03");
  });

  it("leaves 2-digit division unchanged", () => {
    expect(normalizeCode("06")).toBe("06");
    expect(normalizeCode("26")).toBe("26");
  });

  it("left-pads subdivision to 3 digits", () => {
    expect(normalizeCode("6.1")).toBe("06.001");
    expect(normalizeCode("06.11")).toBe("06.011");
  });

  it("leaves fully-padded subdivision unchanged", () => {
    expect(normalizeCode("06.110")).toBe("06.110");
    expect(normalizeCode("03.300")).toBe("03.300");
  });

  it("handles sub-subdivisions", () => {
    expect(normalizeCode("3.300.1")).toBe("03.300.01");
    expect(normalizeCode("06.110.23")).toBe("06.110.23");
  });

  it("applies legacy code migrations", () => {
    expect(normalizeCode("05.110")).toBe("05.120");
    expect(normalizeCode("09.920")).toBe("09.910");
    expect(normalizeCode("23.900")).toBe("23.090");
  });

  it("returns empty string for falsy input", () => {
    expect(normalizeCode("")).toBe("");
    expect(normalizeCode(null)).toBe("");
    expect(normalizeCode(undefined)).toBe("");
  });

  it("trims whitespace", () => {
    expect(normalizeCode("  06  ")).toBe("06");
    expect(normalizeCode(" 03.300 ")).toBe("03.300");
  });
});

// ═════════════════════════════════════════════════════════════════════
// divisionFromCode
// ═════════════════════════════════════════════════════════════════════

describe("divisionFromCode", () => {
  it("extracts division from subdivision code", () => {
    expect(divisionFromCode("06.110.23")).toBe("06");
    expect(divisionFromCode("03.300")).toBe("03");
  });

  it("extracts from display format", () => {
    expect(divisionFromCode("06 - Wood, Plastics & Composites")).toBe("06");
    expect(divisionFromCode("03 - Concrete")).toBe("03");
  });

  it("pads single-digit codes", () => {
    expect(divisionFromCode("6")).toBe("06");
    expect(divisionFromCode("3")).toBe("03");
  });

  it("returns empty string for falsy input", () => {
    expect(divisionFromCode("")).toBe("");
    expect(divisionFromCode(null)).toBe("");
    expect(divisionFromCode(undefined)).toBe("");
  });
});

// ═════════════════════════════════════════════════════════════════════
// subdivisionFromCode
// ═════════════════════════════════════════════════════════════════════

describe("subdivisionFromCode", () => {
  it("extracts subdivision from full code", () => {
    expect(subdivisionFromCode("06.110.23")).toBe("06.110");
  });

  it("returns .000 for division-only code", () => {
    expect(subdivisionFromCode("06")).toBe("06.000");
  });

  it("normalizes before extraction", () => {
    expect(subdivisionFromCode("6.1")).toBe("06.001");
  });
});

// ═════════════════════════════════════════════════════════════════════
// sortDivisionNames — THE UNIVERSAL DIVISION SORT
// Used in: DivisionNavigator, RomResult, RomScopeDetail, ProposalTable,
//          AdminNovaPage, LivingProposalPage, HistoricalProposalsPanel,
//          SubdivisionsTab, ProposalComparisonMatrix, DivisionTree, exportXlsx
// ═════════════════════════════════════════════════════════════════════

describe("sortDivisionNames", () => {
  it("sorts display-format division names by numeric code", () => {
    const input = [
      "26 - Electrical",
      "03 - Concrete",
      "09 - Finishes",
      "06 - Wood, Plastics & Composites",
    ];
    const sorted = [...input].sort(sortDivisionNames);
    expect(sorted).toEqual([
      "03 - Concrete",
      "06 - Wood, Plastics & Composites",
      "09 - Finishes",
      "26 - Electrical",
    ]);
  });

  it("sorts bare 2-digit division codes", () => {
    const input = ["26", "03", "09", "06", "01", "22"];
    const sorted = [...input].sort(sortDivisionNames);
    expect(sorted).toEqual(["01", "03", "06", "09", "22", "26"]);
  });

  it("handles single-digit codes by padding", () => {
    const input = ["26", "3", "9", "6"];
    const sorted = [...input].sort(sortDivisionNames);
    expect(sorted).toEqual(["3", "6", "9", "26"]);
  });

  it("sorts mixed bare and display format consistently", () => {
    const input = ["26 - Electrical", "03", "09 - Finishes", "06"];
    const sorted = [...input].sort(sortDivisionNames);
    expect(sorted[0]).toMatch(/^03/);
    expect(sorted[1]).toMatch(/^06/);
    expect(sorted[2]).toMatch(/^09/);
    expect(sorted[3]).toMatch(/^26/);
  });

  it("handles empty strings without crashing", () => {
    const input = ["03 - Concrete", "", "06 - Wood"];
    const sorted = [...input].sort(sortDivisionNames);
    expect(sorted).toHaveLength(3);
    // Empty pads to "00" which sorts first
    expect(sorted[0]).toBe("");
  });

  it("puts Unassigned (non-numeric prefix) after numbered divisions", () => {
    const input = ["Unassigned", "03 - Concrete", "06 - Wood"];
    const sorted = [...input].sort(sortDivisionNames);
    // "Unassigned" has no numeric prefix → padStart("Un".split(" - ")[0]) → "Unassigned"
    // localeCompare puts letters after digits
    expect(sorted[0]).toBe("03 - Concrete");
    expect(sorted[1]).toBe("06 - Wood");
  });

  it("maintains stable sort for equal elements", () => {
    const input = ["03 - Concrete", "03 - Concrete"];
    const sorted = [...input].sort(sortDivisionNames);
    expect(sorted).toEqual(["03 - Concrete", "03 - Concrete"]);
  });

  it("sorts the full CSI range correctly (00 through 48)", () => {
    const divs = ["48", "00", "26", "03", "14", "09", "01", "33", "22"];
    const sorted = [...divs].sort(sortDivisionNames);
    expect(sorted).toEqual(["00", "01", "03", "09", "14", "22", "26", "33", "48"]);
  });
});

// ═════════════════════════════════════════════════════════════════════
// sortCodes — THE UNIVERSAL SUBDIVISION SORT
// Used in: DivisionTree (subdivisions), EstimatePage grouping
// ═════════════════════════════════════════════════════════════════════

describe("sortCodes", () => {
  it("sorts subdivision codes numerically", () => {
    const input = ["03.300", "03.100", "03.200"];
    const sorted = [...input].sort(sortCodes);
    expect(sorted).toEqual(["03.100", "03.200", "03.300"]);
  });

  it("sorts across divisions", () => {
    const input = ["06.110", "03.300", "09.200", "03.100"];
    const sorted = [...input].sort(sortCodes);
    expect(sorted).toEqual(["03.100", "03.300", "06.110", "09.200"]);
  });

  it("handles zero-padding equivalence", () => {
    // "3.1" normalizes to "03.001" which sorts before "03.200"
    const input = ["03.200", "3.1"];
    const sorted = [...input].sort(sortCodes);
    expect(sorted[0]).toBe("3.1");   // "03.001" < "03.200"
    expect(sorted[1]).toBe("03.200");
  });

  it("handles display format mixed in", () => {
    const input = ["06 - Wood", "03 - Concrete"];
    const sorted = [...input].sort(sortCodes);
    expect(sorted[0]).toMatch(/^03/);
    expect(sorted[1]).toMatch(/^06/);
  });
});
