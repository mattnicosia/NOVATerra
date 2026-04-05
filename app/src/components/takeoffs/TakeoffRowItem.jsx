// TakeoffRowItem — Single takeoff row with controls, action menus, color/stroke/fill, cost editing
// Extracted from TakeoffLeftPanel.jsx
import { useState, useRef, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, nInp, truncate } from "@/utils/styles";
import { uid, nn, fmt, fmt2 } from "@/utils/format";
import { unitToTool } from "@/hooks/useMeasurementEngine";
import TakeoffDimensionEngine from "@/components/takeoffs/TakeoffDimensionEngine";
import FormulaExpressionRow from "@/components/takeoffs/FormulaExpressionRow";
import { TO_COLORS } from "@/utils/takeoffHelpers";

export default function TakeoffRowItem({
  to,
  engageMeasuring,
  pauseMeasuring,
  stopMeasuring,
  removeMeasurement,
  computeMeasurementValue,
  getMeasuredQty,
  getComputedQty,
  startAutoCount,
  updateTakeoff,
  removeTakeoff,
  selectedDrawing,
  selectedDrawingId,
  measureFlashId,
  itemById,
  revisionAffectedIds,
  tkPanelTier,
  tkDragTakeoff,
  tkDragOverTakeoff,
  tkDragReorder,
}) {
  const C = useTheme();
  const T = C.T;

  const tkActiveTakeoffId = useDrawingPipelineStore(s => s.tkActiveTakeoffId);
  const tkSelectedTakeoffId = useDrawingPipelineStore(s => s.tkSelectedTakeoffId);
  const setTkSelectedTakeoffId = useDrawingPipelineStore(s => s.setTkSelectedTakeoffId);
  const tkMeasureState = useDrawingPipelineStore(s => s.tkMeasureState);
  const setTkMeasureState = useDrawingPipelineStore(s => s.setTkMeasureState);
  const tkShowVars = useDrawingPipelineStore(s => s.tkShowVars);
  const setTkShowVars = useDrawingPipelineStore(s => s.setTkShowVars);
  const tkTool = useDrawingPipelineStore(s => s.tkTool);
  const setTkTool = useDrawingPipelineStore(s => s.setTkTool);
  const setTkActivePoints = useDrawingPipelineStore(s => s.setTkActivePoints);
  const takeoffs = useDrawingPipelineStore(s => s.takeoffs);
  const setTakeoffs = useDrawingPipelineStore(s => s.setTakeoffs);
  const getItemTotal = useItemsStore(s => s.getItemTotal);

  const [costEditId, setCostEditId] = useState(null);
  const [actionMenuId, setActionMenuId] = useState(null);
  const [actionConfirm, setActionConfirm] = useState(null);
  const [actionMenuPos, setActionMenuPos] = useState(null);
  const actionMenuRef = useRef(null);

  // Close action menu on outside click
  useEffect(() => {
    if (!actionMenuId) return;
    const handler = e => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target)) {
        setActionMenuId(null);
        setActionConfirm(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [actionMenuId]);

  const isActive = tkActiveTakeoffId === to.id;
  const isSelected = tkSelectedTakeoffId === to.id || isActive;
  const isMeasuring = isActive && (tkMeasureState === "measuring" || tkMeasureState === "paused");
  const isPaused = isActive && tkMeasureState === "paused";
  const isRevisionAffected = revisionAffectedIds.has(to.id);
  const computedQty = getComputedQty(to);
  const measuredQty = getMeasuredQty(to);
  const hasMeasurements = (to.measurements || []).length > 0;
  const noScale = hasMeasurements && measuredQty === null && unitToTool(to.unit) !== "count";
  const hasFormula = !!(to.formula && to.formula.trim());
  const displayQty = hasMeasurements
    ? hasFormula && computedQty !== null
      ? computedQty
      : measuredQty !== null
        ? measuredQty
        : null
    : nn(to.quantity) || null;
  const ctrlBtnS = {
    width: 20,
    height: 20,
    border: "none",
    background: "transparent",
    borderRadius: 3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  };

  return (
