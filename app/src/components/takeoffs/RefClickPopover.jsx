import { useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";

// ── Schedule type display labels ──
const SCHEDULE_TYPE_LABELS = {
  "wall-types": "Wall Type Schedule",
  door: "Door Schedule",
  window: "Window Schedule",
  finish: "Finish Schedule",
  "plumbing-fixture": "Plumbing Fixture Schedule",
  equipment: "Equipment Schedule",
  "lighting-fixture": "Lighting Fixture Schedule",
  "mechanical-equipment": "Mechanical Equipment Schedule",
  "finish-detail": "Finish Detail Schedule",
};

export default function RefClickPopover({ refPopover, setRefPopover, setSelectedDrawingId, setDetailOverlayId }) {
  const C = useTheme();
  const scanResults = useDrawingPipelineStore(s => s.scanResults);

  // Find all schedule matches for this ref number across schedule types
  const scheduleMatches = useMemo(() => {
    if (!refPopover || !scanResults?.schedules?.length) return [];
    const label = refPopover.ref?.label || "";
    // Extract the number/mark portion (e.g. "212" from "Detail 3/A5.01" or just "212")
    const mark = label.replace(/^[^\d]*/, "").trim() || label;
    if (!mark) return [];

    const matches = [];
    for (const sched of scanResults.schedules) {
      if (!sched.entries?.length) continue;
      const matching = sched.entries.filter(e => {
        const entryMark = String(e.mark || "").trim();
        return entryMark === mark || entryMark === label;
      });
      if (matching.length > 0) {
        matches.push({
          scheduleType: sched.type,
          label: SCHEDULE_TYPE_LABELS[sched.type] || sched.type,
          sheetLabel: sched.sheetLabel || "",
          entries: matching,
        });
      }
    }
    return matches;
  }, [refPopover, scanResults]);

  if (!refPopover) return null;

  const { ref, targetDId } = refPopover;
  const hasMultipleScheduleMatches = scheduleMatches.length > 1;

  return (
    <div
      style={{
        position: "fixed",
        left: refPopover.x,
        top: refPopover.y,
        zIndex: 60,
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: 6,
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 160,
        maxWidth: 260,
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: C.text, padding: "2px 4px" }}>
        {ref.label} — {ref.type}
      </div>

      {/* Disambiguation: multiple schedule matches */}
      {hasMultipleScheduleMatches && (
        <div style={{ padding: "2px 4px", borderTop: `1px solid ${C.border}`, marginTop: 2 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: C.textDim, marginBottom: 3 }}>
            Found in {scheduleMatches.length} schedules:
          </div>
          {scheduleMatches.map((match, mi) => (
            <button
              key={mi}
              onClick={() => {
                // Navigate to the schedule's sheet if we can resolve it
                const sheetDId = targetDId; // default to the ref's target
                if (sheetDId) setSelectedDrawingId(sheetDId);
                setRefPopover(null);
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "4px 6px",
                marginBottom: 2,
                fontSize: 9,
                fontWeight: 600,
                background: `${C.accent}10`,
                border: `1px solid ${C.border}`,
                color: C.text,
                borderRadius: 4,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span style={{ color: C.accent }}>{match.label}</span>
              {match.sheetLabel && (
                <span style={{ color: C.textDim, marginLeft: 4 }}>({match.sheetLabel})</span>
              )}
              <div style={{ fontSize: 8, color: C.textDim, marginTop: 1 }}>
                {match.entries.length} entr{match.entries.length === 1 ? "y" : "ies"}: {match.entries.map(e => e.description || e.type || e.mark).filter(Boolean).slice(0, 2).join(", ")}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Single schedule match — show context */}
      {scheduleMatches.length === 1 && (
        <div style={{ padding: "2px 4px", fontSize: 9, color: C.textDim }}>
          {scheduleMatches[0].label}
          {scheduleMatches[0].entries[0]?.description && (
            <span> — {scheduleMatches[0].entries[0].description.slice(0, 50)}</span>
          )}
        </div>
      )}

      {targetDId && (
        <>
          <button
            onClick={() => {
              setSelectedDrawingId(targetDId);
              setRefPopover(null);
            }}
            style={{
              padding: "5px 8px",
              fontSize: 10,
              fontWeight: 600,
              background: `${C.accent}12`,
              border: `1px solid ${C.accent}30`,
              color: C.accent,
              borderRadius: 5,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            Open Page
          </button>
          <button
            onClick={() => {
              setDetailOverlayId(targetDId);
              setRefPopover(null);
            }}
            style={{
              padding: "5px 8px",
              fontSize: 10,
              fontWeight: 600,
              background: `${C.accent}08`,
              border: `1px solid ${C.border}`,
              color: C.text,
              borderRadius: 5,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            Plot Here
          </button>
        </>
      )}
      {!targetDId && (
        <div style={{ padding: "4px", fontSize: 9, color: C.textDim }}>
          Sheet {ref.targetSheet} not in drawing set
        </div>
      )}
      <button
        onClick={() => setRefPopover(null)}
        style={{
          padding: "3px 8px",
          fontSize: 9,
          background: "transparent",
          border: "none",
          color: C.textDim,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        Close
      </button>
    </div>
  );
}
