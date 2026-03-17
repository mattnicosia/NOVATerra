import { describe, it, expect } from "vitest";

import {
  SCHEDULE_TYPES,
  buildDetectionPrompt,
  buildParsePrompt,
  normalizeScheduleData,
  buildCountingPrompt,
  getScheduleDivisions,
} from "@/utils/scheduleParsers";

describe("scheduleParsers", () => {
  // ─── SCHEDULE_TYPES constant ─────────────────────────────────────
  describe("SCHEDULE_TYPES", () => {
    it("contains exactly 9 schedule types", () => {
      expect(SCHEDULE_TYPES).toHaveLength(9);
    });

    it("has correct IDs for all 9 types", () => {
      const ids = SCHEDULE_TYPES.map(t => t.id);
      expect(ids).toEqual([
        "wall-types",
        "door",
        "window",
        "finish",
        "plumbing-fixture",
        "equipment",
        "lighting-fixture",
        "mechanical-equipment",
        "finish-detail",
      ]);
    });

    it("every type has a label, keywords, outputFields, and csiDivisions", () => {
      SCHEDULE_TYPES.forEach(t => {
        expect(t.label).toBeTruthy();
        expect(t.keywords.length).toBeGreaterThan(0);
        expect(t.outputFields.length).toBeGreaterThan(0);
        expect(t.csiDivisions.length).toBeGreaterThan(0);
      });
    });

    it("wall-types maps to CSI divisions 05 and 09", () => {
      const wt = SCHEDULE_TYPES.find(t => t.id === "wall-types");
      expect(wt.csiDivisions).toEqual(["05", "09"]);
    });

    it("door and window map to CSI division 08", () => {
      const door = SCHEDULE_TYPES.find(t => t.id === "door");
      const window = SCHEDULE_TYPES.find(t => t.id === "window");
      expect(door.csiDivisions).toEqual(["08"]);
      expect(window.csiDivisions).toEqual(["08"]);
    });

    it("lighting-fixture maps to CSI division 26", () => {
      const lf = SCHEDULE_TYPES.find(t => t.id === "lighting-fixture");
      expect(lf.csiDivisions).toEqual(["26"]);
    });

    it("mechanical-equipment maps to CSI division 23", () => {
      const me = SCHEDULE_TYPES.find(t => t.id === "mechanical-equipment");
      expect(me.csiDivisions).toEqual(["23"]);
    });

    it("plumbing-fixture maps to CSI division 22", () => {
      const pf = SCHEDULE_TYPES.find(t => t.id === "plumbing-fixture");
      expect(pf.csiDivisions).toEqual(["22"]);
    });

    it("door outputFields include mark, width, height, fire_rating", () => {
      const door = SCHEDULE_TYPES.find(t => t.id === "door");
      expect(door.outputFields).toContain("mark");
      expect(door.outputFields).toContain("width");
      expect(door.outputFields).toContain("height");
      expect(door.outputFields).toContain("fire_rating");
      expect(door.outputFields).toContain("quantity");
    });

    it("wall-types outputFields include typeLabel and finish", () => {
      const wt = SCHEDULE_TYPES.find(t => t.id === "wall-types");
      expect(wt.outputFields).toContain("typeLabel");
      expect(wt.outputFields).toContain("finish");
      expect(wt.outputFields).toContain("insulation");
    });
  });

  // ─── buildDetectionPrompt ────────────────────────────────────────
  describe("buildDetectionPrompt", () => {
    it("returns a string containing known schedule type IDs", () => {
      const prompt = buildDetectionPrompt("A1.1");
      expect(prompt).toContain("wall-types");
      expect(prompt).toContain("door");
      expect(prompt).toContain("window");
      expect(prompt).toContain("finish");
    });

    it("includes the drawing label", () => {
      const prompt = buildDetectionPrompt("A2.3");
      expect(prompt).toContain('"A2.3"');
    });

    it("works with no drawing label", () => {
      const prompt = buildDetectionPrompt("");
      expect(prompt).toContain("construction drawing sheet");
      expect(prompt).not.toContain('labeled ""');
    });

    it("includes OCR text when provided", () => {
      const prompt = buildDetectionPrompt("A1", "DOOR SCHEDULE\nMark Width Height");
      expect(prompt).toContain("OCR-EXTRACTED TEXT");
      expect(prompt).toContain("DOOR SCHEDULE");
    });

    it("does not include OCR section when ocrText is null", () => {
      const prompt = buildDetectionPrompt("A1", null);
      expect(prompt).not.toContain("OCR-EXTRACTED TEXT");
    });

    it("truncates OCR text to 4000 chars", () => {
      const longText = "A".repeat(5000);
      const prompt = buildDetectionPrompt("A1", longText);
      // The prompt should include a sliced version
      expect(prompt).toContain("A".repeat(4000));
    });

    it("contains instructions about what NOT to report", () => {
      const prompt = buildDetectionPrompt("A1");
      expect(prompt).toContain("do NOT report");
      expect(prompt).toContain("Fixture symbols or legends");
    });

    it("requests JSON array output", () => {
      const prompt = buildDetectionPrompt("A1");
      expect(prompt).toContain("Return ONLY a JSON array");
    });
  });

  // ─── buildParsePrompt ────────────────────────────────────────────
  describe("buildParsePrompt", () => {
    it("returns null for unknown schedule type", () => {
      expect(buildParsePrompt("nonexistent")).toBeNull();
    });

    it("returns a prompt string for each valid schedule type", () => {
      SCHEDULE_TYPES.forEach(t => {
        const prompt = buildParsePrompt(t.id);
        expect(typeof prompt).toBe("string");
        expect(prompt.length).toBeGreaterThan(100);
      });
    });

    it("includes type-specific instructions for wall-types", () => {
      const prompt = buildParsePrompt("wall-types");
      expect(prompt).toContain("typeLabel");
      expect(prompt).toContain("EXACT type identifier");
    });

    it("includes type-specific instructions for door", () => {
      const prompt = buildParsePrompt("door");
      expect(prompt).toContain("fire_rating");
      expect(prompt).toContain("hardware");
    });

    it("includes field list for each type", () => {
      const prompt = buildParsePrompt("window");
      expect(prompt).toContain('"mark"');
      expect(prompt).toContain('"glazing"');
    });

    it("includes OCR text when provided", () => {
      const prompt = buildParsePrompt("door", "Mark 101 HM 3'-0\" x 7'-0\"");
      expect(prompt).toContain("OCR-EXTRACTED TEXT");
      expect(prompt).toContain("Mark 101");
    });

    it("does not include OCR section when null", () => {
      const prompt = buildParsePrompt("door", null);
      expect(prompt).not.toContain("OCR-EXTRACTED TEXT");
    });

    it("truncates OCR text to 6000 chars", () => {
      const longText = "B".repeat(7000);
      const prompt = buildParsePrompt("door", longText);
      expect(prompt).toContain("B".repeat(6000));
    });

    it("includes notes context when provided", () => {
      const notes = "All doors shall be Hollow Metal unless noted otherwise.";
      const prompt = buildParsePrompt("door", null, notes);
      expect(prompt).toContain(notes);
      expect(prompt).toContain("USE THESE DRAWING NOTES");
    });

    it("does not include notes section when null", () => {
      const prompt = buildParsePrompt("door", null, null);
      expect(prompt).not.toContain("USE THESE DRAWING NOTES");
    });

    it("contains return-JSON instruction", () => {
      const prompt = buildParsePrompt("finish");
      expect(prompt).toContain("Return ONLY a JSON array");
    });
  });

  // ─── normalizeScheduleData ───────────────────────────────────────
  describe("normalizeScheduleData", () => {
    it("returns empty array for non-array input", () => {
      expect(normalizeScheduleData("door", null)).toEqual([]);
      expect(normalizeScheduleData("door", "string")).toEqual([]);
      expect(normalizeScheduleData("door", 123)).toEqual([]);
      expect(normalizeScheduleData("door", {})).toEqual([]);
    });

    it("returns empty array for empty array input", () => {
      expect(normalizeScheduleData("door", [])).toEqual([]);
    });

    it("ensures all outputFields exist with null defaults", () => {
      const result = normalizeScheduleData("door", [{ mark: "101" }]);
      expect(result).toHaveLength(1);
      expect(result[0].mark).toBe("101");
      expect(result[0].width).toBeNull();
      expect(result[0].height).toBeNull();
      expect(result[0].fire_rating).toBeNull();
      expect(result[0].quantity).toBeNull();
    });

    it("filters out completely empty entries", () => {
      const result = normalizeScheduleData("door", [
        { mark: "101", width: "3'-0\"" },
        {},
        {
          mark: null,
          width: null,
          height: null,
          type: null,
          material: null,
          frame: null,
          hardware: null,
          fire_rating: null,
          quantity: null,
        },
      ]);
      expect(result).toHaveLength(1);
    });

    it("keeps entries with at least one non-null field", () => {
      const result = normalizeScheduleData("door", [{ mark: null, width: null, type: "Flush" }]);
      expect(result).toHaveLength(1);
    });

    it("normalizes wall-type height string to number", () => {
      const result = normalizeScheduleData("wall-types", [{ typeLabel: "A", height: "10'-0\"" }]);
      expect(result[0].height).toBe(10);
    });

    it("normalizes wall-type decimal height", () => {
      const result = normalizeScheduleData("wall-types", [{ typeLabel: "B", height: "9.5 feet" }]);
      expect(result[0].height).toBe(9.5);
    });

    it("leaves wall-type height as-is if already a number", () => {
      const result = normalizeScheduleData("wall-types", [{ typeLabel: "C", height: 12 }]);
      expect(result[0].height).toBe(12);
    });

    it("handles wall-type height with no numeric match", () => {
      const result = normalizeScheduleData("wall-types", [{ typeLabel: "D", height: "varies" }]);
      expect(result[0].height).toBe("varies");
    });

    it("passes through door dimension strings unchanged", () => {
      const result = normalizeScheduleData("door", [{ mark: "101", width: "3'-0\"", height: "7'-0\"" }]);
      expect(result[0].width).toBe("3'-0\"");
      expect(result[0].height).toBe("7'-0\"");
    });

    it("throws for unknown schedule type (filter step references undefined config)", () => {
      expect(() => normalizeScheduleData("unknown-type", [{ foo: "bar" }])).toThrow();
    });

    it("strips extra fields not in outputFields", () => {
      const result = normalizeScheduleData("door", [{ mark: "101", width: "3'-0\"", extraField: "should be removed" }]);
      expect(result[0].extraField).toBeUndefined();
      expect(result[0].mark).toBe("101");
    });

    it("handles all 9 schedule types without errors", () => {
      SCHEDULE_TYPES.forEach(t => {
        const sampleEntry = {};
        t.outputFields.forEach(f => {
          sampleEntry[f] = "test";
        });
        const result = normalizeScheduleData(t.id, [sampleEntry]);
        expect(result).toHaveLength(1);
        t.outputFields.forEach(f => {
          expect(result[0][f]).toBe("test");
        });
      });
    });

    it("filters entries where all fields are empty strings", () => {
      const result = normalizeScheduleData("door", [
        {
          mark: "",
          width: "",
          height: "",
          type: "",
          material: "",
          frame: "",
          hardware: "",
          fire_rating: "",
          quantity: "",
        },
      ]);
      expect(result).toHaveLength(0);
    });
  });

  // ─── buildCountingPrompt ─────────────────────────────────────────
  describe("buildCountingPrompt", () => {
    it("includes schedule type labels and marks", () => {
      const prompt = buildCountingPrompt({
        door: ["A", "B", "C"],
        window: ["W-1", "W-2"],
      });
      expect(prompt).toContain("Door Schedule");
      expect(prompt).toContain('"A"');
      expect(prompt).toContain('"W-1"');
    });

    it("includes OCR text when provided", () => {
      const prompt = buildCountingPrompt({ door: ["A"] }, "Floor plan OCR text");
      expect(prompt).toContain("OCR-EXTRACTED TEXT");
      expect(prompt).toContain("Floor plan OCR text");
    });

    it("does not include OCR section when null", () => {
      const prompt = buildCountingPrompt({ door: ["A"] }, null);
      expect(prompt).not.toContain("OCR-EXTRACTED TEXT");
    });

    it("truncates OCR text to 4000 chars", () => {
      const longText = "C".repeat(5000);
      const prompt = buildCountingPrompt({ door: ["A"] }, longText);
      expect(prompt).toContain("C".repeat(4000));
    });

    it("handles multiple schedule types", () => {
      const prompt = buildCountingPrompt({
        door: ["A"],
        "lighting-fixture": ["F1", "F2"],
        "plumbing-fixture": ["P-1"],
      });
      expect(prompt).toContain("Door Schedule");
      expect(prompt).toContain("Lighting Fixture Schedule");
      expect(prompt).toContain("Plumbing Fixture Schedule");
    });

    it("includes counting instructions", () => {
      const prompt = buildCountingPrompt({ door: ["A"] });
      expect(prompt).toContain("Count EVERY instance");
      expect(prompt).toContain("Return ONLY a JSON object");
    });

    it("falls back gracefully for unknown type in marksByType", () => {
      const prompt = buildCountingPrompt({ "unknown-type": ["X"] });
      expect(prompt).toContain("unknown-type marks:");
    });
  });

  // ─── getScheduleDivisions ────────────────────────────────────────
  describe("getScheduleDivisions", () => {
    it("returns sorted CSI divisions for given schedule types", () => {
      const divs = getScheduleDivisions(["door", "wall-types"]);
      expect(divs).toEqual(["05", "08", "09"]);
    });

    it("deduplicates divisions", () => {
      // door and window both map to 08
      const divs = getScheduleDivisions(["door", "window"]);
      expect(divs).toEqual(["08"]);
    });

    it("returns empty array for empty input", () => {
      expect(getScheduleDivisions([])).toEqual([]);
    });

    it("ignores unknown schedule types", () => {
      const divs = getScheduleDivisions(["door", "nonexistent"]);
      expect(divs).toEqual(["08"]);
    });

    it("returns all divisions for all schedule types", () => {
      const allIds = SCHEDULE_TYPES.map(t => t.id);
      const divs = getScheduleDivisions(allIds);
      expect(divs).toEqual(["05", "08", "09", "11", "22", "23", "26"]);
    });

    it("returns sorted results", () => {
      const divs = getScheduleDivisions(["lighting-fixture", "wall-types", "door"]);
      expect(divs).toEqual(["05", "08", "09", "26"]);
    });
  });
});
