import { useMemo } from "react";
import { cardSolid } from "@/utils/styles";
import Avatar from "@/components/shared/Avatar";

/* ────────────────────────────────────────────────────────
   AtAGlance — Daily resource overview (board proposal P0)

   One-screen view: who's overloaded, what's due soon,
   what's unassigned. Replaces "Monday Morning War Room"
   — the same pressure exists every day of the week.
   ──────────────────────────────────────────────────────── */

const STATUS_COLORS = {
  ahead: "#30D158",
  "on-track": "#60A5FA",
  behind: "#FF9500",
  overdue: "#FF3B30",
  conflict: "#FF3B30",
};

function utilizationColor(pct) {
  if (pct <= 0) return "#30D158";
  if (pct <= 50) return "#30D158";
  if (pct <= 80) return "#FF9500";
  if (pct <= 100) return "#FBBF24";
  return "#FF3B30";
}

const hexAlpha = (hex, alpha) => {
  const a = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return hex + a;
};

export default function AtAGlance({ workload, C, T, onProjectClick, navigate }) {
  const {
    estimatorRows,
    unassignedEstimates,
    effectiveHoursPerDay,
    dailyLoad,
    warnings,
  } = workload;

  const todayStr = new Date().toISOString().slice(0, 10);
  const capHours = effectiveHoursPerDay || 7;

  // Estimators sorted by today's utilization (highest first)
  const rankedEstimators = useMemo(() => {
    return estimatorRows
      .map(row => {
        const load = dailyLoad?.get(todayStr)?.get(row.name);
        const hours = load?.totalHours || 0;
        const utilPct = Math.round((hours / capHours) * 100);
        return { ...row, todayHours: hours, utilPct };
      })
      .sort((a, b) => b.utilPct - a.utilPct);
  }, [estimatorRows, dailyLoad, todayStr, capHours]);

  // Bids due within 5 business days
  const urgentBids = useMemo(() => {
    const all = estimatorRows.flatMap(r =>
      r.estimates.map(e => ({ ...e, estimator: r.name, estimatorColor: r.color })),
    );
    return all
      .filter(e => e.daysRemaining >= 0 && e.daysRemaining <= 5)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [estimatorRows]);

  // Active conflicts + overloads
  const activeAlerts = useMemo(() => {
    return (warnings || []).filter(
      w => w.type === "conflict" || w.type === "overloaded" || w.type === "load_imbalance",
    );
  }, [warnings]);

  const dk = C.isDark;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: T.space[4], alignItems: "start" }}>
      {/* ── Column 1: Team Status ── */}
      <div style={{ ...cardSolid(C), padding: T.space[4] }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: T.space[3],
          }}
        >
          Team Status
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>
          {rankedEstimators.map(est => {
            const uColor = utilizationColor(est.utilPct);
            return (
              <div
                key={est.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: T.space[2],
                  padding: "6px 8px",
                  borderRadius: T.radius.sm,
                  background: dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                }}
              >
                <Avatar name={est.name} color={est.color} size={24} fontSize={10} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: T.fontSize.xs,
                      fontWeight: T.fontWeight.semibold,
                      color: C.text,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {est.name}
                  </div>
                  <div style={{ fontSize: 9, color: C.textDim }}>
                    {est.estimates.length} project{est.estimates.length !== 1 ? "s" : ""}
                  </div>
                </div>
                {/* Utilization thermometer */}
                <div style={{ width: 60, display: "flex", alignItems: "center", gap: 4 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      background: dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, est.utilPct)}%`,
                        background: uColor,
                        borderRadius: 2,
                      }}
                    />
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: uColor,
                    minWidth: 30,
                    textAlign: "right",
                  }}
                >
                  {est.utilPct}%
                </span>
              </div>
            );
          })}
          {rankedEstimators.length === 0 && (
            <div style={{ fontSize: T.fontSize.xs, color: C.textDim, padding: 8 }}>No estimators configured</div>
          )}
        </div>
      </div>

      {/* ── Column 2: Due Soon ── */}
      <div style={{ ...cardSolid(C), padding: T.space[4] }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: T.space[3],
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Due Within 5 Days</span>
          {urgentBids.length > 0 && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "#FF9500",
                background: "#FF950015",
                padding: "2px 6px",
                borderRadius: T.radius.full,
              }}
            >
              {urgentBids.length}
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>
          {urgentBids.map(est => {
            const dColor = est.daysRemaining === 0 ? "#FF3B30" : est.daysRemaining <= 2 ? "#FF9500" : "#FBBF24";
            const schedColor = STATUS_COLORS[est.scheduleStatus] || "#A78BFA";
            return (
              <div
                key={est.id}
                onClick={e => {
                  if (onProjectClick) onProjectClick({ ...est }, e);
                  else navigate?.(`/estimate/${est.id}/info`);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: T.space[2],
                  padding: "6px 8px",
                  borderRadius: T.radius.sm,
                  borderLeft: `3px solid ${dColor}`,
                  background: dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                  cursor: "pointer",
                  transition: "background 100ms",
                }}
              >
                <Avatar name={est.estimator || "?"} color={est.estimatorColor || "#666"} size={20} fontSize={8} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: T.fontSize.xs,
                      fontWeight: T.fontWeight.semibold,
                      color: C.text,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {est.name}
                  </div>
                  <div style={{ fontSize: 9, color: C.textDim }}>
                    {est.estimator || "Unassigned"} · {est.hoursLogged}h/{est.estimatedHours}h
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: dColor,
                      padding: "1px 6px",
                      borderRadius: T.radius.sm,
                      background: hexAlpha(dColor, 0.12),
                    }}
                  >
                    {est.daysRemaining === 0 ? "Today" : `${est.daysRemaining}d`}
                  </span>
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 600,
                      color: schedColor,
                      textTransform: "capitalize",
                    }}
                  >
                    {est.scheduleStatus?.replace("-", " ")}
                  </span>
                </div>
              </div>
            );
          })}
          {urgentBids.length === 0 && (
            <div style={{ fontSize: T.fontSize.xs, color: "#30D158", padding: 8, textAlign: "center" }}>
              No bids due within 5 days
            </div>
          )}
        </div>
      </div>

      {/* ── Column 3: Needs Attention ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: T.space[4] }}>
        {/* Unassigned */}
        {unassignedEstimates.length > 0 && (
          <div style={{ ...cardSolid(C), padding: T.space[4], borderLeft: "3px solid #FBBF24" }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "#FBBF24",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: T.space[2],
              }}
            >
              Unassigned ({unassignedEstimates.length})
            </div>
            {unassignedEstimates.slice(0, 5).map(est => (
              <div
                key={est.id}
                onClick={e => {
                  if (onProjectClick) onProjectClick({ ...est, estimator: "" }, e);
                  else navigate?.(`/estimate/${est.id}/info`);
                }}
                style={{
                  fontSize: T.fontSize.xs,
                  color: C.text,
                  padding: "4px 0",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", flex: 1 }}>
                  {est.name}
                </span>
                <span style={{ fontSize: 9, color: C.textDim, flexShrink: 0, marginLeft: 8 }}>
                  {est.estimatedHours}h
                </span>
              </div>
            ))}
            {unassignedEstimates.length > 5 && (
              <div style={{ fontSize: 9, color: C.textDim, marginTop: 4 }}>
                +{unassignedEstimates.length - 5} more
              </div>
            )}
          </div>
        )}

        {/* Alerts summary */}
        {activeAlerts.length > 0 && (
          <div style={{ ...cardSolid(C), padding: T.space[4], borderLeft: "3px solid #FF3B30" }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "#FF3B30",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: T.space[2],
              }}
            >
              Alerts ({activeAlerts.length})
            </div>
            {activeAlerts.slice(0, 4).map((w, i) => (
              <div key={i} style={{ fontSize: T.fontSize.xs, color: C.text, padding: "3px 0" }}>
                {w.type === "conflict" && (
                  <span>
                    <strong>{w.estimateName}</strong> — schedule conflict ({w.estimator})
                  </span>
                )}
                {w.type === "overloaded" && (
                  <span>
                    <strong>{w.estimator}</strong> overloaded — {w.hours}h
                  </span>
                )}
                {w.type === "load_imbalance" && (
                  <span>
                    {w.overloaded.name} at {w.overloaded.utilization}% vs {w.underloaded.name} at{" "}
                    {w.underloaded.utilization}%
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* All clear */}
        {unassignedEstimates.length === 0 && activeAlerts.length === 0 && (
          <div style={{ ...cardSolid(C), padding: T.space[4], textAlign: "center" }}>
            <div style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: "#30D158" }}>All Clear</div>
            <div style={{ fontSize: T.fontSize.xs, color: C.textDim, marginTop: 2 }}>
              No unassigned bids or schedule conflicts
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
