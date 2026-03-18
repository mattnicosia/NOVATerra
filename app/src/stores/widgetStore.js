import { create } from "zustand";
import { uid } from "@/utils/format";
import { WIDGET_REGISTRY, computePresetSize } from "@/constants/widgetRegistry";

/* ────────────────────────────────────────────────────────
   widgetStore — layout state for the widget dashboard
   ──────────────────────────────────────────────────────── */

const DEFAULT_LAYOUT = [
  // Left column (cols 0-2)
  { i: "w-projects", x: 0, y: 0, w: 3, h: 8, widgetType: "projects", config: {} },
  // Center column (cols 3-8)
  { i: "w-nova-orb", x: 3, y: 0, w: 6, h: 5, widgetType: "nova-orb", config: {} },
  { i: "w-estimate", x: 3, y: 5, w: 6, h: 4, widgetType: "estimate", config: {} },
  { i: "w-cost", x: 3, y: 9, w: 6, h: 4, widgetType: "cost-breakdown", config: {} },
  { i: "w-calendar", x: 3, y: 13, w: 6, h: 8, widgetType: "calendar", config: {} },
  // Right column (cols 9-11)
  { i: "w-intel", x: 9, y: 0, w: 3, h: 6, widgetType: "market-intel", config: {} },
  { i: "w-benchmarks", x: 9, y: 6, w: 3, h: 4, widgetType: "benchmarks", config: {} },
  { i: "w-feed", x: 9, y: 10, w: 3, h: 6, widgetType: "live-feed", config: {} },
];

export const useWidgetStore = create((set, _get) => ({
  layouts: { lg: DEFAULT_LAYOUT },
  editMode: false,
  movingWidgetId: null,
  activeMenuId: null,

  setLayouts: layouts => set({ layouts }),
  setEditMode: v => set({ editMode: v }),
  toggleEditMode: () => set(s => ({ editMode: !s.editMode })),

  setMovingWidget: id => set({ movingWidgetId: id, activeMenuId: null }),
  clearMovingWidget: () => set({ movingWidgetId: null }),
  setActiveMenu: id => set(s => ({ activeMenuId: s.activeMenuId === id ? null : id })),
  clearActiveMenu: () => set({ activeMenuId: null }),

  resizeWidget: (id, preset) => {
    set(s => {
      const result = {};
      for (const [bp, items] of Object.entries(s.layouts)) {
        result[bp] = items.map(item => {
          if (item.i !== id) return item;
          const reg = WIDGET_REGISTRY[item.widgetType] || {};
          const { w, h } = computePresetSize(preset, reg);
          return { ...item, w, h };
        });
      }
      return { layouts: result, activeMenuId: null };
    });
  },

  addWidget: (widgetType, config = {}) => {
    const reg = WIDGET_REGISTRY[widgetType];
    if (!reg) return;
    const item = {
      i: `w-${uid()}`,
      x: 0,
      y: Infinity,
      w: reg.defaultW || 6,
      h: reg.defaultH || 4,
      widgetType,
      config,
    };
    set(s => ({
      layouts: {
        ...s.layouts,
        lg: [...(s.layouts.lg || []), item],
      },
    }));
  },

  removeWidget: id => {
    set(s => {
      const result = {};
      for (const [bp, items] of Object.entries(s.layouts)) {
        result[bp] = items.filter(item => item.i !== id);
      }
      return { layouts: result };
    });
  },

  replaceWidget: (id, newWidgetType, config = {}) => {
    set(s => {
      const result = {};
      for (const [bp, items] of Object.entries(s.layouts)) {
        result[bp] = items.map(item => (item.i === id ? { ...item, widgetType: newWidgetType, config } : item));
      }
      return { layouts: result };
    });
  },

  updateWidgetConfig: (id, config) => {
    set(s => {
      const result = {};
      for (const [bp, items] of Object.entries(s.layouts)) {
        result[bp] = items.map(item => (item.i === id ? { ...item, config: { ...item.config, ...config } } : item));
      }
      return { layouts: result };
    });
  },

  resetToDefault: () => set({ layouts: { lg: DEFAULT_LAYOUT } }),
}));

export { DEFAULT_LAYOUT };
