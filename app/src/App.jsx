import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useParams, useLocation, useNavigate } from "react-router-dom";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { usePersistenceLoad, loadEstimate } from "@/hooks/usePersistence";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useTakeoffSync } from "@/hooks/useTakeoffSync";
import { useCloudSync } from "@/hooks/useCloudSync";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useSessionAwareness } from "@/hooks/useSessionAwareness";
import { useEmbeddingSync } from "@/hooks/useEmbeddingSync";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useAutoSnapshot } from "@/hooks/useAutoSnapshot";
import * as nova from "@/utils/novaLogger";
import useAutoResponseTimers from "@/hooks/useAutoResponseTimers";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useAutoDiscovery } from "@/hooks/useAutoDiscovery";
import AutoResponseBanner from "@/components/shared/AutoResponseBanner";
const DraftApprovalPanel = lazy(() => import("@/components/shared/DraftApprovalPanel"));

import { useAuthStore } from "@/stores/authStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
// useDrawingsStore removed — no longer needed in App header
import { useOrgStore } from "@/stores/orgStore";
import { useCollaborationStore } from "@/stores/collaborationStore";
import ReadOnlyBanner from "@/components/shared/ReadOnlyBanner";
// NovaOrb moved to EstimatePage left panel
import { CAR_PALETTE_IDS, LIGHT_PALETTE_IDS, ARTIFACT_PALETTE_IDS, PALETTES } from "@/constants/palettes";
import { NOISE_GRAIN } from "@/constants/textures";
import { COLORS } from "@/constants/designTokens";
import NovaHeader from "@/components/layout/NovaHeader";
import EstimateJourneyBar from "@/components/layout/EstimateJourneyBar";
import Toast from "@/components/layout/Toast";
import PersistentMusicBar from "@/components/layout/PersistentMusicBar";
import PageTransition from "@/components/ambient/PageTransition";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import PageErrorBoundary from "@/components/shared/PageErrorBoundary";
import { useCommandPaletteStore } from "@/stores/commandPaletteStore";
// Lazy-load heavy components not needed until after auth + first paint
const LoginMockupPage = lazy(() => import("@/pages/LoginMockupPage"));
const AIChatPanel = lazy(() => import("@/components/ai/AIChatPanel"));
const LiquidGlassBackground = lazy(() => import("@/components/ambient/LiquidGlassBackground"));
const ProximityLight = lazy(() => import("@/components/nova/ProximityLight"));
const CommandPalette = lazy(() => import("@/components/shared/CommandPalette"));
const FeedbackWidget = lazy(() => import("@/components/beta/FeedbackWidget"));

// ── Lazy-loaded pages — each becomes its own chunk, loaded on navigation ──
const DashboardPage = lazy(() => import("@/pages/NovaDashboardPage"));
const ProjectInfoPage = lazy(() => import("@/pages/ProjectInfoPage"));
const PlanRoomPage = lazy(() => import("@/pages/PlanRoomPage"));
const TakeoffsPage = lazy(() => import("@/pages/TakeoffsPage"));
const AlternatesPage = lazy(() => import("@/pages/AlternatesPage"));
const ScheduleOfValuesPage = lazy(() => import("@/pages/ScheduleOfValuesPage"));
// CostDatabasePage now embedded inside CorePage — lazy import removed
const AssembliesPage = lazy(() => import("@/pages/AssembliesPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const ContactsPage = lazy(() => import("@/pages/ContactsPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const InboxPage = lazy(() => import("@/pages/InboxPage"));
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
  const orgId = useOrgStore(s => s.org?.id);
  const orgReady = useOrgStore(s => s.orgReady);
  const isLockHolder = useCollaborationStore(s => s.isLockHolder);
  const currentLock = useCollaborationStore(s => s.currentLock);
  const isReadOnly = !!orgId && !isLockHolder && !!currentLock;

  // Auto-snapshot: track estimate changes over time
  useAutoSnapshot(activeId);

  const cloudSyncInProgress = useUiStore(s => s.cloudSyncInProgress);

  useEffect(() => {
    if (!persistenceLoaded || !id || activeId === id) return;
    // Wait for org store to resolve — idbKey() needs org context for correct key prefix
    if (!orgReady) {
      setLoading(true);
      return;
    }
    // If cloud sync is still running, wait — estimate data blobs may not be in IDB yet
    if (cloudSyncInProgress) {
      setLoading(true);
      return;
    }
    setLoading(true);
    setLoadFailed(false);
    nova.estimate.info(`Loading estimate ${id}`, { activeId, cloudSyncInProgress });
    loadEstimate(id).then(async ok => {
      if (!ok) {
        // Retry with increasing delays — org/auth state may still be settling
        const delays = [1500, 3000, 5000];
        for (let attempt = 0; attempt < delays.length; attempt++) {
          nova.estimate.warn(`Attempt ${attempt + 1} failed for ${id} — retrying in ${delays[attempt]}ms...`, { estimateId: id, attempt: attempt + 2 });
          await new Promise(r => setTimeout(r, delays[attempt]));
          const retryOk = await loadEstimate(id);
          if (retryOk) {
            setLoading(false);
            return;
          }
        }
        // All retries failed — estimate data blob not found in IDB or cloud.
        // Do NOT remove from index — the metadata is valid, data may load on
        // next full boot (org/auth timing, IDB key namespace mismatch, etc.).
        nova.orphan.error(`Estimate ${id} failed to load — keeping in index`, { estimateId: id });
        useUiStore.getState().showToast("Estimate could not be loaded — try refreshing the page", "error");
        setLoadFailed(true);
        setLoading(false);
        return;
      }
      setLoading(false);
    });
  }, [id, activeId, persistenceLoaded, orgReady, cloudSyncInProgress]);

  // Safety timeout: if stuck loading, bail to dashboard
  // Allow 45s for estimates with large drawings that need blob hydration
  useEffect(() => {
    if (!loading && persistenceLoaded) return;
    const LOAD_TIMEOUT = 45000;
    const timer = setTimeout(() => {
      const stillStuck = !useEstimatesStore.getState().activeEstimateId && id;
      if (stillStuck) {
        nova.estimate.error(`Timed out loading estimate ${id}`, { estimateId: id, timeoutMs: LOAD_TIMEOUT });
        useUiStore.getState().showToast("Estimate load timed out — returning to dashboard", "error");
        setLoadFailed(true);
        setLoading(false);
      }
    }, LOAD_TIMEOUT);
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

    // Release lock on tab close/refresh (best-effort via sendBeacon)
    const handleUnload = () => {
      collab.cleanup();
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
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

/* PROJECT_TABS removed — navigation moved to EstimateJourneyBar */

/* ProjectTabBar + PILL_KEYFRAMES removed — replaced by EstimateJourneyBar */

/* ── Floating theme picker — fixed bottom-right, always visible ── */
function FloatingThemePicker() {
  const C = useTheme();
  const T = C.T;
  const selectedPalette = useUiStore(s => s.appSettings.selectedPalette);
  const updateSetting = useUiStore(s => s.updateSetting);
  const [expanded, setExpanded] = useState(false);

  const ALL_IDS = [
    "nova",
    "shift5b",
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

function AppContent() {
  const C = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboard = location.pathname === "/";

  // ── First org login redirect: send invited users to settings/company profile ──
  const orgReady = useOrgStore(s => s.orgReady);
  const hasOrg = useOrgStore(s => !!s.org);
  useEffect(() => {
    if (!orgReady || !hasOrg) return;
    try {
      const flag = localStorage.getItem("bldg-first-org-login");
      if (flag) {
        localStorage.removeItem("bldg-first-org-login");
        localStorage.setItem("bldg-first-org-welcome", "1");
        navigate("/settings", { replace: true });
      }
    } catch { /* non-critical */ }
  }, [orgReady, hasOrg, navigate]);

  usePersistenceLoad();
  useAutoSave();
  useTakeoffSync();
  useCloudSync();
  useRealtimeSync();
  useSessionAwareness();
  useEmbeddingSync();
  useKeyboardShortcuts();
  useAutoResponseTimers();
  useActivityTracker();
  useAutoDiscovery();

  const persistenceLoaded = useUiStore(s => s.persistenceLoaded);
  // Cap persistence wait at 3s — never stall on slow cloud sync
  const [forceShow, setForceShow] = useState(false);
  useEffect(() => {
    if (persistenceLoaded) return;
    const t = setTimeout(() => setForceShow(true), 3000);
    return () => clearTimeout(t);
  }, [persistenceLoaded]);
  const appReady = persistenceLoaded || forceShow;
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
    document.title = "NOVA";
  }, [C.bg, C.text, C.isDark, C.noGlass, C.accent, selectedPalette, density]);

  return (
    <div
      className={`app-shell${C.neroMode ? " nero-nemesis" : ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        background: C.bgGradient || C.bg || COLORS.bg.primary,
        position: "relative",
        opacity: appReady ? 1 : 0,
        transition: "opacity 0.15s ease-in",
      }}
    >
      {/* Background texture overlay — uses palette's bgTexture or default grain */}
      {!C.noGlass && (
        <div
          className="noise-grain-overlay"
          style={{
            position: "fixed",
            inset: 0,
            backgroundImage: C.bgTexture || NOISE_GRAIN,
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
        <EstimateJourneyBar />
        <FloatingThemePicker />
        <PersistentMusicBar />
        <Suspense fallback={null}>
          <FeedbackWidget />
        </Suspense>
        <div
          className="app-viewport"
          style={{ flex: 1, position: "relative", overflow: isDashboard ? "hidden" : "auto", scrollBehavior: "smooth" }}
        >
          <PageTransition>
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route
                  path="/"
                  element={
                    <PageErrorBoundary pageName="Dashboard">
                      <DashboardPage />
                    </PageErrorBoundary>
                  }
                />
                <Route path="/database" element={<Navigate to="/core?tab=database" replace />} />
                <Route
                  path="/assemblies"
                  element={
                    <PageErrorBoundary pageName="Assemblies">
                      <AssembliesPage />
                    </PageErrorBoundary>
                  }
                />
                <Route
                  path="/contacts"
                  element={
                    <PageErrorBoundary pageName="Contacts">
                      <ContactsPage />
                    </PageErrorBoundary>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <PageErrorBoundary pageName="Settings">
                      <SettingsPage />
                    </PageErrorBoundary>
                  }
                />
                <Route
                  path="/inbox"
                  element={
                    <PageErrorBoundary pageName="Inbox">
                      <InboxPage />
                    </PageErrorBoundary>
                  }
                />
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
                  path="/estimate/:id/network"
                  element={
                    <EstimateLoader>
                      <PageErrorBoundary pageName="NOVA Network">
                        <BidPackagesPage />
                      </PageErrorBoundary>
                    </EstimateLoader>
                  }
                />
                {/* Backward compat: old /bids URLs redirect to /network */}
                <Route path="/estimate/:id/bids" element={<Navigate to="../network" replace />} />
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
                <Route
                  path="/business"
                  element={
                    <PageErrorBoundary pageName="Business Dashboard">
                      <BusinessDashboardPage />
                    </PageErrorBoundary>
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
                  <Route
                    index
                    element={
                      <PageErrorBoundary pageName="Admin Dashboard">
                        <AdminDashboard />
                      </PageErrorBoundary>
                    }
                  />
                  <Route
                    path="users"
                    element={
                      <PageErrorBoundary pageName="Admin Users">
                        <AdminUsersPage />
                      </PageErrorBoundary>
                    }
                  />
                  <Route
                    path="users/:userId"
                    element={
                      <PageErrorBoundary pageName="Admin User Detail">
                        <AdminUserDetail />
                      </PageErrorBoundary>
                    }
                  />
                  <Route
                    path="estimates"
                    element={
                      <PageErrorBoundary pageName="Admin Estimates">
                        <AdminEstimatesPage />
                      </PageErrorBoundary>
                    }
                  />
                  <Route
                    path="estimates/:userId/:estimateId"
                    element={
                      <PageErrorBoundary pageName="Admin Estimate Detail">
                        <AdminEstimateDetail />
                      </PageErrorBoundary>
                    }
                  />
                  <Route
                    path="embeddings"
                    element={
                      <PageErrorBoundary pageName="Admin Embeddings">
                        <AdminEmbeddingsPage />
                      </PageErrorBoundary>
                    }
                  />
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
      {/* ProximityLight — subtle radial glow that follows cursor across app shell */}
      <Suspense fallback={null}>
        <ProximityLight />
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
        NOVA is a professional estimating platform built for desktop and tablet workflows. Please open this app on a
        screen at least 700px wide for the best experience.
      </p>
      <p
        style={{
          fontSize: 13,
          color: C.textDim || "rgba(160,140,200,0.4)",
          marginTop: 24,
        }}
      >
        Works best on iPad or desktop.
      </p>
    </div>
  );
}

export default function App() {
  const user = useAuthStore(s => s.user);
  const loading = useAuthStore(s => s.loading);
  const init = useAuthStore(s => s.init);
  const appRole = useAuthStore(s => s.appRole);

  // Onboarding: first sign-in only (persisted in localStorage)
  const [_onboardingComplete, setOnboardingComplete] = useState(
    () => localStorage.getItem("nova_onboarding_complete") === "true",
  );
  // Guided tour: first sign-in, runs after onboarding departure
  const [_tourComplete, setTourComplete] = useState(() => localStorage.getItem("nova_tour_complete") === "true");
  // Progressive setup: first sign-in, runs after guided tour
  const [_setupComplete, setSetupComplete] = useState(() => localStorage.getItem("nova_setup_complete") === "true");
  // Splash: every browser session (persisted in sessionStorage)
  const [_splashComplete, setSplashComplete] = useState(() => sessionStorage.getItem("nova_splash_shown") === "true");

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

  // ── Mobile guard — NOVATerra requires tablet or larger (700px+) ──
  if (typeof window !== "undefined" && window.innerWidth < 700) {
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
