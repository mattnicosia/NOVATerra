import { create } from "zustand";
import { uid } from "@/utils/format";
import { SEED_ASSEMBLIES } from "@/constants/seedAssemblies";
import { MASTER_COST_DB, MASTER_COST_MAP, MASTER_IDS } from "@/constants/masterCostDb";

// ─── Merge Logic ──────────────────────────────────────────────
// Master items are the curated baseline.  User items can:
//   a) override a master item  (has masterItemId → replaces master item in output)
//   b) be standalone custom    (no masterItemId → appended to output)
// The `elements` state always holds the full resolved list so existing
// UI code continues to work without changes.
function mergeElements(userElements) {
  const overrides = new Map();
  userElements.forEach(el => {
    if (el.masterItemId) overrides.set(el.masterItemId, el);
  });

  // Master items: if override exists, use it; otherwise use master
  const resolved = MASTER_COST_DB.map(m => overrides.get(m.id) || m);

  // Append user-only items (custom items with no masterItemId)
  const userOnly = userElements.filter(el => !el.masterItemId);
  return [...resolved, ...userOnly];
}

export const useDatabaseStore = create((set, get) => ({
  // Full resolved elements: master items + user overrides + user custom items
  // This is the list all UI reads — same shape as before, so nothing breaks.
  elements: [...MASTER_COST_DB],

  dbExpandedDivs: new Set(),
  dbSelectedSub: null,
  dbSearch: "",
  dbZipCode: "",
  createDbItem: null,
  editDbItem: null,
  sendToDbModal: null,
  sendToDbCode: "",
  pickerForItemId: null,
  overwriteModal: null,

  // Assemblies
  assemblies: [...SEED_ASSEMBLIES],
  dbAssemblySearch: "",
  dbActiveTab: "items",

  // Custom trade bundle overrides: [{ key, label, sort, divisions }]
  customBundles: null,

  // ─── Getters ────────────────────────────────────────────────

  /** Get just user-created/modified elements (for persistence — excludes master items). */
  getUserElements: () => get().elements.filter(el => el.source !== "master"),

  /** Check if an element is a master item (not editable directly). */
  isMasterItem: id => {
    const el = get().elements.find(e => e.id === id);
    return el?.source === "master";
  },

  /** Check if a user override exists for a given master item ID. */
  hasOverride: masterId => get().elements.some(el => el.masterItemId === masterId),

  /** Get the source type for badge display: null (master), "override", or "custom". */
  getItemSource: id => {
    const el = get().elements.find(e => e.id === id);
    if (!el || el.source === "master") return null;
    return el.masterItemId ? "override" : "custom";
  },

  /** Get summary counts for override management view. */
  getOverrideSummary: () => {
    const userEls = get().elements.filter(e => e.source !== "master");
    return {
      overrideCount: userEls.filter(e => e.masterItemId).length,
      customCount: userEls.filter(e => !e.masterItemId).length,
    };
  },

  /** Get the master version of an overridden item. */
  getMasterVersion: masterItemId => MASTER_COST_MAP.get(masterItemId) || null,

  // ─── Setters ────────────────────────────────────────────────

  setElements: v => set({ elements: v }),
  setDbExpandedDivs: v => set({ dbExpandedDivs: v }),
  setDbSelectedSub: v => set({ dbSelectedSub: v }),
  setDbSearch: v => set({ dbSearch: v }),
  setDbZipCode: v => set({ dbZipCode: v }),
  setCreateDbItem: v => set({ createDbItem: v }),
  setEditDbItem: v => set({ editDbItem: v }),
  setSendToDbModal: v => set({ sendToDbModal: v }),
  setSendToDbCode: v => set({ sendToDbCode: v }),
  setPickerForItemId: v => set({ pickerForItemId: v }),
  setOverwriteModal: v => set({ overwriteModal: v }),

  setAssemblies: v => set({ assemblies: v }),
  setDbAssemblySearch: v => set({ dbAssemblySearch: v }),
  setDbActiveTab: v => set({ dbActiveTab: v }),
  setCustomBundles: v => set({ customBundles: v }),

  // ─── Master / Override Operations ──────────────────────────

  /**
   * Load user elements from saved estimate data and merge with master.
   * Handles migration from old format (elements without source field).
   */
  loadUserElements: savedElements => {
    if (!savedElements || savedElements.length === 0) {
      set({ elements: [...MASTER_COST_DB] });
      return;
    }

    // Migration: tag elements from old saves that lack a source field
    const migrated = savedElements
      .map(el => {
        if (el.source) return el; // Already tagged — keep as-is

        // Check if this matches a master item by ID
        if (MASTER_IDS.has(el.id)) {
          const master = MASTER_COST_MAP.get(el.id);
          // Check if rates are identical to master (unmodified seed item)
          const identical =
            master &&
            Number(master.material) === Number(el.material) &&
            Number(master.labor) === Number(el.labor) &&
            Number(master.equipment) === Number(el.equipment) &&
            master.name === el.name &&
            master.unit === el.unit;
          if (identical) return null; // Discard — master version will be used

          // Modified → convert to user override
          return {
            ...el,
            id: uid(), // New ID so it doesn't collide with master
            source: "user",
            masterItemId: master.id,
            pricingBasis: "national_avg",
            updatedAt: new Date().toISOString(),
          };
        }

        // Not a master item → user-created
        return { ...el, source: "user" };
      })
      .filter(Boolean);

    set({ elements: mergeElements(migrated) });
  },

  /** Reset elements to master-only (new estimate / clear user data). */
  resetToMaster: () => {
    set({ elements: [...MASTER_COST_DB] });
  },

  /**
   * Create a user override for a master item.
   * Copies the master item with user's changes and replaces it in the list.
   */
  createOverride: (masterId, changes) => {
    const master = MASTER_COST_MAP.get(masterId);
    if (!master) return null;
    const overrideId = uid();
    const override = {
      ...master,
      ...changes,
      id: overrideId,
      source: "user",
      masterItemId: masterId,
      pricingBasis: "national_avg",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set(s => ({
      elements: s.elements.map(el => (el.id === masterId ? override : el)),
    }));
    return overrideId;
  },

  /**
   * Revert a user override back to the master version.
   * Removes the override and restores the master item in its place.
   */
  revertOverride: overrideId => {
    const el = get().elements.find(e => e.id === overrideId);
    if (!el || !el.masterItemId) return;
    const master = MASTER_COST_MAP.get(el.masterItemId);
    if (!master) return;
    set(s => ({
      elements: s.elements.map(e => (e.id === overrideId ? master : e)),
    }));
  },

  // ─── CRUD (smart — respects master/user boundary) ─────────

  /**
   * Add a new user element (custom item or sub proposal import).
   * Always tagged as source: "user" (or "imported").
   */
  addElement: el =>
    set(s => ({
      elements: [
        ...s.elements,
        {
          id: uid(),
          source: el.source || "user",
          pricingBasis: el.pricingBasis || "national_avg",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...el,
        },
      ],
    })),

  /**
   * Update an element field.
   * If the target is a master item, auto-creates a user override instead.
   */
  updateElement: (id, field, value) => {
    const el = get().elements.find(e => e.id === id);
    if (!el) return;

    if (el.source === "master") {
      // Can't edit master directly — auto-create override with the change
      get().createOverride(id, { [field]: value });
      return;
    }

    set(s => ({
      elements: s.elements.map(e => (e.id === id ? { ...e, [field]: value, updatedAt: new Date().toISOString() } : e)),
    }));
  },

  /**
   * Remove an element.
   * Master items cannot be removed.
   * Removing a user override reverts to the master version.
   */
  removeElement: id => {
    const el = get().elements.find(e => e.id === id);
    if (!el) return;

    // Master items cannot be deleted
    if (el.source === "master") return;

    // If it's an override of a master item → revert to master
    if (el.masterItemId) {
      get().revertOverride(id);
      return;
    }

    // User-created item → remove entirely
    set(s => ({
      elements: s.elements.filter(e => e.id !== id),
    }));
  },

  /**
   * Duplicate an element.
   * Always creates a user-owned copy regardless of source.
   */
  duplicateElement: id =>
    set(s => {
      const idx = s.elements.findIndex(e => e.id === id);
      if (idx === -1) return s;
      const original = s.elements[idx];
      const copy = {
        ...original,
        id: uid(),
        source: "user",
        masterItemId: null, // Duplicate is independent, not an override
        specVariants: [...(original.specVariants || [])],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const next = [...s.elements];
      next.splice(idx + 1, 0, copy);
      return { elements: next };
    }),

  /**
   * Clear all USER elements.  Master items are always preserved.
   * Used by "Clear All" button in CostDatabasePage.
   */
  clearUserElements: () => {
    set({ elements: [...MASTER_COST_DB] });
  },

  // ─── Assembly operations (unchanged) ──────────────────────

  addAssembly: asm =>
    set(s => ({
      assemblies: [...s.assemblies, { id: uid(), ...asm }],
    })),

  updateAssembly: (id, field, value) =>
    set(s => ({
      assemblies: s.assemblies.map(a => (a.id === id ? { ...a, [field]: value } : a)),
    })),

  removeAssembly: id =>
    set(s => ({
      assemblies: s.assemblies.filter(a => a.id !== id),
    })),

  toggleDbDiv: dc =>
    set(s => {
      const next = new Set(s.dbExpandedDivs);
      next.has(dc) ? next.delete(dc) : next.add(dc);
      return { dbExpandedDivs: next };
    }),
}));
