import { useEffect, useState, useRef, useCallback, lazy, Suspense, Fragment } from "react";
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
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useAutoDiscovery } from "@/hooks/useAutoDiscovery";
import AutoResponseBanner from "@/components/shared/AutoResponseBanner";
const DraftApprovalPanel = lazy(() => import("@/components/shared/DraftApprovalPanel"));

import { useAuthStore } from "@/stores/authStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useOrgStore } from "@/stores/orgStore";
import { useCollaborationStore } from "@/stores/collaborationStore";
import ReadOnlyBanner from "@/components/shared/ReadOnlyBanner";
import NovaOrb from "@/components/dashboard/NovaOrb";
import { CAR_PALETTE_IDS, LIGHT_PALETTE_IDS, ARTIFACT_PALETTE_IDS, PALETTES } from "@/constants/palettes";
import { NOISE_GRAIN } from "@/constants/textures";
import NovaHeader from "@/components/layout/NovaHeader";
import { useJourneyProgress } from "@/hooks/useJourneyProgress";
import Toast from "@/components/layout/Toast";
import PageTransition from "@/components/ambient/PageTransition";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import PageErrorBoundary from "@/components/shared/PageErrorBoundary";
import { useCommandPaletteStore } from "@/stores/commandPaletteStore";
// Lazy-load heavy components not needed until after auth + first paint
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const LoginMockupPage = lazy(() => import("@/pages/LoginMockupPage"));
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
const BusinessDashboardPage = lazy(() => import("@/pages/BusinessDashboardPage"));
const PortalPage = lazy(() => import("@/pages/PortalPage"));
const SubDashboardPage = lazy(() => import("@/pages/SubDashboardPage"));
const ResourcePage = lazy(() => import("@/pages/ResourcePage"));

// BLDG Talent + ROM pages (lazy-loaded, role-gated — existing users never download these)
const RomPage = lazy(() => import("@/pages/RomPage"));
const BTRegisterPage = lazy(() => import("@/pages/talent/BTRegisterPage"));
const BTLoginPage = lazy(() => import("@/pages/talent/BTLoginPage"));
const CandidateLayout = lazy(() => import("@/components/talent/layout/CandidateLayout"));
const BTAdminLayout = lazy(() => import("@/components/talent/layout/BTAdminLayout"));

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
  const [loadFailed, setLoadFailed] = useState(false);
  const navigate = useNavigate();
  const orgId = useOrgStore(s => s.org?.id);
  const isLockHolder = useCollaborationStore(s => s.isLockHolder);
  const currentLock = useCollaborationStore(s => s.currentLock);
  const isReadOnly = !!orgId && !isLockHolder && !!currentLock;

  // Auto-snapshot: track estimate changes over time
  useAutoSnapshot(activeId);

  useEffect(() => {
    if (!persistenceLoaded || !id || activeId === id) return;
    setLoading(true);
    setLoadFailed(false);
    loadEstimate(id).then(ok => {
      setLoading(false);
      if (!ok) {
        console.warn(`[EstimateLoader] Estimate ${id} not found — redirecting to dashboard`);
        useUiStore.getState().showToast("Estimate not found — returning to dashboard", "error");
        setLoadFailed(true);
      }
    });
  }, [id, activeId, persistenceLoaded]);

  // Safety timeout: if stuck loading for >15s, bail to dashboard
  useEffect(() => {
    if (!loading && persistenceLoaded) return;
    const timer = setTimeout(() => {
      const stillStuck = !useEstimatesStore.getState().activeEstimateId && id;
      if (stillStuck) {
        console.warn(`[EstimateLoader] Timed out loading estimate ${id}`);
        useUiStore.getState().showToast("Estimate load timed out — returning to dashboard", "error");
        setLoadFailed(true);
        setLoading(false);
      }
    }, 15000);
    return () => clearTimeout(timer);
  }, [loading, persistenceLoaded, id]);

  // Collaboration: acquire lock + join presence when estimate loads
  useEffect(() => {
    if (!orgId || !activeId) return;
    const collab = useCollaborationStore.getState();
    collab.acquireLock(activeId);
    collab.joinEstimate(activeId);
    collab.subscribeLockChanges(activeId);
    collab.subscribePresence(activeId);

    return () => {
      collab.cleanup();
    };
  }, [orgId, activeId]);

  // Load failed — estimate data not in IDB or cloud; redirect to dashboard
  if (loadFailed) {
    return <Navigate to="/" replace />;
  }

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

  // In org mode with someone else holding the lock → read-only overlay
  if (isReadOnly) {
    return (
      <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
        <ReadOnlyBanner />
        <div style={{ flex: 1, pointerEvents: "none", opacity: 0.85 }}>{children}</div>
      </div>
    );
  }

  return children;
}

const PROJECT_TABS = [
  { key: "info", path: "info", label: "Info", stageKey: "define" },
  { key: "plans", path: "plans", label: "Discovery", stageKey: "discover" },
  { key: "takeoffs", path: "takeoffs", label: "Estimate", stageKey: "estimate" },
  { key: "bids", path: "bids", label: "Bids", stageKey: "bid" },
  { key: "reports", path: "reports", label: "Reports", stageKey: "propose" },
  { key: "insights", path: "insights", label: "Insights", stageKey: null },
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
    { id: "standard", w: 550, bars: 2, label: "Estimate" },
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

// ─── Keyframes for pill completion animation ────────────────────────────────
const PILL_KEYFRAMES = `
@keyframes pillPulse {
  0%    { transform: scale(1); }
  40%   { transform: scale(1.06); }
  70%   { transform: scale(1.02); }
  100%  { transform: scale(1); }
}
`;

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
  const { stages, justCompleted } = useJourneyProgress();

  const [animatingKeys, setAnimatingKeys] = useState({});
  const [hoveredKey, setHoveredKey] = useState(null);

  // ── Completion animation lifecycle ──
  useEffect(() => {
    const keys = Object.keys(justCompleted);
    if (keys.length === 0) return;
    setAnimatingKeys(prev => {
      const next = { ...prev };
      keys.forEach(k => {
        next[k] = true;
      });
      return next;
    });
    const timer = setTimeout(() => {
      setAnimatingKeys(prev => {
        const next = { ...prev };
        keys.forEach(k => {
          delete next[k];
        });
        return next;
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [justCompleted]);

  // Only show on /estimate/:id/* routes
  if (!activeId || !location.pathname.startsWith("/estimate/")) return null;

  // Hide tab bar during document-first onboarding
  if (setupComplete === false) return null;

  // Determine active tab
  const activeTab = PROJECT_TABS.find(t => location.pathname.includes(`/${t.path}`)) || PROJECT_TABS[0];

  // Build stage completion lookup
  const stageMap = {};
  stages.forEach(s => {
    stageMap[s.key] = s.complete;
  });

  return (
    <>
      <style>{PILL_KEYFRAMES}</style>
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
          fontFamily: T.font.sans,
        }}
      >
        {/* Project indicator — company logo + project name */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingRight: 12,
            marginRight: 4,
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

        {/* ── Journey pill tabs with workflow arrows ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          {PROJECT_TABS.map((tab, i) => {
            const isActive = tab.key === activeTab.key;
            const isComplete = !isActive && tab.stageKey && !!stageMap[tab.stageKey];
            const isAnimating = tab.stageKey && !!animatingKeys[tab.stageKey];
            const isHovered = hoveredKey === tab.key && !isActive;

            // Arrow between pills — the left pill's completion state determines arrow brightness
            const prevTab = i > 0 ? PROJECT_TABS[i - 1] : null;
            const prevComplete = prevTab?.stageKey && !!stageMap[prevTab.stageKey];
            const prevIsActive = prevTab?.key === activeTab.key;
            const arrowTraveled = prevComplete || prevIsActive;

            // ── Pill style by state ──
            const basePill = {
              height: 26,
              borderRadius: 13,
              padding: "0 14px",
              fontSize: 11,
              fontWeight: isActive ? 600 : 500,
              cursor: "pointer",
              border: "none",
              outline: "none",
              whiteSpace: "nowrap",
              fontFamily: T.font.sans,
              transition: "all 200ms ease",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            };

            let pillStyle;

            if (isActive) {
              pillStyle = {
                ...basePill,
                background: C.accent,
                color: "#fff",
                boxShadow: `0 0 0 1px ${C.accent}15, 0 0 8px ${C.accent}25`,
              };
            } else if (isComplete) {
              pillStyle = {
                ...basePill,
                background: isHovered ? `${C.green}20` : `${C.green}12`,
                color: C.text,
                border: `1px solid ${C.green}30`,
                animation: isAnimating ? "pillPulse 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275)" : undefined,
              };
            } else {
              pillStyle = {
                ...basePill,
                background: isHovered ? C.bg2 : "transparent",
                color: isHovered ? C.textMuted : C.textDim,
                border: `1px solid ${isHovered ? `${C.text}18` : `${C.border}`}`,
              };
            }

            return (
              <Fragment key={tab.key}>
                {/* Workflow arrow */}
                {i > 0 && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    style={{
                      flexShrink: 0,
                      margin: "0 2px",
                      transition: "opacity 200ms ease",
                    }}
                  >
                    <path
                      d="M6 3.5L10.5 8L6 12.5"
                      stroke={arrowTraveled ? C.accent : C.textDim}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={arrowTraveled ? 0.5 : 0.3}
                    />
                  </svg>
                )}
                <button
                  onClick={() => navigate(`/estimate/${activeId}/${tab.path}`)}
                  onMouseEnter={() => setHoveredKey(tab.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  style={pillStyle}
                >
                  {tab.label}
                </button>
              </Fragment>
            );
          })}
        </div>

        {/* Takeoffs controls — mode button + NOVA (only on takeoffs page) */}
        {activeTab.key === "takeoffs" && <TakeoffsHeaderControls C={C} />}

        <div style={{ flex: 1 }} />
      </div>
    </>
  );
}

/* ── Floating theme picker — fixed bottom-right, always visible ── */
function FloatingThemePicker() {
  const C = useTheme();
  const T = C.T;
  const selectedPalette = useUiStore(s => s.appSettings.selectedPalette);
  const updateSetting = useUiStore(s => s.updateSetting);
  const [expanded, setExpanded] = useState(false);

  const ALL_IDS = [
    "nova",
    "clarity",
    "clean-light",
    "nero",
    ...CAR_PALETTE_IDS,
    ...LIGHT_PALETTE_IDS,
    ...ARTIFACT_PALETTE_IDS,
  ];
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
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        fontFamily: T.font.sans,
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
  const T = C.T;
  const selectedPalette = useUiStore(s => s.appSettings.selectedPalette);
  const updateSetting = useUiStore(s => s.updateSetting);
  const [hovered, setHovered] = useState(false);

  // All available palettes: originals + car collection
  const ALL_IDS = [
    "nova",
    "clarity",
    "clean-light",
    "nero",
    ...CAR_PALETTE_IDS,
    ...LIGHT_PALETTE_IDS,
    ...ARTIFACT_PALETTE_IDS,
  ];
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
            fontFamily: T.font.sans,
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
  useActivityTracker();
  useAutoDiscovery();

  const [showDraftPanel, setShowDraftPanel] = useState(false);
  const cmdPaletteOpen = useCommandPaletteStore(s => s.open);
  const aiChatOpen = useUiStore(s => s.aiChatOpen);

  // Sync body background to theme (covers areas outside app-shell + prevents flash)
  // Also toggle theme-light/theme-dark class for CSS hover state overrides
  const density = useUiStore(s => s.appSettings?.density || "comfortable");
  const selectedPalette = useUiStore(s => s.appSettings.selectedPalette);
  useEffect(() => {
    document.documentElement.style.setProperty("--app-bg", C.bg);
    document.documentElement.style.setProperty("--app-text", C.text);
    // Accent CSS vars — used by focus-visible glow, selection, scrollbar tinting
    const accentHex = (C.accent || "#8B5CF6").replace("#", "");
    const ar = parseInt(accentHex.substring(0, 2), 16);
    const ag = parseInt(accentHex.substring(2, 4), 16);
    const ab = parseInt(accentHex.substring(4, 6), 16);
    document.documentElement.style.setProperty("--accent-color", C.accent || "#8B5CF6");
    document.documentElement.style.setProperty("--accent-glow", `rgba(${ar},${ag},${ab},0.25)`);
    document.documentElement.style.setProperty("--accent-selection", `rgba(${ar},${ag},${ab},0.30)`);
    document.documentElement.classList.toggle("theme-light", !C.isDark);
    document.documentElement.classList.toggle("theme-dark", C.isDark);
    document.documentElement.classList.toggle("density-compact", density === "compact");
    document.title = "NOVATerra";
  }, [C.bg, C.text, C.isDark, C.noGlass, C.accent, selectedPalette, density]);

  return (
    <div
      className={`app-shell${C.neroMode ? " nero-nemesis" : ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        background: C.bgTexture ? `${C.bgTexture}, ${C.bgGradient || C.bg}` : C.bgGradient || C.bg,
        position: "relative",
      }}
    >
      {/* Noise grain texture overlay — subtle film grain across all themes */}
      {!C.noGlass && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundImage: NOISE_GRAIN,
            opacity: 0.4,
            pointerEvents: "none",
            zIndex: 11,
            mixBlendMode: "overlay",
          }}
        />
      )}
      {/* Liquid Glass mesh background — suppressed for noGlass/concrete themes */}
      {!C.noGlass && (
        <Suspense fallback={null}>
          <LiquidGlassBackground />
        </Suspense>
      )}
      {/* SVG refraction filter — suppressed for noGlass/concrete themes */}
      {!C.noGlass && (
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
      )}
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
        {showDraftPanel && (
          <Suspense fallback={null}>
            <DraftApprovalPanel open={showDraftPanel} onClose={() => setShowDraftPanel(false)} />
          </Suspense>
        )}
        <ProjectTabBar />
        <FloatingThemePicker />
        <div
          className="app-viewport"
          style={{ flex: 1, position: "relative", overflow: isDashboard ? "hidden" : "auto", scrollBehavior: "smooth" }}
        >
          <PageTransition>
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/database" element={<Navigate to="/core?tab=database" replace />} />
                <Route path="/assemblies" element={<AssembliesPage />} />
                <Route
                  path="/contacts"
                  element={
                    <PageErrorBoundary pageName="Contacts">
                      <ContactsPage />
                    </PageErrorBoundary>
                  }
                />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/inbox" element={<InboxPage />} />
                {/* <Route path="/intelligence" element={<IntelligencePage />} /> temporarily removed */}
                <Route
                  path="/projects"
                  element={
                    <PageErrorBoundary pageName="Projects">
                      <ProjectsPage />
                    </PageErrorBoundary>
                  }
                />
                <Route
                  path="/resources"
                  element={
                    <PageErrorBoundary pageName="Resources">
                      <ResourcePage />
                    </PageErrorBoundary>
                  }
                />
                <Route
                  path="/core"
                  element={
                    <PageErrorBoundary pageName="NOVA Core">
                      <CorePage />
                    </PageErrorBoundary>
                  }
                />
                <Route
                  path="/estimate/:id/info"
                  element={
                    <EstimateLoader>
                      <PageErrorBoundary pageName="Project Info">
                        <ProjectInfoPage />
                      </PageErrorBoundary>
                    </EstimateLoader>
                  }
                />
                <Route
                  path="/estimate/:id/documents"
                  element={
                    <EstimateLoader>
                      <PageErrorBoundary pageName="Plan Room">
                        <PlanRoomPage />
                      </PageErrorBoundary>
                    </EstimateLoader>
                  }
                />
                <Route
                  path="/estimate/:id/plans"
                  element={
                    <EstimateLoader>
                      <PageErrorBoundary pageName="Plan Room">
                        <PlanRoomPage />
                      </PageErrorBoundary>
                    </EstimateLoader>
                  }
                />
                <Route
                  path="/estimate/:id/takeoffs"
                  element={
                    <EstimateLoader>
                      <PageErrorBoundary pageName="Takeoffs">
                        <TakeoffsPage />
                      </PageErrorBoundary>
                    </EstimateLoader>
                  }
                />
                {/* Redirect old /estimate route to /takeoffs (estimate panel is now embedded in takeoffs full-tier) */}
                <Route path="/estimate/:id/estimate" element={<Navigate to="../takeoffs" replace />} />
                <Route
                  path="/estimate/:id/alternates"
                  element={
                    <EstimateLoader>
                      <PageErrorBoundary pageName="Alternates">
                        <AlternatesPage />
                      </PageErrorBoundary>
                    </EstimateLoader>
                  }
                />
                <Route
                  path="/estimate/:id/sov"
                  element={
                    <EstimateLoader>
                      <PageErrorBoundary pageName="Schedule of Values">
                        <ScheduleOfValuesPage />
                      </PageErrorBoundary>
                    </EstimateLoader>
                  }
                />
                <Route
                  path="/estimate/:id/reports"
                  element={
                    <EstimateLoader>
                      <PageErrorBoundary pageName="Reports">
                        <ReportsPage />
                      </PageErrorBoundary>
                    </EstimateLoader>
                  }
                />
                <Route
                  path="/estimate/:id/bids"
                  element={
                    <EstimateLoader>
                      <PageErrorBoundary pageName="Bid Packages">
                        <BidPackagesPage />
                      </PageErrorBoundary>
                    </EstimateLoader>
                  }
                />
                <Route
                  path="/estimate/:id/insights"
                  element={
                    <EstimateLoader>
                      <PageErrorBoundary pageName="Insights">
                        <InsightsPage />
                      </PageErrorBoundary>
                    </EstimateLoader>
                  }
                />
                {/* Business dashboard — owner/manager portal */}
                <Route path="/business" element={<BusinessDashboardPage />} />
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
      {aiChatOpen && (
        <Suspense fallback={null}>
          <AIChatPanel />
        </Suspense>
      )}
      {cmdPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      )}
      {/* NovaCursor — scoped to drawing canvas only (deactivates in estimate mode).
          Throttled to ~30fps to minimize GPU overhead. */}
      <Suspense fallback={null}><NovaCursor /></Suspense>
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
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
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

// ── Route loading spinner — shown while lazy page chunks load ──
function RouteLoading() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: "3px solid rgba(124,92,252,0.15)",
          borderTopColor: "#7C5CFC",
          animation: "spin 0.8s linear infinite",
        }}
      />
    </div>
  );
}

// ── Mobile guard — displayed on screens < 1024px ──
function MobileGuard() {
  const C = useTheme();
  const T = C.T;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: C.bg,
        padding: 32,
        textAlign: "center",
        fontFamily: T.font.sans,
        zIndex: 99999,
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>🖥️</div>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: C.text,
          marginBottom: 8,
        }}
      >
        Desktop Required
      </h1>
      <p
        style={{
          fontSize: 15,
          color: C.textDim || "rgba(160,140,200,0.6)",
          maxWidth: 360,
          lineHeight: 1.6,
        }}
      >
        NOVATerra is a professional estimating platform built for desktop workflows. Please open this app on a screen at
        least 1024px wide for the best experience.
      </p>
      <p
        style={{
          fontSize: 13,
          color: C.textDim || "rgba(160,140,200,0.4)",
          marginTop: 24,
        }}
      >
        Mobile support is coming soon.
      </p>
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
  const appRole = useAuthStore(s => s.appRole);

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

  // Detect ?invite=TOKEN query param and store for auto-acceptance after sign-in/signup
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("invite");
    if (token) {
      localStorage.setItem("pendingInviteToken", token);
      // Clean URL without reload
      const url = new URL(window.location);
      url.searchParams.delete("invite");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, []);

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

  // ── Mobile guard — NOVATerra requires a desktop viewport ──
  if (typeof window !== "undefined" && window.innerWidth < 1024) {
    return (
      <ThemeProvider>
        <MobileGuard />
      </ThemeProvider>
    );
  }

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

  // Sphere test page — dev only
  if (window.location.pathname.startsWith("/sphere-test")) {
    const SphereTestPage = lazy(() => import("@/pages/SphereTestPage"));
    return (
      <Suspense fallback={<AuthLoading />}>
        <SphereTestPage />
      </Suspense>
    );
  }

  // Login mockup — dev only (3D sphere hero concept)
  if (window.location.pathname.startsWith("/login-mockup")) {
    const LoginMockupPage = lazy(() => import("@/pages/LoginMockupPage"));
    return (
      <Suspense fallback={<AuthLoading />}>
        <LoginMockupPage />
      </Suspense>
    );
  }

  // Free ROM tool — public, no auth required (lead capture funnel)
  if (window.location.pathname.startsWith("/rom")) {
    return (
      <Suspense fallback={<AuthLoading />}>
        <RomPage />
      </Suspense>
    );
  }

  // BLDG Talent — public registration/login pages
  if (window.location.pathname.startsWith("/talent/register")) {
    return (
      <Suspense fallback={<AuthLoading />}>
        <BTRegisterPage />
      </Suspense>
    );
  }
  if (window.location.pathname.startsWith("/talent/login")) {
    return (
      <Suspense fallback={<AuthLoading />}>
        <BTLoginPage />
      </Suspense>
    );
  }

  // Not logged in → show cinematic chamber login
  if (!user)
    return (
      <Suspense fallback={<AuthLoading />}>
        <LoginMockupPage />
      </Suspense>
    );

  /* ── Onboarding gates disabled — login/signup is the entry point ──
  // Gate 1: OnboardingSequence (cinematic first-time)
  // Gate 2: GuidedTour (workspace walkthrough)
  // Gate 3: ProgressiveSetup (company info)
  // Gate 4: NovaSignInSplash (returning user greeting)
  // Re-enable later via Alt+Shift+N reset or by uncommenting.
  ── end disabled gates ── */

  // ── BLDG Talent: role-based routing ──
  // Candidates see assessment layout, bt_admins see recruiter portal
  // Default (novaterra) users see the normal app — completely unchanged
  if (appRole === "candidate") {
    return (
      <ThemeProvider>
        <ErrorBoundary>
          <Suspense fallback={<RouteLoading />}>
            <CandidateLayout />
          </Suspense>
        </ErrorBoundary>
      </ThemeProvider>
    );
  }

  if (appRole === "bt_admin") {
    return (
      <ThemeProvider>
        <ErrorBoundary>
          <Suspense fallback={<RouteLoading />}>
            <BTAdminLayout />
          </Suspense>
        </ErrorBoundary>
      </ThemeProvider>
    );
  }

  // Normal NOVATerra app — straight to dashboard (existing users see zero changes)
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </ThemeProvider>
  );
}
