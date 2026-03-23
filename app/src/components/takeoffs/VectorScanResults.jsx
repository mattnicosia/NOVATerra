// VectorScanResults — overlay panel showing wall detection results
import { useTheme } from "@/hooks/useTheme";
import { card } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

const MODE_BADGES = {
  residential: { icon: "🏠", label: "Residential", color: "#10B981" },
  commercial: { icon: "🏢", label: "Commercial", color: "#3B82F6" },
  framing: { icon: "⚠️", label: "Framing Plan", color: "#F59E0B" },
  unknown: { icon: "❓", label: "Unknown", color: "#6B7280" },
};

export default function VectorScanResults({ result, onClose, scalePxPerFt }) {
  const C = useTheme();
  const T = C.T;

  if (!result) return null;

  const { drawingMode, walls, rooms, stats } = result;
  const mode = MODE_BADGES[drawingMode?.mode] || MODE_BADGES.unknown;

  // Convert px² areas to SF if we have scale
  const ppf = scalePxPerFt || 1;
  const roomsWithSF = rooms.map(r => ({
    ...r,
    areaSF: r.area ? r.area / (ppf * ppf) : 0,
  }));
  const totalSF = roomsWithSF.reduce((s, r) => s + r.areaSF, 0);
  const wallLF = stats?.wallLF ? stats.wallLF / ppf : 0;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: 16,
        width: 280,
        zIndex: 50,
        ...card(C),
        background: C.bg1,
        border: `1px solid ${C.border}`,
        borderRadius: T.radius.lg,
        padding: 0,
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: `1px solid ${C.border}`,
          background: C.bg2,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{mode.icon}</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              fontFamily: T.font.display,
              color: mode.color,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {mode.label}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: C.textMuted,
            cursor: "pointer",
            padding: 4,
            borderRadius: 4,
            display: "flex",
          }}
        >
          <Ic icon={I.close} size={14} />
        </button>
      </div>

      {/* Framing plan message */}
      {drawingMode?.mode === "framing" && (
        <div style={{ padding: "14px 14px", color: C.textMuted, fontSize: 12, lineHeight: 1.5 }}>
          This appears to be a framing plan (regularly spaced joist lines). Wall detection is not supported on framing plans.
        </div>
      )}

      {/* Stats */}
      {drawingMode?.mode !== "framing" && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 1,
              background: C.border,
            }}
          >
            <StatCell label="Rooms" value={rooms.length} C={C} T={T} />
            <StatCell label="Total SF" value={totalSF > 0 ? `${totalSF.toFixed(0)}` : "—"} C={C} T={T} />
            <StatCell label="Wall LF" value={wallLF > 0 ? `${wallLF.toFixed(0)}` : `${walls.length} seg`} C={C} T={T} />
          </div>

          {/* Room list */}
          {roomsWithSF.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: "auto", padding: "8px 0" }}>
              {roomsWithSF.map((r, i) => (
                <div
                  key={r.id || i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "4px 14px",
                    fontSize: 12,
                    color: C.text,
                    fontFamily: T.font.display,
                  }}
                >
                  <span style={{ color: C.textMuted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.label || `Room ${i + 1}`}
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500, marginLeft: 8 }}>
                    {r.areaSF > 0 ? `${r.areaSF.toFixed(0)} SF` : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <div
        style={{
          padding: "6px 14px",
          borderTop: `1px solid ${C.border}`,
          fontSize: 10,
          color: C.textDim,
          fontFamily: T.font.display,
          textAlign: "center",
        }}
      >
        Vector extraction • No AI • {(result._runtime || 0).toFixed(2)}s
      </div>
    </div>
  );
}

function StatCell({ label, value, C, T }) {
  return (
    <div style={{ padding: "10px 8px", textAlign: "center", background: C.bg1 }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums", fontFamily: T.font.display }}>{value}</div>
      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}
