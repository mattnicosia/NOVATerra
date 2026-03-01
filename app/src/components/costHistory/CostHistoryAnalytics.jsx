// CostHistoryAnalytics — Collapsible analytics panel at top of Cost History
// Shows win rate, avg $/SF, construction cost trends, top clients, calibration health

import { useMemo, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useScanStore } from '@/stores/scanStore';
import { getBuildingTypeLabel, getWorkTypeLabel } from '@/constants/constructionTypes';
import {
  getAvailableYears, getCompositeIndex, getYoYChange,
  getAllDivisionIndices, getCurrentYear,
} from '@/constants/constructionCostIndex';
import { extractYear, getEscalationFactor, formatEscalation, normalizeEntry } from '@/utils/costEscalation';

const fmtCost = (n) => {
  if (!n && n !== 0) return "—";
  return "$" + Math.round(n).toLocaleString();
};

/**
 * CostHistoryAnalytics
 * Props:
 *  - entries: unified entry array from HistoricalProposalsPanel
 */
export default function CostHistoryAnalytics({ entries }) {
  const C = useTheme();
  const learningRecords = useScanStore(s => s.learningRecords);
  const calibrationFactors = useScanStore.getState().getCalibrationFactors();
  const [showTrendDetail, setShowTrendDetail] = useState(false);

  const stats = useMemo(() => {
    const won = entries.filter(e => e.outcome === "won");
    const lost = entries.filter(e => e.outcome === "lost");
    const pending = entries.filter(e => e.outcome === "pending");
    const decided = won.length + lost.length;
    const winRate = decided > 0 ? Math.round((won.length / decided) * 100) : null;

    // Avg $/SF — only entries with both (raw)
    const withCostSF = entries.filter(e => e.totalCost > 0 && e.projectSF > 0);
    const avgPerSF = withCostSF.length > 0
      ? Math.round(withCostSF.reduce((s, e) => s + (e.totalCost / e.projectSF), 0) / withCostSF.length)
      : null;

    // Avg $/SF — adjusted to current year dollars
    const currentYear = getCurrentYear();
    const adjustedEntries = withCostSF.map(e => normalizeEntry(e, currentYear));
    const avgAdjPerSF = adjustedEntries.length > 0
      ? Math.round(adjustedEntries.reduce((s, e) => s + (e.adjustedCost / e.projectSF), 0) / adjustedEntries.length)
      : null;

    // $/SF by building type (adjusted)
    const perSFByType = {};
    adjustedEntries.forEach(e => {
      if (!e.buildingType) return;
      if (!perSFByType[e.buildingType]) perSFByType[e.buildingType] = { rawTotal: 0, adjTotal: 0, count: 0 };
      perSFByType[e.buildingType].rawTotal += e.totalCost / e.projectSF;
      perSFByType[e.buildingType].adjTotal += e.adjustedCost / e.projectSF;
      perSFByType[e.buildingType].count += 1;
    });
    const avgPerSFByType = Object.entries(perSFByType)
      .map(([key, { rawTotal, adjTotal, count }]) => ({
        key, label: getBuildingTypeLabel(key),
        avgPerSF: Math.round(rawTotal / count),
        adjPerSF: Math.round(adjTotal / count),
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Win rate by building type
    const winByType = {};
    entries.forEach(e => {
      if (!e.buildingType || (e.outcome !== "won" && e.outcome !== "lost")) return;
      if (!winByType[e.buildingType]) winByType[e.buildingType] = { won: 0, total: 0 };
      winByType[e.buildingType].total += 1;
      if (e.outcome === "won") winByType[e.buildingType].won += 1;
    });
    const winRateByType = Object.entries(winByType)
      .map(([key, { won: w, total: t }]) => ({ key, label: getBuildingTypeLabel(key), rate: Math.round((w / t) * 100), won: w, total: t }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    // Top clients by volume
    const clientMap = {};
    entries.forEach(e => {
      if (!e.client) return;
      if (!clientMap[e.client]) clientMap[e.client] = { count: 0, totalValue: 0, won: 0, lost: 0 };
      clientMap[e.client].count += 1;
      clientMap[e.client].totalValue += e.totalCost || 0;
      if (e.outcome === "won") clientMap[e.client].won += 1;
      if (e.outcome === "lost") clientMap[e.client].lost += 1;
    });
    const topClients = Object.entries(clientMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 5);

    // Pipeline
    const pipelineCount = pending.length;
    const pipelineValue = pending.reduce((s, e) => s + (e.totalCost || 0), 0);

    // Calibration health
    const calFactors = Object.values(calibrationFactors);
    const avgDeviation = calFactors.length > 0
      ? Math.round(calFactors.reduce((s, f) => s + Math.abs(f - 1), 0) / calFactors.length * 100)
      : null;

    // Construction cost trend data
    const years = getAvailableYears();
    const trendData = years.map(y => ({
      year: y,
      index: Math.round(getCompositeIndex(y) * 10) / 10,
      yoy: Math.round(getYoYChange(y) * 10) / 10,
    }));
    const currentIndex = Math.round(getCompositeIndex(currentYear) * 10) / 10;
    const sinceBase = Math.round((getCompositeIndex(currentYear) - 100) * 10) / 10;

    // Division breakdown for current year
    const divisionBreakdown = getAllDivisionIndices(currentYear);

    return {
      wonCount: won.length, lostCount: lost.length, winRate,
      avgPerSF, avgAdjPerSF, avgPerSFByType, winRateByType,
      topClients, pipelineCount, pipelineValue,
      calCount: calFactors.length, avgDeviation,
      totalEntries: entries.length,
      trendData, currentIndex, sinceBase, currentYear,
      divisionBreakdown,
    };
  }, [entries, calibrationFactors]);

  // Stat card helper
  const StatCard = ({ label, value, sub, color, wide }) => (
    <div style={{
      padding: "10px 14px", borderRadius: 8, background: C.bg2, border: `1px solid ${C.border}`,
      minWidth: wide ? 180 : 110, flex: wide ? "1 1 180px" : "0 0 auto",
    }}>
      <div style={{ fontSize: 9, color: C.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || C.text, fontFamily: "'DM Mono',monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: C.textDim, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  // Gradient bar
  const GradientBar = ({ pct, color }) => (
    <div style={{ height: 4, borderRadius: 2, background: C.bg2, flex: 1, position: "relative" }}>
      <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(pct, 100)}%`, borderRadius: 2, background: `linear-gradient(90deg, ${color}80, ${color})` }} />
    </div>
  );

  // Inline sparkline chart (pure CSS/divs)
  const TrendChart = ({ data }) => {
    const maxIdx = Math.max(...data.map(d => d.index));
    const minIdx = Math.min(...data.map(d => d.index));
    const range = maxIdx - minIdx || 1;
    const chartH = 60;

    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: chartH, padding: "0 2px" }}>
        {data.map((d, i) => {
          const pct = ((d.index - minIdx) / range) * 100;
          const h = Math.max(4, (pct / 100) * chartH);
          const isBase = d.year === 2020;
          const isCurrent = d.year === stats.currentYear;
          const barColor = isCurrent ? C.accent : isBase ? C.blue : d.yoy > 5 ? C.orange : C.textDim;
          return (
            <div key={d.year} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 2 }}>
              <div style={{
                width: "100%", maxWidth: 24, height: h, borderRadius: "3px 3px 1px 1px",
                background: `linear-gradient(180deg, ${barColor}, ${barColor}60)`,
                position: "relative",
              }}>
                {(isCurrent || isBase || d.yoy > 8) && (
                  <div style={{
                    position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
                    fontSize: 7, fontWeight: 700, color: barColor, whiteSpace: "nowrap",
                    fontFamily: "'DM Mono',monospace",
                  }}>
                    {d.index}
                  </div>
                )}
              </div>
              <div style={{
                fontSize: 7, color: isCurrent || isBase ? C.text : C.textDim,
                fontWeight: isCurrent || isBase ? 700 : 400,
                fontFamily: "'DM Mono',monospace",
              }}>
                {String(d.year).slice(-2)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (stats.totalEntries === 0) {
    return (
      <div style={{ padding: "14px 16px", borderRadius: 8, border: `1px dashed ${C.border}`, marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontSize: 11, color: C.textDim }}>Analytics will appear once you have cost history data</div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: C.bg1, border: `1px solid ${C.border}` }}>
      {/* Top stat cards */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <StatCard label="Win Rate" value={stats.winRate !== null ? `${stats.winRate}%` : "—"}
          sub={`${stats.wonCount}W / ${stats.lostCount}L`}
          color={stats.winRate >= 50 ? C.green : stats.winRate !== null ? C.orange : C.textDim} />
        <StatCard label="Avg $/SF" value={stats.avgAdjPerSF !== null ? `$${stats.avgAdjPerSF}` : stats.avgPerSF !== null ? `$${stats.avgPerSF}` : "—"}
          sub={stats.avgAdjPerSF !== null && stats.avgPerSF !== stats.avgAdjPerSF
            ? `Raw $${stats.avgPerSF} • Adj to ${stats.currentYear}$`
            : `From ${entries.filter(e => e.totalCost > 0 && e.projectSF > 0).length} projects`
          } />
        <StatCard label="Cost Index" value={stats.currentIndex}
          sub={`+${stats.sinceBase}% since 2020 base`}
          color={C.accent} />
        <StatCard label="Pipeline" value={stats.pipelineCount}
          sub={stats.pipelineValue > 0 ? fmtCost(stats.pipelineValue) : "No value data"} color={C.blue} />
        <StatCard label="Calibration" value={stats.calCount > 0 ? `${stats.calCount} divs` : "—"}
          sub={stats.avgDeviation !== null ? `Avg ${stats.avgDeviation}% deviation` : "No data yet"}
          color={stats.calCount > 0 ? C.accent : C.textDim} />
      </div>

      {/* Construction Cost Trends */}
      <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 8, background: C.bg2, border: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Construction Cost Index — BLS/ENR Composite
          </div>
          <button onClick={() => setShowTrendDetail(p => !p)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 9, color: C.accent, fontWeight: 600, padding: "2px 6px" }}>
            {showTrendDetail ? "Hide divisions" : "Show divisions"}
          </button>
        </div>

        {/* Sparkline */}
        <TrendChart data={stats.trendData} />

        {/* YoY row */}
        <div style={{ display: "flex", gap: 2, marginTop: 6, padding: "0 2px" }}>
          {stats.trendData.map(d => (
            <div key={d.year} style={{
              flex: 1, textAlign: "center", fontSize: 7,
              fontFamily: "'DM Mono',monospace",
              color: d.yoy > 5 ? C.orange : d.yoy > 0 ? C.green : C.textDim,
              fontWeight: d.yoy > 5 ? 700 : 400,
            }}>
              {d.yoy > 0 ? "+" : ""}{d.yoy}%
            </div>
          ))}
        </div>

        {/* Division detail breakdown */}
        {showTrendDetail && (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 8, color: C.textDim, marginBottom: 6, fontWeight: 600 }}>
              {stats.currentYear} Division Indices (base 2020 = 100)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
              {stats.divisionBreakdown
                .sort((a, b) => b.index - a.index)
                .map(d => {
                  const maxDiv = Math.max(...stats.divisionBreakdown.map(x => x.index));
                  const label = {
                    concrete: "Concrete/Masonry", metals: "Steel & Metals", wood: "Wood & Composites",
                    thermal: "Thermal/Roofing", openings: "Doors/Windows", finishes: "Finishes",
                    mechanical: "Plumbing/HVAC", electrical: "Electrical", sitework: "Sitework",
                    general: "General/Labor",
                  }[d.category] || d.category;
                  return (
                    <div key={d.category} style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 0" }}>
                      <span style={{ fontSize: 8, color: C.textDim, width: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                      <GradientBar pct={(d.index / maxDiv) * 100} color={d.yoy > 3 ? C.orange : C.accent} />
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.text, fontFamily: "'DM Mono',monospace", minWidth: 28, textAlign: "right" }}>
                        {Math.round(d.index * 10) / 10}
                      </span>
                      <span style={{
                        fontSize: 8, fontWeight: 600, minWidth: 28, textAlign: "right",
                        fontFamily: "'DM Mono',monospace",
                        color: d.yoy > 3 ? C.orange : d.yoy > 0 ? C.green : C.textDim,
                      }}>
                        {d.yoy > 0 ? "+" : ""}{Math.round(d.yoy * 10) / 10}%
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Breakdowns */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {/* $/SF by building type (shows adjusted) */}
        {stats.avgPerSFByType.length > 0 && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>$/SF by Building Type</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {stats.avgPerSFByType.map(t => {
                const maxPerSF = Math.max(...stats.avgPerSFByType.map(x => x.adjPerSF));
                return (
                  <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 9, color: C.textDim, width: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
                    <GradientBar pct={(t.adjPerSF / maxPerSF) * 100} color={C.accent} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFamily: "'DM Mono',monospace", minWidth: 35, textAlign: "right" }}>${t.adjPerSF}</span>
                    {t.avgPerSF !== t.adjPerSF && (
                      <span style={{ fontSize: 7, color: C.textDim, fontFamily: "'DM Mono',monospace" }}>${t.avgPerSF}</span>
                    )}
                    <span style={{ fontSize: 8, color: C.textDim }}>({t.count})</span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 7, color: C.textMuted, marginTop: 4, fontStyle: "italic" }}>
              Adjusted to {stats.currentYear} dollars
            </div>
          </div>
        )}

        {/* Win rate by building type */}
        {stats.winRateByType.length > 0 && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Win Rate by Type</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {stats.winRateByType.map(t => (
                <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, color: C.textDim, width: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
                  <GradientBar pct={t.rate} color={t.rate >= 50 ? C.green : C.orange} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: t.rate >= 50 ? C.green : C.orange, fontFamily: "'DM Mono',monospace", minWidth: 30, textAlign: "right" }}>{t.rate}%</span>
                  <span style={{ fontSize: 8, color: C.textDim }}>({t.won}/{t.total})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top clients */}
        {stats.topClients.length > 0 && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Top Clients</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {stats.topClients.map(cl => {
                const maxVal = Math.max(...stats.topClients.map(x => x.totalValue));
                const wr = (cl.won + cl.lost) > 0 ? Math.round((cl.won / (cl.won + cl.lost)) * 100) : null;
                return (
                  <div key={cl.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 9, color: C.textDim, width: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cl.name}</span>
                    <GradientBar pct={maxVal > 0 ? (cl.totalValue / maxVal) * 100 : 0} color={C.blue} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFamily: "'DM Mono',monospace", minWidth: 50, textAlign: "right" }}>{fmtCost(cl.totalValue)}</span>
                    {wr !== null && (
                      <span style={{ fontSize: 8, color: wr >= 50 ? C.green : C.orange, fontWeight: 600 }}>{wr}%</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
