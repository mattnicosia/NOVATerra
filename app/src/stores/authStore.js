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
      } else if (event === "SIGNED_OUT") {
        set({ user: null, session: null, magicLinkSent: false });
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
    return { success: true };
  },

  // Sign out — clear all local data to prevent leaking to next user
  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    resetAllStores();
    useOrgStore.getState().reset();
    await storage.clearAll();
    set({ user: null, session: null, authError: null, magicLinkSent: false });
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
