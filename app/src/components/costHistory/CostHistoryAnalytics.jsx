// CostHistoryAnalytics — Collapsible analytics panel at top of Cost History
// Shows win rate, avg $/SF, construction cost trends, top clients, calibration health

import { useMemo, useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { bt } from "@/utils/styles";
import { useScanStore } from "@/stores/scanStore";
import { getBuildingTypeLabel, getWorkTypeLabel } from "@/constants/constructionTypes";
import {
  getAvailableYears,
  getCompositeIndex,
  getYoYChange,
  getAllDivisionIndices,
  getCurrentYear,
} from "@/constants/constructionCostIndex";
import { extractYear, getEscalationFactor, formatEscalation, normalizeEntry } from "@/utils/costEscalation";
import {
  MARKUP_TAXONOMY,
  MARKUP_CATEGORIES,
  classifyMarkup,
  getMarkupCategory,
  detectMarginGrouping,
  isInsuranceAssumedInOP,
  detectGeneralCostGrouping,
} from "@/constants/markupTaxonomy";
import { getDeliveryMethodLabel } from "@/constants/constructionTypes";
import { RangeBar, Ring } from "@/components/intelligence/PureCSSChart";

const fmtCost = n => {
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
  const T = C.T;
  const learningRecords = useScanStore(s => s.learningRecords);
  const calibrationFactors = useScanStore.getState().getCalibrationFactors();
  const [showTrendDetail, setShowTrendDetail] = useState(false);
  const [markupView, setMarkupView] = useState("holistic");
  const [generalCombined, setGeneralCombined] = useState(true);

  const stats = useMemo(() => {
    const won = entries.filter(e => e.outcome === "won");
    const lost = entries.filter(e => e.outcome === "lost");
    const pending = entries.filter(e => e.outcome === "pending");
    const decided = won.length + lost.length;
    const winRate = decided > 0 ? Math.round((won.length / decided) * 100) : null;

    // Avg $/SF — only entries with both (raw)
    const withCostSF = entries.filter(e => e.totalCost > 0 && e.projectSF > 0);
    const avgPerSF =
      withCostSF.length > 0
        ? Math.round(withCostSF.reduce((s, e) => s + e.totalCost / e.projectSF, 0) / withCostSF.length)
        : null;

    // Avg $/SF — adjusted to current year dollars
    const currentYear = getCurrentYear();
    const adjustedEntries = withCostSF.map(e => normalizeEntry(e, currentYear));
    const avgAdjPerSF =
      adjustedEntries.length > 0
        ? Math.round(adjustedEntries.reduce((s, e) => s + e.adjustedCost / e.projectSF, 0) / adjustedEntries.length)
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
        key,
        label: getBuildingTypeLabel(key),
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
      .map(([key, { won: w, total: t }]) => ({
        key,
        label: getBuildingTypeLabel(key),
        rate: Math.round((w / t) * 100),
        won: w,
        total: t,
      }))
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
    const avgDeviation =
      calFactors.length > 0
        ? Math.round((calFactors.reduce((s, f) => s + Math.abs(f - 1), 0) / calFactors.length) * 100)
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
      wonCount: won.length,
      lostCount: lost.length,
      winRate,
      avgPerSF,
      avgAdjPerSF,
      avgPerSFByType,
      winRateByType,
      topClients,
      pipelineCount,
      pipelineValue,
      calCount: calFactors.length,
      avgDeviation,
      totalEntries: entries.length,
      trendData,
      currentIndex,
      sinceBase,
      currentYear,
      divisionBreakdown,
    };
  }, [entries, calibrationFactors]);

  // ── Markup analytics aggregation ──
  const markupStats = useMemo(() => {
    const withMarkups = entries.filter(e => (e.markups || []).length > 0);
    if (withMarkups.length === 0) return null;

    // ── Holistic Overview ──
    const categoryTotals = {};
    MARKUP_CATEGORIES.forEach(c => {
      categoryTotals[c.key] = { sum: 0, count: 0, pcts: [] };
    });

    withMarkups.forEach(entry => {
      const divTotal = Object.values(entry.divisions || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      (entry.markups || []).forEach(m => {
        const tax = classifyMarkup(m.key);
        const amt = m.calculatedAmount || 0;
        if (amt > 0) {
          categoryTotals[tax.category].sum += amt;
          categoryTotals[tax.category].count += 1;
          if (divTotal > 0) categoryTotals[tax.category].pcts.push((amt / divTotal) * 100);
        }
      });
    });

    const holistic = MARKUP_CATEGORIES.map(cat => ({
      ...cat,
      totalAmount: categoryTotals[cat.key].sum,
      occurrences: categoryTotals[cat.key].count,
      avgPctOfDirect:
        categoryTotals[cat.key].pcts.length > 0
          ? Math.round(
              (categoryTotals[cat.key].pcts.reduce((a, b) => a + b, 0) / categoryTotals[cat.key].pcts.length) * 10,
            ) / 10
          : 0,
    })).filter(c => c.totalAmount > 0);

    const totalIndirect = holistic.reduce((s, c) => s + c.totalAmount, 0);
    const totalDirect = withMarkups.reduce(
      (s, e) => s + Object.values(e.divisions || {}).reduce((ds, v) => ds + (parseFloat(v) || 0), 0),
      0,
    );
    const indirectPctOfDirect = totalDirect > 0 ? Math.round((totalIndirect / totalDirect) * 1000) / 10 : 0;

    // ── Margin Analysis ──
    const marginEntries = withMarkups
      .map(entry => {
        const divTotal = Object.values(entry.divisions || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
        const marginItems = (entry.markups || []).filter(m => classifyMarkup(m.key).category === "margin");
        const totalMargin = marginItems.reduce((s, m) => s + (m.calculatedAmount || 0), 0);
        const grouping = detectMarginGrouping(marginItems);
        return {
          entryId: entry.id,
          name: entry.name,
          deliveryMethod: entry.deliveryMethod,
          buildingType: entry.buildingType,
          totalMargin,
          marginPct: divTotal > 0 ? Math.round((totalMargin / divTotal) * 1000) / 10 : 0,
          grouping,
        };
      })
      .filter(e => e.totalMargin > 0);

    const marginByDelivery = {};
    marginEntries.forEach(e => {
      const dm = e.deliveryMethod || "unknown";
      if (!marginByDelivery[dm]) marginByDelivery[dm] = { pcts: [], count: 0, label: getDeliveryMethodLabel(dm) || dm };
      marginByDelivery[dm].pcts.push(e.marginPct);
      marginByDelivery[dm].count += 1;
    });

    const marginGroupings = {};
    marginEntries.forEach(e => {
      marginGroupings[e.grouping] = (marginGroupings[e.grouping] || 0) + 1;
    });

    // ── General Costs Analysis ──
    const generalEntries = withMarkups
      .map(entry => {
        const divTotal = Object.values(entry.divisions || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
        const div01 = parseFloat(entry.divisions?.["01"]) || 0;
        const gcMarkups = (entry.markups || []).filter(m => classifyMarkup(m.key).category === "general");
        const gcMarkupTotal = gcMarkups.reduce((s, m) => s + (m.calculatedAmount || 0), 0);
        const grouping = detectGeneralCostGrouping(entry.markups, entry.divisions);
        const combinedGeneral = div01 + gcMarkupTotal;
        return {
          entryId: entry.id,
          name: entry.name,
          buildingType: entry.buildingType,
          div01,
          gcMarkupTotal,
          combinedGeneral,
          combinedPct: divTotal > 0 ? Math.round((combinedGeneral / divTotal) * 1000) / 10 : 0,
          grouping,
        };
      })
      .filter(e => e.combinedGeneral > 0);

    const overlapCount = generalEntries.filter(e => e.grouping === "both-overlap").length;

    // ── Project-Specific Costs ──
    const projectCostKeys = MARKUP_TAXONOMY.filter(t => t.category === "project-cost");
    const projectCostStats = projectCostKeys
      .map(tax => {
        const relevant = withMarkups.filter(e =>
          (e.markups || []).some(m => m.key === tax.key && (m.calculatedAmount || 0) > 0),
        );
        if (relevant.length === 0) return null;
        const pcts = [];
        relevant.forEach(e => {
          const divTotal = Object.values(e.divisions || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
          const item = e.markups.find(m => m.key === tax.key);
          if (divTotal > 0 && item) pcts.push(((item.calculatedAmount || 0) / divTotal) * 100);
        });
        return {
          key: tax.key,
          label: tax.label,
          projectCount: relevant.length,
          totalProjects: withMarkups.length,
          presencePct: Math.round((relevant.length / withMarkups.length) * 100),
          avgPct: pcts.length > 0 ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : 0,
          minPct: pcts.length > 0 ? Math.round(Math.min(...pcts) * 10) / 10 : 0,
          maxPct: pcts.length > 0 ? Math.round(Math.max(...pcts) * 10) / 10 : 0,
        };
      })
      .filter(Boolean);

    const insuranceAssumedCount = withMarkups.filter(e => isInsuranceAssumedInOP(e.markups || [])).length;

    return {
      withMarkups,
      holistic,
      totalIndirect,
      totalDirect,
      indirectPctOfDirect,
      marginEntries,
      marginByDelivery,
      marginGroupings,
      generalEntries,
      overlapCount,
      projectCostStats,
      insuranceAssumedCount,
    };
  }, [entries]);

  // Stat card helper
  const StatCard = ({ label, value, sub, color, wide }) => (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        background: C.bg2,
        border: `1px solid ${C.border}`,
        minWidth: wide ? 180 : 110,
        flex: wide ? "1 1 180px" : "0 0 auto",
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: C.textDim,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || C.text, fontFamily: T.font.sans }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 9, color: C.textDim, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  // Gradient bar
  const GradientBar = ({ pct, color }) => (
    <div style={{ height: 4, borderRadius: 2, background: C.bg2, flex: 1, position: "relative" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          height: "100%",
          width: `${Math.min(pct, 100)}%`,
          borderRadius: 2,
          background: `linear-gradient(90deg, ${color}80, ${color})`,
        }}
      />
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
            <div
              key={d.year}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 2 }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: 24,
                  height: h,
                  borderRadius: "3px 3px 1px 1px",
                  background: `linear-gradient(180deg, ${barColor}, ${barColor}60)`,
                  position: "relative",
                }}
              >
                {(isCurrent || isBase || d.yoy > 8) && (
                  <div
                    style={{
                      position: "absolute",
                      top: -14,
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: 7,
                      fontWeight: 700,
                      color: barColor,
                      whiteSpace: "nowrap",
                      fontFamily: T.font.sans,
                    }}
                  >
                    {d.index}
                  </div>
                )}
              </div>
              <div
                style={{
                  fontSize: 7,
                  color: isCurrent || isBase ? C.text : C.textDim,
                  fontWeight: isCurrent || isBase ? 700 : 400,
                  fontFamily: T.font.sans,
                }}
              >
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
      <div
        style={{
          padding: "14px 16px",
          borderRadius: 8,
          border: `1px dashed ${C.border}`,
          marginBottom: 16,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 11, color: C.textDim }}>Analytics will appear once you have cost history data</div>
      </div>
    );
  }

  return (
    <div
      style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: C.bg1, border: `1px solid ${C.border}` }}
    >
      {/* Top stat cards */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <StatCard
          label="Win Rate"
          value={stats.winRate !== null ? `${stats.winRate}%` : "—"}
          sub={`${stats.wonCount}W / ${stats.lostCount}L`}
          color={stats.winRate >= 50 ? C.green : stats.winRate !== null ? C.orange : C.textDim}
        />
        <StatCard
          label="Avg $/SF"
          value={
            stats.avgAdjPerSF !== null ? `$${stats.avgAdjPerSF}` : stats.avgPerSF !== null ? `$${stats.avgPerSF}` : "—"
          }
          sub={
            stats.avgAdjPerSF !== null && stats.avgPerSF !== stats.avgAdjPerSF
              ? `Raw $${stats.avgPerSF} • Adj to ${stats.currentYear}$`
              : `From ${entries.filter(e => e.totalCost > 0 && e.projectSF > 0).length} projects`
          }
        />
        <StatCard
          label="Cost Index"
          value={stats.currentIndex}
          sub={`+${stats.sinceBase}% since 2020 base`}
          color={C.accent}
        />
        <StatCard
          label="Pipeline"
          value={stats.pipelineCount}
          sub={stats.pipelineValue > 0 ? fmtCost(stats.pipelineValue) : "No value data"}
          color={C.blue}
        />
        <StatCard
          label="Calibration"
          value={stats.calCount > 0 ? `${stats.calCount} divs` : "—"}
          sub={stats.avgDeviation !== null ? `Avg ${stats.avgDeviation}% deviation` : "No data yet"}
          color={stats.calCount > 0 ? C.accent : C.textDim}
        />
      </div>

      {/* Construction Cost Trends */}
      <div
        style={{
          marginBottom: 14,
          padding: "10px 12px",
          borderRadius: 8,
          background: C.bg2,
          border: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div
            style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}
          >
            Construction Cost Index — BLS/ENR Composite
          </div>
          <button
            onClick={() => setShowTrendDetail(p => !p)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 9,
              color: C.accent,
              fontWeight: 600,
              padding: "2px 6px",
            }}
          >
            {showTrendDetail ? "Hide divisions" : "Show divisions"}
          </button>
        </div>

        {/* Sparkline */}
        <TrendChart data={stats.trendData} />

        {/* YoY row */}
        <div style={{ display: "flex", gap: 2, marginTop: 6, padding: "0 2px" }}>
          {stats.trendData.map(d => (
            <div
              key={d.year}
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 7,
                fontFamily: T.font.sans,
                color: d.yoy > 5 ? C.orange : d.yoy > 0 ? C.green : C.textDim,
                fontWeight: d.yoy > 5 ? 700 : 400,
              }}
            >
              {d.yoy > 0 ? "+" : ""}
              {d.yoy}%
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
                  const label =
                    {
                      concrete: "Concrete/Masonry",
                      metals: "Steel & Metals",
                      wood: "Wood & Composites",
                      thermal: "Thermal/Roofing",
                      openings: "Doors/Windows",
                      finishes: "Finishes",
                      mechanical: "Plumbing/HVAC",
                      electrical: "Electrical",
                      sitework: "Sitework",
                      general: "General/Labor",
                    }[d.category] || d.category;
                  return (
                    <div key={d.category} style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 0" }}>
                      <span
                        style={{
                          fontSize: 8,
                          color: C.textDim,
                          width: 80,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {label}
                      </span>
                      <GradientBar pct={(d.index / maxDiv) * 100} color={d.yoy > 3 ? C.orange : C.accent} />
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: C.text,
                          fontFamily: T.font.sans,
                          minWidth: 28,
                          textAlign: "right",
                        }}
                      >
                        {Math.round(d.index * 10) / 10}
                      </span>
                      <span
                        style={{
                          fontSize: 8,
                          fontWeight: 600,
                          minWidth: 28,
                          textAlign: "right",
                          fontFamily: T.font.sans,
                          color: d.yoy > 3 ? C.orange : d.yoy > 0 ? C.green : C.textDim,
                        }}
                      >
                        {d.yoy > 0 ? "+" : ""}
                        {Math.round(d.yoy * 10) / 10}%
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
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 6,
              }}
            >
              $/SF by Building Type
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {stats.avgPerSFByType.map(t => {
                const maxPerSF = Math.max(...stats.avgPerSFByType.map(x => x.adjPerSF));
                return (
                  <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        fontSize: 9,
                        color: C.textDim,
                        width: 90,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.label}
                    </span>
                    <GradientBar pct={(t.adjPerSF / maxPerSF) * 100} color={C.accent} />
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: C.text,
                        fontFamily: T.font.sans,
                        minWidth: 35,
                        textAlign: "right",
                      }}
                    >
                      ${t.adjPerSF}
                    </span>
                    {t.avgPerSF !== t.adjPerSF && (
                      <span style={{ fontSize: 7, color: C.textDim, fontFamily: T.font.sans }}>
                        ${t.avgPerSF}
                      </span>
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
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 6,
              }}
            >
              Win Rate by Type
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {stats.winRateByType.map(t => (
                <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 9,
                      color: C.textDim,
                      width: 90,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.label}
                  </span>
                  <GradientBar pct={t.rate} color={t.rate >= 50 ? C.green : C.orange} />
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: t.rate >= 50 ? C.green : C.orange,
                      fontFamily: T.font.sans,
                      minWidth: 30,
                      textAlign: "right",
                    }}
                  >
                    {t.rate}%
                  </span>
                  <span style={{ fontSize: 8, color: C.textDim }}>
                    ({t.won}/{t.total})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top clients */}
        {stats.topClients.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 6,
              }}
            >
              Top Clients
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {stats.topClients.map(cl => {
                const maxVal = Math.max(...stats.topClients.map(x => x.totalValue));
                const wr = cl.won + cl.lost > 0 ? Math.round((cl.won / (cl.won + cl.lost)) * 100) : null;
                return (
                  <div key={cl.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        fontSize: 9,
                        color: C.textDim,
                        width: 80,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cl.name}
                    </span>
                    <GradientBar pct={maxVal > 0 ? (cl.totalValue / maxVal) * 100 : 0} color={C.blue} />
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: C.text,
                        fontFamily: T.font.sans,
                        minWidth: 50,
                        textAlign: "right",
                      }}
                    >
                      {fmtCost(cl.totalValue)}
                    </span>
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

      {/* ── Markup / Indirect Cost Analytics ── */}
      {markupStats && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 8,
            }}
          >
            Indirect Cost Intelligence — {markupStats.withMarkups.length} proposals with markup data
          </div>

          {/* View switcher tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              { key: "holistic", label: "Overview" },
              { key: "margin", label: "Margin" },
              { key: "general", label: "General Costs" },
              { key: "project", label: "Project Costs" },
            ].map(v => (
              <button
                key={v.key}
                onClick={() => setMarkupView(v.key)}
                style={bt(C, {
                  background: markupView === v.key ? `${C.accent}15` : "transparent",
                  border: `1px solid ${markupView === v.key ? C.accent + "40" : C.border}`,
                  color: markupView === v.key ? C.accent : C.textDim,
                  padding: "4px 10px",
                  fontSize: 10,
                  fontWeight: 600,
                })}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* ═══ View A: Holistic Indirect Costs Overview ═══ */}
          {markupView === "holistic" && (
            <div>
              {/* Top stat */}
              <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
                <StatCard
                  label="Total Indirect"
                  value={fmtCost(markupStats.totalIndirect)}
                  sub={`${markupStats.indirectPctOfDirect}% of direct costs`}
                  color={C.accent}
                />
                <StatCard
                  label="Direct Costs"
                  value={fmtCost(markupStats.totalDirect)}
                  sub={`Across ${markupStats.withMarkups.length} proposals`}
                />

                {/* Ring chart */}
                {markupStats.holistic.length > 1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Ring
                      segments={markupStats.holistic.map(h => ({
                        value: h.totalAmount,
                        color: C[h.color] || C.accent,
                        label: h.label,
                      }))}
                      size={60}
                      thickness={8}
                      centerLabel=""
                      centerValue={`${markupStats.indirectPctOfDirect}%`}
                    />
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {markupStats.holistic.map(h => (
                        <div key={h.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div style={{ width: 6, height: 6, borderRadius: 3, background: C[h.color] || C.accent }} />
                          <span style={{ fontSize: 8, color: C.textDim }}>{h.label}</span>
                          <span
                            style={{ fontSize: 8, fontWeight: 700, color: C.text, fontFamily: T.font.sans }}
                          >
                            {h.avgPctOfDirect}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Category breakdown bars */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {markupStats.holistic.map(h => {
                  const maxPct = Math.max(...markupStats.holistic.map(x => x.avgPctOfDirect));
                  const catColor = C[h.color] || C.accent;
                  return (
                    <div key={h.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 3, background: catColor, flexShrink: 0 }} />
                      <span
                        style={{
                          fontSize: 9,
                          color: C.textDim,
                          width: 90,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h.label}
                      </span>
                      <GradientBar pct={maxPct > 0 ? (h.avgPctOfDirect / maxPct) * 100 : 0} color={catColor} />
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: catColor,
                          fontFamily: T.font.sans,
                          minWidth: 35,
                          textAlign: "right",
                        }}
                      >
                        {h.avgPctOfDirect}%
                      </span>
                      <span style={{ fontSize: 8, color: C.textDim }}>({h.occurrences} items)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ View B: Margin Analysis ═══ */}
          {markupView === "margin" && (
            <div>
              {/* Margin stats */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                {markupStats.marginEntries.length > 0 &&
                  (() => {
                    const pcts = markupStats.marginEntries.map(e => e.marginPct);
                    const avg = Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10;
                    const min = Math.round(Math.min(...pcts) * 10) / 10;
                    const max = Math.round(Math.max(...pcts) * 10) / 10;
                    // Most common grouping
                    const topGrouping = Object.entries(markupStats.marginGroupings).sort((a, b) => b[1] - a[1])[0];
                    const groupingLabels = {
                      combined: "O&P Combined",
                      split: "Fee + Overhead Split",
                      "fee-only": "Fee Only",
                      "overhead-only": "Overhead Only",
                      none: "None",
                    };
                    return (
                      <>
                        <StatCard
                          label="Avg Margin"
                          value={`${avg}%`}
                          sub={`Range: ${min}% – ${max}%`}
                          color={C.accent}
                        />
                        <StatCard label="Projects" value={markupStats.marginEntries.length} sub="With margin data" />
                        <StatCard
                          label="Most Common"
                          value={groupingLabels[topGrouping?.[0]] || "—"}
                          sub={`${topGrouping?.[1] || 0} of ${markupStats.marginEntries.length} projects`}
                          color={C.blue}
                        />
                      </>
                    );
                  })()}
              </div>

              {/* Margin by delivery method */}
              {Object.keys(markupStats.marginByDelivery).length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: C.textDim,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      marginBottom: 6,
                    }}
                  >
                    Margin % by Delivery Method
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {Object.entries(markupStats.marginByDelivery)
                      .sort((a, b) => b[1].count - a[1].count)
                      .map(([dm, data]) => {
                        const avg = Math.round((data.pcts.reduce((a, b) => a + b, 0) / data.pcts.length) * 10) / 10;
                        const min = Math.round(Math.min(...data.pcts) * 10) / 10;
                        const max = Math.round(Math.max(...data.pcts) * 10) / 10;
                        return (
                          <div key={dm} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                fontSize: 9,
                                color: C.textDim,
                                width: 100,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {data.label}
                            </span>
                            <div style={{ flex: 1 }}>
                              <RangeBar low={min} mid={avg} high={max} color={C.accent} height={5} />
                            </div>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: C.accent,
                                fontFamily: T.font.sans,
                                minWidth: 35,
                                textAlign: "right",
                              }}
                            >
                              {avg}%
                            </span>
                            <span style={{ fontSize: 8, color: C.textDim }}>({data.count})</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Grouping breakdown */}
              {Object.keys(markupStats.marginGroupings).length > 1 && (
                <div style={{ padding: "8px 10px", borderRadius: 6, background: C.bg2, fontSize: 10 }}>
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: C.textDim,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      marginBottom: 4,
                    }}
                  >
                    How GCs Present Their Margin
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {Object.entries(markupStats.marginGroupings).map(([g, count]) => {
                      const labels = {
                        combined: "O&P Combined",
                        split: "Fee + Overhead",
                        "fee-only": "Fee Only",
                        "overhead-only": "Overhead Only",
                      };
                      return (
                        <span key={g} style={{ color: C.text, fontWeight: 600 }}>
                          {labels[g] || g}: <span style={{ color: C.accent }}>{count}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ View C: General Costs ═══ */}
          {markupView === "general" && (
            <div>
              {/* Combined/Separated toggle */}
              <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                <button
                  onClick={() => setGeneralCombined(true)}
                  style={bt(C, {
                    background: generalCombined ? `${C.blue}15` : "transparent",
                    border: `1px solid ${generalCombined ? C.blue + "40" : C.border}`,
                    color: generalCombined ? C.blue : C.textDim,
                    padding: "3px 8px",
                    fontSize: 9,
                    fontWeight: 600,
                  })}
                >
                  Combined (GC + GR + Div 01)
                </button>
                <button
                  onClick={() => setGeneralCombined(false)}
                  style={bt(C, {
                    background: !generalCombined ? `${C.blue}15` : "transparent",
                    border: `1px solid ${!generalCombined ? C.blue + "40" : C.border}`,
                    color: !generalCombined ? C.blue : C.textDim,
                    padding: "3px 8px",
                    fontSize: 9,
                    fontWeight: 600,
                  })}
                >
                  Separated
                </button>
              </div>

              {/* Overlap warning */}
              {markupStats.overlapCount > 0 && (
                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: `${C.orange}10`,
                    border: `1px solid ${C.orange}25`,
                    marginBottom: 10,
                    fontSize: 9,
                    color: C.orange,
                  }}
                >
                  ⚠ {markupStats.overlapCount} proposal{markupStats.overlapCount > 1 ? "s" : ""} have BOTH Division 01
                  costs AND GC/GR markups — possible overlap
                </div>
              )}

              {markupStats.generalEntries.length > 0 &&
                (() => {
                  if (generalCombined) {
                    // Combined view
                    const pcts = markupStats.generalEntries.map(e => e.combinedPct);
                    const avg = Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10;
                    const maxPct = Math.max(...pcts);
                    return (
                      <div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                          <StatCard
                            label="Avg General Cost"
                            value={`${avg}%`}
                            sub={`of direct costs (${markupStats.generalEntries.length} projects)`}
                            color={C.blue}
                          />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {markupStats.generalEntries.slice(0, 12).map(e => (
                            <div key={e.entryId} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span
                                style={{
                                  fontSize: 9,
                                  color: C.textDim,
                                  width: 110,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {e.name}
                              </span>
                              <GradientBar pct={maxPct > 0 ? (e.combinedPct / maxPct) * 100 : 0} color={C.blue} />
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: C.blue,
                                  fontFamily: T.font.sans,
                                  minWidth: 35,
                                  textAlign: "right",
                                }}
                              >
                                {e.combinedPct}%
                              </span>
                              {e.grouping === "both-overlap" && (
                                <span style={{ fontSize: 7, color: C.orange, fontWeight: 700 }}>⚠</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  } else {
                    // Separated view
                    const withDiv01 = markupStats.generalEntries.filter(e => e.div01 > 0);
                    const withGCMarkup = markupStats.generalEntries.filter(e => e.gcMarkupTotal > 0);
                    const avgDiv01Pct =
                      withDiv01.length > 0
                        ? Math.round(
                            (withDiv01.reduce((s, e) => s + e.div01, 0) /
                              withDiv01.reduce(
                                (s, e) =>
                                  s +
                                  (Object.values(e.divisions || {}).reduce((ds, v) => ds + (parseFloat(v) || 0), 0) ||
                                    1),
                                0,
                              )) *
                              1000,
                          ) / 10
                        : 0;
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ padding: "8px 10px", borderRadius: 6, background: C.bg2 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, marginBottom: 4 }}>
                            Division 01 (Direct Cost)
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>
                            {withDiv01.length} of {markupStats.generalEntries.length} projects have Div 01 costs
                          </div>
                        </div>
                        <div style={{ padding: "8px 10px", borderRadius: 6, background: C.bg2 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: C.blue, marginBottom: 4 }}>
                            GC / GR Markups (Below the Line)
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>
                            {withGCMarkup.length} of {markupStats.generalEntries.length} projects have GC/GR markups
                          </div>
                        </div>
                      </div>
                    );
                  }
                })()}
            </div>
          )}

          {/* ═══ View D: Project-Specific Costs ═══ */}
          {markupView === "project" && (
            <div>
              <div style={{ fontSize: 9, color: C.textDim, marginBottom: 10, fontStyle: "italic" }}>
                Project-specific costs are only averaged across projects where they appear — not all projects.
              </div>

              {markupStats.projectCostStats.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {markupStats.projectCostStats.map(pc => {
                    const tax = classifyMarkup(pc.key);
                    const isInsurance = pc.key === "insurance";
                    return (
                      <div
                        key={pc.key}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 6,
                          background: C.bg2,
                          border: `1px solid ${C.border}`,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ fontSize: 10, fontWeight: 700, color: C.text }}>{pc.label}</span>
                          <span
                            style={{
                              fontSize: 8,
                              color: C.textDim,
                              background: `${C.orange}10`,
                              padding: "1px 5px",
                              borderRadius: 3,
                            }}
                          >
                            {pc.projectCount} of {pc.totalProjects} projects
                          </span>
                        </div>
                        <div style={{ marginBottom: 4 }}>
                          <RangeBar low={pc.minPct} mid={pc.avgPct} high={pc.maxPct} color={C.orange} height={4} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                          <span style={{ color: C.textDim }}>
                            {pc.minPct}% — {pc.maxPct}%
                          </span>
                          <span style={{ fontWeight: 700, color: C.orange, fontFamily: T.font.sans }}>
                            avg {pc.avgPct}%
                          </span>
                        </div>
                        {isInsurance && !tax.projectSpecific && (
                          <div style={{ fontSize: 8, color: C.textDim, marginTop: 3, fontStyle: "italic" }}>
                            Typical range: 1.5% – 3.5% of bid
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 10, color: C.textDim, textAlign: "center", padding: 16 }}>
                  No project-specific cost data yet
                </div>
              )}

              {/* Insurance assumed-in-O&P callout */}
              {markupStats.insuranceAssumedCount > 0 && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: `${C.blue}08`,
                    border: `1px solid ${C.blue}15`,
                    fontSize: 9,
                    color: C.blue,
                  }}
                >
                  Insurance not broken out on {markupStats.insuranceAssumedCount} of {markupStats.withMarkups.length}{" "}
                  proposals — likely included in O&P or Overhead
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
