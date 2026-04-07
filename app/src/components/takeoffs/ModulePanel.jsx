// Module Panel — Measurement-centric scope tree UI
// Organized around what you measure, not trade categories.
// One measurement → many results. No implied sequence.
import { useMemo, useCallback, useEffect, useState, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useModuleStore } from "@/stores/moduleStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { MODULES } from "@/constants/modules";
import { computeAllDerivedWithInstances, getDrivingQty, evalCondition } from "@/utils/moduleCalc";
import { nn, uid } from "@/utils/format";
import { inp } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import ModuleResultRow from "@/components/takeoffs/ModuleResultRow";
import { SingleSpecsForm, InstanceSpecsForm } from "@/components/takeoffs/ModuleSpecsForm";
import ModuleInstanceBlock from "@/components/takeoffs/ModuleInstanceBlock";

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
  // Layer actions
  const toggleLayerEnabled = useModuleStore(s => s.toggleLayerEnabled);
  const addCustomLayer = useModuleStore(s => s.addCustomLayer);
  const removeCustomLayer = useModuleStore(s => s.removeCustomLayer);
  const updateCustomLayer = useModuleStore(s => s.updateCustomLayer);

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

  const takeoffs = useDrawingPipelineStore(s => s.takeoffs);
  const tkActiveTakeoffId = useDrawingPipelineStore(s => s.tkActiveTakeoffId);

  const drawings = useDrawingPipelineStore(s => s.drawings);
  const calibrations = useDrawingPipelineStore(s => s.tkCalibrations);
  const drawingScales = useDrawingPipelineStore(s => s.drawingScales);
  const drawingDpi = useDrawingPipelineStore(s => s.drawingDpi);

  const moduleDef = MODULES[activeModule];
  const inst = useMemo(
    () =>
      instances[activeModule] || {
        specs: {},
        itemStatus: {},
        itemTakeoffIds: {},
        expandedCategories: {},
        categoryInstances: {},
      },
    [instances, activeModule],
  );

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

    const currentTakeoffs = useDrawingPipelineStore.getState().takeoffs;
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
        catInstances.forEach((catInst, _idx) => {
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
      useDrawingPipelineStore.getState().setTakeoffs(next);
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
        const exists = useDrawingPipelineStore.getState().takeoffs.some(t => t.id === toId);
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
        const exists = useDrawingPipelineStore.getState().takeoffs.some(t => t.id === toId);
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
      const allTakeoffs = useDrawingPipelineStore.getState().takeoffs;
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
        const currentTakeoffs = useDrawingPipelineStore.getState().takeoffs;
        useDrawingPipelineStore
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
        const updated = useDrawingPipelineStore.getState().takeoffs;
        useDrawingPipelineStore
          .getState()
          .setTakeoffs(
            updated.map(t => (t.id === newId ? { ...t, color: mirrorColor, measurements: coloredMeasurements } : t)),
          );
      }
      // Select the new takeoff so it's visible
      if (targetToId || inst.itemTakeoffIds[targetDriving.id]) {
        const finalId =
          targetToId ||
          useDrawingPipelineStore.getState().takeoffs.find(t => t.name === targetDriving.name && t.moduleId === activeModule)
            ?.id;
        if (finalId) useDrawingPipelineStore.getState().setTkSelectedTakeoffId(finalId);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Helper: render a single result row (delegates to extracted component)
  const renderResultRow = (item, cat, catInst = null) => (
    <ModuleResultRow
      key={catInst ? `${catInst.id}:${item.id}` : item.id}
      item={item}
      cat={cat}
      catInst={catInst}
      derived={derived}
      inst={inst}
      takeoffs={takeoffs}
      handleManualQty={handleManualQty}
      toggleExclude={toggleExclude}
      updateTakeoff={updateTakeoff}
      removeTakeoff={removeTakeoff}
    />
  );

  // Helper: render spec form (delegates to extracted component)
  const renderSpecs = (specs, onSpecChange) => (
    <SingleSpecsForm
      specs={specs}
      specValues={onSpecChange === handleSpecChange ? inst.specs : null}
      onSpecChange={onSpecChange}
    />
  );



  // renderInstanceSpecs / renderInstance / MATERIAL_COLORS / computeAutoLabel
  // -- Moved to ModuleInstanceBlock.jsx and ModuleSpecsForm.jsx

  // Thin wrapper for renderInstanceSpecs (used by single-instance categories)
  const renderInstanceSpecs = (specs, catId, catInst, templates) => (
    <InstanceSpecsForm
      specs={specs}
      catId={catId}
      catInst={catInst}
      templates={templates}
      onSpecChange={handleInstanceSpecChange}
    />
  );

  // renderInstance delegates to ModuleInstanceBlock (used in multi-instance categories)
  const renderInstance = (cat, catInst, catInstances) => (
    <ModuleInstanceBlock
      key={catInst.id}
      cat={cat}
      catInst={catInst}
      catInstances={catInstances}
      activeModule={activeModule}
      inst={inst}
      derived={derived}
      takeoffs={takeoffs}
      scaleCtx={scaleCtx}
      collapsedInstances={collapsedInstances}
      toggleInstanceCollapse={toggleInstanceCollapse}
      selectedDrawingId={selectedDrawingId}
      handleInstanceDrivingClick={handleInstanceDrivingClick}
      handleInstanceSpecChange={handleInstanceSpecChange}
      toggleExclude={toggleExclude}
      updateTakeoff={updateTakeoff}
      removeTakeoff={removeTakeoff}
      removeCategoryInstance={removeCategoryInstance}
      renameCategoryInstance={renameCategoryInstance}
      toggleLayerEnabled={toggleLayerEnabled}
      addCustomLayer={addCustomLayer}
      removeCustomLayer={removeCustomLayer}
      updateCustomLayer={updateCustomLayer}
    />
  );


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
              border: "none",
              background: "transparent",
              color: C.textMuted,
              cursor: "pointer",
              fontSize: 9,
              fontWeight: 600,
              padding: "2px 0",
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <span style={{ fontSize: 7 }}>&#9660;</span> Expand All
          </button>
          <button
            onClick={() => {
              collapseAllCategories(activeModule);
              setCollapsedInstances(
                new Set(
                  Object.values(inst.categoryInstances || {})
                    .flat()
                    .map(ci => ci.id),
                ),
              );
            }}
            style={{
              border: "none",
              background: "transparent",
              color: C.textMuted,
              cursor: "pointer",
              fontSize: 9,
              fontWeight: 600,
              padding: "2px 0",
              display: "flex",
              alignItems: "center",
              gap: 3,
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
            let _catTotal = 0,
              _catDone = 0;
            cat.items.forEach(item => {
              _catTotal++;
              const st = inst.itemStatus[item.id];
              if (st === "measured" || st === "derived" || st === "complete" || st === "excluded") _catDone++;
              else if (item.type === "derived" && derived[item.id]?.qty > 0) _catDone++;
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
