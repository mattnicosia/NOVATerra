/**
 * useTakeoffCRUD — Takeoff create/read/update/delete operations
 *
 * Extracted from TakeoffsPage to isolate CRUD logic from rendering.
 * All functions use getState() to avoid stale closures.
 */
import { useCallback } from "react";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useUiStore } from "@/stores/uiStore";
import { useModuleStore } from "@/stores/moduleStore";
import { MODULES } from "@/constants/modules";
import { TO_COLORS } from "@/utils/takeoffHelpers";
import { unitToTool } from "@/hooks/useMeasurementEngine";
import { uid } from "@/utils/format";

export default function useTakeoffCRUD() {
  /** Update a single field on a takeoff */
  const updateTakeoff = useCallback((id, f, v) => {
    const s = useTakeoffsStore.getState();
    s.setTakeoffs(s.takeoffs.map(t => (t.id === id ? { ...t, [f]: v } : t)));
  }, []);

  /** Delete a takeoff + clean up module links */
  const removeTakeoff = useCallback(id => {
    const s = useTakeoffsStore.getState();
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
    const ts = useTakeoffsStore.getState();
    const { noMeasure: _noMeasure, quantity, ...extraFields } = opts;
    const bidCtx = useUiStore.getState().activeGroupId || "base";
    ts.setTakeoffs([
      ...ts.takeoffs,
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
        ...extraFields,
      },
    ]);
    ts.clearPredictions();
    const drawingId = useDrawingsStore.getState().selectedDrawingId;
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
    const ts = useTakeoffsStore.getState();
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
      },
    ]);
    ts.clearPredictions();
    ts.setTkNewInput("");
    ts.setTkDbResults([]);
    useUiStore.getState().showToast(`Added: ${el.name} — measuring`);
    const drawingId = useDrawingsStore.getState().selectedDrawingId;
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
    const ts = useTakeoffsStore.getState();
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
      },
    ]);
    ts.clearPredictions();
    ts.setTkNewInput("");
    ts.setTkDbResults([]);
    useUiStore.getState().showToast(`Added: ${desc.trim()} — measuring`);
    const drawingId = useDrawingsStore.getState().selectedDrawingId;
    if (drawingId) {
      setTimeout(() => {
        const ts2 = useTakeoffsStore.getState();
        ts2.setTkActiveTakeoffId(id);
        ts2.setTkTool(unitToTool(unit));
        ts2.setTkMeasureState("measuring");
        ts2.setTkActivePoints([]);
        ts2.setTkContextMenu(null);
      }, 50);
    }
  }, []);

  /** Insert all elements from an assembly as takeoffs */
  const insertAssemblyIntoTakeoffs = useCallback(asm => {
    const ts = useTakeoffsStore.getState();
    const bidCtx = useUiStore.getState().activeGroupId || "base";
    const newTakeoffs = asm.elements.map((el, i) => ({
      id: uid(),
      description: el.desc,
      quantity: "",
      unit: el.unit || "SF",
      color: TO_COLORS[(ts.takeoffs.length + i) % TO_COLORS.length],
      drawingRef: "",
      group: asm.name,
      linkedItemId: "",
      code: el.code,
      variables: [],
      formula: "",
      measurements: [],
      bidContext: bidCtx,
    }));
    ts.setTakeoffs([...ts.takeoffs, ...newTakeoffs]);
    ts.setTkNewInput("");
    ts.setTkDbResults([]);
    useUiStore.getState().showToast(`Inserted ${asm.elements.length} takeoff items from "${asm.name}"`);
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
