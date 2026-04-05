import { useTheme } from "@/hooks/useTheme";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useUiStore } from "@/stores/uiStore";
import useMeasurementEngine from "@/hooks/useMeasurementEngine";
import { inp, nInp, bt } from "@/utils/styles";
import { nn } from "@/utils/format";
import { hexAlpha } from "@/utils/fieldPhysics";
import { recordPredictionFeedback } from "@/utils/predictiveEngine";

export default function MeasurementHUD({
  selectedDrawing,
  stopMeasuring,
  finishCalibration,
  addMeasurement,
  leftPanelTab,
  setLeftPanelTab,
}) {
  const C = useTheme();
  const T = C.T;
  const showToast = useUiStore(s => s.showToast);
  const setShowNotesPanel = useUiStore(s => s.setShowNotesPanel);

  const tkTool = useDrawingPipelineStore(s => s.tkTool);
  const setTkTool = useDrawingPipelineStore(s => s.setTkTool);
  const tkActivePoints = useDrawingPipelineStore(s => s.tkActivePoints);
  const setTkActivePoints = useDrawingPipelineStore(s => s.setTkActivePoints);
  const tkActiveTakeoffId = useDrawingPipelineStore(s => s.tkActiveTakeoffId);
  const tkMeasureState = useDrawingPipelineStore(s => s.tkMeasureState);
  const tkCalibInput = useDrawingPipelineStore(s => s.tkCalibInput);
  const setTkCalibInput = useDrawingPipelineStore(s => s.setTkCalibInput);
  const tkAutoCount = useDrawingPipelineStore(s => s.tkAutoCount);
  const setTkAutoCount = useDrawingPipelineStore(s => s.setTkAutoCount);
  const takeoffs = useDrawingPipelineStore(s => s.takeoffs);
  const tkPredictions = useDrawingPipelineStore(s => s.tkPredictions);
  const tkPredAccepted = useDrawingPipelineStore(s => s.tkPredAccepted);
  const tkPredRejected = useDrawingPipelineStore(s => s.tkPredRejected);
  const tkPredContext = useDrawingPipelineStore(s => s.tkPredContext);
  const tkPredRefining = useDrawingPipelineStore(s => s.tkPredRefining);
  const acceptPrediction = useDrawingPipelineStore(s => s.acceptPrediction);
  const clearPredictions = useDrawingPipelineStore(s => s.clearPredictions);

  const selectedDrawingId = useDrawingPipelineStore(s => s.selectedDrawingId);
  const { getDisplayUnit, hasScale, getMeasuredQty } = useMeasurementEngine();

  // Determine HUD mode
  const hudCalibrating = tkTool === "calibrate" && tkActivePoints.length === 2;
  const hudAutoCount = !!tkAutoCount;
  const hudMeasuring = selectedDrawing?.data && tkMeasureState !== "idle" && tkActiveTakeoffId;
  const hudPredictions = tkPredictions && tkPredictions.predictions.length > 0;
  const hudActive = hudCalibrating || hudAutoCount || hudMeasuring || hudPredictions;
  if (!hudActive) return null;

  const activeTo = hudMeasuring ? takeoffs.find(t => t.id === tkActiveTakeoffId) : null;
  const mQty = activeTo ? getMeasuredQty(activeTo) : 0;
  const scaleSet = hasScale(selectedDrawingId);
  const calUnit = getDisplayUnit(selectedDrawingId);
  const toolLabel = tkTool === "count" ? "Count" : tkTool === "linear" ? "Linear" : "Area";
  const predColor = activeTo?.color || C.accent;

  // Prediction helpers
  const preds = hudPredictions ? tkPredictions.predictions : [];
  const pending = preds.filter(p => !tkPredAccepted.includes(p.id) && !tkPredRejected.includes(p.id));
  const accepted = preds.filter(p => tkPredAccepted.includes(p.id));

  // One-click: accept all pending predictions and immediately create measurements
  const handleAcceptAllAndConfirm = () => {
    const drawingId = useDrawingPipelineStore.getState().selectedDrawingId;
    const toAdd = preds.filter(p => !tkPredRejected.includes(p.id) && !tkPredAccepted.includes(p.id));
    if (tkActiveTakeoffId && toAdd.length > 0) {
      toAdd.forEach(() => recordPredictionFeedback(tkPredictions?.tag, tkPredictions?.strategy, true));
      toAdd.forEach(pred => {
        if (pred.type === "count" || pred.type === "wall-tag") {
          addMeasurement(tkActiveTakeoffId, {
            type: "count",
            points: [pred.point],
            value: 1,
            sheetId: drawingId,
            color: activeTo?.color || "#5b8def",
            predicted: true,
            tag: tkPredictions.tag,
          });
        } else if (pred.type === "wall" && pred.points?.length >= 2) {
          addMeasurement(tkActiveTakeoffId, {
            type: "linear",
            points: pred.points,
            value: 0,
            sheetId: drawingId,
            color: activeTo?.color || "#5b8def",
            predicted: true,
            tag: tkPredictions.tag,
          });
        } else if (pred.type === "area" && pred.points?.length >= 3) {
          addMeasurement(tkActiveTakeoffId, {
            type: "area",
            points: pred.points,
            value: 0,
            sheetId: drawingId,
            color: activeTo?.color || "#5b8def",
            predicted: true,
            tag: pred.tag || tkPredictions.tag,
          });
        }
      });
      showToast(`Added ${toAdd.length} predicted measurements`);
    }
    clearPredictions();
  };

  const handleDismiss = () => clearPredictions();

  return (
    <div
      style={{
        height: 32,
        padding: "0 12px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: hudCalibrating
          ? "rgba(220,38,38,0.05)"
          : hudAutoCount
            ? "rgba(168,126,230,0.06)"
            : activeTo
              ? `${activeTo.color}08`
              : C.bg1,
        transition: "background 0.2s ease",
        flexShrink: 0,
        animation: "fadeIn 0.15s ease-out",
        position: "relative",
      }}
    >
      {/* ─ Calibrating mode ─ */}
      {hudCalibrating && (
        <>
          <span style={{ fontSize: 13 }}>📐</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#dc2626" }}>Set scale:</span>
          <input
            type="number"
            value={tkCalibInput.dist}
            onChange={e => setTkCalibInput({ ...tkCalibInput, dist: e.target.value })}
            placeholder="Distance..."
            autoFocus
            style={nInp(C, {
              width: 80,
              padding: "4px 6px",
              fontSize: 11,
              fontWeight: 600,
              border: "1px solid #dc2626",
            })}
          />
          <select
            value={tkCalibInput.unit}
            onChange={e => setTkCalibInput({ ...tkCalibInput, unit: e.target.value })}
            style={inp(C, { width: 50, padding: "4px 3px", fontSize: 9 })}
          >
            <option value="ft">ft</option>
            <option value="in">in</option>
            <option value="m">m</option>
            <option value="cm">cm</option>
          </select>
          <button
            className="accent-btn"
            onClick={finishCalibration}
            disabled={!nn(tkCalibInput.dist)}
            style={bt(C, {
              background: nn(tkCalibInput.dist) ? "#dc2626" : C.bg3,
              color: nn(tkCalibInput.dist) ? "#fff" : C.textDim,
              padding: "4px 12px",
              fontSize: 9,
            })}
          >
            ✓ Set
          </button>
          <button
            onClick={() => {
              setTkActivePoints([]);
              setTkTool("select");
            }}
            style={bt(C, {
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.textDim,
              padding: "4px 8px",
              fontSize: 9,
            })}
          >
            ✕
          </button>
        </>
      )}

      {/* ─ Auto Count mode ─ */}
      {!hudCalibrating && hudAutoCount && (
        <>
          <span style={{ fontSize: 13 }}>🔢</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: C.purple }}>Auto Count</span>
          {tkAutoCount.phase === "select" && (
            <span style={{ fontSize: 9, color: C.text }}>
              Click a <strong>sample symbol</strong> to count matches
            </span>
          )}
          {tkAutoCount.phase === "scanning" && (
            <span style={{ fontSize: 9, color: C.text, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: 12 }}>
                ⟳
              </span>{" "}
              Scanning...
            </span>
          )}
          {tkAutoCount.phase === "done" && (
            <span style={{ fontSize: 9, color: C.green, fontWeight: 600 }}>
              Found {tkAutoCount.results?.length || 0} matches
            </span>
          )}
          <button
            onClick={() => setTkAutoCount(null)}
            style={bt(C, {
              marginLeft: "auto",
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.textDim,
              padding: "3px 10px",
              fontSize: 8,
            })}
          >
            ✕
          </button>
        </>
      )}

      {/* ─ Measuring mode (compact) ─ */}
      {!hudCalibrating && !hudAutoCount && hudMeasuring && activeTo && (
        <>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: tkMeasureState === "measuring" ? activeTo.color : C.orange,
              animation: tkMeasureState === "measuring" ? "pulse 1.5s infinite" : "none",
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: activeTo.color,
              maxWidth: 140,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {activeTo.description.substring(0, 30)}
          </span>
          <button
            onClick={stopMeasuring}
            title="Stop (Esc)"
            style={bt(C, {
              padding: "3px 10px",
              fontSize: 8,
              fontWeight: 600,
              borderRadius: 4,
              background: C.red,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              gap: 3,
            })}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="#fff">
              <rect width="8" height="8" rx="1" />
            </svg>{" "}
            Stop
          </button>
          <div style={{ width: 1, height: 16, background: C.border }} />
          <span style={{ fontSize: 9, fontWeight: 600, color: C.text }}>{toolLabel}:</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFamily: T.font.sans }}>
            {tkTool === "count" ? (
              `${mQty ?? 0} EA`
            ) : !scaleSet ? (
              <span style={{ color: C.orange, fontSize: 9 }}>⚠ Set scale</span>
            ) : (
              `${mQty ?? 0} ${tkTool === "area" ? calUnit + "²" : calUnit}`
            )}
          </span>
          <span style={{ fontSize: 8, color: C.textDim }}>
            {tkMeasureState === "measuring" ? "click to measure" : "paused"}
          </span>

          {/* NOVA Vision — compact HUD badge switches to NOVA tab */}
          {hudPredictions && pending.length > 0 && !tkPredRefining && (
            <button
              onClick={() => {
                setLeftPanelTab("nova");
                setShowNotesPanel(false);
              }}
              style={bt(C, {
                marginLeft: "auto",
                background: C.gradientSubtle,
                color: C.accent,
                border: `1px solid ${C.borderAccent}`,
                padding: "2px 8px",
                fontSize: 8,
                fontWeight: 700,
                borderRadius: 3,
              })}
            >
              <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: 0.5 }}>NOVA</span> {pending.length}{" "}
              {leftPanelTab === "nova" ? "◂" : "▸"}
            </button>
          )}
          {hudPredictions && tkPredRefining && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
                fontSize: 9,
                color: C.orange,
                marginLeft: "auto",
              }}
            >
              <span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: 10 }}>
                ⟳
              </span>{" "}
              Scanning
            </span>
          )}
        </>
      )}

      {/* ─ Predictions only (not measuring) — compact badge opens panel ─ */}
      {!hudCalibrating && !hudAutoCount && !hudMeasuring && hudPredictions && (
        <>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: tkPredRefining ? C.orange : pending.length > 0 ? C.accent : C.green,
              boxShadow: `0 0 8px ${tkPredRefining ? C.orange : pending.length > 0 ? C.accent : C.green}`,
              animation: tkPredRefining
                ? "spin 1s linear infinite"
                : pending.length > 0
                  ? "pulse 1.5s infinite"
                  : "none",
            }}
          />
          <span
            style={{
              fontSize: 8,
              fontWeight: 800,
              letterSpacing: 0.8,
              color: C.accent,
              background: C.gradientSubtle,
              padding: "2px 6px",
              borderRadius: 3,
            }}
          >
            NOVA VISION
          </span>
          {tkPredRefining ? (
            <span style={{ fontSize: 10, color: C.orange, fontWeight: 600 }}>Scanning...</span>
          ) : (
            <>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  background: `${predColor}20`,
                  color: predColor,
                  fontFamily: T.font.sans,
                  border: `1px solid ${predColor}30`,
                }}
              >
                {tkPredictions.tag || "—"}
              </span>
              <span style={{ fontSize: 10, color: C.text, fontWeight: 500 }}>
                {pending.length > 0 ? `${preds.length} found` : `${accepted.length} accepted`}
              </span>
            </>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => {
              setLeftPanelTab("nova");
              setShowNotesPanel(false);
            }}
            style={bt(C, {
              background: `${predColor}15`,
              color: predColor,
              border: `1px solid ${predColor}30`,
              padding: "2px 8px",
              fontSize: 8,
              fontWeight: 700,
              borderRadius: 3,
            })}
          >
            {leftPanelTab === "nova" ? "Hide Panel ◂" : `Review ${pending.length} ▸`}
          </button>
          <button
            onClick={handleDismiss}
            title="Dismiss"
            style={{
              width: 22,
              height: 22,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              background: C.bg2,
              color: C.textDim,
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke={C.textDim}
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M2 2l6 6M8 2l-6 6" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
