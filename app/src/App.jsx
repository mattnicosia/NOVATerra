import { useEffect, useState, useRef, useCallback, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useParams, useLocation, useNavigate } from "react-router-dom";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { usePersistenceLoad, loadEstimate } from "@/hooks/usePersistence";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useTakeoffSync } from "@/hooks/useTakeoffSync";
import { useCloudSync } from "@/hooks/useCloudSync";
import { useEmbeddingSync } from "@/hooks/useEmbeddingSync";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useAutoSnapshot } from "@/hooks/useAutoSnapshot";
import useAutoResponseTimers from "@/hooks/useAutoResponseTimers";
import AutoResponseBanner from "@/components/shared/AutoResponseBanner";
import DraftApprovalPanel from "@/components/shared/DraftApprovalPanel";

import { useAuthStore } from "@/stores/authStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import NovaOrb from "@/components/dashboard/NovaOrb";
import { CAR_PALETTE_IDS, PALETTES } from "@/constants/palettes";
import NovaHeader from "@/components/layout/NovaHeader";
import Toast from "@/components/layout/Toast";
import PageTransition from "@/components/ambient/PageTransition";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { useCommandPaletteStore } from "@/stores/commandPaletteStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import LoginPage from "@/pages/LoginPage";

// Lazy-load heavy components not needed until after auth + first paint
const AIChatPanel = lazy(() => import("@/components/ai/AIChatPanel"));
const AmbientBackground = lazy(() => import("@/components/nova/AmbientBackground"));
const AmbientParticles = lazy(() => import("@/components/ambient/AmbientParticles"));
const LiquidGlassBackground = lazy(() => import("@/components/ambient/LiquidGlassBackground"));
const NovaCursor = lazy(() => import("@/components/nova/NovaCursor"));
const CommandPalette = lazy(() => import("@/components/shared/CommandPalette"));
const OnboardingSequence = lazy(() => import("@/components/nova/OnboardingSequence"));
const NovaSignInSplash = lazy(() => import("@/components/nova/NovaSignInSplash"));
const GuidedTour = lazy(() => import("@/components/nova/GuidedTour"));
const ProgressiveSetup = lazy(() => import("@/components/nova/ProgressiveSetup"));

// ── Lazy-loaded pages — each becomes its own chunk, loaded on navigation ──
const DashboardPage = lazy(() => import("@/pages/NovaDashboardPage"));
const ProjectInfoPage = lazy(() => import("@/pages/ProjectInfoPage"));
const PlanRoomPage = lazy(() => import("@/pages/PlanRoomPage"));
const TakeoffsPage = lazy(() => import("@/pages/TakeoffsPage"));
const EstimatePage = lazy(() => import("@/pages/EstimatePage"));
const AlternatesPage = lazy(() => import("@/pages/AlternatesPage"));
const ScheduleOfValuesPage = lazy(() => import("@/pages/ScheduleOfValuesPage"));
// CostDatabasePage now embedded inside CorePage — lazy import removed
const AssembliesPage = lazy(() => import("@/pages/AssembliesPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const ContactsPage = lazy(() => import("@/pages/ContactsPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const InboxPage = lazy(() => import("@/pages/InboxPage"));
const DocumentsPage = lazy(() => import("@/pages/DocumentsPage"));
const IntelligencePage = lazy(() => import("@/pages/IntelligencePage"));
const InsightsPage = lazy(() => import("@/pages/InsightsPage"));
const ProjectsPage = lazy(() => import("@/pages/ProjectsPage"));
const CorePage = lazy(() => import("@/pages/CorePage"));
const BidPackagesPage = lazy(() => import("@/pages/BidPackagesPage"));
const PortalPage = lazy(() => import("@/pages/PortalPage"));
const SubDashboardPage = lazy(() => import("@/pages/SubDashboardPage"));

// Admin pages (lazy-loaded, only accessed by admin users)
const AdminLayout = lazy(() => import("@/pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminUsersPage = lazy(() => import("@/pages/admin/AdminUsersPage"));
const AdminUserDetail = lazy(() => import("@/pages/admin/AdminUserDetail"));
const AdminEstimatesPage = lazy(() => import("@/pages/admin/AdminEstimatesPage"));
const AdminEstimateDetail = lazy(() => import("@/pages/admin/AdminEstimateDetail"));
const AdminEmbeddingsPage = lazy(() => import("@/pages/admin/AdminEmbeddingsPage"));

// Admin guard — checks if the current user's email is in the admin whitelist
function AdminGuard({ children }) {
  const user = useAuthStore(s => s.user);
  const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = user?.email && adminEmails.includes(user.email.toLowerCase());
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

// Auto-load estimate from URL if not already loaded (handles page refresh on estimate routes)
function EstimateLoader({ children }) {
  const { id } = useParams();
  const activeId = useEstimatesStore(s => s.activeEstimateId);
  const persistenceLoaded = useUiStore(s => s.persistenceLoaded);
  const [loading, setLoading] = useState(false);

  // Auto-snapshot: track estimate changes over time
  useAutoSnapshot(activeId);

  useEffect(() => {
    if (!persistenceLoaded || !id || activeId === id) return;
    setLoading(true);
    loadEstimate(id).finally(() => setLoading(false));
  }, [id, activeId, persistenceLoaded]);

  if (loading || !persistenceLoaded || (!activeId && id)) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          color: "#8E8E93",
        }}
      >
        Loading estimate...
      </div>
    );
  }
  return children;
}

const PROJECT_TABS = [
  { key: "info", path: "info", icon: I.settings, label: "Project Info" },
  { key: "plans", path: "plans", icon: I.plans, label: "Discovery" },
  { key: "takeoffs", path: "takeoffs", icon: I.takeoff, label: "Takeoffs" },
  { key: "alternates", path: "alternates", icon: I.change, label: "Alternates" },
  { key: "sov", path: "sov", icon: I.dollar, label: "SOV" },
  { key: "bids", path: "bids", icon: I.bid, label: "Bids" },
  { key: "reports", path: "reports", icon: I.report, label: "Reports" },
  { key: "insights", path: "insights", icon: I.insights, label: "Insights" },
];

/* ── Takeoffs header controls: mode button + NOVA orb ── */
function TakeoffsHeaderControls({ C }) {
  const tkPanelOpen = useTakeoffsStore(s => s.tkPanelOpen);
  const setTkPanelOpen = useTakeoffsStore(s => s.setTkPanelOpen);
  const tkPanelTier = useTakeoffsStore(s => s.tkPanelTier);
  const setTkPanelTier = useTakeoffsStore(s => s.setTkPanelTier);
  const setTkPanelWidth = useTakeoffsStore(s => s.setTkPanelWidth);
  const tkNovaPanelOpen = useTakeoffsStore(s => s.tkNovaPanelOpen);
  const setTkNovaPanelOpen = useTakeoffsStore(s => s.setTkNovaPanelOpen);
  const tkPredictions = useTakeoffsStore(s => s.tkPredictions);
  const tkPredAccepted = useTakeoffsStore(s => s.tkPredAccepted);
  const tkPredRejected = useTakeoffsStore(s => s.tkPredRejected);
  const takeoffs = useTakeoffsStore(s => s.takeoffs);
  const drawings = useDrawingsStore(s => s.drawings);
  const hasDrawings = drawings.length > 0;

  const modes = [
    { id: "closed", w: 0, bars: 0, label: "Closed" },
    { id: "standard", w: 550, bars: 2, label: "Takeoffs" },
    { id: "full", w: 900, bars: 3, label: "Split" },
    { id: "estimate", w: 0, bars: 4, label: "Estimate" },
  ];
  let curId;
  if (tkPanelTier === "estimate") curId = "estimate";
  else if (!tkPanelOpen) curId = "closed";
  else if (tkPanelTier === "full") curId = "full";
  else curId = "standard";
  const idx = modes.findIndex(m => m.id === curId);
  const current = modes[idx >= 0 ? idx : 0];
  const next = modes[(idx + 1) % modes.length];

  const pendingPredictions =
    tkPredictions?.predictions?.filter(p => !tkPredAccepted.includes(p.id) && !tkPredRejected.includes(p.id)).length ||
    0;

  const cycleMode = () => {
    if (next.id === "closed") {
      setTkPanelOpen(false);
      setTkPanelTier("standard");
      sessionStorage.setItem("bldg-tkPanelTier", "standard");
      sessionStorage.setItem("bldg-tkPanelWidth", "550");
    } else if (next.id === "estimate") {
      setTkPanelOpen(false);
      setTkPanelTier("estimate");
      sessionStorage.setItem("bldg-tkPanelTier", "estimate");
      sessionStorage.setItem("bldg-tkPanelWidth", "0");
    } else {
      setTkPanelOpen(true);
      setTkPanelWidth(next.w);
      setTkPanelTier(next.id);
      sessionStorage.setItem("bldg-tkPanelTier", next.id);
      sessionStorage.setItem("bldg-tkPanelWidth", String(next.w));
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        paddingRight: 8,
        marginRight: 4,
        borderRight: `1px solid ${C.border}`,
      }}
    >
      {/* Mode cycling button */}
      <button
        title={`${current.label} → ${next.label}`}
        onClick={cycleMode}
        style={{
          width: 28,
          height: 26,
          border: `1px solid ${current.bars > 0 ? C.accent + "50" : C.border}`,
          background: current.bars > 0 ? C.accent + "14" : "transparent",
          borderRadius: 5,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 1.5,
          padding: 0,
          position: "relative",
          transition: "all 0.15s",
        }}
      >
        {current.bars === 0 ? (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke={C.textMuted}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="18" rx="1" />
            <path d="M14 3h7M14 9h7M14 15h5" />
          </svg>
        ) : (
          Array.from({ length: current.bars }).map((_, i) => (
            <div key={i} style={{ width: 3, height: 10, borderRadius: 1, background: C.accent }} />
          ))
        )}
        {takeoffs.length > 0 && curId === "closed" && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 14,
              height: 14,
              borderRadius: 7,
              background: C.accent,
              color: "#fff",
              fontSize: 8,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
              lineHeight: 1,
            }}
          >
            {takeoffs.length}
          </span>
        )}
      </button>
      {/* NOVA orb */}
      {hasDrawings && tkPanelTier !== "estimate" && (
        <div style={{ position: "relative", flexShrink: 0 }}>
          <NovaOrb size={24} onClick={() => setTkNovaPanelOpen(v => !v)} />
          {pendingPredictions > 0 && !tkNovaPanelOpen && (
            <span
              style={{
                position: "absolute",
                top: -2,
                right: -4,
                background: C.accent,
                color: "#fff",
                fontSize: 7,
                fontWeight: 800,
                padding: "1px 4px",
                borderRadius: 6,
                minWidth: 14,
                textAlign: "center",
                pointerEvents: "none",
              }}
            >
              {pendingPredictions}
            </span>
          )}
        </div>
      )}
      {/* Mode label */}
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: C.textDim,
          letterSpacing: 0.3,
          whiteSpace: "nowrap",
        }}
      >
        {current.label}
      </span>
    </div>
  );
}

function ProjectTabBar() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const location = useLocation();
  const navigate = useNavigate();
  const activeId = useEstimatesStore(s => s.activeEstimateId);
  const setupComplete = useProjectStore(s => s.project.setupComplete);
  const project = useProjectStore(s => s.project);
  const getCompanyInfo = useMasterDataStore(s => s.getCompanyInfo);
  const companyInfo = getCompanyInfo(project.companyProfileId);
  const companyInitial = (companyInfo?.name || "?")[0].toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const close = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  // Only show on /estimate/:id/* routes
  if (!activeId || !location.pathname.startsWith("/estimate/")) return null;

  // Hide tab bar during document-first onboarding
  if (setupComplete === false) return null;

  // Determine active tab
  const activeTab = PROJECT_TABS.find(t => location.pathname.includes(`/${t.path}`)) || PROJECT_TABS[0];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: `0 ${T.space[6]}px`,
        height: 40,
        minHeight: 40,
        background: C.bg,
        borderBottom: `1px solid ${C.border}`,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Project indicator — company logo + project name */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingRight: 12,
          marginRight: 8,
          borderRight: `1px solid ${C.border}`,
          flexShrink: 0,
        }}
      >
        {companyInfo?.logo ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              borderRadius: 6,
              flexShrink: 0,
              background: dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.03)",
              border: dk ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(0,0,0,0.04)",
              overflow: "hidden",
            }}
          >
            <img
              src={companyInfo.logo}
              alt=""
              style={{
                maxHeight: 20,
                maxWidth: 20,
                objectFit: "contain",
              }}
            />
          </div>
        ) : (
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              background: `${C.accent}18`,
              border: `1px solid ${C.accent}30`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: C.accent,
              flexShrink: 0,
            }}
          >
            {companyInitial}
          </div>
        )}
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.text,
            maxWidth: 160,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {project.name || "Untitled"}
        </span>
      </div>

      {/* Collapsible menu button */}
      <div ref={menuRef} style={{ position: "relative" }}>
        <button
          onClick={() => setMenuOpen(v => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            borderRadius: T.radius.sm,
            fontSize: T.fontSize.sm,
            fontWeight: T.fontWeight.bold,
            color: C.accent,
            background: menuOpen ? C.accentBg : "transparent",
            border: `1px solid ${menuOpen ? C.accent + "30" : "transparent"}`,
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: T.transition.fast,
            fontFamily: "'DM Sans', sans-serif",
          }}
          onMouseEnter={e => {
            if (!menuOpen) e.currentTarget.style.background = C.bg2;
          }}
          onMouseLeave={e => {
            if (!menuOpen) e.currentTarget.style.background = "transparent";
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke={C.accent}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
          <Ic d={activeTab.icon} size={13} />
          {activeTab.label}
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke={C.textMuted}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginLeft: -2 }}
          >
            <polyline points={menuOpen ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
          </svg>
        </button>

        {/* Dropdown */}
        {menuOpen && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              minWidth: 180,
              background: C.bg1,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
              zIndex: 500,
              padding: "4px 0",
              animation: "fadeIn 0.12s ease-out",
            }}
          >
            {PROJECT_TABS.map(tab => {
              const isActive = tab.key === activeTab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    navigate(`/estimate/${activeId}/${tab.path}`);
                    setMenuOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "8px 14px",
                    border: "none",
                    background: isActive ? C.accentBg : "transparent",
                    color: isActive ? C.accent : C.text,
                    fontSize: 12,
                    fontWeight: isActive ? 700 : 500,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.1s",
                    borderLeft: isActive ? `3px solid ${C.accent}` : "3px solid transparent",
                  }}
                  onMouseEnter={e => {
                    if (!isActive) e.currentTarget.style.background = C.bg2;
                  }}
                  onMouseLeave={e => {
                    if (!isActive) e.currentTarget.style.background = isActive ? C.accentBg : "transparent";
                  }}
                >
                  <Ic d={tab.icon} size={14} color={isActive ? C.accent : C.textMuted} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Takeoffs controls — mode button + NOVA (after menu, only on takeoffs page) */}
      {activeTab.key === "takeoffs" && <TakeoffsHeaderControls C={C} />}

      <div style={{ flex: 1 }} />
    </div>
  );
}

/* ── Floating theme picker — fixed bottom-right, always visible ── */
function FloatingThemePicker() {
  const C = useTheme();
  const selectedPalette = useUiStore(s => s.appSettings.selectedPalette);
  const updateSetting = useUiStore(s => s.updateSetting);
  const [expanded, setExpanded] = useState(false);

  const ALL_IDS = ["nova", "grey", "clarity", "matte", "nero", ...CAR_PALETTE_IDS];
  const currentIdx = ALL_IDS.indexOf(selectedPalette);
  const currentPalette = PALETTES.find(p => p.id === selectedPalette);
  const currentName = currentPalette?.name || "Default";
  const preview = currentPalette?.preview || [C.accent, C.textMuted, C.bg2];
  const accentHex = C.accent || "#6366f1";

  const cycle = (dir = 1) => {
    const nextIdx = currentIdx === -1 ? 0 : (currentIdx + dir + ALL_IDS.length) % ALL_IDS.length;
    updateSetting("selectedPalette", ALL_IDS[nextIdx]);
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Expanded palette grid */}
      {expanded && (
        <div
          style={{
            background: C.bg1,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 12,
            boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 6,
            maxWidth: 280,
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          {ALL_IDS.map(id => {
            const p = PALETTES.find(pp => pp.id === id);
            if (!p) return null;
            const isActive = id === selectedPalette;
            return (
              <button
                key={id}
                onClick={() => {
                  updateSetting("selectedPalette", id);
                }}
                title={p.name}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  padding: "8px 4px",
                  border: isActive ? `2px solid ${accentHex}` : `1px solid ${C.border}`,
                  borderRadius: 8,
                  background: isActive ? accentHex + "18" : "transparent",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {/* Color swatches row */}
                <div style={{ display: "flex", gap: 2 }}>
                  {(p.preview || []).slice(0, 4).map((c, i) => (
                    <div
                      key={i}
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        background: c,
                        border: "1px solid rgba(128,128,128,0.2)",
                      }}
                    />
                  ))}
                </div>
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? C.text : C.textMuted,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 72,
                  }}
                >
                  {p.name}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main floating pill */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          background: C.bg1,
          border: `1px solid ${accentHex}40`,
          borderRadius: 20,
          boxShadow: `0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px ${accentHex}20`,
          overflow: "hidden",
          height: 38,
        }}
      >
        {/* Prev arrow */}
        <button
          onClick={() => cycle(-1)}
          title="Previous theme"
          style={{
            width: 34,
            height: 38,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = C.bg2)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 10 10"
            fill="none"
            stroke={C.text}
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M6 1L2 5l4 4" />
          </svg>
        </button>

        {/* Center — click to expand grid */}
        <button
          onClick={() => setExpanded(v => !v)}
          title={expanded ? "Close palette picker" : "Open palette picker"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 12px",
            height: 38,
            border: "none",
            borderLeft: `1px solid ${C.border}`,
            borderRight: `1px solid ${C.border}`,
            background: "transparent",
            cursor: "pointer",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = C.bg2)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          {/* Color dots */}
          <div style={{ display: "flex", gap: 3 }}>
            {preview.slice(0, 3).map((color, i) => (
              <div
                key={i}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: color,
                  border: "1px solid rgba(128,128,128,0.25)",
                }}
              />
            ))}
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.text,
              whiteSpace: "nowrap",
            }}
          >
            {currentName}
          </span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={C.textMuted} strokeWidth="1.5">
            <path d={expanded ? "M2 6l3-3 3 3" : "M2 4l3 3 3-3"} />
          </svg>
        </button>

        {/* Next arrow */}
        <button
          onClick={() => cycle(1)}
          title="Next theme"
          style={{
            width: 34,
            height: 38,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = C.bg2)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 10 10"
            fill="none"
            stroke={C.text}
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 1l4 4-4 4" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ── Theme cycle button (header version — kept for reference) ── */
function ThemeCycleButton({ C }) {
  const selectedPalette = useUiStore(s => s.appSettings.selectedPalette);
  const updateSetting = useUiStore(s => s.updateSetting);
  const [hovered, setHovered] = useState(false);

  // All available palettes: originals + car collection
  const ALL_IDS = ["nova", "grey", "clarity", "matte", "nero", ...CAR_PALETTE_IDS];
  const currentIdx = ALL_IDS.indexOf(selectedPalette);

  // Find current palette metadata
  const currentPalette = PALETTES.find(p => p.id === selectedPalette);
  const currentName = currentPalette?.name || "Theme";
  const preview = currentPalette?.preview || [C.accent, C.text, C.bg2];

  const cycle = (dir = 1) => {
    const nextIdx = currentIdx === -1 ? 0 : (currentIdx + dir + ALL_IDS.length) % ALL_IDS.length;
    updateSetting("selectedPalette", ALL_IDS[nextIdx]);
  };

  const accentHex = C.accent || "#6366f1";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        flexShrink: 0,
        marginRight: 8,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Prev arrow */}
      <button
        onClick={e => {
          e.stopPropagation();
          cycle(-1);
        }}
        title="Previous theme"
        style={{
          width: 24,
          height: 28,
          border: "none",
          background: hovered ? C.bg2 : "transparent",
          borderRadius: "5px 0 0 5px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s",
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke={hovered ? C.text : C.textMuted}
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M6 1L2 5l4 4" />
        </svg>
      </button>

      {/* Preview swatches + name — main clickable area */}
      <button
        onClick={() => cycle(1)}
        title={`${currentName} — click to cycle themes`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 12px",
          border: `1px solid ${hovered ? accentHex + "60" : C.border}`,
          borderRadius: 0,
          cursor: "pointer",
          background: hovered ? accentHex + "14" : C.bg1,
          transition: "all 0.2s",
          height: 28,
        }}
      >
        {/* Palette icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke={accentHex}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <circle cx="10" cy="9" r="1.5" fill={preview[0] || accentHex} stroke="none" />
          <circle cx="15" cy="9" r="1.5" fill={preview[1] || accentHex} stroke="none" />
          <circle cx="8" cy="13" r="1.5" fill={preview[2] || accentHex} stroke="none" />
          <circle cx="14" cy="14" r="1.5" fill={preview[0] || accentHex} stroke="none" />
        </svg>

        {/* Color preview strip */}
        <div style={{ display: "flex", gap: 3 }}>
          {preview.slice(0, 4).map((color, i) => (
            <div
              key={i}
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: color,
                border: `1px solid rgba(128,128,128,0.25)`,
              }}
            />
          ))}
        </div>

        {/* Palette name */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: hovered ? C.text : C.textSub,
            whiteSpace: "nowrap",
            fontFamily: "'DM Sans', sans-serif",
            letterSpacing: 0.2,
          }}
        >
          {currentName}
        </span>

        {/* Count badge */}
        <span
          style={{
            fontSize: 8,
            fontWeight: 700,
            color: accentHex,
            background: accentHex + "18",
            padding: "1px 5px",
            borderRadius: 4,
            letterSpacing: 0.3,
          }}
        >
          {currentIdx + 1}/{ALL_IDS.length}
        </span>
      </button>

      {/* Next arrow */}
      <button
        onClick={e => {
          e.stopPropagation();
          cycle(1);
        }}
        title="Next theme"
        style={{
          width: 24,
          height: 28,
          border: "none",
          background: hovered ? C.bg2 : "transparent",
          borderRadius: "0 5px 5px 0",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s",
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke={hovered ? C.text : C.textMuted}
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 1l4 4-4 4" />
        </svg>
      </button>
    </div>
  );
}

function AppContent() {
  const C = useTheme();
  const location = useLocation();
  const isDashboard = location.pathname === "/";
  usePersistenceLoad();
  useAutoSave();
  useTakeoffSync();
  useCloudSync();
  useEmbeddingSync();
  useKeyboardShortcuts();
  useAutoResponseTimers();

  const [showDraftPanel, setShowDraftPanel] = useState(false);

  // Sync body background to theme (covers areas outside app-shell + prevents flash)
  // Also toggle theme-light/theme-dark class for CSS hover state overrides
  const density = useUiStore(s => s.appSettings?.density || "comfortable");
  useEffect(() => {
    document.documentElement.style.setProperty("--app-bg", C.bg);
    document.documentElement.style.setProperty("--app-text", C.text);
    document.documentElement.classList.toggle("theme-light", !C.isDark);
    document.documentElement.classList.toggle("theme-dark", C.isDark);
    document.documentElement.classList.toggle("density-compact", density === "compact");
  }, [C.bg, C.text, C.isDark, density]);

  return (
    <div
      className={`app-shell${C.neroMode ? " nero-nemesis" : ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        background: C.bgGradient || C.bg,
        position: "relative",
      }}
    >
      {/* Liquid Glass mesh background — vivid animated color field for BOTH modes */}
      <Suspense fallback={null}>
        <LiquidGlassBackground />
      </Suspense>
      {/* SVG refraction filter — subtle distortion simulating glass lensing */}
      <svg style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }} aria-hidden="true">
        <defs>
          <filter id="glass-refract" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.015 0.012" numOctaves="3" seed="42" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id="glass-refract-lg" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.006" numOctaves="3" seed="17" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      <div
        className="app-main"
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          flex: 1,
          overflow: "hidden",
        }}
      >
        <NovaHeader onDraftPanelToggle={() => setShowDraftPanel(v => !v)} />
        <AutoResponseBanner onReviewClick={() => setShowDraftPanel(true)} />
        <DraftApprovalPanel open={showDraftPanel} onClose={() => setShowDraftPanel(false)} />
        <ProjectTabBar />
        <FloatingThemePicker />
        <div
          className="app-viewport"
          style={{ flex: 1, position: "relative", overflow: isDashboard ? "hidden" : "auto", scrollBehavior: "smooth" }}
        >
          <PageTransition>
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/database" element={<Navigate to="/core?tab=database" replace />} />
                <Route path="/assemblies" element={<AssembliesPage />} />
                <Route path="/contacts" element={<ContactsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/inbox" element={<InboxPage />} />
                <Route path="/intelligence" element={<IntelligencePage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/core" element={<CorePage />} />
                <Route
                  path="/estimate/:id/info"
                  element={
                    <EstimateLoader>
                      <ProjectInfoPage />
                    </EstimateLoader>
                  }
                />
                <Route
                  path="/estimate/:id/documents"
                  element={
                    <EstimateLoader>
                      <PlanRoomPage />
                    </EstimateLoader>
                  }
                />
                <Route
                  path="/estimate/:id/plans"
                  element={
                    <EstimateLoader>
                      <PlanRoomPage />
                    </EstimateLoader>
                  }
                />
                <Route
                  path="/estimate/:id/takeoffs"
                  element={
                    <EstimateLoader>
                      <TakeoffsPage />
                    </EstimateLoader>
                  }
                />
                {/* Redirect old /estimate route to /takeoffs (estimate panel is now embedded in takeoffs full-tier) */}
                <Route path="/estimate/:id/estimate" element={<Navigate to="../takeoffs" replace />} />
                <Route
                  path="/estimate/:id/alternates"
                  element={
                    <EstimateLoader>
                      <AlternatesPage />
                    </EstimateLoader>
                  }
                />
                <Route
                  path="/estimate/:id/sov"
                  element={
                    <EstimateLoader>
                      <ScheduleOfValuesPage />
                    </EstimateLoader>
                  }
                />
                <Route
                  path="/estimate/:id/reports"
                  element={
                    <EstimateLoader>
                      <ReportsPage />
                    </EstimateLoader>
                  }
                />
                <Route
                  path="/estimate/:id/bids"
                  element={
                    <EstimateLoader>
                      <BidPackagesPage />
                    </EstimateLoader>
                  }
                />
                <Route
                  path="/estimate/:id/insights"
                  element={
                    <EstimateLoader>
                      <InsightsPage />
                    </EstimateLoader>
                  }
                />
                {/* Admin portal — protected by email whitelist */}
                <Route
                  path="/admin"
                  element={
                    <AdminGuard>
                      <AdminLayout />
                    </AdminGuard>
                  }
                >
                  <Route index element={<AdminDashboard />} />
                  <Route path="users" element={<AdminUsersPage />} />
                  <Route path="users/:userId" element={<AdminUserDetail />} />
                  <Route path="estimates" element={<AdminEstimatesPage />} />
                  <Route path="estimates/:userId/:estimateId" element={<AdminEstimateDetail />} />
                  <Route path="embeddings" element={<AdminEmbeddingsPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </PageTransition>
        </div>
      </div>
      <Toast />
      <Suspense fallback={null}>
        <AIChatPanel />
      </Suspense>
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
      <Suspense fallback={null}>
        <NovaCursor />
      </Suspense>
    </div>
  );
}

// Loading spinner while checking auth session
function AuthLoading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0D0F14",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "linear-gradient(135deg, #7C5CFC, #BF5AF2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
            animation: "pulse 1.5s infinite ease-in-out",
          }}
        >
          <svg
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 20h20" />
            <path d="M5 20V8l7-5 7 5v12" />
            <path d="M9 20v-6h6v6" />
          </svg>
        </div>
        <p style={{ fontSize: 14, color: "#8E8E93", fontWeight: 500 }}>Loading...</p>
      </div>
    </div>
  );
}

// Helper: reveal AppContent underneath an intro overlay
function revealApp() {
  const el = document.getElementById("app-reveal");
  if (el) {
    el.style.opacity = "1";
    el.style.pointerEvents = "auto";
  }
}

export default function App() {
  const user = useAuthStore(s => s.user);
  const loading = useAuthStore(s => s.loading);
  const init = useAuthStore(s => s.init);

  // Onboarding: first sign-in only (persisted in localStorage)
  const [onboardingComplete, setOnboardingComplete] = useState(
    () => localStorage.getItem("nova_onboarding_complete") === "true",
  );
  // Guided tour: first sign-in, runs after onboarding departure
  const [tourComplete, setTourComplete] = useState(() => localStorage.getItem("nova_tour_complete") === "true");
  // Progressive setup: first sign-in, runs after guided tour
  const [setupComplete, setSetupComplete] = useState(() => localStorage.getItem("nova_setup_complete") === "true");
  // Splash: every browser session (persisted in sessionStorage)
  const [splashComplete, setSplashComplete] = useState(() => sessionStorage.getItem("nova_splash_shown") === "true");

  // Initialize auth on mount
  useEffect(() => {
    init();
  }, [init]);

  // Reset NOVA intro — reusable for keyboard shortcut + preview button
  const resetIntro = useCallback(() => {
    localStorage.removeItem("nova_onboarding_complete");
    localStorage.removeItem("nova_tour_complete");
    localStorage.removeItem("nova_setup_complete");
    localStorage.removeItem("nova_company");
    localStorage.removeItem("nova_location");
    localStorage.removeItem("nova_project_size");
    localStorage.removeItem("nova_user_name");
    localStorage.removeItem("nova_user_role");
    sessionStorage.removeItem("nova_splash_shown");
    setOnboardingComplete(false);
    setTourComplete(false);
    setSetupComplete(false);
    setSplashComplete(false);
  }, []);

  // Keyboard shortcut: Alt+Shift+N → replay NOVA onboarding
  useEffect(() => {
    const handler = e => {
      if (e.altKey && e.shiftKey && e.code === "KeyN") {
        e.preventDefault();
        resetIntro();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [resetIntro]);

  // Show loading spinner while checking session
  if (loading) return <AuthLoading />;

  // Public portal — bypasses auth gate entirely (subs don't need accounts)
  if (window.location.pathname.startsWith("/portal/")) {
    return (
      <Suspense fallback={<AuthLoading />}>
        <PortalPage />
      </Suspense>
    );
  }

  // Sub dashboard — public, magic-link auth
  if (window.location.pathname.startsWith("/sub-dashboard")) {
    return (
      <Suspense fallback={<AuthLoading />}>
        <SubDashboardPage />
      </Suspense>
    );
  }

  // Not logged in → show login page
  if (!user)
    return (
      <ThemeProvider>
        <LoginPage />
      </ThemeProvider>
    );

  /* ── Onboarding gates temporarily disabled — users go straight to dashboard ──
  // Gate 1: First-time cinematic onboarding
  if (!onboardingComplete) { ... }
  // Gate 2: Guided workspace tour
  if (!tourComplete) { ... }
  // Gate 3: Progressive setup
  if (!setupComplete) { ... }
  // Gate 4: Returning user splash
  if (!splashComplete) { ... }
  ── end disabled gates ── */

  // Normal app — straight to dashboard
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </ThemeProvider>
  );
}
// test
