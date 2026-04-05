import { useState, useRef, useCallback, useMemo, useEffect, lazy, Suspense } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import useMeasurementEngine from "@/hooks/useMeasurementEngine";
import useTakeoffCRUD from "@/hooks/useTakeoffCRUD";
import useTakeoffCanvasHandlers from "@/hooks/useTakeoffCanvasHandlers";
import useTakeoffAnalysis from "@/hooks/useTakeoffAnalysis";
import useTakeoffPredictions from "@/hooks/useTakeoffPredictions";
import useTakeoffCanvasRendering from "@/hooks/useTakeoffCanvasRendering";
import useTakeoffActions from "@/hooks/useTakeoffActions";
import useTakeoffEffects from "@/hooks/useTakeoffEffects";
import { nn } from "@/utils/format";
import { useModuleStore } from "@/stores/moduleStore";
import { MODULES } from "@/constants/modules";
import RevisionImpactCard from "@/components/takeoffs/RevisionImpactCard";
import TakeoffControlRail from "@/components/takeoffs/TakeoffControlRail";
import TakeoffLeftPanel from "@/components/takeoffs/TakeoffLeftPanel";
import TakeoffDrawingViewer from "@/components/takeoffs/TakeoffDrawingViewer";
import TakeoffCommandPalette from "@/components/takeoffs/TakeoffCommandPalette";
const ItemDetailPanel = lazy(() => import("@/components/estimate/ItemDetailPanel"));

const RAIL_W = 36; // px — navigation rail width

export default function TakeoffsPage() {
  const C = useTheme();
  const T = C.T;
  const showToast = useUiStore(s => s.showToast);
  const activeGroupId = useUiStore(s => s.activeGroupId);
  const revisionImpact = useUiStore(s => s.revisionImpact);
  const dismissRevisionImpact = useUiStore(s => s.dismissRevisionImpact);
  const project = useProjectStore(s => s.project);
  const items = useItemsStore(s => s.items);
  const elements = useDatabaseStore(s => s.elements);
  const assemblies = useDatabaseStore(s => s.assemblies);

  // Drawings store
  const drawings = useDrawingPipelineStore(s => s.drawings);
  const selectedDrawingId = useDrawingPipelineStore(s => s.selectedDrawingId);
  const setSelectedDrawingId = useDrawingPipelineStore(s => s.setSelectedDrawingId);
  const pdfCanvases = useDrawingPipelineStore(s => s.pdfCanvases);
  const drawingScales = useDrawingPipelineStore(s => s.drawingScales);
  const drawingDpi = useDrawingPipelineStore(s => s.drawingDpi);
  const buildSheetIndex = useDrawingPipelineStore(s => s.buildSheetIndex);

  // Takeoffs store
  const takeoffs = useDrawingPipelineStore(s => s.takeoffs);
  const setTakeoffs = useDrawingPipelineStore(s => s.setTakeoffs);
  const tkTool = useDrawingPipelineStore(s => s.tkTool);
  const setTkTool = useDrawingPipelineStore(s => s.setTkTool);
  const tkActivePoints = useDrawingPipelineStore(s => s.tkActivePoints);
  const tkActiveTakeoffId = useDrawingPipelineStore(s => s.tkActiveTakeoffId);
  const tkSelectedTakeoffId = useDrawingPipelineStore(s => s.tkSelectedTakeoffId);
  const setTkSelectedTakeoffId = useDrawingPipelineStore(s => s.setTkSelectedTakeoffId);
  const tkMeasureState = useDrawingPipelineStore(s => s.tkMeasureState);
  const tkCursorPt = useDrawingPipelineStore(s => s.tkCursorPt);
  const tkCalibrations = useDrawingPipelineStore(s => s.tkCalibrations);
  const tkNewInput = useDrawingPipelineStore(s => s.tkNewInput);
  const tkVisibility = useDrawingPipelineStore(s => s.tkVisibility);
  const setTkVisibility = useDrawingPipelineStore(s => s.setTkVisibility);
  const tkPanelTier = useDrawingPipelineStore(s => s.tkPanelTier);

  const activeModule = useModuleStore(s => s.activeModule);
  const setActiveModule = useModuleStore(s => s.setActiveModule);
  const moduleInstances = useModuleStore(s => s.moduleInstances);
  const lastModuleRef = useRef(null);

  // Restore activeModule from sessionStorage on mount
  useEffect(() => {
    const savedModule = sessionStorage.getItem("bldg-activeModule");
    if (savedModule && savedModule !== "null") {
      useModuleStore.getState().setActiveModule(savedModule);
      lastModuleRef.current = savedModule;
    }
  }, []);
  useEffect(() => {
    sessionStorage.setItem("bldg-activeModule", activeModule || "");
    if (activeModule) lastModuleRef.current = activeModule;
  }, [activeModule]);

  // Build sheet index when drawings change
  useEffect(() => {
    buildSheetIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings.length]);

  // Detail overlay & reference detection
  const [detailOverlayId, setDetailOverlayId] = useState(null);
  const [refPopover, setRefPopover] = useState(null);

  // Measurement engine
  const {
    realToPx,
    getDisplayUnit,
    hasScale,
    calcPolylineLength,
    calcPolygonArea,
    computeMeasurementValue,
    getMeasuredQty,
    getComputedQty,
  } = useMeasurementEngine();

  // Takeoff CRUD
  const { updateTakeoff, removeTakeoff, addTakeoff, addTakeoffFromDb, addTakeoffFreeform, insertAssemblyIntoTakeoffs } =
    useTakeoffCRUD();

  // Refs
  const drawingContainerRef = useRef(null);
  const drawingImgRef = useRef(null);
  const canvasRef = useRef(null);
  const tkPanning = useRef(false);
  const tkPanStart = useRef({ x: 0, y: 0, panX: 0, panY: 0, moved: false });
  const tkLastWheelX = useRef(0);
  const compactStripRef = useRef(null);
  const shiftHeldRef = useRef(false);
  const rafCursorRef = useRef(null);
  const pendingCursorRef = useRef(null);
  const cursorCanvasRef = useRef(null);
  const tkTransformRef = useRef(null);
  const predScanGenRef = useRef(0);
  const predScanKeyRef = useRef("");
  const snapAngleOnRef = useRef(false);

  // Prediction effects
  const { predictionCanvasRef } = useTakeoffPredictions({ canvasRef });

  // Snap angle toggle
  const [snapAngleOn, setSnapAngleOn] = useState(() => sessionStorage.getItem("bldg-snapAngle") === "true");
  const [checkDimMode, setCheckDimMode] = useState(false);
  const checkDimRef = useRef(false);
  const [showMeasureLabels, setShowMeasureLabels] = useState(
    () => sessionStorage.getItem("bldg-showLabels") !== "false",
  );
  useEffect(() => {
    snapAngleOnRef.current = snapAngleOn;
    sessionStorage.setItem("bldg-snapAngle", snapAngleOn);
  }, [snapAngleOn]);
  useEffect(() => { checkDimRef.current = checkDimMode; }, [checkDimMode]);
  useEffect(() => { sessionStorage.setItem("bldg-showLabels", showMeasureLabels); }, [showMeasureLabels]);

  // Cleanup RAF cursor on unmount
  useEffect(() => () => { if (rafCursorRef.current) cancelAnimationFrame(rafCursorRef.current); }, []);

  // Track Shift key
  useEffect(() => {
    const onKey = e => { shiftHeldRef.current = e.shiftKey; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
  }, []);

  // Page filter + left panel tab + panel mode
  const [pageFilter, setPageFilter] = useState(() => sessionStorage.getItem("bldg-pageFilter") || "all");
  const [leftPanelTab, setLeftPanelTab] = useState("estimate");
  const [tkPanelMode, _setTkPanelMode] = useState("open");
  useEffect(() => { sessionStorage.setItem("bldg-pageFilter", pageFilter); }, [pageFilter]);

  // Restore/persist tkVisibility
  useEffect(() => {
    const savedVis = sessionStorage.getItem("bldg-tkVisibility");
    if (savedVis && ["all", "page", "active"].includes(savedVis)) {
      useDrawingPipelineStore.getState().setTkVisibility(savedVis);
    }
  }, []);
  useEffect(() => { sessionStorage.setItem("bldg-tkVisibility", tkVisibility); }, [tkVisibility]);

  // Restore panel width/tier
  useEffect(() => {
    const savedW = sessionStorage.getItem("bldg-tkPanelWidth");
    const savedTier = sessionStorage.getItem("bldg-tkPanelTier");
    if (savedW) {
      const w = Number(savedW);
      if (w >= 280 && w <= 1000) useDrawingPipelineStore.getState().setTkPanelWidth(w);
    }
    if (savedTier && ["compact", "standard", "full", "estimate"].includes(savedTier)) {
      useDrawingPipelineStore.getState().setTkPanelTier(savedTier);
      if (savedTier === "estimate") useDrawingPipelineStore.getState().setTkPanelOpen(false);
    }
  }, []);

  // Measurement micro-feedback
  const [measureFlashId, setMeasureFlashId] = useState(null);
  const measureFlashTimer = useRef(null);
  const triggerMeasureFlash = useCallback(toId => {
    setMeasureFlashId(toId);
    if (measureFlashTimer.current) clearTimeout(measureFlashTimer.current);
    measureFlashTimer.current = setTimeout(() => setMeasureFlashId(null), 600);
  }, []);

  // Cost edit popover + selected item
  const [costEditId, setCostEditId] = useState(null);
  const [estSelectedItemId, setEstSelectedItemId] = useState(null);

  // Takeoff Command Palette
  const [tkCmdOpen, setTkCmdOpen] = useState(false);

  // Cross-sheet scan
  const [crossSheetScan, setCrossSheetScan] = useState(null);

  // Cmd+K handler
  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setTkCmdOpen(v => !v);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  // ─── Derived values ───
  const revisionAffectedIds = useMemo(() => {
    if (!revisionImpact?.sheets) return new Set();
    return new Set(revisionImpact.sheets.flatMap(s => s.affectedTakeoffs.map(t => t.id)));
  }, [revisionImpact]);
  const selectedDrawing = useMemo(() => drawings.find(d => d.id === selectedDrawingId), [drawings, selectedDrawingId]);
  const filteredTakeoffs = useMemo(() => {
    const byGroup = takeoffs.filter(t => (t.bidContext || "base") === activeGroupId);
    if (pageFilter === "all") return byGroup;
    if (!selectedDrawingId) return byGroup;
    return byGroup.filter(t => (t.measurements || []).some(m => m.sheetId === selectedDrawingId));
  }, [takeoffs, pageFilter, selectedDrawingId, activeGroupId]);
  const takeoffGroups = useMemo(() => {
    const g = {};
    filteredTakeoffs.forEach(t => {
      const k = t.group || "Ungrouped";
      if (!g[k]) g[k] = [];
      g[k].push(t);
    });
    return g;
  }, [filteredTakeoffs]);

  // Module render widths
  const moduleRenderWidths = useMemo(() => {
    const map = {};
    const addItem = (item, specs, itemTakeoffIds) => {
      if (!item.renderWidth) return;
      const toId = itemTakeoffIds?.[item.id];
      if (!toId) return;
      if (!takeoffs.some(t => t.id === toId)) return;
      let rawVal = specs?.[item.renderWidth.spec];
      if (!rawVal && item.renderWidth.altSpec) rawVal = specs?.[item.renderWidth.altSpec];
      const specVal = item.renderWidth.specMap ? item.renderWidth.specMap[rawVal] || 0 : nn(rawVal);
      const rawH = item.renderWidth.specHeight ? specs?.[item.renderWidth.specHeight] : null;
      const specH =
        rawH !== null ? (item.renderWidth.specMap ? item.renderWidth.specMap[rawH] || specVal : nn(rawH)) : specVal;
      if (specVal > 0) {
        map[toId] = { inches: specVal, inchesH: specH || specVal, tool: item.tool };
      }
    };
    Object.entries(moduleInstances).forEach(([moduleId, inst]) => {
      const moduleDef = MODULES[moduleId];
      if (!moduleDef) return;
      moduleDef.categories.forEach(cat => {
        if (cat.multiInstance) {
          const catInstances = inst.categoryInstances?.[cat.id] || [];
          catInstances.forEach(catInst => {
            cat.items.forEach(item => addItem(item, catInst.specs, catInst.itemTakeoffIds));
          });
        } else {
          cat.items.forEach(item => addItem(item, inst.specs, inst.itemTakeoffIds));
        }
      });
    });
    return map;
  }, [moduleInstances, takeoffs]);

  // Memoized item lookup
  const itemById = useMemo(() => {
    const map = {};
    items.forEach(i => { map[i.id] = i; });
    return map;
  }, [items]);

  // ─── EXTRACTED HOOKS ───

  // Actions: AI add, measurement lifecycle, PDF rendering, scan references, etc.
  const {
    addMeasurement,
    removeMeasurement,
    addTakeoffFromAI,
    insertAIGroupIntoTakeoffs,
    addTakeoffFromAIAsSingle,
    engageMeasuring,
    stopMeasuring,
    pauseMeasuring,
    startAutoCount,
    finishCalibration,
    handleOutlineClick,
    tkDragTakeoff,
    tkDragOverTakeoff,
    tkDragReorder,
    renderPdfPage,
    handleSelectDrawing,
    handleScanReferences,
    handlePdfRepairDrop,
    snapAngle,
  } = useTakeoffActions({
    canvasRef,
    snapAngleOnRef,
    hasScale,
    addTakeoff,
    updateTakeoff,
    triggerMeasureFlash,
    tkPanelMode,
  });

  // AI Analysis
  const {
    aiDrawingAnalysis, setAiDrawingAnalysis,
    wallSchedule, setWallSchedule,
    pdfSchedules, setPdfSchedules,
    geoAnalysis, setGeoAnalysis,
    runDrawingAnalysis,
    acceptDrawingItem, acceptAllDrawingItems, aiToCanvasCoords,
    runWallScheduleDetection, createWallInstances,
    runPdfScheduleScan,
    runGeometryAnalysis,
  } = useTakeoffAnalysis({ addTakeoff, updateTakeoff, addMeasurement, canvasRef });

  // Canvas interaction handlers
  const { handleCanvasClick, handleDrawingWheel, handleDrawingMouseDown } = useTakeoffCanvasHandlers({
    canvasRef,
    drawingContainerRef,
    tkTransformRef,
    tkLastWheelX,
    tkPanning,
    tkPanStart,
    snapAngleOnRef,
    addMeasurement,
    updateTakeoff,
    pauseMeasuring,
    setCrossSheetScan,
    snapAngle,
    hasScale,
    calcPolylineLength,
    calcPolygonArea,
    getDisplayUnit,
  });

  // Canvas rendering (static + overlay)
  useTakeoffCanvasRendering({
    canvasRef,
    cursorCanvasRef,
    C,
    takeoffs,
    filteredTakeoffs,
    pageFilter,
    selectedDrawingId,
    tkSelectedTakeoffId,
    tkActiveTakeoffId,
    tkActivePoints,
    tkCursorPt,
    tkTool,
    tkCalibrations,
    tkVisibility,
    moduleRenderWidths,
    drawingScales,
    drawingDpi,
    geoAnalysis,
    activeModule,
    aiDrawingAnalysis,
    showMeasureLabels,
    shiftHeldRef,
    snapAngleOnRef,
    realToPx,
    hasScale,
    calcPolylineLength,
    calcPolygonArea,
    getDisplayUnit,
  });

  // Side effects: keyboard, predictions, pan, DB search, auto-select drawing, etc.
  useTakeoffEffects({
    drawingContainerRef,
    tkPanning,
    tkPanStart,
    compactStripRef,
    canvasRef,
    predScanGenRef,
    predScanKeyRef,
    handleDrawingWheel,
    stopMeasuring,
    engageMeasuring,
    renderPdfPage,
    setCrossSheetScan,
    tkTool,
    tkMeasureState,
    tkSelectedTakeoffId,
    tkNewInput,
    elements,
    assemblies,
    tkActiveTakeoffId,
    selectedDrawingId,
    drawings,
    pdfCanvases,
    setGeoAnalysis,
  });

  // ─── RENDER ─────────────────────────

  return (
    <div style={{ display: "flex", gap: 0, height: "calc(100vh - 120px)", position: "relative" }}>
      {/* ── Revision Impact Card ── */}
      <RevisionImpactCard
        revisionImpact={revisionImpact}
        onDismiss={dismissRevisionImpact}
        onReviewSheet={newId => {
          setSelectedDrawingId(newId);
          dismissRevisionImpact();
        }}
      />
      {/* ── Vertical Control Rail ── */}
      <TakeoffControlRail
        checkDimMode={checkDimMode}
        setCheckDimMode={setCheckDimMode}
        snapAngleOn={snapAngleOn}
        setSnapAngleOn={setSnapAngleOn}
        showMeasureLabels={showMeasureLabels}
        setShowMeasureLabels={setShowMeasureLabels}
      />

      {/* LEFT PANEL */}
      <TakeoffLeftPanel
        crud={{
          addTakeoff,
          updateTakeoff,
          removeTakeoff,
          addTakeoffFreeform,
          addTakeoffFromDb,
          insertAssemblyIntoTakeoffs,
          addTakeoffFromAI,
          insertAIGroupIntoTakeoffs,
          addTakeoffFromAIAsSingle,
        }}
        measurement={{
          engageMeasuring,
          stopMeasuring,
          pauseMeasuring,
          removeMeasurement,
          hasScale,
          computeMeasurementValue,
          getMeasuredQty,
          getComputedQty,
          startAutoCount,
        }}
        analysis={{
          aiDrawingAnalysis,
          pdfSchedules,
          runDrawingAnalysis,
          runWallScheduleDetection,
          runPdfScheduleScan,
          wallScheduleLoading: wallSchedule.loading,
        }}
        pageFilter={pageFilter}
        setPageFilter={setPageFilter}
        leftPanelTab={leftPanelTab}
        setLeftPanelTab={setLeftPanelTab}
        crossSheetScan={crossSheetScan}
        setCrossSheetScan={setCrossSheetScan}
        estSelectedItemId={estSelectedItemId}
        setEstSelectedItemId={setEstSelectedItemId}
        measureFlashId={measureFlashId}
        itemById={itemById}
        revisionAffectedIds={revisionAffectedIds}
        filteredTakeoffs={filteredTakeoffs}
        takeoffGroups={takeoffGroups}
        tkDragTakeoff={tkDragTakeoff}
        tkDragOverTakeoff={tkDragOverTakeoff}
        tkDragReorder={tkDragReorder}
      />

      {/* Item Detail Panel */}
      {estSelectedItemId && tkPanelTier === "full" && (
        <Suspense fallback={null}>
          <ItemDetailPanel
            itemId={estSelectedItemId}
            onClose={() => setEstSelectedItemId(null)}
            onNavigate={dir => {
              const currentItems = useItemsStore.getState().items;
              const idx = currentItems.findIndex(i => i.id === estSelectedItemId);
              if (idx === -1) return;
              const nextIdx = idx + dir;
              if (nextIdx >= 0 && nextIdx < currentItems.length) setEstSelectedItemId(currentItems[nextIdx].id);
            }}
          />
        </Suspense>
      )}

      {/* DRAWING VIEWER */}
      <TakeoffDrawingViewer
        canvasRef={canvasRef}
        cursorCanvasRef={cursorCanvasRef}
        drawingContainerRef={drawingContainerRef}
        predictionCanvasRef={predictionCanvasRef}
        drawingImgRef={drawingImgRef}
        tkTransformRef={tkTransformRef}
        compactStripRef={compactStripRef}
        shiftHeldRef={shiftHeldRef}
        rafCursorRef={rafCursorRef}
        pendingCursorRef={pendingCursorRef}
        snapAngleOnRef={snapAngleOnRef}
        handleCanvasClick={handleCanvasClick}
        handleDrawingWheel={handleDrawingWheel}
        handleDrawingMouseDown={handleDrawingMouseDown}
        renderPdfPage={renderPdfPage}
        handleSelectDrawing={handleSelectDrawing}
        handleScanReferences={handleScanReferences}
        handlePdfRepairDrop={handlePdfRepairDrop}
        runDrawingAnalysis={runDrawingAnalysis}
        runWallScheduleDetection={runWallScheduleDetection}
        runPdfScheduleScan={runPdfScheduleScan}
        runGeometryAnalysis={runGeometryAnalysis}
        aiDrawingAnalysis={aiDrawingAnalysis}
        setAiDrawingAnalysis={setAiDrawingAnalysis}
        wallSchedule={wallSchedule}
        setWallSchedule={setWallSchedule}
        pdfSchedules={pdfSchedules}
        setPdfSchedules={setPdfSchedules}
        geoAnalysis={geoAnalysis}
        setGeoAnalysis={setGeoAnalysis}
        acceptAllDrawingItems={acceptAllDrawingItems}
        acceptDrawingItem={acceptDrawingItem}
        createWallInstances={createWallInstances}
        hasScale={hasScale}
        stopMeasuring={stopMeasuring}
        finishCalibration={finishCalibration}
        addMeasurement={addMeasurement}
        pauseMeasuring={pauseMeasuring}
        snapAngleOn={snapAngleOn}
        setSnapAngleOn={setSnapAngleOn}
        showMeasureLabels={showMeasureLabels}
        setShowMeasureLabels={setShowMeasureLabels}
        removeTakeoff={removeTakeoff}
        leftPanelTab={leftPanelTab}
        setLeftPanelTab={setLeftPanelTab}
        crossSheetScan={crossSheetScan}
        setCrossSheetScan={setCrossSheetScan}
        detailOverlayId={detailOverlayId}
        setDetailOverlayId={setDetailOverlayId}
        refPopover={refPopover}
        setRefPopover={setRefPopover}
        snapAngle={snapAngle}
      />

      {/* Takeoff Command Palette (Cmd+K) */}
      <TakeoffCommandPalette
        open={tkCmdOpen}
        onClose={() => setTkCmdOpen(false)}
        takeoffs={takeoffs}
        drawings={drawings}
        onSelectTool={setTkTool}
        onSelectDrawing={handleSelectDrawing}
        onStartMeasuring={engageMeasuring}
        onRunAnalysis={runDrawingAnalysis}
        onRunSchedules={runPdfScheduleScan}
        onRunGeometry={runGeometryAnalysis}
        onAutoCount={() => useDrawingPipelineStore.getState().setTkAutoCount({ phase: "select" })}
        getMeasuredQty={getMeasuredQty}
      />
    </div>
  );
}
