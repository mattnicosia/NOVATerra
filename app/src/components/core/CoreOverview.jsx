// CoreOverview — Intelligence Dashboard tab
// Shows data health KPIs, NOVA intelligence meter, quick actions, and recent activity

import { useMemo, useState, useEffect, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useUiStore } from "@/stores/uiStore";
import NovaIntelligenceMeter from "@/components/core/NovaIntelligenceMeter";
import ConfidenceEngineAdmin from "@/components/core/ConfidenceEngineAdmin";
import CsvImportModal from "@/components/import/CsvImportModal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { aggregateTradePricing, loadTradePricingIndex } from "@/utils/tradePricingAggregator";

const KPI_ICONS = {
  proposals: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8",
  costItems:
    "M12 2C6.48 2 2 4.02 2 6.5S6.48 11 12 11s10-2.02 10-4.5S17.52 2 12 2z M2 6.5v5c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5v-5",
  assemblies:
    "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12",
  trades: "M12 20V10 M18 20V4 M6 20v-4",
};

function KpiCard({ icon, label, value, sub, color, accent }) {
  const C = useTheme();
  const T = C.T;
  return (
    <div
      style={{
        flex: "1 1 140px",
        minWidth: 140,
        padding: "16px 18px",
        borderRadius: T.radius.md,
        background: C.bg2,
        border: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: `${color || accent}12`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color || accent}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={icon} />
          </svg>
        </div>
        <span style={{ fontSize: 10.5, color: C.textMuted, fontWeight: 500, letterSpacing: "0.02em" }}>{label}</span>
      </div>
      <div>
        <span
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: C.text,
            fontFamily: T.font.sans,
            lineHeight: 1,
          }}
        >
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
        {sub && <span style={{ fontSize: 10, color: C.textDim, marginLeft: 6 }}>{sub}</span>}
      </div>
    </div>
  );
}

export default function CoreOverview() {
  const C = useTheme();
  const T = C.T;
  const setActiveTab = useUiStore(s => s.setCoreActiveTab);
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);

  // Data sources
  const proposals = useMasterDataStore(s => s.masterData.historicalProposals || []);
  const elements = useDatabaseStore(s => s.elements);
  const assemblies = useDatabaseStore(s => s.assemblies);
  const drawings = useDrawingPipelineStore(s => s.drawings);

  // Modals
  const [showCsvModal, setShowCsvModal] = useState(false);

  // Trade pricing index state
  const [tradeIndex, setTradeIndex] = useState(null);
  const [tradeRefreshing, setTradeRefreshing] = useState(false);
  const [tradeResult, setTradeResult] = useState(null); // { count, fromRuns } or { error }

  // Load trade index on mount
  useEffect(() => {
    loadTradePricingIndex().then(idx => {
      if (idx && Object.keys(idx).length > 0) setTradeIndex(idx);
    }).catch(() => {});
  }, []);

  const handleRefreshTradeIndex = useCallback(async () => {
    setTradeRefreshing(true);
    setTradeResult(null);
    try {
      const result = await aggregateTradePricing();
      setTradeResult(result);
      // Reload index after aggregation
      const idx = await loadTradePricingIndex();
      if (idx && Object.keys(idx).length > 0) setTradeIndex(idx);
    } catch (err) {
      setTradeResult({ error: err.message });
    } finally {
      setTradeRefreshing(false);
    }
  }, []);

  // Compute trade index summary stats
  const tradeStats = useMemo(() => {
    if (!tradeIndex) return null;
    const divisions = Object.keys(tradeIndex);
    let totalSamples = 0;
    const divSamples = [];
    for (const div of divisions) {
      const metrics = Object.values(tradeIndex[div]);
      const divTotal = metrics.reduce((s, m) => s + (m.sampleCount || 0), 0);
      totalSamples += divTotal;
      divSamples.push({ div, name: metrics[0]?.tradeName || `Div ${div}`, count: divTotal });
    }
    divSamples.sort((a, b) => b.count - a.count);
    return { totalItems: divisions.length, totalSamples, topDivisions: divSamples.slice(0, 5) };
  }, [tradeIndex]);

  // Compute stats
  const stats = useMemo(() => {
    // Filter proposals by company
    const filteredProposals =
      activeCompanyId === "__all__"
        ? proposals
        : proposals.filter(p => (p.companyProfileId || "") === (activeCompanyId || ""));

    // User-created elements (not seeds)
    const userElements = elements.filter(e => !e.id?.startsWith("s"));

    // Drawings with extracted notes
    const drawingsWithNotes = (drawings || []).filter(d => d.extractedNotes?.notes?.length > 0);

    // Count unique trades
    const trades = new Set();
    userElements.forEach(e => {
      if (e.trade) trades.add(e.trade);
    });
    filteredProposals.forEach(p => {
      const divs = p.divisions;
      if (Array.isArray(divs)) {
        divs.forEach(d => {
          if (d.code) trades.add(d.code);
        });
      } else if (divs && typeof divs === "object") {
        Object.keys(divs).forEach(code => trades.add(code));
      }
    });

    // Won/Lost stats
    const won = filteredProposals.filter(p => p.outcome === "won").length;
    const lost = filteredProposals.filter(p => p.outcome === "lost").length;

    return {
      proposalCount: filteredProposals.length,
      elementCount: userElements.length,
      assemblyCount: assemblies.length,
      drawingNoteCount: drawingsWithNotes.length,
      tradeCount: trades.size,
      won,
      lost,
      proposals: filteredProposals,
    };
  }, [proposals, elements, assemblies, drawings, activeCompanyId]);

  // Recent activity (last 5 proposals added)
  const recentActivity = useMemo(() => {
    return [...stats.proposals].sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0)).slice(0, 5);
  }, [stats.proposals]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Intelligence Meter ── */}
      <NovaIntelligenceMeter
        proposalCount={stats.proposalCount}
        elementCount={stats.elementCount}
        assemblyCount={stats.assemblyCount}
        drawingNoteCount={stats.drawingNoteCount}
      />

      {/* ── KPI Cards ── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiCard
          icon={KPI_ICONS.proposals}
          label="Proposals"
          value={stats.proposalCount}
          sub={stats.won || stats.lost ? `${stats.won}W / ${stats.lost}L` : null}
          color={C.accent}
          accent={C.accent}
        />
        <KpiCard
          icon={KPI_ICONS.costItems}
          label="Cost Items"
          value={stats.elementCount}
          sub="user-created"
          color="#3B82F6"
          accent={C.accent}
        />
        <KpiCard
          icon={KPI_ICONS.assemblies}
          label="Assemblies"
          value={stats.assemblyCount}
          color="#10B981"
          accent={C.accent}
        />
        <KpiCard
          icon={KPI_ICONS.trades}
          label="Trades Covered"
          value={stats.tradeCount}
          sub="of 16"
          color="#F59E0B"
          accent={C.accent}
        />
      </div>

      {/* ── Quick Actions ── */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {[
          { label: "Upload Proposal", icon: I.upload, color: C.accent, action: () => setActiveTab("proposals") },
          { label: "Import CSV / Excel", icon: I.layers, color: "#10B981", action: () => setShowCsvModal(true) },
          { label: tradeRefreshing ? "Refreshing..." : "Refresh Trade Index", icon: I.barChart || KPI_ICONS.trades, color: "#F59E0B", action: handleRefreshTradeIndex, disabled: tradeRefreshing },
        ].map(a => (
          <button
            key={a.label}
            onClick={a.action}
            disabled={a.disabled}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              borderRadius: T.radius.md,
              background: `${a.color}0A`,
              border: `1px solid ${a.color}20`,
              cursor: a.disabled ? "wait" : "pointer",
              color: a.color,
              fontSize: 12,
              fontWeight: 600,
              transition: "all 0.15s",
              opacity: a.disabled ? 0.6 : 1,
            }}
            onMouseEnter={e => {
              if (!a.disabled) {
                e.currentTarget.style.background = `${a.color}15`;
                e.currentTarget.style.borderColor = `${a.color}35`;
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = `${a.color}0A`;
              e.currentTarget.style.borderColor = `${a.color}20`;
            }}
          >
            <Ic d={a.icon} size={14} color={a.color} />
            {a.label}
          </button>
        ))}
      </div>

      {/* ── Trade Pricing Index ── */}
      {(tradeStats || tradeResult) && (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: T.radius.md,
            background: C.bg2,
            border: `1px solid ${C.border}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={KPI_ICONS.trades} />
              </svg>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Trade Pricing Index</span>
              {tradeStats && (
                <span style={{ fontSize: 10, color: C.textDim, fontWeight: 500 }}>
                  {tradeStats.totalItems} divisions / {tradeStats.totalSamples} samples
                </span>
              )}
            </div>
            <button
              onClick={handleRefreshTradeIndex}
              disabled={tradeRefreshing}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: `1px solid #F59E0B30`,
                background: tradeRefreshing ? "#F59E0B10" : "#F59E0B08",
                color: "#F59E0B",
                fontSize: 10,
                fontWeight: 600,
                cursor: tradeRefreshing ? "wait" : "pointer",
                opacity: tradeRefreshing ? 0.6 : 1,
              }}
            >
              {tradeRefreshing ? "Aggregating..." : "Refresh"}
            </button>
          </div>

          {/* Aggregation result toast */}
          {tradeResult && (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                background: tradeResult.error ? "rgba(248,113,113,0.06)" : "rgba(16,185,129,0.06)",
                border: `1px solid ${tradeResult.error ? "rgba(248,113,113,0.15)" : "rgba(16,185,129,0.15)"}`,
                fontSize: 11,
                color: tradeResult.error ? "#F87171" : "#10B981",
                marginBottom: tradeStats ? 10 : 0,
              }}
            >
              {tradeResult.error
                ? `Aggregation failed: ${tradeResult.error}`
                : tradeResult.count > 0
                  ? `Aggregated ${tradeResult.count} index entries from ${tradeResult.fromRuns} parsed proposals`
                  : "No data to aggregate yet — upload proposals or run batch ingestion first"}
            </div>
          )}

          {/* Top divisions by sample count */}
          {tradeStats && tradeStats.topDivisions.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {tradeStats.topDivisions.map(d => (
                <div
                  key={d.div}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 10px",
                    borderRadius: 6,
                    background: C.bg,
                  }}
                >
                  <span style={{ fontSize: 10, color: C.textDim, fontFamily: "'IBM Plex Mono', monospace", width: 24, flexShrink: 0 }}>
                    {d.div}
                  </span>
                  <span style={{ fontSize: 11, color: C.text, flex: 1 }}>{d.name}</span>
                  <div
                    style={{
                      height: 4,
                      width: 60,
                      borderRadius: 2,
                      background: C.border,
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, (d.count / (tradeStats.topDivisions[0]?.count || 1)) * 100)}%`,
                        background: "#F59E0B",
                        borderRadius: 2,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 10, color: C.textDim, width: 32, textAlign: "right", flexShrink: 0 }}>
                    {d.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Recent Activity ── */}
      {recentActivity.length > 0 && (
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: "0 0 10px" }}>Recent Activity</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {recentActivity.map(p => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 14px",
                  borderRadius: T.radius.sm,
                  background: C.bg2,
                  border: `1px solid ${C.border}`,
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: p.outcome === "won" ? C.green : p.outcome === "lost" ? C.red : C.accent,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color: C.text,
                    fontWeight: 500,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.name || "Untitled Proposal"}
                </span>
                <span style={{ fontSize: 10, color: C.textDim, flexShrink: 0 }}>{p.client || "—"}</span>
                <span style={{ fontSize: 10, color: C.textDim, fontFamily: T.font.sans, flexShrink: 0 }}>
                  {p.totalCost ? `$${Math.round(p.totalCost).toLocaleString()}` : "—"}
                </span>
                <span style={{ fontSize: 9, color: C.textDim, flexShrink: 0 }}>
                  {p.importedAt ? new Date(p.importedAt).toLocaleDateString() : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty State ── */}
      {stats.proposalCount === 0 && stats.elementCount === 0 && (
        <div
          style={{
            padding: "40px 24px",
            borderRadius: T.radius.lg,
            background: C.bg2,
            border: `1px dashed ${C.border}`,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>🧠</div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: "0 0 6px" }}>
            NOVA Core is ready to learn
          </h3>
          <p style={{ fontSize: 12, color: C.textMuted, margin: "0 0 16px", maxWidth: 380, marginInline: "auto" }}>
            Upload your first proposal or import cost data to begin training NOVA's intelligence. Every data point
            makes your estimates more accurate.
          </p>
          <button
            onClick={() => setActiveTab("proposals")}
            style={{
              padding: "10px 24px",
              borderRadius: T.radius.md,
              background: C.accent,
              border: "none",
              cursor: "pointer",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              boxShadow: `0 2px 12px ${C.accent}30`,
            }}
          >
            Upload Your First Proposal
          </button>
        </div>
      )}

      {/* ── Admin: Subdivision Engine Config (matt@ only) ── */}
      <ConfidenceEngineAdmin />

      {/* Modals */}
      {showCsvModal && <CsvImportModal onClose={() => setShowCsvModal(false)} />}
    </div>
  );
}
