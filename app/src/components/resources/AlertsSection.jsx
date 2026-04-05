import React from "react";
import { parseDateStr } from "@/utils/dateHelpers";
import { bt } from "@/utils/styles";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";

function AlertsSection({ warnings, C, T }) {
  if (!warnings || warnings.length === 0) return null;

  const isRed = w => w.type === "overloaded" || w.type === "conflict";
  const isAmber = w => w.type === "predicted_overload" || w.type === "load_imbalance";
  const alertBg = w => (isRed(w) ? "#FF3B3010" : isAmber(w) ? "#FF950010" : "#FBBF2410");
  const alertBorder = w => (isRed(w) ? "#FF3B3025" : isAmber(w) ? "#FF950025" : "#FBBF2425");
  const alertIcon = w => {
    if (w.type === "conflict") return "\u{1F534}";
    if (w.type === "overloaded") return "\u{1F534}";
    if (w.type === "predicted_overload") return "\u{1F7E0}";
    if (w.type === "load_imbalance") return "\u2696\uFE0F";
    return "\u26A0\uFE0F";
  };

  const handleSuggestion = (w, s) => {
    if (s.action === "reassign") {
      useEstimatesStore.getState().updateIndexEntry(w.estimateId, { estimator: s.target });
      useUiStore.getState().showToast(`Reassigned to ${s.target}`);
    } else if (s.action === "extend") {
      useEstimatesStore.getState().updateIndexEntry(w.estimateId, { bidDue: s.newBidDue });
      useUiStore.getState().showToast(`Extended due date by ${s.daysNeeded} day${s.daysNeeded !== 1 ? "s" : ""}`);
    }
  };

  // Sort: conflicts first, then overloaded, then predicted, then imbalance, then rest
  const priority = { conflict: 0, overloaded: 1, predicted_overload: 2, load_imbalance: 3, bid_cluster: 4 };
  const sorted = [...warnings].sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9));

  return (
    <div style={{ marginTop: T.space[5] }}>
      <div style={{ fontSize: T.fontSize.sm, fontWeight: 700, color: C.text, marginBottom: T.space[2] }}>Alerts</div>
      <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>
        {sorted.slice(0, 10).map((w, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: T.space[3],
              padding: `${T.space[2]}px ${T.space[3]}px`,
              background: alertBg(w),
              border: `1px solid ${alertBorder(w)}`,
              borderRadius: T.radius.md,
              fontSize: T.fontSize.xs,
              color: C.text,
            }}
          >
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{alertIcon(w)}</span>
            <div style={{ flex: 1 }}>
              {w.type === "conflict" && (
                <>
                  <div>
                    <strong>{w.estimateName}</strong> ({w.estimator}) needs to start{" "}
                    {parseDateStr(w.scheduledStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                    (before today) to meet{" "}
                    {parseDateStr(w.bidDue).toLocaleDateString("en-US", { month: "short", day: "numeric" })} deadline
                  </div>
                  {w.suggestions?.length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      {w.suggestions.map((s, si) => (
                        <button
                          key={si}
                          onClick={() => handleSuggestion(w, s)}
                          style={{
                            ...bt(C),
                            padding: "3px 10px",
                            fontSize: 9,
                            fontWeight: 600,
                            borderRadius: T.radius.sm,
                            color: s.action === "reassign" ? "#30D158" : "#60A5FA",
                            background: s.action === "reassign" ? "#30D15812" : "#60A5FA12",
                            border: `1px solid ${s.action === "reassign" ? "#30D15830" : "#60A5FA30"}`,
                          }}
                        >
                          {s.label}
                          {s.capacity ? ` (${s.capacity}h free)` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {w.type === "overloaded" && (
                <span>
                  <strong>{w.estimator}</strong> is overloaded on{" "}
                  {parseDateStr(w.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {w.hours}h
                  scheduled
                </span>
              )}
              {w.type === "predicted_overload" && (
                <span>
                  In{" "}
                  <strong>
                    {w.daysFromNow} day{w.daysFromNow !== 1 ? "s" : ""}
                  </strong>
                  , <strong>{w.estimator}</strong> will be at <strong>{w.utilization}%</strong> capacity ({w.hours}h
                  scheduled)
                </span>
              )}
              {w.type === "bid_cluster" && (
                <span>
                  <strong>{w.count} bids</strong> due the week of{" "}
                  {parseDateStr(w.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
              {w.type === "load_imbalance" && (
                <span>
                  <strong>{w.overloaded.name}</strong> at {w.overloaded.utilization}% while{" "}
                  <strong>{w.underloaded.name}</strong> is at {w.underloaded.utilization}% on{" "}
                  {parseDateStr(w.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AlertsSection;
