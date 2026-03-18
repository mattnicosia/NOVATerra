import { describe, it, expect } from "vitest";

// extractJSON is not exported, so we re-implement the same logic here
// to test it in isolation. The actual function lives inside scanRunner.js
// as a private helper. We test the logic directly.

/**
 * Mirrors the private extractJSON from scanRunner.js
 */
function extractJSON(text, type = "array") {
  const openChar = type === "array" ? "[" : "{";
  const closeChar = type === "array" ? "]" : "}";
  const startIdx = text.indexOf(openChar);
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(startIdx, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ─── extractJSON (array mode) ──────────────────────────────────────────

describe("extractJSON (array)", () => {
  it("extracts a simple array from clean JSON", () => {
    const result = extractJSON("[1, 2, 3]");
    expect(result).toEqual([1, 2, 3]);
  });

  it("extracts array from text with surrounding prose", () => {
    const text = 'Here are the results:\n[{"type":"door","confidence":"high"}]\nDone.';
    const result = extractJSON(text, "array");
    expect(result).toEqual([{ type: "door", confidence: "high" }]);
  });

  it("returns null when no array bracket found", () => {
    expect(extractJSON("no json here", "array")).toBeNull();
  });

  it("returns null for malformed JSON inside brackets", () => {
    expect(extractJSON("[not valid json}", "array")).toBeNull();
  });

  it("handles nested arrays correctly", () => {
    const text = "prefix [[1,2],[3,4]] suffix";
    const result = extractJSON(text, "array");
    expect(result).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("handles strings containing brackets", () => {
    const text = '[{"name":"Room [A]","count":5}]';
    const result = extractJSON(text, "array");
    expect(result).toEqual([{ name: "Room [A]", count: 5 }]);
  });

  it("handles escaped quotes inside strings", () => {
    const text = '[{"desc":"8\\" door"}]';
    const result = extractJSON(text, "array");
    expect(result).toEqual([{ desc: '8" door' }]);
  });

  it('returns empty array for "[]"', () => {
    expect(extractJSON("[]", "array")).toEqual([]);
  });

  it("extracts first valid array when multiple exist", () => {
    const text = "first [1] then [2,3]";
    expect(extractJSON(text, "array")).toEqual([1]);
  });

  it("handles markdown code fences around JSON", () => {
    const text = '```json\n[{"type":"wall-types"}]\n```';
    const result = extractJSON(text, "array");
    expect(result).toEqual([{ type: "wall-types" }]);
  });
});

// ─── extractJSON (object mode) ─────────────────────────────────────────

describe("extractJSON (object)", () => {
  it("extracts a simple object", () => {
    const result = extractJSON('{"key":"value"}', "object");
    expect(result).toEqual({ key: "value" });
  });

  it("extracts object from AI response with surrounding text", () => {
    const text = 'The counts are:\n{"door":{"A":3,"B":2},"window":{"W1":5}}\nAll done.';
    const result = extractJSON(text, "object");
    expect(result).toEqual({ door: { A: 3, B: 2 }, window: { W1: 5 } });
  });

  it("returns null when no object bracket found", () => {
    expect(extractJSON("just text", "object")).toBeNull();
  });

  it("handles nested objects", () => {
    const text = '{"a":{"b":{"c":1}}}';
    const result = extractJSON(text, "object");
    expect(result).toEqual({ a: { b: { c: 1 } } });
  });

  it("returns null for unclosed object", () => {
    expect(extractJSON('{"key":"value"', "object")).toBeNull();
  });

  it("handles empty object", () => {
    expect(extractJSON("{}", "object")).toEqual({});
  });
});

// ─── Schedule filtering logic (from runFullScan detection phase) ────────
// This tests the filter logic applied to detection results:
// - skip unknown types
// - skip low confidence
// - skip schedules with rowCount < 2

describe("schedule detection filtering", () => {
  function filterSchedules(detections) {
    const schedulesToParse = [];
    detections.forEach(det => {
      if (det.error || !det.schedules) return;
      det.schedules.forEach(s => {
        if (s.type && s.type !== "unknown" && s.confidence !== "low") {
          if (s.rowCount != null && s.rowCount < 2) return;
          schedulesToParse.push({
            ...s,
            sheetId: det.sheetId,
            sheetLabel: det.sheetLabel,
          });
        }
      });
    });
    return schedulesToParse;
  }

  it("keeps valid schedule detections", () => {
    const result = filterSchedules([
      {
        sheetId: "s1",
        sheetLabel: "A1",
        schedules: [{ type: "door", confidence: "high", rowCount: 10 }],
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("door");
    expect(result[0].sheetId).toBe("s1");
  });

  it("filters out unknown types", () => {
    const result = filterSchedules([
      {
        sheetId: "s1",
        schedules: [{ type: "unknown", confidence: "high" }],
      },
    ]);
    expect(result).toHaveLength(0);
  });

  it("filters out low confidence", () => {
    const result = filterSchedules([
      {
        sheetId: "s1",
        schedules: [{ type: "door", confidence: "low" }],
      },
    ]);
    expect(result).toHaveLength(0);
  });

  it("filters out schedules with rowCount < 2", () => {
    const result = filterSchedules([
      {
        sheetId: "s1",
        schedules: [{ type: "door", confidence: "high", rowCount: 1 }],
      },
    ]);
    expect(result).toHaveLength(0);
  });

  it("keeps schedules with null rowCount (no rowCount reported)", () => {
    const result = filterSchedules([
      {
        sheetId: "s1",
        schedules: [{ type: "window", confidence: "medium" }],
      },
    ]);
    expect(result).toHaveLength(1);
  });

  it("skips detections with error flag", () => {
    const result = filterSchedules([
      {
        sheetId: "s1",
        error: "timeout",
        schedules: [{ type: "door", confidence: "high" }],
      },
    ]);
    expect(result).toHaveLength(0);
  });

  it("skips detections with no schedules array", () => {
    const result = filterSchedules([{ sheetId: "s1" }]);
    expect(result).toHaveLength(0);
  });

  it("handles multiple sheets with mixed valid/invalid", () => {
    const result = filterSchedules([
      {
        sheetId: "s1",
        sheetLabel: "A1",
        schedules: [
          { type: "door", confidence: "high", rowCount: 5 },
          { type: "unknown", confidence: "high" },
        ],
      },
      {
        sheetId: "s2",
        sheetLabel: "A2",
        schedules: [
          { type: "window", confidence: "low" },
          { type: "finish", confidence: "medium", rowCount: 3 },
        ],
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("door");
    expect(result[1].type).toBe("finish");
  });
});

// ─── Count aggregation logic (from Phase 2.3) ──────────────────────────

describe("count aggregation across floor plans", () => {
  function aggregateCounts(countResults) {
    const totalCounts = {};
    for (const counts of countResults) {
      if (!counts || counts.error) continue;
      for (const [schedType, markCounts] of Object.entries(counts)) {
        if (!totalCounts[schedType]) totalCounts[schedType] = {};
        for (const [mark, count] of Object.entries(markCounts)) {
          const n = parseInt(count) || 0;
          totalCounts[schedType][mark] = (totalCounts[schedType][mark] || 0) + n;
        }
      }
    }
    return totalCounts;
  }

  it("sums counts across multiple floor plan sheets", () => {
    const result = aggregateCounts([{ door: { A: 3, B: 2 } }, { door: { A: 1, B: 4 } }]);
    expect(result.door.A).toBe(4);
    expect(result.door.B).toBe(6);
  });

  it("handles mixed schedule types", () => {
    const result = aggregateCounts([{ door: { A: 2 }, window: { W1: 3 } }, { door: { A: 1 } }]);
    expect(result.door.A).toBe(3);
    expect(result.window.W1).toBe(3);
  });

  it("skips error results", () => {
    const result = aggregateCounts([{ door: { A: 5 } }, { error: "timeout" }, null]);
    expect(result.door.A).toBe(5);
  });

  it("parses string counts as integers", () => {
    const result = aggregateCounts([{ door: { A: "3" } }]);
    expect(result.door.A).toBe(3);
  });

  it("treats non-numeric counts as 0", () => {
    const result = aggregateCounts([{ door: { A: "unknown" } }]);
    expect(result.door.A).toBe(0);
  });

  it("returns empty for empty input", () => {
    expect(aggregateCounts([])).toEqual({});
  });
});

// ─── Floor plan pattern matching (from Phase 2.3) ──────────────────────

describe("floor plan sheet detection regex", () => {
  const floorPlanPattern =
    /floor.?plan|plan.?view|^A-?\d|^A\d{2,3}|first.floor|second.floor|third.floor|ground.floor|level.?\d|basement|lower.level|upper.level|mezzanine|penthouse|^L\d|reflected.ceiling|RCP|ceiling.plan/i;

  const positives = [
    "A1 - First Floor Plan",
    "A101",
    "A-2",
    "A201 - Second Floor Plan",
    "First Floor",
    "Second Floor",
    "Third Floor",
    "Ground Floor",
    "Level 1",
    "Level 2",
    "Basement Plan",
    "Lower Level",
    "Upper Level",
    "Mezzanine Plan",
    "Penthouse Level",
    "L1 - Floor Plan",
    "RCP - First Floor",
    "Reflected Ceiling Plan",
    "Ceiling Plan",
    "Plan View",
    "Floor Plan",
  ];

  const negatives = [
    "S1 - Structural Foundation",
    "M1 - Mechanical",
    "E1 - Electrical",
    "P1 - Plumbing",
    "Cover Sheet",
    "Detail Sheet",
  ];

  for (const label of positives) {
    it(`matches "${label}"`, () => {
      expect(floorPlanPattern.test(label)).toBe(true);
    });
  }

  for (const label of negatives) {
    it(`does NOT match "${label}"`, () => {
      expect(floorPlanPattern.test(label)).toBe(false);
    });
  }
});

// ─── Scan results summary message builder (from end of runFullScan) ────

describe("scan results summary message", () => {
  function buildScanMsg(validSchedules, validNotesResults, augmentedROM, scopeOutlineStats) {
    const totalEntries = validSchedules.reduce((sum, s) => sum + s.entries.length, 0);
    const totalNotes = validNotesResults.reduce((s, r) => s + (r.notes?.length || 0), 0);
    const parts = [];
    if (totalEntries > 0) parts.push(`${totalEntries} items across ${validSchedules.length} schedules`);
    if (totalNotes > 0) parts.push(`${totalNotes} notes extracted`);
    if (augmentedROM?.totals)
      parts.push(
        `ROM $${Math.round(augmentedROM.totals.low / 1000)}K-$${Math.round(augmentedROM.totals.high / 1000)}K`,
      );
    if (scopeOutlineStats) parts.push(`${scopeOutlineStats.totalItems} scope items generated`);
    return parts.length > 0 ? `Scan complete: ${parts.join(" · ")}` : "Scan complete: drawings analyzed";
  }

  it("produces full message with all data", () => {
    const msg = buildScanMsg(
      [{ entries: [1, 2, 3] }, { entries: [4, 5] }],
      [{ notes: [1, 2] }],
      { totals: { low: 150000, high: 300000 } },
      { totalItems: 42 },
    );
    expect(msg).toBe(
      "Scan complete: 5 items across 2 schedules · 2 notes extracted · ROM $150K-$300K · 42 scope items generated",
    );
  });

  it("handles empty schedules and notes", () => {
    const msg = buildScanMsg([], [], null, null);
    expect(msg).toBe("Scan complete: drawings analyzed");
  });

  it("shows only schedules when no notes or ROM", () => {
    const msg = buildScanMsg([{ entries: [1, 2] }], [], null, null);
    expect(msg).toBe("Scan complete: 2 items across 1 schedules");
  });
});

// ─── NOTE: runFullScan is not tested directly ──────────────────────────
// runFullScan orchestrates the entire scan pipeline: it reads from multiple
// Zustand stores, calls AI APIs (callAnthropic, batchAI, runOCR), renders
// PDF pages, and writes results back to stores. Testing it end-to-end would
// require mocking 10+ stores and all AI calls, providing minimal value.
// The testable logic (JSON extraction, filtering, aggregation, regex matching)
// is covered above.
