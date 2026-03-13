// Module Panel — Measurement-centric scope tree UI
// Organized around what you measure, not trade categories.
// One measurement → many results. No implied sequence.
import { useMemo, useCallback, useEffect, useState, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useModuleStore } from "@/stores/moduleStore";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { MODULES } from "@/constants/modules";
import { computeAllDerivedWithInstances, getDrivingQty, evalCondition } from "@/utils/moduleCalc";
import { nn, uid } from "@/utils/format";
import { inp } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

export default function ModulePanel({
  engageMeasuring,
  selectedDrawingId,
  addTakeoff,
  updateTakeoff,
  removeTakeoff,
  pageFilter,
  onDetectWallSchedule,
  wallScheduleLoading,
}) {
  const C = useTheme();
  const T = C.T;
  const activeModule = useModuleStore(s => s.activeModule);
  const instances = useModuleStore(s => s.moduleInstances);
  const setActiveModule = useModuleStore(s => s.setActiveModule);
  const setSpec = useModuleStore(s => s.setSpec);
  const setItemStatus = useModuleStore(s => s.setItemStatus);
  const linkItemToTakeoff = useModuleStore(s => s.linkItemToTakeoff);
  const toggleCategory = useModuleStore(s => s.toggleCategory);
  // Multi-instance actions
  const addCategoryInstance = useModuleStore(s => s.addCategoryInstance);
  const removeCategoryInstance = useModuleStore(s => s.removeCategoryInstance);
  const renameCategoryInstance = useModuleStore(s => s.renameCategoryInstance);
  const setCatInstanceSpec = useModuleStore(s => s.setCatInstanceSpec);
  const linkCatInstanceItem = useModuleStore(s => s.linkCatInstanceItem);
  const setCatInstanceItemStatus = useModuleStore(s => s.setCatInstanceItemStatus);
  const removeModule = useModuleStore(s => s.removeModule);
  const collapseAllCategories = useModuleStore(s => s.collapseAllCategories);
  const expandAllCategories = useModuleStore(s => s.expandAllCategories);

  // Collapsed wall type instances (local UI state)
  const [collapsedInstances, setCollapsedInstances] = useState(new Set());

  // Collapsed spec accordion groups (local UI state) — all groups collapsed except first
  const [collapsedSpecGroups, setCollapsedSpecGroups] = useState(new Set());
  const toggleSpecGroup = useCallback(groupKey => {
    setCollapsedSpecGroups(prev => {
      const next = new Set(prev);
      next.has(groupKey) ? next.delete(groupKey) : next.add(groupKey);
      return next;
    });
  }, []);
  const toggleInstanceCollapse = useCallback(instId => {
    setCollapsedInstances(prev => {
      const next = new Set(prev);
      next.has(instId) ? next.delete(instId) : next.add(instId);
      return next;
    });
  }, []);

  const takeoffs = useTakeoffsStore(s => s.takeoffs);
  const tkActiveTakeoffId = useTakeoffsStore(s => s.tkActiveTakeoffId);

  const drawings = useDrawingsStore(s => s.drawings);
  const calibrations = useTakeoffsStore(s => s.tkCalibrations);
  const drawingScales = useDrawingsStore(s => s.drawingScales);
  const drawingDpi = useDrawingsStore(s => s.drawingDpi);

  const moduleDef = MODULES[activeModule];
  const inst = instances[activeModule] || {
    specs: {},
    itemStatus: {},
    itemTakeoffIds: {},
    expandedCategories: {},
    categoryInstances: {},
  };

  // Build scale context for computing real measured quantities from measurement points
  const scaleCtx = useMemo(
    () => ({
      calibrations,
      scales: drawingScales,
      dpi: drawingDpi,
      drawings,
    }),
    [calibrations, drawingScales, drawingDpi, drawings],
  );

  // Compute all derived quantities (supports multi-instance categories)
  const derived = useMemo(() => {
    if (!moduleDef) return {};
    return computeAllDerivedWithInstances(
      moduleDef,
      inst.specs,
      takeoffs,
      inst.itemTakeoffIds,
      inst.categoryInstances || {},
      scaleCtx,
    );
  }, [moduleDef, inst.specs, inst.categoryInstances, takeoffs, inst.itemTakeoffIds, scaleCtx]);

  // Build set of category IDs that have any item with measurements on the current page
  const catsOnPage = useMemo(() => {
    if (pageFilter !== "page" || !selectedDrawingId || !moduleDef) return null;
    const onPage = new Set();
    // Collect all takeoff IDs that have measurements on this drawing
    const takeoffIdsOnPage = new Set();
    takeoffs.forEach(t => {
      if ((t.measurements || []).some(m => m.sheetId === selectedDrawingId)) takeoffIdsOnPage.add(t.id);
    });
    // A category is on-page only if at least one of its items has a takeoff with measurements here
    moduleDef.categories.forEach(cat => {
      if (cat.multiInstance) {
        const catInstances = inst.categoryInstances?.[cat.id] || [];
        catInstances.forEach(catInst => {
          for (const item of cat.items) {
            const toId = catInst.itemTakeoffIds?.[item.id];
            if (toId && takeoffIdsOnPage.has(toId)) {
              onPage.add(cat.id);
              return;
            }
          }
        });
      } else {
        for (const item of cat.items) {
          const toId = inst.itemTakeoffIds?.[item.id];
          if (toId && takeoffIdsOnPage.has(toId)) {
            onPage.add(cat.id);
            break;
          }
        }
      }
    });
    return onPage;
  }, [pageFilter, selectedDrawingId, moduleDef, inst.itemTakeoffIds, inst.categoryInstances, takeoffs]);

  // Sync derived quantities to takeoffs — batches all changes in one store update
  const syncDerivedToTakeoffs = useCallback(() => {
    if (!moduleDef) return;
    const TO_COLORS = ["#C0392B", "#27AE60", "#2980B9", "#D35400", "#8E44AD", "#16A085", "#F39C12", "#E74C3C"];

    const currentTakeoffs = useTakeoffsStore.getState().takeoffs;
    const currentInst = useModuleStore.getState().moduleInstances[activeModule] || inst;
    const currentItemTakeoffIds = { ...currentInst.itemTakeoffIds };
    const currentItemStatus = { ...currentInst.itemStatus };
    const currentCategoryInstances = JSON.parse(JSON.stringify(currentInst.categoryInstances || {}));

    let next = [...currentTakeoffs];
    let linksChanged = false;
    let statusChanged = false;
    let catInstancesChanged = false;

    // Resolve descTemplate: "{StudSize}x{WallHeight}' Studs" → "2x6x24.5' Studs"
    const resolveDesc = (item, specs) => {
      if (!item.descTemplate || !specs) return item.name;
      return item.descTemplate.replace(/\{(\w+)\}/g, (_, key) => specs[key] ?? "").trim() || item.name;
    };

    // Helper: sync a single derived item
    const syncItem = (item, cat, derivedKey, itemTakeoffIds, itemStatus, groupLabel, specs, instanceId) => {
      if (item.type !== "derived") return;
      const d = derived[derivedKey];
      if (!d) return;
      if (itemStatus[item.id] === "excluded") return;
      let toId = itemTakeoffIds[item.id];
      // Clear stale references
      if (toId && !next.some(t => t.id === toId)) {
        itemTakeoffIds[item.id] = null;
        linksChanged = true;
        toId = null;
      }

      const desc = resolveDesc(item, specs);

      if (d.active && d.qty > 0) {
        if (toId) {
          const idx = next.findIndex(t => t.id === toId);
          if (idx !== -1) {
            const needsUpdate = nn(next[idx].quantity) !== d.qty || next[idx].description !== desc;
            if (needsUpdate) {
              next[idx] = { ...next[idx], quantity: d.qty, description: desc };
            }
          }
        } else {
          const newId = uid();
          next.push({
            id: newId,
            description: desc,
            quantity: d.qty,
            unit: item.unit,
            color: TO_COLORS[next.length % TO_COLORS.length],
            drawingRef: "",
            group: groupLabel,
            linkedItemId: "",
            code: item.code,
            variables: [],
            formula: "",
            measurements: [],
            moduleId: activeModule,
            moduleItemId: item.id,
            instanceId: instanceId || null,
          });
          itemTakeoffIds[item.id] = newId;
          itemStatus[item.id] = "derived";
          linksChanged = true;
          statusChanged = true;
        }
      } else if (!d.active && toId) {
        next = next.filter(t => t.id !== toId);
        itemTakeoffIds[item.id] = null;
        itemStatus[item.id] = "pending";
        linksChanged = true;
        statusChanged = true;
      }
    };

    moduleDef.categories.forEach(cat => {
      if (cat.multiInstance) {
        // Process each instance separately
        const catInstances = currentCategoryInstances[cat.id] || [];
        catInstances.forEach((catInst, idx) => {
          cat.items.forEach(item => {
            const derivedKey = `${catInst.id}:${item.id}`;
            const prevLen = next.length;
            const prevLinks = JSON.stringify(catInst.itemTakeoffIds);
            syncItem(
              item,
              cat,
              derivedKey,
              catInst.itemTakeoffIds,
              catInst.itemStatus,
              `${moduleDef.name} - ${cat.name} (${catInst.label})`,
              catInst.specs,
              catInst.id,
            );
            if (next.length !== prevLen || JSON.stringify(catInst.itemTakeoffIds) !== prevLinks) {
              catInstancesChanged = true;
            }
          });
        });
      } else {
        // Single-instance: use top-level ids
        const groupLabel = `${moduleDef.name} - ${cat.name}`;
        cat.items.forEach(item => {
          syncItem(item, cat, item.id, currentItemTakeoffIds, currentItemStatus, groupLabel, currentInst.specs, null);
        });
      }
    });

    // Batch update takeoffs store
    if (
      JSON.stringify(next.map(t => t.id + ":" + t.quantity)) !==
      JSON.stringify(currentTakeoffs.map(t => t.id + ":" + t.quantity))
    ) {
      useTakeoffsStore.getState().setTakeoffs(next);
    }

    // Batch update module store
    if (linksChanged || statusChanged || catInstancesChanged) {
      useModuleStore.setState(s => ({
        moduleInstances: {
          ...s.moduleInstances,
          [activeModule]: {
            ...s.moduleInstances[activeModule],
            itemTakeoffIds: currentItemTakeoffIds,
            itemStatus: currentItemStatus,
            categoryInstances: currentCategoryInstances,
          },
        },
      }));
    }
  }, [moduleDef, derived, activeModule, inst]);

  // Handle driving item click (single-instance categories)
  const handleDrivingClick = useCallback(
    (item, cat) => {
      if (!selectedDrawingId) return;
      let toId = inst.itemTakeoffIds[item.id];
      if (toId) {
        const exists = useTakeoffsStore.getState().takeoffs.some(t => t.id === toId);
        if (!exists) {
          linkItemToTakeoff(activeModule, item.id, null);
          toId = null;
        }
      }
      if (toId) {
        engageMeasuring(toId);
      } else {
        const groupName = `${moduleDef.name} - ${cat.name}`;
        const newId = addTakeoff(groupName, item.name, item.unit, item.code, {
          moduleId: activeModule,
          moduleItemId: item.id,
          instanceId: null,
        });
        linkItemToTakeoff(activeModule, item.id, newId);
        setItemStatus(activeModule, item.id, "measured");
      }
    },
    [
      inst.itemTakeoffIds,
      selectedDrawingId,
      moduleDef,
      activeModule,
      engageMeasuring,
      addTakeoff,
      linkItemToTakeoff,
      setItemStatus,
    ],
  );

  // Handle driving item click for multi-instance categories
  const handleInstanceDrivingClick = useCallback(
    (item, cat, catInst) => {
      if (!selectedDrawingId) return;
      let toId = catInst.itemTakeoffIds?.[item.id];
      if (toId) {
        const exists = useTakeoffsStore.getState().takeoffs.some(t => t.id === toId);
        if (!exists) {
          linkCatInstanceItem(activeModule, cat.id, catInst.id, item.id, null);
          toId = null;
        }
      }
      if (toId) {
        engageMeasuring(toId);
      } else {
        const groupName = `${moduleDef.name} - ${cat.name} (${catInst.label})`;
        const newId = addTakeoff(groupName, `${item.name} (${catInst.label})`, item.unit, item.code, {
          moduleId: activeModule,
          moduleItemId: item.id,
          instanceId: catInst.id,
        });
        linkCatInstanceItem(activeModule, cat.id, catInst.id, item.id, newId);
        setCatInstanceItemStatus(activeModule, cat.id, catInst.id, item.id, "measured");
      }
    },
    [
      selectedDrawingId,
      moduleDef,
      activeModule,
      engageMeasuring,
      addTakeoff,
      linkCatInstanceItem,
      setCatInstanceItemStatus,
    ],
  );

  // Handle spec change — useEffect([derived]) triggers sync automatically after re-render
  // Use Number() instead of parseFloat() to avoid partial parsing ("4x8" → 4)
  const handleSpecChange = useCallback(
    (specId, value) => {
      const numVal = Number(value);
      setSpec(activeModule, specId, value !== "" && !isNaN(numVal) ? numVal : value);
    },
    [activeModule, setSpec],
  );

  // Handle spec change for multi-instance categories
  const handleInstanceSpecChange = useCallback(
    (catId, instanceId, specId, value) => {
      const numVal = Number(value);
      setCatInstanceSpec(activeModule, catId, instanceId, specId, value !== "" && !isNaN(numVal) ? numVal : value);
    },
    [activeModule, setCatInstanceSpec],
  );

  // Handle manual qty change
  const handleManualQty = useCallback(
    (item, cat, value) => {
      let toId = inst.itemTakeoffIds[item.id];
      const qty = nn(value);
      if (!toId && qty > 0) {
        const groupName = `${moduleDef.name} - ${cat.name}`;
        const newId = addTakeoff(groupName, item.name, item.unit, item.code, {
          noMeasure: true,
          quantity: qty,
          moduleId: activeModule,
          moduleItemId: item.id,
          instanceId: null,
        });
        linkItemToTakeoff(activeModule, item.id, newId);
        setItemStatus(activeModule, item.id, "complete");
      } else if (toId) {
        updateTakeoff(toId, "quantity", qty);
      }
    },
    [inst.itemTakeoffIds, moduleDef, activeModule, addTakeoff, updateTakeoff, linkItemToTakeoff, setItemStatus],
  );

  // Handle "Same as Footings" — copy measurements from source category's driving takeoff
  const handleMirrorMeasurements = useCallback(
    targetCat => {
      if (!targetCat.mirrorSource || !moduleDef) return;
      const sourceCat = moduleDef.categories.find(c => c.id === targetCat.mirrorSource.categoryId);
      if (!sourceCat) return;
      const sourceDriving = sourceCat.items.find(i => i.id === sourceCat.drivingItemId);
      const targetDriving = targetCat.items.find(i => i.id === targetCat.drivingItemId);
      if (!sourceDriving || !targetDriving) return;
      const sourceToId = inst.itemTakeoffIds[sourceDriving.id];
      if (!sourceToId) return;
      const allTakeoffs = useTakeoffsStore.getState().takeoffs;
      const sourceTo = allTakeoffs.find(t => t.id === sourceToId);
      if (!sourceTo || !sourceTo.measurements?.length) return;

      // Pick a contrasting color from source (orange vs source's color)
      const mirrorColors = ["#F59E0B", "#EC4899", "#06B6D4", "#EF4444", "#14B8A6"];
      const srcColor = (sourceTo.color || "#5b8def").toLowerCase();
      const mirrorColor = mirrorColors.find(c => c.toLowerCase() !== srcColor) || "#F59E0B";

      // Re-color measurements with the mirror color
      const coloredMeasurements = sourceTo.measurements.map(m => ({ ...m, color: mirrorColor }));

      // Check if target already has a takeoff
      let targetToId = inst.itemTakeoffIds[targetDriving.id];
      if (targetToId) {
        const exists = allTakeoffs.some(t => t.id === targetToId);
        if (!exists) {
          linkItemToTakeoff(activeModule, targetDriving.id, null);
          targetToId = null;
        }
      }
      if (targetToId) {
        // Update existing takeoff with source measurements + new color
        const currentTakeoffs = useTakeoffsStore.getState().takeoffs;
        useTakeoffsStore
          .getState()
          .setTakeoffs(
            currentTakeoffs.map(t =>
              t.id === targetToId ? { ...t, color: mirrorColor, measurements: coloredMeasurements } : t,
            ),
          );
      } else {
        // Create new takeoff with copied measurements + contrasting color
        const groupName = `${moduleDef.name} - ${targetCat.name}`;
        const newId = addTakeoff(groupName, targetDriving.name, targetDriving.unit, targetDriving.code, {
          noMeasure: true,
          moduleId: activeModule,
          moduleItemId: targetDriving.id,
          instanceId: null,
        });
        linkItemToTakeoff(activeModule, targetDriving.id, newId);
        setItemStatus(activeModule, targetDriving.id, "measured");
        // Copy measurements from source with contrasting color
        const updated = useTakeoffsStore.getState().takeoffs;
        useTakeoffsStore
          .getState()
          .setTakeoffs(
            updated.map(t => (t.id === newId ? { ...t, color: mirrorColor, measurements: coloredMeasurements } : t)),
          );
      }
      // Select the new takeoff so it's visible
      if (targetToId || inst.itemTakeoffIds[targetDriving.id]) {
        const finalId =
          targetToId ||
          useTakeoffsStore.getState().takeoffs.find(t => t.name === targetDriving.name && t.moduleId === activeModule)
            ?.id;
        if (finalId) useTakeoffsStore.getState().setTkSelectedTakeoffId(finalId);
      }
      // Expand the target category
      if (!inst.expandedCategories?.[targetCat.id]) {
        toggleCategory(activeModule, targetCat.id);
      }
    },
    [
      inst.itemTakeoffIds,
      inst.expandedCategories,
      moduleDef,
      activeModule,
      addTakeoff,
      linkItemToTakeoff,
      setItemStatus,
      toggleCategory,
    ],
  );

  // Exclude / restore item
  const toggleExclude = useCallback(
    (item, catInst = null) => {
      if (catInst) {
        // Find cat for this instance
        const cat =
          moduleDef?.categories.find(c => (c.categoryInstances?.[c.id] || []).includes(catInst)) ||
          moduleDef?.categories.find(
            c => c.multiInstance && (inst.categoryInstances?.[c.id] || []).some(ci => ci.id === catInst.id),
          );
        if (!cat) return;
        const current = catInst.itemStatus?.[item.id];
        if (current === "excluded") {
          setCatInstanceItemStatus(activeModule, cat.id, catInst.id, item.id, "pending");
        } else {
          setCatInstanceItemStatus(activeModule, cat.id, catInst.id, item.id, "excluded");
          const toId = catInst.itemTakeoffIds?.[item.id];
          if (toId) {
            removeTakeoff(toId);
            linkCatInstanceItem(activeModule, cat.id, catInst.id, item.id, null);
          }
        }
      } else {
        const current = inst.itemStatus[item.id];
        if (current === "excluded") {
          setItemStatus(activeModule, item.id, "pending");
        } else {
          setItemStatus(activeModule, item.id, "excluded");
          const toId = inst.itemTakeoffIds[item.id];
          if (toId) {
            removeTakeoff(toId);
            linkItemToTakeoff(activeModule, item.id, null);
          }
        }
      }
    },
    [
      inst.itemStatus,
      inst.itemTakeoffIds,
      inst.categoryInstances,
      activeModule,
      moduleDef,
      setItemStatus,
      removeTakeoff,
      linkItemToTakeoff,
      setCatInstanceItemStatus,
      linkCatInstanceItem,
    ],
  );

  // Trigger sync on derived changes OR module switch
  useEffect(() => {
    if (!moduleDef || !activeModule) return;
    syncDerivedToTakeoffs();
  }, [derived, activeModule]);

  // Smart defaults: when a SOURCE spec (e.g. WallHeight) changes, auto-update dependent specs
  // Only triggers when the source value actually changes — NOT when user manually edits the target
  const prevSourceVals = useRef({});
  useEffect(() => {
    if (!moduleDef) return;
    moduleDef.categories.forEach(cat => {
      if (!cat.multiInstance) return;
      const catInstances = inst.categoryInstances?.[cat.id] || [];
      catInstances.forEach(catInst => {
        (cat.specs || []).forEach(spec => {
          if (!spec.defaultMap) return;
          Object.entries(spec.defaultMap).forEach(([sourceSpecId, mapping]) => {
            const sourceRaw = catInst.specs?.[sourceSpecId] ?? "";
            const currentVal = catInst.specs?.[spec.id];
            const prevKey = `${cat.id}:${catInst.id}:${sourceSpecId}`;
            const prevSource = prevSourceVals.current[prevKey];

            // Track source value; only apply defaults when source CHANGES (or on first mount)
            const sourceStr = String(sourceRaw);
            if (prevSource !== undefined && prevSource === sourceStr) {
              return; // Source unchanged — user manually changed target, don't overwrite
            }
            prevSourceVals.current[prevKey] = sourceStr;

            // Range-based numeric lookup: find largest mapping key ≤ source value
            let suggestedDefault;
            const numVal = parseFloat(sourceRaw);
            if (!isNaN(numVal)) {
              const keys = Object.keys(mapping)
                .map(Number)
                .filter(k => !isNaN(k))
                .sort((a, b) => b - a);
              const matchKey = keys.find(k => numVal >= k);
              suggestedDefault = matchKey !== undefined ? mapping[matchKey] : mapping[keys[keys.length - 1]];
            } else {
              suggestedDefault = mapping[String(sourceRaw)];
            }

            if (!suggestedDefault) return;
            if (currentVal !== suggestedDefault) {
              setCatInstanceSpec(activeModule, cat.id, catInst.id, spec.id, suggestedDefault);
            }
          });
        });
      });
    });
  }, [moduleDef, inst.categoryInstances, activeModule, setCatInstanceSpec]);

  if (!moduleDef) return null;
  // Hide entire panel when "This Page" filter yields no categories
  if (catsOnPage && catsOnPage.size === 0) return null;

  // ── RENDER ──────────────────────────────────────────────────────────────────

  // Helper: render a single result row (derived or manual item)
  const renderResultRow = (item, cat, catInst = null) => {
    const statusMap = catInst ? catInst.itemStatus : inst.itemStatus;
    const takeoffIdsMap = catInst ? catInst.itemTakeoffIds : inst.itemTakeoffIds;
    const derivedKey = catInst ? `${catInst.id}:${item.id}` : item.id;

    const status = statusMap?.[item.id];
    const isExcluded = status === "excluded";
    const toId = takeoffIdsMap?.[item.id];
    const isDerived = item.type === "derived";
    const isManual = item.type === "manual";
    const conditionMet = isDerived ? derived[derivedKey]?.active !== false : true;

    let qty = 0;
    if (isDerived) qty = derived[derivedKey]?.qty || 0;
    else if (isManual) qty = toId ? nn(takeoffs.find(t => t.id === toId)?.quantity) : 0;
    const hasQty = qty > 0;

    if (isDerived && !conditionMet && !hasQty && !isExcluded) return null;

    return (
      <div
        key={catInst ? `${catInst.id}:${item.id}` : item.id}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "3px 10px 3px 20px",
          opacity: isExcluded ? 0.4 : conditionMet ? 1 : 0.5,
          borderBottom: `1px solid ${C.border}08`,
        }}
      >
        <span
          style={{ fontSize: 9, color: hasQty ? C.green : C.textDimmer, flexShrink: 0, width: 10, textAlign: "center" }}
        >
          {isExcluded ? "—" : hasQty ? "\u2713" : "\u2192"}
        </span>
        {/* Color dot — clickable to change linked takeoff color */}
        {toId && hasQty && !isExcluded ? (
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              flexShrink: 0,
              cursor: "pointer",
              position: "relative",
              background: takeoffs.find(t => t.id === toId)?.color || C.accent,
            }}
            onClick={e => {
              e.stopPropagation();
              e.currentTarget.querySelector("input")?.click();
            }}
          >
            <input
              type="color"
              value={takeoffs.find(t => t.id === toId)?.color || "#2563eb"}
              onChange={e => {
                e.stopPropagation();
                updateTakeoff(toId, "color", e.target.value);
              }}
              onClick={e => e.stopPropagation()}
              style={{ position: "absolute", opacity: 0, width: 0, height: 0, top: 0, left: 0 }}
            />
          </div>
        ) : (
          <div style={{ width: 10, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              color: isExcluded ? C.textDim : hasQty ? C.text : C.textDim,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {item.name}
          </div>
        </div>
        {isManual && !isExcluded ? (
          <input
            type="number"
            value={qty || ""}
            onChange={e => handleManualQty(item, cat, e.target.value)}
            onClick={e => e.stopPropagation()}
            placeholder="0"
            style={{
              width: 45,
              textAlign: "right",
              fontSize: 11,
              fontFamily: T.font.sans,
              background: C.bg2,
              border: `1px solid ${C.border}`,
              borderRadius: 3,
              padding: "2px 4px",
              color: C.text,
              outline: "none",
            }}
          />
        ) : (
          <span
            style={{
              fontSize: 11,
              fontFamily: T.font.sans,
              color: hasQty ? C.text : C.textDimmer,
              fontFeatureSettings: "'tnum'",
              minWidth: 40,
              textAlign: "right",
            }}
          >
            {hasQty ? (qty >= 1000 ? Math.round(qty).toLocaleString() : Math.round(qty * 100) / 100) : "—"}
          </span>
        )}
        <span style={{ fontSize: 9, color: C.textMuted, width: 28, textAlign: "left", flexShrink: 0 }}>{item.unit}</span>
        {/* Delete linked takeoff (resets to pending without excluding) */}
        {toId && hasQty && !isExcluded && (
          <button
            onClick={e => {
              e.stopPropagation();
              removeTakeoff(toId);
            }}
            title="Delete takeoff"
            style={{
              width: 20,
              height: 20,
              border: "none",
              background: "transparent",
              color: C.red,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              borderRadius: 3,
              flexShrink: 0,
              opacity: 0.5,
            }}
          >
            <Ic d={I.xCircle} size={11} />
          </button>
        )}
        <button
          onClick={e => {
            e.stopPropagation();
            toggleExclude(item, catInst);
          }}
          title={isExcluded ? "Restore" : "Exclude"}
          style={{
            width: 14,
            height: 14,
            border: "none",
            background: "transparent",
            color: C.textDimmer,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            borderRadius: 3,
            flexShrink: 0,
            opacity: 0.5,
          }}
        >
          <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            {isExcluded ? (
              <>
                <path d="M1 5h8" />
                <path d="M5 1v8" />
              </>
            ) : (
              <path d="M2 2l6 6M8 2l-6 6" />
            )}
          </svg>
        </button>
      </div>
    );
  };

  // Helper: render spec form (single-instance)
  const renderSpecs = (specs, onSpecChange) => {
    if (!specs || specs.length === 0) return null;
    const specValues = onSpecChange === handleSpecChange ? inst.specs : null;
    return (
      <div
        style={{
          margin: "4px 8px",
          padding: "6px 8px",
          background: C.bg2,
          borderRadius: 5,
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
        }}
      >
        {specs.map(spec => (
          <div
            key={spec.id}
            style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 72, flex: "1 1 72px", maxWidth: 120 }}
          >
            <label
              style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.3 }}
            >
              {spec.label} {spec.unit && <span style={{ color: C.textDimmer }}>({spec.unit})</span>}
            </label>
            {spec.type === "number" ? (
              <input
                type="number"
                value={specValues ? (specValues[spec.id] ?? spec.default) : spec.default}
                onChange={e => onSpecChange(spec.id, e.target.value)}
                min={spec.min}
                max={spec.max}
                step={spec.step || 1}
                style={inp(C, {
                  padding: "2px 3px",
                  fontSize: 10,
                  background: C.bg1,
                  border: `1px solid ${C.border}`,
                  borderRadius: 3,
                  width: "100%",
                })}
              />
            ) : (
              <select
                value={specValues ? (specValues[spec.id] ?? spec.default) : spec.default}
                onChange={e => onSpecChange(spec.id, e.target.value)}
                style={inp(C, {
                  padding: "2px 3px",
                  fontSize: 10,
                  background: C.bg1,
                  border: `1px solid ${C.border}`,
                  borderRadius: 3,
                  width: "100%",
                  cursor: "pointer",
                })}
              >
                {spec.options.map(opt => (
                  <option key={opt} value={opt}>
                    {spec.displayMap?.[opt] || opt}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Helper: render instance specs form (with condition filtering)
  const renderInstanceSpecs = (specs, catId, catInst, templates) => {
    if (!specs || specs.length === 0) return null;
    // Build context from instance specs for condition evaluation
    const specCtx = { ...catInst.specs };
    // Fill defaults for specs not yet set
    specs.forEach(s => {
      if (specCtx[s.id] === undefined) specCtx[s.id] = s.default;
    });
    // Split: Material spec gets its own row above the rest
    const materialSpec = specs.find(s => s.id === "Material");
    const restSpecs = specs.filter(s => s.id !== "Material");

    // Apply a quick-start template (fills multiple specs at once)
    const applyTemplate = template => {
      Object.entries(template.specs).forEach(([k, v]) => {
        handleInstanceSpecChange(catId, catInst.id, k, v);
      });
    };

    const renderSpec = spec => (
      <div
        key={spec.id}
        style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 72, flex: "1 1 72px", maxWidth: 120 }}
      >
        <label
          style={{ fontSize: 8, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.3 }}
        >
          {spec.label} {spec.unit && <span style={{ color: C.textDimmer }}>({spec.unit})</span>}
        </label>
        {spec.type === "number" ? (
          <input
            type="number"
            value={catInst.specs?.[spec.id] ?? spec.default}
            onChange={e => handleInstanceSpecChange(catId, catInst.id, spec.id, e.target.value)}
            min={spec.min}
            max={spec.max}
            step={spec.step || 1}
            style={inp(C, {
              padding: "2px 3px",
              fontSize: 10,
              background: C.bg1,
              border: `1px solid ${C.border}`,
              borderRadius: 3,
              width: "100%",
            })}
          />
        ) : (
          <select
            value={catInst.specs?.[spec.id] ?? spec.default}
            onChange={e => handleInstanceSpecChange(catId, catInst.id, spec.id, e.target.value)}
            style={inp(C, {
              padding: "2px 3px",
              fontSize: 10,
              background: C.bg1,
              border: `1px solid ${C.border}`,
              borderRadius: 3,
              width: "100%",
              cursor: "pointer",
            })}
          >
            {spec.options.map(opt => (
              <option key={opt} value={opt}>
                {spec.displayMap?.[opt] || opt}
              </option>
            ))}
          </select>
        )}
      </div>
    );

    return (
      <div style={{ margin: "4px 8px" }}>
        {/* Quick-start template pills */}
        {templates && templates.length > 0 && (
          <div
            style={{
              padding: "5px 8px",
              background: `linear-gradient(135deg, ${C.bg2}, ${C.bg1})`,
              borderRadius: "5px 5px 0 0",
              borderBottom: `1px solid ${C.border}`,
              display: "flex",
              gap: 4,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{ fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              Quick Start
            </span>
            {templates.map((tmpl, ti) => (
              <button
                key={ti}
                onClick={() => applyTemplate(tmpl)}
                style={{
                  padding: "3px 8px",
                  fontSize: 9,
                  fontWeight: 600,
                  border: `1px solid ${C.accent}30`,
                  background: C.bg1,
                  color: C.text,
                  borderRadius: 10,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = C.accent + "15";
                  e.currentTarget.style.borderColor = C.accent;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = C.bg1;
                  e.currentTarget.style.borderColor = C.accent + "30";
                }}
              >
                {tmpl.label}
              </button>
            ))}
          </div>
        )}
        {materialSpec && (
          <div
            style={{
              padding: "6px 8px",
              background: C.bg2,
              borderRadius: templates?.length ? 0 : "5px 5px 0 0",
              borderBottom: `1px solid ${C.border}`,
              display: "flex",
              gap: 4,
            }}
          >
            {renderSpec(materialSpec)}
          </div>
        )}
        {(() => {
          // Group visible specs into accordion sections
          const visibleSpecs = restSpecs.filter(s => !s.condition || evalCondition(s.condition, specCtx));
          const getGroup = spec => {
            if (spec.specGroup) return spec.specGroup;
            const id = spec.id;
            if (id.startsWith("Dw")) return "Drywall";
            if (id.startsWith("Sheath") || id === "WrbType" || id === "MSSheathing" || id.includes("Sheathing"))
              return "Sheathing";
            if (id.startsWith("Insul") || id.includes("Insul") || id === "WrbType") return "Insulation & WRB";
            if (
              id.startsWith("Roof") &&
              (id.includes("Finish") ||
                id.includes("Underlayment") ||
                id.includes("Flashing") ||
                id.includes("RidgeVent"))
            )
              return "Roofing Finish";
            if (id === "ShingleStyle" || id === "MetalPanWidth" || id === "TPOThickness") return "Roofing Finish";
            return "Structure";
          };
          const groups = [];
          const groupMap = {};
          visibleSpecs.forEach(s => {
            const g = getGroup(s);
            if (!groupMap[g]) {
              groupMap[g] = [];
              groups.push(g);
            }
            groupMap[g].push(s);
          });
          // If only one group, render flat (no accordion)
          if (groups.length <= 1) {
            return (
              <div
                style={{
                  padding: "6px 8px",
                  background: C.bg2,
                  borderRadius: materialSpec ? "0 0 5px 5px" : 5,
                  display: "flex",
                  gap: 4,
                  flexWrap: "wrap",
                }}
              >
                {visibleSpecs.map(spec => renderSpec(spec))}
              </div>
            );
          }
          // Multiple groups → accordion
          return groups.map((g, gi) => {
            const groupKey = `${catId}-${catInst.id}-${g}`;
            const isCollapsed = collapsedSpecGroups.has(groupKey);
            const isLast = gi === groups.length - 1;
            const customized = groupMap[g].filter(s => {
              const val = catInst.specs?.[s.id];
              return val !== undefined && val !== s.default;
            }).length;
            return (
              <div key={g}>
                <div
                  onClick={() => toggleSpecGroup(groupKey)}
                  style={{
                    padding: "4px 8px",
                    background: C.bg2,
                    borderBottom: isCollapsed && !isLast ? `1px solid ${C.border}` : "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="none"
                    stroke={C.textDim}
                    strokeWidth="1.5"
                    style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)", transition: "transform 0.15s" }}
                  >
                    <path d="M2 1l3 3-3 3" />
                  </svg>
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      color: C.textDim,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {g}
                  </span>
                  {customized > 0 && (
                    <span style={{ fontSize: 7, color: C.accent, fontWeight: 600 }}>({customized} customized)</span>
                  )}
                </div>
                {!isCollapsed && (
                  <div
                    style={{
                      padding: "6px 8px",
                      background: C.bg2,
                      borderRadius: isLast ? "0 0 5px 5px" : 0,
                      display: "flex",
                      gap: 4,
                      flexWrap: "wrap",
                      borderBottom: !isLast ? `1px solid ${C.border}20` : "none",
                    }}
                  >
                    {groupMap[g].map(spec => renderSpec(spec))}
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>
    );
  };

  // Material color map — accent colors for visual differentiation
  // Designer palette — maximally distinct hues (Tailwind-inspired)
  const MATERIAL_COLORS = {
    Wood: "#B45309",
    "Wood Framing": "#B45309",
    "Wood Trusses": "#CA8A04", // wood tones
    "Wood Rafters": "#B45309", // amber-700 — wood
    "Metal Stud": "#6366F1",
    "Steel Deck": "#6366F1", // indigo-500 — steel/metal
    "Steel Joist/Deck": "#6366F1", // indigo — steel
    CMU: "#DC2626", // red-600 — masonry block
    Concrete: "#6B7280",
    "Concrete on Deck": "#6B7280", // gray-500 — raw concrete
    "Precast/Concrete": "#6B7280", // gray — concrete
    ICF: "#0891B2", // cyan-600 — insulated forms
    "Tilt-Up": "#0EA5E9", // sky-500 — blue panel
    Precast: "#8B5CF6",
    "Precast Plank": "#8B5CF6", // violet-500 — precast
    SIP: "#D97706",
    "SIP Panels": "#D97706", // amber-600 — panel/foam
    "3D Printed": "#22C55E", // green-500 — bright green
    CLT: "#78350F", // amber-900 — dark timber
    // Roof finish types
    "Asphalt Shingles": "#DC2626", // red — shingles
    "Standing Seam Metal": "#6366F1", // indigo — metal
    TPO: "#0891B2", // cyan — membrane
    EPDM: "#1E293B", // slate-800 — dark rubber
    "Built-Up": "#6B7280", // gray — BUR
    "Modified Bitumen": "#78350F", // dark brown
    "Clay Tile": "#DC2626", // red — clay
    "Concrete Tile": "#6B7280", // gray — concrete
    Slate: "#475569", // slate-600
    // Gutter types
    'K-Style 5" Aluminum': "#6B7280",
    'K-Style 6" Aluminum': "#6B7280",
    'Half-Round 6" Copper': "#B45309",
    "Commercial Scupper": "#475569",
    // Steel module — structural framing
    "W-Shapes (Beams/Columns)": "#6366F1",
    "HSS Tubes": "#8B5CF6",
    "Channels/Angles": "#0EA5E9",
    "Built-Up Plate Girders": "#475569",
    // Steel module — joists
    "K-Series": "#6366F1",
    "LH-Series": "#8B5CF6",
    "DLH-Series": "#0EA5E9",
    // Steel module — decking
    '1.5" B 22ga': "#6366F1",
    '1.5" B 20ga': "#6366F1",
    '2" W 20ga': "#8B5CF6",
    '3" N 20ga': "#0EA5E9",
    '3" N 18ga': "#0891B2",
    // Steel module — misc
    Lintels: "#6B7280",
    "Embed Plates": "#475569",
    Stairs: "#DC2626",
    Railings: "#D97706",
    Grating: "#6366F1",
  };

  // Helper: compute spec-based display name for a type instance
  const computeAutoLabel = (cat, catInst) => {
    if (catInst.label && catInst.label.trim()) return catInst.label;
    // Build label from key dimension specs
    const dimKeys = ["Width", "Depth", "Length", "Height", "Diameter", "Size", "StudSize"];
    const dims = [];
    const specs = cat.specs || [];
    for (const s of specs) {
      if (dimKeys.some(k => s.id.endsWith(k) || s.id === k)) {
        const val = catInst.specs?.[s.id] ?? s.default;
        if (val != null && val !== "") dims.push(String(val));
      }
    }
    // Also check Material
    const matVal = catInst.specs?.Material;
    if (dims.length > 0) {
      const dimStr = dims.join("\u00d7"); // ×
      return matVal ? `${dimStr} ${matVal}` : dimStr;
    }
    if (matVal) return matVal;
    return cat.name;
  };

  // Helper: render a single multi-instance block
  const renderInstance = (cat, catInst, catInstances) => {
    const drivingItem = cat.items.find(i => i.id === cat.drivingItemId);
    const drivingToId = drivingItem ? catInst.itemTakeoffIds?.[drivingItem.id] : null;
    const drivingQty = drivingItem
      ? getDrivingQty(drivingItem.id, catInst.itemTakeoffIds || {}, takeoffs, scaleCtx)
      : 0;
    const isMeasuring = drivingToId && tkActiveTakeoffId === drivingToId;
    const derivedItems = cat.items.filter(i => i.type !== "driving");
    const isCollapsed = collapsedInstances.has(catInst.id);
    const displayLabel = computeAutoLabel(cat, catInst);

    // Resolve material color from instance specs (fallback to category specs defaults)
    const materialSpec = cat.specs?.find(s => s.id === "Material");
    const materialVal = catInst.specs?.Material || materialSpec?.default || "";
    const matColor = MATERIAL_COLORS[materialVal] || C.accent;

    return (
      <div
        key={catInst.id}
        style={{ borderLeft: `3px solid ${isMeasuring ? C.accent : matColor}90`, marginLeft: 6, marginBottom: 4 }}
      >
        {/* Instance header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 8px",
            background: isMeasuring ? `${C.accent}08` : `${matColor}08`,
            cursor: "pointer",
          }}
          onClick={() => toggleInstanceCollapse(catInst.id)}
        >
          {/* Material color dot */}
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: matColor, flexShrink: 0 }} />

          {/* Collapse chevron */}
          <span
            style={{
              fontSize: 8,
              color: C.textDim,
              transition: "transform 0.15s",
              transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
              display: "inline-block",
            }}
          >
            ▼
          </span>

          {/* Editable label — shows spec-based auto-name as placeholder */}
          <input
            value={catInst.label}
            placeholder={displayLabel}
            onChange={e => renameCategoryInstance(activeModule, cat.id, catInst.id, e.target.value)}
            onClick={e => e.stopPropagation()}
            style={{
              width: 80,
              fontSize: 10,
              fontWeight: 700,
              color: catInst.label ? matColor : C.textMuted,
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
            }}
          />

          {/* Unit badge */}
          {drivingItem && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: C.textMuted,
                background: `${C.text}10`,
                padding: "1px 4px",
                borderRadius: 2,
              }}
            >
              {drivingItem.unit}
            </span>
          )}

          <div style={{ flex: 1 }} />

          {/* Driving qty */}
          {drivingQty > 0 && (
            <span style={{ fontSize: 11, fontFamily: T.font.sans, fontWeight: 600, color: C.text }}>
              {drivingQty >= 1000 ? Math.round(drivingQty).toLocaleString() : Math.round(drivingQty * 100) / 100}
            </span>
          )}

          {/* Measure button */}
          {drivingItem && (
            <button
              onClick={e => {
                e.stopPropagation();
                handleInstanceDrivingClick(drivingItem, cat, catInst);
              }}
              disabled={!selectedDrawingId}
              style={{
                border: "none",
                borderRadius: 3,
                cursor: selectedDrawingId ? "pointer" : "not-allowed",
                padding: "2px 6px",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.3,
                background: isMeasuring ? C.accent : drivingQty > 0 ? `${C.green}20` : `${C.accent}15`,
                color: isMeasuring ? "#fff" : drivingQty > 0 ? C.green : C.accent,
                opacity: selectedDrawingId ? 1 : 0.4,
              }}
            >
              {isMeasuring ? "MEASURING" : drivingQty > 0 ? "RE-MEASURE" : "MEASURE"}
            </button>
          )}

          {/* Delete driving takeoff (clear measurement without removing instance) */}
          {drivingToId && drivingQty > 0 && !isMeasuring && (
            <button
              onClick={e => {
                e.stopPropagation();
                removeTakeoff(drivingToId);
              }}
              title="Delete measurement"
              style={{
                width: 22,
                height: 22,
                border: "none",
                background: "transparent",
                color: C.red,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                opacity: 0.6,
              }}
            >
              <Ic d={I.xCircle} size={12} />
            </button>
          )}

          {/* Delete instance (only if > 1) */}
          {catInstances.length > 1 && (
            <button
              onClick={e => {
                e.stopPropagation();
                // Remove linked takeoffs first
                cat.items.forEach(item => {
                  const toId = catInst.itemTakeoffIds?.[item.id];
                  if (toId) removeTakeoff(toId);
                });
                removeCategoryInstance(activeModule, cat.id, catInst.id);
              }}
              title="Remove type"
              style={{
                width: 22,
                height: 22,
                border: "none",
                background: "transparent",
                color: C.red,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                opacity: 0.6,
              }}
            >
              <Ic d={I.xCircle} size={12} />
            </button>
          )}
        </div>

        {/* Collapsible body */}
        {!isCollapsed && (
          <>
            {/* Instance specs */}
            {renderInstanceSpecs(cat.specs, cat.id, catInst, cat.templates)}

            {/* Stud length warning: standard lumber not available over 20' */}
            {(() => {
              const material = catInst.specs?.Material ?? cat.specs?.find(s => s.id === "Material")?.default ?? "";
              const studSize = catInst.specs?.StudSize ?? cat.specs?.find(s => s.id === "StudSize")?.default ?? "";
              const wallHt = parseFloat(
                catInst.specs?.WallHeight ?? cat.specs?.find(s => s.id === "WallHeight")?.default ?? 0,
              );
              const isStdLumber = studSize.startsWith("2x");
              if (material !== "Wood" || !isStdLumber || wallHt <= 20) return null;
              // Standard lumber stock lengths
              const stockLengths = [8, 10, 12, 14, 16, 20];
              // Map current stud depth → matching LVL/PSL options (sorted: least material first)
              const depthMap = {
                "2x4": [{ id: "LVL 1-3/4x5-1/2", note: "min LVL (deeper wall)" }],
                "2x6": [{ id: "LVL 1-3/4x5-1/2" }, { id: "PSL 3-1/2x5-1/2" }],
                "2x8": [{ id: "LVL 1-3/4x7-1/4" }, { id: "PSL 3-1/2x7-1/4" }],
                "2x10": [{ id: "LVL 1-3/4x9-1/4" }, { id: "LVL 1-3/4x9-1/2" }],
                "2x12": [{ id: "LVL 1-3/4x11-7/8" }],
              };
              const suggestions = depthMap[studSize] || [{ id: "LVL 1-3/4x5-1/2" }];
              return (
                <div
                  style={{
                    margin: "2px 8px 4px",
                    padding: "6px 8px",
                    background: `${C.orange || "#f59e0b"}12`,
                    border: `1px solid ${C.orange || "#f59e0b"}40`,
                    borderRadius: 5,
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: C.orange || "#f59e0b",
                      marginBottom: 4,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span>⚠</span> {studSize} studs not available over 20'
                  </div>
                  <div style={{ fontSize: 8, color: C.textDim, marginBottom: 4 }}>
                    LVL/PSL can be ordered to exact {wallHt}' length — zero waste:
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {suggestions.map((s, i) => (
                      <button
                        key={s.id}
                        onClick={() => handleInstanceSpecChange(cat.id, catInst.id, "StudSize", s.id)}
                        style={{
                          padding: "2px 6px",
                          fontSize: 9,
                          fontWeight: 600,
                          border: `1px solid ${C.accent}50`,
                          background: i === 0 ? `${C.accent}15` : "transparent",
                          color: C.accent,
                          borderRadius: 3,
                          cursor: "pointer",
                        }}
                      >
                        {s.id}
                        {i === 0 ? " ★" : ""}
                        {s.note ? ` (${s.note})` : ""}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Derived result rows */}
            {derivedItems.length > 0 && (
              <div style={{ padding: "2px 0 4px" }}>
                {derivedItems.map(item => renderResultRow(item, cat, catInst))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, background: `${C.accent}08` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: C.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 20h20" />
                <path d="M5 20V10l7-7 7 7v10" />
                <path d="M9 20v-4h6v4" />
              </svg>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
              {moduleDef.name} <span style={{ fontSize: 10, fontWeight: 400, color: C.textMuted }}>Module</span>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {activeModule === "walls" && onDetectWallSchedule && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onDetectWallSchedule();
                }}
                disabled={!selectedDrawingId || wallScheduleLoading}
                title={
                  !selectedDrawingId ? "Select a drawing first" : "AI detects wall type schedule from current drawing"
                }
                style={{
                  padding: "3px 8px",
                  fontSize: 9,
                  fontWeight: 600,
                  border: `1px solid ${C.accent}40`,
                  background: wallScheduleLoading ? `${C.accent}15` : `${C.accent}10`,
                  color: !selectedDrawingId ? C.textDimmer : C.accent,
                  borderRadius: 4,
                  cursor: !selectedDrawingId || wallScheduleLoading ? "default" : "pointer",
                  opacity: !selectedDrawingId ? 0.5 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  whiteSpace: "nowrap",
                }}
              >
                <Ic d={I.ai} size={9} color={!selectedDrawingId ? C.textDimmer : C.accent} />
                {wallScheduleLoading ? "Scanning..." : "AI Wall Schedule"}
              </button>
            )}
            {/* Delete entire module */}
            <button
              onClick={e => {
                e.stopPropagation();
                if (confirm(`Remove ${moduleDef.name} module and all its measurements?`)) {
                  // Remove all linked takeoffs first
                  const instData = instances[activeModule];
                  if (instData) {
                    Object.values(instData.itemTakeoffIds || {}).forEach(toId => {
                      if (toId) removeTakeoff(toId);
                    });
                    Object.values(instData.categoryInstances || {}).forEach(cats => {
                      (cats || []).forEach(ci => {
                        Object.values(ci.itemTakeoffIds || {}).forEach(toId => {
                          if (toId) removeTakeoff(toId);
                        });
                      });
                    });
                  }
                  removeModule(activeModule);
                }
              }}
              title="Delete module"
              style={{
                width: 22,
                height: 22,
                border: "none",
                background: `${C.red}15`,
                color: C.red,
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Ic d={I.xCircle} size={12} color={C.red} />
            </button>
            <button
              onClick={e => {
                e.stopPropagation();
                setActiveModule(null);
              }}
              style={{
                width: 22,
                height: 22,
                border: "none",
                background: C.bg2,
                color: C.textDim,
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              <Ic d={I.x} size={10} color={C.textDim} />
            </button>
          </div>
        </div>
        {/* Collapse/Expand All toolbar */}
        <div style={{ display: "flex", gap: 8, padding: "4px 12px 0" }}>
          <button
            onClick={() => expandAllCategories(activeModule)}
            style={{
              border: "none", background: "transparent", color: C.textMuted, cursor: "pointer",
              fontSize: 9, fontWeight: 600, padding: "2px 0", display: "flex", alignItems: "center", gap: 3,
            }}
          >
            <span style={{ fontSize: 7 }}>&#9660;</span> Expand All
          </button>
          <button
            onClick={() => {
              collapseAllCategories(activeModule);
              setCollapsedInstances(new Set(
                Object.values(inst.categoryInstances || {}).flat().map(ci => ci.id)
              ));
            }}
            style={{
              border: "none", background: "transparent", color: C.textMuted, cursor: "pointer",
              fontSize: 9, fontWeight: 600, padding: "2px 0", display: "flex", alignItems: "center", gap: 3,
            }}
          >
            <span style={{ fontSize: 7 }}>&#9650;</span> Collapse All
          </button>
        </div>
      </div>

      {/* Scope Tree */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {moduleDef.categories.map(cat => {
          if (catsOnPage && !catsOnPage.has(cat.id)) return null;

          const isExpanded = inst.expandedCategories[cat.id] !== false;
          const catType = cat.type || "measurement";

          // ── MULTI-INSTANCE MEASUREMENT GROUP ──────────────────
          if (catType === "measurement" && cat.multiInstance) {
            const catInstances = inst.categoryInstances?.[cat.id] || [];
            return (
              <div key={cat.id} style={{ marginBottom: 2, borderBottom: `1px solid ${C.border}15` }}>
                {/* Category header with + button */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 10px",
                    background: `${C.bg2}60`,
                    cursor: "pointer",
                    borderLeft: "3px solid transparent",
                  }}
                >
                  <div
                    onClick={() => toggleCategory(activeModule, cat.id)}
                    style={{ display: "flex", alignItems: "center", padding: 2 }}
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      stroke={C.textDim}
                      strokeWidth="1.5"
                      style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
                    >
                      <path d="M2 1l4 3-4 3" />
                    </svg>
                  </div>
                  <div onClick={() => toggleCategory(activeModule, cat.id)} style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{cat.name}</span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: C.textMuted,
                          background: `${C.text}10`,
                          padding: "1px 4px",
                          borderRadius: 3,
                        }}
                      >
                        {catInstances.length} type{catInstances.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Instances + Add Type button below */}
                {isExpanded && (
                  <div style={{ padding: "4px 0" }}>
                    {catInstances.map(catInst => renderInstance(cat, catInst, catInstances))}
                    {/* + Add Type — positioned below instances for natural downward flow */}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        addCategoryInstance(activeModule, cat.id);
                      }}
                      title="Add type"
                      style={{
                        width: "calc(100% - 16px)",
                        margin: "4px 8px",
                        padding: "6px 0",
                        border: `1.5px dashed ${C.accent}40`,
                        borderRadius: 5,
                        background: "transparent",
                        color: C.accent,
                        cursor: "pointer",
                        fontSize: 10,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                      }}
                    >
                      <Ic d={I.plus} size={10} color={C.accent} /> Add Type
                    </button>
                  </div>
                )}
              </div>
            );
          }

          // ── SINGLE-INSTANCE MEASUREMENT GROUP ──────────────────
          if (catType === "measurement") {
            // Category progress
            let catTotal = 0,
              catDone = 0;
            cat.items.forEach(item => {
              catTotal++;
              const st = inst.itemStatus[item.id];
              if (st === "measured" || st === "derived" || st === "complete" || st === "excluded") catDone++;
              else if (item.type === "derived" && derived[item.id]?.qty > 0) catDone++;
            });

            const drivingItem = cat.items.find(i => i.id === cat.drivingItemId);
            const drivingToId = drivingItem ? inst.itemTakeoffIds[drivingItem.id] : null;
            const drivingQty = drivingItem ? getDrivingQty(drivingItem.id, inst.itemTakeoffIds, takeoffs, scaleCtx) : 0;
            const isMeasuring = drivingToId && tkActiveTakeoffId === drivingToId;
            const derivedItems = cat.items.filter(i => i.type !== "driving");
            const resultCount = derivedItems.filter(i => {
              const d = derived[i.id];
              return d && d.active && d.qty > 0;
            }).length;

            return (
              <div key={cat.id} style={{ marginBottom: 2, borderBottom: `1px solid ${C.border}15` }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 10px",
                    background: isMeasuring ? `${C.accent}10` : `${C.bg2}60`,
                    borderLeft: isMeasuring ? `3px solid ${C.accent}` : "3px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  <div
                    onClick={() => toggleCategory(activeModule, cat.id)}
                    style={{ display: "flex", alignItems: "center", padding: 2 }}
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      stroke={C.textDim}
                      strokeWidth="1.5"
                      style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
                    >
                      <path d="M2 1l4 3-4 3" />
                    </svg>
                  </div>
                  <div onClick={() => toggleCategory(activeModule, cat.id)} style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{cat.name}</span>
                      {drivingItem && (
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: 600,
                            color: C.textDim,
                            background: `${C.text}10`,
                            padding: "1px 4px",
                            borderRadius: 3,
                          }}
                        >
                          {drivingItem.unit}
                        </span>
                      )}
                    </div>
                    {!isExpanded && drivingQty > 0 && resultCount > 0 && (
                      <div style={{ fontSize: 9, color: C.textDim, marginTop: 1 }}>
                        {drivingQty >= 1000
                          ? Math.round(drivingQty).toLocaleString()
                          : Math.round(drivingQty * 100) / 100}{" "}
                        {drivingItem?.unit} {"\u2192"} {resultCount} result{resultCount !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                  {drivingQty > 0 && (
                    <span
                      style={{
                        fontSize: 12,
                        fontFamily: T.font.sans,
                        fontWeight: 600,
                        color: C.text,
                        fontFeatureSettings: "'tnum'",
                      }}
                    >
                      {drivingQty >= 1000
                        ? Math.round(drivingQty).toLocaleString()
                        : Math.round(drivingQty * 100) / 100}
                    </span>
                  )}
                  {drivingItem && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleDrivingClick(drivingItem, cat);
                      }}
                      disabled={!selectedDrawingId}
                      style={{
                        border: "none",
                        borderRadius: 4,
                        cursor: selectedDrawingId ? "pointer" : "not-allowed",
                        padding: "3px 8px",
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        background: isMeasuring ? C.accent : drivingQty > 0 ? `${C.green}20` : `${C.accent}15`,
                        color: isMeasuring ? "#fff" : drivingQty > 0 ? C.green : C.accent,
                        opacity: selectedDrawingId ? 1 : 0.4,
                        transition: "all 0.15s",
                      }}
                    >
                      {isMeasuring ? "MEASURING" : drivingQty > 0 ? "RE-MEASURE" : "MEASURE"}
                    </button>
                  )}
                  {cat.mirrorSource &&
                    (() => {
                      const sourceCat = moduleDef?.categories.find(c => c.id === cat.mirrorSource.categoryId);
                      const srcDriving = sourceCat?.items.find(i => i.id === sourceCat.drivingItemId);
                      const srcToId = srcDriving ? inst.itemTakeoffIds[srcDriving.id] : null;
                      const srcTo = srcToId ? takeoffs.find(t => t.id === srcToId) : null;
                      const hasSrcMeasurements = srcTo?.measurements?.length > 0;
                      const alreadyMirrored = drivingQty > 0;
                      return (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleMirrorMeasurements(cat);
                          }}
                          disabled={!hasSrcMeasurements}
                          title={hasSrcMeasurements ? cat.mirrorSource.label : "Measure footings first"}
                          style={{
                            border: `1px solid ${hasSrcMeasurements ? C.accent + "40" : C.border}`,
                            borderRadius: 4,
                            cursor: hasSrcMeasurements ? "pointer" : "not-allowed",
                            padding: "3px 6px",
                            fontSize: 8,
                            fontWeight: 700,
                            letterSpacing: 0.3,
                            background: alreadyMirrored ? `${C.green}15` : "transparent",
                            color: hasSrcMeasurements ? (alreadyMirrored ? C.green : C.accent) : C.textDim,
                            opacity: hasSrcMeasurements ? 1 : 0.4,
                            transition: "all 0.15s",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {alreadyMirrored ? "✓ Mirrored" : "Mirror Footings"}
                        </button>
                      );
                    })()}
                </div>
                {isExpanded && (
                  <div>
                    {renderSpecs(cat.specs, handleSpecChange)}
                    {derivedItems.length > 0 && (
                      <div style={{ padding: "2px 0 4px" }}>{derivedItems.map(item => renderResultRow(item, cat))}</div>
                    )}
                  </div>
                )}
              </div>
            );
          }

          // ── DERIVED-ONLY GROUP ──────────────────────────────
          if (catType === "derived-only") {
            const hasAnyQty = cat.items.some(i => (derived[i.id]?.qty || 0) > 0);
            return (
              <div key={cat.id} style={{ marginBottom: 2, borderBottom: `1px solid ${C.border}15` }}>
                <div
                  onClick={() => toggleCategory(activeModule, cat.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 10px",
                    cursor: "pointer",
                    opacity: hasAnyQty ? 1 : 0.6,
                    borderLeft: "3px solid transparent",
                  }}
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="none"
                    stroke={C.textDim}
                    strokeWidth="1.5"
                    style={{
                      transform: isExpanded ? "rotate(90deg)" : "none",
                      transition: "transform 0.15s",
                      marginLeft: 2,
                    }}
                  >
                    <path d="M2 1l4 3-4 3" />
                  </svg>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={C.textDim}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: C.textDim }}>{cat.name}</span>
                  <span style={{ fontSize: 8, color: C.textDimmer, fontStyle: "italic" }}>auto-calculated</span>
                </div>
                {isExpanded && (
                  <div style={{ padding: "0 0 4px" }}>
                    {renderSpecs(cat.specs, handleSpecChange)}
                    {cat.items.map(item => renderResultRow(item, cat))}
                  </div>
                )}
              </div>
            );
          }

          // ── MANUAL-ONLY GROUP ──────────────────────────────
          if (catType === "manual-only") {
            return (
              <div key={cat.id} style={{ marginBottom: 2, borderBottom: `1px solid ${C.border}15` }}>
                <div
                  onClick={() => toggleCategory(activeModule, cat.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 10px",
                    cursor: "pointer",
                    borderLeft: "3px solid transparent",
                  }}
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="none"
                    stroke={C.textDim}
                    strokeWidth="1.5"
                    style={{
                      transform: isExpanded ? "rotate(90deg)" : "none",
                      transition: "transform 0.15s",
                      marginLeft: 2,
                    }}
                  >
                    <path d="M2 1l4 3-4 3" />
                  </svg>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={C.textDim}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
                  </svg>
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: C.textDim }}>{cat.name}</span>
                </div>
                {isExpanded && (
                  <div style={{ padding: "0 0 4px" }}>{cat.items.map(item => renderResultRow(item, cat))}</div>
                )}
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "8px 12px",
          borderTop: `1px solid ${C.border}`,
          fontSize: 10,
          color: C.textDim,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{moduleDef.name} Module</span>
        {!selectedDrawingId && <span style={{ color: C.orange, fontWeight: 600 }}>Select a drawing</span>}
      </div>
    </div>
  );
}
