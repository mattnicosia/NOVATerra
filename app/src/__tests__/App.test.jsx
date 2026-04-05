import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ── Mock all heavy dependencies so the test stays fast and isolated ──

// Supabase
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: () => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    }),
    channel: () => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    }),
  }),
}));

// Auth store — simulate logged-in user with novaterra role
const mockAuthStore = {
  user: { id: "test-user", email: "test@example.com" },
  loading: false,
  init: vi.fn(),
  appRole: "novaterra",
};
vi.mock("@/stores/authStore", () => ({
  useAuthStore: selector => (typeof selector === "function" ? selector(mockAuthStore) : mockAuthStore),
}));

// Estimates store
const mockEstimatesStore = {
  activeEstimateId: null,
  estimatesIndex: [],
  scenarios: [],
  activeScenarioId: null,
};
vi.mock("@/stores/estimatesStore", () => ({
  useEstimatesStore: Object.assign(
    selector => (typeof selector === "function" ? selector(mockEstimatesStore) : mockEstimatesStore),
    { getState: () => mockEstimatesStore, setState: vi.fn(), subscribe: vi.fn() },
  ),
}));

// UI store
const mockUiStore = {
  persistenceLoaded: true,
  aiChatOpen: false,
  cloudSyncInProgress: false,
  appSettings: { selectedPalette: "nova", density: "comfortable" },
  showToast: vi.fn(),
  updateSetting: vi.fn(),
};
vi.mock("@/stores/uiStore", () => ({
  useUiStore: Object.assign(selector => (typeof selector === "function" ? selector(mockUiStore) : mockUiStore), {
    getState: () => mockUiStore,
    setState: vi.fn(),
    subscribe: vi.fn(),
  }),
}));

// Org store
vi.mock("@/stores/orgStore", () => ({
  useOrgStore: selector => (typeof selector === "function" ? selector({ org: null }) : { org: null }),
}));

// Collaboration store
vi.mock("@/stores/collaborationStore", () => ({
  useCollaborationStore: Object.assign(
    selector =>
      typeof selector === "function"
        ? selector({ isLockHolder: false, currentLock: null })
        : { isLockHolder: false, currentLock: null },
    {
      getState: () => ({
        acquireLock: vi.fn(),
        joinEstimate: vi.fn(),
        subscribeLockChanges: vi.fn(),
        subscribePresence: vi.fn(),
        cleanup: vi.fn(),
      }),
    },
  ),
}));

// Mock all hooks that run side effects
vi.mock("@/hooks/usePersistence", () => ({
  usePersistenceLoad: vi.fn(),
  loadEstimate: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/hooks/useAutoSave", () => ({ useAutoSave: vi.fn() }));
vi.mock("@/hooks/useTakeoffSync", () => ({ useTakeoffSync: vi.fn() }));
vi.mock("@/hooks/useCloudSync", () => ({ useCloudSync: vi.fn() }));
vi.mock("@/hooks/useRealtimeSync", () => ({ useRealtimeSync: vi.fn() }));
vi.mock("@/hooks/useSessionAwareness", () => ({ useSessionAwareness: vi.fn() }));
vi.mock("@/hooks/useEmbeddingSync", () => ({ useEmbeddingSync: vi.fn() }));
vi.mock("@/hooks/useKeyboardShortcuts", () => ({ useKeyboardShortcuts: vi.fn() }));
vi.mock("@/hooks/useAutoSnapshot", () => ({ useAutoSnapshot: vi.fn() }));
vi.mock("@/hooks/useAutoResponseTimers", () => ({ default: vi.fn() }));
vi.mock("@/hooks/useActivityTracker", () => ({ useActivityTracker: vi.fn() }));
vi.mock("@/hooks/useAutoDiscovery", () => ({ useAutoDiscovery: vi.fn() }));

// Mock theme provider — pass through children with minimal theme values
vi.mock("@/hooks/useTheme", () => ({
  ThemeProvider: ({ children }) => children,
  useTheme: () => ({
    bg: "#0D0F14",
    bg1: "#1a1a2e",
    bg2: "#16213e",
    bgGradient: "#0D0F14",
    text: "#EEEDED",
    textMuted: "#8E8E93",
    textDim: "rgba(160,140,200,0.6)",
    border: "rgba(255,255,255,0.08)",
    accent: "#7C5CFC",
    isDark: true,
    noGlass: true,
    neroMode: false,
    T: { font: { sans: "Switzer, sans-serif" } },
  }),
}));

// Mock lazy-loaded components to simple stubs
vi.mock("@/components/layout/NovaHeader", () => ({ default: () => <div data-testid="nova-header">Header</div> }));
vi.mock("@/components/layout/EstimateJourneyBar", () => ({ default: () => null }));
vi.mock("@/components/layout/Toast", () => ({ default: () => null }));
vi.mock("@/components/ambient/PageTransition", () => ({ default: ({ children }) => children }));
vi.mock("@/components/shared/ErrorBoundary", () => ({ default: ({ children }) => children }));
vi.mock("@/components/shared/PageErrorBoundary", () => ({ default: ({ children }) => children }));
vi.mock("@/components/shared/AutoResponseBanner", () => ({ default: () => null }));
vi.mock("@/components/shared/ReadOnlyBanner", () => ({ default: () => null }));
vi.mock("@/utils/novaLogger", () => ({
  estimate: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  orphan: { error: vi.fn() },
}));
vi.mock("@/constants/palettes", () => ({
  CAR_PALETTE_IDS: [],
  LIGHT_PALETTE_IDS: [],
  ARTIFACT_PALETTE_IDS: [],
  PALETTES: [{ id: "nova", name: "Nova", preview: ["#7C5CFC", "#8E8E93", "#1a1a2e"] }],
}));
vi.mock("@/constants/textures", () => ({ NOISE_GRAIN: "" }));

// Lazy-loaded pages — stub to simple divs
vi.mock("@/pages/NovaDashboardPage", () => ({
  default: () => <div data-testid="dashboard-page">Dashboard</div>,
}));
vi.mock("@/pages/SettingsPage", () => ({
  default: () => <div data-testid="settings-page">Settings</div>,
}));

// Mock remaining lazy imports to prevent chunk loading
vi.mock("@/components/shared/DraftApprovalPanel", () => ({ default: () => null }));
vi.mock("@/components/ai/AIChatPanel", () => ({ default: () => null }));
vi.mock("@/components/ambient/LiquidGlassBackground", () => ({ default: () => null }));
vi.mock("@/components/nova/NovaCursor", () => ({ default: () => null }));
vi.mock("@/components/shared/CommandPalette", () => ({ default: () => null }));
vi.mock("@/components/beta/FeedbackWidget", () => ({ default: () => null }));
vi.mock("@/pages/LoginMockupPage", () => ({ default: () => <div>Login</div> }));
vi.mock("@/pages/ProjectInfoPage", () => ({ default: () => <div>ProjectInfo</div> }));
vi.mock("@/pages/PlanRoomPage", () => ({ default: () => <div>PlanRoom</div> }));
vi.mock("@/pages/TakeoffsPage", () => ({ default: () => <div>Takeoffs</div> }));
vi.mock("@/pages/AlternatesPage", () => ({ default: () => <div>Alternates</div> }));
vi.mock("@/pages/ScheduleOfValuesPage", () => ({ default: () => <div>SOV</div> }));
vi.mock("@/pages/AssembliesPage", () => ({ default: () => <div>Assemblies</div> }));
vi.mock("@/pages/ReportsPage", () => ({ default: () => <div>Reports</div> }));
vi.mock("@/pages/ContactsPage", () => ({ default: () => <div>Contacts</div> }));
vi.mock("@/pages/InboxPage", () => ({ default: () => <div>Inbox</div> }));
vi.mock("@/pages/InsightsPage", () => ({ default: () => <div>Insights</div> }));
vi.mock("@/pages/ProjectsPage", () => ({ default: () => <div>Projects</div> }));
vi.mock("@/pages/CorePage", () => ({ default: () => <div>Core</div> }));
vi.mock("@/pages/BidPackagesPage", () => ({ default: () => <div>BidPackages</div> }));
vi.mock("@/pages/BusinessDashboardPage", () => ({ default: () => <div>Business</div> }));
vi.mock("@/pages/PortalPage", () => ({ default: () => <div>Portal</div> }));
vi.mock("@/pages/SubDashboardPage", () => ({ default: () => <div>SubDashboard</div> }));
vi.mock("@/pages/ResourcePage", () => ({ default: () => <div>Resources</div> }));
vi.mock("@/pages/RomPage", () => ({ default: () => <div>ROM</div> }));
vi.mock("@/pages/talent/BTRegisterPage", () => ({ default: () => <div>BTRegister</div> }));
vi.mock("@/pages/talent/BTLoginPage", () => ({ default: () => <div>BTLogin</div> }));
vi.mock("@/components/talent/layout/CandidateLayout", () => ({ default: () => <div>CandidateLayout</div> }));
vi.mock("@/components/talent/layout/BTAdminLayout", () => ({ default: () => <div>BTAdminLayout</div> }));
vi.mock("@/pages/admin/AdminLayout", () => ({ default: () => <div>AdminLayout</div> }));
vi.mock("@/pages/admin/AdminDashboard", () => ({ default: () => <div>AdminDashboard</div> }));
vi.mock("@/pages/admin/AdminUsersPage", () => ({ default: () => <div>AdminUsers</div> }));
vi.mock("@/pages/admin/AdminUserDetail", () => ({ default: () => <div>AdminUserDetail</div> }));
vi.mock("@/pages/admin/AdminEstimatesPage", () => ({ default: () => <div>AdminEstimates</div> }));
vi.mock("@/pages/admin/AdminEstimateDetail", () => ({ default: () => <div>AdminEstimateDetail</div> }));
vi.mock("@/pages/admin/AdminEmbeddingsPage", () => ({ default: () => <div>AdminEmbeddings</div> }));

// ── Import App AFTER all mocks are set up ──
import App from "@/App";

// Helper: render App inside a MemoryRouter at a given path
function renderApp(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset auth state for each test
    mockAuthStore.user = { id: "test-user", email: "test@example.com" };
    mockAuthStore.loading = false;
    mockAuthStore.appRole = "novaterra";
    mockUiStore.persistenceLoaded = true;
  });

  it("renders the root path without crashing", async () => {
    renderApp("/");
    // The header stub should be present (AppContent renders)
    expect(screen.getByTestId("nova-header")).toBeTruthy();
  });

  it("renders the dashboard page at root path", async () => {
    renderApp("/");
    // Dashboard stub should appear (via lazy Suspense)
    const dashboard = await screen.findByTestId("dashboard-page");
    expect(dashboard).toBeTruthy();
  });

  it("redirects unknown routes to root (catch-all)", async () => {
    renderApp("/some/nonexistent/route");
    // The catch-all <Route path="*" element={<Navigate to="/" />} /> should kick in
    // and render the dashboard
    const dashboard = await screen.findByTestId("dashboard-page");
    expect(dashboard).toBeTruthy();
  });

  it("shows loading spinner when auth is loading", () => {
    mockAuthStore.loading = true;
    renderApp("/");
    expect(screen.getByText("Loading...")).toBeTruthy();
  });

  it("shows login when user is not authenticated", async () => {
    mockAuthStore.user = null;
    renderApp("/");
    // LoginMockupPage is lazy-loaded, so wait for Suspense to resolve
    const loginEl = await screen.findByText("Login");
    expect(loginEl).toBeTruthy();
  });
});
