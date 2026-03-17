import { useTheme } from "@/hooks/useTheme";
import { useBusinessMetrics } from "@/hooks/useBusinessMetrics";
import { useOrgStore, selectIsManager } from "@/stores/orgStore";
import { Navigate } from "react-router-dom";
import KPI from "@/components/shared/KPI";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { fmt } from "@/utils/format";

/* ────────────────────────────────────────────────────────
   BusinessDashboardPage — Owner's Portal

   Role-gated: only visible to owners & managers.
   Three sections: Pipeline, Team Capacity, Financial Overview.
   All data comes from estimatesIndex (lightweight, already in memory).
   ──────────────────────────────────────────────────────── */

export default function BusinessDashboardPage() {
  const C = useTheme();
  const T = C.T;
  const isManager = useOrgStore(selectIsManager);
  const orgName = useOrgStore(s => s.org?.name);
  const metrics = useBusinessMetrics();

  // Role gate — estimators can't access this page
  // In solo mode (no org), show the page anyway since the user is implicitly the owner
  const hasOrg = useOrgStore(s => !!s.org);
  if (hasOrg && !isManager) {
    return <Navigate to="/" replace />;
  }

  return (
    <div
      style={{
        padding: `${T.space[6]}px ${T.space[7]}px`,
        maxWidth: 1200,
        margin: "0 auto",
        fontFamily: T.font.display,
      }}
    >
      {/* Page Title */}
      <div style={{ marginBottom: T.space[6] }}>
        <h1
          style={{
            fontSize: T.fontSize["2xl"],
            fontWeight: T.fontWeight.bold,
            color: C.text,
            margin: 0,
          }}
        >
          Business Dashboard
        </h1>
        <p style={{ fontSize: T.fontSize.sm, color: C.textMuted, marginTop: T.space[1] }}>
          {orgName ? `${orgName} — ` : ""}Pipeline, capacity, and financial overview
        </p>
      </div>

      {/* ═══ Section A: Pipeline & Hit Rate ═══ */}
      <SectionHeader title="Pipeline & Hit Rate" icon={I.report} C={C} T={T} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: T.space[4],
          marginBottom: T.space[5],
        }}
      >
        <KPI
          label="Active Bids"
          value={metrics.pipeline.activeBidsCount}
          sub={`${metrics.pipeline.biddingCount} bidding, ${metrics.pipeline.submittedCount} submitted`}
          icon={I.bid}
          color="#007AFF"
        />
        <KPI
          label="Pipeline Value"
          value={fmt(metrics.pipeline.pipelineValue)}
          sub={`${metrics.pipeline.totalEstimates} total estimates`}
          icon={I.dollar}
          color="#30D158"
          accent
        />
        <KPI
          label="Win Rate"
          value={`${metrics.pipeline.winRate}%`}
          sub={`${metrics.pipeline.wonCount} won, ${metrics.pipeline.lostCount} lost`}
          icon={I.check}
          color="#FF9500"
        />
        <KPI
          label="Pending"
          value={metrics.pipeline.submittedCount}
          sub="Proposals awaiting decision"
          icon={I.send}
          color="#5AC8FA"
        />
      </div>

      {/* Status Distribution Bar */}
      <StatusBar distribution={metrics.statusDistribution} total={metrics.pipeline.totalEstimates} C={C} T={T} />

      {/* Recent Outcomes */}
      {metrics.recentOutcomes.length > 0 && (
        <Card C={C} T={T} style={{ marginTop: T.space[4], marginBottom: T.space[6] }}>
          <CardTitle C={C} T={T}>
            Recent Outcomes
          </CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {metrics.recentOutcomes.map(o => (
              <div
                key={o.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: `${T.space[3]}px ${T.space[4]}px`,
                  borderRadius: T.radius.sm,
                  background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: T.space[3], flex: 1, minWidth: 0 }}>
                  <StatusBadge status={o.status} T={T} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: T.fontSize.sm,
                        fontWeight: T.fontWeight.semibold,
                        color: C.text,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {o.name}
                    </div>
                    <div style={{ fontSize: T.fontSize.xs, color: C.textMuted }}>
                      {o.client}
                      {o.estimator ? ` \u00B7 ${o.estimator}` : ""}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: T.space[4] }}>
                  <div style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.semibold, color: C.text }}>
                    {fmt(o.contractAmount || o.grandTotal)}
                  </div>
                  {o.awardDate && <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>{o.awardDate}</div>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ═══ Section B: Team Capacity ═══ */}
      <SectionHeader title="Team Capacity" icon={I.estimate} C={C} T={T} />

      {/* Team Workload Table */}
      <Card C={C} T={T} style={{ marginBottom: T.space[4] }}>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: T.fontSize.sm,
            }}
          >
            <thead>
              <tr>
                {["Estimator", "Active", "Total", "Hours", "Avg Hrs/Est", "Won"].map(h => (
                  <th
                    key={h}
                    style={{
                      textAlign: h === "Estimator" ? "left" : "right",
                      padding: `${T.space[3]}px ${T.space[4]}px`,
                      fontSize: T.fontSize.xs,
                      fontWeight: T.fontWeight.bold,
                      color: C.textDim,
                      textTransform: "uppercase",
                      letterSpacing: T.tracking.wider,
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.teamCapacity.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{ padding: T.space[5], textAlign: "center", color: C.textMuted, fontSize: T.fontSize.sm }}
                  >
                    No estimator data yet
                  </td>
                </tr>
              )}
              {metrics.teamCapacity.map(est => (
                <tr key={est.name}>
                  <td
                    style={{
                      padding: `${T.space[3]}px ${T.space[4]}px`,
                      fontWeight: T.fontWeight.semibold,
                      color: C.text,
                      borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
                    }}
                  >
                    {est.name}
                  </td>
                  {[est.activeEstimates, est.totalEstimates, est.totalHours, est.avgHoursPerEstimate, est.wonCount].map(
                    (val, i) => (
                      <td
                        key={i}
                        style={{
                          padding: `${T.space[3]}px ${T.space[4]}px`,
                          textAlign: "right",
                          color: C.text,
                          fontVariantNumeric: "tabular-nums",
                          borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
                        }}
                      >
                        {val}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Upcoming Deadlines */}
      {metrics.upcoming.length > 0 && (
        <Card C={C} T={T} style={{ marginBottom: T.space[6] }}>
          <CardTitle C={C} T={T}>
            Upcoming Deadlines
          </CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {metrics.upcoming.map(e => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: `${T.space[3]}px ${T.space[4]}px`,
                  borderRadius: T.radius.sm,
                  background:
                    e.daysUntil < 0 ? (C.isDark ? "rgba(255,59,48,0.08)" : "rgba(255,59,48,0.06)") : "transparent",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: T.fontSize.sm,
                      fontWeight: T.fontWeight.semibold,
                      color: C.text,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {e.name}
                  </div>
                  <div style={{ fontSize: T.fontSize.xs, color: C.textMuted }}>
                    {e.estimator || "Unassigned"} \u00B7 {e.client}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: T.space[4] }}>
                  <div
                    style={{
                      fontSize: T.fontSize.sm,
                      fontWeight: T.fontWeight.bold,
                      color: e.daysUntil < 0 ? "#FF3B30" : e.daysUntil <= 3 ? "#FF9500" : C.text,
                    }}
                  >
                    {e.daysUntil < 0
                      ? `${Math.abs(e.daysUntil)}d overdue`
                      : e.daysUntil === 0
                        ? "Due today"
                        : `${e.daysUntil}d`}
                  </div>
                  <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>{e.bidDue}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ═══ Section C: Financial Overview ═══ */}
      <SectionHeader title="Financial Overview" icon={I.dollar} C={C} T={T} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: T.space[4],
          marginBottom: T.space[5],
        }}
      >
        <KPI
          label="Backlog Value"
          value={fmt(metrics.financial.backlogValue)}
          sub="Won contracts total"
          icon={I.layers}
          color="#30D158"
          accent
        />
        <KPI
          label="Avg Proposal"
          value={fmt(metrics.financial.avgProposalValue)}
          sub="Mean estimate value"
          icon={I.report}
          color="#5AC8FA"
        />
      </div>

      {/* Cost Per SF by Building Type */}
      {metrics.financial.costPerSF.length > 0 && (
        <Card C={C} T={T} style={{ marginBottom: T.space[4] }}>
          <CardTitle C={C} T={T}>
            Cost Per SF by Building Type
          </CardTitle>
          <div style={{ display: "flex", flexWrap: "wrap", gap: T.space[3] }}>
            {metrics.financial.costPerSF.map(item => (
              <div
                key={item.buildingType}
                style={{
                  padding: `${T.space[3]}px ${T.space[4]}px`,
                  borderRadius: T.radius.sm,
                  background: C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                  border: `1px solid ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
                  minWidth: 140,
                }}
              >
                <div
                  style={{
                    fontSize: T.fontSize.xs,
                    color: C.textMuted,
                    marginBottom: T.space[1],
                    textTransform: "capitalize",
                  }}
                >
                  {item.buildingType.replace(/_/g, " ")}
                </div>
                <div style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text }}>
                  {fmt(item.avgCostPerSF)}/SF
                </div>
                <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
                  {item.count} estimate{item.count !== 1 ? "s" : ""}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Revenue Trend */}
      {metrics.financial.revenueTrend.length > 0 && (
        <Card C={C} T={T} style={{ marginBottom: T.space[6] }}>
          <CardTitle C={C} T={T}>
            Won Revenue by Month
          </CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {metrics.financial.revenueTrend.map(r => (
              <div
                key={r.month}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: `${T.space[2]}px ${T.space[4]}px`,
                }}
              >
                <span style={{ fontSize: T.fontSize.sm, color: C.textMuted, minWidth: 80 }}>
                  {formatMonth(r.month)}
                </span>
                <div
                  style={{
                    flex: 1,
                    margin: `0 ${T.space[4]}px`,
                    height: 6,
                    borderRadius: 3,
                    background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      borderRadius: 3,
                      background: C.gradient || C.accent,
                      width: `${Math.min(100, (r.value / Math.max(...metrics.financial.revenueTrend.map(x => x.value), 1)) * 100)}%`,
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: T.fontSize.sm,
                    fontWeight: T.fontWeight.semibold,
                    color: C.text,
                    minWidth: 80,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmt(r.value)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Helper Components ──

function SectionHeader({ title, icon, C, T }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: T.space[3],
        marginBottom: T.space[4],
        marginTop: T.space[2],
      }}
    >
      <Ic d={icon} size={16} color={C.accent} sw={2} />
      <h2
        style={{
          fontSize: T.fontSize.lg,
          fontWeight: T.fontWeight.bold,
          color: C.text,
          margin: 0,
        }}
      >
        {title}
      </h2>
      <div
        style={{
          flex: 1,
          height: 1,
          background: C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
        }}
      />
    </div>
  );
}

function Card({ C, T, children, style }) {
  return (
    <div
      className="widget-card"
      style={{
        borderRadius: T.radius.md,
        background: C.isDark
          ? C.glassBg || "rgba(15,15,30,0.38)"
          : `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 50%), ${C.glassBg || "rgba(255,255,255,0.32)"}`,
        backdropFilter: T.glass.blur,
        WebkitBackdropFilter: T.glass.blur,
        border: `1px solid ${T.glass.border || (C.isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.25)")}`,
        boxShadow: [T.glass.specular, T.shadow.sm, T.glass.edge].filter(Boolean).join(", "),
        padding: T.space[5],
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardTitle({ C, T, children }) {
  return (
    <div
      style={{
        fontSize: T.fontSize.sm,
        fontWeight: T.fontWeight.bold,
        color: C.textDim,
        textTransform: "uppercase",
        letterSpacing: T.tracking.wider,
        marginBottom: T.space[4],
      }}
    >
      {children}
    </div>
  );
}

function StatusBadge({ status, T }) {
  const colors = {
    Won: { bg: "rgba(48,209,88,0.15)", color: "#30D158" },
    Lost: { bg: "rgba(255,59,48,0.15)", color: "#FF3B30" },
    Bidding: { bg: "rgba(0,122,255,0.15)", color: "#007AFF" },
    Submitted: { bg: "rgba(255,149,0,0.15)", color: "#FF9500" },
  };
  const c = colors[status] || { bg: "rgba(142,142,147,0.15)", color: "#8E8E93" };
  return (
    <span
      style={{
        fontSize: T.fontSize.xs,
        fontWeight: T.fontWeight.bold,
        color: c.color,
        background: c.bg,
        padding: "2px 8px",
        borderRadius: T.radius.full,
        flexShrink: 0,
      }}
    >
      {status}
    </span>
  );
}

function StatusBar({ distribution, total, C, T }) {
  if (total === 0) return null;
  return (
    <div style={{ marginBottom: T.space[4] }}>
      {/* Bar */}
      <div
        style={{
          display: "flex",
          height: 8,
          borderRadius: 4,
          overflow: "hidden",
          background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
        }}
      >
        {distribution
          .filter(d => d.count > 0)
          .map(d => (
            <div
              key={d.status}
              title={`${d.status}: ${d.count}`}
              style={{
                width: `${(d.count / total) * 100}%`,
                background: d.color,
                transition: "width 0.5s ease",
              }}
            />
          ))}
      </div>
      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: T.space[4], marginTop: T.space[2] }}>
        {distribution
          .filter(d => d.count > 0)
          .map(d => (
            <div key={d.status} style={{ display: "flex", alignItems: "center", gap: T.space[1] }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: d.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: T.fontSize.xs, color: C.textMuted }}>
                {d.status} ({d.count})
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

function formatMonth(monthStr) {
  const [year, month] = monthStr.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
}
