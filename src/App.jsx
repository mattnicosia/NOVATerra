import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';
import { usePersistenceLoad, loadEstimate } from '@/hooks/usePersistence';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useTakeoffSync } from '@/hooks/useTakeoffSync';
import { useCloudSync } from '@/hooks/useCloudSync';
import { useAuthStore } from '@/stores/authStore';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useUiStore } from '@/stores/uiStore';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import Toast from '@/components/layout/Toast';
import AIChatPanel from '@/components/ai/AIChatPanel';
import AIFab from '@/components/ai/AIFab';
import LoginPage from '@/pages/LoginPage';

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

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: C.bgGradient || C.bg }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Header />
        <div style={{ flex: 1, overflow: "auto", scrollBehavior: "smooth" }}>
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

export default function App() {
  const user = useAuthStore(s => s.user);
  const loading = useAuthStore(s => s.loading);
  const init = useAuthStore(s => s.init);

  // Initialize auth on mount
  useEffect(() => {
    init();
  }, [init]);

  // Show loading spinner while checking session
  if (loading) return <AuthLoading />;

  // Not logged in → show login page
  if (!user) return (
    <ThemeProvider>
      <LoginPage />
    </ThemeProvider>
  );

  // Logged in → show main app
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
