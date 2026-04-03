// DEPRECATED — consolidated into uiStore. Use useUiStore directly.
import { useUiStore } from "./uiStore";
export const useFieldStore = (selector) => useUiStore(s => {
  const mapped = {
    mode: s.fieldMode, transitionProgress: s.fieldTransitionProgress,
    transitionDirection: s.fieldTransitionDirection,
    hoveredNodeId: s.fieldHoveredNodeId, hoveredRingIdx: s.fieldHoveredRingIdx,
    selectedNodeId: s.fieldSelectedNodeId, tooltipData: s.fieldTooltipData,
    setMode: s.setFieldMode, setTransitionProgress: s.setFieldTransitionProgress,
    setTransitionDirection: s.setFieldTransitionDirection,
    setHoveredNode: s.setFieldHoveredNode, clearHover: s.clearFieldHover,
    setSelectedNode: s.setFieldSelectedNode, setTooltipData: s.setFieldTooltipData,
    toggleMode: s.toggleFieldMode,
  };
  return selector ? selector(mapped) : mapped;
});
