// ScopeFromDrawingsPanel — "Generate Scope from Plans" with pipeline progress
import React, { useCallback } from "react";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { runFullScan } from "@/utils/scanRunner";
import { card } from "@/utils/styles";

const PHASES = [
  { key: "ocr", label: "OCR Pre-pass" },
  { key: "detect", label: "Schedule Detection" },
  { key: "notes", label: "Drawing Notes" },
  { key: "titleblock", label: "Title Block" },
  { key: "parse", label: "Schedule Parsing" },
  { key: "count", label: "Counting Marks" },
  { key: "params", label: "Parameter Detection" },
  { key: "rom", label: "ROM Generation" },
  { key: "scope", label: "Scope Outline" },
];

function PhaseStep({ phase, currentPhase, done, C, T }) {
  const isCurrent = phase.key === currentPhase;
  const color = done ? C.green : isCurrent ? C.accent : C.textDim;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, padding: "3px 0",
    }}>
      <div style={{
        width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
        background: done ? C.green : "transparent",
        border: done ? "none" : `2px solid ${isCurrent ? C.accent : `${C.textDim}30`}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {done && <span style={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>{"\u2713"}</span>}
        {isCurrent && !done && <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.accent }} />}
      </div>
      <span style={{ fontSize: 10, fontWeight: isCurrent ? 600 : 400, color, fontFamily: T.font.sans }}>
        {phase.label}
      </span>
    </div>
  );
}

export default function ScopeFromDrawingsPanel({ C, T }) {
  const drawings = useDrawingPipelineStore(s => s.drawings);
  const scanProgress = useDrawingPipelineStore(s => s.scanProgress);
  const scanResults = useDrawingPipelineStore(s => s.scanResults);
  const scanError = useDrawingPipelineStore(s => s.scanError);
  const stopScan = useDrawingPipelineStore(s => s.stopScan);

  const isScanning = !!scanProgress?.phase;
  const hasDrawings = drawings?.length > 0;
  const hasResults = !!scanResults?.schedules;

  const handleScan = useCallback(() => {
    runFullScan({
      onComplete: () => {},
      onError: (err) => console.error("[ScopeFromDrawings] Scan failed:", err),
    });
  }, []);

  // No drawings — minimal prompt
  if (!hasDrawings) {
    return (
      <div style={card(C, { padding: "16px 20px", marginBottom: 12 })}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          fontSize: 11, color: C.textDim, fontFamily: T.font.sans,
        }}>
          <span style={{ fontSize: 16, opacity: 0.5 }}>{"\uD83D\uDCC4"}</span>
          Upload drawings in the Plan Room to generate project-specific scope from your plans.
        </div>
      </div>
    );
  }

  // Scanning — progress UI
  if (isScanning) {
    const phaseIdx = PHASES.findIndex(p => p.key === scanProgress.phase);
    const progress = scanProgress.total > 0 ? Math.round((scanProgress.current / scanProgress.total) * 100) : 0;

    return (
      <div style={card(C, { padding: "16px 20px", marginBottom: 12 })}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: T.font.sans }}>
            Generating Scope from Plans
          </div>
          <button
            onClick={stopScan}
            style={{
              padding: "4px 12px", borderRadius: 6, fontSize: 10, fontWeight: 600,
              background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted,
              cursor: "pointer", fontFamily: T.font.sans,
            }}
          >Stop</button>
        </div>

        {/* Progress bar */}
        <div style={{
          height: 4, borderRadius: 2, background: `${C.textDim}15`, marginBottom: 12, overflow: "hidden",
        }}>
          <div style={{
            height: "100%", borderRadius: 2, background: C.accent,
            width: `${Math.max(5, progress)}%`, transition: "width 0.3s ease",
          }} />
        </div>

        <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 10, fontFamily: T.font.sans }}>
          {scanProgress.message || `Processing ${scanProgress.current}/${scanProgress.total}...`}
        </div>

        {/* Phase checklist */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, columnGap: 16 }}>
          {PHASES.map((phase, i) => (
            <PhaseStep
              key={phase.key}
              phase={phase}
              currentPhase={scanProgress.phase}
              done={i < phaseIdx}
              C={C} T={T}
            />
          ))}
        </div>
      </div>
    );
  }

  // Has results — summary
  if (hasResults) {
    const scheduleCount = scanResults.schedules?.length || 0;
    const lineItemCount = scanResults.lineItems?.length || 0;

    return (
      <div style={card(C, { padding: "16px 20px", marginBottom: 12 })}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontSize: 11, color: C.text, fontFamily: T.font.sans }}>
            <span style={{ color: C.green, fontWeight: 700, marginRight: 6 }}>{"\u2713"}</span>
            Scope generated from {drawings.length} drawing{drawings.length !== 1 ? "s" : ""}
            <span style={{ color: C.textDim, marginLeft: 8 }}>
              {scheduleCount} schedule{scheduleCount !== 1 ? "s" : ""} · {lineItemCount} line item{lineItemCount !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            onClick={handleScan}
            style={{
              padding: "4px 12px", borderRadius: 6, fontSize: 10, fontWeight: 600,
              background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted,
              cursor: "pointer", fontFamily: T.font.sans,
            }}
          >Re-scan</button>
        </div>
        {scanError && (
          <div style={{ fontSize: 10, color: C.red || "#ef4444", marginTop: 6, fontFamily: T.font.sans }}>
            {scanError}
          </div>
        )}
      </div>
    );
  }

  // Has drawings, no scan yet — action button
  return (
    <div style={card(C, { padding: "16px 20px", marginBottom: 12 })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: T.font.sans }}>
          {drawings.length} drawing{drawings.length !== 1 ? "s" : ""} uploaded — generate project-specific scope
        </div>
        <button
          onClick={handleScan}
          style={{
            padding: "8px 16px", borderRadius: 8,
            background: C.gradient, border: "none", cursor: "pointer",
            color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: T.font.sans,
            transition: "all 0.15s",
          }}
        >
          Generate Scope from Plans
        </button>
      </div>
      {scanError && (
        <div style={{ fontSize: 10, color: C.red || "#ef4444", marginTop: 6, fontFamily: T.font.sans }}>
          {scanError}
        </div>
      )}
    </div>
  );
}
