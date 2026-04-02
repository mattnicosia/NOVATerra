import { CSI } from "@/constants/csi";

// Expected CSI MasterFormat division codes present in the data
const EXPECTED_DIVISIONS = [
  "00", "01", "02", "03", "04", "05", "06", "07", "08", "09",
  "10", "11", "12", "13", "14",
  "21", "22", "23", "25", "26", "27", "28",
  "31", "32", "33", "34", "35",
  "40", "41", "42", "43", "44", "46", "48",
];

describe("CSI MasterFormat constants", () => {
  it("contains all expected divisions", () => {
    for (const code of EXPECTED_DIVISIONS) {
      expect(CSI).toHaveProperty(code);
    }
  });

  it("each division has a name string", () => {
    for (const code of Object.keys(CSI)) {
      expect(typeof CSI[code].name).toBe("string");
      expect(CSI[code].name.length).toBeGreaterThan(0);
    }
  });

  it("division codes are 2-digit zero-padded strings", () => {
    for (const code of Object.keys(CSI)) {
      expect(code).toMatch(/^\d{2}$/);
    }
  });

  it("has no duplicate division codes", () => {
    const codes = Object.keys(CSI);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it("has at least 30 divisions", () => {
    expect(Object.keys(CSI).length).toBeGreaterThanOrEqual(30);
  });
});
