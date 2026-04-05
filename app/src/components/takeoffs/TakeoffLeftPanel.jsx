import { useState, useRef, useCallback, useMemo, useEffect, lazy, Suspense } from "react";
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
import { MODULE_LIST } from "@/constants/modules";
import ModulePanel from "@/components/takeoffs/ModulePanel";
import TakeoffDimensionEngine from "@/components/takeoffs/TakeoffDimensionEngine";
import FormulaExpressionRow from "@/components/takeoffs/FormulaExpressionRow";
import TakeoffSearchBar from "@/components/takeoffs/TakeoffSearchBar";
import TakeoffScopeSuggestions from "@/components/takeoffs/TakeoffScopeSuggestions";
import NotesPanel from "@/components/estimate/NotesPanel";
import ScenariosPanel from "@/components/estimate/ScenariosPanel";
import RFIPanel from "@/components/estimate/RFIPanel";
import TakeoffNOVAPanel from "@/components/takeoffs/TakeoffNOVAPanel";
import AutoTakeoffModal from "@/components/takeoffs/AutoTakeoffModal";
import { TO_COLORS } from "@/utils/takeoffHelpers";

const EstimatePanelView = lazy(() => import("@/components/estimate/EstimatePanelView"));
const DiscoveryPanel = lazy(() => import("@/components/discovery/DiscoveryPanel"));

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
  const lastModuleRef = useRef(null);

  // ─── Local state (only used within this panel) ─────────────────
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [costEditId, setCostEditId] = useState(null);
  const [actionMenuId, setActionMenuId] = useState(null);
  const [actionConfirm, setActionConfirm] = useState(null);
  const [actionMenuPos, setActionMenuPos] = useState(null);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [showAutoTakeoff, setShowAutoTakeoff] = useState(false);

  const actionMenuRef = useRef(null);

  const isLargeScreen = typeof window !== "undefined" && window.innerWidth >= 1200;
  const maxPanelWidth = isLargeScreen ? 1000 : 420;

  const selectedDrawing = useMemo(() => drawings.find(d => d.id === selectedDrawingId), [drawings, selectedDrawingId]);

  const toggleGroupCollapse = group => setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }));

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
        <div
          style={{
            padding: "8px 12px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          {/* Panel mode tabs: Est | Discovery | Scen | Notes | RFIs | NOVA */}
          {(() => {
            const allTabs = [
              { key: "estimate", label: "Est", icon: I.ruler },
              { key: "discovery", label: "Discovery", icon: I.search || I.scan || I.ai },
              { key: "scenarios", label: "Scenarios", icon: I.layers },
              { key: "notes", label: "Notes", icon: I.report },
              { key: "rfis", label: "RFIs", icon: I.send },
              { key: "nova", label: "NOVA", icon: I.ai },
            ];
            const isEstimateTier = tkPanelTier === "estimate";
            const row1 = isEstimateTier ? allTabs.slice(0, 3) : allTabs;
            const row2 = isEstimateTier ? [allTabs[4], allTabs[3]] : [];

            const renderTab = t => {
              const isActive = leftPanelTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => {
                    setLeftPanelTab(t.key);
                    setShowNotesPanel(t.key === "notes");
                  }}
                  style={{
                    padding: isEstimateTier ? "3px 10px" : "3px 8px",
                    fontSize: 10,
                    fontWeight: 600,
                    background: isActive
                      ? t.key === "nova"
                        ? "linear-gradient(135deg, #7C5CFC, #6D28D9)"
                        : C.accent
                      : "transparent",
                    color: isActive ? "#fff" : C.textDim,
                    border: isActive ? "none" : `1px solid ${C.border}`,
                    borderRadius: 999,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Ic d={t.icon} size={11} color={isActive ? "#fff" : C.textDim} /> {t.label}
                </button>
              );
            };

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>{row1.map(renderTab)}</div>
                {row2.length > 0 && <div style={{ display: "flex", gap: 2 }}>{row2.map(renderTab)}</div>}
              </div>
            );
          })()}

          {/* Takeoffs sub-filters (only when Estimate tab active) */}
          {leftPanelTab === "estimate" && (
            <div style={{ display: "flex", gap: 2, background: C.bg2, borderRadius: 4, padding: 2 }}>
              <button
                onClick={() => {
                  setPageFilter("all");
                  if (tkVisibility === "page") setTkVisibility("all");
                }}
                style={{
                  padding: "2px 8px",
                  fontSize: 9,
                  fontWeight: 600,
                  background: pageFilter === "all" ? C.accent : "transparent",
                  color: pageFilter === "all" ? "#fff" : C.textDim,
                  border: "none",
                  borderRadius: 3,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                All
              </button>
              <button
                onClick={() => {
                  setPageFilter("page");
                  setTkVisibility("page");
                }}
                style={{
                  padding: "2px 8px",
                  fontSize: 9,
                  fontWeight: 600,
                  background: pageFilter === "page" ? C.accent : "transparent",
                  color: pageFilter === "page" ? "#fff" : C.textDim,
                  border: "none",
                  borderRadius: 3,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                This Page{pageFilter === "page" ? ` (${filteredTakeoffs.length})` : ""}
              </button>
            </div>
          )}

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {leftPanelTab === "estimate" && (
              <button
                className="icon-btn"
                onClick={() => {
                  const next = { all: "page", page: "active", active: "all" };
                  const nv = next[tkVisibility] || "all";
                  setTkVisibility(nv);
                  if (nv === "page") {
                    setPageFilter("page");
                    setActiveModule(null);
                  } else if (tkVisibility === "page") {
                    setPageFilter("all");
                  }
                }}
                title={
                  tkVisibility === "all"
                    ? "Showing all takeoffs"
                    : tkVisibility === "page"
                      ? "This page only"
                      : "Selected takeoff only"
                }
                style={{
                  width: 22,
                  height: 22,
                  border: `1px solid ${tkVisibility === "active" || tkVisibility === "page" ? C.accent + "60" : C.border}`,
                  background:
                    tkVisibility === "page"
                      ? C.accent + "18"
                      : tkVisibility === "active"
                        ? C.accent + "12"
                        : "transparent",
                  color: tkVisibility === "page" ? C.accent : tkVisibility === "active" ? C.accent : C.textDim,
                  borderRadius: 3,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {tkVisibility === "active" && (
                  <span
                    style={{
                      position: "absolute",
                      top: -4,
                      right: -4,
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: C.accent,
                      color: "#fff",
                      fontSize: 8,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      lineHeight: 1,
                    }}
                  >
                    1
                  </span>
                )}
                {tkVisibility === "page" && (
                  <span
                    style={{
                      position: "absolute",
                      top: -4,
                      right: -4,
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: C.accent,
                      color: "#fff",
                      fontSize: 7,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      lineHeight: 1,
                    }}
                  >
                    P
                  </span>
                )}
              </button>
            )}
            {/* Close panel chevron */}
            <button
              className="icon-btn"
              onClick={() => setTkPanelOpen(false)}
              title="Close panel"
              style={{
                width: 22,
                height: 22,
                border: "none",
                background: C.bg2,
                color: C.textDim,
                borderRadius: 3,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 1L2 5l4 4" />
              </svg>
            </button>
          </div>
        </div>

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

                    {/* Module selector -- hidden when filtering to "This Page" */}
                    {pageFilter !== "page" && (
                      <div style={{ padding: "8px 10px 8px", borderBottom: `1px solid ${C.border}` }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 0,
                            background: C.bg2,
                            borderRadius: 5,
                            padding: 2,
                            marginBottom: activeModule ? 7 : 0,
                          }}
                        >
                          <button
                            onClick={() => setActiveModule(null)}
                            style={{
                              flex: 1,
                              padding: "4px 0",
                              fontSize: 10,
                              fontWeight: 600,
                              background: !activeModule ? C.accent : "transparent",
                              color: !activeModule ? "#fff" : C.textDim,
                              border: "none",
                              borderRadius: 4,
                              cursor: "pointer",
                              transition: "all 0.15s",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 4,
                            }}
                          >
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke={!activeModule ? "#fff" : C.textDim}
                              strokeWidth="2"
                              strokeLinecap="round"
                            >
                              <path d="M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01" />
                            </svg>
                            All
                          </button>
                          <button
                            onClick={() => {
                              if (activeModule) return;
                              const last = lastModuleRef.current || MODULE_LIST.find(b => b.available)?.id || null;
                              if (last) setActiveModule(last);
                            }}
                            style={{
                              flex: 1,
                              padding: "4px 0",
                              fontSize: 10,
                              fontWeight: 600,
                              background: activeModule ? C.accent : "transparent",
                              color: activeModule ? "#fff" : C.textDim,
                              border: "none",
                              borderRadius: 4,
                              cursor: "pointer",
                              transition: "all 0.15s",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 4,
                            }}
                          >
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke={activeModule ? "#fff" : C.textDim}
                              strokeWidth="2"
                              strokeLinecap="round"
                            >
                              <rect x="3" y="3" width="7" height="7" />
                              <rect x="14" y="3" width="7" height="7" />
                              <rect x="3" y="14" width="7" height="7" />
                              <rect x="14" y="14" width="7" height="7" />
                            </svg>
                            Modules
                          </button>
                        </div>
                        {activeModule && (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                            {MODULE_LIST.map(b => {
                              const isActive = activeModule === b.id;
                              return (
                                <button
                                  key={b.id}
                                  onClick={() => b.available && setActiveModule(b.id)}
                                  style={{
                                    padding: "3px 9px",
                                    fontSize: 9,
                                    fontWeight: 600,
                                    border: `1px solid ${isActive ? C.accent + "60" : C.border}`,
                                    background: isActive ? C.accent + "15" : "transparent",
                                    color: isActive ? C.accent : b.available ? C.textMuted : C.textDimmer,
                                    borderRadius: 4,
                                    cursor: b.available ? "pointer" : "default",
                                    opacity: b.available ? 1 : 0.4,
                                    transition: "all 0.15s",
                                  }}
                                  title={b.available ? `${b.name} Module` : `${b.name} Module (Coming Soon)`}
                                >
                                  {b.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

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
                                    {tos.map(to => {
                                      const isActive = tkActiveTakeoffId === to.id;
                                      const isSelected = tkSelectedTakeoffId === to.id || isActive;
                                      const isMeasuring =
                                        isActive && (tkMeasureState === "measuring" || tkMeasureState === "paused");
                                      const isPaused = isActive && tkMeasureState === "paused";
                                      const isRevisionAffected = revisionAffectedIds.has(to.id);
                                      const computedQty = getComputedQty(to);
                                      const measuredQty = getMeasuredQty(to);
                                      const hasMeasurements = (to.measurements || []).length > 0;
                                      const noScale =
                                        hasMeasurements && measuredQty === null && unitToTool(to.unit) !== "count";
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
                                        <div key={to.id} data-takeoff-id={to.id}>
                                          <div
                                            className={`row${to._aiCosts ? " nova-priced" : ""}${isSelected ? " row-selected" : ""}${isMeasuring ? " row-measuring" : ""}`}
                                            draggable
                                            onDragStart={() => {
                                              tkDragTakeoff.current = to.id;
                                            }}
                                            onDragEnter={() => {
                                              tkDragOverTakeoff.current = to.id;
                                            }}
                                            onDragEnd={tkDragReorder}
                                            onDragOver={e => e.preventDefault()}
                                            onClick={() => {
                                              setTkSelectedTakeoffId(to.id);
                                            }}
                                            style={{
                                              "--rc": to.color,
                                              position: "relative",
                                              zIndex: isSelected && !isMeasuring ? 2 : undefined,
                                              display: "flex",
                                              alignItems: "center",
                                              gap: 4,
                                              padding: `${T.space[1]}px ${T.space[2]}px`,
                                              borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)"}`,
                                              cursor: "grab",
                                              background: isMeasuring
                                                ? `${to.color}18`
                                                : isSelected
                                                  ? `${to.color}0A`
                                                  : isRevisionAffected
                                                    ? "rgba(245,158,11,0.06)"
                                                    : "transparent",
                                              borderLeft: isMeasuring
                                                ? `3px solid ${to.color}`
                                                : isRevisionAffected && !isSelected
                                                  ? "3px solid #F59E0B"
                                                  : isSelected
                                                    ? `3px solid ${to.color}80`
                                                    : "3px solid transparent",
                                              boxShadow: isMeasuring ? `inset 0 0 0 1px ${to.color}30` : "none",
                                              transition: "background 100ms ease-out",
                                            }}
                                          >
                                            {/* Play / Pause / Stop */}
                                            <div
                                              style={{
                                                width: isMeasuring || isPaused ? 38 : 20,
                                                flexShrink: 0,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                gap: 2,
                                              }}
                                              onClick={e => e.stopPropagation()}
                                            >
                                              {isActive && tkMeasureState === "measuring" ? (
                                                <button
                                                  className="icon-btn"
                                                  onClick={() => pauseMeasuring()}
                                                  title="Pause"
                                                  style={ctrlBtnS}
                                                >
                                                  <svg width="10" height="10" viewBox="0 0 10 10" fill={to.color}>
                                                    <rect x="1" y="1" width="3" height="8" rx="0.5" />
                                                    <rect x="6" y="1" width="3" height="8" rx="0.5" />
                                                  </svg>
                                                </button>
                                              ) : isPaused ? (
                                                <button
                                                  className="icon-btn"
                                                  onClick={() => setTkMeasureState("measuring")}
                                                  title="Resume"
                                                  style={ctrlBtnS}
                                                >
                                                  <svg width="10" height="10" viewBox="0 0 10 10" fill={to.color}>
                                                    <polygon points="2,1 9,5 2,9" />
                                                  </svg>
                                                </button>
                                              ) : (
                                                <button
                                                  className="icon-btn"
                                                  onClick={() => engageMeasuring(to.id)}
                                                  title="Start measuring"
                                                  style={{ ...ctrlBtnS, opacity: selectedDrawing?.data ? 1 : 0.3 }}
                                                  disabled={!selectedDrawing?.data}
                                                >
                                                  <svg
                                                    width="10"
                                                    height="10"
                                                    viewBox="0 0 10 10"
                                                    fill={selectedDrawing?.data ? to.color : C.textDim}
                                                  >
                                                    <polygon points="2,1 9,5 2,9" />
                                                  </svg>
                                                </button>
                                              )}
                                              {(isMeasuring || isPaused) && (
                                                <button
                                                  className="icon-btn"
                                                  onClick={() => stopMeasuring()}
                                                  title="Stop"
                                                  style={ctrlBtnS}
                                                >
                                                  <svg width="8" height="8" viewBox="0 0 8 8" fill={C.red}>
                                                    <rect width="8" height="8" rx="1" />
                                                  </svg>
                                                </button>
                                              )}
                                            </div>
                                            <div
                                              style={{
                                                width: 10,
                                                height: 10,
                                                borderRadius: 2,
                                                background: to.color,
                                                flexShrink: 0,
                                                cursor: "pointer",
                                                position: "relative",
                                              }}
                                              onClick={e => {
                                                e.stopPropagation();
                                                e.currentTarget.querySelector("input")?.click();
                                              }}
                                            >
                                              {isMeasuring && (
                                                <div
                                                  style={{
                                                    position: "absolute",
                                                    inset: -2,
                                                    borderRadius: 3,
                                                    border: `2px solid ${to.color}`,
                                                    animation: "pulse 1.5s infinite",
                                                  }}
                                                />
                                              )}
                                              <input
                                                type="color"
                                                value={to.color}
                                                onChange={e => updateTakeoff(to.id, "color", e.target.value)}
                                                onClick={e => e.stopPropagation()}
                                                style={{
                                                  position: "absolute",
                                                  opacity: 0,
                                                  width: 0,
                                                  height: 0,
                                                  top: 0,
                                                  left: 0,
                                                }}
                                              />
                                            </div>
                                            {/* Description */}
                                            <div
                                              style={{ flex: 2, minWidth: 80, minHeight: 0 }}
                                              onClick={e => e.stopPropagation()}
                                            >
                                              <input
                                                value={to.description}
                                                onChange={e => updateTakeoff(to.id, "description", e.target.value)}
                                                placeholder="Description..."
                                                style={inp(C, {
                                                  background: "transparent",
                                                  border: "1px solid transparent",
                                                  padding: "2px 4px",
                                                  fontSize: 10,
                                                  fontWeight: T.fontWeight.medium,
                                                })}
                                              />
                                              {(to.code || to._aiCosts) && (
                                                <div
                                                  style={{
                                                    fontSize: 8,
                                                    color: `${C.purple}B0`,
                                                    fontFamily: T.font.mono,
                                                    paddingLeft: 4,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 3,
                                                    lineHeight: 1.2,
                                                    ...truncate(),
                                                  }}
                                                >
                                                  {to.code || ""}
                                                  {to._aiCosts && (
                                                    <span
                                                      style={{
                                                        color: C.accent,
                                                        fontSize: 7,
                                                        fontWeight: T.fontWeight.bold,
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: 2,
                                                        background: `${C.accent}0A`,
                                                        padding: "0 3px",
                                                        borderRadius: 2,
                                                      }}
                                                      title={`NOVA: M $${fmt2(to._aiCosts.material)} · L $${fmt2(to._aiCosts.labor)} · E $${fmt2(to._aiCosts.equipment)}`}
                                                    >
                                                      NOVA
                                                    </span>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                            {/* Qty */}
                                            <div style={{ width: 55 }} onClick={e => e.stopPropagation()}>
                                              {hasMeasurements ? (
                                                noScale ? (
                                                  <div
                                                    style={{
                                                      fontSize: 8,
                                                      color: C.orange,
                                                      fontWeight: T.fontWeight.semibold,
                                                      padding: "2px 4px",
                                                      cursor: "help",
                                                    }}
                                                    title="Set a scale to see quantities"
                                                  >
                                                    Scale
                                                  </div>
                                                ) : (
                                                  <div
                                                    className={measureFlashId === to.id ? "measure-complete" : ""}
                                                    style={{
                                                      "--rc": to.color,
                                                      fontSize: 10,
                                                      fontWeight: 700,
                                                      color: measureFlashId === to.id ? to.color : C.text,
                                                      padding: "2px 4px",
                                                      fontFamily: T.font.mono,
                                                      fontFeatureSettings: "'tnum'",
                                                      borderRadius: 3,
                                                      transition: "color 300ms ease",
                                                    }}
                                                  >
                                                    {displayQty}
                                                  </div>
                                                )
                                              ) : (
                                                <input
                                                  type="number"
                                                  value={to.quantity}
                                                  onChange={e => updateTakeoff(to.id, "quantity", e.target.value)}
                                                  placeholder="0"
                                                  style={nInp(C, {
                                                    background: "transparent",
                                                    border: "1px solid transparent",
                                                    padding: "2px 4px",
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                  })}
                                                />
                                              )}
                                            </div>
                                            {/* Unit */}
                                            <div style={{ width: 36 }} onClick={e => e.stopPropagation()}>
                                              <select
                                                value={to.unit}
                                                onChange={e => {
                                                  updateTakeoff(to.id, "unit", e.target.value);
                                                  if (tkActiveTakeoffId === to.id) {
                                                    setTkTool(unitToTool(e.target.value));
                                                    setTkActivePoints([]);
                                                  }
                                                }}
                                                style={inp(C, {
                                                  background: "transparent",
                                                  border: "1px solid transparent",
                                                  padding: "2px 1px",
                                                  fontSize: 9,
                                                  color: C.textDim,
                                                })}
                                              >
                                                {["EA", "LF", "SF", "SY", "CY", "CF", "LS", "HR"].map(u => (
                                                  <option key={u} value={u}>
                                                    {u}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                            {/* Cost columns */}
                                            {tkPanelTier !== "compact" &&
                                              (() => {
                                                const linkedItem = itemById[to.linkedItemId];
                                                if (!linkedItem || getItemTotal(linkedItem) <= 0) {
                                                  return (
                                                    <>
                                                      <div style={{ width: 55 }} />
                                                      <div style={{ width: 65 }} />
                                                    </>
                                                  );
                                                }
                                                const itemTotal = getItemTotal(linkedItem);
                                                const itemQty = nn(linkedItem.quantity);
                                                const unitCost = itemQty > 0 ? itemTotal / itemQty : 0;
                                                return (
                                                  <>
                                                    <div
                                                      style={{
                                                        width: 55,
                                                        textAlign: "right",
                                                        fontSize: 9,
                                                        fontFeatureSettings: "'tnum'",
                                                        color: C.textDim,
                                                        padding: "2px 2px",
                                                      }}
                                                      onClick={e => {
                                                        e.stopPropagation();
                                                        setCostEditId(costEditId === to.id ? null : to.id);
                                                      }}
                                                      title={`M: $${fmt2(nn(linkedItem.material))} · L: $${fmt2(nn(linkedItem.labor))} · E: $${fmt2(nn(linkedItem.equipment))} · S: $${fmt2(nn(linkedItem.subcontractor))}`}
                                                    >
                                                      ${fmt2(unitCost)}
                                                    </div>
                                                    <div
                                                      style={{
                                                        width: 65,
                                                        textAlign: "right",
                                                        fontSize: 10,
                                                        fontWeight: 700,
                                                        fontFeatureSettings: "'tnum'",
                                                        color: C.green,
                                                        padding: "2px 2px",
                                                      }}
                                                      onClick={e => {
                                                        e.stopPropagation();
                                                        setCostEditId(costEditId === to.id ? null : to.id);
                                                      }}
                                                    >
                                                      {fmt(itemTotal)}
                                                    </div>
                                                  </>
                                                );
                                              })()}
                                            {/* Actions column */}
                                            <div
                                              style={{
                                                width: 44,
                                                display: "flex",
                                                gap: 2,
                                                alignItems: "center",
                                                position: "relative",
                                              }}
                                              onClick={e => e.stopPropagation()}
                                            >
                                              <div
                                                className="tk-row-actions"
                                                style={{
                                                  display: "flex",
                                                  gap: 2,
                                                  alignItems: "center",
                                                }}
                                              >
                                                <button
                                                  className="icon-btn"
                                                  onClick={() => setTkShowVars(tkShowVars === to.id ? null : to.id)}
                                                  title="Variables & Formula"
                                                  style={{
                                                    minWidth: 24,
                                                    height: 22,
                                                    padding: hasFormula ? "0 5px" : "0 4px",
                                                    border: hasFormula
                                                      ? `1px solid ${C.accent}40`
                                                      : `1px solid ${C.border}`,
                                                    background: hasFormula ? `${C.accent}15` : C.bg2,
                                                    color: hasFormula ? C.accent : C.textMuted,
                                                    borderRadius: 5,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    fontSize: hasFormula ? 9 : 11,
                                                    fontWeight: 700,
                                                    gap: 1,
                                                    transition: T.transition.fast,
                                                    boxShadow: hasFormula ? T.shadow.glowAccent || "none" : "none",
                                                  }}
                                                >
                                                  {(() => {
                                                    if (!hasFormula) return "\u0192";
                                                    const vars = to.variables || [];
                                                    const hVar = vars.find(
                                                      v => (v.key || "").toLowerCase() === "height",
                                                    );
                                                    if (hVar) return `\u00D7${hVar.value}'`;
                                                    const fVar = vars.find(
                                                      v => (v.key || "").toLowerCase() === "factor",
                                                    );
                                                    if (fVar) return `\u00D7${fVar.value}`;
                                                    if (vars.length > 0) return `\u0192=`;
                                                    return "\u0192";
                                                  })()}
                                                </button>
                                                <button
                                                  className="icon-btn"
                                                  onClick={e => {
                                                    e.stopPropagation();
                                                    if (actionMenuId === to.id) {
                                                      setActionMenuId(null);
                                                    } else {
                                                      const rect = e.currentTarget.getBoundingClientRect();
                                                      setActionMenuPos({
                                                        top: rect.bottom + 4,
                                                        right: window.innerWidth - rect.right,
                                                      });
                                                      setActionMenuId(to.id);
                                                    }
                                                    setActionConfirm(null);
                                                  }}
                                                  title="More actions"
                                                  style={{
                                                    width: 24,
                                                    height: 24,
                                                    border: actionMenuId === to.id ? `1px solid ${C.accent}40` : `1px solid ${C.border}`,
                                                    background:
                                                      actionMenuId === to.id ? `${C.accent}18` : C.bg2,
                                                    color: actionMenuId === to.id ? C.accent : C.textMuted,
                                                    borderRadius: 5,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    letterSpacing: 2,
                                                    transition: "all 0.15s ease",
                                                    cursor: "pointer",
                                                    flexShrink: 0,
                                                    position: "relative",
                                                    zIndex: 2,
                                                  }}
                                                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent + "60"; e.currentTarget.style.color = C.accent; }}
                                                  onMouseLeave={e => { e.currentTarget.style.borderColor = actionMenuId === to.id ? C.accent + "40" : C.border; e.currentTarget.style.color = actionMenuId === to.id ? C.accent : C.textMuted; }}
                                                >
                                                  ···
                                                </button>
                                              </div>
                                              {/* Floating action menu */}
                                              {actionMenuId === to.id && (
                                                <div
                                                  ref={actionMenuRef}
                                                  style={{
                                                    position: "fixed",
                                                    top: actionMenuPos?.top || 0,
                                                    right: actionMenuPos?.right || 0,
                                                    zIndex: 9999,
                                                    minWidth: 170,
                                                    background: C.bg1,
                                                    border: `1px solid ${C.border}`,
                                                    borderRadius: 8,
                                                    boxShadow: T.shadow.lg,
                                                    padding: "4px 0",
                                                    overflow: "hidden",
                                                  }}
                                                  onClick={e => e.stopPropagation()}
                                                >
                                                  {unitToTool(to.unit) === "count" && selectedDrawing?.data && (
                                                    <button
                                                      onClick={() => {
                                                        startAutoCount(to.id);
                                                        setActionMenuId(null);
                                                        setActionConfirm(null);
                                                      }}
                                                      style={{
                                                        width: "100%",
                                                        padding: "7px 12px",
                                                        border: "none",
                                                        background: "transparent",
                                                        color: C.text,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 8,
                                                        fontSize: 12,
                                                        cursor: "pointer",
                                                        transition: T.transition.fast,
                                                      }}
                                                      onMouseEnter={e =>
                                                        (e.currentTarget.style.background = `${C.accent}10`)
                                                      }
                                                      onMouseLeave={e =>
                                                        (e.currentTarget.style.background = "transparent")
                                                      }
                                                    >
                                                      <svg
                                                        width="13"
                                                        height="13"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke={C.purple}
                                                        strokeWidth="2.5"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                      >
                                                        <path d="M12 20V10 M18 20v-4 M6 20v-6" />
                                                      </svg>
                                                      <span style={{ color: C.purple }}>Auto Count</span>
                                                    </button>
                                                  )}
                                                  <button
                                                    onClick={() => {
                                                      const nt = {
                                                        ...takeoffs.find(t => t.id === to.id),
                                                        id: uid(),
                                                        linkedItemId: "",
                                                        measurements: [],
                                                      };
                                                      setTakeoffs([...takeoffs, nt]);
                                                      setActionMenuId(null);
                                                      setActionConfirm(null);
                                                    }}
                                                    style={{
                                                      width: "100%",
                                                      padding: "7px 12px",
                                                      border: "none",
                                                      background: "transparent",
                                                      color: C.text,
                                                      display: "flex",
                                                      alignItems: "center",
                                                      gap: 8,
                                                      fontSize: 12,
                                                      cursor: "pointer",
                                                      transition: T.transition.fast,
                                                    }}
                                                    onMouseEnter={e =>
                                                      (e.currentTarget.style.background = `${C.accent}10`)
                                                    }
                                                    onMouseLeave={e =>
                                                      (e.currentTarget.style.background = "transparent")
                                                    }
                                                  >
                                                    <Ic d={I.copy} size={11} color={C.textDim} />
                                                    <span>Duplicate</span>
                                                  </button>
                                                  {(to.measurements || []).length > 0 && (
                                                    <button
                                                      onClick={() => {
                                                        if (actionConfirm === "clear") {
                                                          const cnt = (to.measurements || []).length;
                                                          useDrawingPipelineStore.getState().clearMeasurements(to.id);
                                                          useUiStore
                                                            .getState()
                                                            .showToast(`Cleared ${cnt} measurements`);
                                                          setActionMenuId(null);
                                                          setActionConfirm(null);
                                                        } else {
                                                          setActionConfirm("clear");
                                                        }
                                                      }}
                                                      style={{
                                                        width: "100%",
                                                        padding: "7px 12px",
                                                        border: "none",
                                                        background:
                                                          actionConfirm === "clear" ? `${C.orange}15` : "transparent",
                                                        color: C.orange,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 8,
                                                        fontSize: 12,
                                                        cursor: "pointer",
                                                        transition: T.transition.fast,
                                                      }}
                                                      onMouseEnter={e => {
                                                        if (actionConfirm !== "clear")
                                                          e.currentTarget.style.background = `${C.orange}10`;
                                                      }}
                                                      onMouseLeave={e => {
                                                        if (actionConfirm !== "clear")
                                                          e.currentTarget.style.background = "transparent";
                                                      }}
                                                    >
                                                      <svg
                                                        width="11"
                                                        height="11"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="2.5"
                                                        strokeLinecap="round"
                                                      >
                                                        <path d="M3 6h18M8 6V4h8v2M10 11v6M14 11v6" />
                                                      </svg>
                                                      <span>
                                                        {actionConfirm === "clear"
                                                          ? `Clear ${(to.measurements || []).length} measurements?`
                                                          : `Clear (${(to.measurements || []).length})`}
                                                      </span>
                                                    </button>
                                                  )}
                                                  <div
                                                    style={{ height: 1, background: C.border, margin: "4px 8px" }}
                                                  />
                                                  <button
                                                    onClick={() => {
                                                      if (actionConfirm === "delete") {
                                                        removeTakeoff(to.id);
                                                        setActionMenuId(null);
                                                        setActionConfirm(null);
                                                      } else {
                                                        setActionConfirm("delete");
                                                      }
                                                    }}
                                                    style={{
                                                      width: "100%",
                                                      padding: "7px 12px",
                                                      border: "none",
                                                      background:
                                                        actionConfirm === "delete" ? `${C.red}15` : "transparent",
                                                      color: C.red,
                                                      display: "flex",
                                                      alignItems: "center",
                                                      gap: 8,
                                                      fontSize: 12,
                                                      cursor: "pointer",
                                                      transition: T.transition.fast,
                                                    }}
                                                    onMouseEnter={e => {
                                                      if (actionConfirm !== "delete")
                                                        e.currentTarget.style.background = `${C.red}10`;
                                                    }}
                                                    onMouseLeave={e => {
                                                      if (actionConfirm !== "delete")
                                                        e.currentTarget.style.background = "transparent";
                                                    }}
                                                  >
                                                    <Ic d={I.trash} size={11} color={C.red} />
                                                    <span>
                                                      {actionConfirm === "delete"
                                                        ? "Delete -- are you sure?"
                                                        : "Delete"}
                                                    </span>
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                            {/* Color/stroke/fill popover */}
                                            {isSelected && !isMeasuring && (
                                              <div
                                                style={{
                                                  position: "absolute",
                                                  top: "100%",
                                                  left: 0,
                                                  right: 0,
                                                  zIndex: 50,
                                                  padding: "8px 10px 8px 27px",
                                                  background: `linear-gradient(180deg, ${C.bg1}, ${C.bg2}30)`,
                                                  border: `1px solid ${C.border}`,
                                                  borderTop: "none",
                                                  borderRadius: "0 0 8px 8px",
                                                  boxShadow: T.shadow.md,
                                                  display: "flex",
                                                  flexDirection: "column",
                                                  gap: 5,
                                                }}
                                                onClick={e => e.stopPropagation()}
                                              >
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                  <span style={{ fontSize: 7, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, minWidth: 28 }}>Color</span>
                                                  <div style={{ display: "flex", gap: 3 }}>
                                                    {TO_COLORS.map(c => (
                                                      <div
                                                        key={c}
                                                        onClick={() => updateTakeoff(to.id, "color", c)}
                                                        style={{
                                                          width: 14,
                                                          height: 14,
                                                          borderRadius: 3,
                                                          background: c,
                                                          cursor: "pointer",
                                                          border: to.color === c ? "2px solid #fff" : "1px solid transparent",
                                                          boxShadow: to.color === c ? `0 0 0 1px ${c}, 0 0 6px ${c}40` : "none",
                                                          transition: "all 100ms",
                                                        }}
                                                      />
                                                    ))}
                                                    <div
                                                      style={{
                                                        position: "relative",
                                                        width: 14,
                                                        height: 14,
                                                        borderRadius: 3,
                                                        background: `conic-gradient(red, yellow, lime, cyan, blue, magenta, red)`,
                                                        cursor: "pointer",
                                                      }}
                                                      onClick={e => {
                                                        e.stopPropagation();
                                                        e.currentTarget.querySelector("input")?.click();
                                                      }}
                                                    >
                                                      <input
                                                        type="color"
                                                        value={to.color}
                                                        onChange={e => updateTakeoff(to.id, "color", e.target.value)}
                                                        onClick={e => e.stopPropagation()}
                                                        style={{ position: "absolute", opacity: 0, width: 0, height: 0, top: 0, left: 0 }}
                                                      />
                                                    </div>
                                                  </div>
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                  <span style={{ fontSize: 7, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, minWidth: 28 }}>Stroke</span>
                                                  <input type="range" min="1" max="10" step="1" value={to.strokeWidth ?? 3} onChange={e => updateTakeoff(to.id, "strokeWidth", Number(e.target.value))} style={{ width: 70, height: 3, accentColor: to.color, cursor: "pointer" }} />
                                                  <span style={{ fontSize: 8, color: C.textDim, fontFamily: T.font.sans, minWidth: 18 }}>{to.strokeWidth ?? 3}px</span>
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                  <span style={{ fontSize: 7, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, minWidth: 28 }}>Fill</span>
                                                  <input type="range" min="5" max="100" step="5" value={to.fillOpacity ?? 20} onChange={e => updateTakeoff(to.id, "fillOpacity", Number(e.target.value))} style={{ width: 70, height: 3, accentColor: to.color, cursor: "pointer" }} />
                                                  <span style={{ fontSize: 8, color: C.textDim, fontFamily: T.font.sans, minWidth: 24 }}>{to.fillOpacity ?? 20}%</span>
                                                </div>
                                              </div>
                                            )}
                                            {/* Inline cost edit popover */}
                                            {costEditId === to.id &&
                                              tkPanelTier !== "compact" &&
                                              (() => {
                                                const li = itemById[to.linkedItemId];
                                                if (!li)
                                                  return (
                                                    <div
                                                      style={{
                                                        position: "absolute",
                                                        top: "100%",
                                                        left: 0,
                                                        right: 0,
                                                        zIndex: T.z.dropdown + 1,
                                                        padding: "8px 12px",
                                                        background: C.bg1,
                                                        border: `1px solid ${C.border}`,
                                                        borderRadius: "0 0 8px 8px",
                                                        boxShadow: T.shadow.md,
                                                        fontSize: 9,
                                                        color: C.textDim,
                                                      }}
                                                      onClick={e => e.stopPropagation()}
                                                    >
                                                      No linked estimate item yet
                                                    </div>
                                                  );
                                                const upd = (field, val) =>
                                                  useItemsStore.getState().updateItem(li.id, field, Number(val) || 0);
                                                const costFields = [
                                                  { key: "material", label: "Material", short: "M" },
                                                  { key: "labor", label: "Labor", short: "L" },
                                                  { key: "equipment", label: "Equipment", short: "E" },
                                                  { key: "subcontractor", label: "Sub", short: "S" },
                                                ];
                                                return (
                                                  <div
                                                    style={{
                                                      position: "absolute",
                                                      top: "100%",
                                                      left: 0,
                                                      right: 0,
                                                      zIndex: T.z.dropdown + 1,
                                                      padding: "8px 10px",
                                                      background: `linear-gradient(180deg, ${C.bg1}, ${C.bg2}30)`,
                                                      border: `1px solid ${C.accent}30`,
                                                      borderTop: "none",
                                                      borderRadius: "0 0 8px 8px",
                                                      boxShadow: T.shadow.md,
                                                    }}
                                                    onClick={e => e.stopPropagation()}
                                                  >
                                                    <div style={{ fontSize: 8, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
                                                      Unit Costs
                                                    </div>
                                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                                                      {costFields.map(f => (
                                                        <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                          <span style={{ fontSize: 8, color: C.textDim, fontWeight: 600, width: 12 }}>{f.short}</span>
                                                          <input
                                                            type="number"
                                                            value={nn(li[f.key]) || ""}
                                                            onChange={e => upd(f.key, e.target.value)}
                                                            placeholder="0"
                                                            style={nInp(C, { background: C.bg2, border: `1px solid ${C.border}`, padding: "3px 5px", fontSize: 10, fontWeight: 600, borderRadius: 4, width: "100%", fontFeatureSettings: "'tnum'" })}
                                                          />
                                                        </div>
                                                      ))}
                                                    </div>
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, paddingTop: 4, borderTop: `1px solid ${C.border}` }}>
                                                      <span style={{ fontSize: 8, color: C.textDim }}>
                                                        Total: <strong style={{ color: C.green }}>{fmt(getItemTotal(li))}</strong>
                                                      </span>
                                                      <button onClick={() => setCostEditId(null)} style={{ fontSize: 8, color: C.accent, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                                                        Done
                                                      </button>
                                                    </div>
                                                  </div>
                                                );
                                              })()}
                                          </div>

                                          {/* Inline formula expression */}
                                          {hasFormula &&
                                            computedQty !== null &&
                                            displayQty !== null &&
                                            tkShowVars !== to.id && (
                                              <FormulaExpressionRow
                                                takeoff={to}
                                                measuredQty={displayQty}
                                                computedQty={computedQty}
                                                updateTakeoff={updateTakeoff}
                                                C={C}
                                                T={T}
                                              />
                                            )}

                                          {/* Dimension Engine */}
                                          {tkShowVars === to.id && (
                                            <TakeoffDimensionEngine
                                              takeoff={to}
                                              updateTakeoff={updateTakeoff}
                                              measuredQty={measuredQty}
                                              computedQty={computedQty}
                                              measurements={to.measurements || []}
                                              computeMeasurementValue={computeMeasurementValue}
                                              selectedDrawingId={selectedDrawingId}
                                              removeMeasurement={removeMeasurement}
                                              drawingViewType={selectedDrawing?.viewType || null}
                                            />
                                          )}
                                        </div>
                                      );
                                    })}
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
