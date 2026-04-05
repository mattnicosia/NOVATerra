import { Component, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useUiStore } from "@/stores/uiStore";
import CompanySwitcher from "@/components/shared/CompanySwitcher";
import CoreNav from "@/components/core/CoreNav";
import CoreOverview from "@/components/core/CoreOverview";
import CoreProposals from "@/components/core/CoreProposals";
import CostDatabasePage from "@/pages/CostDatabasePage";
import CoreSources from "@/components/core/CoreSources";
import CoreExplorer from "@/components/core/CoreExplorer";
import CoreExtraction from "@/components/core/CoreExtraction";
import { importBatchParsedProposals, calibrateFromImportedProposals } from "@/data/importProposals";


// Lightweight per-tab error catcher — prevents one tab crash from killing the page
class TabErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(err, info) {
    console.error("[CoreTab]", err, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          background: "rgba(248,113,113,0.04)",
          borderRadius: 12,
          border: "1px solid rgba(248,113,113,0.12)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "#F87171", marginBottom: 8 }}>
          This tab encountered an error
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#999",
            marginBottom: 16,
            fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
          }}
        >
          {this.state.error?.message || "Unknown error"}
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          style={{
            padding: "6px 16px",
            borderRadius: 6,
            border: "1px solid rgba(248,113,113,0.3)",
            background: "rgba(248,113,113,0.08)",
            color: "#F87171",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }
}

export default function CorePage() {
  const C = useTheme();
  const activeTab = useUiStore(s => s.coreActiveTab);
  const setActiveTab = useUiStore(s => s.setCoreActiveTab);
  const [searchParams] = useSearchParams();

  // Sync ?tab= URL param → coreStore
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && tab !== activeTab) setActiveTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]); // only sync on URL param change, not on activeTab

  // Auto-import batch-parsed proposals from Supabase ingestion_runs (once per version)
  useEffect(() => {
    const key = "bldg-batch-import-v1";
    if (!localStorage.getItem(key)) {
      importBatchParsedProposals().then(count => {
        if (count > 0) {
          localStorage.setItem(key, Date.now().toString());
          calibrateFromImportedProposals();
          console.log(`[CorePage] Auto-imported ${count} batch-parsed proposals`);
        }
      }).catch(err => console.warn("[CorePage] Batch import skipped:", err.message));
    }
  }, []);

  const tabContent = {
    overview: (
      <TabErrorBoundary key="overview">
        <CoreOverview />
      </TabErrorBoundary>
    ),
    proposals: (
      <TabErrorBoundary key="proposals">
        <CoreProposals />
      </TabErrorBoundary>
    ),
    database: (
      <TabErrorBoundary key="database">
        <CostDatabasePage embedded />
      </TabErrorBoundary>
    ),
    sources: (
      <TabErrorBoundary key="sources">
        <CoreSources />
      </TabErrorBoundary>
    ),
    explorer: (
      <TabErrorBoundary key="explorer">
        <CoreExplorer />
      </TabErrorBoundary>
    ),
    extraction: (
      <TabErrorBoundary key="extraction">
        <CoreExtraction />
      </TabErrorBoundary>
    ),
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: "28px 36px 36px",
        gap: 20,
        overflowY: "auto",
        minHeight: 0,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: C.text,
                margin: 0,
                letterSpacing: "-0.02em",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              NOVA Core
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: C.accentBg,
                  color: C.accent,
                  textTransform: "uppercase",
                }}
              >
                Intelligence Engine
              </span>
            </h1>
            <p
              style={{
                fontSize: 12,
                color: C.textMuted,
                margin: "2px 0 0",
                lineHeight: 1.4,
              }}
            >
              Your data feeds NOVA's intelligence. Upload proposals, track costs, and grow smarter with every
              project.
            </p>
          </div>
        </div>

        <CompanySwitcher />
      </div>

      {/* ── Tab Navigation ── */}
      <CoreNav />

      {/* ── Tab Content ── */}
      <div style={{ flex: 1, minHeight: 0 }}>{tabContent[activeTab] || tabContent.overview}</div>
    </div>
  );
}
