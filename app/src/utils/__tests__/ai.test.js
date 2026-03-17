import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase before importing ai.js
vi.mock("@/utils/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));

import {
  imageBlock,
  pdfBlock,
  buildProjectContext,
  batchAI,
  getSessionUsage,
  resetSessionUsage,
  createAIAbort,
  deduplicateOCRText,
} from "@/utils/ai";

// ─── imageBlock ────────────────────────────────────────────────────────

describe("imageBlock", () => {
  it("returns correct content block structure", () => {
    const block = imageBlock("abc123");
    expect(block).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "abc123" },
    });
  });

  it("accepts custom media type", () => {
    const block = imageBlock("abc123", "image/png");
    expect(block.source.media_type).toBe("image/png");
  });
});

// ─── pdfBlock ──────────────────────────────────────────────────────────

describe("pdfBlock", () => {
  it("returns correct document block structure", () => {
    const block = pdfBlock("pdfdata");
    expect(block).toEqual({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: "pdfdata" },
    });
  });
});

// ─── buildProjectContext ───────────────────────────────────────────────

describe("buildProjectContext", () => {
  it("builds context from project info", () => {
    const ctx = buildProjectContext({
      project: {
        name: "Test Office",
        jobType: "commercial",
        projectSF: "50000",
        address: "123 Main St",
        client: "Acme Corp",
        architect: "Smith Architects",
      },
    });
    expect(ctx).toContain("Test Office");
    expect(ctx).toContain("commercial");
    expect(ctx).toContain("50000");
    expect(ctx).toContain("123 Main St");
    expect(ctx).toContain("Acme Corp");
    expect(ctx).toContain("Smith Architects");
  });

  it("includes floor details when provided", () => {
    const ctx = buildProjectContext({
      project: {
        name: "Tower",
        floorCount: 3,
        basementCount: 1,
        floors: [
          { label: "Floor 1", height: 14 },
          { label: "Floor 2", height: 12 },
          { label: "Floor 3", height: 12 },
        ],
      },
    });
    expect(ctx).toContain("3 stories");
    expect(ctx).toContain("1 basement level");
    expect(ctx).toContain("Floor 1: 14ft");
    expect(ctx).toContain("Total building height: 38ft");
  });

  it("includes room counts when provided", () => {
    const ctx = buildProjectContext({
      project: {
        name: "School",
        roomCounts: { classrooms: 10, restrooms: 4, offices: 0 },
      },
    });
    expect(ctx).toContain("classrooms: 10");
    expect(ctx).toContain("restrooms: 4");
    // offices: 0 should be filtered out
    expect(ctx).not.toContain("offices");
  });

  it("includes estimate items with costs", () => {
    const ctx = buildProjectContext({
      project: { name: "Test" },
      items: [
        {
          id: "1",
          code: "03 30 00",
          description: "Cast-in-place concrete",
          division: "03",
          unit: "CY",
          quantity: 100,
          material: 150,
          labor: 80,
          equipment: 20,
          subcontractor: 0,
        },
      ],
    });
    expect(ctx).toContain("ESTIMATE (1 items)");
    expect(ctx).toContain("03 30 00");
    expect(ctx).toContain("Cast-in-place concrete");
    expect(ctx).toContain("M:$150");
    expect(ctx).toContain("L:$80");
    expect(ctx).toContain("E:$20");
  });

  it("marks unassigned items", () => {
    const ctx = buildProjectContext({
      project: { name: "Test" },
      items: [{ id: "1", description: "Mystery item", division: "", unit: "EA", quantity: 1 }],
    });
    expect(ctx).toContain("[UNASSIGNED]");
    expect(ctx).toContain("1 unassigned");
  });

  it("includes takeoffs section", () => {
    const ctx = buildProjectContext({
      project: { name: "Test" },
      takeoffs: [{ code: "09 29 00", description: "Gypsum board", quantity: 5000, unit: "SF" }],
    });
    expect(ctx).toContain("TAKEOFFS (1 items)");
    expect(ctx).toContain("Gypsum board");
  });

  it("includes specs section", () => {
    const ctx = buildProjectContext({
      project: { name: "Test" },
      specs: [{ section: "03 30 00", title: "Cast-in-Place Concrete", summary: "Normal weight concrete" }],
    });
    expect(ctx).toContain("SPECIFICATIONS (1 sections)");
    expect(ctx).toContain("Cast-in-Place Concrete");
  });

  it("includes drawings section", () => {
    const ctx = buildProjectContext({
      project: { name: "Test" },
      drawings: [
        { sheetNumber: "A1", sheetTitle: "First Floor Plan" },
        { sheetNumber: "S1", label: "Structural Foundation" },
      ],
    });
    expect(ctx).toContain("DRAWINGS (2 sheets)");
    expect(ctx).toContain("First Floor Plan");
    expect(ctx).toContain("Structural Foundation");
  });

  it("handles empty/minimal project gracefully", () => {
    const ctx = buildProjectContext({ project: { name: "Empty" } });
    expect(ctx).toContain("Empty");
    expect(ctx).not.toContain("ESTIMATE");
    expect(ctx).not.toContain("TAKEOFFS");
  });

  it("truncates items at 250 and adds overflow note", () => {
    const items = Array.from({ length: 300 }, (_, i) => ({
      id: String(i),
      description: `Item ${i}`,
      division: "01",
      unit: "EA",
      quantity: 1,
    }));
    const ctx = buildProjectContext({ project: { name: "Big" }, items });
    expect(ctx).toContain("300 items");
    expect(ctx).toContain("and 50 more items");
  });
});

// ─── batchAI ───────────────────────────────────────────────────────────

describe("batchAI", () => {
  it("processes all items and returns results in order", async () => {
    const items = ["a", "b", "c"];
    const results = await batchAI(items, async (item, idx) => `${item}-${idx}`);
    expect(results).toEqual(["a-0", "b-1", "c-2"]);
  });

  it("catches errors per-item and returns error objects", async () => {
    const items = [1, 2, 3];
    const results = await batchAI(items, async item => {
      if (item === 2) throw new Error("fail");
      return item * 10;
    });
    expect(results[0]).toBe(10);
    expect(results[1]).toEqual({ error: "fail" });
    expect(results[2]).toBe(30);
  });

  it("respects concurrency limit", async () => {
    let maxConcurrent = 0;
    let running = 0;
    const items = [1, 2, 3, 4, 5];
    await batchAI(
      items,
      async () => {
        running++;
        maxConcurrent = Math.max(maxConcurrent, running);
        await new Promise(r => setTimeout(r, 10));
        running--;
        return "ok";
      },
      2,
    );
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("handles empty items array", async () => {
    const results = await batchAI([], async () => "never");
    expect(results).toEqual([]);
  });

  it("handles concurrency greater than item count", async () => {
    const results = await batchAI([1], async item => item, 10);
    expect(results).toEqual([1]);
  });
});

// ─── Token usage tracking ──────────────────────────────────────────────

describe("session usage tracking", () => {
  beforeEach(() => {
    resetSessionUsage();
  });

  it("starts at zero", () => {
    expect(getSessionUsage()).toEqual({ input: 0, output: 0, calls: 0 });
  });

  it("resetSessionUsage clears counters", () => {
    // Usage is internal — we can only verify reset returns zero
    resetSessionUsage();
    const usage = getSessionUsage();
    expect(usage.input).toBe(0);
    expect(usage.output).toBe(0);
    expect(usage.calls).toBe(0);
  });

  it("getSessionUsage returns a copy (not the internal reference)", () => {
    const a = getSessionUsage();
    const b = getSessionUsage();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ─── createAIAbort ─────────────────────────────────────────────────────

describe("createAIAbort", () => {
  it("returns an AbortController", () => {
    const ctrl = createAIAbort();
    expect(ctrl).toBeInstanceOf(AbortController);
    expect(ctrl.signal.aborted).toBe(false);
  });

  it("can be aborted", () => {
    const ctrl = createAIAbort();
    ctrl.abort();
    expect(ctrl.signal.aborted).toBe(true);
  });
});

// ─── deduplicateOCRText ────────────────────────────────────────────────

describe("deduplicateOCRText", () => {
  it("deduplicates lines that appear in multiple quadrants", () => {
    const result = deduplicateOCRText(["Line A\nShared Line\nLine B", "Shared Line\nLine C", "", ""]);
    const lines = result.split("\n");
    // "Shared Line" appears in quadrant 0 and 1, should appear only once
    const sharedCount = lines.filter(l => l === "Shared Line").length;
    expect(sharedCount).toBe(1);
    // Unique lines are preserved
    expect(lines).toContain("Line A");
    expect(lines).toContain("Line B");
    expect(lines).toContain("Line C");
  });

  it("keeps duplicate lines within the same quadrant", () => {
    const result = deduplicateOCRText(["Row 1\nRow 1\nRow 1", "Something else", "", ""]);
    const lines = result.split("\n");
    // "Row 1" appears 3 times in quadrant 0 only, so all 3 should be kept
    const row1Count = lines.filter(l => l === "Row 1").length;
    expect(row1Count).toBe(3);
  });

  it("handles all empty quadrants", () => {
    const result = deduplicateOCRText(["", "", "", ""]);
    expect(result).toBe("");
  });

  it("handles null/undefined quadrants", () => {
    const result = deduplicateOCRText([null, undefined, "Hello", ""]);
    expect(result).toBe("Hello");
  });

  it("normalizes whitespace for dedup matching", () => {
    // "DOOR  SCHEDULE" with extra space vs "DOOR SCHEDULE" should match
    const result = deduplicateOCRText(["DOOR  SCHEDULE", "DOOR SCHEDULE", "", ""]);
    const lines = result.split("\n");
    // Both normalize to same key, so only one emitted
    expect(lines.length).toBe(1);
  });

  it("preserves original text (not normalized) in output", () => {
    const result = deduplicateOCRText(["DOOR  SCHEDULE", "DOOR SCHEDULE", "", ""]);
    // Should keep the first occurrence's original text
    expect(result).toBe("DOOR  SCHEDULE");
  });
});

// ─── NOTE: Functions NOT tested (require network / browser APIs) ───────
// - callAnthropic: Makes fetch calls to /api/ai proxy, handles auth tokens,
//   retry logic with 429/401. Would need full fetch mock + JWT generation.
// - callAnthropicStream: SSE streaming over fetch, requires ReadableStream mock.
// - optimizeImageForAI: Uses browser Image + Canvas APIs (jsdom doesn't support).
// - cropImageRegion: Same — requires real canvas rendering.
// - segmentedOCR: Orchestrates cropQuadrant (canvas) + runOCR (network).
// - runOCR: Makes fetch calls to /api/ocr, handles circuit breaker state.
// - detectSheetReferences: Calls callAnthropic with image data.
// - getAuthToken / forceRefreshToken: Internal auth helpers using supabase SDK.
