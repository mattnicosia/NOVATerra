import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external dependencies
vi.mock("@/constants/seedAssemblies", () => ({
  SEED_ELEMENTS: [
    {
      id: "seed-1",
      name: "Metal Stud Wall 3-5/8 20ga",
      code: "05.400",
      unit: "SF",
      trade: "Metals",
      material: 2.5,
      labor: 3.0,
      equipment: 0.25,
      subcontractor: 0,
    },
    {
      id: "seed-2",
      name: "Hollow Metal Door 3070",
      code: "08.110",
      unit: "EA",
      trade: "Openings",
      material: 450,
      labor: 180,
      equipment: 0,
      subcontractor: 0,
    },
    {
      id: "seed-3",
      name: "Aluminum Window Fixed",
      code: "08.510",
      unit: "EA",
      trade: "Openings",
      material: 650,
      labor: 200,
      equipment: 25,
      subcontractor: 0,
    },
    {
      id: "seed-4",
      name: "Plumbing Lavatory Wall Mount",
      code: "22.400",
      unit: "EA",
      trade: "Plumbing",
      material: 350,
      labor: 250,
      equipment: 0,
      subcontractor: 0,
    },
  ],
}));

vi.mock("@/utils/ai", () => ({
  callAnthropic: vi.fn(),
}));

vi.mock("@/utils/vectorSearch", () => ({
  searchSimilar: vi.fn().mockRejectedValue(new Error("not available")),
}));

vi.mock("@/constants/constructionTypes", () => ({
  getWorkTypeMultiplier: vi.fn(key => {
    const map = {
      "new-construction": 1.0,
      renovation: 1.15,
      "tenant-improvement": 0.85,
      addition: 1.1,
    };
    return map[key] ?? 1.0;
  }),
}));

vi.mock("@/constants/subdivisionBenchmarks", () => ({
  SUBDIVISION_BENCHMARKS: {},
  DEFAULT_SUBDIVISIONS: {},
}));

vi.mock("@/utils/confidenceEngine", () => ({
  computeSubdivisionBreakdown: vi.fn(() => []),
}));

vi.mock("@/utils/subdivisionAI", () => ({
  generateAllSubdivisions: vi.fn(async () => ({})),
}));

import {
  getBuildingParamMultipliers,
  generateBaselineROM,
  extractBuildingParamsFromSchedules,
  computeCalibration,
} from "@/utils/romEngine";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── getBuildingParamMultipliers ──────────────────────────────────────

describe("getBuildingParamMultipliers", () => {
  it("returns empty object for no params", () => {
    expect(getBuildingParamMultipliers({})).toEqual({});
  });

  it("returns empty for zero floors and no rooms", () => {
    expect(getBuildingParamMultipliers({ floorCount: 0, roomCounts: {} })).toEqual({});
  });

  it("returns empty when called with no argument", () => {
    expect(getBuildingParamMultipliers()).toEqual({});
  });

  // Floor count impacts
  it("adds concrete + metals multiplier for 5-story building", () => {
    const m = getBuildingParamMultipliers({ floorCount: 5 });
    expect(m["03"]).toBeCloseTo(1.08, 2);
    expect(m["05"]).toBeCloseTo(1.1, 2);
  });

  it("adds elevator multiplier for 2+ stories", () => {
    const m = getBuildingParamMultipliers({ floorCount: 3 });
    expect(m["14"]).toBeCloseTo(1.3, 2);
  });

  it("no elevator multiplier for 1-story", () => {
    const m = getBuildingParamMultipliers({ floorCount: 1 });
    expect(m["14"]).toBeUndefined();
  });

  it("adds fire suppression for 3+ stories", () => {
    const m = getBuildingParamMultipliers({ floorCount: 4 });
    expect(m["21"]).toBeCloseTo(1.16, 2);
  });

  it("no fire suppression for 2 stories", () => {
    const m = getBuildingParamMultipliers({ floorCount: 2 });
    expect(m["21"]).toBeUndefined();
  });

  it("adds vertical MEP runs for 3+ stories", () => {
    const m = getBuildingParamMultipliers({ floorCount: 5 });
    expect(m["22"]).toBeGreaterThan(1);
    expect(m["23"]).toBeGreaterThan(1);
    expect(m["26"]).toBeGreaterThan(1);
  });

  // Basement impacts
  it("adds basement multipliers for 1 basement", () => {
    const m = getBuildingParamMultipliers({ basementCount: 1 });
    expect(m["02"]).toBeCloseTo(1.15, 2);
    expect(m["03"]).toBeCloseTo(1.1, 2);
    expect(m["07"]).toBeCloseTo(1.08, 2);
    expect(m["31"]).toBeCloseTo(1.2, 2);
  });

  it("adds basement multipliers for 2 basements", () => {
    const m = getBuildingParamMultipliers({ basementCount: 2 });
    expect(m["02"]).toBeCloseTo(1.3, 2);
    expect(m["31"]).toBeCloseTo(1.4, 2);
  });

  // Room count impacts
  it("adds plumbing multiplier for high bathroom count", () => {
    const m = getBuildingParamMultipliers({ roomCounts: { bathrooms: 8 } });
    expect(m["22"]).toBeCloseTo(1.08, 2);
  });

  it("no bathroom multiplier for 4 or fewer", () => {
    const m = getBuildingParamMultipliers({ roomCounts: { bathrooms: 4 } });
    expect(m["22"]).toBeUndefined();
  });

  it("adds kitchen impact on equipment + plumbing", () => {
    const m = getBuildingParamMultipliers({ roomCounts: { kitchens: 2 } });
    expect(m["11"]).toBeCloseTo(1.2, 2);
    expect(m["22"]).toBeCloseTo(1.1, 2);
  });

  it("adds elevator room impact on conveying", () => {
    const m = getBuildingParamMultipliers({ roomCounts: { elevators: 3 } });
    expect(m["14"]).toBeCloseTo(1.5, 2);
  });

  it("single elevator adds no extra conveying", () => {
    const m = getBuildingParamMultipliers({ roomCounts: { elevators: 1 } });
    expect(m["14"]).toBeCloseTo(1.0, 2);
  });

  it("adds server room impact on HVAC/electrical/comms", () => {
    const m = getBuildingParamMultipliers({ roomCounts: { serverRooms: 2 } });
    expect(m["23"]).toBeCloseTo(1.12, 2);
    expect(m["26"]).toBeCloseTo(1.08, 2);
    expect(m["27"]).toBeCloseTo(1.16, 2);
  });

  it("adds residential units finish + plumbing for >4 units", () => {
    const m = getBuildingParamMultipliers({ roomCounts: { residentialUnits: 10 } });
    expect(m["09"]).toBeCloseTo(1.06, 2);
    expect(m["22"]).toBeCloseTo(1.06, 2);
  });

  it("no residential unit multiplier for 4 or fewer", () => {
    const m = getBuildingParamMultipliers({ roomCounts: { residentialUnits: 4 } });
    expect(m["09"]).toBeUndefined();
  });

  // Capping
  it("caps multipliers at 2.5x max", () => {
    const m = getBuildingParamMultipliers({ floorCount: 50 });
    expect(m["03"]).toBe(2.5);
  });

  it("all values are >= 0.5", () => {
    const m = getBuildingParamMultipliers({ floorCount: 1 });
    Object.values(m).forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0.5);
    });
  });

  // Compounding
  it("compounds floor + basement for concrete division", () => {
    const m = getBuildingParamMultipliers({ floorCount: 5, basementCount: 2 });
    // Concrete: (1 + (5-3)*0.04) from floors = 1.08, then + 2*0.10 from basements = 1.28
    expect(m["03"]).toBeCloseTo(1.28, 2);
  });
});

// ─── generateBaselineROM ─────────────────────────────────────────────

describe("generateBaselineROM", () => {
  it("generates ROM for commercial office", () => {
    const rom = generateBaselineROM(10000, "commercial-office");
    expect(rom.projectSF).toBe(10000);
    expect(rom.sfMissing).toBe(false);
    expect(rom.jobType).toBe("commercial-office");
    expect(rom.buildingType).toBe("commercial-office");
    expect(rom.totals.low).toBeGreaterThan(0);
    expect(rom.totals.mid).toBeGreaterThan(rom.totals.low);
    expect(rom.totals.high).toBeGreaterThan(rom.totals.mid);
  });

  it("returns zero totals for zero SF", () => {
    const rom = generateBaselineROM(0, "commercial-office");
    expect(rom.sfMissing).toBe(true);
    expect(rom.totals.low).toBe(0);
    expect(rom.totals.mid).toBe(0);
    expect(rom.totals.high).toBe(0);
  });

  it("handles string SF by parsing to float", () => {
    const rom = generateBaselineROM("15000", "commercial-office");
    expect(rom.projectSF).toBe(15000);
    expect(rom.totals.mid).toBeGreaterThan(0);
  });

  it("handles invalid SF gracefully", () => {
    const rom = generateBaselineROM("abc", "commercial-office");
    expect(rom.projectSF).toBe(0);
    expect(rom.sfMissing).toBe(true);
  });

  it("handles unknown building type by falling back to default", () => {
    const rom = generateBaselineROM(5000, "unknown-type-xyz");
    expect(rom.totals.mid).toBeGreaterThan(0);
    // Should get commercial-office benchmarks as default
    const office = generateBaselineROM(5000, "commercial-office");
    expect(rom.totals.mid).toBe(office.totals.mid);
  });

  it("defaults to commercial-office in return object for unknown type", () => {
    const rom = generateBaselineROM(5000, null);
    expect(rom.jobType).toBe("commercial-office");
    expect(rom.buildingType).toBe("commercial-office");
  });

  it("includes division-level breakdowns", () => {
    const rom = generateBaselineROM(10000, "commercial-office");
    expect(rom.divisions["03"]).toBeDefined();
    expect(rom.divisions["03"].label).toBe("Concrete");
    expect(rom.divisions["03"].perSF.mid).toBeGreaterThan(0);
    expect(rom.divisions["03"].total.mid).toBe(Math.round(10000 * rom.divisions["03"].perSF.mid));
  });

  it("applies work type multiplier (new 4-arg signature)", () => {
    const romNew = generateBaselineROM(10000, "commercial-office", "new-construction");
    const romReno = generateBaselineROM(10000, "commercial-office", "renovation");
    // Renovation multiplier is 1.15, so should be ~15% more
    expect(romReno.totals.mid).toBeGreaterThan(romNew.totals.mid);
    expect(romReno.workMultiplier).toBe(1.15);
  });

  it("sets workMultiplier to 1.0 when no work type", () => {
    const rom = generateBaselineROM(10000, "commercial-office");
    expect(rom.workMultiplier).toBe(1.0);
  });

  it("applies calibration factors (old 3-arg signature)", () => {
    const romBase = generateBaselineROM(10000, "commercial-office");
    const romCalib = generateBaselineROM(10000, "commercial-office", { "03": 1.5 });
    expect(romCalib.divisions["03"].total.mid).toBeGreaterThan(romBase.divisions["03"].total.mid);
    expect(romCalib.calibrated).toBe(true);
    expect(romCalib.calibrationCount).toBe(1);
  });

  it("applies calibration factors (new 4-arg signature)", () => {
    const romBase = generateBaselineROM(10000, "commercial-office", "new-construction");
    const romCalib = generateBaselineROM(10000, "commercial-office", "new-construction", { "03": 1.5 });
    expect(romCalib.divisions["03"].total.mid).toBeGreaterThan(romBase.divisions["03"].total.mid);
    expect(romCalib.calibrated).toBe(true);
  });

  it("calibrated is false when no calibration factors", () => {
    const rom = generateBaselineROM(10000, "commercial-office");
    expect(rom.calibrated).toBe(false);
    expect(rom.calibrationCount).toBe(0);
  });

  it("applies building param multipliers", () => {
    const romBase = generateBaselineROM(10000, "commercial-office");
    const romFloors = generateBaselineROM(10000, "commercial-office", null, null, { floorCount: 10 });
    expect(romFloors.buildingParamAdjusted).toBe(true);
    expect(romFloors.divisions["03"]?.total.mid).toBeGreaterThan(romBase.divisions["03"].total.mid);
  });

  it("buildingParamAdjusted is false with no building params", () => {
    const rom = generateBaselineROM(10000, "commercial-office");
    expect(rom.buildingParamAdjusted).toBe(false);
  });

  it("division totals sum approximately to grand total", () => {
    const rom = generateBaselineROM(10000, "commercial-office");
    const divSum = Object.values(rom.divisions).reduce((s, d) => s + d.total.mid, 0);
    expect(Math.abs(divSum - rom.totals.mid)).toBeLessThan(Object.keys(rom.divisions).length);
  });

  it("per-SF rates match known benchmarks for commercial-office", () => {
    const rom = generateBaselineROM(10000, "commercial-office");
    expect(rom.divisions["03"].perSF.low).toBe(8);
    expect(rom.divisions["03"].perSF.mid).toBe(14);
    expect(rom.divisions["03"].perSF.high).toBe(22);
  });

  it("healthcare is more expensive than commercial office", () => {
    const office = generateBaselineROM(10000, "commercial-office");
    const health = generateBaselineROM(10000, "healthcare");
    expect(health.totals.mid).toBeGreaterThan(office.totals.mid);
  });

  it("retail has fewer divisions than commercial office", () => {
    const office = generateBaselineROM(10000, "commercial-office");
    const retail = generateBaselineROM(10000, "retail");
    expect(Object.keys(retail.divisions).length).toBeLessThan(Object.keys(office.divisions).length);
  });

  it("handles all known building types without error", () => {
    const types = [
      "commercial-office",
      "retail",
      "healthcare",
      "education",
      "industrial",
      "residential-multi",
      "hospitality",
      "residential-single",
      "mixed-use",
      "government",
      "religious",
      "restaurant",
      "parking",
    ];
    types.forEach(t => {
      const rom = generateBaselineROM(10000, t);
      expect(rom.totals.mid).toBeGreaterThan(0);
      expect(rom.buildingType).toBe(t);
    });
  });

  it("perSF values are rounded to 2 decimal places", () => {
    const rom = generateBaselineROM(10000, "commercial-office", "renovation", { "03": 1.333 });
    const perSF = rom.divisions["03"].perSF;
    // Check that values have at most 2 decimal places
    expect(perSF.mid).toBe(Math.round(perSF.mid * 100) / 100);
  });

  it("total values are rounded to integers", () => {
    const rom = generateBaselineROM(7777, "commercial-office");
    Object.values(rom.divisions).forEach(d => {
      expect(Number.isInteger(d.total.low)).toBe(true);
      expect(Number.isInteger(d.total.mid)).toBe(true);
      expect(Number.isInteger(d.total.high)).toBe(true);
    });
  });

  it("division totals are zero when SF is zero", () => {
    const rom = generateBaselineROM(0, "commercial-office");
    Object.values(rom.divisions).forEach(d => {
      expect(d.total.low).toBe(0);
      expect(d.total.mid).toBe(0);
      expect(d.total.high).toBe(0);
    });
  });
});

// ─── computeCalibration ──────────────────────────────────────────────

describe("computeCalibration", () => {
  it("returns empty when romPrediction is null", () => {
    expect(computeCalibration(null, { divisions: {} })).toEqual({});
  });

  it("returns empty when actuals is null", () => {
    expect(computeCalibration({ divisions: {} }, null)).toEqual({});
  });

  it("returns empty when romPrediction has no divisions", () => {
    expect(computeCalibration({}, { divisions: { "03": 100000 } })).toEqual({});
  });

  it("computes calibration ratio for each division", () => {
    const rom = {
      divisions: {
        "03": { total: { mid: 100000 } },
        "05": { total: { mid: 50000 } },
      },
    };
    const actuals = {
      divisions: {
        "03": 120000,
        "05": 45000,
      },
    };
    const cal = computeCalibration(rom, actuals);
    expect(cal["03"]).toBeCloseTo(1.2, 2);
    expect(cal["05"]).toBeCloseTo(0.9, 2);
  });

  it("skips divisions where predicted mid is zero", () => {
    const rom = { divisions: { "03": { total: { mid: 0 } } } };
    const actuals = { divisions: { "03": 100000 } };
    expect(computeCalibration(rom, actuals)).toEqual({});
  });

  it("skips divisions where actual is zero", () => {
    const rom = { divisions: { "03": { total: { mid: 100000 } } } };
    const actuals = { divisions: { "03": 0 } };
    expect(computeCalibration(rom, actuals)).toEqual({});
  });

  it("skips divisions missing from actuals", () => {
    const rom = { divisions: { "03": { total: { mid: 100000 } } } };
    const actuals = { divisions: {} };
    expect(computeCalibration(rom, actuals)).toEqual({});
  });

  it("rounds calibration to 2 decimal places", () => {
    const rom = { divisions: { "03": { total: { mid: 30000 } } } };
    const actuals = { divisions: { "03": 33333 } };
    const cal = computeCalibration(rom, actuals);
    expect(cal["03"]).toBe(Math.round((33333 / 30000) * 100) / 100);
  });
});

// ─── extractBuildingParamsFromSchedules ───────────────────────────────

describe("extractBuildingParamsFromSchedules", () => {
  it("returns empty counts for no schedules", () => {
    const result = extractBuildingParamsFromSchedules([]);
    expect(result.roomCounts).toEqual({});
    expect(result.floorCount).toBe(0);
    expect(result.detectedFloors).toEqual([]);
  });

  it("returns empty counts for schedules with no entries", () => {
    const result = extractBuildingParamsFromSchedules([{ type: "finish", entries: [] }]);
    expect(result.roomCounts).toEqual({});
  });

  // Room name detection from finish schedules
  it("detects bathrooms from room names", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "finish",
        entries: [{ room: "Bathroom 1" }, { room: "Restroom" }, { room: "Powder Room" }],
      },
    ]);
    expect(result.roomCounts.bathrooms).toBe(3);
  });

  it("detects kitchens from room names", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "finish",
        entries: [{ room: "Kitchen" }, { room: "Kitchenette" }],
      },
    ]);
    expect(result.roomCounts.kitchens).toBe(2);
  });

  it("detects staircases from room names", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "finish",
        entries: [{ room: "Stair A" }, { room: "Stairwell B" }],
      },
    ]);
    expect(result.roomCounts.staircases).toBe(2);
  });

  it("detects offices from room names", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "finish",
        entries: [{ room: "Office 101" }, { room: "Director Office" }],
      },
    ]);
    expect(result.roomCounts.offices).toBe(2);
  });

  it("detects conference rooms from room names", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "finish",
        entries: [{ room: "Conference Room A" }, { room: "Huddle Room" }],
      },
    ]);
    expect(result.roomCounts.conferenceRooms).toBe(2);
  });

  it("detects elevators from room names", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "finish",
        entries: [{ room: "Elevator 1" }, { room: "Elevator 2" }],
      },
    ]);
    expect(result.roomCounts.elevators).toBe(2);
  });

  it("detects server rooms from room names", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "finish",
        entries: [{ room: "Server Room" }, { room: "IT Room" }],
      },
    ]);
    expect(result.roomCounts.serverRooms).toBe(2);
  });

  it("detects residential units from room names", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "finish",
        entries: [{ room: "Unit 101" }, { room: "Apartment 202" }],
      },
    ]);
    expect(result.roomCounts.residentialUnits).toBe(2);
  });

  // Finish material inference (Pass 2)
  it("infers bathroom from tile floor + full tile walls", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "finish",
        entries: [
          {
            room: "Room 201",
            floor: "Ceramic Tile",
            north_wall: "Ceramic Tile floor to ceiling",
            south_wall: "Ceramic Tile floor to ceiling",
          },
        ],
      },
    ]);
    expect(result.roomCounts.bathrooms).toBe(1);
  });

  it("infers kitchen from tile floor + partial tile walls (backsplash)", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "finish",
        entries: [
          {
            room: "Room 105",
            floor: "Porcelain Tile",
            north_wall: "Ceramic Tile backsplash to 48 inches",
          },
        ],
      },
    ]);
    expect(result.roomCounts.kitchens).toBe(1);
  });

  // Floor detection
  it("detects floor numbers from room names (ordinal pattern)", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "finish",
        entries: [{ room: "1st Floor Lobby" }, { room: "2nd Floor Office" }, { room: "3rd Floor Conference" }],
      },
    ]);
    expect(result.floorCount).toBe(3);
    expect(result.detectedFloors).toEqual([1, 2, 3]);
  });

  it("detects floor numbers from Level pattern", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "finish",
        entries: [{ room: "Level 1 Lobby" }, { room: "Level 4 Office" }],
      },
    ]);
    expect(result.floorCount).toBe(4);
    expect(result.detectedFloors).toContain(1);
    expect(result.detectedFloors).toContain(4);
  });

  it("deduplicates floor numbers", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "finish",
        entries: [{ room: "1st Floor Office A" }, { room: "1st Floor Office B" }],
      },
    ]);
    expect(result.floorCount).toBe(1);
    expect(result.detectedFloors).toEqual([1]);
  });

  // Plumbing fixture cross-reference
  it("counts bathrooms from plumbing fixture schedule (toilets)", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "plumbing-fixture",
        entries: [{ fixture_type: "Toilet" }, { fixture_type: "Water Closet" }, { fixture_type: "Urinal" }],
      },
    ]);
    expect(result.roomCounts.bathrooms).toBe(3);
  });

  it("detects kitchens from plumbing fixture schedule (kitchen sinks)", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "plumbing-fixture",
        entries: [{ fixture_type: "Kitchen Sink", mark: "KS-1" }],
      },
    ]);
    expect(result.roomCounts.kitchens).toBe(1);
  });

  it("takes max of finish-count and fixture-count for bathrooms", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "finish",
        entries: [{ room: "Bathroom 1" }, { room: "Bathroom 2" }],
      },
      {
        type: "plumbing-fixture",
        entries: [
          { fixture_type: "Toilet" },
          { fixture_type: "Toilet" },
          { fixture_type: "Toilet" },
          { fixture_type: "Toilet" },
        ],
      },
    ]);
    // Finish count = 2, fixture count = 4 (from toilets), should take max = 4
    expect(result.roomCounts.bathrooms).toBe(4);
  });

  // Equipment schedule
  it("detects kitchen from equipment schedule", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "equipment",
        entries: [{ description: "Commercial Range/Oven" }, { description: "Walk-in Refrigerator" }],
      },
    ]);
    expect(result.roomCounts.kitchens).toBe(1);
  });

  // Floor count capping
  it("caps floor count at 99", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "finish",
        entries: [{ room: "Floor 150 Penthouse" }],
      },
    ]);
    expect(result.floorCount).toBe(99);
  });

  // Skips empty rooms
  it("skips finish entries with no room name", () => {
    const result = extractBuildingParamsFromSchedules([
      {
        type: "finish",
        entries: [{ room: "", floor: "Carpet" }],
      },
    ]);
    expect(result.roomCounts).toEqual({});
  });
});

// ─── isNone helper (tested indirectly via finish line items) ─────────
// The isNone function is internal, but we test it through extractBuildingParamsFromSchedules
// and generateScheduleLineItems behavior

describe("edge cases", () => {
  it("generateBaselineROM with both calibration and building params", () => {
    const rom = generateBaselineROM(10000, "commercial-office", "renovation", { "03": 1.2 }, { floorCount: 6 });
    // Should apply all three multipliers: work type (1.15) * calibration (1.2) * building param
    expect(rom.calibrated).toBe(true);
    expect(rom.buildingParamAdjusted).toBe(true);
    expect(rom.workMultiplier).toBe(1.15);
    const baseRom = generateBaselineROM(10000, "commercial-office");
    expect(rom.divisions["03"].total.mid).toBeGreaterThan(baseRom.divisions["03"].total.mid);
  });

  it("generateBaselineROM with tenant-improvement work type", () => {
    const rom = generateBaselineROM(10000, "commercial-office", "tenant-improvement");
    const base = generateBaselineROM(10000, "commercial-office", "new-construction");
    // TI multiplier is 0.85, should be cheaper
    expect(rom.totals.mid).toBeLessThan(base.totals.mid);
  });

  it("parking garage has very high concrete allocation", () => {
    const rom = generateBaselineROM(10000, "parking");
    // Parking concrete: mid = 25 $/SF, highest among all types
    expect(rom.divisions["03"].perSF.mid).toBe(25);
  });

  it("restaurant has equipment division (div 11)", () => {
    const rom = generateBaselineROM(10000, "restaurant");
    expect(rom.divisions["11"]).toBeDefined();
    expect(rom.divisions["11"].perSF.mid).toBe(30);
  });
});
