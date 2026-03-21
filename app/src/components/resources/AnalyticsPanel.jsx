import { useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useResourceAnalytics } from "@/hooks/useResourceAnalytics";
import { cardSolid } from "@/utils/styles";
import { BarChart, Spark } from "@/components/intelligence/PureCSSChart";
import Avatar from "@/components/shared/Avatar";

/* ────────────────────────────────────────────────────────
   AnalyticsPanel — Estimation accuracy, velocity,
   cycle time, and benchmarks dashboard.
   ──────────────────────────────────────────────────────── */

const Section = ({ title, children, C, T }) => (
  <div style={{ ...cardSolid(C), padding: T.space[4], marginBottom: T.space[4] }}>
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
      {title}
    </div>
    {children}
  </div>
);

function AccuracyBadge({ ratio, C }) {
  const pct = Math.round(ratio * 100);
  const color = ratio > 1.15 ? "#FF3B30" : ratio < 0.85 ? "#FBBF24" : "#30D158";
  const label =
    ratio > 1.1 ? `Takes ${pct - 100}% longer` : ratio < 0.9 ? `Finishes ${100 - pct}% faster` : "On target";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color }}>{pct}%</span>
      <span style={{ fontSize: 9, color: C.textDim }}>{label}</span>
    </div>
  );
}

export default function AnalyticsPanel({ estimatorColors, C: propC, T: propT }) {
  const themeC = useTheme();
  const C = propC || themeC;
  const T = propT || C.T;

  const analytics = useResourceAnalytics();
  const { accuracyByEstimator, weeklyVelocity, cycleTimeByEstimator, hoursBenchmarks, totalCompleted } = analytics;

  // Velocity chart data
  const velocityData = useMemo(() => {
    if (weeklyVelocity.length === 0) return [];
    return weeklyVelocity.map(w => {
      const d = new Date(w.week + "T00:00:00");
      return {
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: w.count,
      };
    });
  }, [weeklyVelocity]);

  // Cycle time chart data
  const cycleData = useMemo(() => {
    return Array.from(cycleTimeByEstimator.entries())
      .filter(([, v]) => v.count > 0)
      .map(([name, v]) => ({
        label: name.split(" ")[0], // first name only
        value: v.avgDays,
      }))
      .sort((a, b) => b.value - a.value);
  }, [cycleTimeByEstimator]);

  // Benchmark data
  const benchmarkData = useMemo(() => {
    return Array.from(hoursBenchmarks.entries())
      .map(([type, v]) => ({
        label: type.length > 12 ? type.slice(0, 12) + "..." : type,
        fullLabel: type,
        value: v.avg,
        median: v.median,
        count: v.count,
      }))
      .sort((a, b) => b.value - a.value);
  }, [hoursBenchmarks]);

  if (totalCompleted === 0 && weeklyVelocity.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: T.space[6], color: C.textDim }}>
        <div style={{ fontSize: 24, marginBottom: T.space[3] }}>📊</div>
        <div style={{ fontSize: T.fontSize.sm, fontWeight: 600, marginBottom: T.space[2] }}>No Analytics Data Yet</div>
        <div style={{ fontSize: T.fontSize.xs, maxWidth: 300, margin: "0 auto" }}>
          Start tracking time on estimates to see accuracy metrics, velocity trends, and benchmarks here.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Top Summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: T.space[3],
          marginBottom: T.space[4],
        }}
      >
        {[
          { label: "Estimates Tracked", value: totalCompleted, color: C.purple },
          { label: "Estimators", value: accuracyByEstimator.size, color: "#60A5FA" },
          {
            label: "Avg Velocity",
            value:
              weeklyVelocity.length > 0
                ? `${Math.round(weeklyVelocity.reduce((s, w) => s + w.count, 0) / weeklyVelocity.length)}/wk`
                : "—",
            color: "#34D399",
          },
          {
            label: "Building Types",
            value: hoursBenchmarks.size,
            color: "#FBBF24",
          },
        ].map(kpi => (
          <div key={kpi.label} style={{ ...cardSolid(C), padding: `${T.space[3]}px ${T.space[4]}px` }}>
            <div
              style={{
                fontSize: 9,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 4,
              }}
            >
              {kpi.label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Velocity */}
      {velocityData.length > 0 && (
        <Section title="Team Velocity — Bids per Week" C={C} T={T}>
          <BarChart data={velocityData} height={100} showLabels showValues barColor={C.purple} />
        </Section>
      )}

      {/* Estimator Accuracy */}
      {accuracyByEstimator.size > 0 && (
        <Section title="Estimator Accuracy — Actual vs Estimated" C={C} T={T}>
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: T.space[3] }}
          >
            {Array.from(accuracyByEstimator.entries()).map(([name, data]) => {
              const colorEntry = estimatorColors?.get(name);
              return (
                <div
                  key={name}
                  style={{
                    padding: T.space[3],
                    borderRadius: T.radius.md,
                    background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                    border: `1px solid ${C.border}40`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: T.space[2], marginBottom: T.space[2] }}>
                    <Avatar name={name} color={colorEntry || C.purple} size={24} fontSize={9} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: T.fontSize.xs, fontWeight: 600, color: C.text }}>{name}</div>
                      <div style={{ fontSize: 8, color: C.textDim }}>
                        {data.estimates} estimate{data.estimates !== 1 ? "s" : ""} tracked
                      </div>
                    </div>
                    <AccuracyBadge ratio={data.avgAccuracy} C={C} />
                  </div>

                  {/* Hours comparison */}
                  <div style={{ display: "flex", gap: T.space[4], marginBottom: T.space[2] }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#60A5FA" }}>{data.totalEstimated}h</div>
                      <div style={{ fontSize: 8, color: C.textDim }}>Estimated</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#34D399" }}>{data.totalActual}h</div>
                      <div style={{ fontSize: 8, color: C.textDim }}>Actual</div>
                    </div>
                  </div>

                  {/* Trend sparkline */}
                  {data.trend.length > 2 && (
                    <div>
                      <div style={{ fontSize: 8, color: C.textDim, marginBottom: 2 }}>
                        Accuracy trend (last {data.trend.length})
                      </div>
                      <Spark
                        data={data.trend.map(r => Math.round(r * 100))}
                        height={20}
                        color={data.avgAccuracy > 1.15 ? "#FF3B30" : data.avgAccuracy < 0.85 ? "#FBBF24" : "#30D158"}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Cycle Time */}
      {cycleData.length > 0 && (
        <Section title="Cycle Time — Avg Days per Estimate" C={C} T={T}>
          <BarChart data={cycleData} height={80} showLabels showValues barColor="#60A5FA" />
        </Section>
      )}

      {/* Benchmarks */}
      {benchmarkData.length > 0 && (
        <Section title="Hours Benchmarks by Project Type" C={C} T={T}>
          <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>
            {benchmarkData.map(b => (
              <div
                key={b.fullLabel}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: T.space[3],
                  padding: `${T.space[2]}px ${T.space[3]}px`,
                  borderRadius: T.radius.sm,
                  background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: T.fontSize.xs, fontWeight: 600, color: C.text }}>{b.fullLabel}</div>
                  <div style={{ fontSize: 8, color: C.textDim }}>
                    {b.count} project{b.count !== 1 ? "s" : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#FBBF24" }}>{b.value}h avg</div>
                  <div style={{ fontSize: 8, color: C.textDim }}>{b.median}h median</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
