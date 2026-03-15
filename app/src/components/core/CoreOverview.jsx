// CoreOverview — Intelligence Dashboard tab
// Shows data health KPIs, NOVA intelligence meter, quick actions, and recent activity

import { useMemo, useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useUiStore } from "@/stores/uiStore";
import { useCoreStore } from "@/stores/coreStore";
import NovaIntelligenceMeter from "@/components/core/NovaIntelligenceMeter";
import ConfidenceEngineAdmin from "@/components/core/ConfidenceEngineAdmin";
import CsvImportModal from "@/components/import/CsvImportModal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

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
  const setActiveTab = useCoreStore(s => s.setActiveTab);
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);
  const showToast = useUiStore(s => s.showToast);

  // Data sources
  const proposals = useMasterDataStore(s => s.masterData.historicalProposals || []);
  const elements = useDatabaseStore(s => s.elements);
  const assemblies = useDatabaseStore(s => s.assemblies);
  const drawings = useDrawingsStore(s => s.drawings);

  // Modals
  const [showCsvModal, setShowCsvModal] = useState(false);

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
          color="#8B5CF6"
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
          { label: "Upload Proposal", icon: I.upload, color: "#8B5CF6", action: () => setActiveTab("proposals") },
          { label: "Import CSV / Excel", icon: I.layers, color: "#10B981", action: () => setShowCsvModal(true) },
        ].map(a => (
          <button
            key={a.label}
            onClick={a.action}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              borderRadius: T.radius.md,
              background: `${a.color}0A`,
              border: `1px solid ${a.color}20`,
              cursor: "pointer",
              color: a.color,
              fontSize: 12,
              fontWeight: 600,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = `${a.color}15`;
              e.currentTarget.style.borderColor = `${a.color}35`;
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
                    background: p.outcome === "won" ? "#10B981" : p.outcome === "lost" ? "#EF4444" : "#8B5CF6",
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
            Upload your first proposal or import cost data to begin training NOVA's intelligence. Every data point makes
            your estimates more accurate.
          </p>
          <button
            onClick={() => setActiveTab("proposals")}
            style={{
              padding: "10px 24px",
              borderRadius: T.radius.md,
              background: `linear-gradient(135deg, #8B5CF6, #7C3AED)`,
              border: "none",
              cursor: "pointer",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              boxShadow: "0 2px 12px rgba(139,92,246,0.3)",
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
