// IntelligencePage — Bloomberg Terminal for Construction
// Shows industry trends, material costs, NOVA benchmarks, portfolio intelligence

import { useEffect, useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useIntelligenceStore } from '@/stores/intelligenceStore';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useMasterDataStore } from '@/stores/masterDataStore';
import { useScanStore } from '@/stores/scanStore';
import { useUiStore } from '@/stores/uiStore';
import { mapStatusToOutcome } from '@/utils/costHistoryMigration';
import {
  getCompositeIndex, getYoYChange, getAllDivisionIndices, getAvailableYears, getCurrentYear,
} from '@/constants/constructionCostIndex';
import { computeDeltas, FRED_SERIES } from '@/constants/fredSeries';
import { pageContainer } from '@/utils/styles';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import NovaOrb from '@/components/dashboard/NovaOrb';

// Intelligence components
import SectionNav from '@/components/intelligence/SectionNav';
import MarketTicker from '@/components/intelligence/MarketTicker';
import IntelligenceKPI from '@/components/intelligence/IntelligenceKPI';
import NovaMarketBrief from '@/components/intelligence/NovaMarketBrief';
import MaterialCharts from '@/components/intelligence/MaterialCharts';
import BenchmarkComparison from '@/components/intelligence/BenchmarkComparison';
import PortfolioIntelligence from '@/components/intelligence/PortfolioIntelligence';
import DivisionDeepDive from '@/components/intelligence/DivisionDeepDive';
import { BarChart, Spark } from '@/components/intelligence/PureCSSChart';

const fmtCost = (n) => {
  if (!n && n !== 0) return "\u2014";
  if (n >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  return "$" + Math.round(n).toLocaleString();
};

export default function IntelligencePage() {
  const C = useTheme();
  const T = C.T;

  const { activeSection, setActiveSection, fredData, fetchFredData, novaBrief } = useIntelligenceStore();
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const historicalProposals = useMasterDataStore(s => s.masterData.historicalProposals || []);
  const calibrationFactors = useScanStore.getState().getCalibrationFactors();
  const fredApiKey = useUiStore(s => s.appSettings.fredApiKey);

  const currentYear = getCurrentYear();

  // Fetch FRED data on mount
  useEffect(() => {
    if (fredApiKey) fetchFredData();
  }, [fredApiKey]);

  // Compute portfolio stats for KPIs
  const portfolioStats = useMemo(() => {
    const all = [
      ...estimatesIndex.map(e => ({ ...e, outcome: mapStatusToOutcome(e.status), totalCost: e.grandTotal || 0 })),
      ...historicalProposals.map(p => ({ ...p, outcome: p.outcome || "pending", totalCost: p.totalCost || 0 })),
    ];
    const won = all.filter(e => e.outcome === "won").length;
    const lost = all.filter(e => e.outcome === "lost").length;
    const pending = all.filter(e => e.outcome === "pending");
    const decided = won + lost;
    const winRate = decided > 0 ? Math.round((won / decided) * 100) : null;
    const pipelineValue = pending.reduce((s, e) => s + (e.totalCost || 0), 0);
    return { total: all.length, won, lost, winRate, pendingCount: pending.length, pipelineValue };
  }, [estimatesIndex, historicalProposals]);

  // Construction cost index data
  const compositeIndex = getCompositeIndex(currentYear);
  const compositeYoY = getYoYChange(currentYear);
  const divs = getAllDivisionIndices(currentYear);
  const years = getAvailableYears();
  const compositeSparkData = years.map(y => getCompositeIndex(y));
  const hottest = divs.length > 0 ? divs.reduce((a, b) => a.yoy > b.yoy ? a : b) : null;

  // FRED-based housing starts
  const startsData = fredData.housingStarts || [];
  const startsDelta = computeDeltas(startsData);
  const startsSparkData = startsData.slice(-12).map(d => d.value);

  // Calibration
  const calCount = Object.keys(calibrationFactors).length;
  const calFactors = Object.values(calibrationFactors);
  const avgDeviation = calFactors.length > 0
    ? Math.round(calFactors.reduce((s, f) => s + Math.abs(f - 1), 0) / calFactors.length * 100)
    : null;

  // Context data for NOVA brief
  const briefContext = {
    currentIndex: compositeIndex.toFixed(1),
    yoyChange: compositeYoY.toFixed(1),
    hottestDiv: hottest ? hottest.category : "N/A",
    hottestIndex: hottest ? hottest.index.toFixed(1) : "N/A",
    hottestYoy: hottest ? hottest.yoy.toFixed(1) : "N/A",
    lumberTrend: fredData.lumber?.length > 0 ? `${computeDeltas(fredData.lumber).mom}% MoM` : null,
    steelTrend: fredData.steel?.length > 0 ? `${computeDeltas(fredData.steel).mom}% MoM` : null,
    housingStarts: startsDelta.current ? `${Math.round(startsDelta.current)}K` : null,
    pipelineCount: portfolioStats.pendingCount,
    pipelineValue: fmtCost(portfolioStats.pipelineValue),
    winRate: portfolioStats.winRate || 0,
  };

  // Auto-generate brief on first visit if no brief yet
  useEffect(() => {
    if (!novaBrief.text && !novaBrief.loading) {
      // Delay slightly to let FRED data load first
      const timer = setTimeout(() => {
        useIntelligenceStore.getState().generateNovaBrief(briefContext);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Last updated time
  const lastUpdated = fredData.lastFetched
    ? (() => {
        const mins = Math.round((Date.now() - fredData.lastFetched) / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return `${mins}m ago`;
        return `${Math.round(mins / 60)}h ago`;
      })()
    : null;

  return (
    <div style={pageContainer(C)}>
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Ic d={I.intelligence} size={22} color={C.accent} sw={2} />
          <div>
            <h1 style={{
              fontSize: T.fontSize.xl, fontWeight: T.fontWeight.bold, color: C.text,
              margin: 0, fontFamily: "'DM Sans', sans-serif",
            }}>
              Intelligence Center
            </h1>
            <div style={{ fontSize: T.fontSize.xs, color: C.textMuted, marginTop: 2 }}>
              Market data, benchmarks, and portfolio analytics
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {lastUpdated && (
            <span style={{ fontSize: 9, color: C.textDim }}>Updated {lastUpdated}</span>
          )}
          {fredApiKey && (
            <button
              onClick={() => {
                useIntelligenceStore.getState().clearCache();
                setTimeout(() => fetchFredData(), 100);
              }}
              style={{
                background: `${C.accent}10`, border: `1px solid ${C.accent}30`,
                color: C.accent, borderRadius: 5, padding: "5px 10px",
                fontSize: 9, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <Ic d={I.refresh} size={11} color={C.accent} />
              Refresh
            </button>
          )}
          <NovaOrb size={18} scheme="nova" />
        </div>
      </div>

      {/* Market Ticker */}
      <div style={{ marginLeft: -T.space[8], marginRight: -T.space[8], marginBottom: 14 }}>
        <MarketTicker />
      </div>

      {/* Section Nav */}
      <div style={{ marginBottom: 16 }}>
        <SectionNav active={activeSection} onChange={setActiveSection} />
      </div>

      {/* ═══ OVERVIEW ═══ */}
      {activeSection === "overview" && (
        <>
          {/* KPI Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
            <IntelligenceKPI
              label="Cost Index"
              value={compositeIndex.toFixed(1)}
              delta={`${compositeYoY.toFixed(1)}%`}
              icon={I.report}
              color={C.accent}
              spark={compositeSparkData}
              accent pulse
            />
            <IntelligenceKPI
              label="Pipeline"
              value={fmtCost(portfolioStats.pipelineValue)}
              sub={`${portfolioStats.pendingCount} active bids`}
              icon={I.dollar}
              color={C.green}
            />
            <IntelligenceKPI
              label="Win Rate"
              value={portfolioStats.winRate !== null ? `${portfolioStats.winRate}%` : "\u2014"}
              sub={`${portfolioStats.won}W / ${portfolioStats.lost}L`}
              icon={I.check}
              color={portfolioStats.winRate >= 50 ? C.green : C.orange}
            />
            <IntelligenceKPI
              label="Housing Starts"
              value={startsDelta.current ? `${Math.round(startsDelta.current)}K` : "\u2014"}
              delta={startsDelta.mom !== null ? `${startsDelta.mom}%` : null}
              icon={I.dashboard}
              color={C.orange}
              spark={startsSparkData.length > 0 ? startsSparkData : null}
            />
            <IntelligenceKPI
              label="Calibration"
              value={calCount > 0 ? `${calCount} divs` : "\u2014"}
              sub={avgDeviation !== null ? `${avgDeviation}% avg deviation` : "No data yet"}
              icon={I.ai}
              color={calCount > 0 ? C.purple : C.textDim}
            />
          </div>

          {/* NOVA Brief */}
          <div style={{ marginBottom: 16 }}>
            <NovaMarketBrief contextData={briefContext} />
          </div>

          {/* Two-column: Cost Index Trend + Material Sparklines */}
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14 }}>
            {/* Cost Index Trend */}
            <div style={{
              padding: "14px 16px", borderRadius: T.radius.md,
              background: C.glassBg || 'rgba(18,21,28,0.55)',
              backdropFilter: T.glass.blur, WebkitBackdropFilter: T.glass.blur,
              border: `1px solid ${C.glassBorder || 'rgba(255,255,255,0.06)'}`,
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                Construction Cost Index — Composite (2015\u2013{currentYear})
              </div>
              <BarChart
                data={years.map(y => ({
                  label: String(y).slice(-2),
                  value: getCompositeIndex(y),
                  color: y === currentYear ? C.accent : y === 2020 ? C.blue : C.textDim,
                }))}
                height={80}
                showLabels={true}
                showValues={false}
                animate={true}
              />
              {/* YoY row */}
              <div style={{ display: "flex", gap: 1, marginTop: 4, padding: "0 1px" }}>
                {years.map(y => {
                  const yoy = getYoYChange(y);
                  return (
                    <div key={y} style={{
                      flex: 1, textAlign: "center", fontSize: 7,
                      fontFamily: "'DM Mono',monospace",
                      color: yoy > 5 ? C.orange : yoy > 0 ? C.green : C.textDim,
                      fontWeight: yoy > 5 ? 700 : 400,
                    }}>
                      {yoy > 0 ? "+" : ""}{yoy.toFixed(1)}%
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Material Mini-Charts */}
            <div style={{
              padding: "14px 16px", borderRadius: T.radius.md,
              background: C.glassBg || 'rgba(18,21,28,0.55)',
              backdropFilter: T.glass.blur, WebkitBackdropFilter: T.glass.blur,
              border: `1px solid ${C.glassBorder || 'rgba(255,255,255,0.06)'}`,
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                Division Cost Indices ({currentYear})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {divs.sort((a, b) => b.index - a.index).map(d => {
                  const label = {
                    concrete: "Concrete", metals: "Steel", wood: "Lumber",
                    thermal: "Roofing", openings: "Openings", finishes: "Finishes",
                    mechanical: "Mech/Plmb", electrical: "Electrical",
                    sitework: "Sitework", general: "Labor",
                  }[d.category] || d.category;
                  const maxIdx = Math.max(...divs.map(x => x.index));
                  return (
                    <div key={d.category} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 8, color: C.textDim, width: 50, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                      <div style={{ flex: 1, height: 3, borderRadius: 2, background: C.bg2, position: "relative" }}>
                        <div style={{
                          position: "absolute", left: 0, top: 0, height: "100%",
                          width: `${(d.index / maxIdx) * 100}%`, borderRadius: 2,
                          background: d.yoy > 3 ? C.orange : C.accent,
                          transition: "width 600ms ease",
                        }} />
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.text, fontFamily: "'DM Mono',monospace", minWidth: 26, textAlign: "right" }}>
                        {d.index.toFixed(0)}
                      </span>
                      <span style={{
                        fontSize: 8, fontWeight: 600, minWidth: 28, textAlign: "right",
                        fontFamily: "'DM Mono',monospace",
                        color: d.yoy > 3 ? C.orange : d.yoy > 0 ? C.green : C.textDim,
                      }}>
                        +{d.yoy.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ MARKETS ═══ */}
      {activeSection === "markets" && (
        <MaterialCharts />
      )}

      {/* ═══ BENCHMARKS ═══ */}
      {activeSection === "benchmarks" && (
        <BenchmarkComparison />
      )}

      {/* ═══ PORTFOLIO ═══ */}
      {activeSection === "portfolio" && (
        <PortfolioIntelligence />
      )}

      {/* ═══ DIVISIONS ═══ */}
      {activeSection === "divisions" && (
        <DivisionDeepDive />
      )}
    </div>
  );
}
