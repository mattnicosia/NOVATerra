import { create } from "zustand";
import { uid, nn } from "@/utils/format";
import { autoDirective } from "@/utils/directives";
import { autoTradeFromCode } from "@/constants/tradeGroupings";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { useUndoStore } from "@/stores/undoStore";
import { getLaborMultiplier } from "@/utils/laborTypes";
import { normalizeCode } from "@/utils/csiFormat";
import { resolveLocationFactors, METRO_AREAS } from "@/constants/locationFactors";

// Default markup order — each entry can independently compound on running subtotal
// `active` controls whether markup is applied in calculation (inactive = skipped)
export const DEFAULT_MARKUP_ORDER = [
  { key: "contingency", label: "Contingency", compound: false, active: false },
  { key: "generalConditions", label: "General Conditions", compound: false, active: false },
  { key: "fee", label: "Fee", compound: false, active: false },
  { key: "overheadAndProfit", label: "Overhead & Profit", compound: false, active: false },
  { key: "overhead", label: "Overhead", compound: false, active: false },
  { key: "profit", label: "Profit", compound: false, active: false },
  { key: "insurance", label: "Insurance", compound: false, active: false },
];

// ── Legacy → new status model migration ──────────────────────────────
// Runs on every setItems call to transparently upgrade old items.
// - `excluded: true` → `status: "excluded"`
// - `allowanceOf: "all"` or `allowanceOf: { material: true, ... }` → `status: "allowance"` + `columnStatus`
// Idempotent: items that already have `status` are returned unchanged.
function _migrateItemStatus(item) {
  // Already migrated or new item
  if (item.status) return item;

  const next = { ...item };

  // Legacy boolean exclude
  if (item.excluded) {
    next.status = "excluded";
    next.columnStatus = {};
    delete next.excluded;
    return next;
  }

  // Legacy allowanceOf
  const ao = item.allowanceOf;
  if (ao) {
    if (typeof ao === "string" && ao) {
      // "all" or any truthy string → row-level allowance
      next.status = "allowance";
      next.columnStatus = {};
    } else if (typeof ao === "object") {
      const flaggedCols = ["material", "labor", "equipment", "subcontractor"].filter(c => ao[c]);
      if (flaggedCols.length === 4) {
        // All 4 columns → row-level allowance
        next.status = "allowance";
        next.columnStatus = {};
      } else if (flaggedCols.length > 0) {
        // Partial → firm row with column overrides
        next.status = "firm";
        next.columnStatus = {};
        flaggedCols.forEach(c => { next.columnStatus[c] = "allowance"; });
      }
    }
    if (next.status) return next;
  }

  // Default: firm
  next.status = "firm";
  next.columnStatus = next.columnStatus || {};
  return next;
}

// ── Debounce tracker for field edits (updateItem, updateSubItem) ──
// Coalesces rapid same-field edits into a single undo entry
let _lastEdit = { id: null, field: null, origValue: null, timer: null };

function _flushEditUndo(get, set) {
  if (!_lastEdit.timer) return;
  clearTimeout(_lastEdit.timer);
  const { id, field, origValue } = _lastEdit;
  const item = get().items.find(it => it.id === id);
  if (item) {
    const curValue = item[field];
    // Only push if value actually changed
    if (curValue !== origValue) {
      useUndoStore.getState().push({
        action: `Edit ${field}`,
        undo: () => {
          set(s => ({
            items: s.items.map(it => {
              if (it.id !== id) return it;
              const updated = { ...it, [field]: origValue };
              if (field === "directive") updated.directiveOverride = !!origValue;
              if (["material", "labor", "equipment", "subcontractor"].includes(field) && !updated.directiveOverride) {
                updated.directive = autoDirective(
                  updated.material,
                  updated.labor,
                  updated.equipment,
                  updated.subcontractor,
                );
              }
              return updated;
            }),
          }));
        },
        redo: () => {
          set(s => ({
            items: s.items.map(it => {
              if (it.id !== id) return it;
              const updated = { ...it, [field]: curValue };
              if (field === "directive") updated.directiveOverride = !!curValue;
              if (["material", "labor", "equipment", "subcontractor"].includes(field) && !updated.directiveOverride) {
                updated.directive = autoDirective(
                  updated.material,
                  updated.labor,
                  updated.equipment,
                  updated.subcontractor,
                );
              }
              return updated;
            }),
          }));
        },
        timestamp: Date.now(),
      });
    }
  }
  _lastEdit = { id: null, field: null, origValue: null, timer: null };
}

// Debounce tracker for sub-item field edits
let _lastSubEdit = { itemId: null, subItemId: null, field: null, origValue: null, timer: null };

function _flushSubEditUndo(set) {
  if (!_lastSubEdit.timer) return;
  clearTimeout(_lastSubEdit.timer);
  const { itemId, subItemId, field, origValue } = _lastSubEdit;
  // Capture the current (edited) value at flush time for redo
  const item = useItemsStore.getState().items.find(it => it.id === itemId);
  const subItem = item ? (item.subItems || []).find(si => si.id === subItemId) : null;
  const curValue = subItem ? subItem[field] : origValue;
  useUndoStore.getState().push({
    action: `Edit sub-item`,
    undo: () =>
      set(s => ({
        items: s.items.map(it =>
          it.id !== itemId
            ? it
            : {
                ...it,
                subItems: (it.subItems || []).map(si => (si.id === subItemId ? { ...si, [field]: origValue } : si)),
              },
        ),
      })),
    redo: () =>
      set(s => ({
        items: s.items.map(it =>
          it.id !== itemId
            ? it
            : {
                ...it,
                subItems: (it.subItems || []).map(si => (si.id === subItemId ? { ...si, [field]: curValue } : si)),
              },
        ),
      })),
    timestamp: Date.now(),
  });
  _lastSubEdit = { itemId: null, subItemId: null, field: null, origValue: null, timer: null };
}

export const useItemsStore = create((set, get) => ({
  items: [],
  markup: {
    overhead: 10,
    profit: 10,
    overheadAndProfit: 20,
    contingency: 5,
    generalConditions: 0,
    insurance: 2,
    fee: 0,
    tax: 0,
    bond: 0,
  },
  markupOrder: [...DEFAULT_MARKUP_ORDER],
  customMarkups: [],
  changeOrders: [],
  projectAssemblies: [],

  setItems: v => set({ items: (v || []).map(_migrateItemStatus) }),
  // Normalize all item codes to standard format and repair division labels
  // from code when a stale blob left them blank/incomplete.
  normalizeAllCodes: () => set(s => {
    let changed = false;
    const divFromCode = useProjectStore.getState().divFromCode;
    const fixed = s.items.map(it => {
      const nc = normalizeCode(it.code);
      const next = {};

      if (nc !== it.code) {
        next.code = nc;
      }

      const currentDiv = typeof it.division === "string" ? it.division.trim() : "";
      const needsDivisionRepair =
        !!(nc || it.code) &&
        (!currentDiv || currentDiv === "Unassigned" || !currentDiv.includes(" - ") || !currentDiv.split(" - ")[1]?.trim());

      if (needsDivisionRepair) {
        const repairedDiv = divFromCode(nc || it.code);
        if (repairedDiv && repairedDiv !== it.division) {
          next.division = repairedDiv;
        }
      }

      if (Object.keys(next).length > 0) {
        changed = true;
        return { ...it, ...next };
      }

      return it;
    });
    return changed ? { items: fixed } : {};
  }),
  setMarkup: v => set({ markup: v }),
  setMarkupOrder: v => set({ markupOrder: v }),
  setCustomMarkups: v => set({ customMarkups: v }),
  setChangeOrders: v => set({ changeOrders: v }),
  setProjectAssemblies: v => set({ projectAssemblies: v }),
  addProjectAssembly: asm =>
    set(s => ({
      projectAssemblies: [...s.projectAssemblies, { id: uid(), ...asm }],
    })),
  removeProjectAssembly: id =>
    set(s => ({
      projectAssemblies: s.projectAssemblies.filter(a => a.id !== id),
    })),

  addElement: (division, preset, bidContext) => {
    const newId = uid();
    const newItem = {
      id: newId,
      code: normalizeCode(preset?.code || ""),
      description: preset?.name || "",
      division: division || "",
      quantity: preset?.quantity ?? 1,
      unit: preset?.unit || "EA",
      material: preset?.material || 0,
      labor: preset?.labor || 0,
      equipment: preset?.equipment || 0,
      subcontractor: preset?.subcontractor || 0,
      trade: preset?.trade || autoTradeFromCode(preset?.code) || "",
      directive: "",
      notes: "",
      drawingRef: "",
      variables: [],
      formula: "",
      specSection: "",
      specText: "",
      specVariantLabel: "",
      status: "firm",           // "firm" | "excluded" | "allowance"
      columnStatus: {},          // { material, labor, equipment, subcontractor } — per-column override, inherits from status if absent
      allowanceOf: "",
      allowanceSubMarkup: "",
      wasteFactor: 0,            // percentage applied to quantity for proposal language
      locationLocked: false,
      subItems: preset?.subItems || [],
      bidContext: bidContext || "base",
      source: preset?.source || { category: "user", label: "" },
      novaProposed: preset?.novaProposed || false,
    };
    set(s => ({ items: [...s.items, newItem] }));
    useUndoStore.getState().push({
      action: `Add "${newItem.description || "item"}"`,
      undo: () => set(s => ({ items: s.items.filter(it => it.id !== newId) })),
      redo: () => set(s => ({ items: [...s.items, newItem] })),
      timestamp: Date.now(),
    });
  },

  updateItem: (id, field, value) => {
    // Signal to cloudSync that the user is actively editing — prevents Realtime
    // bounce from overwriting in-flight changes (see cloudSync._reloadActiveEstimate)
    import("@/utils/cloudSync").then(m => m.markItemEdited?.()).catch(() => {});

    // Flush any pending edit for a DIFFERENT id/field
    if (_lastEdit.timer && (_lastEdit.id !== id || _lastEdit.field !== field)) {
      _flushEditUndo(get, set);
    }
    // Capture original value on first edit of this id+field
    if (!_lastEdit.timer || _lastEdit.id !== id || _lastEdit.field !== field) {
      const item = get().items.find(it => it.id === id);
      _lastEdit = { id, field, origValue: item ? item[field] : undefined, timer: null };
    }
    // Clear previous timer, set new one
    if (_lastEdit.timer) clearTimeout(_lastEdit.timer);
    _lastEdit.timer = setTimeout(() => _flushEditUndo(get, set), 1500);

    // Apply the change — manual edits clear novaProposed (user takes ownership)
    set(s => ({
      items: s.items.map(it => {
        if (it.id !== id) return it;
        const updated = { ...it, [field]: value, novaProposed: false };
        if (field === "directive") {
          updated.directiveOverride = !!value;
        }
        if (["material", "labor", "equipment", "subcontractor"].includes(field) && !updated.directiveOverride) {
          updated.directive = autoDirective(updated.material, updated.labor, updated.equipment, updated.subcontractor);
        }
        return updated;
      }),
    }));
  },

  // Batch update — apply multiple fields at once, recalculate directive only once
  batchUpdateItem: (id, fields) => {
    // Signal edit recency guard (same as updateItem) so cloud sync won't
    // overwrite in-flight drag-drop division/code assignments
    import("@/utils/cloudSync").then(m => m.markItemEdited?.()).catch(() => {});
    // Flush any pending field edit first
    if (_lastEdit.timer) _flushEditUndo(get, set);

    const item = get().items.find(it => it.id === id);
    if (!item) return;

    // Capture previous values for each key being changed
    const prevFields = {};
    Object.keys(fields).forEach(k => {
      prevFields[k] = item[k];
    });

    set(s => ({
      items: s.items.map(it => {
        if (it.id !== id) return it;
        const updated = { ...it, ...fields };
        const costChanged = ["material", "labor", "equipment", "subcontractor"].some(f => f in fields);
        if (costChanged && !updated.directiveOverride) {
          updated.directive = autoDirective(updated.material, updated.labor, updated.equipment, updated.subcontractor);
        }
        return updated;
      }),
    }));

    useUndoStore.getState().push({
      action: `Edit item`,
      undo: () =>
        set(s => ({
          items: s.items.map(it => {
            if (it.id !== id) return it;
            const updated = { ...it, ...prevFields };
            const costChanged = ["material", "labor", "equipment", "subcontractor"].some(f => f in prevFields);
            if (costChanged && !updated.directiveOverride) {
              updated.directive = autoDirective(
                updated.material,
                updated.labor,
                updated.equipment,
                updated.subcontractor,
              );
            }
            return updated;
          }),
        })),
      redo: () =>
        set(s => ({
          items: s.items.map(it => {
            if (it.id !== id) return it;
            const updated = { ...it, ...fields };
            const costChanged = ["material", "labor", "equipment", "subcontractor"].some(f => f in fields);
            if (costChanged && !updated.directiveOverride) {
              updated.directive = autoDirective(
                updated.material,
                updated.labor,
                updated.equipment,
                updated.subcontractor,
              );
            }
            return updated;
          }),
        })),
      timestamp: Date.now(),
    });
  },

  // ── NOVA Source & Review ──
  // Mark one or more items as reviewed (clears novaProposed tint)
  markNovaReviewed: ids => {
    const idSet = new Set(Array.isArray(ids) ? ids : [ids]);
    set(s => ({
      items: s.items.map(it => (idSet.has(it.id) ? { ...it, novaProposed: false } : it)),
    }));
  },

  // Set the source metadata on an item { category, label }
  setItemSource: (id, source) => {
    set(s => ({
      items: s.items.map(it => (it.id === id ? { ...it, source } : it)),
    }));
  },

  // Get count of NOVA-proposed items that haven't been reviewed
  getNovaProposedCount: () => get().items.filter(it => it.novaProposed).length,

  // ── Status management (exclude / allowance / firm) ──

  setItemStatus: (id, status) => {
    const item = get().items.find(it => it.id === id);
    if (!item) return;
    const prev = { status: item.status || "firm", columnStatus: { ...(item.columnStatus || {}) } };
    set(s => ({
      items: s.items.map(it =>
        it.id !== id ? it : { ...it, status, columnStatus: {} },
      ),
    }));
    useUndoStore.getState().push({
      action: `Set ${status}`,
      undo: () => set(s => ({ items: s.items.map(it => it.id !== id ? it : { ...it, ...prev }) })),
      redo: () => set(s => ({ items: s.items.map(it => it.id !== id ? it : { ...it, status, columnStatus: {} }) })),
      timestamp: Date.now(),
    });
  },

  setColumnStatus: (id, column, colStatus) => {
    const item = get().items.find(it => it.id === id);
    if (!item) return;
    const prevCS = { ...(item.columnStatus || {}) };
    const nextCS = { ...prevCS, [column]: colStatus };
    // If column status matches row status, remove the override
    if (colStatus === (item.status || "firm")) delete nextCS[column];
    set(s => ({
      items: s.items.map(it =>
        it.id !== id ? it : { ...it, columnStatus: nextCS },
      ),
    }));
    useUndoStore.getState().push({
      action: `Set ${column} ${colStatus}`,
      undo: () => set(s => ({ items: s.items.map(it => it.id !== id ? it : { ...it, columnStatus: prevCS }) })),
      redo: () => set(s => ({ items: s.items.map(it => it.id !== id ? it : { ...it, columnStatus: nextCS }) })),
      timestamp: Date.now(),
    });
  },

  // Convenience: get resolved status for a column (for UI display)
  getColumnStatus: (item, col) => {
    const cs = item.columnStatus;
    if (cs && cs[col]) return cs[col];
    return item.status || "firm";
  },

  removeItem: id => {
    const items = get().items;
    const idx = items.findIndex(it => it.id === id);
    if (idx === -1) return;
    const removed = items[idx];
    set({ items: items.filter(it => it.id !== id) });
    useUndoStore.getState().push({
      action: `Delete "${removed.description || "item"}"`,
      undo: () => {
        const cur = get().items;
        const restored = [...cur];
        restored.splice(idx, 0, removed);
        set({ items: restored });
      },
      redo: () => set(s => ({ items: s.items.filter(it => it.id !== id) })),
      timestamp: Date.now(),
    });
  },

  duplicateItem: id => {
    const items = get().items;
    const idx = items.findIndex(it => it.id === id);
    if (idx === -1) return;
    const newId = uid();
    const copy = { ...items[idx], id: newId, subItems: [...(items[idx].subItems || [])] };
    const next = [...items];
    next.splice(idx + 1, 0, copy);
    set({ items: next });
    useUndoStore.getState().push({
      action: `Duplicate "${copy.description || "item"}"`,
      undo: () => set(s => ({ items: s.items.filter(it => it.id !== newId) })),
      redo: () => {
        const cur = get().items;
        const ri = cur.findIndex(it => it.id === id);
        const restored = [...cur];
        restored.splice(ri + 1, 0, copy);
        set({ items: restored });
      },
      timestamp: Date.now(),
    });
  },

  // Reorder items with undo support (use instead of setItems for drag-and-drop)
  reorderItems: newItems => {
    const prevItems = get().items;
    set({ items: newItems });
    useUndoStore.getState().push({
      action: `Reorder items`,
      undo: () => set({ items: prevItems }),
      redo: () => set({ items: newItems }),
      timestamp: Date.now(),
    });
  },

  // Sub-item CRUD — optional cost breakdown within a scope item
  addSubItem: itemId => {
    const newId = uid();
    const newSub = { id: newId, desc: "", unit: "EA", m: 0, l: 0, e: 0, factor: 1 };
    set(s => ({
      items: s.items.map(it =>
        it.id !== itemId
          ? it
          : {
              ...it,
              subItems: [...(it.subItems || []), newSub],
            },
      ),
    }));
    useUndoStore.getState().push({
      action: `Add sub-item`,
      undo: () =>
        set(s => ({
          items: s.items.map(it =>
            it.id !== itemId
              ? it
              : {
                  ...it,
                  subItems: (it.subItems || []).filter(si => si.id !== newId),
                },
          ),
        })),
      redo: () =>
        set(s => ({
          items: s.items.map(it =>
            it.id !== itemId
              ? it
              : {
                  ...it,
                  subItems: [...(it.subItems || []), newSub],
                },
          ),
        })),
      timestamp: Date.now(),
    });
  },

  updateSubItem: (itemId, subItemId, field, value) => {
    // Flush any pending sub-edit for a DIFFERENT target
    if (
      _lastSubEdit.timer &&
      (_lastSubEdit.itemId !== itemId || _lastSubEdit.subItemId !== subItemId || _lastSubEdit.field !== field)
    ) {
      _flushSubEditUndo(set);
    }
    // Capture original value on first edit
    if (
      !_lastSubEdit.timer ||
      _lastSubEdit.itemId !== itemId ||
      _lastSubEdit.subItemId !== subItemId ||
      _lastSubEdit.field !== field
    ) {
      const item = get().items.find(it => it.id === itemId);
      const sub = item ? (item.subItems || []).find(si => si.id === subItemId) : null;
      _lastSubEdit = { itemId, subItemId, field, origValue: sub ? sub[field] : undefined, timer: null };
    }
    if (_lastSubEdit.timer) clearTimeout(_lastSubEdit.timer);
    _lastSubEdit.timer = setTimeout(() => _flushSubEditUndo(set), 1500);

    // Apply the change
    set(s => ({
      items: s.items.map(it =>
        it.id !== itemId
          ? it
          : {
              ...it,
              subItems: (it.subItems || []).map(si => (si.id === subItemId ? { ...si, [field]: value } : si)),
            },
      ),
    }));
  },

  removeSubItem: (itemId, subItemId) => {
    const item = get().items.find(it => it.id === itemId);
    const removedSub = item ? (item.subItems || []).find(si => si.id === subItemId) : null;
    set(s => ({
      items: s.items.map(it =>
        it.id !== itemId
          ? it
          : {
              ...it,
              subItems: (it.subItems || []).filter(si => si.id !== subItemId),
            },
      ),
    }));
    if (removedSub) {
      useUndoStore.getState().push({
        action: `Delete sub-item "${removedSub.desc || "sub-item"}"`,
        undo: () =>
          set(s => ({
            items: s.items.map(it =>
              it.id !== itemId
                ? it
                : {
                    ...it,
                    subItems: [...(it.subItems || []), removedSub],
                  },
            ),
          })),
        redo: () =>
          set(s => ({
            items: s.items.map(it =>
              it.id !== itemId
                ? it
                : {
                    ...it,
                    subItems: (it.subItems || []).filter(si => si.id !== subItemId),
                  },
            ),
          })),
        timestamp: Date.now(),
      });
    }
  },

  updateMarkup: (field, value) =>
    set(s => ({
      markup: { ...s.markup, [field]: value },
    })),

  addCustomMarkup: () =>
    set(s => ({
      customMarkups: [...s.customMarkups, { id: uid(), label: "", value: 0, type: "pct" }],
    })),

  updateCustomMarkup: (id, field, value) =>
    set(s => ({
      customMarkups: s.customMarkups.map(m => (m.id === id ? { ...m, [field]: value } : m)),
    })),

  removeCustomMarkup: id =>
    set(s => ({
      customMarkups: s.customMarkups.filter(m => m.id !== id),
    })),

  _getLaborMult: () => {
    const laborTypeKey = useProjectStore.getState().project.laborType;
    const laborTypes = useUiStore.getState().appSettings.laborTypes;
    return getLaborMultiplier(laborTypeKey, laborTypes);
  },

  _getLocationFactors: () => {
    const project = useProjectStore.getState().project;
    if (project.locationMetroId) {
      const metro = METRO_AREAS.find(m => m.id === project.locationMetroId);
      if (metro) return { mat: metro.mat, lab: metro.lab, equip: metro.equip };
    }
    const resolved = resolveLocationFactors(project.zipCode);
    return { mat: resolved.mat, lab: resolved.lab, equip: resolved.equip };
  },

  // Resolve effective status for a cost column — columnStatus override > item.status
  _colStatus: (item, col) => {
    const cs = item.columnStatus;
    if (cs && cs[col]) return cs[col];
    return item.status || "firm";
  },

  getItemTotal: item => {
    // Row-level excluded → entire item is zero
    if (item.status === "excluded" && (!item.columnStatus || Object.keys(item.columnStatus).length === 0)) return 0;
    const q = nn(item.quantity);
    const mult = get()._getLaborMult();
    const loc = item.locationLocked ? { mat: 1, lab: 1, equip: 1 } : get()._getLocationFactors();
    const cs = get()._colStatus;
    // Excluded columns contribute 0
    const mat = cs(item, "material") === "excluded" ? 0 : nn(item.material) * loc.mat;
    const lab = cs(item, "labor") === "excluded" ? 0 : nn(item.labor) * mult * loc.lab;
    const eqp = cs(item, "equipment") === "excluded" ? 0 : nn(item.equipment) * loc.equip;
    const sub = cs(item, "subcontractor") === "excluded" ? 0 : nn(item.subcontractor);
    return q * (mat + lab + eqp + sub);
  },

  getTotals: () => {
    const { items, markup, markupOrder, customMarkups } = get();
    const mult = get()._getLaborMult();
    const globalLoc = get()._getLocationFactors();
    const cs = get()._colStatus;
    let material = 0,
      labor = 0,
      equipment = 0,
      sub = 0;
    items.forEach(it => {
      // Row-level excluded with no column overrides → skip entirely
      if (it.status === "excluded" && (!it.columnStatus || Object.keys(it.columnStatus).length === 0)) return;
      const q = nn(it.quantity);
      const loc = it.locationLocked ? { mat: 1, lab: 1, equip: 1 } : globalLoc;
      if (cs(it, "material") !== "excluded") material += q * nn(it.material) * loc.mat;
      if (cs(it, "labor") !== "excluded") labor += q * nn(it.labor) * loc.lab;
      if (cs(it, "equipment") !== "excluded") equipment += q * nn(it.equipment) * loc.equip;
      if (cs(it, "subcontractor") !== "excluded") sub += q * nn(it.subcontractor);
    });
    // Apply labor multiplier
    labor = labor * mult;
    const direct = material + labor + equipment + sub;

    // Ordered markup calculation — each markup either compounds on running subtotal or uses base direct
    // Skip inactive markups (active defaults to true for backward compatibility)
    let running = direct;
    const order = markupOrder || DEFAULT_MARKUP_ORDER;
    order.forEach(mo => {
      if (mo.active === false) return;
      const pct = nn(markup[mo.key]);
      if (pct === 0) return;
      const base = mo.compound ? running : direct;
      running += Math.round((base * pct) / 100 * 100) / 100;
    });

    let grand = running;

    // Tax and bond on post-markup
    grand = Math.round(grand * (1 + nn(markup.tax) / 100) * 100) / 100;
    grand = Math.round(grand * (1 + nn(markup.bond) / 100) * 100) / 100;

    // Custom markups
    customMarkups.forEach(cm => {
      if (cm.type === "pct") grand = Math.round(grand * (1 + nn(cm.value) / 100) * 100) / 100;
      else grand = Math.round((grand + nn(cm.value)) * 100) / 100;
    });

    return { material, labor, equipment, sub, direct, grand };
  },

  // Compute totals for a subset of items matching specific scenario/group IDs
  getScenarioTotals: ids => {
    const idSet = ids instanceof Set ? ids : new Set(typeof ids === "string" ? [ids] : Array.from(ids));
    const { items, markup, markupOrder, customMarkups } = get();
    const filtered = items.filter(it => idSet.has(it.bidContext || "base"));
    const count = filtered.length;
    if (count === 0) return { material: 0, labor: 0, equipment: 0, sub: 0, direct: 0, grand: 0, count: 0 };

    const mult = get()._getLaborMult();
    const globalLoc = get()._getLocationFactors();
    const cs = get()._colStatus;
    let material = 0,
      labor = 0,
      equipment = 0,
      sub = 0;
    filtered.forEach(it => {
      if (it.status === "excluded" && (!it.columnStatus || Object.keys(it.columnStatus).length === 0)) return;
      const q = nn(it.quantity);
      const loc = it.locationLocked ? { mat: 1, lab: 1, equip: 1 } : globalLoc;
      if (cs(it, "material") !== "excluded") material += q * nn(it.material) * loc.mat;
      if (cs(it, "labor") !== "excluded") labor += q * nn(it.labor) * loc.lab;
      if (cs(it, "equipment") !== "excluded") equipment += q * nn(it.equipment) * loc.equip;
      if (cs(it, "subcontractor") !== "excluded") sub += q * nn(it.subcontractor);
    });
    labor = labor * mult;
    const direct = material + labor + equipment + sub;

    let running = direct;
    const order = markupOrder || DEFAULT_MARKUP_ORDER;
    order.forEach(mo => {
      if (mo.active === false) return;
      const pct = nn(markup[mo.key]);
      if (pct === 0) return;
      const base = mo.compound ? running : direct;
      running += Math.round((base * pct) / 100 * 100) / 100;
    });

    let grand = running;
    grand = Math.round(grand * (1 + nn(markup.tax) / 100) * 100) / 100;
    grand = Math.round(grand * (1 + nn(markup.bond) / 100) * 100) / 100;
    customMarkups.forEach(cm => {
      if (cm.type === "pct") grand = Math.round(grand * (1 + nn(cm.value) / 100) * 100) / 100;
      else grand = Math.round((grand + nn(cm.value)) * 100) / 100;
    });

    return { material, labor, equipment, sub, direct, grand, count };
  },
}));
