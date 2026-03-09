import { useMemo } from "react";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import { cardSolid } from "@/utils/styles";
import { BarChart, Spark } from "@/components/intelligence/PureCSSChart";

/* ────────────────────────────────────────────────────────
   WorkloadTrendsPanel — 30/60/90 day utilization trends,
   team velocity over time, and hiring signals.
   ──────────────────────────────────────────────────────── */

function getWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));
  return mon.toISOString().slice(0, 10);
}

function fmtWeek(wk) {
  const d = new Date(wk + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function WorkloadTrendsPanel({ workload, C, T }) {
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const activeCompanyId = useUiStore(s => s.appSettings?.activeCompanyId) || "";
  const productionHoursPerDay = useUiStore(s => s.appSettings?.productionHoursPerDay) || 7;

  const { estimatorRows, effectiveHoursPerDay } = workload;
  const capHours = effectiveHoursPerDay || productionHoursPerDay * 0.85;

  const trends = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Look at estimates active over the past 12 weeks
    const weeks = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i * 7);
      const day = d.getDay();
      const mon = new Date(d);
      mon.setDate(d.getDate() - ((day + 6) % 7));
      weeks.push(mon.toISOString().slice(0, 10));
    }

    // Filter estimates
    let entries = estimatesIndex;
    if (activeCompanyId && activeCompanyId !== "__all__") {
      entries = entries.filter(e => (e.companyId || "") === activeCompanyId);
    }

    // For each week, count active estimates and total hours
    const weekData = weeks.map(weekStart => {
      const weekEnd = new Date(weekStart + "T00:00:00");
      weekEnd.setDate(weekEnd.getDate() + 4); // Friday
      const weekEndStr = weekEnd.toISOString().slice(0, 10);

      // Estimates "active" in this week: status Bidding/Submitted with bidDue >= weekStart
      const activeInWeek = entries.filter(e => {
        if (!["Bidding", "Submitted", "Won", "Lost"].includes(e.status)) return false;
        if (!e.bidDue) return false;
        return e.bidDue >= weekStart;
      });

      const totalHours = activeInWeek.reduce((s, e) => s + (e.estimatedHours || 0), 0);
      const estimatorCount = new Set(activeInWeek.map(e => e.estimator).filter(Boolean)).size || 1;
      const teamCapacity = estimatorCount * capHours * 5; // 5 days per week
      const utilization = teamCapacity > 0 ? Math.round((totalHours / teamCapacity) * 100) : 0;

      // Completed this week
      const completed = entries.filter(
        e => ["Won", "Lost", "Submitted"].includes(e.status) && e.bidDue >= weekStart && e.bidDue <= weekEndStr,
      ).length;

      return {
        week: weekStart,
        label: fmtWeek(weekStart),
        activeCount: activeInWeek.length,
        totalHours,
        utilization: Math.min(utilization, 150), // cap for display
        completed,
        estimatorCount,
      };
    });

    // Hiring signal: check last 4 weeks
    const last4 = weekData.slice(-4);
    const avgUtil = last4.length > 0 ? last4.reduce((s, w) => s + w.utilization, 0) / last4.length : 0;
    const hiringSignal = avgUtil > 85;

    // Per-estimator sparklines
    const estimatorTrends = estimatorRows.map(row => {
      const spark = weeks.map(weekStart => {
        const inWeek = entries.filter(
          e => e.estimator === row.name && ["Bidding", "Submitted"].includes(e.status) && e.bidDue >= weekStart,
        );
        return inWeek.reduce((s, e) => s + (e.estimatedHours || 0), 0);
      });
      return { name: row.name, color: row.color, data: spark };
    });

    return { weekData, hiringSignal, avgUtil: Math.round(avgUtil), estimatorTrends };
  }, [estimatesIndex, activeCompanyId, estimatorRows, capHours]);

  if (trends.weekData.every(w => w.activeCount === 0)) {
    return null; // No data to show
  }

  return (
    <div style={{ marginTop: T.space[5] }}>
      <div style={{ fontSize: T.fontSize.sm, fontWeight: 700, color: C.text, marginBottom: T.space[3] }}>
        Workload Trends
      </div>

      {/* Hiring Signal */}
      {trends.hiringSignal && (
        <div
          style={{
            ...cardSolid(C),
            padding: `${T.space[3]}px ${T.space[4]}px`,
            marginBottom: T.space[3],
            borderLeft: "4px solid #FF9500",
            display: "flex",
            alignItems: "center",
            gap: T.space[3],
          }}
        >
          <span style={{ fontSize: 16 }}>📈</span>
          <div>
            <div style={{ fontSize: T.fontSize.xs, fontWeight: 600, color: C.text }}>Consider adding capacity</div>
            <div style={{ fontSize: 9, color: C.textDim }}>
              Average team utilization has been {trends.avgUtil}% over the last 4 weeks
            </div>
          </div>
        </div>
      )}

      {/* Utilization Chart */}
      <div style={{ ...cardSolid(C), padding: T.space[4], marginBottom: T.space[3] }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: C.textDim,
            textTransform: "uppercase",
            marginBottom: T.space[2],
          }}
        >
          Team Utilization % — Last 12 Weeks
        </div>
        <BarChart
          data={trends.weekData.map(w => ({
            label: w.label,
            value: w.utilization,
          }))}
          height={80}
          showLabels
          showValues
          maxOverride={100}
          barColor="#A78BFA"
        />
      </div>

      {/* Bids Completed */}
      <div style={{ ...cardSolid(C), padding: T.space[4], marginBottom: T.space[3] }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: C.textDim,
            textTransform: "uppercase",
            marginBottom: T.space[2],
          }}
        >
          Bids Completed per Week
        </div>
        <BarChart
          data={trends.weekData.map(w => ({
            label: w.label,
            value: w.completed,
          }))}
          height={60}
          showLabels
          showValues
          barColor="#30D158"
        />
      </div>

      {/* Per-Estimator Sparklines */}
      {trends.estimatorTrends.length > 0 && (
        <div style={{ ...cardSolid(C), padding: T.space[4] }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: C.textDim,
              textTransform: "uppercase",
              marginBottom: T.space[3],
            }}
          >
            Hours by Estimator — 12-Week Trend
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: T.space[3] }}
          >
            {trends.estimatorTrends.map(et => (
              <div
                key={et.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: T.space[2],
                  padding: `${T.space[2]}px ${T.space[3]}px`,
                  borderRadius: T.radius.sm,
                  background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                }}
              >
                <span style={{ fontSize: T.fontSize.xs, fontWeight: 600, color: C.text, minWidth: 60 }}>
                  {et.name.split(" ")[0]}
                </span>
                <div style={{ flex: 1 }}>
                  <Spark data={et.data} height={18} color={et.color} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
