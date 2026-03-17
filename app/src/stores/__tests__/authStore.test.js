import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Use vi.hoisted so mock fns are available inside vi.mock factories ─
const {
  mockSignInWithOtp,
  mockSignInWithPassword,
  mockSignUp,
  mockSignOut,
  mockGetSession,
  mockOnAuthStateChange,
  mockResetPasswordForEmail,
  mockFrom,
  mockFetchOrg,
  mockOrgReset,
  mockAcceptInvitation,
} = vi.hoisted(() => ({
  mockSignInWithOtp: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockSignUp: vi.fn(),
  mockSignOut: vi.fn(),
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  mockResetPasswordForEmail: vi.fn(),
  mockFrom: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    })),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    delete: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
  mockFetchOrg: vi.fn().mockResolvedValue(undefined),
  mockOrgReset: vi.fn(),
  mockAcceptInvitation: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/utils/supabase", () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      signInWithOtp: mockSignInWithOtp,
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
      signOut: mockSignOut,
      onAuthStateChange: mockOnAuthStateChange,
      resetPasswordForEmail: mockResetPasswordForEmail,
    },
    from: mockFrom,
  },
}));

// ── Mock storage ──────────────────────────────────────────────────────
vi.mock("@/utils/storage", () => ({
  storage: {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    clearAll: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Mock usePersistence ───────────────────────────────────────────────
vi.mock("@/hooks/usePersistence", () => ({
  resetAllStores: vi.fn(),
  saveEstimate: vi.fn().mockResolvedValue(undefined),
  saveMasterData: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock orgStore ─────────────────────────────────────────────────────
vi.mock("@/stores/orgStore", async () => {
  const { create } = await import("zustand");
  const useOrgStore = create(() => ({
    orgReady: false,
    fetchOrg: mockFetchOrg,
    reset: mockOrgReset,
    acceptInvitation: mockAcceptInvitation,
  }));
  return { useOrgStore };
});

// ── Mock dependent stores used by signOut ─────────────────────────────
vi.mock("@/stores/uiStore", () => ({}));
vi.mock("@/stores/estimatesStore", () => ({
  useEstimatesStore: {
    getState: () => ({ activeEstimateId: null }),
  },
}));
vi.mock("@/utils/cloudSync", () => ({}));

import { useAuthStore } from "@/stores/authStore";

const INITIAL_STATE = useAuthStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  // Reset store state fully (including _initialized so init() can re-run)
  useAuthStore.setState({ ...INITIAL_STATE, _initialized: false }, true);
});

// ─── Initial state ────────────────────────────────────────────────────
describe("authStore — initial state", () => {
  it("has correct defaults", () => {
    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.session).toBeNull();
    expect(s.loading).toBe(true);
    expect(s.authError).toBeNull();
    expect(s.magicLinkSent).toBe(false);
    expect(s._initialized).toBe(false);
    expect(s.appRole).toBe("novaterra");
  });
});

// ─── clearError / clearMagicLinkSent ──────────────────────────────────
describe("authStore — clearError / clearMagicLinkSent", () => {
  it("clearError clears authError", () => {
    useAuthStore.setState({ authError: "bad creds" });
    useAuthStore.getState().clearError();
    expect(useAuthStore.getState().authError).toBeNull();
  });

  it("clearMagicLinkSent resets magicLinkSent", () => {
    useAuthStore.setState({ magicLinkSent: true });
    useAuthStore.getState().clearMagicLinkSent();
    expect(useAuthStore.getState().magicLinkSent).toBe(false);
  });
});

// ─── init ─────────────────────────────────────────────────────────────
describe("authStore — init", () => {
  it("sets loading=false when no session exists", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await useAuthStore.getState().init();
    expect(useAuthStore.getState().loading).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("sets user and session when session exists", async () => {
    const fakeUser = { id: "u1", email: "a@b.com" };
    const fakeSession = { user: fakeUser, access_token: "tok" };
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
    await useAuthStore.getState().init();
    expect(useAuthStore.getState().user).toEqual(fakeUser);
    expect(useAuthStore.getState().session).toEqual(fakeSession);
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it("only initializes once (double-call guard)", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await useAuthStore.getState().init();
    await useAuthStore.getState().init();
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it("registers onAuthStateChange listener", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await useAuthStore.getState().init();
    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it("handles getSession failure gracefully", async () => {
    mockGetSession.mockRejectedValue(new Error("network down"));
    await useAuthStore.getState().init();
    expect(useAuthStore.getState().loading).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });
});

// ─── signInWithMagicLink ──────────────────────────────────────────────
describe("authStore — signInWithMagicLink", () => {
  it("sets magicLinkSent on success", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });
    const result = await useAuthStore.getState().signInWithMagicLink("a@b.com");
    expect(result).toEqual({ success: true });
    expect(useAuthStore.getState().magicLinkSent).toBe(true);
    expect(useAuthStore.getState().authError).toBeNull();
  });

  it("sets authError on failure", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: { message: "Rate limited" } });
    const result = await useAuthStore.getState().signInWithMagicLink("a@b.com");
    expect(result).toEqual({ error: "Rate limited" });
    expect(useAuthStore.getState().authError).toBe("Rate limited");
    expect(useAuthStore.getState().magicLinkSent).toBe(false);
  });
});

// ─── signInWithPassword ───────────────────────────────────────────────
describe("authStore — signInWithPassword", () => {
  it("sets user/session on success", async () => {
    const fakeUser = { id: "u2", email: "b@c.com" };
    const fakeSession = { user: fakeUser, access_token: "tok2" };
    mockSignInWithPassword.mockResolvedValue({ data: { user: fakeUser, session: fakeSession }, error: null });
    const result = await useAuthStore.getState().signInWithPassword("b@c.com", "pass123");
    expect(result).toEqual({ success: true });
    expect(useAuthStore.getState().user).toEqual(fakeUser);
    expect(useAuthStore.getState().session).toEqual(fakeSession);
  });

  it("sets authError on failure", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: {}, error: { message: "Invalid login" } });
    const result = await useAuthStore.getState().signInWithPassword("x@y.com", "wrong");
    expect(result).toEqual({ error: "Invalid login" });
    expect(useAuthStore.getState().authError).toBe("Invalid login");
  });
});

// ─── signUpWithPassword ───────────────────────────────────────────────
describe("authStore — signUpWithPassword", () => {
  it("sets user/session when confirmed immediately", async () => {
    const fakeUser = { id: "u3", email: "c@d.com" };
    const fakeSession = { user: fakeUser, access_token: "tok3" };
    mockSignUp.mockResolvedValue({ data: { user: fakeUser, session: fakeSession }, error: null });
    const result = await useAuthStore.getState().signUpWithPassword("c@d.com", "pass", "Charlie");
    expect(result).toEqual({ success: true });
    expect(useAuthStore.getState().user).toEqual(fakeUser);
  });

  it("returns confirmEmail when email confirmation is required", async () => {
    const fakeUser = { id: "u4", email: "d@e.com" };
    mockSignUp.mockResolvedValue({ data: { user: fakeUser, session: null }, error: null });
    const result = await useAuthStore.getState().signUpWithPassword("d@e.com", "pass", "Delta");
    expect(result).toEqual({ success: true, confirmEmail: true });
    expect(useAuthStore.getState().magicLinkSent).toBe(true);
    expect(useAuthStore.getState().user).toBeNull(); // not set yet
  });

  it("sets authError on failure", async () => {
    mockSignUp.mockResolvedValue({ data: {}, error: { message: "Email taken" } });
    const result = await useAuthStore.getState().signUpWithPassword("x@y.com", "pass", "X");
    expect(result).toEqual({ error: "Email taken" });
    expect(useAuthStore.getState().authError).toBe("Email taken");
  });
});

// ─── resetPassword ────────────────────────────────────────────────────
describe("authStore — resetPassword", () => {
  it("returns success when email sent", async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null });
    const result = await useAuthStore.getState().resetPassword("a@b.com");
    expect(result).toEqual({ success: true });
  });

  it("sets authError on failure", async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: { message: "User not found" } });
    const result = await useAuthStore.getState().resetPassword("nope@x.com");
    expect(result).toEqual({ error: "User not found" });
    expect(useAuthStore.getState().authError).toBe("User not found");
  });
});

// ─── signOut ──────────────────────────────────────────────────────────
describe("authStore — signOut", () => {
  it("clears user, session, appRole and calls supabase signOut", async () => {
    useAuthStore.setState({ user: { id: "u1" }, session: { access_token: "t" }, appRole: "bt_admin" });
    mockSignOut.mockResolvedValue({ error: null });
    await useAuthStore.getState().signOut();
    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.session).toBeNull();
    expect(s.appRole).toBe("novaterra");
    expect(s.magicLinkSent).toBe(false);
    expect(mockSignOut).toHaveBeenCalled();
  });
});

// ─── fetchAppRole ─────────────────────────────────────────────────────
describe("authStore — fetchAppRole", () => {
  it("does nothing when userId is falsy", async () => {
    await useAuthStore.getState().fetchAppRole(null);
    expect(useAuthStore.getState().appRole).toBe("novaterra");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("sets appRole from DB when data exists", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "bt_admin" }, error: null }),
        }),
      }),
    });
    await useAuthStore.getState().fetchAppRole("u1");
    expect(useAuthStore.getState().appRole).toBe("bt_admin");
  });

  it("keeps default novaterra when no role row found", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });
    await useAuthStore.getState().fetchAppRole("u1");
    expect(useAuthStore.getState().appRole).toBe("novaterra");
  });
});
