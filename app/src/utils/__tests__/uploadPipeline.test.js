// ═══════════════════════════════════════════════════════════════════════════════
// Upload Pipeline — unit tests for pure utility functions
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, vi } from "vitest";

// Mock all store imports before importing the module under test
vi.mock("@/stores/documentsStore", () => ({ useDocumentsStore: { getState: vi.fn(() => ({})) } }));
vi.mock("@/stores/drawingsStore", () => ({
  useDrawingsStore: { getState: vi.fn(() => ({ drawings: [], drawingScales: {} })) },
}));
vi.mock("@/stores/specsStore", () => ({ useSpecsStore: { getState: vi.fn(() => ({})) } }));
vi.mock("@/stores/projectStore", () => ({ useProjectStore: { getState: vi.fn(() => ({})) } }));
vi.mock("@/stores/estimatesStore", () => ({ useEstimatesStore: { getState: vi.fn(() => ({})) } }));
vi.mock("@/stores/novaStore", () => ({ useNovaStore: { getState: vi.fn(() => ({})) } }));
vi.mock("@/stores/modelStore", () => ({ useModelStore: { getState: vi.fn(() => ({})) } }));
vi.mock("@/stores/uiStore", () => ({ useUiStore: { getState: vi.fn(() => ({})) } }));
vi.mock("@/stores/groupsStore", () => ({ useGroupsStore: { getState: vi.fn(() => ({ groups: [] })) } }));
vi.mock("@/stores/takeoffsStore", () => ({ useTakeoffsStore: { getState: vi.fn(() => ({ takeoffs: [] })) } }));
vi.mock("@/utils/ai", () => ({ callAnthropic: vi.fn(), optimizeImageForAI: vi.fn() }));
vi.mock("@/utils/pdf", () => ({ loadPdfJs: vi.fn() }));
vi.mock("@/utils/drawingUtils", () => ({
  matchScaleKey: vi.fn(),
  renderPdfPage: vi.fn(),
  classifyFile: vi.fn(),
  isDuplicateFile: vi.fn(),
}));
vi.mock("@/utils/outlineDetector", () => ({
  detectBuildingOutline: vi.fn(),
  outlineToFeet: vi.fn(),
  computePolygonArea: vi.fn(),
}));
vi.mock("@/utils/scanRunner", () => ({ runFullScan: vi.fn() }));
vi.mock("@/utils/format", () => ({ uid: vi.fn(() => "test-id"), nowStr: vi.fn(() => "2026-03-17") }));

import { isHigherRevision, inferViewType } from "@/utils/uploadPipeline";

// ─── isHigherRevision ────────────────────────────────────────────────────────
// Critical revision comparison logic — a bug here caused incorrect supersede behavior.
describe("isHigherRevision(oldRev, newRev)", () => {
  describe("same revision", () => {
    it("returns false for identical numeric revisions", () => {
      expect(isHigherRevision("1", "1")).toBe(false);
    });

    it("returns false for identical alpha revisions", () => {
      expect(isHigherRevision("A", "A")).toBe(false);
    });

    it("returns false for identical multi-digit revisions", () => {
      expect(isHigherRevision("10", "10")).toBe(false);
    });
  });

  describe("numeric revisions", () => {
    it("returns true when new > old (1 vs 2)", () => {
      expect(isHigherRevision("1", "2")).toBe(true);
    });

    it("returns true for multi-digit jump (3 vs 10)", () => {
      expect(isHigherRevision("3", "10")).toBe(true);
    });

    it("returns false when new < old (5 vs 2)", () => {
      expect(isHigherRevision("5", "2")).toBe(false);
    });

    it("returns false when new < old (2 vs 1)", () => {
      expect(isHigherRevision("2", "1")).toBe(false);
    });
  });

  describe("alpha revisions", () => {
    it("returns true when new > old (A vs B)", () => {
      expect(isHigherRevision("A", "B")).toBe(true);
    });

    it("returns false when new < old (C vs A)", () => {
      expect(isHigherRevision("C", "A")).toBe(false);
    });

    it("handles lowercase comparison (a vs b)", () => {
      expect(isHigherRevision("a", "b")).toBe(true);
    });

    it("handles mixed case — comparison is case-insensitive", () => {
      expect(isHigherRevision("a", "B")).toBe(true);
      expect(isHigherRevision("B", "a")).toBe(false);
    });
  });

  describe("mixed type revisions (alpha vs numeric)", () => {
    it("numeric old -> alpha new returns true (post-IFC transition)", () => {
      // Common in construction: numeric revisions during design, then alpha after IFC
      expect(isHigherRevision("3", "A")).toBe(true);
    });

    it("alpha old -> numeric new returns false (ambiguous, no auto-supersede)", () => {
      // Different revision schemes — don't assume numeric is higher
      expect(isHigherRevision("A", "1")).toBe(false);
    });

    it("alpha old -> numeric new returns false even for high numbers", () => {
      expect(isHigherRevision("A", "99")).toBe(false);
    });
  });

  describe("edge cases: empty / null / undefined", () => {
    it("returns false when newRev is empty string", () => {
      expect(isHigherRevision("1", "")).toBe(false);
    });

    it("returns false when newRev is undefined", () => {
      expect(isHigherRevision("1", undefined)).toBe(false);
    });

    it("returns false when newRev is null", () => {
      expect(isHigherRevision("1", null)).toBe(false);
    });

    it("returns true when oldRev is empty and newRev has a value (any rev > no rev)", () => {
      expect(isHigherRevision("", "1")).toBe(true);
    });

    it("returns true when oldRev is undefined and newRev has a value", () => {
      expect(isHigherRevision(undefined, "A")).toBe(true);
    });

    it("returns true when oldRev is null and newRev has a value", () => {
      expect(isHigherRevision(null, "2")).toBe(true);
    });

    it("returns false when both are null", () => {
      expect(isHigherRevision(null, null)).toBe(false);
    });

    it("returns false when both are undefined", () => {
      expect(isHigherRevision(undefined, undefined)).toBe(false);
    });

    it("returns false when both are empty strings", () => {
      expect(isHigherRevision("", "")).toBe(false);
    });
  });
});

// ─── inferViewType ───────────────────────────────────────────────────────────
describe("inferViewType(title)", () => {
  describe("elevation detection", () => {
    it('returns "elevation" for title containing "elevation"', () => {
      expect(inferViewType("North Elevation")).toBe("elevation");
    });

    it("is case-insensitive", () => {
      expect(inferViewType("SOUTH ELEVATION")).toBe("elevation");
    });
  });

  describe("section detection", () => {
    it('returns "section" for title containing "section"', () => {
      expect(inferViewType("Building Section A")).toBe("section");
    });
  });

  describe("detail detection", () => {
    it('returns "detail" for title containing "detail"', () => {
      expect(inferViewType("Wall Detail 3")).toBe("detail");
    });
  });

  describe("plan detection", () => {
    it('returns "plan" for "Floor Plan"', () => {
      expect(inferViewType("First Floor Plan")).toBe("plan");
    });

    it('returns "plan" for "Layout"', () => {
      expect(inferViewType("Office Layout")).toBe("plan");
    });

    it('returns "plan" for "Level"', () => {
      expect(inferViewType("Level 2")).toBe("plan");
    });

    it('returns null for "Roof Plan" (excluded)', () => {
      expect(inferViewType("Roof Plan")).toBe(null);
    });

    it('returns null for "Site Plan" (excluded)', () => {
      expect(inferViewType("Site Plan")).toBe(null);
    });

    it('returns null for "Foundation Plan" (excluded)', () => {
      expect(inferViewType("Foundation Plan")).toBe(null);
    });

    it('returns null for "Reflected Ceiling Plan" (excluded)', () => {
      expect(inferViewType("Reflected Ceiling Plan")).toBe(null);
    });

    it('returns null for "Framing Plan" (excluded)', () => {
      expect(inferViewType("Framing Plan")).toBe(null);
    });
  });

  describe("priority order", () => {
    it("elevation wins over plan keywords", () => {
      expect(inferViewType("Elevation Plan")).toBe("elevation");
    });

    it("section wins over detail keywords", () => {
      expect(inferViewType("Section Detail")).toBe("section");
    });
  });

  describe("edge cases", () => {
    it("returns null for empty string", () => {
      expect(inferViewType("")).toBe(null);
    });

    it("returns null for null input", () => {
      expect(inferViewType(null)).toBe(null);
    });

    it("returns null for undefined input", () => {
      expect(inferViewType(undefined)).toBe(null);
    });

    it("returns schedule for title containing schedule", () => {
      expect(inferViewType("Mechanical Schedule")).toBe("schedule");
    });
  });
});
