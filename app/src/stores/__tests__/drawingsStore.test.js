import { describe, it, expect, beforeEach } from "vitest";
import { useDrawingsStore } from "@/stores/drawingsStore";

// Helper to get fresh state
const getState = () => useDrawingsStore.getState();

// Default initial state shape for reset
const initialState = {
  drawings: [],
  selectedDrawingId: null,
  pdfCanvases: {},
  drawingScales: {},
  drawingDpi: {},
  previewDrawingId: null,
  sheetIndex: {},
  detectedReferences: {},
  refScanLoading: null,
  smartLabelMode: false,
  smartLabelRegion: null,
  smartLabelDragging: null,
  aiLabelLoading: false,
  autoLabelProgress: null,
  showSuperseded: false,
};

beforeEach(() => {
  useDrawingsStore.setState(initialState);
});

// ── 1. Initial State Shape ──────────────────────────────────────────

describe("initial state shape", () => {
  it("has correct default values", () => {
    const s = getState();
    expect(s.drawings).toEqual([]);
    expect(s.selectedDrawingId).toBeNull();
    expect(s.pdfCanvases).toEqual({});
    expect(s.drawingScales).toEqual({});
    expect(s.drawingDpi).toEqual({});
    expect(s.previewDrawingId).toBeNull();
    expect(s.sheetIndex).toEqual({});
    expect(s.detectedReferences).toEqual({});
    expect(s.refScanLoading).toBeNull();
    expect(s.smartLabelMode).toBe(false);
    expect(s.smartLabelRegion).toBeNull();
    expect(s.smartLabelDragging).toBeNull();
    expect(s.aiLabelLoading).toBe(false);
    expect(s.autoLabelProgress).toBeNull();
    expect(s.showSuperseded).toBe(false);
  });

  it("exposes all expected action functions", () => {
    const s = getState();
    const expectedActions = [
      "setDrawings",
      "setSelectedDrawingId",
      "setPdfCanvases",
      "setDrawingScales",
      "setDrawingDpi",
      "setPreviewDrawingId",
      "setDetectedReferences",
      "setRefScanLoading",
      "buildSheetIndex",
      "setSmartLabelMode",
      "setSmartLabelRegion",
      "setSmartLabelDragging",
      "setAiLabelLoading",
      "setAutoLabelProgress",
      "addDrawing",
      "updateDrawing",
      "removeDrawing",
      "getSelectedDrawing",
      "supersedeDrawing",
      "getVersionChain",
      "getActiveDrawings",
      "mergeAddendumDrawings",
      "setShowSuperseded",
    ];
    for (const name of expectedActions) {
      expect(typeof s[name]).toBe("function");
    }
  });
});

// ── 2. Adding / Setting Drawings ────────────────────────────────────

describe("addDrawing", () => {
  it("adds a drawing with an auto-generated id", () => {
    getState().addDrawing({ label: "Floor Plan" });
    const { drawings } = getState();
    expect(drawings).toHaveLength(1);
    expect(drawings[0].label).toBe("Floor Plan");
    expect(typeof drawings[0].id).toBe("string");
    expect(drawings[0].id.length).toBeGreaterThan(0);
  });

  it("preserves existing drawings when adding", () => {
    getState().addDrawing({ label: "Sheet A" });
    getState().addDrawing({ label: "Sheet B" });
    expect(getState().drawings).toHaveLength(2);
    expect(getState().drawings[0].label).toBe("Sheet A");
    expect(getState().drawings[1].label).toBe("Sheet B");
  });

  it("does not overwrite a provided id (uid is spread first, then drawing props)", () => {
    // uid() is called first, then ...drawing is spread on top, so a provided id wins
    getState().addDrawing({ id: "custom-id", label: "Custom" });
    expect(getState().drawings[0].id).toBe("custom-id");
  });
});

describe("setDrawings", () => {
  it("replaces the entire drawings array", () => {
    getState().addDrawing({ label: "Old" });
    getState().setDrawings([{ id: "d1", label: "New" }]);
    const { drawings } = getState();
    expect(drawings).toHaveLength(1);
    expect(drawings[0]).toEqual({ id: "d1", label: "New" });
  });
});

// ── 3. Updating Drawing Properties ─────────────────────────────────

describe("updateDrawing", () => {
  beforeEach(() => {
    useDrawingsStore.setState({
      drawings: [
        { id: "d1", label: "Plan A", scale: null, tags: [] },
        { id: "d2", label: "Plan B", scale: "1/4", tags: ["structural"] },
      ],
    });
  });

  it("updates a single field on the target drawing", () => {
    getState().updateDrawing("d1", "scale", "1/8");
    expect(getState().drawings.find(d => d.id === "d1").scale).toBe("1/8");
  });

  it("does not mutate other drawings", () => {
    getState().updateDrawing("d1", "label", "Updated");
    expect(getState().drawings.find(d => d.id === "d2").label).toBe("Plan B");
  });

  it("can update tags to a new array", () => {
    getState().updateDrawing("d2", "tags", ["structural", "elevation"]);
    expect(getState().drawings.find(d => d.id === "d2").tags).toEqual(["structural", "elevation"]);
  });

  it("no-ops gracefully if id does not exist", () => {
    const before = getState().drawings;
    getState().updateDrawing("nonexistent", "label", "Nope");
    expect(getState().drawings).toEqual(before);
  });

  it("can add a new field that did not exist before", () => {
    getState().updateDrawing("d1", "sheetNumber", "A-101");
    expect(getState().drawings.find(d => d.id === "d1").sheetNumber).toBe("A-101");
  });
});

// ── 4. Removing Drawings ────────────────────────────────────────────

describe("removeDrawing", () => {
  beforeEach(() => {
    useDrawingsStore.setState({
      drawings: [
        { id: "d1", label: "A" },
        { id: "d2", label: "B" },
        { id: "d3", label: "C" },
      ],
      selectedDrawingId: "d2",
    });
  });

  it("removes the targeted drawing", () => {
    getState().removeDrawing("d1");
    expect(getState().drawings).toHaveLength(2);
    expect(getState().drawings.find(d => d.id === "d1")).toBeUndefined();
  });

  it("clears selectedDrawingId when the selected drawing is removed", () => {
    getState().removeDrawing("d2");
    expect(getState().selectedDrawingId).toBeNull();
  });

  it("preserves selectedDrawingId when a different drawing is removed", () => {
    getState().removeDrawing("d3");
    expect(getState().selectedDrawingId).toBe("d2");
  });

  it("no-ops if id does not exist", () => {
    getState().removeDrawing("nonexistent");
    expect(getState().drawings).toHaveLength(3);
  });
});

// ── 5. Drawing Selection State ──────────────────────────────────────

describe("selection", () => {
  beforeEach(() => {
    useDrawingsStore.setState({
      drawings: [
        { id: "d1", label: "Plan A" },
        { id: "d2", label: "Plan B" },
      ],
    });
  });

  it("setSelectedDrawingId updates selection", () => {
    getState().setSelectedDrawingId("d1");
    expect(getState().selectedDrawingId).toBe("d1");
  });

  it("getSelectedDrawing returns the selected drawing object", () => {
    getState().setSelectedDrawingId("d2");
    expect(getState().getSelectedDrawing()).toEqual({ id: "d2", label: "Plan B" });
  });

  it("getSelectedDrawing returns null when nothing is selected", () => {
    expect(getState().getSelectedDrawing()).toBeNull();
  });

  it("getSelectedDrawing returns null when selectedDrawingId is stale", () => {
    getState().setSelectedDrawingId("deleted-id");
    expect(getState().getSelectedDrawing()).toBeNull();
  });
});

describe("previewDrawingId", () => {
  it("sets and clears preview", () => {
    getState().setPreviewDrawingId("d1");
    expect(getState().previewDrawingId).toBe("d1");
    getState().setPreviewDrawingId(null);
    expect(getState().previewDrawingId).toBeNull();
  });
});

// ── 6. Derived State / Computed Values ──────────────────────────────

describe("buildSheetIndex", () => {
  it("builds an index from sheetNumber to drawing id", () => {
    useDrawingsStore.setState({
      drawings: [
        { id: "d1", sheetNumber: "A-101" },
        { id: "d2", sheetNumber: "S-201" },
      ],
    });
    getState().buildSheetIndex();
    const { sheetIndex } = getState();
    expect(sheetIndex["A-101"]).toBe("d1");
    expect(sheetIndex["S-201"]).toBe("d2");
  });

  it("adds normalized (dash/space stripped) keys for fuzzy matching", () => {
    useDrawingsStore.setState({
      drawings: [{ id: "d1", sheetNumber: "A-101" }],
    });
    getState().buildSheetIndex();
    const { sheetIndex } = getState();
    expect(sheetIndex["A101"]).toBe("d1");
    expect(sheetIndex["A-101"]).toBe("d1");
  });

  it("does not add a normalized key when it equals the original (no dash/space)", () => {
    useDrawingsStore.setState({
      drawings: [{ id: "d1", sheetNumber: "A101" }],
    });
    getState().buildSheetIndex();
    const keys = Object.keys(getState().sheetIndex);
    // Only one entry since "A101" with dashes/spaces stripped is still "A101"
    expect(keys).toEqual(["A101"]);
  });

  it("excludes superseded drawings from the index", () => {
    useDrawingsStore.setState({
      drawings: [
        { id: "d1", sheetNumber: "A-101", superseded: true },
        { id: "d2", sheetNumber: "A-101" },
      ],
    });
    getState().buildSheetIndex();
    expect(getState().sheetIndex["A-101"]).toBe("d2");
  });

  it("excludes drawings without a sheetNumber", () => {
    useDrawingsStore.setState({
      drawings: [{ id: "d1", label: "No Sheet" }],
    });
    getState().buildSheetIndex();
    expect(Object.keys(getState().sheetIndex)).toHaveLength(0);
  });
});

describe("getActiveDrawings", () => {
  it("returns only non-superseded drawings", () => {
    useDrawingsStore.setState({
      drawings: [{ id: "d1", superseded: true }, { id: "d2" }, { id: "d3", superseded: false }],
    });
    const active = getState().getActiveDrawings();
    expect(active).toHaveLength(2);
    expect(active.map(d => d.id)).toEqual(["d2", "d3"]);
  });

  it("returns all drawings when none are superseded", () => {
    useDrawingsStore.setState({
      drawings: [{ id: "d1" }, { id: "d2" }],
    });
    expect(getState().getActiveDrawings()).toHaveLength(2);
  });

  it("returns empty array when all are superseded", () => {
    useDrawingsStore.setState({
      drawings: [
        { id: "d1", superseded: true },
        { id: "d2", superseded: true },
      ],
    });
    expect(getState().getActiveDrawings()).toHaveLength(0);
  });
});

describe("detectedReferences", () => {
  it("sets references per drawing id, merging with existing", () => {
    const refs1 = [{ label: "1", targetSheet: "A-101", type: "section" }];
    const refs2 = [{ label: "2", targetSheet: "S-201", type: "detail" }];
    getState().setDetectedReferences("d1", refs1);
    getState().setDetectedReferences("d2", refs2);
    const { detectedReferences } = getState();
    expect(detectedReferences.d1).toEqual(refs1);
    expect(detectedReferences.d2).toEqual(refs2);
  });

  it("overwrites references for the same drawing id", () => {
    getState().setDetectedReferences("d1", [{ label: "old" }]);
    getState().setDetectedReferences("d1", [{ label: "new" }]);
    expect(getState().detectedReferences.d1).toEqual([{ label: "new" }]);
  });
});

// ── 7. Version Tracking / Addenda ───────────────────────────────────

describe("supersedeDrawing", () => {
  beforeEach(() => {
    useDrawingsStore.setState({
      drawings: [
        { id: "d1", label: "Original", sheetNumber: "A-101" },
        { id: "d2", label: "Revision", sheetNumber: "A-101" },
      ],
    });
  });

  it("marks the old drawing as superseded", () => {
    getState().supersedeDrawing("d1", "d2", 1);
    const old = getState().drawings.find(d => d.id === "d1");
    expect(old.superseded).toBe(true);
    expect(old.supersededBy).toBe("d2");
  });

  it("adds version history to the old drawing", () => {
    getState().supersedeDrawing("d1", "d2", 1);
    const old = getState().drawings.find(d => d.id === "d1");
    expect(old.versionHistory).toHaveLength(1);
    expect(old.versionHistory[0].drawingId).toBe("d2");
    expect(old.versionHistory[0].addendumNumber).toBe(1);
  });

  it("marks the new drawing with supersedes and isAddendum", () => {
    getState().supersedeDrawing("d1", "d2", 1);
    const newDraw = getState().drawings.find(d => d.id === "d2");
    expect(newDraw.supersedes).toBe("d1");
    expect(newDraw.isAddendum).toBe(true);
    expect(newDraw.addendumNumber).toBe(1);
  });

  it("appends to existing versionHistory", () => {
    useDrawingsStore.setState({
      drawings: [
        {
          id: "d1",
          versionHistory: [{ drawingId: "d0", addendumNumber: 0, date: "2025-01-01" }],
        },
        { id: "d2" },
      ],
    });
    getState().supersedeDrawing("d1", "d2", 1);
    expect(getState().drawings.find(d => d.id === "d1").versionHistory).toHaveLength(2);
  });
});

describe("getVersionChain", () => {
  it("returns the full chain from oldest to newest", () => {
    useDrawingsStore.setState({
      drawings: [
        { id: "d1", supersededBy: "d2" },
        { id: "d2", supersedes: "d1", supersededBy: "d3" },
        { id: "d3", supersedes: "d2" },
      ],
    });
    const chain = getState().getVersionChain("d3");
    expect(chain.map(d => d.id)).toEqual(["d1", "d2", "d3"]);
  });

  it("returns the same chain regardless of which version is queried", () => {
    useDrawingsStore.setState({
      drawings: [
        { id: "d1", supersededBy: "d2" },
        { id: "d2", supersedes: "d1", supersededBy: "d3" },
        { id: "d3", supersedes: "d2" },
      ],
    });
    const fromFirst = getState().getVersionChain("d1");
    const fromMiddle = getState().getVersionChain("d2");
    const fromLast = getState().getVersionChain("d3");
    expect(fromFirst.map(d => d.id)).toEqual(["d1", "d2", "d3"]);
    expect(fromMiddle.map(d => d.id)).toEqual(["d1", "d2", "d3"]);
    expect(fromLast.map(d => d.id)).toEqual(["d1", "d2", "d3"]);
  });

  it("returns a single-element chain for a standalone drawing", () => {
    useDrawingsStore.setState({ drawings: [{ id: "d1" }] });
    expect(getState().getVersionChain("d1")).toEqual([{ id: "d1" }]);
  });

  it("returns empty array for a nonexistent drawing", () => {
    expect(getState().getVersionChain("nope")).toEqual([]);
  });
});

describe("mergeAddendumDrawings", () => {
  it("supersedes existing drawing matched by sheetNumber", () => {
    useDrawingsStore.setState({
      drawings: [{ id: "d1", sheetNumber: "A-101", label: "Original", revision: "0" }],
    });
    const added = getState().mergeAddendumDrawings([{ id: "d2", sheetNumber: "A-101", label: "Rev 1" }], 1);
    const drawings = getState().drawings;
    // Old drawing is superseded
    const old = drawings.find(d => d.id === "d1");
    expect(old.superseded).toBe(true);
    expect(old.supersededBy).toBe("d2");
    // New drawing references old
    const newDraw = drawings.find(d => d.id === "d2");
    expect(newDraw.supersedes).toBe("d1");
    expect(newDraw.isAddendum).toBe(true);
    expect(newDraw.addendumNumber).toBe(1);
    expect(newDraw.revision).toBe("1"); // incremented from "0"
    // Return value is the added drawings
    expect(added).toHaveLength(1);
    expect(added[0].id).toBe("d2");
  });

  it("matches by label when sheetNumber is absent", () => {
    useDrawingsStore.setState({
      drawings: [{ id: "d1", label: "Floor Plan", revision: "0" }],
    });
    getState().mergeAddendumDrawings([{ id: "d2", label: "Floor Plan" }], 2);
    expect(getState().drawings.find(d => d.id === "d1").superseded).toBe(true);
    expect(getState().drawings.find(d => d.id === "d2").supersedes).toBe("d1");
  });

  it("adds as new drawing when no match is found", () => {
    useDrawingsStore.setState({
      drawings: [{ id: "d1", sheetNumber: "A-101" }],
    });
    const added = getState().mergeAddendumDrawings([{ id: "d2", sheetNumber: "M-101", label: "Mech Plan" }], 1);
    const drawings = getState().drawings;
    // Original untouched
    expect(drawings.find(d => d.id === "d1").superseded).toBeUndefined();
    // New drawing added but not superseding anything
    const newDraw = drawings.find(d => d.id === "d2");
    expect(newDraw.isAddendum).toBe(true);
    expect(newDraw.supersedes).toBeUndefined();
    expect(added).toHaveLength(1);
  });

  it("handles multiple addendum drawings at once", () => {
    useDrawingsStore.setState({
      drawings: [
        { id: "d1", sheetNumber: "A-101", revision: "0" },
        { id: "d2", sheetNumber: "A-102", revision: "0" },
      ],
    });
    const added = getState().mergeAddendumDrawings(
      [
        { id: "n1", sheetNumber: "A-101" },
        { id: "n2", sheetNumber: "A-102" },
        { id: "n3", sheetNumber: "A-103" },
      ],
      1,
    );
    expect(added).toHaveLength(3);
    expect(getState().drawings).toHaveLength(5); // 2 originals + 3 new
    expect(getState().drawings.find(d => d.id === "d1").superseded).toBe(true);
    expect(getState().drawings.find(d => d.id === "d2").superseded).toBe(true);
  });

  it("does not match against already-superseded drawings", () => {
    useDrawingsStore.setState({
      drawings: [
        { id: "d1", sheetNumber: "A-101", superseded: true },
        { id: "d2", sheetNumber: "A-101" },
      ],
    });
    getState().mergeAddendumDrawings([{ id: "n1", sheetNumber: "A-101" }], 2);
    // d2 should be superseded (it was the active one), d1 should remain unchanged
    expect(getState().drawings.find(d => d.id === "d2").superseded).toBe(true);
    expect(getState().drawings.find(d => d.id === "d2").supersededBy).toBe("n1");
  });

  it("increments revision number from existing drawing", () => {
    useDrawingsStore.setState({
      drawings: [{ id: "d1", sheetNumber: "A-101", revision: "3" }],
    });
    getState().mergeAddendumDrawings([{ id: "n1", sheetNumber: "A-101" }], 1);
    expect(getState().drawings.find(d => d.id === "n1").revision).toBe("4");
  });
});

// ── 8. Simple Setters ───────────────────────────────────────────────

describe("simple setters", () => {
  it("setPdfCanvases", () => {
    getState().setPdfCanvases({ page1: "canvas" });
    expect(getState().pdfCanvases).toEqual({ page1: "canvas" });
  });

  it("setDrawingScales", () => {
    getState().setDrawingScales({ d1: "1/4" });
    expect(getState().drawingScales).toEqual({ d1: "1/4" });
  });

  it("setDrawingDpi", () => {
    getState().setDrawingDpi({ d1: 150 });
    expect(getState().drawingDpi).toEqual({ d1: 150 });
  });

  it("setRefScanLoading", () => {
    getState().setRefScanLoading("d1");
    expect(getState().refScanLoading).toBe("d1");
  });

  it("setSmartLabelMode", () => {
    getState().setSmartLabelMode(true);
    expect(getState().smartLabelMode).toBe(true);
  });

  it("setSmartLabelRegion", () => {
    const region = { x: 0, y: 0, w: 100, h: 100 };
    getState().setSmartLabelRegion(region);
    expect(getState().smartLabelRegion).toEqual(region);
  });

  it("setSmartLabelDragging", () => {
    getState().setSmartLabelDragging("drag-data");
    expect(getState().smartLabelDragging).toBe("drag-data");
  });

  it("setAiLabelLoading", () => {
    getState().setAiLabelLoading(true);
    expect(getState().aiLabelLoading).toBe(true);
  });

  it("setAutoLabelProgress", () => {
    getState().setAutoLabelProgress({ current: 3, total: 10 });
    expect(getState().autoLabelProgress).toEqual({ current: 3, total: 10 });
  });

  it("setShowSuperseded", () => {
    getState().setShowSuperseded(true);
    expect(getState().showSuperseded).toBe(true);
  });
});

// ── 9. Edge Cases ───────────────────────────────────────────────────

describe("edge cases", () => {
  it("addDrawing with empty object still gets an id", () => {
    getState().addDrawing({});
    expect(getState().drawings[0].id).toBeTruthy();
  });

  it("removing the last drawing leaves an empty array", () => {
    useDrawingsStore.setState({ drawings: [{ id: "d1" }], selectedDrawingId: "d1" });
    getState().removeDrawing("d1");
    expect(getState().drawings).toEqual([]);
    expect(getState().selectedDrawingId).toBeNull();
  });

  it("buildSheetIndex on empty drawings produces empty index", () => {
    getState().buildSheetIndex();
    expect(getState().sheetIndex).toEqual({});
  });

  it("getVersionChain handles broken chain gracefully (missing intermediate)", () => {
    useDrawingsStore.setState({
      drawings: [{ id: "d1", supersededBy: "d_missing" }],
    });
    // Chain starts at d1 but supersededBy points to nonexistent drawing
    const chain = getState().getVersionChain("d1");
    expect(chain).toEqual([{ id: "d1", supersededBy: "d_missing" }]);
  });

  it("getVersionChain handles broken backwards chain gracefully", () => {
    useDrawingsStore.setState({
      drawings: [{ id: "d2", supersedes: "d_missing" }],
    });
    // Can't walk backwards past d2, so chain is just d2
    const chain = getState().getVersionChain("d2");
    expect(chain).toEqual([{ id: "d2", supersedes: "d_missing" }]);
  });

  it("mergeAddendumDrawings with empty array returns empty and does not modify state", () => {
    useDrawingsStore.setState({ drawings: [{ id: "d1" }] });
    const added = getState().mergeAddendumDrawings([], 1);
    expect(added).toEqual([]);
    expect(getState().drawings).toHaveLength(1);
  });

  it("supersedeDrawing does not affect unrelated drawings", () => {
    useDrawingsStore.setState({
      drawings: [{ id: "d1" }, { id: "d2" }, { id: "d3", label: "Bystander" }],
    });
    getState().supersedeDrawing("d1", "d2", 1);
    const bystander = getState().drawings.find(d => d.id === "d3");
    expect(bystander).toEqual({ id: "d3", label: "Bystander" });
  });

  it("updateDrawing produces a new object reference (immutability)", () => {
    useDrawingsStore.setState({ drawings: [{ id: "d1", label: "A" }] });
    const before = getState().drawings[0];
    getState().updateDrawing("d1", "label", "B");
    const after = getState().drawings[0];
    expect(before).not.toBe(after);
    expect(before.label).toBe("A"); // original unchanged
    expect(after.label).toBe("B");
  });
});
