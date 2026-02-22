// BuilderPanel v2 — Measurement-centric scope tree UI
// Organized around what you measure, not trade categories.
// One measurement → many results. No implied sequence.
import { useMemo, useCallback, useEffect, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useBuilderStore } from '@/stores/builderStore';
import { useTakeoffsStore } from '@/stores/takeoffsStore';
import { useDrawingsStore } from '@/stores/drawingsStore';
import { BUILDERS } from '@/constants/builders';
import { computeAllDerivedWithInstances, getDrivingQty, evalCondition } from '@/utils/builderCalc';
import { nn, uid } from '@/utils/format';
import { inp } from '@/utils/styles';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';

export default function BuilderPanel({ engageMeasuring, selectedDrawingId, addTakeoff, updateTakeoff, removeTakeoff, pageFilter, onDetectWallSchedule, wallScheduleLoading }) {
  const C = useTheme();
  const activeBuilder = useBuilderStore(s => s.activeBuilder);
  const instances = useBuilderStore(s => s.builderInstances);
  const setActiveBuilder = useBuilderStore(s => s.setActiveBuilder);
  const setSpec = useBuilderStore(s => s.setSpec);
  const setItemStatus = useBuilderStore(s => s.setItemStatus);
  const linkItemToTakeoff = useBuilderStore(s => s.linkItemToTakeoff);
  const toggleCategory = useBuilderStore(s => s.toggleCategory);
  // Multi-instance actions
  const addCategoryInstance = useBuilderStore(s => s.addCategoryInstance);
  const removeCategoryInstance = useBuilderStore(s => s.removeCategoryInstance);
  const renameCategoryInstance = useBuilderStore(s => s.renameCategoryInstance);
  const setCatInstanceSpec = useBuilderStore(s => s.setCatInstanceSpec);
  const linkCatInstanceItem = useBuilderStore(s => s.linkCatInstanceItem);
  const setCatInstanceItemStatus = useBuilderStore(s => s.setCatInstanceItemStatus);

  // Collapsed wall type instances (local UI state)
  const [collapsedInstances, setCollapsedInstances] = useState(new Set());
  const toggleInstanceCollapse = useCallback((instId) => {
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

  const builderDef = BUILDERS[activeBuilder];
  const inst = instances[activeBuilder] || { specs: {}, itemStatus: {}, itemTakeoffIds: {}, expandedCategories: {}, categoryInstances: {} };

  // Build scale context for computing real measured quantities from measurement points
  const scaleCtx = useMemo(() => ({
    calibrations, scales: drawingScales, dpi: drawingDpi, drawings,
  }), [calibrations, drawingScales, drawingDpi, drawings]);

  // Compute all derived quantities (supports multi-instance categories)
  const derived = useMemo(() => {
    if (!builderDef) return {};
    return computeAllDerivedWithInstances(builderDef, inst.specs, takeoffs, inst.itemTakeoffIds, inst.categoryInstances || {}, scaleCtx);
  }, [builderDef, inst.specs, inst.categoryInstances, takeoffs, inst.itemTakeoffIds, scaleCtx]);

  // Build set of category IDs that have driving item measurements on the current page
  const catsOnPage = useMemo(() => {
    if (pageFilter !== "page" || !selectedDrawingId || !builderDef) return null;
    const onPage = new Set();
    builderDef.categories.forEach(cat => {
      if (!cat.drivingItemId) return;
      if (cat.multiInstance) {
        // Check all instances for measurements on this page
        const catInstances = inst.categoryInstances?.[cat.id] || [];
        catInstances.forEach(catInst => {
          const drivingToId = catInst.itemTakeoffIds?.[cat.drivingItemId];
          if (!drivingToId) return;
          const drivingTo = takeoffs.find(t => t.id === drivingToId);
          if (drivingTo && (drivingTo.measurements || []).some(m => m.sheetId === selectedDrawingId)) {
            onPage.add(cat.id);
          }
        });
      } else {
        const drivingToId = inst.itemTakeoffIds?.[cat.drivingItemId];
        if (!drivingToId) return;
        const drivingTo = takeoffs.find(t => t.id === drivingToId);
        if (drivingTo && (drivingTo.measurements || []).some(m => m.sheetId === selectedDrawingId)) {
          onPage.add(cat.id);
        }
      }
    });
    if (onPage.size > 0) {
      builderDef.categories.forEach(cat => {
        if (cat.type === "derived-only" || cat.type === "manual-only") onPage.add(cat.id);
      });
    }
    return onPage;
  }, [pageFilter, selectedDrawingId, builderDef, inst.itemTakeoffIds, inst.categoryInstances, takeoffs]);

  // Sync derived quantities to takeoffs — batches all changes in one store update
  const syncDerivedToTakeoffs = useCallback(() => {
    if (!builderDef) return;
    const TO_COLORS = ["#2563eb","#dc2626","#16a34a","#ea580c","#8b5cf6","#0891b2","#c026d3","#65a30d"];

    const currentTakeoffs = useTakeoffsStore.getState().takeoffs;
    const currentInst = useBuilderStore.getState().builderInstances[activeBuilder] || inst;
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
            id: newId, description: desc, quantity: d.qty, unit: item.unit,
            color: TO_COLORS[next.length % TO_COLORS.length], drawingRef: "",
            group: groupLabel, linkedItemId: "",
            code: item.code, variables: [], formula: "", measurements: [],
            builderId: activeBuilder,
            builderItemId: item.id,
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

    builderDef.categories.forEach(cat => {
      if (cat.multiInstance) {
        // Process each instance separately
        const catInstances = currentCategoryInstances[cat.id] || [];
        catInstances.forEach((catInst, idx) => {
          cat.items.forEach(item => {
            const derivedKey = `${catInst.id}:${item.id}`;
            const prevLen = next.length;
            const prevLinks = JSON.stringify(catInst.itemTakeoffIds);
            syncItem(item, cat, derivedKey, catInst.itemTakeoffIds, catInst.itemStatus, `${builderDef.name} - ${cat.name} (${catInst.label})`, catInst.specs, catInst.id);
            if (next.length !== prevLen || JSON.stringify(catInst.itemTakeoffIds) !== prevLinks) {
              catInstancesChanged = true;
            }
          });
        });
      } else {
        // Single-instance: use top-level ids
        const groupLabel = `${builderDef.name} - ${cat.name}`;
        cat.items.forEach(item => {
          syncItem(item, cat, item.id, currentItemTakeoffIds, currentItemStatus, groupLabel, currentInst.specs, null);
        });
      }
    });

    // Batch update takeoffs store
    if (JSON.stringify(next.map(t => t.id + ":" + t.quantity)) !== JSON.stringify(currentTakeoffs.map(t => t.id + ":" + t.quantity))) {
      useTakeoffsStore.getState().setTakeoffs(next);
    }

    // Batch update builder store
    if (linksChanged || statusChanged || catInstancesChanged) {
      useBuilderStore.setState(s => ({
        builderInstances: {
          ...s.builderInstances,
          [activeBuilder]: {
            ...s.builderInstances[activeBuilder],
            itemTakeoffIds: currentItemTakeoffIds,
            itemStatus: currentItemStatus,
            categoryInstances: currentCategoryInstances,
          },
        },
      }));
    }
  }, [builderDef, derived, activeBuilder, inst]);

  // Handle driving item click (single-instance categories)
  const handleDrivingClick = useCallback((item, cat) => {
    if (!selectedDrawingId) return;
    let toId = inst.itemTakeoffIds[item.id];
    if (toId) {
      const exists = useTakeoffsStore.getState().takeoffs.some(t => t.id === toId);
      if (!exists) {
        linkItemToTakeoff(activeBuilder, item.id, null);
        toId = null;
      }
    }
    if (toId) {
      engageMeasuring(toId);
    } else {
      const groupName = `${builderDef.name} - ${cat.name}`;
      const newId = addTakeoff(groupName, item.name, item.unit, item.code, { builderId: activeBuilder, builderItemId: item.id, instanceId: null });
      linkItemToTakeoff(activeBuilder, item.id, newId);
      setItemStatus(activeBuilder, item.id, "measured");
    }
  }, [inst.itemTakeoffIds, selectedDrawingId, builderDef, activeBuilder, engageMeasuring, addTakeoff, linkItemToTakeoff, setItemStatus]);

  // Handle driving item click for multi-instance categories
  const handleInstanceDrivingClick = useCallback((item, cat, catInst) => {
    if (!selectedDrawingId) return;
    let toId = catInst.itemTakeoffIds?.[item.id];
    if (toId) {
      const exists = useTakeoffsStore.getState().takeoffs.some(t => t.id === toId);
      if (!exists) {
        linkCatInstanceItem(activeBuilder, cat.id, catInst.id, item.id, null);
        toId = null;
      }
    }
    if (toId) {
      engageMeasuring(toId);
    } else {
      const groupName = `${builderDef.name} - ${cat.name} (${catInst.label})`;
      const newId = addTakeoff(groupName, `${item.name} (${catInst.label})`, item.unit, item.code, { builderId: activeBuilder, builderItemId: item.id, instanceId: catInst.id });
      linkCatInstanceItem(activeBuilder, cat.id, catInst.id, item.id, newId);
      setCatInstanceItemStatus(activeBuilder, cat.id, catInst.id, item.id, "measured");
    }
  }, [selectedDrawingId, builderDef, activeBuilder, engageMeasuring, addTakeoff, linkCatInstanceItem, setCatInstanceItemStatus]);

  // Handle spec change — useEffect([derived]) triggers sync automatically after re-render
  const handleSpecChange = useCallback((specId, value) => {
    const numVal = parseFloat(value);
    setSpec(activeBuilder, specId, isNaN(numVal) ? value : numVal);
  }, [activeBuilder, setSpec]);

  // Handle spec change for multi-instance categories
  const handleInstanceSpecChange = useCallback((catId, instanceId, specId, value) => {
    const numVal = parseFloat(value);
    setCatInstanceSpec(activeBuilder, catId, instanceId, specId, isNaN(numVal) ? value : numVal);
  }, [activeBuilder, setCatInstanceSpec]);

  // Handle manual qty change
  const handleManualQty = useCallback((item, cat, value) => {
    let toId = inst.itemTakeoffIds[item.id];
    const qty = nn(value);
    if (!toId && qty > 0) {
      const groupName = `${builderDef.name} - ${cat.name}`;
      const newId = addTakeoff(groupName, item.name, item.unit, item.code, { noMeasure: true, quantity: qty, builderId: activeBuilder, builderItemId: item.id, instanceId: null });
      linkItemToTakeoff(activeBuilder, item.id, newId);
      setItemStatus(activeBuilder, item.id, "complete");
    } else if (toId) {
      updateTakeoff(toId, "quantity", qty);
    }
  }, [inst.itemTakeoffIds, builderDef, activeBuilder, addTakeoff, updateTakeoff, linkItemToTakeoff, setItemStatus]);

  // Exclude / restore item
  const toggleExclude = useCallback((item, catInst = null) => {
    if (catInst) {
      // Find cat for this instance
      const cat = builderDef?.categories.find(c => (c.categoryInstances?.[c.id] || []).includes(catInst)) ||
        builderDef?.categories.find(c => c.multiInstance && (inst.categoryInstances?.[c.id] || []).some(ci => ci.id === catInst.id));
      if (!cat) return;
      const current = catInst.itemStatus?.[item.id];
      if (current === "excluded") {
        setCatInstanceItemStatus(activeBuilder, cat.id, catInst.id, item.id, "pending");
      } else {
        setCatInstanceItemStatus(activeBuilder, cat.id, catInst.id, item.id, "excluded");
        const toId = catInst.itemTakeoffIds?.[item.id];
        if (toId) {
          removeTakeoff(toId);
          linkCatInstanceItem(activeBuilder, cat.id, catInst.id, item.id, null);
        }
      }
    } else {
      const current = inst.itemStatus[item.id];
      if (current === "excluded") {
        setItemStatus(activeBuilder, item.id, "pending");
      } else {
        setItemStatus(activeBuilder, item.id, "excluded");
        const toId = inst.itemTakeoffIds[item.id];
        if (toId) {
          removeTakeoff(toId);
          linkItemToTakeoff(activeBuilder, item.id, null);
        }
      }
    }
  }, [inst.itemStatus, inst.itemTakeoffIds, inst.categoryInstances, activeBuilder, builderDef, setItemStatus, removeTakeoff, linkItemToTakeoff, setCatInstanceItemStatus, linkCatInstanceItem]);

  // Trigger sync on derived changes
  useEffect(() => {
    if (builderDef) syncDerivedToTakeoffs();
  }, [derived]);

  // Smart defaults: when a spec with defaultMap changes, auto-update dependent specs
  // e.g., changing WallHeight auto-updates SheathSheet if user hasn't manually overridden it
  // Supports range-based numeric lookup: keys are thresholds, finds largest key ≤ value
  useEffect(() => {
    if (!builderDef) return;
    builderDef.categories.forEach(cat => {
      if (!cat.multiInstance) return;
      const catInstances = inst.categoryInstances?.[cat.id] || [];
      catInstances.forEach(catInst => {
        (cat.specs || []).forEach(spec => {
          if (!spec.defaultMap) return;
          Object.entries(spec.defaultMap).forEach(([sourceSpecId, mapping]) => {
            const sourceRaw = catInst.specs?.[sourceSpecId] ?? "";
            const currentVal = catInst.specs?.[spec.id];

            // Range-based numeric lookup: find largest mapping key ≤ source value
            let suggestedDefault;
            const numVal = parseFloat(sourceRaw);
            if (!isNaN(numVal)) {
              const keys = Object.keys(mapping).map(Number).filter(k => !isNaN(k)).sort((a, b) => b - a);
              const matchKey = keys.find(k => numVal >= k);
              suggestedDefault = matchKey !== undefined ? mapping[matchKey] : mapping[keys[keys.length - 1]];
            } else {
              suggestedDefault = mapping[String(sourceRaw)];
            }

            if (!suggestedDefault) return;
            // Only auto-update if value is still a recognized default (not manually overridden to a non-default)
            const allDefaults = Object.values(mapping);
            if (currentVal === undefined || allDefaults.includes(currentVal)) {
              if (currentVal !== suggestedDefault) {
                setCatInstanceSpec(activeBuilder, cat.id, catInst.id, spec.id, suggestedDefault);
              }
            }
          });
        });
      });
    });
  }, [builderDef, inst.categoryInstances, activeBuilder, setCatInstanceSpec]);

  if (!builderDef) return null;

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
    const conditionMet = isDerived ? (derived[derivedKey]?.active !== false) : true;

    let qty = 0;
    if (isDerived) qty = derived[derivedKey]?.qty || 0;
    else if (isManual) qty = toId ? nn(takeoffs.find(t => t.id === toId)?.quantity) : 0;
    const hasQty = qty > 0;

    if (isDerived && !conditionMet && !hasQty && !isExcluded) return null;

    return (
      <div
        key={catInst ? `${catInst.id}:${item.id}` : item.id}
        style={{
          display: "flex", alignItems: "center", gap: 5, padding: "3px 10px 3px 20px",
          opacity: isExcluded ? 0.4 : conditionMet ? 1 : 0.5,
          borderBottom: `1px solid ${C.border}08`,
        }}
      >
        <span style={{ fontSize: 9, color: hasQty ? C.green : C.textDimmer, flexShrink: 0, width: 10, textAlign: "center" }}>
          {isExcluded ? "—" : hasQty ? "\u2713" : "\u2192"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, color: isExcluded ? C.textDim : hasQty ? C.text : C.textDim,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
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
            style={{ width: 45, textAlign: "right", fontSize: 11, fontFamily: "'DM Mono',monospace", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 3, padding: "2px 4px", color: C.text, outline: "none" }}
          />
        ) : (
          <span style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: hasQty ? C.text : C.textDimmer, fontFeatureSettings: "'tnum'", minWidth: 40, textAlign: "right" }}>
            {hasQty ? (qty >= 1000 ? Math.round(qty).toLocaleString() : Math.round(qty * 100) / 100) : "—"}
          </span>
        )}
        <span style={{ fontSize: 8, color: C.textDim, width: 28, textAlign: "left", flexShrink: 0 }}>{item.unit}</span>
        {/* Delete linked takeoff (resets to pending without excluding) */}
        {toId && hasQty && !isExcluded && (
          <button
            onClick={e => { e.stopPropagation(); removeTakeoff(toId); }}
            title="Delete takeoff"
            style={{ width: 14, height: 14, border: "none", background: "transparent", color: C.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, borderRadius: 3, flexShrink: 0, opacity: 0.5 }}
          >
            <Ic d={I.trash} size={7} />
          </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); toggleExclude(item, catInst); }}
          title={isExcluded ? "Restore" : "Exclude"}
          style={{ width: 14, height: 14, border: "none", background: "transparent", color: C.textDimmer, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, borderRadius: 3, flexShrink: 0, opacity: 0.5 }}
        >
          <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            {isExcluded ? <><path d="M1 5h8" /><path d="M5 1v8" /></> : <path d="M2 2l6 6M8 2l-6 6" />}
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
      <div style={{ margin: "4px 8px", padding: "6px 8px", background: C.bg2, borderRadius: 5, display: "flex", gap: 4, flexWrap: "wrap" }}>
        {specs.map(spec => (
          <div key={spec.id} style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 72, flex: "1 1 72px", maxWidth: 120 }}>
            <label style={{ fontSize: 8, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.3 }}>
              {spec.label} {spec.unit && <span style={{ color: C.textDimmer }}>({spec.unit})</span>}
            </label>
            {spec.type === "number" ? (
              <input
                type="number"
                value={specValues ? (specValues[spec.id] ?? spec.default) : spec.default}
                onChange={e => onSpecChange(spec.id, e.target.value)}
                min={spec.min} max={spec.max} step={spec.step || 1}
                style={inp(C, { padding: "2px 3px", fontSize: 10, background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 3, width: "100%" })}
              />
            ) : (
              <select
                value={specValues ? (specValues[spec.id] ?? spec.default) : spec.default}
                onChange={e => onSpecChange(spec.id, e.target.value)}
                style={inp(C, { padding: "2px 3px", fontSize: 10, background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 3, width: "100%", cursor: "pointer" })}
              >
                {spec.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Helper: render instance specs form (with condition filtering)
  const renderInstanceSpecs = (specs, catId, catInst) => {
    if (!specs || specs.length === 0) return null;
    // Build context from instance specs for condition evaluation
    const specCtx = { ...catInst.specs };
    // Fill defaults for specs not yet set
    specs.forEach(s => { if (specCtx[s.id] === undefined) specCtx[s.id] = s.default; });
    // Split: Material spec gets its own row above the rest
    const materialSpec = specs.find(s => s.id === "Material");
    const restSpecs = specs.filter(s => s.id !== "Material");

    const renderSpec = (spec) => (
      <div key={spec.id} style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 72, flex: "1 1 72px", maxWidth: 120 }}>
        <label style={{ fontSize: 8, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.3 }}>
          {spec.label} {spec.unit && <span style={{ color: C.textDimmer }}>({spec.unit})</span>}
        </label>
        {spec.type === "number" ? (
          <input
            type="number"
            value={catInst.specs?.[spec.id] ?? spec.default}
            onChange={e => handleInstanceSpecChange(catId, catInst.id, spec.id, e.target.value)}
            min={spec.min} max={spec.max} step={spec.step || 1}
            style={inp(C, { padding: "2px 3px", fontSize: 10, background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 3, width: "100%" })}
          />
        ) : (
          <select
            value={catInst.specs?.[spec.id] ?? spec.default}
            onChange={e => handleInstanceSpecChange(catId, catInst.id, spec.id, e.target.value)}
            style={inp(C, { padding: "2px 3px", fontSize: 10, background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 3, width: "100%", cursor: "pointer" })}
          >
            {spec.options.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )}
      </div>
    );

    return (
      <div style={{ margin: "4px 8px" }}>
        {materialSpec && (
          <div style={{ padding: "6px 8px", background: C.bg2, borderRadius: "5px 5px 0 0", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 4 }}>
            {renderSpec(materialSpec)}
          </div>
        )}
        <div style={{ padding: "6px 8px", background: C.bg2, borderRadius: materialSpec ? "0 0 5px 5px" : 5, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {restSpecs.map(spec => {
            if (spec.condition && !evalCondition(spec.condition, specCtx)) return null;
            return renderSpec(spec);
          })}
        </div>
      </div>
    );
  };

  // Material color map — accent colors for visual differentiation
  // Designer palette — maximally distinct hues (Tailwind-inspired)
  const MATERIAL_COLORS = {
    "Wood":        "#B45309", "Wood Framing": "#B45309", "Wood Trusses": "#CA8A04", // wood tones
    "Wood Rafters": "#B45309",                                  // amber-700 — wood
    "Metal Stud":  "#6366F1", "Steel Deck":   "#6366F1",   // indigo-500 — steel/metal
    "Steel Joist/Deck": "#6366F1",                              // indigo — steel
    "CMU":         "#DC2626",                               // red-600 — masonry block
    "Concrete":    "#6B7280", "Concrete on Deck": "#6B7280",// gray-500 — raw concrete
    "Precast/Concrete": "#6B7280",                              // gray — concrete
    "ICF":         "#0891B2",                               // cyan-600 — insulated forms
    "Tilt-Up":     "#0EA5E9",                               // sky-500 — blue panel
    "Precast":     "#8B5CF6", "Precast Plank": "#8B5CF6",   // violet-500 — precast
    "SIP":         "#D97706", "SIP Panels": "#D97706",      // amber-600 — panel/foam
    "3D Printed":  "#22C55E",                               // green-500 — bright green
    "CLT":         "#78350F",                               // amber-900 — dark timber
    // Roof finish types
    "Asphalt Shingles": "#DC2626",                              // red — shingles
    "Standing Seam Metal": "#6366F1",                           // indigo — metal
    "TPO":         "#0891B2",                                    // cyan — membrane
    "EPDM":        "#1E293B",                                    // slate-800 — dark rubber
    "Built-Up":    "#6B7280",                                    // gray — BUR
    "Modified Bitumen": "#78350F",                               // dark brown
    "Clay Tile":   "#DC2626",                                    // red — clay
    "Concrete Tile": "#6B7280",                                  // gray — concrete
    "Slate":       "#475569",                                    // slate-600
    // Gutter types
    "K-Style 5\" Aluminum": "#6B7280",
    "K-Style 6\" Aluminum": "#6B7280",
    "Half-Round 6\" Copper": "#B45309",
    "Commercial Scupper": "#475569",
    // Steel builder — structural framing
    "W-Shapes (Beams/Columns)": "#6366F1", "HSS Tubes": "#8B5CF6",
    "Channels/Angles": "#0EA5E9", "Built-Up Plate Girders": "#475569",
    // Steel builder — joists
    "K-Series": "#6366F1", "LH-Series": "#8B5CF6", "DLH-Series": "#0EA5E9",
    // Steel builder — decking
    "1.5\" B 22ga": "#6366F1", "1.5\" B 20ga": "#6366F1",
    "2\" W 20ga": "#8B5CF6", "3\" N 20ga": "#0EA5E9", "3\" N 18ga": "#0891B2",
    // Steel builder — misc
    "Lintels": "#6B7280", "Embed Plates": "#475569",
    "Stairs": "#DC2626", "Railings": "#D97706", "Grating": "#6366F1",
  };

  // Helper: render a single multi-instance block
  const renderInstance = (cat, catInst, catInstances) => {
    const drivingItem = cat.items.find(i => i.id === cat.drivingItemId);
    const drivingToId = drivingItem ? catInst.itemTakeoffIds?.[drivingItem.id] : null;
    const drivingQty = drivingItem ? getDrivingQty(drivingItem.id, catInst.itemTakeoffIds || {}, takeoffs, scaleCtx) : 0;
    const isMeasuring = drivingToId && tkActiveTakeoffId === drivingToId;
    const derivedItems = cat.items.filter(i => i.type !== "driving");
    const isCollapsed = collapsedInstances.has(catInst.id);

    // Resolve material color from instance specs (fallback to category specs defaults)
    const materialSpec = cat.specs?.find(s => s.id === "Material");
    const materialVal = catInst.specs?.Material || materialSpec?.default || "";
    const matColor = MATERIAL_COLORS[materialVal] || C.accent;

    return (
      <div key={catInst.id} style={{ borderLeft: `3px solid ${isMeasuring ? C.accent : matColor}90`, marginLeft: 6, marginBottom: 4 }}>
        {/* Instance header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "5px 8px",
          background: isMeasuring ? `${C.accent}08` : `${matColor}08`,
          cursor: "pointer",
        }}
          onClick={() => toggleInstanceCollapse(catInst.id)}
        >
          {/* Material color dot */}
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: matColor, flexShrink: 0 }} />

          {/* Collapse chevron */}
          <span style={{ fontSize: 8, color: C.textDim, transition: "transform 0.15s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", display: "inline-block" }}>▼</span>

          {/* Editable label */}
          <input
            value={catInst.label}
            onChange={e => renameCategoryInstance(activeBuilder, cat.id, catInst.id, e.target.value)}
            onClick={e => e.stopPropagation()}
            style={{ width: 60, fontSize: 10, fontWeight: 700, color: matColor, background: "transparent", border: "none", outline: "none", padding: 0 }}
          />

          {/* Unit badge */}
          {drivingItem && (
            <span style={{ fontSize: 7, fontWeight: 600, color: C.textDim, background: `${C.text}10`, padding: "1px 3px", borderRadius: 2 }}>
              {drivingItem.unit}
            </span>
          )}

          <div style={{ flex: 1 }} />

          {/* Driving qty */}
          {drivingQty > 0 && (
            <span style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", fontWeight: 600, color: C.text }}>
              {drivingQty >= 1000 ? Math.round(drivingQty).toLocaleString() : Math.round(drivingQty * 100) / 100}
            </span>
          )}

          {/* Measure button */}
          {drivingItem && (
            <button
              onClick={(e) => { e.stopPropagation(); handleInstanceDrivingClick(drivingItem, cat, catInst); }}
              disabled={!selectedDrawingId}
              style={{
                border: "none", borderRadius: 3, cursor: selectedDrawingId ? "pointer" : "not-allowed",
                padding: "2px 6px", fontSize: 8, fontWeight: 700, letterSpacing: 0.3,
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
              onClick={(e) => { e.stopPropagation(); removeTakeoff(drivingToId); }}
              title="Delete measurement"
              style={{ width: 16, height: 16, border: "none", background: "transparent", color: C.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, opacity: 0.6 }}
            >
              <Ic d={I.trash} size={8} />
            </button>
          )}

          {/* Delete instance (only if > 1) */}
          {catInstances.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Remove linked takeoffs first
                cat.items.forEach(item => {
                  const toId = catInst.itemTakeoffIds?.[item.id];
                  if (toId) removeTakeoff(toId);
                });
                removeCategoryInstance(activeBuilder, cat.id, catInst.id);
              }}
              title="Remove type"
              style={{ width: 14, height: 14, border: "none", background: "transparent", color: C.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, opacity: 0.6 }}
            >
              <Ic d={I.trash} size={8} />
            </button>
          )}
        </div>

        {/* Collapsible body */}
        {!isCollapsed && <>
        {/* Instance specs */}
        {renderInstanceSpecs(cat.specs, cat.id, catInst)}

        {/* Stud length warning: standard lumber not available over 20' */}
        {(() => {
          const material = catInst.specs?.Material ?? cat.specs?.find(s => s.id === "Material")?.default ?? "";
          const studSize = catInst.specs?.StudSize ?? cat.specs?.find(s => s.id === "StudSize")?.default ?? "";
          const wallHt = parseFloat(catInst.specs?.WallHeight ?? cat.specs?.find(s => s.id === "WallHeight")?.default ?? 0);
          const isStdLumber = studSize.startsWith("2x");
          if (material !== "Wood" || !isStdLumber || wallHt <= 20) return null;
          // Standard lumber stock lengths
          const stockLengths = [8, 10, 12, 14, 16, 20];
          // Map current stud depth → matching LVL/PSL options (sorted: least material first)
          const depthMap = {
            "2x4":  [{ id: "LVL 1-3/4x5-1/2", note: "min LVL (deeper wall)" }],
            "2x6":  [{ id: "LVL 1-3/4x5-1/2" }, { id: "PSL 3-1/2x5-1/2" }],
            "2x8":  [{ id: "LVL 1-3/4x7-1/4" }, { id: "PSL 3-1/2x7-1/4" }],
            "2x10": [{ id: "LVL 1-3/4x9-1/4" }, { id: "LVL 1-3/4x9-1/2" }],
            "2x12": [{ id: "LVL 1-3/4x11-7/8" }],
          };
          const suggestions = depthMap[studSize] || [{ id: "LVL 1-3/4x5-1/2" }];
          return (
            <div style={{ margin: "2px 8px 4px", padding: "6px 8px", background: `${C.orange || "#f59e0b"}12`, border: `1px solid ${C.orange || "#f59e0b"}40`, borderRadius: 5 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.orange || "#f59e0b", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <span>⚠</span> {studSize} studs not available over 20'
              </div>
              <div style={{ fontSize: 8, color: C.textDim, marginBottom: 4 }}>
                LVL/PSL can be ordered to exact {wallHt}' length — zero waste:
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {suggestions.map((s, i) => (
                  <button key={s.id}
                    onClick={() => handleInstanceSpecChange(cat.id, catInst.id, "StudSize", s.id)}
                    style={{ padding: "2px 6px", fontSize: 9, fontWeight: 600, border: `1px solid ${C.accent}50`, background: i === 0 ? `${C.accent}15` : "transparent", color: C.accent, borderRadius: 3, cursor: "pointer" }}
                  >
                    {s.id}{i === 0 ? " ★" : ""}{s.note ? ` (${s.note})` : ""}
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
        </>}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, background: `${C.accent}08` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 20h20" /><path d="M5 20V10l7-7 7 7v10" /><path d="M9 20v-4h6v4" />
              </svg>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{builderDef.name}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {activeBuilder === "walls" && onDetectWallSchedule && (
              <button onClick={(e) => { e.stopPropagation(); onDetectWallSchedule(); }}
                disabled={!selectedDrawingId || wallScheduleLoading}
                title={!selectedDrawingId ? "Select a drawing first" : "AI detects wall type schedule from current drawing"}
                style={{
                  padding: "3px 8px", fontSize: 9, fontWeight: 600, border: `1px solid ${C.accent}40`,
                  background: wallScheduleLoading ? `${C.accent}15` : `${C.accent}10`,
                  color: !selectedDrawingId ? C.textDimmer : C.accent,
                  borderRadius: 4, cursor: !selectedDrawingId || wallScheduleLoading ? "default" : "pointer",
                  opacity: !selectedDrawingId ? 0.5 : 1,
                  display: "flex", alignItems: "center", gap: 4,
                  whiteSpace: "nowrap",
                }}>
                <Ic d={I.ai} size={9} color={!selectedDrawingId ? C.textDimmer : C.accent} />
                {wallScheduleLoading ? "Scanning..." : "AI Wall Schedule"}
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); setActiveBuilder(null); }} style={{ width: 22, height: 22, border: "none", background: C.bg2, color: C.textDim, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12 }}>
              <Ic d={I.x} size={10} color={C.textDim} />
            </button>
          </div>
        </div>
      </div>

      {/* Scope Tree */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {builderDef.categories.map(cat => {
          if (catsOnPage && !catsOnPage.has(cat.id)) return null;

          const isExpanded = inst.expandedCategories[cat.id] !== false;
          const catType = cat.type || "measurement";

          // ── MULTI-INSTANCE MEASUREMENT GROUP ──────────────────
          if (catType === "measurement" && cat.multiInstance) {
            const catInstances = inst.categoryInstances?.[cat.id] || [];
            return (
              <div key={cat.id} style={{ marginBottom: 2, borderBottom: `1px solid ${C.border}15` }}>
                {/* Category header with + button */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 10px",
                  background: `${C.bg2}60`, cursor: "pointer",
                  borderLeft: "3px solid transparent",
                }}>
                  <div onClick={() => toggleCategory(activeBuilder, cat.id)} style={{ display: "flex", alignItems: "center", padding: 2 }}>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke={C.textDim} strokeWidth="1.5" style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                      <path d="M2 1l4 3-4 3" />
                    </svg>
                  </div>
                  <div onClick={() => toggleCategory(activeBuilder, cat.id)} style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{cat.name}</span>
                      <span style={{ fontSize: 8, fontWeight: 600, color: C.textDim, background: `${C.text}10`, padding: "1px 4px", borderRadius: 3 }}>
                        {catInstances.length} type{catInstances.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); addCategoryInstance(activeBuilder, cat.id); }}
                    title="Add footing type"
                    style={{
                      border: "none", borderRadius: 3, cursor: "pointer",
                      padding: "2px 8px", fontSize: 9, fontWeight: 700,
                      background: `${C.accent}15`, color: C.accent,
                    }}
                  >+ Type</button>
                </div>

                {/* Instances */}
                {isExpanded && (
                  <div style={{ padding: "4px 0" }}>
                    {catInstances.map(catInst => renderInstance(cat, catInst, catInstances))}
                  </div>
                )}
              </div>
            );
          }

          // ── SINGLE-INSTANCE MEASUREMENT GROUP ──────────────────
          if (catType === "measurement") {
            // Category progress
            let catTotal = 0, catDone = 0;
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
                <div style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 10px",
                  background: isMeasuring ? `${C.accent}10` : `${C.bg2}60`,
                  borderLeft: isMeasuring ? `3px solid ${C.accent}` : "3px solid transparent",
                  cursor: "pointer",
                }}>
                  <div onClick={() => toggleCategory(activeBuilder, cat.id)} style={{ display: "flex", alignItems: "center", padding: 2 }}>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke={C.textDim} strokeWidth="1.5" style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                      <path d="M2 1l4 3-4 3" />
                    </svg>
                  </div>
                  <div onClick={() => toggleCategory(activeBuilder, cat.id)} style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{cat.name}</span>
                      {drivingItem && (
                        <span style={{ fontSize: 8, fontWeight: 600, color: C.textDim, background: `${C.text}10`, padding: "1px 4px", borderRadius: 3 }}>
                          {drivingItem.unit}
                        </span>
                      )}
                    </div>
                    {!isExpanded && drivingQty > 0 && resultCount > 0 && (
                      <div style={{ fontSize: 9, color: C.textDim, marginTop: 1 }}>
                        {drivingQty >= 1000 ? Math.round(drivingQty).toLocaleString() : Math.round(drivingQty * 100) / 100} {drivingItem?.unit} {"\u2192"} {resultCount} result{resultCount !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                  {drivingQty > 0 && (
                    <span style={{ fontSize: 12, fontFamily: "'DM Mono',monospace", fontWeight: 600, color: C.text, fontFeatureSettings: "'tnum'" }}>
                      {drivingQty >= 1000 ? Math.round(drivingQty).toLocaleString() : Math.round(drivingQty * 100) / 100}
                    </span>
                  )}
                  {drivingItem && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDrivingClick(drivingItem, cat); }}
                      disabled={!selectedDrawingId}
                      style={{
                        border: "none", borderRadius: 4, cursor: selectedDrawingId ? "pointer" : "not-allowed",
                        padding: "3px 8px", fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
                        background: isMeasuring ? C.accent : drivingQty > 0 ? `${C.green}20` : `${C.accent}15`,
                        color: isMeasuring ? "#fff" : drivingQty > 0 ? C.green : C.accent,
                        opacity: selectedDrawingId ? 1 : 0.4,
                        transition: "all 0.15s",
                      }}
                    >
                      {isMeasuring ? "MEASURING" : drivingQty > 0 ? "RE-MEASURE" : "MEASURE"}
                    </button>
                  )}
                </div>
                {isExpanded && (
                  <div>
                    {renderSpecs(cat.specs, handleSpecChange)}
                    {derivedItems.length > 0 && (
                      <div style={{ padding: "2px 0 4px" }}>
                        {derivedItems.map(item => renderResultRow(item, cat))}
                      </div>
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
                  onClick={() => toggleCategory(activeBuilder, cat.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
                    cursor: "pointer", opacity: hasAnyQty ? 1 : 0.6,
                    borderLeft: "3px solid transparent",
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke={C.textDim} strokeWidth="1.5" style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", marginLeft: 2 }}>
                    <path d="M2 1l4 3-4 3" />
                  </svg>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.textDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
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
                  onClick={() => toggleCategory(activeBuilder, cat.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
                    cursor: "pointer", borderLeft: "3px solid transparent",
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke={C.textDim} strokeWidth="1.5" style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", marginLeft: 2 }}>
                    <path d="M2 1l4 3-4 3" />
                  </svg>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.textDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
                  </svg>
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: C.textDim }}>{cat.name}</span>
                </div>
                {isExpanded && (
                  <div style={{ padding: "0 0 4px" }}>
                    {cat.items.map(item => renderResultRow(item, cat))}
                  </div>
                )}
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "8px 12px", borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textDim, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{builderDef.name}</span>
        {!selectedDrawingId && (
          <span style={{ color: C.orange, fontWeight: 600 }}>Select a drawing</span>
        )}
      </div>
    </div>
  );
}
