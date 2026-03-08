import { useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import Avatar from "@/components/shared/Avatar";
import Modal from "@/components/shared/Modal";
import { bt } from "@/utils/styles";

/**
 * EstimatorScorecard — Strengths-based performance profile for an estimator.
 *
 * Shows: performance tier, metrics radar, division expertise, project types,
 * time efficiency, accuracy trend.
 *
 * Props:
 *   estimatorName  — name to filter by
 *   color          — team color
 *   avatarSrc      — headshot URL
 *   onClose        — close callback
 *   open           — boolean
 */
export default function EstimatorScorecard({ estimatorName, color = "#A78BFA", avatarSrc, onClose, open }) {
  const C = useTheme();
  const T = C.T;
  const estimates = useEstimatesStore(s => s.estimatesIndex);

  const data = useMemo(() => {
    if (!estimatorName) return null;

    const mine = estimates.filter(e => e.estimator === estimatorName);
    if (mine.length === 0) return null;

    // ── Core Metrics ──
    const decided = mine.filter(e => e.status === "Won" || e.status === "Lost");
    const wonCount = mine.filter(e => e.status === "Won").length;
    const lostCount = mine.filter(e => e.status === "Lost").length;
    const activeCount = mine.filter(e => e.status === "Bidding" || e.status === "Submitted").length;
    const winRate = decided.length > 0 ? Math.round((wonCount / decided.length) * 100) : null;

    // ── Accuracy ──
    const wonWithActual = mine.filter(
      e => e.status === "Won" && e.outcomeMetadata?.contractAmount > 0 && e.grandTotal > 0,
    );
    let accuracy = null;
    let accuracyDetail = [];
    if (wonWithActual.length >= 1) {
      const devs = wonWithActual.map(e => {
        const dev = ((e.grandTotal - e.outcomeMetadata.contractAmount) / e.outcomeMetadata.contractAmount) * 100;
        return {
          name: e.name,
          deviation: Math.round(dev * 10) / 10,
          total: e.grandTotal,
          actual: e.outcomeMetadata.contractAmount,
        };
      });
      const absAvg = devs.reduce((s, d) => s + Math.abs(d.deviation), 0) / devs.length;
      accuracy = Math.round(absAvg * 10) / 10;
      accuracyDetail = devs;
    }

    // ── Time Efficiency ──
    const totalTimerMs = mine.reduce((s, e) => s + (e.timerTotalMs || 0), 0);
    const totalHours = Math.round((totalTimerMs / 3600000) * 10) / 10;
    const withHours = mine.filter(e => e.estimatedHours > 0 && e.timerTotalMs > 0);
    let avgTimeEfficiency = null;
    if (withHours.length > 0) {
      const effs = withHours.map(e => {
        const spent = e.timerTotalMs / 3600000;
        const budget = Number(e.estimatedHours);
        return budget > 0 ? spent / budget : 1;
      });
      avgTimeEfficiency = Math.round((effs.reduce((a, b) => a + b, 0) / effs.length) * 100);
    }

    // ── Building Types ──
    const buildingTypes = {};
    for (const e of mine) {
      const bt = e.buildingType || "Unknown";
      if (!buildingTypes[bt]) buildingTypes[bt] = { count: 0, won: 0, total: 0 };
      buildingTypes[bt].count++;
      buildingTypes[bt].total += e.grandTotal || 0;
      if (e.status === "Won") buildingTypes[bt].won++;
    }
    const topBuildingTypes = Object.entries(buildingTypes)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6)
      .map(([type, d]) => ({ type, ...d }));

    // ── Work Types ──
    const workTypes = {};
    for (const e of mine) {
      const wt = e.workType || "Unknown";
      if (!workTypes[wt]) workTypes[wt] = 0;
      workTypes[wt]++;
    }
    const topWorkTypes = Object.entries(workTypes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));

    // ── Division Expertise ──
    const divExp = {};
    for (const e of mine) {
      if (!e.divisionTotals) continue;
      for (const [div, total] of Object.entries(e.divisionTotals)) {
        if (!divExp[div]) divExp[div] = { count: 0, totalValue: 0, wonCount: 0 };
        divExp[div].count++;
        divExp[div].totalValue += total || 0;
        if (e.status === "Won") divExp[div].wonCount++;
      }
    }
    const topDivisions = Object.entries(divExp)
      .sort((a, b) => b[1].totalValue - a[1].totalValue)
      .slice(0, 8)
      .map(([div, d]) => ({ division: div, ...d }));

    // ── Volume / Value ──
    const totalValue = mine.reduce((s, e) => s + (e.grandTotal || 0), 0);
    const avgValue = mine.length > 0 ? totalValue / mine.length : 0;

    // ── Performance Tier ──
    let tier, tierColor, tierLabel;
    const score =
      (winRate || 0) * 0.4 +
      (accuracy !== null ? Math.max(0, 100 - accuracy * 5) : 50) * 0.3 +
      Math.min(100, mine.length * 5) * 0.3;
    if (score >= 85) {
      tier = "Platinum";
      tierColor = "#E5E4E2";
      tierLabel = "Elite Performer";
    } else if (score >= 70) {
      tier = "Gold";
      tierColor = "#FFD700";
      tierLabel = "Top Performer";
    } else if (score >= 55) {
      tier = "Silver";
      tierColor = "#C0C0C0";
      tierLabel = "Solid Performer";
    } else {
      tier = "Bronze";
      tierColor = "#CD7F32";
      tierLabel = "Developing";
    }

    // ── Strengths Analysis ──
    const strengths = [];
    if (winRate !== null && winRate >= 50) strengths.push("High win rate");
    if (accuracy !== null && accuracy <= 5) strengths.push("Precise estimator");
    else if (accuracy !== null && accuracy <= 10) strengths.push("Accurate estimator");
    if (avgTimeEfficiency !== null && avgTimeEfficiency <= 90) strengths.push("Time efficient");
    if (mine.length >= 20) strengths.push("High volume");
    if (topDivisions.length >= 5) strengths.push("Broadly experienced");
    if (topBuildingTypes.length >= 3) strengths.push("Versatile project types");
    if (strengths.length === 0) strengths.push("Building experience");

    return {
      totalEstimates: mine.length,
      activeCount,
      wonCount,
      lostCount,
      winRate,
      accuracy,
      accuracyDetail,
      totalHours,
      avgTimeEfficiency,
      topBuildingTypes,
      topWorkTypes,
      topDivisions,
      totalValue,
      avgValue,
      tier,
      tierColor,
      tierLabel,
      strengths,
      score: Math.round(score),
    };
  }, [estimates, estimatorName]);

  if (!open || !data) return null;

  const fmtVal = v => {
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
    return `$${Math.round(v)}`;
  };

  // Radar metrics (0-100 scale each)
  const radar = [
    { label: "Win Rate", value: data.winRate || 0, max: 100 },
    { label: "Accuracy", value: data.accuracy !== null ? Math.max(0, 100 - data.accuracy * 5) : 0, max: 100 },
    { label: "Volume", value: Math.min(100, data.totalEstimates * 4), max: 100 },
    {
      label: "Speed",
      value: data.avgTimeEfficiency !== null ? Math.max(0, 150 - data.avgTimeEfficiency) : 0,
      max: 100,
    },
    { label: "Breadth", value: Math.min(100, data.topDivisions.length * 15), max: 100 },
  ];

  return (
    <Modal onClose={onClose} width={640}>
      <div style={{ padding: T.space[5] }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: T.space[4],
            marginBottom: T.space[5],
            paddingBottom: T.space[4],
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <Avatar name={estimatorName} src={avatarSrc} color={color} size={56} fontSize={22} />
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: T.fontSize.xl, fontWeight: T.fontWeight.bold, color: C.text }}>
              {estimatorName}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: T.space[3], marginTop: 4 }}>
              <span
                style={{
                  fontSize: T.fontSize.xs,
                  fontWeight: 700,
                  color: data.tierColor,
                  padding: "3px 10px",
                  borderRadius: T.radius.full,
                  background: `${data.tierColor}18`,
                  border: `1px solid ${data.tierColor}30`,
                }}
              >
                {data.tier}
              </span>
              <span style={{ fontSize: T.fontSize.xs, color: C.textDim }}>{data.tierLabel}</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: T.fontSize["2xl"], fontWeight: T.fontWeight.bold, color: C.text }}>
              {data.score}
            </div>
            <div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Score
            </div>
          </div>
        </div>

        {/* Strengths tags */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: T.space[4] }}>
          {data.strengths.map(s => (
            <span
              key={s}
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: "#30D158",
                background: "#30D15815",
                padding: "3px 8px",
                borderRadius: T.radius.full,
              }}
            >
              {s}
            </span>
          ))}
        </div>

        {/* Core metrics grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: T.space[2],
            marginBottom: T.space[5],
          }}
        >
          {[
            {
              label: "Win Rate",
              value: data.winRate !== null ? `${data.winRate}%` : "—",
              color: data.winRate >= 50 ? "#30D158" : data.winRate !== null ? "#FF9500" : "#8E8E93",
              sub: `${data.wonCount}W / ${data.lostCount}L`,
            },
            {
              label: "Accuracy",
              value: data.accuracy !== null ? `±${data.accuracy}%` : "—",
              color:
                data.accuracy !== null && data.accuracy <= 5
                  ? "#30D158"
                  : data.accuracy !== null && data.accuracy <= 10
                    ? "#FF9500"
                    : data.accuracy !== null
                      ? "#FF3B30"
                      : "#8E8E93",
              sub: data.accuracyDetail.length > 0 ? `${data.accuracyDetail.length} data pts` : "Need more data",
            },
            {
              label: "Volume",
              value: data.totalEstimates,
              color: "#A78BFA",
              sub: `${data.activeCount} active`,
            },
            {
              label: "Hours",
              value: data.totalHours > 0 ? `${data.totalHours}h` : "—",
              color: "#60A5FA",
              sub: data.avgTimeEfficiency !== null ? `${data.avgTimeEfficiency}% budget used` : "No tracking",
            },
            {
              label: "Total Value",
              value: data.totalValue > 0 ? fmtVal(data.totalValue) : "—",
              color: "#34D399",
              sub: data.totalEstimates > 0 ? `avg ${fmtVal(data.avgValue)}` : "",
            },
          ].map(m => (
            <div
              key={m.label}
              style={{
                background: `${C.border}08`,
                borderRadius: T.radius.md,
                padding: T.space[3],
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  color: C.textDim,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 4,
                }}
              >
                {m.label}
              </div>
              <div style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: m.color }}>{m.value}</div>
              {m.sub && <div style={{ fontSize: 8, color: C.textDim, marginTop: 2 }}>{m.sub}</div>}
            </div>
          ))}
        </div>

        {/* Radar visualization (simplified bar chart) */}
        <div
          style={{
            marginBottom: T.space[5],
            padding: T.space[3],
            background: `${C.border}08`,
            borderRadius: T.radius.lg,
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: T.space[3],
            }}
          >
            Performance Profile
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>
            {radar.map(r => (
              <div key={r.label} style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
                <span style={{ fontSize: T.fontSize.xs, color: C.textMuted, width: 60, textAlign: "right" }}>
                  {r.label}
                </span>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: `${C.border}20`, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, r.value)}%`,
                      borderRadius: 3,
                      background:
                        r.value >= 70 ? "#30D158" : r.value >= 40 ? "#FF9500" : r.value > 0 ? "#FF3B30" : C.border,
                      transition: "width 300ms ease",
                    }}
                  />
                </div>
                <span style={{ fontSize: 9, fontWeight: 600, color: C.textDim, width: 28, textAlign: "right" }}>
                  {Math.round(r.value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Two-column: Division Expertise + Project Types */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.space[4], marginBottom: T.space[4] }}>
          {/* Division Expertise */}
          <div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: T.space[2],
              }}
            >
              Division Expertise
            </div>
            {data.topDivisions.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {data.topDivisions.map(d => {
                  const maxCount = data.topDivisions[0]?.count || 1;
                  return (
                    <div key={d.division} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 9,
                          color: C.text,
                          width: 80,
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {d.division}
                      </span>
                      <div
                        style={{ flex: 1, height: 4, borderRadius: 2, background: `${C.border}20`, overflow: "hidden" }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${(d.count / maxCount) * 100}%`,
                            borderRadius: 2,
                            background: color,
                            opacity: 0.7,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 8, color: C.textDim, width: 20, textAlign: "right" }}>{d.count}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>No division data yet</div>
            )}
          </div>

          {/* Project Types */}
          <div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: T.space[2],
              }}
            >
              Building Types
            </div>
            {data.topBuildingTypes.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {data.topBuildingTypes.map(bt => (
                  <div key={bt.type} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span
                      style={{
                        fontSize: T.fontSize.xs,
                        color: C.text,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        flex: 1,
                      }}
                    >
                      {bt.type}
                    </span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 9, color: C.textDim }}>{bt.count} bids</span>
                      {bt.won > 0 && <span style={{ fontSize: 8, fontWeight: 600, color: "#30D158" }}>{bt.won}W</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>No building type data yet</div>
            )}
          </div>
        </div>

        {/* Work Types */}
        {data.topWorkTypes.length > 0 && data.topWorkTypes[0].type !== "Unknown" && (
          <div style={{ marginBottom: T.space[4] }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: T.space[2],
              }}
            >
              Work Types
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {data.topWorkTypes.map(wt => (
                <span
                  key={wt.type}
                  style={{
                    fontSize: 9,
                    color: C.text,
                    background: `${C.border}10`,
                    padding: "3px 8px",
                    borderRadius: T.radius.sm,
                    fontWeight: 500,
                  }}
                >
                  {wt.type} ({wt.count})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Accuracy Trend (if enough data) */}
        {data.accuracyDetail.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: T.space[2],
              }}
            >
              Estimate Accuracy Detail
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {data.accuracyDetail.map((d, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: T.space[2],
                    padding: `${T.space[1]}px 0`,
                    borderBottom: `1px solid ${C.border}06`,
                    fontSize: T.fontSize.xs,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      color: C.text,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {d.name}
                  </span>
                  <span style={{ color: C.textDim, fontSize: 9 }}>{fmtVal(d.total)}</span>
                  <span style={{ color: C.textDim, fontSize: 9 }}>vs {fmtVal(d.actual)}</span>
                  <span
                    style={{
                      fontWeight: 600,
                      color:
                        Math.abs(d.deviation) <= 5 ? "#30D158" : Math.abs(d.deviation) <= 10 ? "#FF9500" : "#FF3B30",
                      fontSize: 9,
                      minWidth: 45,
                      textAlign: "right",
                    }}
                  >
                    {d.deviation > 0 ? "+" : ""}
                    {d.deviation}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Close */}
        <div style={{ marginTop: T.space[5], textAlign: "right" }}>
          <button
            onClick={onClose}
            style={{
              ...bt(C),
              padding: "6px 20px",
              fontSize: T.fontSize.xs,
              color: C.textMuted,
              background: `${C.border}10`,
              border: `1px solid ${C.border}`,
              borderRadius: T.radius.md,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
