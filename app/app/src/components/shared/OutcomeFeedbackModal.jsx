import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import Modal from "./Modal";
import { bt, inp } from "@/utils/styles";
import { fmt } from "@/utils/format";

const LOST_REASONS = ["Price", "Relationship", "Qualification", "Scope", "Timeline", "Unknown"];

/**
 * OutcomeFeedbackModal — Prompts for outcome data when status changes to Won or Lost.
 * Feeds accuracy score and calibration engine.
 */
export default function OutcomeFeedbackModal({ estimate, status, onSave, onSkip }) {
  const C = useTheme();
  const T = C.T;
  const isWon = status === "Won";

  const [contractAmount, setContractAmount] = useState("");
  const [awardDate, setAwardDate] = useState("");
  const [competitor, setCompetitor] = useState("");
  const [lostReason, setLostReason] = useState("Price");
  const [notes, setNotes] = useState("");

  // Calculate deviation as user types
  const deviation = useMemo(() => {
    const amount = parseFloat(contractAmount.replace(/[^0-9.]/g, ""));
    if (!amount || !estimate?.grandTotal) return null;
    const dev = ((estimate.grandTotal - amount) / amount) * 100;
    return dev;
  }, [contractAmount, estimate?.grandTotal]);

  const handleSave = () => {
    const amount = parseFloat(contractAmount.replace(/[^0-9.]/g, ""));
    onSave({
      contractAmount: amount || 0,
      competitor: isWon ? "" : competitor,
      lostReason: isWon ? "" : lostReason,
      awardDate: isWon ? awardDate : "",
      notes,
    });
  };

  const labelStyle = {
    fontSize: 10,
    fontWeight: 600,
    color: C.textDim,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
    display: "block",
  };

  const fieldGap = { marginBottom: T.space[3] };

  return (
    <Modal onClose={onSkip}>
      <div style={{ padding: T.space[5], maxWidth: 420 }}>
        {/* Header */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 1,
            color: isWon ? "#34D399" : "#FB7185",
            marginBottom: 4,
          }}
        >
          {isWon ? "Won" : "Lost"}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: T.space[4] }}>
          {estimate?.name || "Untitled"}
        </div>

        {/* Your bid reference */}
        <div
          style={{
            fontSize: 11,
            color: C.textMuted,
            padding: "6px 10px",
            background: C.surfaceAlt || "rgba(255,255,255,0.03)",
            borderRadius: 6,
            marginBottom: T.space[4],
          }}
        >
          Your bid: <strong style={{ color: C.text }}>{estimate?.grandTotal ? fmt(estimate.grandTotal) : "—"}</strong>
        </div>

        {/* Won fields */}
        {isWon && (
          <>
            <div style={fieldGap}>
              <label style={labelStyle}>Final Contract Amount</label>
              <input
                autoFocus
                value={contractAmount}
                onChange={e => setContractAmount(e.target.value)}
                placeholder="e.g. 3,200,000"
                style={inp(C, { width: "100%", fontSize: 13 })}
              />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Award Date</label>
              <input
                type="date"
                value={awardDate}
                onChange={e => setAwardDate(e.target.value)}
                style={inp(C, { width: "100%", fontSize: 13 })}
              />
            </div>
          </>
        )}

        {/* Lost fields */}
        {!isWon && (
          <>
            <div style={fieldGap}>
              <label style={labelStyle}>Winning Bid Amount</label>
              <input
                autoFocus
                value={contractAmount}
                onChange={e => setContractAmount(e.target.value)}
                placeholder="e.g. 2,900,000"
                style={inp(C, { width: "100%", fontSize: 13 })}
              />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Winning Contractor</label>
              <input
                value={competitor}
                onChange={e => setCompetitor(e.target.value)}
                placeholder="e.g. ABC Construction"
                style={inp(C, { width: "100%", fontSize: 13 })}
              />
            </div>
            <div style={fieldGap}>
              <label style={labelStyle}>Reason</label>
              <select
                value={lostReason}
                onChange={e => setLostReason(e.target.value)}
                style={inp(C, { width: "100%", fontSize: 13 })}
              >
                {LOST_REASONS.map(r => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Deviation display */}
        {deviation !== null && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "8px 12px",
              borderRadius: 6,
              marginBottom: T.space[3],
              background: deviation > 0 ? "rgba(251,113,133,0.1)" : "rgba(52,211,153,0.1)",
              border: `1px solid ${deviation > 0 ? "rgba(251,113,133,0.25)" : "rgba(52,211,153,0.25)"}`,
              color: deviation > 0 ? "#FB7185" : "#34D399",
            }}
          >
            {deviation > 0
              ? `You were ${Math.abs(deviation).toFixed(1)}% high`
              : deviation < 0
                ? `Contract came in ${Math.abs(deviation).toFixed(1)}% under your estimate`
                : "Spot on!"}
          </div>
        )}

        {/* Notes */}
        <div style={fieldGap}>
          <label style={labelStyle}>Notes (optional)</label>
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any notes about this outcome..."
            style={inp(C, { width: "100%", fontSize: 12 })}
          />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: T.space[4] }}>
          <button
            onClick={onSkip}
            style={bt(C, {
              padding: "8px 16px",
              fontSize: 12,
              background: "transparent",
              color: C.textMuted,
              border: `1px solid ${C.border}`,
            })}
          >
            Skip
          </button>
          <button
            onClick={handleSave}
            style={bt(C, {
              padding: "8px 16px",
              fontSize: 12,
              background: isWon ? "#34D399" : "#FB7185",
              color: "#fff",
            })}
          >
            Save Outcome
          </button>
        </div>
      </div>
    </Modal>
  );
}
