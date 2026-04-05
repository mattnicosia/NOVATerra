import { useTheme } from "@/hooks/useTheme";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt } from "@/utils/styles";

export default function WallScheduleModal({ wallSchedule, setWallSchedule, createWallInstances }) {
  const C = useTheme();
  const T = C.T;

  if (!wallSchedule.results || wallSchedule.results.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={e => {
        if (e.target === e.currentTarget) setWallSchedule({ loading: false, results: null, error: null });
      }}
    >
      <div
        style={{
          background: C.bg,
          borderRadius: 12,
          border: `1px solid ${C.border}`,
          width: 580,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 16px 48px rgba(0,0,0,0.3)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Ic d={I.ai} size={16} color={C.accent} />
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Wall Types Detected</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: C.accent,
                background: `${C.accent}15`,
                padding: "2px 8px",
                borderRadius: 10,
              }}
            >
              {wallSchedule.results.length} found
            </span>
          </div>
          <button
            onClick={() => setWallSchedule({ loading: false, results: null, error: null })}
            style={{
              width: 28,
              height: 28,
              border: "none",
              background: C.bg2,
              color: C.textDim,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
        {/* Wall Types List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {wallSchedule.results.map((mapped, i) => {
            const wt = mapped.wallType;
            const specSummary = [];
            if (mapped.specs.Material) specSummary.push(mapped.specs.Material);
            if (mapped.specs.StudSize) specSummary.push(mapped.specs.StudSize);
            if (mapped.specs.MSStudSize) specSummary.push(mapped.specs.MSStudSize);
            if (mapped.specs.MSGauge) specSummary.push(mapped.specs.MSGauge);
            if (mapped.specs.CMUWidth) specSummary.push(`${mapped.specs.CMUWidth} CMU`);
            if (mapped.specs.ConcThickness) specSummary.push(`${mapped.specs.ConcThickness} Conc`);
            if (mapped.specs.PlanSpacing) specSummary.push(mapped.specs.PlanSpacing);
            if (mapped.specs.MSSpacing) specSummary.push(mapped.specs.MSSpacing);
            if (mapped.specs.WallHeight) specSummary.push(`${mapped.specs.WallHeight}' Ht`);
            const confColor =
              wt.confidence === "high" ? C.green : wt.confidence === "low" ? C.orange : C.textDim;
            return (
              <div
                key={i}
                style={{
                  padding: "10px 20px",
                  borderBottom: `1px solid ${C.bg2}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.accent, minWidth: 60 }}>
                    {mapped.label}
                  </span>
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 3,
                      background: wt.category === "exterior" ? `${C.orange}15` : `${C.blue}15`,
                      color: wt.category === "exterior" ? C.orange : C.blue,
                      textTransform: "uppercase",
                    }}
                  >
                    {wt.category}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 10,
                      color: C.textMuted,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {wt.description || ""}
                  </span>
                  <span style={{ fontSize: 8, fontWeight: 600, color: confColor }}>{wt.confidence}</span>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {specSummary.map((s, j) => (
                    <span
                      key={j}
                      style={{
                        fontSize: 9,
                        padding: "1px 6px",
                        borderRadius: 3,
                        background: `${C.accent}10`,
                        color: C.text,
                        fontFamily: T.font.sans,
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
                {wt.finishes && (
                  <div style={{ fontSize: 9, color: C.textDim }}>
                    {wt.finishes.interior && <span>Int: {wt.finishes.interior} </span>}
                    {wt.finishes.exterior && <span>Ext: {wt.finishes.exterior} </span>}
                    {wt.finishes.insulation && <span>Insul: {wt.finishes.insulation}</span>}
                  </div>
                )}
                {wt.notes && (
                  <div style={{ fontSize: 9, color: C.textDim, fontStyle: "italic" }}>{wt.notes}</div>
                )}
                {mapped.warnings.length > 0 && (
                  <div style={{ fontSize: 8, color: C.orange }}>⚠ {mapped.warnings.join(" | ")}</div>
                )}
              </div>
            );
          })}
        </div>
        {/* Modal Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: `1px solid ${C.border}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            onClick={() => setWallSchedule({ loading: false, results: null, error: null })}
            style={bt(C, {
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.textDim,
              padding: "8px 16px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
            })}
          >
            Cancel
          </button>
          <button
            onClick={() => createWallInstances(wallSchedule.results)}
            style={bt(C, {
              background: C.accent,
              color: "#fff",
              padding: "8px 20px",
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 6,
            })}
          >
            Create All ({wallSchedule.results.length})
          </button>
        </div>
      </div>
    </div>
  );
}
