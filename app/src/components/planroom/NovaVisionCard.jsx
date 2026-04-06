// NovaVisionCard — Discovery pipeline status with progress steps
import { useNavigate } from "react-router-dom";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";

import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, card } from "@/utils/styles";

function PipelineStep({ label, done, detail, C, T }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: T.radius.sm,
        background: done ? `${C.green}08` : `${C.textDim}06`,
        border: `1px solid ${done ? C.green : C.textDim}12`,
        minWidth: 120,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: done ? C.green : "transparent",
          border: done ? "none" : `2px solid ${C.textDim}30`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {done && <Ic d={I.check} size={8} color="#fff" />}
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: done ? C.text : C.textDim }}>{label}</div>
        {detail && (
          <div style={{ fontSize: 8, color: done ? C.green : C.textDim, fontWeight: 500, marginTop: 1 }}>{detail}</div>
        )}
      </div>
    </div>
  );
}

export default function NovaVisionCard({
  C,
  T,
  estId,
  drawings,
  specs,
  documents,
  labeledCount,
  scaledCount,
  autoDetected,
  scanResults,
  scanProgress,
  outlineCount,
  rescanning,
  setRescanning,
  setShowScanModal,
  stopScan,
}) {
  const navigate = useNavigate();

  // Overall discovery progress bar
  const steps = [
    drawings.length > 0,
    labeledCount > 0,
    scaledCount > 0,
    Object.keys(autoDetected).length > 0,
    !!scanResults?.schedules,
    !!scanResults?.drawingNotes,
    !!scanResults?.rom,
    outlineCount > 0,
    specs.length > 0,
  ];
  const done = steps.filter(Boolean).length;
  const pct = Math.round((done / steps.length) * 100);

  return (
    <div style={{ ...card(C), padding: T.space[5], gridColumn: "1 / -1" }}>
      <div style={{ display: "flex", alignItems: "center", gap: T.space[2], marginBottom: T.space[3] }}>
        <Ic d={I.ai} size={16} color={C.purple || C.accent} />
        <span style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.text }}>Nova Vision</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => navigate(`/estimate/${estId}/insights`)}
          style={bt(C, {
            fontSize: 10,
            color: C.accent,
            padding: "4px 10px",
            background: `${C.accent}08`,
            border: `1px solid ${C.accent}20`,
            borderRadius: T.radius.sm,
          })}
        >
          <Ic d={I.insights} size={11} color={C.accent} /> View Insights
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: T.space[3] }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: C.textMuted }}>Discovery Progress</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: done === steps.length ? C.green || "#22c55e" : C.accent,
            }}
          >
            {done}/{steps.length} — {pct}%
          </span>
        </div>
        <div
          style={{
            width: "100%",
            height: 6,
            borderRadius: 3,
            background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 3,
              width: `${pct}%`,
              background:
                done === steps.length
                  ? `linear-gradient(90deg, ${C.green || "#22c55e"}, ${C.green || "#22c55e"}cc)`
                  : `linear-gradient(90deg, ${C.accent}, ${C.purple || C.accent})`,
              transition: "width 0.4s ease",
            }}
          />
        </div>
      </div>

      {/* Scan progress banner */}
      {rescanning && scanProgress?.phase && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 14px",
            marginBottom: T.space[3],
            borderRadius: T.radius.sm,
            background: `linear-gradient(135deg, ${C.orange || "#F59E0B"}08, ${C.orange || "#F59E0B"}04)`,
            border: `1px solid ${C.orange || "#F59E0B"}18`,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 12,
              height: 12,
              border: `2px solid ${C.orange || "#F59E0B"}40`,
              borderTop: `2px solid ${C.orange || "#F59E0B"}`,
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 11, color: C.text, fontWeight: 500 }}>
            {scanProgress.message || "Scanning..."}
          </span>
          {scanProgress.total > 0 && (
            <span style={{ fontSize: 10, color: C.textDim, fontFamily: T.font.sans }}>
              {scanProgress.current}/{scanProgress.total}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <div
            style={{
              width: 80,
              height: 4,
              borderRadius: 2,
              background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: 2,
                width:
                  scanProgress.total > 0
                    ? `${Math.round((scanProgress.current / scanProgress.total) * 100)}%`
                    : "30%",
                background: C.orange || "#F59E0B",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <button
            onClick={() => {
              stopScan();
              setRescanning(false);
            }}
            style={{
              background: "transparent",
              border: `1px solid ${C.red || "#ef4444"}30`,
              color: C.red || "#ef4444",
              fontSize: 9,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 5,
              cursor: "pointer",
              fontFamily: T.font.sans,
              flexShrink: 0,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = `${C.red || "#ef4444"}10`;
              e.currentTarget.style.borderColor = `${C.red || "#ef4444"}50`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = `${C.red || "#ef4444"}30`;
            }}
          >
            Stop
          </button>
        </div>
      )}

      {/* Run Discovery prompt */}
      {!scanResults && !scanProgress.phase && !rescanning && drawings.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
            marginBottom: T.space[3],
            borderRadius: T.radius.sm,
            background: `linear-gradient(135deg, ${C.accent}08, ${C.accent}04)`,
            border: `1px solid ${C.accent}20`,
          }}
        >
          <Ic d={I.ai} size={16} color={C.accent} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>
              {drawings.length} drawings ready for discovery
            </div>
            <div style={{ fontSize: 9, color: C.textDim, marginTop: 2 }}>
              NOVA will detect schedules, extract notes, and generate a rough order of magnitude estimate.
            </div>
          </div>
          <button
            onClick={async () => {
              setRescanning(true);
              const { runFullScan } = await import("@/utils/scanRunner");
              runFullScan({
                onComplete: () => {
                  setRescanning(false);
                  setShowScanModal(true);
                },
                onError: () => setRescanning(false),
              });
            }}
            style={bt(C, {
              fontSize: 11,
              fontWeight: 600,
              padding: "6px 16px",
              borderRadius: T.radius.sm,
              color: "#fff",
              background: C.accent,
              border: "none",
              cursor: "pointer",
              flexShrink: 0,
            })}
          >
            Run Discovery
          </button>
        </div>
      )}

      {/* Pipeline steps */}
      <div style={{ display: "flex", gap: T.space[3], flexWrap: "wrap" }}>
        <PipelineStep label="Page Extraction" done={drawings.length > 0} detail={drawings.length > 0 ? `${drawings.length} pages` : null} C={C} T={T} />
        <PipelineStep label="Sheet Labeling" done={labeledCount > 0} detail={labeledCount > 0 ? `${labeledCount}/${drawings.length}` : null} C={C} T={T} />
        <PipelineStep label="Scale Detection" done={scaledCount > 0} detail={scaledCount > 0 ? `${scaledCount}/${drawings.length}` : null} C={C} T={T} />
        <PipelineStep label="Metadata Extraction" done={Object.keys(autoDetected).length > 0} detail={Object.keys(autoDetected).length > 0 ? `${Object.keys(autoDetected).length} fields` : null} C={C} T={T} />
        <PipelineStep label="Schedule Detection" done={!!scanResults?.schedules} detail={scanResults?.schedules ? `${scanResults.schedules.length} found` : null} C={C} T={T} />
        <PipelineStep label="Drawing Notes" done={!!scanResults?.drawingNotes} detail={scanResults?.drawingNotes ? `${scanResults.drawingNotes.reduce((s, r) => s + (r.notes?.length || 0), 0)} notes` : null} C={C} T={T} />
        <PipelineStep label="ROM Generation" done={!!scanResults?.rom} detail={scanResults?.rom?.totals ? `$${Math.round(scanResults.rom.totals.mid / 1000)}K` : null} C={C} T={T} />
        <PipelineStep label="Building Outline" done={outlineCount > 0} detail={outlineCount > 0 ? `${outlineCount} plan${outlineCount > 1 ? "s" : ""}` : null} C={C} T={T} />
        <PipelineStep label="Spec Parsing" done={specs.length > 0} detail={specs.length > 0 ? `${specs.length} sections` : null} C={C} T={T} />
      </div>
    </div>
  );
}
