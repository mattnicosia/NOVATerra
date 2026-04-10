import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useItemsStore } from "@/stores/itemsStore";
import TakeoffRow from "@/components/takeoffs/TakeoffRow";

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
  const takeoffs = useDrawingPipelineStore(s => s.takeoffs);
  const setTakeoffs = useDrawingPipelineStore(s => s.setTakeoffs);
  const setTkTool = useDrawingPipelineStore(s => s.setTkTool);
  const setTkActivePoints = useDrawingPipelineStore(s => s.setTkActivePoints);
  const getItemTotal = useItemsStore(s => s.getItemTotal);

  const [costEditId, setCostEditId] = useState(null);
  const [actionMenuId, setActionMenuId] = useState(null);
  const [actionConfirm, setActionConfirm] = useState(null);
  const [actionMenuPos, setActionMenuPos] = useState(null);
  const actionMenuRef = useRef(null);

  useEffect(() => {
    if (!actionMenuId) return;
    const handleMouseDown = event => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target)) {
        setActionMenuId(null);
        setActionConfirm(null);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [actionMenuId]);

  return (
    <TakeoffRow
      to={to}
      C={C}
      T={T}
      tkActiveTakeoffId={tkActiveTakeoffId}
      tkSelectedTakeoffId={tkSelectedTakeoffId}
      setTkSelectedTakeoffId={setTkSelectedTakeoffId}
      tkMeasureState={tkMeasureState}
      setTkMeasureState={setTkMeasureState}
      tkShowVars={tkShowVars}
      setTkShowVars={setTkShowVars}
      tkPanelTier={tkPanelTier}
      costEditId={costEditId}
      setCostEditId={setCostEditId}
      actionMenuId={actionMenuId}
      setActionMenuId={setActionMenuId}
      actionConfirm={actionConfirm}
      setActionConfirm={setActionConfirm}
      actionMenuPos={actionMenuPos}
      setActionMenuPos={setActionMenuPos}
      actionMenuRef={actionMenuRef}
      measureFlashId={measureFlashId}
      itemById={itemById}
      revisionAffectedIds={revisionAffectedIds}
      selectedDrawing={selectedDrawing}
      selectedDrawingId={selectedDrawingId}
      updateTakeoff={updateTakeoff}
      removeTakeoff={removeTakeoff}
      engageMeasuring={engageMeasuring}
      stopMeasuring={stopMeasuring}
      pauseMeasuring={pauseMeasuring}
      removeMeasurement={removeMeasurement}
      computeMeasurementValue={computeMeasurementValue}
      getMeasuredQty={getMeasuredQty}
      getComputedQty={getComputedQty}
      startAutoCount={startAutoCount}
      getItemTotal={getItemTotal}
      tkDragTakeoff={tkDragTakeoff}
      tkDragOverTakeoff={tkDragOverTakeoff}
      tkDragReorder={tkDragReorder}
      takeoffs={takeoffs}
      setTakeoffs={setTakeoffs}
      setTkTool={setTkTool}
      setTkActivePoints={setTkActivePoints}
    />
  );
}
