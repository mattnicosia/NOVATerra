import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── Mock all store dependencies ─────────────────────────────────

const mockTakeoffsState = {
  takeoffs: [],
  setTakeoffs: vi.fn(),
  tkActiveTakeoffId: null,
  setTkActiveTakeoffId: vi.fn(),
  setTkMeasureState: vi.fn(),
  setTkTool: vi.fn(),
  setTkActivePoints: vi.fn(),
  setTkContextMenu: vi.fn(),
  clearPredictions: vi.fn(),
  setTkNewInput: vi.fn(),
  setTkDbResults: vi.fn(),
  tkNewUnit: "SF",
};

vi.mock("@/stores/takeoffsStore", () => ({
  useTakeoffsStore: { getState: vi.fn(() => ({ ...mockTakeoffsState })) },
}));

vi.mock("@/stores/drawingsStore", () => ({
  useDrawingsStore: { getState: vi.fn(() => ({ selectedDrawingId: null })) },
}));

vi.mock("@/stores/uiStore", () => ({
  useUiStore: {
    getState: vi.fn(() => ({ activeGroupId: "base", showToast: vi.fn() })),
  },
}));

vi.mock("@/stores/moduleStore", () => ({
  useModuleStore: {
    getState: vi.fn(() => ({ moduleInstances: {} })),
  },
}));

vi.mock("@/constants/modules", () => ({
  MODULES: {},
}));

vi.mock("@/utils/takeoffHelpers", () => ({
  TO_COLORS: ["#FF0000", "#00FF00", "#0000FF", "#FFFF00"],
}));

vi.mock("@/hooks/useMeasurementEngine", () => ({
  unitToTool: unit => {
    const u = (unit || "SF").toUpperCase();
    if (["EA", "SET", "PAIR", "BOX", "ROLL", "PALLET", "BAG"].includes(u)) return "count";
    if (["LF", "VLF"].includes(u)) return "linear";
    return "area";
  },
}));

vi.mock("@/utils/format", () => ({
  uid: vi.fn(() => "test-uid-001"),
}));

// ── Import hook & mocked stores ────────────────────────────────

import useTakeoffCRUD from "@/hooks/useTakeoffCRUD";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useUiStore } from "@/stores/uiStore";
import { uid } from "@/utils/format";

// ── Test Suite ──────────────────────────────────────────────────

describe("useTakeoffCRUD", () => {
  const sampleTakeoffs = [
    { id: "to-1", description: "Concrete Slab", quantity: "150", unit: "SF", group: "Concrete" },
    { id: "to-2", description: "Steel Beam", quantity: "40", unit: "LF", group: "Steel" },
    { id: "to-3", description: "Door Count", quantity: "12", unit: "EA", group: "Openings" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    uid.mockReturnValue("test-uid-001");

    // Reset mock state
    useTakeoffsStore.getState.mockReturnValue({
      ...mockTakeoffsState,
      takeoffs: [...sampleTakeoffs],
      setTakeoffs: vi.fn(),
      setTkActiveTakeoffId: vi.fn(),
      setTkMeasureState: vi.fn(),
      setTkTool: vi.fn(),
      setTkActivePoints: vi.fn(),
      setTkContextMenu: vi.fn(),
      clearPredictions: vi.fn(),
      setTkNewInput: vi.fn(),
      setTkDbResults: vi.fn(),
    });
  });

  // ── updateTakeoff ──────────────────────────────────────────

  describe("updateTakeoff", () => {
    it("updates a single field on a takeoff", () => {
      const { result } = renderHook(() => useTakeoffCRUD());
      act(() => {
        result.current.updateTakeoff("to-1", "description", "Updated Slab");
      });

      const setTakeoffs = useTakeoffsStore.getState().setTakeoffs;
      expect(setTakeoffs).toHaveBeenCalledTimes(1);
      const updated = setTakeoffs.mock.calls[0][0];
      expect(updated.find(t => t.id === "to-1").description).toBe("Updated Slab");
    });

    it("preserves other fields on the updated takeoff", () => {
      const { result } = renderHook(() => useTakeoffCRUD());
      act(() => {
        result.current.updateTakeoff("to-1", "quantity", "200");
      });

      const updated = useTakeoffsStore.getState().setTakeoffs.mock.calls[0][0];
      const to = updated.find(t => t.id === "to-1");
      expect(to.description).toBe("Concrete Slab");
      expect(to.quantity).toBe("200");
      expect(to.unit).toBe("SF");
    });

    it("does not modify other takeoffs", () => {
      const { result } = renderHook(() => useTakeoffCRUD());
      act(() => {
        result.current.updateTakeoff("to-1", "description", "Changed");
      });

      const updated = useTakeoffsStore.getState().setTakeoffs.mock.calls[0][0];
      expect(updated.find(t => t.id === "to-2")).toEqual(sampleTakeoffs[1]);
      expect(updated.find(t => t.id === "to-3")).toEqual(sampleTakeoffs[2]);
    });

    it("handles updating a non-existent takeoff (no-op on that ID)", () => {
      const { result } = renderHook(() => useTakeoffCRUD());
      act(() => {
        result.current.updateTakeoff("nonexistent", "description", "X");
      });

      const updated = useTakeoffsStore.getState().setTakeoffs.mock.calls[0][0];
      expect(updated).toHaveLength(3);
      expect(updated).toEqual(sampleTakeoffs);
    });
  });

  // ── removeTakeoff ──────────────────────────────────────────

  describe("removeTakeoff", () => {
    it("removes a takeoff by id", () => {
      const { result } = renderHook(() => useTakeoffCRUD());
      act(() => {
        result.current.removeTakeoff("to-2");
      });

      const setTakeoffs = useTakeoffsStore.getState().setTakeoffs;
      const remaining = setTakeoffs.mock.calls[0][0];
      expect(remaining).toHaveLength(2);
      expect(remaining.find(t => t.id === "to-2")).toBeUndefined();
    });

    it("resets active state when removing the active takeoff", () => {
      const setActiveTakeoffId = vi.fn();
      const setMeasureState = vi.fn();
      const setTool = vi.fn();

      useTakeoffsStore.getState.mockReturnValue({
        ...useTakeoffsStore.getState(),
        takeoffs: [...sampleTakeoffs],
        setTakeoffs: vi.fn(),
        tkActiveTakeoffId: "to-1",
        setTkActiveTakeoffId: setActiveTakeoffId,
        setTkMeasureState: setMeasureState,
        setTkTool: setTool,
      });

      const { result } = renderHook(() => useTakeoffCRUD());
      act(() => {
        result.current.removeTakeoff("to-1");
      });

      expect(setActiveTakeoffId).toHaveBeenCalledWith(null);
      expect(setMeasureState).toHaveBeenCalledWith("idle");
      expect(setTool).toHaveBeenCalledWith("select");
    });

    it("does not reset active state when removing a non-active takeoff", () => {
      const setActiveTakeoffId = vi.fn();

      useTakeoffsStore.getState.mockReturnValue({
        ...useTakeoffsStore.getState(),
        takeoffs: [...sampleTakeoffs],
        setTakeoffs: vi.fn(),
        tkActiveTakeoffId: "to-1",
        setTkActiveTakeoffId: setActiveTakeoffId,
        setTkMeasureState: vi.fn(),
        setTkTool: vi.fn(),
      });

      const { result } = renderHook(() => useTakeoffCRUD());
      act(() => {
        result.current.removeTakeoff("to-2");
      });

      expect(setActiveTakeoffId).not.toHaveBeenCalled();
    });
  });

  // ── addTakeoff ─────────────────────────────────────────────

  describe("addTakeoff", () => {
    it("creates a takeoff with default values", () => {
      const { result } = renderHook(() => useTakeoffCRUD());
      let newId;
      act(() => {
        newId = result.current.addTakeoff();
      });

      expect(newId).toBe("test-uid-001");
      const setTakeoffs = useTakeoffsStore.getState().setTakeoffs;
      const all = setTakeoffs.mock.calls[0][0];
      const newTo = all[all.length - 1];
      expect(newTo.id).toBe("test-uid-001");
      expect(newTo.description).toBe("New Takeoff");
      expect(newTo.unit).toBe("SF");
      expect(newTo.group).toBe("");
      expect(newTo.bidContext).toBe("base");
      expect(newTo.measurements).toEqual([]);
      expect(newTo.variables).toEqual([]);
    });

    it("creates a takeoff with specified arguments", () => {
      const { result } = renderHook(() => useTakeoffCRUD());
      act(() => {
        result.current.addTakeoff("Concrete", "Foundation Slab", "SF", "03-300");
      });

      const all = useTakeoffsStore.getState().setTakeoffs.mock.calls[0][0];
      const newTo = all[all.length - 1];
      expect(newTo.group).toBe("Concrete");
      expect(newTo.description).toBe("Foundation Slab");
      expect(newTo.unit).toBe("SF");
      expect(newTo.code).toBe("03-300");
    });

    it("applies extra fields from opts", () => {
      const { result } = renderHook(() => useTakeoffCRUD());
      act(() => {
        result.current.addTakeoff("", "Test", "SF", "", { moduleId: "mod-1", linkedItemId: "item-1" });
      });

      const all = useTakeoffsStore.getState().setTakeoffs.mock.calls[0][0];
      const newTo = all[all.length - 1];
      expect(newTo.moduleId).toBe("mod-1");
      expect(newTo.linkedItemId).toBe("item-1");
    });

    it("uses quantity from opts if provided", () => {
      const { result } = renderHook(() => useTakeoffCRUD());
      act(() => {
        result.current.addTakeoff("", "Test", "EA", "", { quantity: 5 });
      });

      const all = useTakeoffsStore.getState().setTakeoffs.mock.calls[0][0];
      const newTo = all[all.length - 1];
      expect(newTo.quantity).toBe(5);
    });

    it("starts measuring when a drawing is selected and description is provided", () => {
      const setActiveTakeoffId = vi.fn();
      const setTool = vi.fn();
      const setMeasureState = vi.fn();
      const setActivePoints = vi.fn();
      const setContextMenu = vi.fn();

      useTakeoffsStore.getState.mockReturnValue({
        ...useTakeoffsStore.getState(),
        takeoffs: [...sampleTakeoffs],
        setTakeoffs: vi.fn(),
        setTkActiveTakeoffId: setActiveTakeoffId,
        setTkTool: setTool,
        setTkMeasureState: setMeasureState,
        setTkActivePoints: setActivePoints,
        setTkContextMenu: setContextMenu,
        clearPredictions: vi.fn(),
      });
      useDrawingsStore.getState.mockReturnValue({ selectedDrawingId: "dwg-1" });

      const { result } = renderHook(() => useTakeoffCRUD());
      act(() => {
        result.current.addTakeoff("", "Measure This", "LF");
      });

      expect(setActiveTakeoffId).toHaveBeenCalledWith("test-uid-001");
      expect(setTool).toHaveBeenCalledWith("linear");
      expect(setMeasureState).toHaveBeenCalledWith("measuring");
      expect(setActivePoints).toHaveBeenCalledWith([]);
    });

    it("does not start measuring with noMeasure option", () => {
      const setActiveTakeoffId = vi.fn();
      useDrawingsStore.getState.mockReturnValue({ selectedDrawingId: "dwg-1" });

      useTakeoffsStore.getState.mockReturnValue({
        ...useTakeoffsStore.getState(),
        takeoffs: [...sampleTakeoffs],
        setTakeoffs: vi.fn(),
        setTkActiveTakeoffId: setActiveTakeoffId,
        clearPredictions: vi.fn(),
      });

      const { result } = renderHook(() => useTakeoffCRUD());
      act(() => {
        result.current.addTakeoff("", "No Measure", "SF", "", { noMeasure: true });
      });

      expect(setActiveTakeoffId).not.toHaveBeenCalled();
    });

    it("does not start measuring without a drawing selected", () => {
      const setActiveTakeoffId = vi.fn();
      useDrawingsStore.getState.mockReturnValue({ selectedDrawingId: null });

      useTakeoffsStore.getState.mockReturnValue({
        ...useTakeoffsStore.getState(),
        takeoffs: [...sampleTakeoffs],
        setTakeoffs: vi.fn(),
        setTkActiveTakeoffId: setActiveTakeoffId,
        clearPredictions: vi.fn(),
      });

      const { result } = renderHook(() => useTakeoffCRUD());
      act(() => {
        result.current.addTakeoff("", "No Drawing", "SF");
      });

      expect(setActiveTakeoffId).not.toHaveBeenCalled();
    });

    it("does not start measuring without a description", () => {
      const setActiveTakeoffId = vi.fn();
      useDrawingsStore.getState.mockReturnValue({ selectedDrawingId: "dwg-1" });

      useTakeoffsStore.getState.mockReturnValue({
        ...useTakeoffsStore.getState(),
        takeoffs: [...sampleTakeoffs],
        setTakeoffs: vi.fn(),
        setTkActiveTakeoffId: setActiveTakeoffId,
        clearPredictions: vi.fn(),
      });

      const { result } = renderHook(() => useTakeoffCRUD());
      act(() => {
        result.current.addTakeoff();
      });

      expect(setActiveTakeoffId).not.toHaveBeenCalled();
    });

    it("clears predictions after adding", () => {
      const clearPredictions = vi.fn();
      useTakeoffsStore.getState.mockReturnValue({
        ...useTakeoffsStore.getState(),
        takeoffs: [...sampleTakeoffs],
        setTakeoffs: vi.fn(),
        clearPredictions,
      });

      const { result } = renderHook(() => useTakeoffCRUD());
      act(() => {
        result.current.addTakeoff();
      });

      expect(clearPredictions).toHaveBeenCalled();
    });
  });

  // ── addTakeoffFreeform ─────────────────────────────────────

  describe("addTakeoffFreeform", () => {
    it("does nothing for empty/null/undefined description", () => {
      const { result } = renderHook(() => useTakeoffCRUD());

      act(() => result.current.addTakeoffFreeform(""));
      act(() => result.current.addTakeoffFreeform(null));
      act(() => result.current.addTakeoffFreeform(undefined));
      act(() => result.current.addTakeoffFreeform("   "));

      expect(useTakeoffsStore.getState().setTakeoffs).not.toHaveBeenCalled();
    });

    it("creates a takeoff from freeform text, trimmed", () => {
      const setTakeoffs = vi.fn();
      const setTkNewInput = vi.fn();
      const setTkDbResults = vi.fn();
      const clearPredictions = vi.fn();

      useTakeoffsStore.getState.mockReturnValue({
        ...useTakeoffsStore.getState(),
        takeoffs: [...sampleTakeoffs],
        setTakeoffs,
        setTkNewInput,
        setTkDbResults,
        clearPredictions,
        tkNewUnit: "LF",
      });

      const { result } = renderHook(() => useTakeoffCRUD());
      act(() => {
        result.current.addTakeoffFreeform("  Concrete Footing  ");
      });

      const all = setTakeoffs.mock.calls[0][0];
      const newTo = all[all.length - 1];
      expect(newTo.description).toBe("Concrete Footing");
      expect(newTo.unit).toBe("LF");
      expect(clearPredictions).toHaveBeenCalled();
      expect(setTkNewInput).toHaveBeenCalledWith("");
      expect(setTkDbResults).toHaveBeenCalledWith([]);
    });
  });

  // ── insertAssemblyIntoTakeoffs ─────────────────────────────

  describe("insertAssemblyIntoTakeoffs", () => {
    it("inserts all assembly elements as takeoffs", () => {
      const setTakeoffs = vi.fn();
      const setTkNewInput = vi.fn();
      const setTkDbResults = vi.fn();

      useTakeoffsStore.getState.mockReturnValue({
        ...useTakeoffsStore.getState(),
        takeoffs: [...sampleTakeoffs],
        setTakeoffs,
        setTkNewInput,
        setTkDbResults,
      });

      const assembly = {
        name: "Concrete Foundation",
        elements: [
          { desc: "Footing", unit: "CY", code: "03-100" },
          { desc: "Slab", unit: "SF", code: "03-300" },
          { desc: "Rebar", unit: "LF", code: "03-200" },
        ],
      };

      uid.mockReturnValueOnce("asm-1").mockReturnValueOnce("asm-2").mockReturnValueOnce("asm-3");

      const { result } = renderHook(() => useTakeoffCRUD());
      act(() => {
        result.current.insertAssemblyIntoTakeoffs(assembly);
      });

      const all = setTakeoffs.mock.calls[0][0];
      // Original 3 + 3 new = 6
      expect(all).toHaveLength(6);

      const newItems = all.slice(3);
      expect(newItems[0].description).toBe("Footing");
      expect(newItems[0].unit).toBe("CY");
      expect(newItems[0].code).toBe("03-100");
      expect(newItems[0].group).toBe("Concrete Foundation");

      expect(newItems[1].description).toBe("Slab");
      expect(newItems[2].description).toBe("Rebar");

      expect(setTkNewInput).toHaveBeenCalledWith("");
      expect(setTkDbResults).toHaveBeenCalledWith([]);
    });
  });

  // ── Hook return shape ──────────────────────────────────────

  describe("hook return shape", () => {
    it("returns all CRUD functions", () => {
      const { result } = renderHook(() => useTakeoffCRUD());
      expect(typeof result.current.updateTakeoff).toBe("function");
      expect(typeof result.current.removeTakeoff).toBe("function");
      expect(typeof result.current.addTakeoff).toBe("function");
      expect(typeof result.current.addTakeoffFromDb).toBe("function");
      expect(typeof result.current.addTakeoffFreeform).toBe("function");
      expect(typeof result.current.insertAssemblyIntoTakeoffs).toBe("function");
    });

    it("returns stable function references across renders", () => {
      const { result, rerender } = renderHook(() => useTakeoffCRUD());
      const first = { ...result.current };
      rerender();
      expect(result.current.updateTakeoff).toBe(first.updateTakeoff);
      expect(result.current.removeTakeoff).toBe(first.removeTakeoff);
      expect(result.current.addTakeoff).toBe(first.addTakeoff);
      expect(result.current.addTakeoffFreeform).toBe(first.addTakeoffFreeform);
    });
  });
});
