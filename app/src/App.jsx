import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useParams, useLocation, useNavigate } from "react-router-dom";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { usePersistenceLoad, loadEstimate } from "@/hooks/usePersistence";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useTakeoffSync } from "@/hooks/useTakeoffSync";
import { useCloudSync } from "@/hooks/useCloudSync";
import { useEmbeddingSync } from "@/hooks/useEmbeddingSync";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useAutoSnapshot } from "@/hooks/useAutoSnapshot";

import { useAuthStore } from "@/stores/authStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
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
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef(null);

  // Close on outside click
  React.useEffect(() => {
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
          onMouseEnter={e => { if (!menuOpen) e.currentTarget.style.background = C.bg2; }}
          onMouseLeave={e => { if (!menuOpen) e.currentTarget.style.background = "transparent"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
          <Ic d={activeTab.icon} size={13} />
          {activeTab.label}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: -2 }}>
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
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.bg2; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? C.accentBg : "transparent"; }}
                >
                  <Ic d={tab.icon} size={14} color={isActive ? C.accent : C.textMuted} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
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
        <NovaHeader />
        <ProjectTabBar />
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
