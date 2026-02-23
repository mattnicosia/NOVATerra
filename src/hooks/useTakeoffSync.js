// Auto-sync takeoffs to estimate line items
// Creates linked items automatically, syncs description/unit/quantity
// Module takeoffs (with moduleId) are grouped into scope items with costed sub-parts
import { useEffect, useRef } from 'react';
import { useTakeoffsStore } from '@/stores/takeoffsStore';
import { useItemsStore } from '@/stores/itemsStore';
import { useDrawingsStore } from '@/stores/drawingsStore';
import { uid, nn } from '@/utils/format';
import { autoTradeFromCode } from '@/constants/tradeGroupings';
import { getComputedQtyCtx } from '@/utils/measurementCalc';
import { getModuleItemCosts } from '@/utils/moduleSeedMap';
import { useModuleStore } from '@/stores/moduleStore';

// Retrieve instance specs from module store for dynamic pricing lookup
function getInstanceSpecs(moduleId, instanceId) {
  if (!moduleId || !instanceId) return null;
  const moduleInst = useModuleStore.getState().moduleInstances?.[moduleId];
  if (!moduleInst) return null;
  const cats = moduleInst.categoryInstances || {};
  for (const catId of Object.keys(cats)) {
    for (const inst of (cats[catId] || [])) {
      if (inst.id === instanceId) return inst.specs;
    }
  }
  return null;
}

function buildScaleCtx() {
  const calibrations = useTakeoffsStore.getState().tkCalibrations;
  const scales = useDrawingsStore.getState().drawingScales;
  const dpi = useDrawingsStore.getState().drawingDpi;
  const drawings = useDrawingsStore.getState().drawings;
  return { calibrations, scales, dpi, drawings };
}

export function useTakeoffSync() {
  const takeoffs = useTakeoffsStore(s => s.takeoffs);
  const prevRef = useRef(null);

  useEffect(() => {
    // Skip first render (load from persistence populates both stores)
    if (prevRef.current === null) {
      prevRef.current = takeoffs;
      return;
    }

    const prev = prevRef.current;
    prevRef.current = takeoffs;

    const scaleCtx = buildScaleCtx();
    const items = useItemsStore.getState().items;
    let nextItems = [...items];
    let nextTakeoffs = [...takeoffs];
    let itemsChanged = false;
    let takeoffsChanged = false;

    // ── Partition takeoffs into module-grouped and ungrouped ──
    const moduleGroups = {};  // group string → takeoff[]
    const ungrouped = [];

    nextTakeoffs.forEach(to => {
      if (to.moduleId && to.group) {
        if (!moduleGroups[to.group]) moduleGroups[to.group] = [];
        moduleGroups[to.group].push(to);
      } else {
        ungrouped.push(to);
      }
    });

    // Track existing module scope items by sourceGroup
    const existingScopeMap = new Map(); // sourceGroup → item
    nextItems.forEach(it => {
      if (it.sourceGroup) existingScopeMap.set(it.sourceGroup, it);
    });

    // ══════════════════════════════════════════════════════════════
    // 1. MODULE GROUPS → Scope items with costed sub-parts
    // ══════════════════════════════════════════════════════════════
    const processedGroups = new Set();

    Object.entries(moduleGroups).forEach(([group, groupTakeoffs]) => {
      processedGroups.add(group);

      // Build sub-items from group takeoffs
      const subItems = groupTakeoffs.map(to => {
        const computedQty = getComputedQtyCtx(to, scaleCtx);
        const qty = computedQty !== null ? Math.round(computedQty * 100) / 100 : nn(to.quantity);
        const specs = to.instanceId ? getInstanceSpecs(to.moduleId, to.instanceId) : null;
        const costs = getModuleItemCosts(to.moduleItemId, specs);
        return {
          id: `si_${to.id}`,
          desc: to.description || "",
          unit: to.unit || "EA",
          m: costs.m,
          l: costs.l,
          e: costs.e,
          factor: qty,
          _takeoffId: to.id,   // internal back-reference (not rendered)
        };
      });

      // Roll up costs (same pattern as assembly insertion)
      const totalM = subItems.reduce((s, si) => s + nn(si.m) * nn(si.factor), 0);
      const totalL = subItems.reduce((s, si) => s + nn(si.l) * nn(si.factor), 0);
      const totalE = subItems.reduce((s, si) => s + nn(si.e) * nn(si.factor), 0);

      // First takeoff in group determines division/code/trade
      const firstTo = groupTakeoffs[0];
      const dc = firstTo.code ? firstTo.code.split(".")[0] : "";

      const existing = existingScopeMap.get(group);
      if (existing) {
        // Update existing scope item — preserve user edits to non-computed fields
        const idx = nextItems.findIndex(it => it.id === existing.id);
        if (idx !== -1) {
          // Merge sub-items: preserve user cost overrides if they manually edited
          const mergedSubs = subItems.map(si => {
            const prevSi = (existing.subItems || []).find(p => p.id === si.id);
            if (prevSi && prevSi._costLocked) {
              // User manually edited costs — keep their values, update factor only
              return { ...prevSi, factor: si.factor };
            }
            return si;
          });

          const mergedM = mergedSubs.reduce((s, si) => s + nn(si.m) * nn(si.factor), 0);
          const mergedL = mergedSubs.reduce((s, si) => s + nn(si.l) * nn(si.factor), 0);
          const mergedE = mergedSubs.reduce((s, si) => s + nn(si.e) * nn(si.factor), 0);

          const needsUpdate =
            Math.round(nn(existing.material) * 100) !== Math.round(mergedM * 100) ||
            Math.round(nn(existing.labor) * 100) !== Math.round(mergedL * 100) ||
            Math.round(nn(existing.equipment) * 100) !== Math.round(mergedE * 100) ||
            JSON.stringify((existing.subItems || []).map(s => s.id + ":" + s.factor)) !== JSON.stringify(mergedSubs.map(s => s.id + ":" + s.factor));

          if (needsUpdate) {
            nextItems[idx] = {
              ...nextItems[idx],
              material: Math.round(mergedM * 100) / 100,
              labor: Math.round(mergedL * 100) / 100,
              equipment: Math.round(mergedE * 100) / 100,
              subItems: mergedSubs,
            };
            itemsChanged = true;
          }
        }
      } else {
        // Create new scope item
        const newItemId = uid();
        nextItems.push({
          id: newItemId,
          code: firstTo.code || "",
          description: group,   // "Steel - Structural Framing (Type A)"
          division: dc ? `${dc} - ` : "",
          quantity: 1,
          unit: "EA",
          material: Math.round(totalM * 100) / 100,
          labor: Math.round(totalL * 100) / 100,
          equipment: Math.round(totalE * 100) / 100,
          subcontractor: 0,
          trade: autoTradeFromCode(firstTo.code) || "",
          directive: "", notes: "", drawingRef: "",
          variables: [], formula: "",
          specSection: "", specText: "",
          specVariantLabel: "", allowanceOf: "", allowanceSubMarkup: "",
          subItems,
          sourceGroup: group,
          moduleId: firstTo.moduleId,
        });
        itemsChanged = true;
      }

      // Mark all grouped takeoffs so ungrouped path skips them
      groupTakeoffs.forEach(to => {
        const idx = nextTakeoffs.findIndex(t => t.id === to.id);
        if (idx !== -1 && nextTakeoffs[idx].linkedItemId !== "grouped") {
          // If previously had a flat item link, remove that flat item
          if (nextTakeoffs[idx].linkedItemId && nextTakeoffs[idx].linkedItemId !== "grouped") {
            nextItems = nextItems.filter(it => it.id !== nextTakeoffs[idx].linkedItemId);
          }
          nextTakeoffs[idx] = { ...nextTakeoffs[idx], linkedItemId: "grouped" };
          takeoffsChanged = true;
          itemsChanged = true;
        }
      });
    });

    // ══════════════════════════════════════════════════════════════
    // 2. UNGROUPED TAKEOFFS → Flat items (original behavior)
    // ══════════════════════════════════════════════════════════════

    // 2a. Handle new ungrouped takeoffs (no linkedItemId) — create flat estimate items
    nextTakeoffs.forEach((to, idx) => {
      if (to.linkedItemId || (to.moduleId && to.group)) return; // skip already-linked and module-grouped
      const newItemId = uid();
      const dc = to.code ? to.code.split(".")[0] : "";
      const computedQty = getComputedQtyCtx(to, scaleCtx);
      nextItems.push({
        id: newItemId,
        code: to.code || "",
        description: to.description || "",
        division: dc ? `${dc} - ` : "",
        quantity: computedQty !== null ? Math.round(computedQty * 100) / 100 : 0,
        unit: to.unit || "SF",
        material: 0, labor: 0, equipment: 0, subcontractor: 0,
        trade: autoTradeFromCode(to.code) || "",
        directive: "", notes: "", drawingRef: to.drawingRef || "",
        variables: [], formula: "",
        specSection: "", specText: "",
        specVariantLabel: "", allowanceOf: "", allowanceSubMarkup: "",
      });
      nextTakeoffs[idx] = { ...nextTakeoffs[idx], linkedItemId: newItemId };
      itemsChanged = true;
      takeoffsChanged = true;
    });

    // 2b. Sync description, unit, quantity for existing ungrouped links
    nextTakeoffs.forEach(to => {
      if (!to.linkedItemId || to.linkedItemId === "grouped") return;
      const itemIdx = nextItems.findIndex(it => it.id === to.linkedItemId);
      if (itemIdx === -1) return;

      const item = nextItems[itemIdx];
      const updates = {};

      if (item.description !== to.description) updates.description = to.description;
      if (item.unit !== to.unit) updates.unit = to.unit;

      const computedQty = getComputedQtyCtx(to, scaleCtx);
      const targetQty = computedQty !== null ? Math.round(computedQty * 100) / 100 : 0;
      if (nn(item.quantity) !== targetQty) updates.quantity = targetQty;

      if (Object.keys(updates).length > 0) {
        nextItems[itemIdx] = { ...nextItems[itemIdx], ...updates };
        itemsChanged = true;
      }
    });

    // ══════════════════════════════════════════════════════════════
    // 3. DELETIONS — Handle removed takeoffs and vanished groups
    // ══════════════════════════════════════════════════════════════

    // 3a. Handle deleted ungrouped takeoffs — remove their flat items
    const currentIds = new Set(takeoffs.map(t => t.id));
    prev.forEach(pt => {
      if (!currentIds.has(pt.id) && pt.linkedItemId && pt.linkedItemId !== "grouped") {
        const before = nextItems.length;
        nextItems = nextItems.filter(it => it.id !== pt.linkedItemId);
        if (nextItems.length !== before) itemsChanged = true;
      }
    });

    // 3b. Handle deleted module groups — remove scope items whose groups no longer exist
    existingScopeMap.forEach((item, group) => {
      if (!processedGroups.has(group)) {
        nextItems = nextItems.filter(it => it.id !== item.id);
        itemsChanged = true;
      }
    });

    if (takeoffsChanged) useTakeoffsStore.getState().setTakeoffs(nextTakeoffs);
    if (itemsChanged) useItemsStore.getState().setItems(nextItems);
  }, [takeoffs]);
}
