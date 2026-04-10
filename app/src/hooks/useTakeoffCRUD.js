/**
 * useTakeoffCRUD — Takeoff create/read/update/delete operations
 *
 * Extracted from TakeoffsPage to isolate CRUD logic from rendering.
 * All functions use getState() to avoid stale closures.
 */
import { useCallback } from "react";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useUiStore } from "@/stores/uiStore";
import { useModuleStore } from "@/stores/moduleStore";
import { MODULES } from "@/constants/modules";
import { TO_COLORS } from "@/utils/takeoffHelpers";
import { unitToTool } from "@/hooks/useMeasurementEngine";
import { uid } from "@/utils/format";

export default function useTakeoffCRUD() {
  /** Update a single field on a takeoff */
  const updateTakeoff = useCallback((id, f, v) => {
    const s = useDrawingPipelineStore.getState();
    s.setTakeoffs(s.takeoffs.map(t => (t.id === id ? { ...t, [f]: v } : t)));
  }, []);

  /** Delete a takeoff + clean up module links */
  const removeTakeoff = useCallback(id => {
    const s = useDrawingPipelineStore.getState();
    const toRemove = s.takeoffs.find(t => t.id === id);
    s.setTakeoffs(s.takeoffs.filter(t => t.id !== id));
    if (s.tkActiveTakeoffId === id) {
      s.setTkActiveTakeoffId(null);
      s.setTkMeasureState("idle");
      s.setTkTool("select");
    }

    // Clean up module links if this was a module-linked takeoff
    if (toRemove?.moduleId) {
      const bs = useModuleStore.getState();
      const inst = bs.moduleInstances?.[toRemove.moduleId];
      if (!inst) return;
      const moduleDef = MODULES[toRemove.moduleId];
      if (!moduleDef) return;

      // Check multi-instance categories first
      let found = false;
      moduleDef.categories.forEach(cat => {
        if (!cat.multiInstance || found) return;
        const catInstances = inst.categoryInstances?.[cat.id] || [];
        catInstances.forEach(catInst => {
          Object.entries(catInst.itemTakeoffIds || {}).forEach(([itemId, toId]) => {
            if (toId === id) {
              bs.linkCatInstanceItem(toRemove.moduleId, cat.id, catInst.id, itemId, null);
              bs.setCatInstanceItemStatus(toRemove.moduleId, cat.id, catInst.id, itemId, "pending");
              found = true;
            }
          });
        });
      });

      // Check single-instance items
      if (!found) {
        Object.entries(inst.itemTakeoffIds || {}).forEach(([itemId, toId]) => {
          if (toId === id) {
            bs.linkItemToTakeoff(toRemove.moduleId, itemId, null);
            bs.setItemStatus(toRemove.moduleId, itemId, "pending");
          }
        });
      }
    }
  }, []);

  /** Create a takeoff and optionally start measuring */
  const addTakeoff = useCallback((group = "", desc = "", unit = "SF", code = "", opts = {}) => {
    const id = uid();
    const ts = useDrawingPipelineStore.getState();
    const existingTakeoffs = Array.isArray(ts.takeoffs) ? ts.takeoffs : [];
    const { noMeasure: _noMeasure, quantity, ...extraFields } = opts;
    const bidCtx = useUiStore.getState().activeGroupId || "base";
    ts.setTakeoffs([
      ...existingTakeoffs,
      {
        id,
        description: desc || "New Takeoff",
        quantity: quantity || "",
        unit,
        color: TO_COLORS[Math.floor(Math.random() * TO_COLORS.length)],
        drawingRef: "",
        group,
        linkedItemId: "",
        code,
        variables: [],
        formula: "",
        measurements: [],
        bidContext: bidCtx,
        createdAt: Date.now(),
        ...extraFields,
      },
    ]);
    ts.clearPredictions();
    const drawingId = useDrawingPipelineStore.getState().selectedDrawingId;
    if (drawingId && desc && !opts.noMeasure) {
      ts.setTkActiveTakeoffId(id);
      ts.setTkTool(unitToTool(unit));
      ts.setTkMeasureState("measuring");
      ts.setTkActivePoints([]);
      ts.setTkContextMenu(null);
    }
    return id;
  }, []);

  /** Create a takeoff from a database element and start measuring */
  const addTakeoffFromDb = useCallback(el => {
    const id = uid();
    const ts = useDrawingPipelineStore.getState();
    const bidCtx = useUiStore.getState().activeGroupId || "base";
    ts.setTakeoffs([
      ...ts.takeoffs,
      {
        id,
        description: el.name,
        quantity: "",
        unit: el.unit || "SF",
        color: TO_COLORS[Math.floor(Math.random() * TO_COLORS.length)],
        drawingRef: "",
        group: "",
        linkedItemId: "",
        code: el.code,
        variables: [],
        formula: "",
        measurements: [],
        bidContext: bidCtx,
        createdAt: Date.now(),
      },
    ]);
    ts.clearPredictions();
    ts.setTkNewInput("");
    ts.setTkDbResults([]);
    useUiStore.getState().showToast(`Added: ${el.name} — measuring`);
    const drawingId = useDrawingPipelineStore.getState().selectedDrawingId;
    if (drawingId) {
      ts.setTkActiveTakeoffId(id);
      ts.setTkTool(unitToTool(el.unit || "SF"));
      ts.setTkMeasureState("measuring");
      ts.setTkActivePoints([]);
      ts.setTkContextMenu(null);
    }
  }, []);

  /** Create a takeoff from freeform text input */
  const addTakeoffFreeform = useCallback(desc => {
    if (!desc?.trim()) return;
    const id = uid();
    const ts = useDrawingPipelineStore.getState();
    const unit = ts.tkNewUnit || "SF";
    const bidCtx = useUiStore.getState().activeGroupId || "base";
    ts.setTakeoffs([
      ...ts.takeoffs,
      {
        id,
        description: desc.trim(),
        quantity: "",
        unit,
        color: TO_COLORS[ts.takeoffs.length % TO_COLORS.length],
        drawingRef: "",
        group: "",
        linkedItemId: "",
        code: "",
        variables: [],
        formula: "",
        measurements: [],
        bidContext: bidCtx,
        createdAt: Date.now(),
      },
    ]);
    ts.clearPredictions();
    ts.setTkNewInput("");
    ts.setTkDbResults([]);
    useUiStore.getState().showToast(`Added: ${desc.trim()} — measuring`);
    const drawingId = useDrawingPipelineStore.getState().selectedDrawingId;
    if (drawingId) {
      setTimeout(() => {
        const ts2 = useDrawingPipelineStore.getState();
        ts2.setTkActiveTakeoffId(id);
        ts2.setTkTool(unitToTool(unit));
        ts2.setTkMeasureState("measuring");
        ts2.setTkActivePoints([]);
        ts2.setTkContextMenu(null);
      }, 50);
    }
  }, []);

  /** Insert assembly as a single takeoff — measure once, all elements derive from it */
  const insertAssemblyIntoTakeoffs = useCallback(asm => {
    const ts = useDrawingPipelineStore.getState();
    const bidCtx = useUiStore.getState().activeGroupId || "base";
    // Determine unit from elements: use the first element's unit, or most common unit
    const units = asm.elements.map(el => el.unit).filter(Boolean);
    const primaryUnit = units.length > 0
      ? units.sort((a, b) => units.filter(u => u === b).length - units.filter(u => u === a).length)[0]
      : "SF";
    const newId = uid();
    const newTakeoff = {
      id: newId,
      description: asm.name,
      quantity: "",
      unit: primaryUnit,
      color: TO_COLORS[ts.takeoffs.length % TO_COLORS.length],
      drawingRef: "",
      group: asm.name,
      linkedItemId: "",
      code: asm.code || asm.elements[0]?.code || "",
      variables: [],
      formula: "",
      measurements: [],
      bidContext: bidCtx,
      createdAt: Date.now(),
      // Assembly elements — derive quantities from this takeoff's measured qty
      assemblyElements: asm.elements.map(el => ({
        code: el.code || "",
        desc: el.desc,
        unit: el.unit || primaryUnit,
        m: el.m || 0,
        l: el.l || 0,
        e: el.e || 0,
        sub: el.sub || 0,
        mode: el.mode || "mle",
        factor: el.factor || 1,
      })),
      assemblyName: asm.name,
    };
    ts.setTakeoffs([...ts.takeoffs, newTakeoff]);
    ts.setTkNewInput("");
    ts.setTkDbResults([]);
    useUiStore.getState().showToast(`Inserted "${asm.name}" assembly — measure once to calculate all ${asm.elements.length} elements`);
  }, []);

  return {
    updateTakeoff,
    removeTakeoff,
    addTakeoff,
    addTakeoffFromDb,
    addTakeoffFreeform,
    insertAssemblyIntoTakeoffs,
  };
}
