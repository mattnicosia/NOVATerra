// NovaROMCard — ROM estimate display with totals and schedule breakdown
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { card } from "@/utils/styles";

function StatPill({ label, value, unit, C, T, accent }) {
  return (
    <div style={{ minWidth: 80 }}>
      <div
        style={{
          fontSize: 9,
          color: C.textDim,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: 600,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span
          style={{
            fontSize: T.fontSize.lg,
            fontWeight: T.fontWeight.bold,
            color: accent ? C.purple || C.accent : C.text,
            fontFamily: "'Switzer', sans-serif",
          }}
        >
          {value}
        </span>
        {unit && <span style={{ fontSize: 10, color: C.textDim, fontWeight: 500 }}>{unit}</span>}
      </div>
    </div>
  );
}

export default function NovaROMCard({ C, T, scanResults }) {
  if (!scanResults) return null;

  return (
    <div
      style={{
        ...card(C),
        padding: T.space[5],
        gridColumn: "1 / -1",
        border: `1px solid ${C.purple || C.accent}15`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: T.space[3],
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
          <Ic d={I.ai} size={16} color={C.purple || C.accent} />
          <span style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.purple || C.accent }}>
            NOVA ROM
          </span>
        </div>
        {scanResults.rom?.sfEstimated && (
          <span
            style={{
              fontSize: 9,
              color: C.orange,
              fontWeight: 500,
              background: `${C.orange}10`,
              padding: "2px 8px",
              borderRadius: T.radius.full,
            }}
          >
            SF estimated by AI
          </span>
        )}
      </div>

      {/* ROM totals */}
      {scanResults.rom?.totals && (
        <div
          style={{
            display: "flex",
            gap: T.space[5],
            marginBottom: T.space[4],
            padding: `${T.space[4]}px`,
            background: `${C.purple || C.accent}04`,
            borderRadius: T.radius.sm,
            border: `1px solid ${C.purple || C.accent}10`,
          }}
        >
          {["low", "mid", "high"].map((tier, idx) => (
            <div key={tier} style={{ flex: 1, textAlign: "center", display: "flex", flexDirection: "column" }}>
              {idx > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    background: `${C.purple || C.accent}15`,
                  }}
                />
              )}
              <div
                style={{
                  fontSize: 9,
                  color: C.textDim,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                {tier === "low" ? "Low Estimate" : tier === "mid" ? "Mid Estimate" : "High Estimate"}
              </div>
              <div
                style={{
                  fontSize: T.fontSize.xl,
                  fontWeight: T.fontWeight.bold,
                  color: tier === "mid" ? C.text : C.purple || C.accent,
                  fontFamily: T.font.sans,
                }}
              >
                ${Math.round(scanResults.rom.totals[tier]).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: T.space[4] }}>
        {scanResults.rom?.projectSF && scanResults.rom?.totals && (
          <StatPill
            label="Cost/SF"
            value={`$${Math.round(scanResults.rom.totals.mid / scanResults.rom.projectSF)}`}
            unit="/SF"
            C={C}
            T={T}
            accent
          />
        )}
        <StatPill label="Schedules" value={scanResults.schedules?.length || 0} unit="detected" C={C} T={T} />
        <StatPill label="Line Items" value={scanResults.lineItems?.length || 0} unit="generated" C={C} T={T} />
        {scanResults.drawingNotes && (
          <StatPill
            label="Drawing Notes"
            value={scanResults.drawingNotes.reduce((s, r) => s + (r.notes?.length || 0), 0)}
            unit="extracted"
            C={C}
            T={T}
          />
        )}
      </div>

      {/* Schedule type breakdown */}
      {scanResults.schedules?.length > 0 && (
        <div style={{ marginTop: T.space[3], display: "flex", flexWrap: "wrap", gap: T.space[2] }}>
          {scanResults.schedules.map((s, i) => (
            <span
              key={i}
              style={{
                padding: "3px 8px",
                borderRadius: T.radius.full,
                background: `${C.purple || C.accent}08`,
                fontSize: 10,
                color: C.purple || C.accent,
                fontWeight: 500,
              }}
            >
              {s.title || s.type} · {s.entries?.length || 0} items · {s.sheetLabel}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
