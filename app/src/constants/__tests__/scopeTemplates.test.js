import { getScopeTemplateTypes, getScopeTemplatePreview, generateScopeTemplate } from "@/constants/scopeTemplates";

describe("scopeTemplates", () => {
  const types = getScopeTemplateTypes();
  const typeKeys = types.map((t) => t.value);

  it("exports at least one building type", () => {
    expect(types.length).toBeGreaterThan(0);
  });

  it("includes expected building types", () => {
    expect(typeKeys).toContain("commercial-office");
    expect(typeKeys).toContain("healthcare");
    expect(typeKeys).toContain("residential-single");
    expect(typeKeys).toContain("restaurant");
  });

  describe.each(typeKeys)("building type: %s", (buildingType) => {
    const preview = getScopeTemplatePreview(buildingType);

    it("has a non-empty items array", () => {
      expect(preview).not.toBeNull();
      expect(preview.items.length).toBeGreaterThan(0);
    });

    it("every scope item has description (string), unit (string)", () => {
      for (const item of preview.items) {
        expect(typeof item.description).toBe("string");
        expect(item.description.length).toBeGreaterThan(0);
        expect(typeof item.unit).toBe("string");
        expect(item.unit.length).toBeGreaterThan(0);
      }
    });
  });

  describe("generated items have valid rate fields", () => {
    it.each(typeKeys)("%s: every item with numeric rates has lowRate <= highRate", (buildingType) => {
      const generated = generateScopeTemplate(buildingType, 10000, { floors: 2 });
      expect(generated.items.length).toBeGreaterThan(0);

      for (const item of generated.items) {
        // Items with pctOfTotal have null lowRate/highRate — skip those
        if (item.lowRate == null && item.highRate == null) continue;

        expect(typeof item.lowRate).toBe("number");
        expect(typeof item.highRate).toBe("number");
        expect(item.lowRate).toBeLessThanOrEqual(item.highRate);
      }
    });
  });

  describe("qtyFn produces numeric quantities", () => {
    it.each(typeKeys)("%s: generateScopeTemplate returns items with numeric qty", (buildingType) => {
      const generated = generateScopeTemplate(buildingType, 5000, { floors: 1 });
      for (const item of generated.items) {
        expect(typeof item.qty).toBe("number");
        expect(item.qty).toBeGreaterThan(0);
        expect(Number.isFinite(item.qty)).toBe(true);
      }
    });
  });

  it("returns empty items for unknown building type", () => {
    const result = generateScopeTemplate("nonexistent-type", 5000);
    expect(result.items).toEqual([]);
  });
});
