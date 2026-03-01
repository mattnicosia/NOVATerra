import { Component, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useCoreStore } from '@/stores/coreStore';
import { useUiStore } from '@/stores/uiStore';
import CompanySwitcher from '@/components/shared/CompanySwitcher';
import CoreNav from '@/components/core/CoreNav';
import CoreOverview from '@/components/core/CoreOverview';
import CoreProposals from '@/components/core/CoreProposals';
import CostDatabasePage from '@/pages/CostDatabasePage';
import CoreSources from '@/components/core/CoreSources';
import NovaOrb from '@/components/dashboard/NovaOrb';

// Lightweight per-tab error catcher — prevents one tab crash from killing the page
class TabErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(err, info) { console.error('[CoreTab]', err, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        padding: 40, textAlign: "center",
        background: "rgba(248,113,113,0.04)", borderRadius: 12,
        border: "1px solid rgba(248,113,113,0.12)",
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#F87171", marginBottom: 8 }}>
          This tab encountered an error
        </div>
        <div style={{ fontSize: 11, color: "#999", marginBottom: 16, fontFamily: "'DM Mono', monospace" }}>
          {this.state.error?.message || "Unknown error"}
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          style={{
            padding: "6px 16px", borderRadius: 6, border: "1px solid rgba(248,113,113,0.3)",
            background: "rgba(248,113,113,0.08)", color: "#F87171",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
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
  const T = C.T;
  const activeTab = useCoreStore(s => s.activeTab);
  const setActiveTab = useCoreStore(s => s.setActiveTab);
  const [searchParams] = useSearchParams();

  // Sync ?tab= URL param → coreStore
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && tab !== activeTab) setActiveTab(tab);
  }, [searchParams]);

  const tabContent = {
    overview: <TabErrorBoundary key="overview"><CoreOverview /></TabErrorBoundary>,
    proposals: <TabErrorBoundary key="proposals"><CoreProposals /></TabErrorBoundary>,
    database: <TabErrorBoundary key="database"><CostDatabasePage embedded /></TabErrorBoundary>,
    sources: <TabErrorBoundary key="sources"><CoreSources /></TabErrorBoundary>,
  };

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      padding: "28px 36px 36px", gap: 20,
      overflowY: "auto", minHeight: 0,
    }}>
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: "50%", overflow: "hidden",
            boxShadow: "0 0 20px rgba(139,92,246,0.25), 0 0 40px rgba(109,40,217,0.12)",
            flexShrink: 0,
          }}>
            <NovaOrb size={42} scheme="nova" />
          </div>
          <div>
            <h1 style={{
              fontSize: 22, fontWeight: 700, color: C.text,
              margin: 0, letterSpacing: "-0.02em",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              NOVA Core
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                padding: "2px 8px", borderRadius: 10,
                background: `linear-gradient(135deg, rgba(139,92,246,0.15), rgba(109,40,217,0.1))`,
                color: "#8B5CF6", textTransform: "uppercase",
              }}>
                Intelligence Engine
              </span>
            </h1>
            <p style={{
              fontSize: 12, color: C.textMuted, margin: "2px 0 0",
              lineHeight: 1.4,
            }}>
              Your data feeds NOVA's intelligence. Upload proposals, track costs, and grow smarter with every project.
            </p>
          </div>
        </div>

        <CompanySwitcher />
      </div>

      {/* ── Tab Navigation ── */}
      <CoreNav />

      {/* ── Tab Content ── */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {tabContent[activeTab] || tabContent.overview}
      </div>
    </div>
  );
}
