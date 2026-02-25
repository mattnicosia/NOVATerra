import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';
import { usePersistenceLoad, loadEstimate } from '@/hooks/usePersistence';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useTakeoffSync } from '@/hooks/useTakeoffSync';
import { useCloudSync } from '@/hooks/useCloudSync';
import { useEmbeddingSync } from '@/hooks/useEmbeddingSync';
import { useAuthStore } from '@/stores/authStore';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useUiStore } from '@/stores/uiStore';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import Toast from '@/components/layout/Toast';
import AIChatPanel from '@/components/ai/AIChatPanel';
import AIFab from '@/components/ai/AIFab';
import LoginPage from '@/pages/LoginPage';
import OnboardingSequence from '@/components/nova/OnboardingSequence';
import NovaSignInSplash from '@/components/nova/NovaSignInSplash';

import AmbientParticles from '@/components/ambient/AmbientParticles';
import PageTransition from '@/components/ambient/PageTransition';
import DashboardPage from '@/pages/DashboardPage';
import ProjectInfoPage from '@/pages/ProjectInfoPage';
import PlanRoomPage from '@/pages/PlanRoomPage';
import TakeoffsPage from '@/pages/TakeoffsPage';
import EstimatePage from '@/pages/EstimatePage';
import AlternatesPage from '@/pages/AlternatesPage';
import ScheduleOfValuesPage from '@/pages/ScheduleOfValuesPage';
import CostDatabasePage from '@/pages/CostDatabasePage';
import AssembliesPage from '@/pages/AssembliesPage';
import ReportsPage from '@/pages/ReportsPage';
import ContactsPage from '@/pages/ContactsPage';
import SettingsPage from '@/pages/SettingsPage';
import BrainstormPage from '@/pages/BrainstormPage';
import InboxPage from '@/pages/InboxPage';
import DocumentsPage from '@/pages/DocumentsPage';

// Auto-load estimate from URL if not already loaded (handles page refresh on estimate routes)
function EstimateLoader({ children }) {
  const { id } = useParams();
  const activeId = useEstimatesStore(s => s.activeEstimateId);
  const persistenceLoaded = useUiStore(s => s.persistenceLoaded);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!persistenceLoaded || !id || activeId === id) return;
    setLoading(true);
    loadEstimate(id).finally(() => setLoading(false));
  }, [id, activeId, persistenceLoaded]);

  if (loading || !persistenceLoaded || (!activeId && id)) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#999" }}>
        Loading estimate...
      </div>
    );
  }
  return children;
}

function AppContent() {
  const C = useTheme();
  usePersistenceLoad();
  useAutoSave();
  useTakeoffSync();
  useCloudSync();
  useEmbeddingSync();

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: C.bgGradient || C.bg, position: "relative" }}>
      <AmbientParticles />
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", zIndex: 1 }}>
        <Header />
        <div style={{ flex: 1, overflow: "auto", scrollBehavior: "smooth" }}>
          <PageTransition>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/database" element={<CostDatabasePage />} />
              <Route path="/assemblies" element={<AssembliesPage />} />
              <Route path="/contacts" element={<ContactsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/brainstorm" element={<BrainstormPage />} />
              <Route path="/estimate/:id/info" element={<EstimateLoader><ProjectInfoPage /></EstimateLoader>} />
              <Route path="/estimate/:id/plans" element={<EstimateLoader><PlanRoomPage /></EstimateLoader>} />
              <Route path="/estimate/:id/takeoffs" element={<EstimateLoader><TakeoffsPage /></EstimateLoader>} />
              <Route path="/estimate/:id/estimate" element={<EstimateLoader><EstimatePage /></EstimateLoader>} />
              <Route path="/estimate/:id/alternates" element={<EstimateLoader><AlternatesPage /></EstimateLoader>} />
              <Route path="/estimate/:id/sov" element={<EstimateLoader><ScheduleOfValuesPage /></EstimateLoader>} />
              <Route path="/estimate/:id/reports" element={<EstimateLoader><ReportsPage /></EstimateLoader>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </PageTransition>
        </div>
      </div>
      <Toast />
      <AIChatPanel />
      <AIFab />
    </div>
  );
}

// Loading spinner while checking auth session
function AuthLoading() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#F5F5F7",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: "linear-gradient(135deg, #0A84FF, #BF5AF2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px",
          animation: "pulse 1.5s infinite ease-in-out",
        }}>
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 20h20" />
            <path d="M5 20V8l7-5 7 5v12" />
            <path d="M9 20v-6h6v6" />
          </svg>
        </div>
        <p style={{ fontSize: 14, color: "#6E6E73", fontWeight: 500 }}>Loading...</p>
      </div>
    </div>
  );
}

// Helper: reveal AppContent underneath an intro overlay
function revealApp() {
  const el = document.getElementById('app-reveal');
  if (el) { el.style.opacity = '1'; el.style.pointerEvents = 'auto'; }
}

export default function App() {
  const user = useAuthStore(s => s.user);
  const loading = useAuthStore(s => s.loading);
  const init = useAuthStore(s => s.init);

  // Onboarding: first sign-in only (persisted in localStorage)
  const [onboardingComplete, setOnboardingComplete] = useState(
    () => localStorage.getItem('nova_onboarding_complete') === 'true'
  );
  // Splash: every browser session (persisted in sessionStorage)
  const [splashComplete, setSplashComplete] = useState(
    () => sessionStorage.getItem('nova_splash_shown') === 'true'
  );

  // Initialize auth on mount
  useEffect(() => {
    init();
  }, [init]);

  // Reset NOVA intro — reusable for keyboard shortcut + preview button
  const resetIntro = useCallback(() => {
    localStorage.removeItem('nova_onboarding_complete');
    localStorage.removeItem('nova_user_name');
    localStorage.removeItem('nova_user_role');
    sessionStorage.removeItem('nova_splash_shown');
    setOnboardingComplete(false);
    setSplashComplete(false);
  }, []);

  // Keyboard shortcut: Alt+Shift+N → replay NOVA onboarding
  useEffect(() => {
    const handler = (e) => {
      if (e.altKey && e.shiftKey && e.code === 'KeyN') {
        e.preventDefault();
        resetIntro();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [resetIntro]);

  // Show loading spinner while checking session
  if (loading) return <AuthLoading />;

  // Not logged in → show login page
  if (!user) return (
    <ThemeProvider>
      <LoginPage />
    </ThemeProvider>
  );

  // Gate 1: First-time cinematic onboarding
  if (!onboardingComplete) {
    return (
      <ThemeProvider>
        <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
          <div id="app-reveal" style={{ position: 'absolute', inset: 0, opacity: 0, transition: 'opacity 1200ms ease', pointerEvents: 'none' }}>
            <AppContent />
          </div>
          <OnboardingSequence
            onComplete={() => {
              setOnboardingComplete(true);
              // Also mark splash as shown for this session
              sessionStorage.setItem('nova_splash_shown', 'true');
              setSplashComplete(true);
            }}
            onTransitionStart={revealApp}
          />
        </div>
      </ThemeProvider>
    );
  }

  // Gate 2: Returning user splash (every session)
  if (!splashComplete) {
    return (
      <ThemeProvider>
        <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
          <div id="app-reveal" style={{ position: 'absolute', inset: 0, opacity: 0, transition: 'opacity 1200ms ease', pointerEvents: 'none' }}>
            <AppContent />
          </div>
          <NovaSignInSplash
            onComplete={() => {
              sessionStorage.setItem('nova_splash_shown', 'true');
              setSplashComplete(true);
            }}
            onTransitionStart={revealApp}
          />
        </div>
      </ThemeProvider>
    );
  }

  // Normal app
  return (
    <ThemeProvider>
      <AppContent />
      {/* Temporary: Preview Intro button — remove before rollout */}
      <div
        onClick={resetIntro}
        title="Preview Intro"
        style={{
          position: 'fixed', bottom: 24, left: 24, zIndex: 9999,
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(160,100,255,0.12)',
          border: '1px solid rgba(160,100,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 300ms',
          opacity: 0.5,
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(160,100,255,0.2)'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.background = 'rgba(160,100,255,0.12)'; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,180,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3" fill="rgba(160,100,255,0.3)" />
        </svg>
      </div>
    </ThemeProvider>
  );
}
