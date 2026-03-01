import { create } from 'zustand';
import { supabase } from '@/utils/supabase';

export const useAuthStore = create((set, get) => ({
  // State
  user: null,
  session: null,
  loading: true,      // true while checking initial session
  authError: null,
  magicLinkSent: false,

  // Initialize auth — call once on app mount
  init: async () => {
    if (!supabase) {
      set({ loading: false });
      return;
    }

    try {
      // Check existing session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        set({ user: session.user, session, loading: false });
      } else {
        set({ loading: false });
      }
    } catch (err) {
      console.error('[auth] Failed to get session:', err);
      set({ loading: false });
    }

    // Listen for auth changes (magic link callback, sign-out, token refresh)
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        set({ user: session.user, session, loading: false, magicLinkSent: false, authError: null });
      } else if (event === "SIGNED_OUT") {
        set({ user: null, session: null, magicLinkSent: false });
      } else if (event === "TOKEN_REFRESHED" && session) {
        set({ session });
      }
    });
  },

  // Sign in with Magic Link (email OTP)
  signInWithMagicLink: async (email) => {
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
    return { success: true };
  },

  // Sign out
  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    set({ user: null, session: null, authError: null, magicLinkSent: false });
  },

  // Reset password (sends email)
  resetPassword: async (email) => {
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
