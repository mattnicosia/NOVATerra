import { create } from "zustand";
import { uid, nn } from "@/utils/format";
import { autoDirective } from "@/utils/directives";
import { autoTradeFromCode } from "@/constants/tradeGroupings";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { useUndoStore } from "@/stores/undoStore";
import { getLaborMultiplier } from "@/utils/laborTypes";
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

  setItems: v => set({ items: v }),
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
      code: preset?.code || "",
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
      allowanceOf: "",
      allowanceSubMarkup: "",
      locationLocked: false,
      subItems: preset?.subItems || [],
      bidContext: bidContext || "base",
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

    // Apply the change
    set(s => ({
      items: s.items.map(it => {
        if (it.id !== id) return it;
        const updated = { ...it, [field]: value };
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

  getItemTotal: item => {
    const q = nn(item.quantity);
    const mult = get()._getLaborMult();
    const loc = item.locationLocked ? { mat: 1, lab: 1, equip: 1 } : get()._getLocationFactors();
    return (
      q *
      (nn(item.material) * loc.mat +
        nn(item.labor) * mult * loc.lab +
        nn(item.equipment) * loc.equip +
        nn(item.subcontractor))
    );
  },

  getTotals: () => {
    const { items, markup, markupOrder, customMarkups } = get();
    const mult = get()._getLaborMult();
    const globalLoc = get()._getLocationFactors();
    let material = 0,
      labor = 0,
      equipment = 0,
      sub = 0;
    items.forEach(it => {
      const q = nn(it.quantity);
      const loc = it.locationLocked ? { mat: 1, lab: 1, equip: 1 } : globalLoc;
      material += q * nn(it.material) * loc.mat;
      labor += q * nn(it.labor) * loc.lab;
      equipment += q * nn(it.equipment) * loc.equip;
      sub += q * nn(it.subcontractor);
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
      running += (base * pct) / 100;
    });

    let grand = running;

    // Tax and bond on post-markup
    grand *= 1 + nn(markup.tax) / 100;
    grand *= 1 + nn(markup.bond) / 100;

    // Custom markups
    customMarkups.forEach(cm => {
      if (cm.type === "pct") grand *= 1 + nn(cm.value) / 100;
      else grand += nn(cm.value);
    });

    return { material, labor, equipment, sub, direct, grand };
  },
}));
