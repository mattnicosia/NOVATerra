import { Suspense, lazy, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useItemsStore } from "@/stores/itemsStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp } from "@/utils/styles";
import { nn, fmt } from "@/utils/format";
import VectorScanResults from "@/components/takeoffs/VectorScanResults";
import SheetReferenceBadges from "@/components/takeoffs/SheetReferenceBadges";
import RefClickPopover from "@/components/takeoffs/RefClickPopover";
import DetailOverlay from "@/components/takeoffs/DetailOverlay";
import FloatingSpecsCard from "@/components/takeoffs/FloatingSpecsCard";
import CrossSheetScanBar from "@/components/takeoffs/CrossSheetScanBar";
import TakeoffContextMenu from "@/components/takeoffs/TakeoffContextMenu";
import DrawingEmptyState from "@/components/takeoffs/DrawingEmptyState";
import RemoteCursors from "@/components/drawings/RemoteCursors";
import DrawingAnalysisPanel from "@/components/takeoffs/DrawingAnalysisPanel";
import WallScheduleModal from "@/components/takeoffs/WallScheduleModal";
import PdfScheduleModal from "@/components/takeoffs/PdfScheduleModal";
import ScaleNotSetBanner from "@/components/takeoffs/ScaleNotSetBanner";
import MeasurementHUD from "@/components/takeoffs/MeasurementHUD";

const EstimatePage = lazy(() => import("@/pages/EstimatePage"));

/**
 * TakeoffDrawingViewer — the main drawing viewer area of the Takeoffs page.
 *
 * Contains the toolbar (drawing nav, zoom, scale, scan refs), sheet thumbnail strip,
 * measurement HUD, and the full canvas area with overlays.
 *
 * Reads Zustand stores directly for most state; receives refs and handler functions as props.
 */
export default function TakeoffDrawingViewer({
  // Refs
  canvasRef,
  cursorCanvasRef,
  drawingContainerRef,
  predictionCanvasRef,
  drawingImgRef,
  tkTransformRef,
  compactStripRef,
  shiftHeldRef,
  rafCursorRef,
  pendingCursorRef,
  snapAngleOnRef,
  // Canvas event handlers
  handleCanvasClick,
  handleDrawingWheel,
  handleDrawingMouseDown,
  // Core functions
  renderPdfPage,
  handleSelectDrawing,
  handleScanReferences,
  handlePdfRepairDrop,
  // Analysis triggers
  runDrawingAnalysis,
  runWallScheduleDetection,
  runPdfScheduleScan,
  runGeometryAnalysis,
  // Analysis state
  aiDrawingAnalysis,
  setAiDrawingAnalysis,
  wallSchedule,
  setWallSchedule,
  pdfSchedules,
  setPdfSchedules,
  geoAnalysis,
  setGeoAnalysis,
  acceptAllDrawingItems,
  acceptDrawingItem,
  createWallInstances,
  // Measurement engine
  hasScale,
  stopMeasuring,
  finishCalibration,
  addMeasurement,
  pauseMeasuring,
  // Context menu
  snapAngleOn,
  setSnapAngleOn,
  showMeasureLabels,
  setShowMeasureLabels,
  removeTakeoff,
  // Panel tab
  leftPanelTab,
  setLeftPanelTab,
  // Cross-sheet scan
  crossSheetScan,
  setCrossSheetScan,
  // Detail overlay & refs
  detailOverlayId,
  setDetailOverlayId,
  refPopover,
  setRefPopover,
  // Snap angle helper
  snapAngle,
}) {
  const C = useTheme();
  const T = C.T;

  // Drawings store
  const drawings = useDrawingPipelineStore(s => s.drawings);
  const selectedDrawingId = useDrawingPipelineStore(s => s.selectedDrawingId);
  const setSelectedDrawingId = useDrawingPipelineStore(s => s.setSelectedDrawingId);
  const pdfCanvases = useDrawingPipelineStore(s => s.pdfCanvases);
  const drawingScales = useDrawingPipelineStore(s => s.drawingScales);
  const setDrawingScales = useDrawingPipelineStore(s => s.setDrawingScales);
  const detectedReferences = useDrawingPipelineStore(s => s.detectedReferences);
  const refScanLoading = useDrawingPipelineStore(s => s.refScanLoading);

  // Takeoffs store
  const takeoffs = useDrawingPipelineStore(s => s.takeoffs);
  const tkTool = useDrawingPipelineStore(s => s.tkTool);
  const setTkTool = useDrawingPipelineStore(s => s.setTkTool);
  const tkActivePoints = useDrawingPipelineStore(s => s.tkActivePoints);
  const setTkActivePoints = useDrawingPipelineStore(s => s.setTkActivePoints);
  const tkActiveTakeoffId = useDrawingPipelineStore(s => s.tkActiveTakeoffId);
  const tkMeasureState = useDrawingPipelineStore(s => s.tkMeasureState);
  const setTkMeasureState = useDrawingPipelineStore(s => s.setTkMeasureState);
  const setTkCursorPt = useDrawingPipelineStore(s => s.setTkCursorPt);
  const tkCalibrations = useDrawingPipelineStore(s => s.tkCalibrations);
  const tkZoom = useDrawingPipelineStore(s => s.tkZoom);
  const setTkZoom = useDrawingPipelineStore(s => s.setTkZoom);
  const tkPan = useDrawingPipelineStore(s => s.tkPan);
  const setTkPan = useDrawingPipelineStore(s => s.setTkPan);
  const tkPanelWidth = useDrawingPipelineStore(s => s.tkPanelWidth);
  const tkPanelTier = useDrawingPipelineStore(s => s.tkPanelTier);
  const tkPanelOpen = useDrawingPipelineStore(s => s.tkPanelOpen);

  // Items store (for running total)
  const getTotals = useItemsStore(s => s.getTotals);

  // Derived
  const selectedDrawing = useMemo(
    () => drawings.find(d => d.id === selectedDrawingId),
    [drawings, selectedDrawingId],
  );

  return (
    <div
      style={{
        flex: 1,
        minWidth: 300,
        background: C.bg1,
        borderRadius: "6px",
        border: `1px solid ${C.border}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        marginLeft: tkPanelTier === "estimate" ? 0 : tkPanelOpen ? tkPanelWidth : 0,
        transition: "margin-left 0.2s ease-out",
        position: "relative",
        zIndex: 35,
      }}
    >
      {/* Toolbar */}
      <div style={{ borderBottom: `1px solid ${C.border}` }}>
        {/* Toolbar: Drawing nav + zoom + scale + tools */}
        <div style={{ padding: "6px 10px", display: "flex", gap: 6, alignItems: "center", overflow: "hidden" }}>
          {/* Drawing controls — hidden in estimate mode */}
          {tkPanelTier !== "estimate" && (
            <>
              {/* Tools now live as individual buttons in the vertical rail */}
              <button
                className="icon-btn"
                title="Previous"
                onClick={() => {
                  const idx = drawings.findIndex(d => d.id === selectedDrawingId);
                  if (idx > 0) {
                    setSelectedDrawingId(drawings[idx - 1].id);
                    if (drawings[idx - 1].type === "pdf" && drawings[idx - 1].data) renderPdfPage(drawings[idx - 1]);
                  }
                }}
                style={{
                  width: 24,
                  height: 24,
                  border: "none",
                  background: C.bg2,
                  color: C.textMuted,
                  borderRadius: 3,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: 11,
                  flexShrink: 0,
                }}
              >
                ◀
              </button>
              <div
                ref={compactStripRef}
                className="hide-scrollbar"
                style={{ display: "flex", gap: 4, overflowX: "auto", flex: 1, minWidth: 0, padding: "2px 0" }}
              >
                {drawings.length === 0 ? (
                  <div style={{ fontSize: 10, color: C.textDim, padding: "4px 8px", fontStyle: "italic" }}>
                    No drawings
                  </div>
                ) : (
                  drawings.map(d => {
                    const thumb = d.type === "pdf" ? pdfCanvases[d.id] : d.data;
                    const isAct = selectedDrawingId === d.id;
                    const hasMeas = takeoffs.some(to => (to.measurements || []).some(m => m.sheetId === d.id));
                    return (
                      <div
                        key={d.id}
                        data-drawing-id={d.id}
                        className="icon-btn"
                        onClick={() => {
                          setSelectedDrawingId(d.id);
                          if (d.type === "pdf" && d.data) renderPdfPage(d);
                        }}
                        title={`${d.sheetNumber || d.pageNumber || "?"} — ${d.sheetTitle || d.label || ""}`}
                        style={{
                          width: 60,
                          height: 40,
                          flexShrink: 0,
                          borderRadius: 4,
                          overflow: "hidden",
                          cursor: "pointer",
                          position: "relative",
                          border: isAct
                            ? `2px solid ${C.accent}`
                            : hasMeas
                              ? `1.5px solid ${C.accent}60`
                              : `1px solid ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)"}`,
                          boxShadow: isAct ? `0 0 8px ${C.accent}30` : hasMeas ? `0 0 6px ${C.accent}18` : "none",
                          background: C.bg2,
                        }}
                      >
                        {thumb ? (
                          <img
                            src={thumb}
                            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: d.data ? 1 : 0.4 }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "100%",
                              height: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 8,
                              color: C.textDim,
                            }}
                          >
                            {d.sheetNumber || "?"}
                          </div>
                        )}
                        {/* Revision badge */}
                        {d.supersedes && (
                          <div
                            style={{
                              position: "absolute",
                              top: 1,
                              right: 1,
                              fontSize: 6,
                              fontWeight: 800,
                              fontFamily: T.font.sans,
                              padding: "0 3px",
                              borderRadius: 3,
                              lineHeight: "12px",
                              background: "#F59E0B",
                              color: "#000",
                            }}
                          >
                            Rev {d.revision || ""}
                          </div>
                        )}
                        {/* Superseded overlay */}
                        {d.superseded && (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              background: "rgba(0,0,0,0.45)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              pointerEvents: "none",
                            }}
                          >
                            <span style={{ fontSize: 6, color: "#F59E0B", fontWeight: 700, fontFamily: T.font.sans }}>
                              SUPERSEDED
                            </span>
                          </div>
                        )}
                        {/* Takeoff-complete tint overlay */}
                        {hasMeas && !isAct && (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              background: `${C.accent}18`,
                              pointerEvents: "none",
                            }}
                          />
                        )}
                        <div
                          style={{
                            position: "absolute",
                            bottom: 0,
                            left: 0,
                            right: 0,
                            padding: "0 2px",
                            background: isAct ? `${C.accent}D0` : hasMeas ? `${C.accent}90` : "rgba(0,0,0,0.55)",
                            fontSize: 7,
                            fontWeight: 700,
                            color: "#fff",
                            textAlign: "center",
                            lineHeight: "14px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {d.sheetNumber || d.pageNumber || "?"}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <button
                className="icon-btn"
                title="Next"
                onClick={() => {
                  const idx = drawings.findIndex(d => d.id === selectedDrawingId);
                  if (idx < drawings.length - 1) {
                    setSelectedDrawingId(drawings[idx + 1].id);
                    if (drawings[idx + 1].type === "pdf" && drawings[idx + 1].data) renderPdfPage(drawings[idx + 1]);
                  }
                }}
                style={{
                  width: 24,
                  height: 24,
                  border: "none",
                  background: C.bg2,
                  color: C.textMuted,
                  borderRadius: 3,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: 11,
                  flexShrink: 0,
                }}
              >
                ▶
              </button>
              <div
                style={{
                  display: "flex",
                  gap: 2,
                  alignItems: "center",
                  borderLeft: `1px solid ${C.border}`,
                  paddingLeft: 6,
                  flexShrink: 0,
                }}
              >
                <button
                  onClick={() => setTkZoom(Math.max(25, tkZoom - 25))}
                  style={{
                    width: 22,
                    height: 22,
                    border: "none",
                    background: C.bg2,
                    color: C.textMuted,
                    borderRadius: 3,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  −
                </button>
                <span style={{ fontSize: 9, color: C.textDim, fontWeight: 600, width: 32, textAlign: "center" }}>
                  {tkZoom}%
                </span>
                <button
                  onClick={() => setTkZoom(Math.min(400, tkZoom + 25))}
                  style={{
                    width: 22,
                    height: 22,
                    border: "none",
                    background: C.bg2,
                    color: C.textMuted,
                    borderRadius: 3,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  +
                </button>
                <button
                  onClick={() => {
                    setTkZoom(100);
                    setTkPan({ x: 0, y: 0 });
                  }}
                  style={{
                    padding: "2px 6px",
                    border: "none",
                    background: C.bg2,
                    color: C.textDim,
                    borderRadius: 3,
                    cursor: "pointer",
                    fontSize: 8,
                    fontWeight: 600,
                  }}
                >
                  Fit
                </button>
              </div>
              {/* Scale dropdown */}
              {selectedDrawing && (
                <>
                  <div style={{ width: 1, height: 20, background: C.border, margin: "0 2px" }} />
                  <span style={{ fontWeight: 600, color: C.textDim, fontSize: 9 }}>Scale:</span>
                  <select
                    value={drawingScales[selectedDrawingId] || ""}
                    onChange={e => {
                      if (e.target.value === "custom") {
                        setTkTool("calibrate");
                        setTkActivePoints([]);
                        setTkMeasureState("idle");
                        setDrawingScales({ ...drawingScales, [selectedDrawingId]: "custom" });
                      } else {
                        setDrawingScales({ ...drawingScales, [selectedDrawingId]: e.target.value });
                      }
                    }}
                    style={inp(C, { width: 120, padding: "3px 6px", fontSize: 9 })}
                  >
                    <option value="">Not Set</option>
                    <optgroup label="Architectural">
                      <option value="full">1"=1' (Full)</option>
                      <option value="half">1/2"=1'</option>
                      <option value="3-8">3/8"=1'</option>
                      <option value="quarter">1/4"=1'</option>
                      <option value="3-16">3/16"=1'</option>
                      <option value="eighth">1/8"=1'</option>
                      <option value="3-32">3/32"=1'</option>
                      <option value="sixteenth">1/16"=1'</option>
                    </optgroup>
                    <optgroup label="Engineering">
                      <option value="eng10">1"=10'</option>
                      <option value="eng20">1"=20'</option>
                      <option value="eng30">1"=30'</option>
                      <option value="eng40">1"=40'</option>
                      <option value="eng50">1"=50'</option>
                      <option value="eng100">1"=100'</option>
                    </optgroup>
                    <optgroup label="Metric">
                      <option value="1:1">1:1</option>
                      <option value="1:5">1:5</option>
                      <option value="1:10">1:10</option>
                      <option value="1:20">1:20</option>
                      <option value="1:50">1:50</option>
                      <option value="1:100">1:100</option>
                      <option value="1:200">1:200</option>
                      <option value="1:500">1:500</option>
                    </optgroup>
                    <optgroup label="─────────">
                      <option value="custom">Custom (Calibrate)</option>
                    </optgroup>
                  </select>
                  {drawingScales[selectedDrawingId] && drawingScales[selectedDrawingId] !== "custom" && (
                    <span style={{ color: C.accent, fontWeight: 600, fontSize: 8 }}>✓</span>
                  )}
                  {drawingScales[selectedDrawingId] === "custom" && tkCalibrations[selectedDrawingId] && (
                    <span style={{ color: C.green, fontWeight: 600, fontSize: 8 }}>✓ Cal</span>
                  )}
                  {!drawingScales[selectedDrawingId] && !tkCalibrations[selectedDrawingId] && (
                    <span style={{ fontSize: 7, color: C.orange, fontWeight: 500 }} title="No scale set">
                      ⚠ No scale
                    </span>
                  )}
                </>
              )}
              {/* Scan References button */}
              {selectedDrawing && (
                <>
                  <div style={{ width: 1, height: 20, background: C.border, margin: "0 2px" }} />
                  <button
                    onClick={() => handleScanReferences()}
                    disabled={!!refScanLoading}
                    title="AI detects section/elevation/detail callout symbols"
                    style={{
                      padding: "3px 8px",
                      fontSize: 9,
                      fontWeight: 600,
                      border: `1px solid ${C.accent}40`,
                      background: `${C.accent}10`,
                      color: refScanLoading ? C.textDim : C.accent,
                      borderRadius: 4,
                      cursor: refScanLoading ? "default" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Ic d={I.search} size={9} color={refScanLoading ? C.textDim : C.accent} />
                    {refScanLoading === selectedDrawingId ? "Scanning..." : "Scan Refs"}
                    {detectedReferences[selectedDrawingId]?.length > 0 && !refScanLoading && (
                      <span
                        style={{
                          fontSize: 8,
                          fontWeight: 700,
                          background: C.accent,
                          color: "#fff",
                          borderRadius: 99,
                          padding: "0 4px",
                          minWidth: 14,
                          textAlign: "center",
                        }}
                      >
                        {detectedReferences[selectedDrawingId].length}
                      </span>
                    )}
                  </button>
                </>
              )}
              {/* Undo handled by left rail button + Ctrl+Z */}
              {/* Tools folder moved to left side of toolbar */}
              {/* Settings gear removed */}
            </>
          )}
          {/* Running total removed — shown in journey bar pills */}
        </div>
      </div>

      {/* ── Estimate mode: render full EstimatePage ── */}
      {tkPanelTier === "estimate" && (
        <div style={{ flex: 1, overflow: "auto" }}>
          <Suspense fallback={<div style={{ padding: 40, color: C.textMuted }}>Loading estimate...</div>}>
            <EstimatePage />
          </Suspense>
        </div>
      )}

      {/* ── Unified Measurement HUD (hidden in estimate mode) ── */}
      {tkPanelTier !== "estimate" && (
        <MeasurementHUD
          selectedDrawing={selectedDrawing}
          stopMeasuring={stopMeasuring}
          finishCalibration={finishCalibration}
          addMeasurement={addMeasurement}
          leftPanelTab={leftPanelTab}
          setLeftPanelTab={setLeftPanelTab}
        />
      )}

      {/* ── Drawing-only content (hidden in estimate mode) ── */}
      {tkPanelTier !== "estimate" && (
        <>
          {/* Scale-not-set banner */}
          <ScaleNotSetBanner
            selectedDrawingId={selectedDrawingId}
            hasScale={hasScale}
            tkMeasureState={tkMeasureState}
            drawingScales={drawingScales}
            setDrawingScales={setDrawingScales}
            setTkTool={setTkTool}
            setTkActivePoints={setTkActivePoints}
            setTkMeasureState={setTkMeasureState}
          />

          {/* AI Drawing Analysis Results */}
          <DrawingAnalysisPanel
            aiDrawingAnalysis={aiDrawingAnalysis}
            setAiDrawingAnalysis={setAiDrawingAnalysis}
            acceptAllDrawingItems={acceptAllDrawingItems}
            acceptDrawingItem={acceptDrawingItem}
          />

          {/* AI Wall Schedule Preview Modal */}
          <WallScheduleModal
            wallSchedule={wallSchedule}
            setWallSchedule={setWallSchedule}
            createWallInstances={createWallInstances}
          />

          {/* PDF Schedule Scan Results Modal */}
          <PdfScheduleModal pdfSchedules={pdfSchedules} setPdfSchedules={setPdfSchedules} />

          {/* Drawing display area */}
          <div
            ref={drawingContainerRef}
            onMouseDown={handleDrawingMouseDown}
            onContextMenu={e => e.preventDefault()}
            style={{
              flex: 1,
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: C.isDark ? "#1a1d24" : "#e5e7eb",
              position: "relative",
              cursor: "default",
            }}
          >
            {!selectedDrawing ? (
              <DrawingEmptyState
                drawings={drawings}
                pdfCanvases={pdfCanvases}
                setSelectedDrawingId={setSelectedDrawingId}
                renderPdfPage={renderPdfPage}
              />
            ) : !selectedDrawing.data ? (
              <div style={{ color: C.orange, fontSize: 12, textAlign: "center", padding: 20 }}>
                <Ic d={I.upload} size={24} color={C.orange} />
                <br />
                <span style={{ marginTop: 6, display: "block" }}>File needs re-upload</span>
                <span style={{ fontSize: 10, color: C.textDim }}>
                  Drawing data is not stored between sessions.
                  <br />
                  Go to <strong>Discovery</strong> to re-attach the file.
                </span>
              </div>
            ) : (
              <div
                ref={tkTransformRef}
                style={{
                  transform: `translate(${tkPan.x}px,${tkPan.y}px) scale(${tkZoom / 100})`,
                  transformOrigin: "0 0",
                  position: "relative",
                }}
              >
                {selectedDrawing.type === "image" ? (
                  <img
                    ref={drawingImgRef}
                    src={selectedDrawing.data}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                    onLoad={e => {
                      const w = e.target.naturalWidth,
                        h = e.target.naturalHeight;
                      if (canvasRef.current) {
                        canvasRef.current.width = w;
                        canvasRef.current.height = h;
                      }
                      if (cursorCanvasRef.current) {
                        cursorCanvasRef.current.width = w;
                        cursorCanvasRef.current.height = h;
                      }
                      if (predictionCanvasRef.current) {
                        predictionCanvasRef.current.width = w;
                        predictionCanvasRef.current.height = h;
                      }
                    }}
                  />
                ) : pdfCanvases[selectedDrawing.id] ? (
                  <img
                    ref={drawingImgRef}
                    src={pdfCanvases[selectedDrawing.id]}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                    onLoad={e => {
                      const w = e.target.naturalWidth,
                        h = e.target.naturalHeight;
                      if (canvasRef.current) {
                        canvasRef.current.width = w;
                        canvasRef.current.height = h;
                      }
                      if (cursorCanvasRef.current) {
                        cursorCanvasRef.current.width = w;
                        cursorCanvasRef.current.height = h;
                      }
                      if (predictionCanvasRef.current) {
                        predictionCanvasRef.current.width = w;
                        predictionCanvasRef.current.height = h;
                      }
                    }}
                  />
                ) : (
                  <div style={{ color: C.textDim, fontSize: 11 }}>Loading PDF page...</div>
                )}
                {/* Canvas overlay */}
                <canvas
                  ref={canvasRef}
                  className={`tk-canvas-cursor${(tkMeasureState === "measuring" || tkMeasureState === "paused") ? " tk-measuring" : ""}`}
                  onDrop={handlePdfRepairDrop}
                  onDragOver={e => e.preventDefault()}
                  onClick={handleCanvasClick}
                  onMouseMove={e => {
                    // Sync canvas dims with image to prevent cursor misalignment
                    const img = drawingImgRef?.current;
                    if (img && img.naturalWidth && canvasRef.current && canvasRef.current.width !== img.naturalWidth) {
                      const w = img.naturalWidth, h = img.naturalHeight;
                      canvasRef.current.width = w; canvasRef.current.height = h;
                      if (cursorCanvasRef.current) { cursorCanvasRef.current.width = w; cursorCanvasRef.current.height = h; }
                      if (predictionCanvasRef.current) { predictionCanvasRef.current.width = w; predictionCanvasRef.current.height = h; }
                    }
                    const rect = e.target.getBoundingClientRect();
                    const sx = (canvasRef.current?.width || 1) / rect.width;
                    const sy = (canvasRef.current?.height || 1) / rect.height;
                    const pt = { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };

                    // Idle/stopped: show pointer cursor when hovering over clickable measurements
                    if (tkMeasureState !== "measuring" && tkMeasureState !== "paused") {
                      const zs = Math.max(1, sx);
                      const cr = Math.max(30, 30 * zs),
                        lr = Math.max(12, 15 * zs);
                      let hovering = false;
                      for (const to of useDrawingPipelineStore.getState().takeoffs) {
                        for (const m of to.measurements || []) {
                          if (m.sheetId !== selectedDrawingId) continue;
                          if (m.type === "count") {
                            if (Math.sqrt((pt.x - m.points[0].x) ** 2 + (pt.y - m.points[0].y) ** 2) < cr)
                              hovering = true;
                          } else if (m.type === "linear" && m.points.length >= 2) {
                            for (let i = 0; i < m.points.length - 1; i++) {
                              const a = m.points[i],
                                b = m.points[i + 1];
                              const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
                              if (len < 1) continue;
                              const t2 = Math.max(
                                0,
                                Math.min(1, ((pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y)) / (len * len)),
                              );
                              const proj = { x: a.x + t2 * (b.x - a.x), y: a.y + t2 * (b.y - a.y) };
                              if (Math.sqrt((pt.x - proj.x) ** 2 + (pt.y - proj.y) ** 2) < lr) hovering = true;
                            }
                          } else if (m.type === "area" && m.points.length >= 3) {
                            let inside = false;
                            const pts2 = m.points;
                            for (let i = 0, j = pts2.length - 1; i < pts2.length; j = i++) {
                              const xi = pts2[i].x,
                                yi = pts2[i].y,
                                xj = pts2[j].x,
                                yj = pts2[j].y;
                              if (yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi)
                                inside = !inside;
                            }
                            if (inside) hovering = true;
                          }
                          if (hovering) break;
                        }
                        if (hovering) break;
                      }
                      // Idle — NovaCursor teal orb handles cursor display
                      return;
                    }

                    // Measuring: update cursor position for live preview (RAF throttled)
                    if (tkActivePoints.length === 0) return;
                    let snapped = pt;
                    if ((e.shiftKey || snapAngleOnRef.current) && tkActivePoints.length >= 1) {
                      snapped = snapAngle(tkActivePoints[tkActivePoints.length - 1], pt);
                    }
                    shiftHeldRef.current = e.shiftKey || snapAngleOnRef.current;
                    pendingCursorRef.current = snapped;
                    if (!rafCursorRef.current) {
                      rafCursorRef.current = requestAnimationFrame(() => {
                        rafCursorRef.current = null;
                        if (pendingCursorRef.current) setTkCursorPt(pendingCursorRef.current);
                      });
                    }
                  }}
                  onMouseLeave={() => setTkCursorPt(null)}
                  onMouseDown={e => {
                    if (e.button === 2 || e.button === 1) handleDrawingMouseDown(e);
                  }}
                  onContextMenu={e => e.preventDefault()}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "auto",
                    cursor: (tkMeasureState === "measuring" || tkMeasureState === "paused") ? "crosshair" : "default",
                  }}
                />
                {/* Prediction ghost overlay canvas — animated ghost markers */}
                <canvas
                  ref={predictionCanvasRef}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                  }}
                />
                {/* Cursor overlay canvas — lightweight layer for cursor-dependent rendering */}
                <canvas
                  ref={cursorCanvasRef}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                  }}
                />
                {/* ── Vector Scan Results Panel ── */}
                {geoAnalysis.results && (
                  <VectorScanResults
                    result={geoAnalysis.results}
                    onClose={() => setGeoAnalysis({ loading: false, results: null })}
                    scalePxPerFt={selectedDrawingId ? (drawingScales[selectedDrawingId] || 1) : 1}
                  />
                )}
                {/* ── Sheet Reference Badges ── */}
                <SheetReferenceBadges
                  selectedDrawingId={selectedDrawingId}
                  detectedReferences={detectedReferences}
                  setRefPopover={setRefPopover}
                  refPopover={refPopover}
                />
              </div>
            )}

            {/* Remote cursors overlay — shows other users' cursors on the canvas */}
            <RemoteCursors currentSheetId={selectedDrawingId} />

            {/* Reference click popover */}
            <RefClickPopover
              refPopover={refPopover}
              setRefPopover={setRefPopover}
              setSelectedDrawingId={setSelectedDrawingId}
              setDetailOverlayId={setDetailOverlayId}
            />

            {/* Detail Overlay — floating resizable panel showing referenced drawing */}
            {detailOverlayId && (
              <DetailOverlay drawingId={detailOverlayId} onClose={() => setDetailOverlayId(null)} />
            )}

            {/* Floating specs card — shows when measuring OR when module is active */}
            <FloatingSpecsCard detectedReferences={detectedReferences} setDetailOverlayId={setDetailOverlayId} />

            {/* (Prediction approval strip moved to unified HUD above toolbar) */}

            {/* Cross-sheet scan results bar */}
            <CrossSheetScanBar
              crossSheetScan={crossSheetScan}
              setCrossSheetScan={setCrossSheetScan}
              selectedDrawingId={selectedDrawingId}
              setSelectedDrawingId={setSelectedDrawingId}
              drawings={drawings}
              renderPdfPage={renderPdfPage}
            />

            {/* Right-click context menu — available in any mode */}
            <TakeoffContextMenu
              addMeasurement={addMeasurement}
              pauseMeasuring={pauseMeasuring}
              stopMeasuring={stopMeasuring}
              snapAngleOn={snapAngleOn}
              setSnapAngleOn={setSnapAngleOn}
              showMeasureLabels={showMeasureLabels}
              setShowMeasureLabels={setShowMeasureLabels}
              removeTakeoff={removeTakeoff}
            />
          </div>
        </>
      )}
    </div>
  );
}
