import { useTheme } from "@/hooks/useTheme";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useUndoStore } from "@/stores/undoStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

/**
 * Right-click context menu on the takeoff canvas.
 * Shows measuring actions when actively measuring, general actions otherwise.
 */
export default function TakeoffContextMenu({
  addMeasurement,
  pauseMeasuring,
  stopMeasuring,
  snapAngleOn,
  setSnapAngleOn,
  showMeasureLabels,
  setShowMeasureLabels,
  removeTakeoff,
}) {
  const C = useTheme();
  const tkContextMenu = useDrawingPipelineStore(s => s.tkContextMenu);
  const setTkContextMenu = useDrawingPipelineStore(s => s.setTkContextMenu);
  const tkMeasureState = useDrawingPipelineStore(s => s.tkMeasureState);
  const tkSelectedTakeoffId = useDrawingPipelineStore(s => s.tkSelectedTakeoffId);
  const setTkSelectedTakeoffId = useDrawingPipelineStore(s => s.setTkSelectedTakeoffId);
  const tkActivePoints = useDrawingPipelineStore(s => s.tkActivePoints);
  const setTkActivePoints = useDrawingPipelineStore(s => s.setTkActivePoints);
  const tkActiveTakeoffId = useDrawingPipelineStore(s => s.tkActiveTakeoffId);
  const takeoffs = useDrawingPipelineStore(s => s.takeoffs);
  const selectedDrawingId = useDrawingPipelineStore(s => s.selectedDrawingId);

  if (!tkContextMenu) return null;

  const isMeasuring = tkMeasureState === "measuring" || tkMeasureState === "paused";
  const selectedTo = tkSelectedTakeoffId ? takeoffs.find(t => t.id === tkSelectedTakeoffId) : null;
  const ctxCanUndo = useUndoStore.getState().canUndo();

  const menuItemStyle = color => ({
    padding: "7px 12px",
    fontSize: 10,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    color,
    borderBottom: `1px solid ${C.bg2}`,
  });

  const ctxIcon = (d, color, size = 12) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );

  return (
    <>
      <div onClick={() => setTkContextMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
      <div
        style={{
          position: "fixed",
          left: tkContextMenu.x,
          top: tkContextMenu.y,
          zIndex: 200,
          background: C.bg1,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          minWidth: 170,
          overflow: "hidden",
          animation: "fadeIn 0.1s",
        }}
      >
        {/* ── MEASURING ACTIONS ── */}
        {isMeasuring && tkActivePoints.length > 0 && (
          <div
            className="nav-item"
            onClick={() => {
              setTkActivePoints(tkActivePoints.slice(0, -1));
              setTkContextMenu(null);
            }}
            style={menuItemStyle(C.text)}
          >
            {ctxIcon("M1 4v6h6 M3.51 15a9 9 0 105.64-12.36L1 10", C.textMuted)}
            Undo Last Point
          </div>
        )}
        {isMeasuring && tkActivePoints.length >= 2 && useDrawingPipelineStore.getState().tkTool === "linear" && (
          <div
            className="nav-item"
            onClick={() => {
              const to = takeoffs.find(t => t.id === tkActiveTakeoffId);
              if (to && tkActivePoints.length >= 2) {
                addMeasurement(tkActiveTakeoffId, {
                  type: "linear",
                  points: [...tkActivePoints],
                  value: 0,
                  sheetId: selectedDrawingId,
                  color: to.color,
                });
              }
              pauseMeasuring();
              setTkContextMenu(null);
            }}
            style={menuItemStyle(C.accent)}
          >
            <Ic d={I.check} size={12} color={C.accent} /> Finish Segment
          </div>
        )}
        {isMeasuring && tkActivePoints.length >= 3 && useDrawingPipelineStore.getState().tkTool === "area" && (
          <div
            className="nav-item"
            onClick={() => {
              const to = takeoffs.find(t => t.id === tkActiveTakeoffId);
              if (to && tkActivePoints.length >= 3) {
                addMeasurement(tkActiveTakeoffId, {
                  type: "area",
                  points: [...tkActivePoints],
                  value: 0,
                  sheetId: selectedDrawingId,
                  color: to.color,
                });
              }
              pauseMeasuring();
              setTkContextMenu(null);
            }}
            style={menuItemStyle(C.accent)}
          >
            <Ic d={I.check} size={12} color={C.accent} /> Close & Finish Area
          </div>
        )}
        {isMeasuring && (
          <>
            <div
              className="nav-item"
              onClick={() => {
                setSnapAngleOn(v => !v);
                setTkContextMenu(null);
              }}
              style={menuItemStyle(snapAngleOn ? C.accent : C.text)}
            >
              {ctxIcon(
                "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z",
                snapAngleOn ? C.accent : C.textMuted,
              )}
              Snap Angle {snapAngleOn ? "\u2713" : ""}
            </div>
            <div
              className="nav-item"
              onClick={() => {
                stopMeasuring();
                setTkContextMenu(null);
              }}
              style={{
                ...menuItemStyle(C.red),
                borderBottom: "none",
                borderTop: `1px solid ${C.border}`,
                fontWeight: 600,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill={C.red}>
                <rect width="10" height="10" rx="1.5" />
              </svg>
              Stop Measuring
            </div>
          </>
        )}

        {/* ── GENERAL ACTIONS (always available) ── */}
        {!isMeasuring && (
          <>
            {/* Undo Last Measurement — when a takeoff with measurements is selected */}
            {selectedTo && selectedTo.measurements?.length > 0 && (
              <div
                className="nav-item"
                onClick={() => {
                  const lastM = selectedTo.measurements[selectedTo.measurements.length - 1];
                  useDrawingPipelineStore.getState().removeMeasurement(selectedTo.id, lastM.id);
                  useUiStore.getState().showToast("Undone last measurement", "info");
                  setTkContextMenu(null);
                }}
                style={menuItemStyle(C.text)}
              >
                {ctxIcon("M1 4v6h6 M3.51 15a9 9 0 105.64-12.36L1 10", C.textMuted)}
                Undo Last Measurement
              </div>
            )}
            {/* Global Undo — fallback when no takeoff selected */}
            {!selectedTo && (
              <div
                className="nav-item"
                onClick={() => {
                  if (ctxCanUndo) {
                    const actionName = useUndoStore.getState().undo();
                    if (actionName) useUiStore.getState().showToast(`Undone: ${actionName}`, "info");
                  }
                  setTkContextMenu(null);
                }}
                style={{
                  ...menuItemStyle(ctxCanUndo ? C.text : C.textMuted),
                  opacity: ctxCanUndo ? 1 : 0.5,
                }}
              >
                {ctxIcon("M1 4v6h6 M3.51 15a9 9 0 105.64-12.36L1 10", ctxCanUndo ? C.textMuted : C.bg2)}
                Undo
              </div>
            )}

            {/* Delete specific vertex point (right-clicked on a vertex handle) */}
            {tkContextMenu.hitVertex && (
              <div
                className="nav-item"
                onClick={() => {
                  const { takeoffId, measurementId, pointIndex } = tkContextMenu.hitVertex;
                  useDrawingPipelineStore.getState().removeMeasurementPoint(takeoffId, measurementId, pointIndex);
                  useUiStore.getState().showToast("Point deleted", "info");
                  setTkContextMenu(null);
                }}
                style={{ ...menuItemStyle(C.orange), fontWeight: 500 }}
              >
                {ctxIcon("M12 2a10 10 0 100 20 10 10 0 000-20z M8 12h8", C.orange)}
                Delete This Point
              </div>
            )}

            {/* Delete specific measurement (right-clicked on a measurement line) */}
            {tkContextMenu.hitMeasurement && (
              <div
                className="nav-item"
                onClick={() => {
                  const { takeoffId, measurementId } = tkContextMenu.hitMeasurement;
                  useDrawingPipelineStore.getState().removeMeasurement(takeoffId, measurementId);
                  useUiStore.getState().showToast("Measurement deleted", "info");
                  setTkContextMenu(null);
                }}
                style={{ ...menuItemStyle(C.orange), fontWeight: 500 }}
              >
                {ctxIcon("M3 6h18 M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2", C.orange)}
                Delete This Measurement
              </div>
            )}

            {/* Copy measurement to another takeoff */}
            {tkContextMenu.hitMeasurement && takeoffs.length > 1 && (
              <div style={{ position: "relative" }} className="ctx-copy-wrap">
                <div
                  className="nav-item"
                  style={menuItemStyle(C.text)}
                  onMouseEnter={e => {
                    const sub = e.currentTarget.parentElement.querySelector(".ctx-copy-sub");
                    if (sub) sub.style.display = "block";
                  }}
                  onMouseLeave={e => {
                    const sub = e.currentTarget.parentElement.querySelector(".ctx-copy-sub");
                    if (sub) sub.style.display = "none";
                  }}
                >
                  {ctxIcon("M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1 M16 3h2a2 2 0 012 2v7", C.textMuted)}
                  Copy to...
                  <span style={{ marginLeft: "auto", fontSize: 8, color: C.textDim }}>▸</span>
                </div>
                <div
                  className="ctx-copy-sub"
                  style={{
                    display: "none",
                    position: "absolute",
                    left: "100%",
                    top: 0,
                    width: 180,
                    maxHeight: 200,
                    overflow: "auto",
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                    zIndex: 100,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.display = "block")}
                  onMouseLeave={e => (e.currentTarget.style.display = "none")}
                >
                  {takeoffs
                    .filter(t => t.id !== tkContextMenu.hitMeasurement.takeoffId)
                    .map(t => (
                      <div
                        key={t.id}
                        className="nav-item"
                        onClick={() => {
                          const { takeoffId, measurementId } = tkContextMenu.hitMeasurement;
                          useDrawingPipelineStore.getState().copyMeasurement(takeoffId, measurementId, t.id);
                          useUiStore.getState().showToast(`Copied to "${t.description}"`, "info");
                          setTkContextMenu(null);
                        }}
                        style={{
                          padding: "5px 10px",
                          fontSize: 10,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          color: C.text,
                          borderBottom: `1px solid ${C.bg2}`,
                        }}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: t.color, flexShrink: 0 }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.description || "Untitled"}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Delete Selected Takeoff */}
            {selectedTo && (
              <div
                className="nav-item"
                onClick={() => {
                  removeTakeoff(selectedTo.id);
                  setTkSelectedTakeoffId(null);
                  setTkContextMenu(null);
                }}
                style={{ ...menuItemStyle(C.red), fontWeight: 500 }}
              >
                {ctxIcon("M12 2a10 10 0 100 20 10 10 0 000-20z M15 9l-6 6 M9 9l6 6", C.red)}
                Delete &ldquo;{selectedTo.description || "Takeoff"}&rdquo;
              </div>
            )}

            {/* Snap Angle toggle */}
            <div
              className="nav-item"
              onClick={() => {
                setSnapAngleOn(v => !v);
                setTkContextMenu(null);
              }}
              style={menuItemStyle(snapAngleOn ? C.accent : C.text)}
            >
              {ctxIcon(
                "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z",
                snapAngleOn ? C.accent : C.textMuted,
              )}
              Snap Angle {snapAngleOn ? "\u2713" : ""}
            </div>

            {/* Labels toggle */}
            <div
              className="nav-item"
              onClick={() => {
                setShowMeasureLabels(v => !v);
                setTkContextMenu(null);
              }}
              style={{ ...menuItemStyle(showMeasureLabels ? C.accent : C.text), borderBottom: "none" }}
            >
              {ctxIcon(
                "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
                showMeasureLabels ? C.accent : C.textMuted,
              )}
              Labels {showMeasureLabels ? "\u2713" : ""}
            </div>
          </>
        )}
      </div>
    </>
  );
}
