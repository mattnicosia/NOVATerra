// CoreSources — Data sources overview tab
// Shows what data has been auto-embedded into NOVA's intelligence

import { useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useSubdivisionStore } from "@/stores/subdivisionStore";
import { I } from "@/constants/icons";

function SourceCard({ icon, iconColor, title, count, description, status, C, T }) {
  return (
    <div
      style={{
        padding: "18px 20px",
        borderRadius: T.radius.md,
        background: C.bg2,
        border: `1px solid ${C.border}`,
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: `${iconColor}10`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke={iconColor}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={icon} />
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{title}</span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 8,
              background: status === "active" ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
              color: status === "active" ? "#10B981" : "#F59E0B",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {status === "active" ? "Active" : "Pending"}
          </span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: T.font.sans, marginBottom: 4 }}>
          {count.toLocaleString()}
        </div>
        <p style={{ fontSize: 11, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>{description}</p>
      </div>
    </div>
  );
}

function ComingSoonCard({ title, description, C, T }) {
  return (
    <div
      style={{
        padding: "16px 20px",
        borderRadius: T.radius.md,
        background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)",
        border: `1px dashed ${C.border}`,
        display: "flex",
        gap: 12,
        alignItems: "center",
        opacity: 0.7,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke={C.textDim}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      </div>
      <div>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted }}>{title}</span>
        <p style={{ fontSize: 10.5, color: C.textDim, margin: "2px 0 0", lineHeight: 1.4 }}>{description}</p>
      </div>
    </div>
  );
}

export default function CoreSources() {
  const C = useTheme();
  const T = C.T;

  const elements = useDatabaseStore(s => s.elements);
  const assemblies = useDatabaseStore(s => s.assemblies);
  const proposals = useMasterDataStore(s => s.masterData.historicalProposals || []);
  const drawings = useDrawingsStore(s => s.drawings);

  // Subdivision engine stats
  const subdivisionStats = useSubdivisionStore(s => s.getStats)();

  const stats = useMemo(() => {
    const userElements = elements.filter(e => !e.id?.startsWith("s"));
    const seedElements = elements.filter(e => e.id?.startsWith("s"));
    const drawingsWithNotes = (drawings || []).filter(d => d.extractedNotes?.notes?.length > 0);
    const totalNotes = drawingsWithNotes.reduce((sum, d) => sum + (d.extractedNotes?.notes?.length || 0), 0);
    return {
      userElements: userElements.length,
      seedElements: seedElements.length,
      assemblies: assemblies.length,
      proposals: proposals.length,
      drawingsWithNotes: drawingsWithNotes.length,
      totalNotes,
    };
  }, [elements, assemblies, proposals, drawings]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: "0 0 4px" }}>
          Data Sources Feeding NOVA
        </h3>
        <p style={{ fontSize: 11.5, color: C.textMuted, margin: 0 }}>
          NOVA automatically learns from your data. Every element, proposal, and drawing note is embedded for
          semantic intelligence.
        </p>
      </div>

      {/* Active Sources */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        <SourceCard
          icon={I.database}
          iconColor="#3B82F6"
          title="Seed Cost Database"
          count={stats.seedElements}
          description="Built-in construction cost data. Shared across all users and always available as baseline pricing."
          status="active"
          C={C}
          T={T}
        />
        <SourceCard
          icon={I.estimate}
          iconColor="#8B5CF6"
          title="User Cost Items"
          count={stats.userElements}
          description="Your custom cost items, overrides, and imported subcontractor pricing. Auto-embedded on creation."
          status={stats.userElements > 0 ? "active" : "pending"}
          C={C}
          T={T}
        />
        <SourceCard
          icon={I.report}
          iconColor="#EC4899"
          title="Historical Proposals"
          count={stats.proposals}
          description="Uploaded proposals and past bids. Used for ROM calibration, cost benchmarking, and pattern recognition."
          status={stats.proposals > 0 ? "active" : "pending"}
          C={C}
          T={T}
        />
        <SourceCard
          icon={I.assembly}
          iconColor="#10B981"
          title="Assemblies"
          count={stats.assemblies}
          description="Pre-built assembly templates. Each assembly and its components are embedded for semantic matching."
          status={stats.assemblies > 0 ? "active" : "pending"}
          C={C}
          T={T}
        />
        <SourceCard
          icon={I.plans}
          iconColor="#F59E0B"
          title="Drawing Notes"
          count={stats.totalNotes}
          description={`Extracted from ${stats.drawingsWithNotes} drawing sheet${stats.drawingsWithNotes !== 1 ? "s" : ""}. Notes are auto-embedded when you extract them in Plan Room.`}
          status={stats.drawingsWithNotes > 0 ? "active" : "pending"}
          C={C}
          T={T}
        />
        <SourceCard
          icon="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M7.5 4.21l4.5 2.6 4.5-2.6 M7.5 19.79V14.6L3 12 M21 12l-4.5 2.6v5.19 M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12"
          iconColor="#7C3AED"
          title="Subdivision Engine"
          count={subdivisionStats.totalSubs}
          description={`AI-generated subdivision allocations with confidence weighting. ${subdivisionStats.validatedLlm} validated, ${subdivisionStats.userOverrideCount} user overrides, ${subdivisionStats.calibratedCount} calibrated.`}
          status={subdivisionStats.totalSubs > 0 ? "active" : "pending"}
          C={C}
          T={T}
        />
      </div>

      {/* Coming Soon */}
      <div>
        <h3
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: C.textDim,
            margin: "8px 0 10px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Coming Soon
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ComingSoonCard
            title="Specification Sections"
            description="Upload spec books and NOVA will learn scope requirements, material specs, and performance criteria."
            C={C}
            T={T}
          />
          <ComingSoonCard
            title="Contracts & Change Orders"
            description="Feed contract documents to help NOVA understand pricing structures and scope negotiation patterns."
            C={C}
            T={T}
          />
          <ComingSoonCard
            title="Vendor Catalogs & Price Lists"
            description="Import manufacturer pricing to keep NOVA's material costs current with real market data."
            C={C}
            T={T}
          />
        </div>
      </div>
    </div>
  );
}
