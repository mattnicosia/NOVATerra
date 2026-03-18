import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { useUndoStore } from "@/stores/undoStore";

// Helper to get fresh state
const getState = () => useTakeoffsStore.getState();
const setState = partial => useTakeoffsStore.setState(partial);

// Seed a takeoff directly into state (bypasses addTakeoff action)
const seedTakeoff = (overrides = {}) => {
  const tk = {
    id: overrides.id || "tk-1",
    description: overrides.description || "Test Takeoff",
    quantity: overrides.quantity ?? 0,
    unit: overrides.unit || "SF",
    color: overrides.color || "#C0392B",
    drawingRef: overrides.drawingRef || "",
    group: overrides.group || "",
    linkedItemId: overrides.linkedItemId || null,
    code: overrides.code || "",
    variables: overrides.variables || [],
    formula: overrides.formula || "",
    measurements: overrides.measurements || [],
    bidContext: overrides.bidContext || "base",
  };
  setState({ takeoffs: [...getState().takeoffs, tk] });
  return tk;
};

describe("takeoffsStore", () => {
  beforeEach(() => {
    // Install fake timers first, then flush any pending debounce from prior test
    vi.useFakeTimers();
    vi.runAllTimers();

    // Reset store to initial state
    useTakeoffsStore.setState({
      takeoffs: [],
      tkTool: "select",
      tkActivePoints: [],
      tkActiveTakeoffId: null,
      tkSelectedTakeoffId: null,
      tkMeasureState: "idle",
      tkCursorPt: null,
      tkContextMenu: null,
      tkCalibrations: {},
      tkCalibInput: { dist: "", unit: "ft" },
      tkShowVars: null,
      tkAutoCount: null,
      tkScopeSuggestions: null,
      tkZoom: 100,
      tkPan: { x: 0, y: 0 },
      tkPanelWidth: 550,
      tkPanelTier: "standard",
      tkPanelOpen: true,
      toFilter: "all",
      tkVisibility: "all",
      tkNewInput: "",
      tkNewUnit: "SF",
      tkDbResults: [],
      tkPredictions: null,
      tkPredAccepted: [],
      tkPredRejected: [],
      tkPredContext: null,
      tkPredRefining: false,
      tkNovaPanelOpen: false,
    });
    // Reset undo store after flushing any stale timers
    useUndoStore.setState({ past: [], future: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Initial State ───────────────────────────────────────────────
  describe("initial state shape", () => {
    it("has empty takeoffs array", () => {
      expect(getState().takeoffs).toEqual([]);
    });

    it("has correct default tool and panel state", () => {
      const s = getState();
      expect(s.tkTool).toBe("select");
      expect(s.tkPanelOpen).toBe(true);
      expect(s.tkPanelTier).toBe("standard");
      expect(s.tkPanelWidth).toBe(550);
    });

    it("has correct default measurement state", () => {
      const s = getState();
      expect(s.tkMeasureState).toBe("idle");
      expect(s.tkActivePoints).toEqual([]);
      expect(s.tkActiveTakeoffId).toBeNull();
      expect(s.tkSelectedTakeoffId).toBeNull();
    });

    it("has correct default zoom/pan", () => {
      const s = getState();
      expect(s.tkZoom).toBe(100);
      expect(s.tkPan).toEqual({ x: 0, y: 0 });
    });

    it("has null prediction state initially", () => {
      const s = getState();
      expect(s.tkPredictions).toBeNull();
      expect(s.tkPredAccepted).toEqual([]);
      expect(s.tkPredRejected).toEqual([]);
      expect(s.tkPredContext).toBeNull();
      expect(s.tkPredRefining).toBe(false);
      expect(s.tkNovaPanelOpen).toBe(false);
    });

    it("has correct default filter and visibility", () => {
      const s = getState();
      expect(s.toFilter).toBe("all");
      expect(s.tkVisibility).toBe("all");
    });
  });

  // ─── Adding Takeoffs ────────────────────────────────────────────
  describe("addTakeoff", () => {
    it("adds a takeoff with default values", () => {
      getState().addTakeoff();
      const tks = getState().takeoffs;
      expect(tks).toHaveLength(1);
      expect(tks[0].description).toBe("New Takeoff");
      expect(tks[0].unit).toBe("SF");
      expect(tks[0].quantity).toBe(0);
      expect(tks[0].bidContext).toBe("base");
      expect(tks[0].measurements).toEqual([]);
      expect(tks[0].variables).toEqual([]);
      expect(tks[0].id).toBeTruthy();
    });

    it("adds a takeoff with provided values", () => {
      getState().addTakeoff("Concrete", "Footings", "CY", "03-300", "alt1");
      const tk = getState().takeoffs[0];
      expect(tk.group).toBe("Concrete");
      expect(tk.description).toBe("Footings");
      expect(tk.unit).toBe("CY");
      expect(tk.code).toBe("03-300");
      expect(tk.bidContext).toBe("alt1");
    });

    it("generates unique IDs for each takeoff", () => {
      getState().addTakeoff();
      getState().addTakeoff();
      const tks = getState().takeoffs;
      expect(tks).toHaveLength(2);
      expect(tks[0].id).not.toBe(tks[1].id);
    });

    it("appends to existing takeoffs", () => {
      seedTakeoff({ id: "existing-1", description: "Existing" });
      getState().addTakeoff("", "Second");
      const tks = getState().takeoffs;
      expect(tks).toHaveLength(2);
      expect(tks[0].description).toBe("Existing");
      expect(tks[1].description).toBe("Second");
    });

    it("pushes undo entry on add", () => {
      getState().addTakeoff("", "Undo Test");
      expect(useUndoStore.getState().past).toHaveLength(1);
      expect(useUndoStore.getState().past[0].action).toContain("Add takeoff");
    });

    it("undo removes the added takeoff", () => {
      getState().addTakeoff("", "Will Undo");
      expect(getState().takeoffs).toHaveLength(1);
      // Execute the undo callback
      useUndoStore.getState().past[0].undo();
      expect(getState().takeoffs).toHaveLength(0);
    });

    it("redo restores the undone takeoff", () => {
      getState().addTakeoff("", "Will Redo");
      const added = getState().takeoffs[0];
      const entry = useUndoStore.getState().past[0];
      entry.undo();
      expect(getState().takeoffs).toHaveLength(0);
      entry.redo();
      expect(getState().takeoffs).toHaveLength(1);
      expect(getState().takeoffs[0].id).toBe(added.id);
    });

    it("assigns a color from the palette", () => {
      const palette = ["#C0392B", "#27AE60", "#2980B9", "#D35400", "#8E44AD", "#16A085", "#F39C12", "#E74C3C"];
      getState().addTakeoff();
      expect(palette).toContain(getState().takeoffs[0].color);
    });
  });

  // ─── Updating Takeoffs ──────────────────────────────────────────
  describe("updateTakeoff", () => {
    it("updates a single field on a takeoff", () => {
      seedTakeoff({ id: "u-1", description: "Original" });
      getState().updateTakeoff("u-1", "description", "Updated");
      expect(getState().takeoffs[0].description).toBe("Updated");
    });

    it("updates quantity", () => {
      seedTakeoff({ id: "u-2", quantity: 0 });
      getState().updateTakeoff("u-2", "quantity", 42.5);
      expect(getState().takeoffs[0].quantity).toBe(42.5);
    });

    it("updates unit", () => {
      seedTakeoff({ id: "u-3", unit: "SF" });
      getState().updateTakeoff("u-3", "unit", "LF");
      expect(getState().takeoffs[0].unit).toBe("LF");
    });

    it("does not affect other takeoffs", () => {
      seedTakeoff({ id: "u-4a", description: "First" });
      seedTakeoff({ id: "u-4b", description: "Second" });
      getState().updateTakeoff("u-4a", "description", "Changed");
      expect(getState().takeoffs[0].description).toBe("Changed");
      expect(getState().takeoffs[1].description).toBe("Second");
      // Flush the debounce timer so it doesn't leak into later tests
      vi.runAllTimers();
    });

    it("pushes undo entry after debounce timeout", () => {
      seedTakeoff({ id: "u-5", description: "Before" });
      useUndoStore.setState({ past: [], future: [] });
      getState().updateTakeoff("u-5", "description", "After");
      vi.advanceTimersByTime(1600);
      expect(useUndoStore.getState().past).toHaveLength(1);
    });

    it("coalesces rapid edits into one undo entry", () => {
      seedTakeoff({ id: "u-6", description: "Start" });
      const undoBefore = useUndoStore.getState().past.length;
      getState().updateTakeoff("u-6", "description", "Mid1");
      vi.advanceTimersByTime(500);
      getState().updateTakeoff("u-6", "description", "Mid2");
      vi.advanceTimersByTime(500);
      getState().updateTakeoff("u-6", "description", "Final");
      vi.advanceTimersByTime(1600);
      // Only one undo entry for the coalesced edits
      expect(useUndoStore.getState().past.length).toBe(undoBefore + 1);
    });

    it("undo restores original value after debounce", () => {
      seedTakeoff({ id: "u-7", description: "Original" });
      getState().updateTakeoff("u-7", "description", "Changed");
      vi.advanceTimersByTime(1600);
      useUndoStore.getState().past[0].undo();
      expect(getState().takeoffs[0].description).toBe("Original");
    });

    it("handles update on non-existent ID gracefully", () => {
      seedTakeoff({ id: "exists" });
      // Should not throw
      getState().updateTakeoff("does-not-exist", "description", "Nope");
      expect(getState().takeoffs).toHaveLength(1);
      expect(getState().takeoffs[0].description).toBe("Test Takeoff");
    });

    it("flushes pending edit when switching to different field", () => {
      seedTakeoff({ id: "u-8", description: "Orig", unit: "SF" });
      const undoBefore = useUndoStore.getState().past.length;
      getState().updateTakeoff("u-8", "description", "Changed");
      // Now edit a different field — should flush the description edit
      getState().updateTakeoff("u-8", "unit", "LF");
      // The flush from switching fields should have created an undo entry for description
      const newEntries = useUndoStore.getState().past.slice(undoBefore);
      expect(newEntries.length).toBeGreaterThanOrEqual(1);
      expect(newEntries[0].action).toBe("Edit takeoff");
    });
  });

  // ─── Deleting Takeoffs ──────────────────────────────────────────
  describe("removeTakeoff", () => {
    it("removes a takeoff by ID", () => {
      seedTakeoff({ id: "d-1" });
      seedTakeoff({ id: "d-2" });
      getState().removeTakeoff("d-1");
      expect(getState().takeoffs).toHaveLength(1);
      expect(getState().takeoffs[0].id).toBe("d-2");
    });

    it("does nothing for non-existent ID", () => {
      seedTakeoff({ id: "d-3" });
      getState().removeTakeoff("nope");
      expect(getState().takeoffs).toHaveLength(1);
    });

    it("pushes undo entry on remove", () => {
      seedTakeoff({ id: "d-4", description: "Removed" });
      getState().removeTakeoff("d-4");
      expect(useUndoStore.getState().past).toHaveLength(1);
      expect(useUndoStore.getState().past[0].action).toContain("Delete takeoff");
    });

    it("undo restores the removed takeoff at original index", () => {
      seedTakeoff({ id: "d-5a", description: "First" });
      seedTakeoff({ id: "d-5b", description: "Second" });
      seedTakeoff({ id: "d-5c", description: "Third" });
      getState().removeTakeoff("d-5b");
      expect(getState().takeoffs).toHaveLength(2);
      // Undo should restore at index 1
      useUndoStore.getState().past[0].undo();
      expect(getState().takeoffs).toHaveLength(3);
      expect(getState().takeoffs[1].id).toBe("d-5b");
    });

    it("redo re-removes the takeoff", () => {
      seedTakeoff({ id: "d-6" });
      getState().removeTakeoff("d-6");
      const entry = useUndoStore.getState().past[0];
      entry.undo();
      expect(getState().takeoffs).toHaveLength(1);
      entry.redo();
      expect(getState().takeoffs).toHaveLength(0);
    });

    it("does not push undo for non-existent ID", () => {
      getState().removeTakeoff("ghost");
      expect(useUndoStore.getState().past).toHaveLength(0);
    });
  });

  // ─── Measurements ───────────────────────────────────────────────
  describe("addMeasurement", () => {
    it("adds a measurement to a takeoff", () => {
      seedTakeoff({ id: "m-1" });
      getState().addMeasurement("m-1", { type: "linear", value: 100 });
      const tk = getState().takeoffs[0];
      expect(tk.measurements).toHaveLength(1);
      expect(tk.measurements[0].type).toBe("linear");
      expect(tk.measurements[0].value).toBe(100);
      expect(tk.measurements[0].id).toBeTruthy();
    });

    it("appends measurements, does not replace", () => {
      seedTakeoff({ id: "m-2", measurements: [{ id: "existing", type: "area" }] });
      getState().addMeasurement("m-2", { type: "linear" });
      expect(getState().takeoffs[0].measurements).toHaveLength(2);
    });

    it("undo removes the added measurement", () => {
      seedTakeoff({ id: "m-3" });
      getState().addMeasurement("m-3", { type: "count" });
      expect(getState().takeoffs[0].measurements).toHaveLength(1);
      useUndoStore.getState().past[0].undo();
      expect(getState().takeoffs[0].measurements).toHaveLength(0);
    });
  });

  describe("removeMeasurement", () => {
    it("removes a measurement from a takeoff", () => {
      seedTakeoff({
        id: "rm-1",
        measurements: [
          { id: "ms-1", type: "linear" },
          { id: "ms-2", type: "area" },
        ],
      });
      getState().removeMeasurement("rm-1", "ms-1");
      const tk = getState().takeoffs[0];
      expect(tk.measurements).toHaveLength(1);
      expect(tk.measurements[0].id).toBe("ms-2");
    });

    it("undo restores the removed measurement", () => {
      seedTakeoff({ id: "rm-2", measurements: [{ id: "ms-3", type: "count", value: 5 }] });
      getState().removeMeasurement("rm-2", "ms-3");
      expect(getState().takeoffs[0].measurements).toHaveLength(0);
      useUndoStore.getState().past[0].undo();
      expect(getState().takeoffs[0].measurements).toHaveLength(1);
      expect(getState().takeoffs[0].measurements[0].id).toBe("ms-3");
    });

    it("does not push undo if measurement not found", () => {
      seedTakeoff({ id: "rm-3", measurements: [] });
      getState().removeMeasurement("rm-3", "ghost-ms");
      expect(useUndoStore.getState().past).toHaveLength(0);
    });
  });

  // ─── Panel State ────────────────────────────────────────────────
  describe("panel state", () => {
    it("opens and closes the panel", () => {
      getState().setTkPanelOpen(false);
      expect(getState().tkPanelOpen).toBe(false);
      getState().setTkPanelOpen(true);
      expect(getState().tkPanelOpen).toBe(true);
    });

    it("sets panel tier", () => {
      getState().setTkPanelTier("compact");
      expect(getState().tkPanelTier).toBe("compact");
      getState().setTkPanelTier("full");
      expect(getState().tkPanelTier).toBe("full");
      getState().setTkPanelTier("estimate");
      expect(getState().tkPanelTier).toBe("estimate");
    });

    it("sets panel width", () => {
      getState().setTkPanelWidth(800);
      expect(getState().tkPanelWidth).toBe(800);
    });

    it("sets tool", () => {
      getState().setTkTool("measure");
      expect(getState().tkTool).toBe("measure");
    });

    it("sets visibility mode", () => {
      getState().setTkVisibility("page");
      expect(getState().tkVisibility).toBe("page");
      getState().setTkVisibility("active");
      expect(getState().tkVisibility).toBe("active");
    });

    it("sets filter", () => {
      getState().setToFilter("concrete");
      expect(getState().toFilter).toBe("concrete");
    });
  });

  // ─── Zoom/Pan (function updater support) ────────────────────────
  describe("zoom and pan", () => {
    it("sets zoom directly", () => {
      getState().setTkZoom(150);
      expect(getState().tkZoom).toBe(150);
    });

    it("sets zoom via updater function", () => {
      getState().setTkZoom(100);
      getState().setTkZoom(prev => prev + 25);
      expect(getState().tkZoom).toBe(125);
    });

    it("sets pan directly", () => {
      getState().setTkPan({ x: 50, y: -30 });
      expect(getState().tkPan).toEqual({ x: 50, y: -30 });
    });

    it("sets pan via updater function", () => {
      getState().setTkPan({ x: 10, y: 20 });
      getState().setTkPan(prev => ({ x: prev.x + 5, y: prev.y - 5 }));
      expect(getState().tkPan).toEqual({ x: 15, y: 15 });
    });
  });

  // ─── Predictive Takeoff State ───────────────────────────────────
  describe("prediction actions", () => {
    it("setTkPredictions sets predictions and opens NOVA panel", () => {
      const preds = { tag: "door", predictions: [{ id: "p1" }, { id: "p2" }], scanning: false };
      getState().setTkPredictions(preds);
      const s = getState();
      expect(s.tkPredictions).toEqual(preds);
      expect(s.tkPredAccepted).toEqual([]);
      expect(s.tkPredRejected).toEqual([]);
      expect(s.tkNovaPanelOpen).toBe(true);
    });

    it("setTkPredictions with null does not open panel", () => {
      getState().setTkPredictions(null);
      expect(getState().tkNovaPanelOpen).toBe(false);
    });

    it("setTkPredictions with empty predictions array does not open panel", () => {
      getState().setTkPredictions({ tag: "x", predictions: [] });
      expect(getState().tkNovaPanelOpen).toBe(false);
    });

    it("acceptPrediction adds to accepted and updates context", () => {
      getState().initPredContext("door", "tag", 0.7);
      getState().acceptPrediction("p1");
      const s = getState();
      expect(s.tkPredAccepted).toEqual(["p1"]);
      expect(s.tkPredContext.matchCount).toBe(1);
      expect(s.tkPredContext.consecutiveMisses).toBe(0);
      expect(s.tkPredContext.confidence).toBeCloseTo(0.73);
    });

    it("rejectPrediction adds to rejected and reduces confidence", () => {
      getState().initPredContext("door", "tag", 0.7);
      getState().rejectPrediction("p1");
      const s = getState();
      expect(s.tkPredRejected).toEqual(["p1"]);
      expect(s.tkPredContext.confidence).toBeCloseTo(0.65);
    });

    it("acceptAllPredictions accepts all non-rejected", () => {
      const preds = { tag: "w", predictions: [{ id: "a" }, { id: "b" }, { id: "c" }] };
      setState({ tkPredictions: preds, tkPredRejected: ["b"] });
      getState().initPredContext("w", "tag", 0.6);
      getState().acceptAllPredictions();
      const s = getState();
      expect(s.tkPredAccepted).toEqual(["a", "c"]);
      expect(s.tkPredContext.matchCount).toBe(2);
      expect(s.tkPredContext.confidence).toBe(0.95);
    });

    it("acceptAllPredictions with no predictions returns empty", () => {
      getState().acceptAllPredictions();
      expect(getState().tkPredAccepted).toEqual([]);
    });

    it("clearPredictions resets all prediction state", () => {
      setState({
        tkPredictions: { tag: "x", predictions: [{ id: "1" }] },
        tkPredAccepted: ["1"],
        tkPredRejected: [],
        tkPredContext: { tag: "x" },
        tkPredRefining: true,
        tkNovaPanelOpen: true,
      });
      getState().clearPredictions();
      const s = getState();
      expect(s.tkPredictions).toBeNull();
      expect(s.tkPredAccepted).toEqual([]);
      expect(s.tkPredRejected).toEqual([]);
      expect(s.tkPredContext).toBeNull();
      expect(s.tkPredRefining).toBe(false);
      expect(s.tkNovaPanelOpen).toBe(false);
    });

    it("initPredContext creates context with defaults", () => {
      getState().initPredContext("window");
      const ctx = getState().tkPredContext;
      expect(ctx.tag).toBe("window");
      expect(ctx.source).toBe("tag");
      expect(ctx.confidence).toBe(0.7);
      expect(ctx.matchCount).toBe(0);
      expect(ctx.missCount).toBe(0);
      expect(ctx.consecutiveMisses).toBe(0);
    });

    it("recordPredictionMiss increments miss counts and reduces confidence", () => {
      getState().initPredContext("door", "tag", 0.8);
      getState().recordPredictionMiss();
      const s = getState();
      expect(s.tkPredContext.missCount).toBe(1);
      expect(s.tkPredContext.consecutiveMisses).toBe(1);
      expect(s.tkPredContext.confidence).toBeCloseTo(0.72);
      expect(s.tkPredRefining).toBe(false);
    });

    it("recordPredictionMiss triggers refining after 2 consecutive misses", () => {
      getState().initPredContext("door", "tag", 0.8);
      getState().recordPredictionMiss();
      getState().recordPredictionMiss();
      expect(getState().tkPredRefining).toBe(true);
      expect(getState().tkPredContext.consecutiveMisses).toBe(2);
    });

    it("recordPredictionMiss with no context is a no-op", () => {
      getState().recordPredictionMiss();
      expect(getState().tkPredContext).toBeNull();
    });

    it("confidence never exceeds 0.98 on accept", () => {
      getState().initPredContext("x", "tag", 0.97);
      getState().acceptPrediction("p1");
      expect(getState().tkPredContext.confidence).toBe(0.98);
    });

    it("confidence never drops below 0.1 on reject", () => {
      getState().initPredContext("x", "tag", 0.12);
      getState().rejectPrediction("p1");
      expect(getState().tkPredContext.confidence).toBe(0.1);
    });

    it("confidence never drops below 0.1 on miss", () => {
      getState().initPredContext("x", "tag", 0.15);
      getState().recordPredictionMiss();
      expect(getState().tkPredContext.confidence).toBe(0.1);
    });

    it("setTkNovaPanelOpen supports updater function", () => {
      getState().setTkNovaPanelOpen(true);
      expect(getState().tkNovaPanelOpen).toBe(true);
      getState().setTkNovaPanelOpen(prev => !prev);
      expect(getState().tkNovaPanelOpen).toBe(false);
    });
  });

  // ─── Simple Setters ─────────────────────────────────────────────
  describe("simple setters", () => {
    it("setTakeoffs replaces takeoffs array", () => {
      const tks = [{ id: "x", description: "Direct" }];
      getState().setTakeoffs(tks);
      expect(getState().takeoffs).toEqual(tks);
    });

    it("setTkActivePoints", () => {
      getState().setTkActivePoints([{ x: 1, y: 2 }]);
      expect(getState().tkActivePoints).toEqual([{ x: 1, y: 2 }]);
    });

    it("setTkActiveTakeoffId", () => {
      getState().setTkActiveTakeoffId("abc");
      expect(getState().tkActiveTakeoffId).toBe("abc");
    });

    it("setTkSelectedTakeoffId", () => {
      getState().setTkSelectedTakeoffId("def");
      expect(getState().tkSelectedTakeoffId).toBe("def");
    });

    it("setTkMeasureState", () => {
      getState().setTkMeasureState("measuring");
      expect(getState().tkMeasureState).toBe("measuring");
    });

    it("setTkCursorPt", () => {
      getState().setTkCursorPt({ x: 5, y: 10 });
      expect(getState().tkCursorPt).toEqual({ x: 5, y: 10 });
    });

    it("setTkContextMenu", () => {
      getState().setTkContextMenu({ x: 100, y: 200 });
      expect(getState().tkContextMenu).toEqual({ x: 100, y: 200 });
    });

    it("setTkCalibrations", () => {
      getState().setTkCalibrations({ page1: { scale: 0.5 } });
      expect(getState().tkCalibrations).toEqual({ page1: { scale: 0.5 } });
    });

    it("setTkCalibInput", () => {
      getState().setTkCalibInput({ dist: "10", unit: "m" });
      expect(getState().tkCalibInput).toEqual({ dist: "10", unit: "m" });
    });

    it("setTkNewInput and setTkNewUnit", () => {
      getState().setTkNewInput("Drywall");
      expect(getState().tkNewInput).toBe("Drywall");
      getState().setTkNewUnit("LF");
      expect(getState().tkNewUnit).toBe("LF");
    });

    it("setTkDbResults", () => {
      getState().setTkDbResults([{ name: "Item 1" }]);
      expect(getState().tkDbResults).toEqual([{ name: "Item 1" }]);
    });

    it("setTkShowVars", () => {
      getState().setTkShowVars("tk-1");
      expect(getState().tkShowVars).toBe("tk-1");
    });

    it("setTkAutoCount", () => {
      getState().setTkAutoCount({ count: 5 });
      expect(getState().tkAutoCount).toEqual({ count: 5 });
    });

    it("setTkScopeSuggestions", () => {
      getState().setTkScopeSuggestions(["scope1"]);
      expect(getState().tkScopeSuggestions).toEqual(["scope1"]);
    });

    it("setTkPredRefining", () => {
      getState().setTkPredRefining(true);
      expect(getState().tkPredRefining).toBe(true);
    });
  });

  // ─── Edge Cases ─────────────────────────────────────────────────
  describe("edge cases", () => {
    it("removing from empty array does nothing", () => {
      getState().removeTakeoff("nope");
      expect(getState().takeoffs).toEqual([]);
    });

    it("adding measurement to non-existent takeoff does not crash", () => {
      getState().addMeasurement("ghost-id", { type: "area" });
      // No takeoff modified, but no error thrown
      expect(getState().takeoffs).toEqual([]);
    });

    it("multiple rapid adds maintain correct order", () => {
      for (let i = 0; i < 10; i++) {
        getState().addTakeoff("", `TK-${i}`);
      }
      const tks = getState().takeoffs;
      expect(tks).toHaveLength(10);
      tks.forEach((tk, i) => {
        expect(tk.description).toBe(`TK-${i}`);
      });
    });

    it("setTakeoffs with empty array clears all", () => {
      seedTakeoff({ id: "1" });
      seedTakeoff({ id: "2" });
      getState().setTakeoffs([]);
      expect(getState().takeoffs).toEqual([]);
    });

    it("updateTakeoff with same value still sets the field", () => {
      seedTakeoff({ id: "same", description: "Same" });
      getState().updateTakeoff("same", "description", "Same");
      // Value is still "Same" — state is applied regardless
      expect(getState().takeoffs[0].description).toBe("Same");
    });
  });
});
