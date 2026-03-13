import { create } from "zustand";
import { MODULES } from "@/constants/modules";

// Simple unique ID generator (matches uid() from format.js)
const _uid = () => Math.random().toString(36).slice(2, 10);

// Get default specs for a category
function getDefaultCatSpecs(cat) {
  const specs = {};
  (cat.specs || []).forEach(s => {
    specs[s.id] = s.default;
  });
  return specs;
}

// Initialize default specs from module definition (excludes multi-instance category specs)
function getDefaultSpecs(moduleId) {
  const mod = MODULES[moduleId];
  if (!mod) return {};
  const specs = {};
  mod.categories.forEach(cat => {
    if (cat.multiInstance) return; // multi-instance specs live in categoryInstances
    (cat.specs || []).forEach(s => {
      specs[s.id] = s.default;
    });
  });
  return specs;
}

// Build default expansion state — all categories collapsed by default,
// except derived-only categories (like Excavation) which start expanded
function getDefaultExpanded(moduleId) {
  const mod = MODULES[moduleId];
  if (!mod) return {};
  const expanded = {};
  mod.categories.forEach(cat => {
    expanded[cat.id] = cat.type === "derived-only"; // Excavation etc. start expanded
  });
  return expanded;
}

// Build default categoryInstances for multi-instance categories
function getDefaultCategoryInstances(moduleId) {
  const mod = MODULES[moduleId];
  if (!mod) return {};
  const catInst = {};
  mod.categories.forEach(cat => {
    if (!cat.multiInstance) return;
    catInst[cat.id] = [
      {
        id: _uid(),
        label: "",
        specs: getDefaultCatSpecs(cat),
        itemTakeoffIds: {},
        itemStatus: {},
      },
    ];
  });
  return catInst;
}

function ensureInstance(state, moduleId) {
  if (state.moduleInstances[moduleId]) return state.moduleInstances[moduleId];
  return {
    specs: getDefaultSpecs(moduleId),
    itemStatus: {},
    itemTakeoffIds: {},
    expandedCategories: getDefaultExpanded(moduleId),
    categoryInstances: getDefaultCategoryInstances(moduleId),
  };
}

export const useModuleStore = create((set, get) => ({
  activeModule: null,
  moduleInstances: {},

  setActiveModule: id =>
    set(s => {
      // Ensure instance exists when activating
      if (id && !s.moduleInstances[id]) {
        return {
          activeModule: id,
          moduleInstances: { ...s.moduleInstances, [id]: ensureInstance(s, id) },
        };
      }
      return { activeModule: id };
    }),

  setModuleInstances: v => set({ moduleInstances: v }),

  setSpec: (moduleId, specId, value) =>
    set(s => {
      const inst = ensureInstance(s, moduleId);
      return {
        moduleInstances: {
          ...s.moduleInstances,
          [moduleId]: { ...inst, specs: { ...inst.specs, [specId]: value } },
        },
      };
    }),

  setItemStatus: (moduleId, itemId, status) =>
    set(s => {
      const inst = ensureInstance(s, moduleId);
      return {
        moduleInstances: {
          ...s.moduleInstances,
          [moduleId]: { ...inst, itemStatus: { ...inst.itemStatus, [itemId]: status } },
        },
      };
    }),

  linkItemToTakeoff: (moduleId, itemId, takeoffId) =>
    set(s => {
      const inst = ensureInstance(s, moduleId);
      return {
        moduleInstances: {
          ...s.moduleInstances,
          [moduleId]: { ...inst, itemTakeoffIds: { ...inst.itemTakeoffIds, [itemId]: takeoffId } },
        },
      };
    }),

  toggleCategory: (moduleId, catId) =>
    set(s => {
      const inst = ensureInstance(s, moduleId);
      const expanded = { ...inst.expandedCategories };
      expanded[catId] = !expanded[catId];
      return {
        moduleInstances: {
          ...s.moduleInstances,
          [moduleId]: { ...inst, expandedCategories: expanded },
        },
      };
    }),

  // ── Multi-instance category actions ──────────────────────────

  addCategoryInstance: (moduleId, catId) =>
    set(s => {
      const inst = ensureInstance(s, moduleId);
      const mod = MODULES[moduleId];
      const cat = mod?.categories.find(c => c.id === catId);
      if (!cat?.multiInstance) return {};
      const existing = inst.categoryInstances?.[catId] || [];
      return {
        moduleInstances: {
          ...s.moduleInstances,
          [moduleId]: {
            ...inst,
            categoryInstances: {
              ...inst.categoryInstances,
              [catId]: [
                ...existing,
                {
                  id: _uid(),
                  label: "",
                  specs: getDefaultCatSpecs(cat),
                  itemTakeoffIds: {},
                  itemStatus: {},
                },
              ],
            },
          },
        },
      };
    }),

  removeCategoryInstance: (moduleId, catId, instanceId) =>
    set(s => {
      const inst = ensureInstance(s, moduleId);
      const existing = inst.categoryInstances?.[catId] || [];
      if (existing.length <= 1) return {}; // must keep at least one
      return {
        moduleInstances: {
          ...s.moduleInstances,
          [moduleId]: {
            ...inst,
            categoryInstances: {
              ...inst.categoryInstances,
              [catId]: existing.filter(ci => ci.id !== instanceId),
            },
          },
        },
      };
    }),

  renameCategoryInstance: (moduleId, catId, instanceId, label) =>
    set(s => {
      const inst = ensureInstance(s, moduleId);
      const existing = inst.categoryInstances?.[catId] || [];
      return {
        moduleInstances: {
          ...s.moduleInstances,
          [moduleId]: {
            ...inst,
            categoryInstances: {
              ...inst.categoryInstances,
              [catId]: existing.map(ci => (ci.id === instanceId ? { ...ci, label } : ci)),
            },
          },
        },
      };
    }),

  setCatInstanceSpec: (moduleId, catId, instanceId, specId, value) =>
    set(s => {
      const inst = ensureInstance(s, moduleId);
      const existing = inst.categoryInstances?.[catId] || [];
      return {
        moduleInstances: {
          ...s.moduleInstances,
          [moduleId]: {
            ...inst,
            categoryInstances: {
              ...inst.categoryInstances,
              [catId]: existing.map(ci =>
                ci.id === instanceId ? { ...ci, specs: { ...ci.specs, [specId]: value } } : ci,
              ),
            },
          },
        },
      };
    }),

  linkCatInstanceItem: (moduleId, catId, instanceId, itemId, takeoffId) =>
    set(s => {
      const inst = ensureInstance(s, moduleId);
      const existing = inst.categoryInstances?.[catId] || [];
      return {
        moduleInstances: {
          ...s.moduleInstances,
          [moduleId]: {
            ...inst,
            categoryInstances: {
              ...inst.categoryInstances,
              [catId]: existing.map(ci =>
                ci.id === instanceId ? { ...ci, itemTakeoffIds: { ...ci.itemTakeoffIds, [itemId]: takeoffId } } : ci,
              ),
            },
          },
        },
      };
    }),

  setCatInstanceItemStatus: (moduleId, catId, instanceId, itemId, status) =>
    set(s => {
      const inst = ensureInstance(s, moduleId);
      const existing = inst.categoryInstances?.[catId] || [];
      return {
        moduleInstances: {
          ...s.moduleInstances,
          [moduleId]: {
            ...inst,
            categoryInstances: {
              ...inst.categoryInstances,
              [catId]: existing.map(ci =>
                ci.id === instanceId ? { ...ci, itemStatus: { ...ci.itemStatus, [itemId]: status } } : ci,
              ),
            },
          },
        },
      };
    }),

  resetModule: moduleId =>
    set(s => ({
      moduleInstances: {
        ...s.moduleInstances,
        [moduleId]: {
          specs: getDefaultSpecs(moduleId),
          itemStatus: {},
          itemTakeoffIds: {},
          expandedCategories: getDefaultExpanded(moduleId),
          categoryInstances: getDefaultCategoryInstances(moduleId),
        },
      },
    })),

  // Remove module entirely (delete all state, deactivate)
  removeModule: moduleId =>
    set(s => {
      const next = { ...s.moduleInstances };
      delete next[moduleId];
      return {
        activeModule: s.activeModule === moduleId ? null : s.activeModule,
        moduleInstances: next,
      };
    }),

  // Collapse/expand all categories in a module
  collapseAllCategories: moduleId =>
    set(s => {
      const inst = ensureInstance(s, moduleId);
      const expanded = {};
      Object.keys(inst.expandedCategories).forEach(k => (expanded[k] = false));
      // Also set any un-tracked categories to false
      const mod = MODULES[moduleId];
      if (mod) mod.categories.forEach(c => (expanded[c.id] = false));
      return {
        moduleInstances: {
          ...s.moduleInstances,
          [moduleId]: { ...inst, expandedCategories: expanded },
        },
      };
    }),

  expandAllCategories: moduleId =>
    set(s => {
      const inst = ensureInstance(s, moduleId);
      const expanded = {};
      const mod = MODULES[moduleId];
      if (mod) mod.categories.forEach(c => (expanded[c.id] = true));
      return {
        moduleInstances: {
          ...s.moduleInstances,
          [moduleId]: { ...inst, expandedCategories: expanded },
        },
      };
    }),
}));

// Migration: convert old flat data to categoryInstances format
export function migrateModuleInstances(instances) {
  if (!instances) return {};
  const migrated = { ...instances };

  Object.entries(migrated).forEach(([moduleId, inst]) => {
    if (inst.categoryInstances) return; // already migrated

    const mod = MODULES[moduleId];
    if (!mod) return;

    const categoryInstances = {};
    let needsMigration = false;

    mod.categories.forEach(cat => {
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

      categoryInstances[cat.id] = [
        {
          id: _uid(),
          label: "",
          specs: instanceSpecs,
          itemTakeoffIds: instanceItemTakeoffIds,
          itemStatus: instanceItemStatus,
        },
      ];
    });

    if (needsMigration) {
      // Remove migrated keys from top-level
      const cleanSpecs = { ...inst.specs };
      const cleanItemTakeoffIds = { ...inst.itemTakeoffIds };
      const cleanItemStatus = { ...inst.itemStatus };

      mod.categories.forEach(cat => {
        if (!cat.multiInstance) return;
        (cat.specs || []).forEach(s => delete cleanSpecs[s.id]);
        cat.items.forEach(item => {
          delete cleanItemTakeoffIds[item.id];
          delete cleanItemStatus[item.id];
        });
      });

      migrated[moduleId] = {
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
