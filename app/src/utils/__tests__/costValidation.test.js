import { runValidation } from "@/utils/costValidation";

describe("runValidation", () => {
  // ── Empty / null input ──
  describe("empty or null input", () => {
    it("returns empty array for null", () => {
      expect(runValidation(null)).toEqual([]);
    });

    it("returns empty array for undefined", () => {
      expect(runValidation(undefined)).toEqual([]);
    });

    it("returns empty array for empty array", () => {
      expect(runValidation([])).toEqual([]);
    });
  });

  // ── Zero-cost items ──
  describe("zeroTotal warnings", () => {
    it("warns when item has quantity but all costs are zero", () => {
      const items = [
        {
          id: "1",
          description: "Drywall",
          quantity: 100,
          material: 0,
          labor: 0,
          equipment: 0,
          subcontractor: 0,
        },
      ];
      const warnings = runValidation(items);
      const zeroWarnings = warnings.filter((w) => w.type === "zeroTotal");
      expect(zeroWarnings).toHaveLength(1);
      expect(zeroWarnings[0].severity).toBe("warn");
      expect(zeroWarnings[0].itemId).toBe("1");
      expect(zeroWarnings[0].message).toContain("Drywall");
      expect(zeroWarnings[0].message).toContain("$0 cost");
    });

    it("ignores items with quantity 0 (no zero-cost warning)", () => {
      const items = [
        {
          id: "2",
          description: "Placeholder",
          quantity: 0,
          material: 0,
          labor: 0,
          equipment: 0,
          subcontractor: 0,
        },
      ];
      const warnings = runValidation(items);
      const zeroWarnings = warnings.filter((w) => w.type === "zeroTotal");
      expect(zeroWarnings).toHaveLength(0);
    });

    it("does not warn when at least one cost field is non-zero", () => {
      const items = [
        {
          id: "3",
          description: "Concrete",
          quantity: 50,
          material: 500,
          labor: 0,
          equipment: 0,
          subcontractor: 0,
        },
      ];
      const warnings = runValidation(items);
      const zeroWarnings = warnings.filter((w) => w.type === "zeroTotal");
      expect(zeroWarnings).toHaveLength(0);
    });
  });

  // ── High rate detection ──
  describe("highRate warnings", () => {
    it("flags item with material 3x+ average in same division (4+ items)", () => {
      const items = [
        { id: "a", description: "Item A", division: "03 Concrete", material: 100, labor: 0, quantity: 1 },
        { id: "b", description: "Item B", division: "03 Concrete", material: 120, labor: 0, quantity: 1 },
        { id: "c", description: "Item C", division: "03 Concrete", material: 110, labor: 0, quantity: 1 },
        { id: "d", description: "Item D", division: "03 Concrete", material: 1500, labor: 0, quantity: 1 },
      ];
      const warnings = runValidation(items);
      const highWarnings = warnings.filter((w) => w.type === "highRate");
      expect(highWarnings.length).toBeGreaterThanOrEqual(1);
      expect(highWarnings.some((w) => w.itemId === "d")).toBe(true);
    });

    it("does not flag when fewer than 3 items in division", () => {
      const items = [
        { id: "a", description: "Item A", division: "05 Metals", material: 100, labor: 0, quantity: 1 },
        { id: "b", description: "Item B", division: "05 Metals", material: 5000, labor: 0, quantity: 1 },
      ];
      const warnings = runValidation(items);
      const highWarnings = warnings.filter((w) => w.type === "highRate");
      expect(highWarnings).toHaveLength(0);
    });

    it("does not flag when material is under $100 even if 3x+ average", () => {
      const items = [
        { id: "a", description: "A", division: "09", material: 10, labor: 0, quantity: 1 },
        { id: "b", description: "B", division: "09", material: 10, labor: 0, quantity: 1 },
        { id: "c", description: "C", division: "09", material: 10, labor: 0, quantity: 1 },
        { id: "d", description: "D", division: "09", material: 50, labor: 0, quantity: 1 },
      ];
      const warnings = runValidation(items);
      const highWarnings = warnings.filter((w) => w.type === "highRate");
      expect(highWarnings).toHaveLength(0);
    });

    it("also detects high labor rates", () => {
      const items = [
        { id: "a", description: "A", division: "22", material: 0, labor: 80, quantity: 1 },
        { id: "b", description: "B", division: "22", material: 0, labor: 90, quantity: 1 },
        { id: "c", description: "C", division: "22", material: 0, labor: 85, quantity: 1 },
        { id: "d", description: "D", division: "22", material: 0, labor: 900, quantity: 1 },
      ];
      const warnings = runValidation(items);
      const highWarnings = warnings.filter((w) => w.type === "highRate");
      expect(highWarnings.length).toBeGreaterThanOrEqual(1);
      expect(highWarnings.some((w) => w.message.includes("labor"))).toBe(true);
    });
  });

  // ── Missing CSI code ──
  describe("missingCode warnings", () => {
    it("warns individually when 1-3 items lack a code", () => {
      const items = [
        { id: "1", description: "Drywall", quantity: 10, code: "" },
        { id: "2", description: "Paint", quantity: 5, code: null },
      ];
      const warnings = runValidation(items);
      const codeWarnings = warnings.filter((w) => w.type === "missingCode");
      expect(codeWarnings).toHaveLength(2);
      expect(codeWarnings[0].severity).toBe("info");
      expect(codeWarnings[0].itemId).toBe("1");
      expect(codeWarnings[1].itemId).toBe("2");
    });

    it("produces single summary when >3 items lack a code", () => {
      const items = [
        { id: "1", description: "A", quantity: 1 },
        { id: "2", description: "B", quantity: 1 },
        { id: "3", description: "C", quantity: 1 },
        { id: "4", description: "D", quantity: 1 },
      ];
      const warnings = runValidation(items);
      const codeWarnings = warnings.filter((w) => w.type === "missingCode");
      expect(codeWarnings).toHaveLength(1);
      expect(codeWarnings[0].message).toContain("4 items");
      expect(codeWarnings[0].itemId).toBeUndefined();
    });

    it("does not warn for items with quantity 0", () => {
      const items = [
        { id: "1", description: "Placeholder", quantity: 0 },
      ];
      const warnings = runValidation(items);
      const codeWarnings = warnings.filter((w) => w.type === "missingCode");
      expect(codeWarnings).toHaveLength(0);
    });

    it("does not warn for items with no description", () => {
      const items = [
        { id: "1", description: "", quantity: 10 },
        { id: "2", description: null, quantity: 10 },
      ];
      const warnings = runValidation(items);
      const codeWarnings = warnings.filter((w) => w.type === "missingCode");
      expect(codeWarnings).toHaveLength(0);
    });

    it("does not warn when items have codes", () => {
      const items = [
        { id: "1", description: "Drywall", quantity: 10, code: "092900" },
      ];
      const warnings = runValidation(items);
      const codeWarnings = warnings.filter((w) => w.type === "missingCode");
      expect(codeWarnings).toHaveLength(0);
    });
  });

  // ── Duplicate items ──
  describe("duplicate warnings", () => {
    it("flags duplicate items with same code and description", () => {
      const items = [
        { id: "1", description: "Drywall 5/8", code: "092900", quantity: 100, material: 500 },
        { id: "2", description: "Drywall 5/8", code: "092900", quantity: 200, material: 1000 },
      ];
      const warnings = runValidation(items);
      const dupeWarnings = warnings.filter((w) => w.type === "duplicate");
      expect(dupeWarnings).toHaveLength(1);
      expect(dupeWarnings[0].severity).toBe("warn");
      expect(dupeWarnings[0].itemId).toBe("2");
      expect(dupeWarnings[0].message).toContain("Drywall 5/8");
      expect(dupeWarnings[0].message).toContain("2 times");
    });

    it("is case-insensitive for description matching", () => {
      const items = [
        { id: "1", description: "Drywall", code: "09", quantity: 1, material: 10 },
        { id: "2", description: "drywall", code: "09", quantity: 1, material: 10 },
      ];
      const warnings = runValidation(items);
      const dupeWarnings = warnings.filter((w) => w.type === "duplicate");
      expect(dupeWarnings).toHaveLength(1);
    });

    it("does not flag items with different codes as duplicates", () => {
      const items = [
        { id: "1", description: "Drywall", code: "092900", quantity: 1, material: 10 },
        { id: "2", description: "Drywall", code: "092116", quantity: 1, material: 10 },
      ];
      const warnings = runValidation(items);
      const dupeWarnings = warnings.filter((w) => w.type === "duplicate");
      expect(dupeWarnings).toHaveLength(0);
    });

    it("does not flag items without descriptions", () => {
      const items = [
        { id: "1", code: "09", quantity: 1, material: 10 },
        { id: "2", code: "09", quantity: 1, material: 10 },
      ];
      const warnings = runValidation(items);
      const dupeWarnings = warnings.filter((w) => w.type === "duplicate");
      expect(dupeWarnings).toHaveLength(0);
    });

    it("reports count for 3+ duplicates", () => {
      const items = [
        { id: "1", description: "Tape", code: "09", quantity: 1, material: 5 },
        { id: "2", description: "Tape", code: "09", quantity: 2, material: 10 },
        { id: "3", description: "Tape", code: "09", quantity: 3, material: 15 },
      ];
      const warnings = runValidation(items);
      const dupeWarnings = warnings.filter((w) => w.type === "duplicate");
      expect(dupeWarnings).toHaveLength(1);
      expect(dupeWarnings[0].message).toContain("3 times");
    });
  });

  // ── Clean items ──
  describe("clean items", () => {
    it("returns empty array for fully valid items", () => {
      const items = [
        { id: "1", description: "Concrete", code: "033000", quantity: 50, material: 5000, labor: 2000, equipment: 500, subcontractor: 0, division: "03 Concrete" },
        { id: "2", description: "Rebar", code: "032100", quantity: 2000, material: 3000, labor: 1500, equipment: 0, subcontractor: 0, division: "03 Concrete" },
      ];
      const warnings = runValidation(items);
      expect(warnings).toEqual([]);
    });
  });

  // ── Combined checks ──
  describe("combined / integration", () => {
    it("can return multiple warning types at once", () => {
      const items = [
        // zero-cost
        { id: "1", description: "Paint", quantity: 100, material: 0, labor: 0, equipment: 0, subcontractor: 0 },
        // missing code
        { id: "2", description: "Nails", quantity: 50, material: 10, labor: 5 },
        // duplicate
        { id: "3", description: "Bolts", code: "05", quantity: 10, material: 20 },
        { id: "4", description: "Bolts", code: "05", quantity: 10, material: 20 },
      ];
      const warnings = runValidation(items);
      const types = [...new Set(warnings.map((w) => w.type))];
      expect(types).toContain("zeroTotal");
      expect(types).toContain("missingCode");
      expect(types).toContain("duplicate");
    });
  });
});
