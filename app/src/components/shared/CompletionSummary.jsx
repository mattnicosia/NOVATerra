import { useTheme } from "@/hooks/useTheme";
import Modal from "./Modal";
import { fmt } from "@/utils/format";
import { bt } from "@/utils/styles";

/**
 * CompletionSummary — Shown when an estimate status changes to "Submitted".
 * Celebrates the work invested and shows key stats.
 */
export default function CompletionSummary({ estimate, onClose }) {
  const C = useTheme();
  const T = C.T;

  if (!estimate) return null;

  const hours = estimate.timerTotalMs ? Math.round((estimate.timerTotalMs / 3600000) * 10) / 10 : 0;
  const itemCount = estimate.itemCount || 0;
  const drawingCount = estimate.drawingCount || 0;
  const divisionCount = estimate.divisionTotals ? Object.keys(estimate.divisionTotals).length : 0;

  const stats = [
    { value: hours || "—", label: "hours" },
    { value: itemCount || "—", label: "items" },
    { value: drawingCount || "—", label: "drawings" },
    { value: divisionCount || "—", label: "divisions" },
  ];

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: T.space[6], textAlign: "center", maxWidth: 400 }}>
        {/* Header */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 1,
            color: "#34D399",
            marginBottom: 4,
          }}
        >
          Bid Submitted
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: T.space[5] }}>
          {estimate.name || "Untitled"}
        </div>

        {/* Stats grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 8,
            marginBottom: T.space[5],
          }}
        >
          {stats.map((s, i) => (
            <div
              key={i}
              style={{
                padding: "12px 4px",
                background: "rgba(52,211,153,0.06)",
                border: "1px solid rgba(52,211,153,0.15)",
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{s.value}</div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Bid total */}
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Bid total</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          {estimate.grandTotal ? fmt(estimate.grandTotal) : "—"}
        </div>
        {estimate.bidDue && (
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: T.space[5] }}>Due: {estimate.bidDue}</div>
        )}

        {/* Continue */}
        <button
          onClick={onClose}
          style={bt(C, {
            padding: "10px 24px",
            fontSize: 12,
            background: C.accent,
            color: "#fff",
          })}
        >
          Continue
        </button>
      </div>
    </Modal>
  );
}
