import { useState, useRef, useCallback, useMemo, useEffect, Suspense } from "react";
import lazyRetry from "@/utils/lazyRetry";
import { useTheme } from "@/hooks/useTheme";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useUiStore } from "@/stores/uiStore";
import { useModuleStore } from "@/stores/moduleStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, nInp, bt, truncate } from "@/utils/styles";
import { uid, nn, fmt, fmt2 } from "@/utils/format";
import { unitToTool } from "@/hooks/useMeasurementEngine";
import ModulePanel from "@/components/takeoffs/ModulePanel";
import TakeoffModuleSelector from "@/components/takeoffs/TakeoffModuleSelector";
import TakeoffDimensionEngine from "@/components/takeoffs/TakeoffDimensionEngine";
import FormulaExpressionRow from "@/components/takeoffs/FormulaExpressionRow";
import TakeoffSearchBar from "@/components/takeoffs/TakeoffSearchBar";
import TakeoffScopeSuggestions from "@/components/takeoffs/TakeoffScopeSuggestions";
import NotesPanel from "@/components/estimate/NotesPanel";
import ScenariosPanel from "@/components/estimate/ScenariosPanel";
import RFIPanel from "@/components/estimate/RFIPanel";
import TakeoffNOVAPanel from "@/components/takeoffs/TakeoffNOVAPanel";
import AutoTakeoffModal from "@/components/takeoffs/AutoTakeoffModal";
import TakeoffPanelTabBar from "@/components/takeoffs/TakeoffPanelTabBar";
import TakeoffRow from "@/components/takeoffs/TakeoffRow";
import { TO_COLORS } from "@/utils/takeoffHelpers";
import { detectDuplicates, isDismissed, dismissDuplicate } from "@/utils/duplicateDetector";

const EstimatePanelView = lazyRetry(() => import("@/components/estimate/EstimatePanelView"));
const DiscoveryPanel = lazyRetry(() => import("@/components/discovery/DiscoveryPanel"));

const RAIL_W = 36;

// Tier snap thresholds for drag-to-resize
const TIER_SNAPS = [
  { name: "compact", target: 350, min: 280, max: 420 },
  { name: "standard", target: 550, min: 421, max: 700 },
  { name: "full", target: 900, min: 701, max: 1000 },
];
const SNAP_MAGNETIC = 30;

/**
 * TakeoffLeftPanel — the slide-out left drawer containing:
 *  - Tab bar (Estimate / Discovery / Scenarios / Notes / RFIs / NOVA)
 *  - Takeoff list with groups, rows, inline editing
 *  - Module panel slider
 *  - Estimate grid (Full tier, right column)
 *  - Drag-to-resize handle
 */
export default function TakeoffLeftPanel({
  // --- CRUD ---
  crud: {
    addTakeoff,
    updateTakeoff,
    removeTakeoff,
    addTakeoffFreeform,
    addTakeoffFromDb,
    insertAssemblyIntoTakeoffs,
    addTakeoffFromAI,
    insertAIGroupIntoTakeoffs,
    addTakeoffFromAIAsSingle,
  },
  // --- Measurement ---
  measurement: {
    engageMeasuring,
    stopMeasuring,
    pauseMeasuring,
    removeMeasurement,
    hasScale,
    computeMeasurementValue,
    getMeasuredQty,
    getComputedQty,
    startAutoCount,
  },
  // --- Analysis ---
  analysis: {
    aiDrawingAnalysis,
    pdfSchedules,
    runDrawingAnalysis,
    runWallScheduleDetection,
    runPdfScheduleScan,
    wallScheduleLoading,
  },
  // --- Shared state from parent ---
  pageFilter,
  setPageFilter,
  leftPanelTab,
  setLeftPanelTab,
  crossSheetScan,
  setCrossSheetScan,
  estSelectedItemId,
  setEstSelectedItemId,
  measureFlashId,
  itemById,
  revisionAffectedIds,
  filteredTakeoffs,
  takeoffGroups,
  tkDragTakeoff,
  tkDragOverTakeoff,
  tkDragReorder,
}) {
  const C = useTheme();
  const T = C.T;

  // ─── Zustand store selectors ─────────────────
  const showToast = useUiStore(s => s.showToast);
  const setShowNotesPanel = useUiStore(s => s.setShowNotesPanel);
  const getItemTotal = useItemsStore(s => s.getItemTotal);
  const getTotals = useItemsStore(s => s.getTotals);

  const selectedDrawingId = useDrawingPipelineStore(s => s.selectedDrawingId);
  const drawings = useDrawingPipelineStore(s => s.drawings);

  const takeoffs = useDrawingPipelineStore(s => s.takeoffs);
  const setTakeoffs = useDrawingPipelineStore(s => s.setTakeoffs);
  const tkTool = useDrawingPipelineStore(s => s.tkTool);
  const setTkTool = useDrawingPipelineStore(s => s.setTkTool);
  const setTkActivePoints = useDrawingPipelineStore(s => s.setTkActivePoints);
  const tkActiveTakeoffId = useDrawingPipelineStore(s => s.tkActiveTakeoffId);
  const tkSelectedTakeoffId = useDrawingPipelineStore(s => s.tkSelectedTakeoffId);
  const setTkSelectedTakeoffId = useDrawingPipelineStore(s => s.setTkSelectedTakeoffId);
  const tkMeasureState = useDrawingPipelineStore(s => s.tkMeasureState);
  const setTkMeasureState = useDrawingPipelineStore(s => s.setTkMeasureState);
  const tkShowVars = useDrawingPipelineStore(s => s.tkShowVars);
  const setTkShowVars = useDrawingPipelineStore(s => s.setTkShowVars);
  const setTkScopeSuggestions = useDrawingPipelineStore(s => s.setTkScopeSuggestions);
  const tkPanelWidth = useDrawingPipelineStore(s => s.tkPanelWidth);
  const setTkPanelWidth = useDrawingPipelineStore(s => s.setTkPanelWidth);
  const tkPanelTier = useDrawingPipelineStore(s => s.tkPanelTier);
  const tkPanelOpen = useDrawingPipelineStore(s => s.tkPanelOpen);
  const setTkPanelOpen = useDrawingPipelineStore(s => s.setTkPanelOpen);
  const tkVisibility = useDrawingPipelineStore(s => s.tkVisibility);
  const setTkVisibility = useDrawingPipelineStore(s => s.setTkVisibility);
  const tkNewInput = useDrawingPipelineStore(s => s.tkNewInput);
  const scanResults = useDrawingPipelineStore(s => s.scanResults);

  const activeModule = useModuleStore(s => s.activeModule);
  const setActiveModule = useModuleStore(s => s.setActiveModule);
  // ─── Local state (only used within this panel) ─────────────────
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [costEditId, setCostEditId] = useState(null);
  const [actionMenuId, setActionMenuId] = useState(null);
  const [actionConfirm, setActionConfirm] = useState(null);
  const [actionMenuPos, setActionMenuPos] = useState(null);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [showAutoTakeoff, setShowAutoTakeoff] = useState(false);
  const [dupesExpanded, setDupesExpanded] = useState(false);

  // Duplicate takeoff detection
  const duplicates = useMemo(() => {
    const raw = detectDuplicates(filteredTakeoffs);
    return raw.filter(d => !isDismissed(d));
  }, [filteredTakeoffs]);

  const onDismissDuplicate = useCallback((d) => {
    dismissDuplicate(d);
    // Force re-render by toggling a dummy state
    setDupesExpanded(prev => prev);
  }, []);

  const actionMenuRef = useRef(null);

  const isLargeScreen = typeof window !== "undefined" && window.innerWidth >= 1200;
  const maxPanelWidth = isLargeScreen ? 1000 : 420;

  const selectedDrawing = useMemo(() => drawings.find(d => d.id === selectedDrawingId), [drawings, selectedDrawingId]);

  const toggleGroupCollapse = group => setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }));

  // Close action menu on outside click (delayed to avoid racing with the toggle button)
  useEffect(() => {
    if (!actionMenuId) return;
    const handler = e => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target)) {
        // Check if click was on the ··· button itself (data attribute)
        if (e.target.closest?.("[data-action-toggle]")) return;
        setActionMenuId(null);
        setActionConfirm(null);
      }
    };
    // Delay registration so the opening click doesn't immediately close
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handler); };
  }, [actionMenuId]);

  // Panel drag-to-resize
  const startTkDrag = useCallback(
    e => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = tkPanelWidth;
      setIsDraggingPanel(true);
      const onMove = ev => {
        let w = Math.max(280, Math.min(maxPanelWidth, startW + (ev.clientX - startX)));
        if (isLargeScreen) {
          for (const tier of TIER_SNAPS) {
            if (Math.abs(w - tier.target) < SNAP_MAGNETIC) {
              w = tier.target;
              break;
            }
          }
        }
        setTkPanelWidth(w);
        const tierName = w <= 420 ? "compact" : w <= 700 ? "standard" : "full";
        if (tierName !== useDrawingPipelineStore.getState().tkPanelTier) {
          useDrawingPipelineStore.getState().setTkPanelTier(tierName);
        }
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setIsDraggingPanel(false);
        const finalW = useDrawingPipelineStore.getState().tkPanelWidth;
        sessionStorage.setItem("bldg-tkPanelWidth", String(finalW));
        sessionStorage.setItem("bldg-tkPanelTier", useDrawingPipelineStore.getState().tkPanelTier);
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [tkPanelWidth, setTkPanelWidth, maxPanelWidth, isLargeScreen],
  );

  // Don't render if panel is closed or in estimate mode
  if (!tkPanelOpen || tkPanelTier === "estimate") return null;

  return (
    <>
      {/* Backdrop overlay */}
      <div
        onClick={() => {
          setTkPanelOpen(false);
          const sel = useDrawingPipelineStore.getState().tkSelectedTakeoffId;
          const ms = useDrawingPipelineStore.getState().tkMeasureState;
          if (sel && ms === "idle") engageMeasuring(sel);
        }}
        style={{
          position: "absolute",
          top: 0,
          left: RAIL_W,
          right: 0,
          bottom: 0,
          background: C.isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.15)",
          zIndex: 30,
          animation: "fadeIn 0.15s ease-out",
        }}
      />

      {/* Panel container */}
      <div
        style={{
          position: "absolute",
          left: RAIL_W,
          top: 0,
          bottom: 0,
          width: tkPanelWidth,
          minWidth: 280,
          maxWidth: maxPanelWidth,
          background: C.bg1,
          borderRadius: "6px 0 0 6px",
          border: `1px solid ${C.border}`,
          borderRight: `1px solid ${C.border}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          flexShrink: 0,
          zIndex: 31,
          boxShadow: "4px 0 24px rgba(0,0,0,0.15)",
          animation: isDraggingPanel ? "none" : "slideInLeft 0.2s ease-out",
        }}
      >
        {/* Tab bar header */}
        <TakeoffPanelTabBar
          C={C} T={T}
          leftPanelTab={leftPanelTab} setLeftPanelTab={setLeftPanelTab}
          pageFilter={pageFilter} setPageFilter={setPageFilter}
          filteredTakeoffs={filteredTakeoffs}
          tkPanelTier={tkPanelTier}
          tkVisibility={tkVisibility} setTkVisibility={setTkVisibility}
          setTkPanelOpen={setTkPanelOpen}
          engageMeasuring={engageMeasuring}
          setActiveModule={setActiveModule}
        />

        {/* Tab content body */}
        {(() => {
          const isNonEstTab = leftPanelTab !== "estimate";
          const isFull = tkPanelTier === "full";
          const tabContent = isNonEstTab ? (
            leftPanelTab === "notes" ? (
              <div style={{ flex: 1, overflowY: "auto" }}>
                <NotesPanel inline />
              </div>
            ) : leftPanelTab === "scenarios" ? (
              <div style={{ flex: 1, overflowY: "auto" }}>
                <ScenariosPanel />
              </div>
            ) : leftPanelTab === "rfis" ? (
              <div style={{ flex: 1, overflowY: "auto" }}>
                <RFIPanel />
              </div>
            ) : leftPanelTab === "discovery" ? (
              <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
                <Suspense fallback={<div style={{ padding: 16, color: C.textDim, fontSize: 12 }}>Loading...</div>}>
                  <DiscoveryPanel
                    context="takeoffs"
                    onNavigateToSheet={drawingId => {
                      useDrawingPipelineStore.getState().setSelectedDrawingId(drawingId);
                    }}
                  />
                </Suspense>
              </div>
            ) : leftPanelTab === "nova" ? (
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <TakeoffNOVAPanel
                  aiDrawingAnalysis={aiDrawingAnalysis}
                  pdfSchedules={pdfSchedules}
                  runDrawingAnalysis={runDrawingAnalysis}
                  runPdfScheduleScan={runPdfScheduleScan}
                  crossSheetScan={crossSheetScan}
                  setCrossSheetScan={setCrossSheetScan}
                  context={tkPanelTier === "full" || tkPanelTier === "estimate" ? "estimate" : "takeoff"}
                />
              </div>
            ) : null
          ) : null;

          if (isNonEstTab && !isFull) return tabContent;

          return (
            <>
              <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
                {isNonEstTab && isFull ? (
                  <div
                    style={{
                      width: 350,
                      flexShrink: 0,
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                      borderRight: `1px solid ${C.border}`,
                    }}
                  >
                    {tabContent}
                  </div>
                ) : (
                  <div
                    style={{
                      width: tkPanelTier === "full" ? 350 : "100%",
                      flexShrink: 0,
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                      borderRight: tkPanelTier === "full" ? `1px solid ${C.border}` : "none",
                    }}
                  >
                    {/* Search bar (extracted) */}
                    <TakeoffSearchBar
                      addTakeoffFreeform={addTakeoffFreeform}
                      addTakeoffFromDb={addTakeoffFromDb}
                      addTakeoffFromAI={addTakeoffFromAI}
                      insertAssemblyIntoTakeoffs={insertAssemblyIntoTakeoffs}
                      insertAIGroupIntoTakeoffs={insertAIGroupIntoTakeoffs}
                      addTakeoffFromAIAsSingle={addTakeoffFromAIAsSingle}
                    />

                    {/* Module selector -- always visible (beta feedback: can't switch modules with page filter) */}
                    <TakeoffModuleSelector
                      C={C} T={T}
                      activeModule={activeModule}
                      setActiveModule={setActiveModule}
                    />

                    {/* Module panel + takeoff list -- slide transition */}
                    <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
                      <div
                        style={{
                          display: "flex",
                          width: "200%",
                          height: "100%",
                          transform: `translateX(${activeModule && pageFilter !== "page" ? "-50%" : "0"})`,
                          transition: "transform 0.2s ease",
                        }}
                      >
                        {/* Takeoff list (left) */}
                        <div style={{ width: "50%", height: "100%", overflowY: "auto", padding: "0 8px 8px" }}>
                          {/* Auto-Generate from Plans button — shows when scan data exists */}
                          {scanResults?.schedules?.length > 0 && (
                            <button
                              onClick={() => setShowAutoTakeoff(true)}
                              style={{
                                width: "100%",
                                padding: "6px 10px",
                                marginBottom: 8,
                                background: `linear-gradient(135deg, ${C.accent}18, ${C.accent}08)`,
                                border: `1px solid ${C.accent}30`,
                                borderRadius: 6,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                transition: "all 0.15s",
                              }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent + "60"; }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = C.accent + "30"; }}
                            >
                              <Ic d={I.ai} size={12} color={C.accent} />
                              <span style={{ fontSize: 11, fontWeight: 600, color: C.accent }}>
                                Auto-Generate from Plans
                              </span>
                              <span style={{
                                marginLeft: "auto",
                                fontSize: 9,
                                color: C.textDim,
                                background: C.bg2,
                                padding: "1px 6px",
                                borderRadius: 8,
                              }}>
                                {scanResults.schedules.reduce((n, s) => n + (s.entries?.length || 0), 0)} items detected
                              </span>
                            </button>
                          )}
                          {/* Duplicate takeoff warning */}
                          {duplicates.length > 0 && (
                            <div style={{
                              padding: "8px 12px", marginBottom: 8, borderRadius: T.radius.md,
                              background: C.isDark ? "rgba(245,158,11,0.08)" : "rgba(245,158,11,0.06)",
                              border: `1px solid rgba(245,158,11,0.2)`,
                            }}>
                              <div style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                cursor: "pointer",
                              }} onClick={() => setDupesExpanded(!dupesExpanded)}>
                                <span style={{ fontSize: 10, fontWeight: 600, color: "#F59E0B" }}>
                                  {"\u26A0"} {duplicates.length} potential duplicate{duplicates.length !== 1 ? "s" : ""}
                                </span>
                                <span style={{ fontSize: 8, color: C.textDim }}>{dupesExpanded ? "Hide" : "Show"}</span>
                              </div>
                              {dupesExpanded && duplicates.map((d, i) => (
                                <div key={i} style={{
                                  fontSize: 9, color: C.textMuted, marginTop: 6, padding: "4px 0",
                                  borderTop: i > 0 ? `1px solid rgba(245,158,11,0.1)` : "none",
                                  display: "flex", justifyContent: "space-between", alignItems: "center",
                                }}>
                                  <span>
                                    <span style={{ fontWeight: 600, color: d.severity === "high" ? "#EF4444" : "#F59E0B" }}>
                                      {d.severity === "high" ? "High" : "Med"}
                                    </span>
                                    {" "}{d.reason}
                                  </span>
                                  <button
                                    onClick={e => { e.stopPropagation(); onDismissDuplicate(d); }}
                                    style={{
                                      background: "none", border: "none", cursor: "pointer",
                                      color: C.textDim, fontSize: 8, padding: "2px 6px",
                                    }}
                                  >Dismiss</button>
                                </div>
                              ))}
                            </div>
                          )}
                          {Object.entries(takeoffGroups).map(([group, tos]) => {
                            const isGroupCollapsed = !!collapsedGroups[group];
                            return (
                              <div
                                key={group}
                                style={{
                                  marginBottom: T.space[3],
                                  background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                                  backdropFilter: "blur(20px)",
                                  WebkitBackdropFilter: "blur(20px)",
                                  border: `1px solid ${C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)"}`,
                                  borderRadius: T.radius.md,
                                  boxShadow: T.shadow.sm,
                                  transition: T.transition.base,
                                }}
                              >
                                {/* Card header */}
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: `${T.space[2]}px ${T.space[3]}px`,
                                    background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                                    borderBottom: isGroupCollapsed
                                      ? "none"
                                      : `1px solid ${C.isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`,
                                    borderLeft:
                                      group !== "Ungrouped" ? `3px solid ${C.accent}` : "3px solid transparent",
                                  }}
                                >
                                  <div
                                    style={{ display: "flex", alignItems: "center", gap: T.space[2], minWidth: 0 }}
                                  >
                                    <Ic
                                      d={group === "Ungrouped" ? I.layers : I.assembly}
                                      size={12}
                                      color={C.accent}
                                    />
                                    <span
                                      style={{
                                        fontSize: T.fontSize.sm,
                                        fontWeight: T.fontWeight.semibold,
                                        color: C.text,
                                        letterSpacing: -0.2,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                      }}
                                    >
                                      {group}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: 9,
                                        color: C.textDim,
                                        fontWeight: T.fontWeight.medium,
                                        flexShrink: 0,
                                      }}
                                    >
                                      {tos.length}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => toggleGroupCollapse(group)}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      cursor: "pointer",
                                      padding: 4,
                                      display: "flex",
                                      alignItems: "center",
                                      borderRadius: T.radius.sm,
                                      flexShrink: 0,
                                    }}
                                  >
                                    <Ic
                                      d={I.chevron}
                                      size={10}
                                      color={C.textDim}
                                      style={{
                                        transform: isGroupCollapsed ? "rotate(-90deg)" : "rotate(90deg)",
                                        transition: "transform 0.2s cubic-bezier(0.25,0.1,0.25,1)",
                                      }}
                                    />
                                  </button>
                                </div>
                                {!isGroupCollapsed && (
                                  <>
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 4,
                                        padding: `${T.space[1]}px ${T.space[3]}px`,
                                        fontSize: 8,
                                        fontWeight: T.fontWeight.semibold,
                                        color: C.textDim,
                                        textTransform: "uppercase",
                                        letterSpacing: 0.6,
                                        borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)"}`,
                                      }}
                                    >
                                      <div style={{ width: 12 }}></div>
                                      <div style={{ flex: 2, minWidth: 80 }}>Description</div>
                                      <div style={{ width: 55, textAlign: "right" }}>Qty</div>
                                      <div style={{ width: 36 }}>Unit</div>
                                      {tkPanelTier !== "compact" && (
                                        <>
                                          <div style={{ width: 55, textAlign: "right" }}>$/Unit</div>
                                          <div style={{ width: 65, textAlign: "right" }}>Total</div>
                                        </>
                                      )}
                                      <div style={{ width: 44 }}></div>
                                    </div>
                                    {tos.map(to => (
                                      <TakeoffRow
                                        key={to.id}
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
                                    ))}
                                    <button
                                      className="ghost-btn"
                                      onClick={() => addTakeoff(group)}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: T.space[1],
                                        width: "100%",
                                        padding: `${T.space[2]}px ${T.space[3]}px`,
                                        background: "transparent",
                                        color: C.textDim,
                                        cursor: "pointer",
                                        fontSize: T.fontSize.xs,
                                        fontWeight: T.fontWeight.medium,
                                        border: "none",
                                        borderTop: `1px solid ${C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)"}`,
                                      }}
                                    >
                                      <Ic d={I.plus} size={9} /> Add item
                                    </button>
                                  </>
                                )}
                              </div>
                            );
                          })}

                          {takeoffs.length === 0 && (
                            <div
                              style={{
                                textAlign: "center",
                                padding: `${T.space[8]}px ${T.space[5]}px`,
                                borderRadius: T.radius.lg,
                                marginTop: T.space[3],
                                background: `linear-gradient(180deg, ${C.accent}06, transparent)`,
                                position: "relative",
                                overflow: "hidden",
                              }}
                            >
                              <div style={{ position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)", width: 120, height: 120, borderRadius: "50%", border: `1px solid ${C.accent}08`, animation: "breathe 4s ease-in-out infinite" }} />
                              <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", width: 100, height: 100, borderRadius: "50%", border: `1px solid ${C.accent}12`, animation: "breathe 4s ease-in-out infinite 0.5s" }} />
                              <div style={{ width: 56, height: 56, borderRadius: T.radius.full, margin: "0 auto", marginBottom: T.space[3], position: "relative", background: `linear-gradient(135deg, ${C.accent}18, ${C.accent}06)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 24px ${C.accent}12` }}>
                                <Ic d={I.ruler} size={24} color={C.accent} sw={1.7} />
                              </div>
                              <div style={{ fontSize: T.fontSize.md, fontWeight: T.fontWeight.bold, color: C.text, marginBottom: T.space[1] }}>Ready to measure</div>
                              <div style={{ fontSize: T.fontSize.sm, color: C.textMuted, lineHeight: 1.5, maxWidth: 220, margin: "0 auto" }}>
                                Search for a scope item above, or type any description and press Enter to start.
                              </div>
                              <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: T.space[4], fontSize: 8, color: C.textDim }}>
                                <span>Enter - Add item</span>
                                <span>Tab - Navigate</span>
                                <span>Cmd+K Palette</span>
                              </div>
                            </div>
                          )}
                        </div>
                        {/* ModulePanel (right -- slides in when active) */}
                        <div style={{ width: "50%", height: "100%", overflowY: "auto" }}>
                          {pageFilter !== "page" && (
                            <ModulePanel
                              engageMeasuring={engageMeasuring}
                              selectedDrawingId={selectedDrawingId}
                              addTakeoff={addTakeoff}
                              updateTakeoff={updateTakeoff}
                              removeTakeoff={removeTakeoff}
                              pageFilter={pageFilter}
                              onDetectWallSchedule={runWallScheduleDetection}
                              wallScheduleLoading={wallScheduleLoading}
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* AI Scope Suggestions (extracted) */}
                    <TakeoffScopeSuggestions addTakeoff={addTakeoff} />


                    {/* Footer */}
                    {takeoffs.length > 0 && (
                      <div
                        style={{
                          padding: "5px 12px",
                          borderTop: `1px solid ${C.border}`,
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 10,
                        }}
                      >
                        <span style={{ color: C.textMuted }}>
                          <strong style={{ color: C.text }}>{takeoffs.length}</strong> items
                          {takeoffs.reduce((s, t) => (t.measurements || []).length + s, 0) > 0 && (
                            <>
                              {" "}
                              ·{" "}
                              <strong style={{ color: C.accent }}>
                                {takeoffs.reduce((s, t) => (t.measurements || []).length + s, 0)}
                              </strong>{" "}
                              measurements
                            </>
                          )}
                        </span>
                        {tkPanelTier !== "compact" && getTotals().grand > 0 && (
                          <span style={{ color: C.green, fontWeight: 700, fontFamily: T.font.sans, fontFeatureSettings: "'tnum'" }}>
                            {fmt(getTotals().grand)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Right column: Estimate grid -- Full tier only */}
                {tkPanelTier === "full" && (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
                    <Suspense
                      fallback={
                        <div style={{ padding: 20, textAlign: "center", fontSize: 10, color: C.textDim }}>
                          Loading estimate...
                        </div>
                      }
                    >
                      <EstimatePanelView
                        onSelectItem={id => setEstSelectedItemId(prev => (prev === id ? null : id))}
                        selectedItemId={estSelectedItemId}
                      />
                    </Suspense>
                  </div>
                )}
              </div>
            </>
          );
        })()}

        {/* Drag handle -- right edge of panel */}
        <div
          onMouseDown={startTkDrag}
          style={{
            position: "absolute",
            right: -3,
            top: 0,
            bottom: 0,
            width: 6,
            cursor: "col-resize",
            zIndex: 32,
            background: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={e => (e.currentTarget.querySelector(".grip-bar").style.background = C.accent + "60")}
          onMouseLeave={e => (e.currentTarget.querySelector(".grip-bar").style.background = C.border)}
        >
          <div
            className="grip-bar"
            style={{ width: 3, height: 24, borderRadius: 2, background: C.border, transition: "background 0.15s" }}
          />
        </div>

        {/* Tier indicator during drag */}
        {isDraggingPanel && (
          <div
            style={{
              position: "absolute",
              right: -52,
              top: "50%",
              transform: "translateY(-50%)",
              background: C.bg1,
              border: `1px solid ${C.accent}`,
              borderRadius: 6,
              padding: "3px 8px",
              fontSize: 9,
              fontWeight: 700,
              color: C.accent,
              whiteSpace: "nowrap",
              zIndex: 100,
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              pointerEvents: "none",
            }}
          >
            {tkPanelTier === "compact" ? "Compact" : tkPanelTier === "standard" ? "Standard" : "Full"}
          </div>
        )}
      </div>
      {/* Auto-Generate from Plans modal */}
      {showAutoTakeoff && <AutoTakeoffModal onClose={() => setShowAutoTakeoff(false)} />}
    </>
  );
}
