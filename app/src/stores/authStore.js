import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { storage } from "@/utils/storage";
import { resetAllStores } from "@/hooks/usePersistence";
import { useOrgStore } from "@/stores/orgStore";

// ── Device info for session tracking ──
function getDeviceInfo() {
  const ua = navigator.userAgent;
  const device = ua.includes("Mac")
    ? "Mac"
    : ua.includes("Windows")
      ? "Windows"
      : ua.includes("Linux")
        ? "Linux"
        : ua.includes("iPhone") || ua.includes("iPad")
          ? "iOS"
          : ua.includes("Android")
            ? "Android"
            : "Device";
  const browser = ua.includes("Edg/")
    ? "Edge"
    : ua.includes("Chrome")
      ? "Chrome"
      : ua.includes("Firefox")
        ? "Firefox"
        : ua.includes("Safari")
          ? "Safari"
          : "Browser";
  return { device, browser };
}

// ── Session token: enforces single-device sign-in ──
// ONLY called on explicit sign-in actions (password, signup, magic link callback).
// NEVER called on page load / init — that would overwrite the DB and kick other tabs.
async function writeSessionToken(userId) {
  if (!supabase || !userId) return;
  try {
    const token = crypto.randomUUID();
    localStorage.setItem("bldg-session-token", token);
    const { device, browser } = getDeviceInfo();
    await supabase.from("user_active_session").upsert(
      {
        user_id: userId,
        session_token: token,
        device,
        browser,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    console.log("[auth] Session token written:", token.slice(0, 8) + "...");
  } catch (err) {
    // Non-fatal — table may not exist yet (42P01)
    console.warn("[auth] writeSessionToken failed:", err.message || err);
  }
}

// On page load with an existing session, adopt the DB token locally
// instead of writing a new one. This prevents kicking other tabs/windows.
async function adoptSessionToken(userId) {
  if (!supabase || !userId) return;
  // Already have a local token — nothing to do
  if (localStorage.getItem("bldg-session-token")) return;
  try {
    const { data } = await supabase
      .from("user_active_session")
      .select("session_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.session_token) {
      localStorage.setItem("bldg-session-token", data.session_token);
      console.log("[auth] Adopted session token from DB:", data.session_token.slice(0, 8) + "...");
    } else {
      // No DB row — this is effectively a first sign-in, write a new token
      await writeSessionToken(userId);
    }
  } catch (err) {
    console.warn("[auth] adoptSessionToken failed:", err.message || err);
  }
}

// Check for pending invite token in localStorage and auto-accept
const checkPendingInvite = async () => {
  try {
    const token = localStorage.getItem("pendingInviteToken");
    if (!token) return;
    localStorage.removeItem("pendingInviteToken");
    console.log("[auth] Found pending invite token, auto-accepting...");
    const result = await useOrgStore.getState().acceptInvitation(token);
    if (result?.success) {
      console.log("[auth] Auto-accepted invitation");
      // Re-fetch org to pick up new membership
      await useOrgStore.getState().fetchOrg();
    } else if (result?.error) {
      console.warn("[auth] Auto-accept failed:", result.error);
    }
  } catch (err) {
    console.warn("[auth] checkPendingInvite error:", err.message || err);
  }
};

export const useAuthStore = create((set, get) => ({
  // State
  user: null,
  session: null,
  loading: true, // true while checking initial session
  authError: null,
  magicLinkSent: false,
  _initialized: false, // guard against double-init (React StrictMode)

  // ── BLDG Talent: app-level role ──
  // 'novaterra' = existing estimating user (default)
  // 'candidate' = BLDG Talent assessment taker
  // 'bt_admin'  = BLDG Talent recruiter admin
  appRole: "novaterra",

  // Fetch app role from bt_user_roles table (graceful fallback if table doesn't exist)
  fetchAppRole: async userId => {
    if (!supabase || !userId) return;
    try {
      const { data, error } = await supabase.from("bt_user_roles").select("role").eq("user_id", userId).maybeSingle();
      // 42P01 = table doesn't exist yet — expected during early development
      if (error && error.code !== "42P01") {
        console.warn("[authStore] fetchAppRole error:", error.message);
      }
      if (data?.role) set({ appRole: data.role });
    } catch (err) {
      // Network failure or unexpected error — log but stay novaterra
      console.warn("[authStore] fetchAppRole failed:", err.message || err);
    }
  },

  // Initialize auth — call once on app mount
  init: async () => {
    if (get()._initialized) return;
    set({ _initialized: true });

    if (!supabase) {
      set({ loading: false });
      return;
    }

    try {
      // Check existing session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        set({ user: session.user, session, loading: false });
        // Adopt existing token on page load — never overwrite DB on init
        await adoptSessionToken(session.user.id);
        // Load org membership — awaited so orgReady is set before persistence loads
        await useOrgStore.getState().fetchOrg();
        // Auto-accept pending invite if present (e.g., from email link → signup → redirect)
        await checkPendingInvite();
        // Load app role (BLDG Talent) — awaited so role-gated routing is correct on first render
        await get().fetchAppRole(session.user.id);
      } else {
        set({ loading: false });
        useOrgStore.setState({ orgReady: true });
      }
    } catch (err) {
      console.error("[auth] Failed to get session:", err);
      set({ loading: false });
      useOrgStore.setState({ orgReady: true });
    }

    // Listen for auth changes (magic link callback, sign-out, token refresh)
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        // Skip if we already have this user (avoids duplicate fetchOrg from init + listener)
        const currentUser = get().user;
        if (currentUser?.id === session.user.id) return;

        set({ user: session.user, session, loading: false, magicLinkSent: false, authError: null });
        // Only write a new session token if we don't already have one locally
        // (prevents page-load echoes from overwriting the DB token)
        if (!localStorage.getItem("bldg-session-token")) {
          writeSessionToken(session.user.id);
        }
        // Load org membership in background, then check for pending invite
        useOrgStore
          .getState()
          .fetchOrg()
          .then(() => checkPendingInvite());
        // Load app role (BLDG Talent) in background
        get().fetchAppRole(session.user.id);
      } else if (event === "SIGNED_OUT") {
        set({ user: null, session: null, magicLinkSent: false, appRole: "novaterra" });
        useOrgStore.getState().reset();
      } else if (event === "TOKEN_REFRESHED" && session) {
        set({ session });
      }
    });
  },

  // Sign in with Magic Link (email OTP)
  signInWithMagicLink: async email => {
    if (!supabase) return { error: "Supabase not configured" };
    set({ authError: null, magicLinkSent: false });

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      set({ authError: error.message });
      return { error: error.message };
    }

    set({ magicLinkSent: true });
    return { success: true };
  },

  // Sign in with Email + Password
  signInWithPassword: async (email, password) => {
    if (!supabase) return { error: "Supabase not configured" };
    set({ authError: null });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      set({ authError: error.message });
      return { error: error.message };
    }

    set({ user: data.user, session: data.session });
    // Register this device as the active session
    await writeSessionToken(data.user.id);
    // Load org membership, then auto-accept pending invite (onAuthStateChange may also fire, but dedup guard handles it)
    useOrgStore
      .getState()
      .fetchOrg()
      .then(() => checkPendingInvite());
    // Load app role (BLDG Talent)
    get().fetchAppRole(data.user.id);
    return { success: true };
  },

  // Sign up with Email + Password
  signUpWithPassword: async (email, password, fullName) => {
    if (!supabase) return { error: "Supabase not configured" };
    set({ authError: null });

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });

    if (error) {
      set({ authError: error.message });
      return { error: error.message };
    }

    // If email confirmation is required, user won't have a session yet
    if (data.user && !data.session) {
      set({ magicLinkSent: true }); // reuse this flag to show "check email" message
      return { success: true, confirmEmail: true };
    }

    set({ user: data.user, session: data.session });
    // Register this device as the active session
    await writeSessionToken(data.user.id);
    // Load org membership for newly signed-up user, then auto-accept pending invite
    useOrgStore
      .getState()
      .fetchOrg()
      .then(() => checkPendingInvite());
    // Load app role (BLDG Talent)
    get().fetchAppRole(data.user.id);
    return { success: true };
  },

  // Sign out — push data to cloud FIRST, then clear local to prevent leaking to next user
  signOut: async () => {
    if (!supabase) return;

    // ── Safety: push current data to cloud before wiping local ──
    try {
      await import("@/stores/uiStore");
      const { useEstimatesStore } = await import("@/stores/estimatesStore");
      const { saveEstimate, saveMasterData } = await import("@/hooks/usePersistence");
      await import("@/utils/cloudSync");

      const activeId = useEstimatesStore.getState().activeEstimateId;
      if (activeId) {
        console.log("[signOut] Saving active estimate before sign-out...");
        await saveEstimate();
      }
      console.log("[signOut] Pushing data to cloud before clearing local...");
      await saveMasterData();
      // Give cloud sync a moment to complete
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.warn("[signOut] Pre-sign-out sync failed:", err.message);
      // Continue with sign-out even if sync fails — data is still in cloud
      // from the last successful auto-save
    }

    // Clear active session from DB so other devices know we're gone
    try {
      const userId = get().user?.id;
      if (userId) {
        await supabase.from("user_active_session").delete().eq("user_id", userId);
      }
    } catch {
      /* session cleanup non-critical */
    }
    localStorage.removeItem("bldg-session-token");

    await supabase.auth.signOut();
    resetAllStores();
    useOrgStore.getState().reset();
    await storage.clearAll();
    set({ user: null, session: null, authError: null, magicLinkSent: false, appRole: "novaterra" });
  },

  // Reset password (sends email)
  resetPassword: async email => {
    if (!supabase) return { error: "Supabase not configured" };
    set({ authError: null });
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      set({ authError: error.message });
      return { error: error.message };
    }
    return { success: true };
  },

  // Clear error
  clearError: () => set({ authError: null }),
  clearMagicLinkSent: () => set({ magicLinkSent: false }),
}));
