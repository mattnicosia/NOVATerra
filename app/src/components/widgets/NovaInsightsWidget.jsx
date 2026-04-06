/**
 * NovaInsightsWidget — AI learning progress and accuracy metrics.
 * Shows how NOVA is getting smarter from user corrections.
 */
import { useMemo, useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useCorrectionStore } from "@/nova/learning/correctionStore";
import { useFirmMemoryStore } from "@/nova/learning/firmMemory";
import { getEvaluationSummary } from "@/stores/novaStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

export default function NovaInsightsWidget() {
  const C = useTheme();
  const T = C.T;

  const corrections = useCorrectionStore(s => s.corrections);
  const globalPatterns = useCorrectionStore(s => s.globalPatterns);

  const stats = useMemo(() => {
    const byType = {};
    corrections.forEach(c => { byType[c.type] = (byType[c.type] || 0) + 1; });

    // Suggestion acceptance rate
    const accepted = byType["suggestions:accept"] || 0;
    const rejected = byType["suggestions:reject"] || 0;
    const sugTotal = accepted + rejected;
    const acceptRate = sugTotal > 0 ? Math.round((accepted / sugTotal) * 100) : null;

    // Top patterns
    const topPatterns = [...globalPatterns]
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 3);

    // Firm memory stats
    let firmCount = 0;
    try { firmCount = useFirmMemoryStore.getState().getStats?.()?.totalFirms || 0; } catch { /* ok */ }

    return { total: corrections.length, byType, accepted, rejected, acceptRate, topPatterns, firmCount, patternCount: globalPatterns.length };
  }, [corrections, globalPatterns]);

  // AI accuracy metrics from evaluation log
  const [evalStats, setEvalStats] = useState(null);
  useEffect(() => {
    getEvaluationSummary(30).then(s => {
      if (s && (s.total_calls || s.totalCalls)) setEvalStats(s);
    }).catch(() => {});
  }, []);

  const metricRow = (label, value, color) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `2px 0` }}>
      <span style={{ fontSize: 9, color: C.textDim }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: color || C.text }}>{value}</span>
    </div>
  );

  return (
    <div style={{ height: "100%", overflow: "auto", padding: `${T.space[2]}px ${T.space[3]}px`, display: "flex", flexDirection: "column", gap: T.space[2] }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Ic d={I.ai} size={12} color={C.accent} />
        <span style={{ fontSize: 10, fontWeight: 700, color: C.text }}>NOVA Learning</span>
      </div>

      {stats.total === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: C.textDim, fontSize: 10 }}>
          NOVA learns from your corrections.
          <br />Start estimating to build intelligence.
        </div>
      ) : (
        <>
          {/* Metrics */}
          {metricRow("Total corrections", stats.total, C.accent)}
          {metricRow("Patterns learned", stats.patternCount, C.purple || C.accent)}
          {metricRow("Firms recognized", stats.firmCount, C.blue)}

          {/* Suggestion acceptance */}
          {stats.acceptRate !== null && (
            <div style={{ marginTop: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                <span style={{ color: C.textDim }}>Suggestion acceptance</span>
                <span style={{ fontWeight: 700, color: stats.acceptRate >= 70 ? C.green : stats.acceptRate >= 40 ? C.orange : C.red || "#EF4444" }}>
                  {stats.acceptRate}%
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: `${C.border}15`, marginTop: 2 }}>
                <div style={{
                  height: 4, borderRadius: 2, width: `${stats.acceptRate}%`,
                  background: stats.acceptRate >= 70 ? C.green : stats.acceptRate >= 40 ? C.orange : (C.red || "#EF4444"),
                  transition: "width 300ms ease-out",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.textDim, marginTop: 1 }}>
                <span>{stats.accepted} accepted</span>
                <span>{stats.rejected} rejected</span>
              </div>
            </div>
          )}

          {/* Top patterns */}
          {stats.topPatterns.length > 0 && (
            <div style={{ marginTop: 2 }}>
              <span style={{ fontSize: 8, color: C.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Top learned patterns
              </span>
              {stats.topPatterns.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 8, marginTop: 2, color: C.textDim }}>
                  <span style={{ color: C.accent, fontWeight: 600, minWidth: 20 }}>{p.frequency}x</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.type}:{p.field}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* AI accuracy metrics */}
          {evalStats && (
            <div style={{ marginTop: 4, borderTop: `1px solid ${C.border}10`, paddingTop: 4 }}>
              <span style={{ fontSize: 8, color: C.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                AI accuracy (30 days)
              </span>
              {metricRow("AI calls", evalStats.total_calls || evalStats.totalCalls || 0)}
              {(evalStats.avg_accuracy || evalStats.avgAccuracy) != null && (() => {
                const acc = Math.round((evalStats.avg_accuracy || evalStats.avgAccuracy) * 100);
                return metricRow("Avg accuracy", `${acc}%`, acc >= 80 ? C.green : acc >= 60 ? C.orange : (C.red || "#EF4444"));
              })()}
              {(evalStats.avg_latency_ms || evalStats.avgLatencyMs) != null &&
                metricRow("Avg latency", `${Math.round(evalStats.avg_latency_ms || evalStats.avgLatencyMs)}ms`)
              }
              {(evalStats.correction_context_rate || evalStats.correctionContextRate) != null && (() => {
                const rate = Math.round((evalStats.correction_context_rate || evalStats.correctionContextRate) * 100);
                return metricRow("Context-augmented", `${rate}%`, C.accent);
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
