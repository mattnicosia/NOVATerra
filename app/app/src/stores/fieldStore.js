import { create } from "zustand";

export const useFieldStore = create(set => ({
  // View sub-mode within the Field view
  mode: "field", // "field" | "plan" | "transitioning"

  // Transition animation state
  transitionProgress: 0, // 0–1 during animation
  transitionDirection: null, // "to-plan" | "to-field"

  // Hover/selection state
  hoveredNodeId: null,
  hoveredRingIdx: null,
  selectedNodeId: null,

  // Tooltip
  tooltipData: null, // { x, y, label, hours, bidDue, status } or null

  // Actions
  setMode: v => set({ mode: v }),
  setTransitionProgress: v => set({ transitionProgress: v }),
  setTransitionDirection: v => set({ transitionDirection: v }),
  setHoveredNode: (nodeId, ringIdx) => set({ hoveredNodeId: nodeId, hoveredRingIdx: ringIdx }),
  clearHover: () => set({ hoveredNodeId: null, hoveredRingIdx: null, tooltipData: null }),
  setSelectedNode: v => set({ selectedNodeId: v }),
  setTooltipData: v => set({ tooltipData: v }),
  toggleMode: () =>
    set(s => ({
      mode: s.mode === "field" ? "plan" : "field",
    })),
}));
