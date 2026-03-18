import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { bt, inp, cardSolid } from "@/utils/styles";
import Avatar from "@/components/shared/Avatar";

/* ────────────────────────────────────────────────────────
   WhatIfModal — "Can we take this on?" simulation.

   User enters name, hours, due date, discipline. The modal
   shows which estimator is the best fit and whether the
   team can absorb it without conflicts.
   ──────────────────────────────────────────────────────── */

const DISCIPLINES = ["", "structural", "MEP", "civil", "interiors", "finishes", "sitework", "general"];

function isWeekday(d) {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

function countWeekdays(start, end) {
  let count = 0;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const endD = new Date(end);
  endD.setHours(0, 0, 0, 0);
  while (d <= endD) {
    if (isWeekday(d)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export default function WhatIfModal({ workload, onClose }) {
  const C = useTheme();
  const T = C.T;
  const rawEstimators = useMasterDataStore(s => s.masterData?.estimators);
  const estimators = useMemo(() => rawEstimators || [], [rawEstimators]);

  const [name, setName] = useState("");
  const [hours, setHours] = useState(40);
  const [bidDue, setBidDue] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [discipline, setDiscipline] = useState("");

  const { estimatorRows, effectiveHoursPerDay, CAPACITY_HOURS, estimatorCapacity } = workload;
  const capHours = effectiveHoursPerDay || CAPACITY_HOURS;

  // Score each estimator
  const rankings = useMemo(() => {
    if (!hours || hours <= 0 || !bidDue) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(bidDue + "T00:00:00");
    const daysNeeded = Math.ceil(hours / capHours);
    const daysAvailable = countWeekdays(today, dueDate);

    return estimatorRows
      .map(row => {
        let score = 0;
        const reasons = [];

        // Skill match
        const est = estimators.find(e => e.name === row.name);
        const specs = est?.specialties || [];
        if (discipline && specs.includes(discipline)) {
          score += 3;
          reasons.push("Skill match");
        }

        // Check capacity over the work window
        const cap = estimatorCapacity?.get(row.name) || [];
        const relevantDays = cap.filter(c => {
          const d = new Date(c.date + "T00:00:00");
          return d >= today && d <= dueDate;
        });
        const avgRemaining =
          relevantDays.length > 0
            ? relevantDays.reduce((s, c) => s + c.remainingHours, 0) / relevantDays.length
            : capHours;
        const totalRemaining = relevantDays.reduce((s, c) => s + c.remainingHours, 0) || daysAvailable * capHours;

        // Can they fit it?
        const canFit = totalRemaining >= hours;
        if (canFit) {
          score += 3;
          reasons.push(`${Math.round(totalRemaining)}h available`);
        } else {
          score -= 3;
          reasons.push(`Only ${Math.round(totalRemaining)}h available`);
        }

        // Load balance — prefer lighter-loaded
        const utilization = capHours > 0 ? (capHours - avgRemaining) / capHours : 0;
        if (utilization < 0.5) {
          score += 2;
          reasons.push("Light load");
        } else if (utilization < 0.7) {
          score += 1;
        } else if (utilization > 0.9) {
          score -= 2;
          reasons.push("Near capacity");
        }

        // Current estimate count
        if (row.estimates.length <= 2) {
          score += 1;
        } else if (row.estimates.length >= 5) {
          score -= 1;
          reasons.push(`${row.estimates.length} active bids`);
        }

        return {
          name: row.name,
          color: row.color,
          score,
          canFit,
          reasons,
          avgRemaining: Math.round(avgRemaining * 10) / 10,
          totalRemaining: Math.round(totalRemaining),
          activeCount: row.estimates.length,
          daysNeeded,
          daysAvailable,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [hours, bidDue, discipline, estimatorRows, estimators, estimatorCapacity, capHours]);

  const canTakeOn = rankings.some(r => r.canFit);
  const bestFit = rankings[0];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.bg1,
          borderRadius: T.radius.lg,
          border: `1px solid ${C.border}`,
          boxShadow: T.shadow?.lg || "0 8px 30px rgba(0,0,0,0.25)",
          width: "90%",
          maxWidth: 520,
          maxHeight: "80vh",
          overflow: "auto",
          padding: T.space[5],
        }}
      >
        {/* Header */}
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: T.space[4] }}
        >
          <div>
            <div style={{ fontSize: T.fontSize.lg, fontWeight: 700, color: C.text }}>What If?</div>
            <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
              Simulate adding a new estimate to see team impact
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              ...bt(C),
              padding: "6px 10px",
              fontSize: T.fontSize.xs,
              color: C.textMuted,
              border: `1px solid ${C.border}`,
              borderRadius: T.radius.sm,
            }}
          >
            Close
          </button>
        </div>

        {/* Inputs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.space[3], marginBottom: T.space[4] }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                display: "block",
                marginBottom: 4,
              }}
            >
              Project Name
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Healthcare Center"
              style={{ ...inp(C), width: "100%", padding: "6px 10px", fontSize: T.fontSize.xs }}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                display: "block",
                marginBottom: 4,
              }}
            >
              Estimated Hours
            </label>
            <input
              type="number"
              min={1}
              value={hours}
              onChange={e => setHours(Number(e.target.value) || 0)}
              style={{ ...inp(C), width: "100%", padding: "6px 10px", fontSize: T.fontSize.xs }}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                display: "block",
                marginBottom: 4,
              }}
            >
              Bid Due Date
            </label>
            <input
              type="date"
              value={bidDue}
              onChange={e => setBidDue(e.target.value)}
              style={{ ...inp(C), width: "100%", padding: "6px 10px", fontSize: T.fontSize.xs }}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                display: "block",
                marginBottom: 4,
              }}
            >
              Primary Discipline
            </label>
            <select
              value={discipline}
              onChange={e => setDiscipline(e.target.value)}
              style={{ ...inp(C), width: "100%", padding: "6px 10px", fontSize: T.fontSize.xs }}
            >
              {DISCIPLINES.map(d => (
                <option key={d} value={d}>
                  {d || "— Any —"}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Answer */}
        {rankings.length > 0 && (
          <>
            <div
              style={{
                ...cardSolid(C),
                padding: T.space[4],
                marginBottom: T.space[4],
                borderLeft: `4px solid ${canTakeOn ? "#30D158" : "#FF3B30"}`,
              }}
            >
              <div
                style={{
                  fontSize: T.fontSize.base,
                  fontWeight: 700,
                  color: canTakeOn ? "#30D158" : "#FF3B30",
                  marginBottom: 4,
                }}
              >
                {canTakeOn ? "Yes — team can absorb this" : "Risk — may create conflicts"}
              </div>
              <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
                {bestFit && (
                  <>
                    Best fit: <strong>{bestFit.name}</strong> ({bestFit.totalRemaining}h available,{" "}
                    {bestFit.activeCount} active bids)
                    {bestFit.daysNeeded > bestFit.daysAvailable && (
                      <span style={{ color: "#FF9500" }}>
                        {" "}
                        — needs {bestFit.daysNeeded} work days but only {bestFit.daysAvailable} available
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Rankings */}
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                marginBottom: T.space[2],
              }}
            >
              Estimator Rankings
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {rankings.map((r, i) => (
                <div
                  key={r.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: T.space[3],
                    padding: `${T.space[2]}px ${T.space[3]}px`,
                    borderRadius: T.radius.sm,
                    background:
                      i === 0
                        ? `${r.canFit ? "#30D158" : "#FF3B30"}08`
                        : C.isDark
                          ? "rgba(255,255,255,0.02)"
                          : "rgba(0,0,0,0.02)",
                    border: `1px solid ${i === 0 ? (r.canFit ? "#30D15830" : "#FF3B3030") : C.border + "40"}`,
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.textDim, width: 16 }}>#{i + 1}</span>
                  <Avatar name={r.name} color={r.color} size={22} fontSize={8} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: T.fontSize.xs, fontWeight: 600, color: C.text }}>{r.name}</div>
                    <div style={{ fontSize: 8, color: C.textDim }}>{r.reasons.join(" · ")}</div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: r.canFit ? "#30D158" : "#FF3B30",
                      padding: "2px 8px",
                      borderRadius: 10,
                      background: r.canFit ? "#30D15812" : "#FF3B3012",
                    }}
                  >
                    {r.canFit ? "Can fit" : "Tight"}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
