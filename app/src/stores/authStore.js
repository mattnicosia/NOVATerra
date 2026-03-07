import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { storage } from "@/utils/storage";
import { resetAllStores } from "@/hooks/usePersistence";
import { useOrgStore } from "@/stores/orgStore";

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
        // Load org membership — awaited so orgReady is set before persistence loads
        await useOrgStore.getState().fetchOrg();
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
        // Load org membership in background
        useOrgStore.getState().fetchOrg();
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
    // Load org membership (onAuthStateChange may also fire, but dedup guard handles it)
    useOrgStore.getState().fetchOrg();
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
    // Load org membership for newly signed-up user (may have pre-accepted invite)
    useOrgStore.getState().fetchOrg();
    // Load app role (BLDG Talent)
    get().fetchAppRole(data.user.id);
    return { success: true };
  },

  // Sign out — push data to cloud FIRST, then clear local to prevent leaking to next user
  signOut: async () => {
    if (!supabase) return;

    // ── Safety: push current data to cloud before wiping local ──
    try {
      const { useUiStore } = await import("@/stores/uiStore");
      const { useEstimatesStore } = await import("@/stores/estimatesStore");
      const { saveEstimate, saveMasterData } = await import("@/hooks/usePersistence");
      const cloudSync = await import("@/utils/cloudSync");

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
