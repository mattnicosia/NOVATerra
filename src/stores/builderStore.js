import { create } from 'zustand';
import { BUILDERS } from '@/constants/builders';

// Simple unique ID generator (matches uid() from format.js)
const _uid = () => Math.random().toString(36).slice(2, 10);

// Get default specs for a category
function getDefaultCatSpecs(cat) {
  const specs = {};
  (cat.specs || []).forEach(s => { specs[s.id] = s.default; });
  return specs;
}

// Initialize default specs from builder definition (excludes multi-instance category specs)
function getDefaultSpecs(builderId) {
  const builder = BUILDERS[builderId];
  if (!builder) return {};
  const specs = {};
  builder.categories.forEach(cat => {
    if (cat.multiInstance) return; // multi-instance specs live in categoryInstances
    (cat.specs || []).forEach(s => { specs[s.id] = s.default; });
  });
  return specs;
}

// Build default expansion state — all categories expanded by default
function getDefaultExpanded(builderId) {
  const builder = BUILDERS[builderId];
  if (!builder) return {};
  const expanded = {};
  builder.categories.forEach(cat => { expanded[cat.id] = true; });
  return expanded;
}

// Build default categoryInstances for multi-instance categories
function getDefaultCategoryInstances(builderId) {
  const builder = BUILDERS[builderId];
  if (!builder) return {};
  const catInst = {};
  builder.categories.forEach(cat => {
    if (!cat.multiInstance) return;
    catInst[cat.id] = [{
      id: _uid(),
      label: "Type A",
      specs: getDefaultCatSpecs(cat),
      itemTakeoffIds: {},
      itemStatus: {},
    }];
  });
  return catInst;
}

function ensureInstance(state, builderId) {
  if (state.builderInstances[builderId]) return state.builderInstances[builderId];
  return {
    specs: getDefaultSpecs(builderId),
    itemStatus: {},
    itemTakeoffIds: {},
    expandedCategories: getDefaultExpanded(builderId),
    categoryInstances: getDefaultCategoryInstances(builderId),
  };
}

export const useBuilderStore = create((set, get) => ({
  activeBuilder: null,
  builderInstances: {},

  setActiveBuilder: (id) => set(s => {
    // Ensure instance exists when activating
    if (id && !s.builderInstances[id]) {
      return {
        activeBuilder: id,
        builderInstances: { ...s.builderInstances, [id]: ensureInstance(s, id) },
      };
    }
    return { activeBuilder: id };
  }),

  setBuilderInstances: (v) => set({ builderInstances: v }),

  setSpec: (builderId, specId, value) => set(s => {
    const inst = ensureInstance(s, builderId);
    return {
      builderInstances: {
        ...s.builderInstances,
        [builderId]: { ...inst, specs: { ...inst.specs, [specId]: value } },
      },
    };
  }),

  setItemStatus: (builderId, itemId, status) => set(s => {
    const inst = ensureInstance(s, builderId);
    return {
      builderInstances: {
        ...s.builderInstances,
        [builderId]: { ...inst, itemStatus: { ...inst.itemStatus, [itemId]: status } },
      },
    };
  }),

  linkItemToTakeoff: (builderId, itemId, takeoffId) => set(s => {
    const inst = ensureInstance(s, builderId);
    return {
      builderInstances: {
        ...s.builderInstances,
        [builderId]: { ...inst, itemTakeoffIds: { ...inst.itemTakeoffIds, [itemId]: takeoffId } },
      },
    };
  }),

  toggleCategory: (builderId, catId) => set(s => {
    const inst = ensureInstance(s, builderId);
    const expanded = { ...inst.expandedCategories };
    expanded[catId] = !expanded[catId];
    return {
      builderInstances: {
        ...s.builderInstances,
        [builderId]: { ...inst, expandedCategories: expanded },
      },
    };
  }),

  // ── Multi-instance category actions ──────────────────────────

  addCategoryInstance: (builderId, catId) => set(s => {
    const inst = ensureInstance(s, builderId);
    const builder = BUILDERS[builderId];
    const cat = builder?.categories.find(c => c.id === catId);
    if (!cat?.multiInstance) return {};
    const existing = inst.categoryInstances?.[catId] || [];
    const letter = String.fromCharCode(65 + existing.length); // A, B, C...
    return {
      builderInstances: {
        ...s.builderInstances,
        [builderId]: {
          ...inst,
          categoryInstances: {
            ...inst.categoryInstances,
            [catId]: [...existing, {
              id: _uid(),
              label: `Type ${letter}`,
              specs: getDefaultCatSpecs(cat),
              itemTakeoffIds: {},
              itemStatus: {},
            }],
          },
        },
      },
    };
  }),

  removeCategoryInstance: (builderId, catId, instanceId) => set(s => {
    const inst = ensureInstance(s, builderId);
    const existing = inst.categoryInstances?.[catId] || [];
    if (existing.length <= 1) return {}; // must keep at least one
    return {
      builderInstances: {
        ...s.builderInstances,
        [builderId]: {
          ...inst,
          categoryInstances: {
            ...inst.categoryInstances,
            [catId]: existing.filter(ci => ci.id !== instanceId),
          },
        },
      },
    };
  }),

  renameCategoryInstance: (builderId, catId, instanceId, label) => set(s => {
    const inst = ensureInstance(s, builderId);
    const existing = inst.categoryInstances?.[catId] || [];
    return {
      builderInstances: {
        ...s.builderInstances,
        [builderId]: {
          ...inst,
          categoryInstances: {
            ...inst.categoryInstances,
            [catId]: existing.map(ci => ci.id === instanceId ? { ...ci, label } : ci),
          },
        },
      },
    };
  }),

  setCatInstanceSpec: (builderId, catId, instanceId, specId, value) => set(s => {
    const inst = ensureInstance(s, builderId);
    const existing = inst.categoryInstances?.[catId] || [];
    return {
      builderInstances: {
        ...s.builderInstances,
        [builderId]: {
          ...inst,
          categoryInstances: {
            ...inst.categoryInstances,
            [catId]: existing.map(ci => ci.id === instanceId
              ? { ...ci, specs: { ...ci.specs, [specId]: value } }
              : ci
            ),
          },
        },
      },
    };
  }),

  linkCatInstanceItem: (builderId, catId, instanceId, itemId, takeoffId) => set(s => {
    const inst = ensureInstance(s, builderId);
    const existing = inst.categoryInstances?.[catId] || [];
    return {
      builderInstances: {
        ...s.builderInstances,
        [builderId]: {
          ...inst,
          categoryInstances: {
            ...inst.categoryInstances,
            [catId]: existing.map(ci => ci.id === instanceId
              ? { ...ci, itemTakeoffIds: { ...ci.itemTakeoffIds, [itemId]: takeoffId } }
              : ci
            ),
          },
        },
      },
    };
  }),

  setCatInstanceItemStatus: (builderId, catId, instanceId, itemId, status) => set(s => {
    const inst = ensureInstance(s, builderId);
    const existing = inst.categoryInstances?.[catId] || [];
    return {
      builderInstances: {
        ...s.builderInstances,
        [builderId]: {
          ...inst,
          categoryInstances: {
            ...inst.categoryInstances,
            [catId]: existing.map(ci => ci.id === instanceId
              ? { ...ci, itemStatus: { ...ci.itemStatus, [itemId]: status } }
              : ci
            ),
          },
        },
      },
    };
  }),

  resetBuilder: (builderId) => set(s => ({
    builderInstances: {
      ...s.builderInstances,
      [builderId]: {
        specs: getDefaultSpecs(builderId),
        itemStatus: {},
        itemTakeoffIds: {},
        expandedCategories: getDefaultExpanded(builderId),
        categoryInstances: getDefaultCategoryInstances(builderId),
      },
    },
  })),
}));

// Migration: convert old flat data to categoryInstances format
export function migrateBuilderInstances(instances) {
  if (!instances) return {};
  const migrated = { ...instances };

  Object.entries(migrated).forEach(([builderId, inst]) => {
    if (inst.categoryInstances) return; // already migrated

    const builder = BUILDERS[builderId];
    if (!builder) return;

    const categoryInstances = {};
    let needsMigration = false;

    builder.categories.forEach(cat => {
      if (!cat.multiInstance) return;
      needsMigration = true;

      // Extract this category's specs from top-level
      const instanceSpecs = {};
      (cat.specs || []).forEach(s => {
        instanceSpecs[s.id] = inst.specs?.[s.id] !== undefined ? inst.specs[s.id] : s.default;
      });

      // Extract this category's itemTakeoffIds and itemStatus from top-level
      const instanceItemTakeoffIds = {};
      const instanceItemStatus = {};
      cat.items.forEach(item => {
        if (inst.itemTakeoffIds?.[item.id]) instanceItemTakeoffIds[item.id] = inst.itemTakeoffIds[item.id];
        if (inst.itemStatus?.[item.id]) instanceItemStatus[item.id] = inst.itemStatus[item.id];
      });

      categoryInstances[cat.id] = [{
        id: _uid(),
        label: "Type A",
        specs: instanceSpecs,
        itemTakeoffIds: instanceItemTakeoffIds,
        itemStatus: instanceItemStatus,
      }];
    });

    if (needsMigration) {
      // Remove migrated keys from top-level
      const cleanSpecs = { ...inst.specs };
      const cleanItemTakeoffIds = { ...inst.itemTakeoffIds };
      const cleanItemStatus = { ...inst.itemStatus };

      builder.categories.forEach(cat => {
        if (!cat.multiInstance) return;
        (cat.specs || []).forEach(s => delete cleanSpecs[s.id]);
        cat.items.forEach(item => {
          delete cleanItemTakeoffIds[item.id];
          delete cleanItemStatus[item.id];
        });
      });

      migrated[builderId] = {
        ...inst,
        specs: cleanSpecs,
        itemTakeoffIds: cleanItemTakeoffIds,
        itemStatus: cleanItemStatus,
        categoryInstances,
      };
    }
  });

  return migrated;
}
