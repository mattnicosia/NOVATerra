import { create } from 'zustand';
import { supabase } from '@/utils/supabase';
import { useAuthStore } from './authStore';

// API base URL — uses Vercel in dev, relative path in production
const API_BASE = import.meta.env.DEV
  ? "https://app-nova-42373ca7.vercel.app"
  : "";

// Helper: get current session from authStore
async function getSession() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export const useInboxStore = create((set, get) => ({
  rfps: [],
  loading: false,
  error: null,
  unreadCount: 0,
  selectedRfpId: null,
  filter: "active", // "active" | "all" | "imported" | "dismissed"

  // Fetch pending RFPs
  fetchRfps: async () => {
    const session = await getSession();
    if (!session) return;

    set({ loading: true, error: null });
    try {
      const filter = get().filter;
      let statusFilter;
      if (filter === "active") statusFilter = "pending,parsed";
      else if (filter === "imported") statusFilter = "imported";
      else if (filter === "dismissed") statusFilter = "dismissed";
      else statusFilter = "pending,parsed,imported,dismissed,error";

      const resp = await fetch(`${API_BASE}/api/pending-rfps?status=${statusFilter}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!resp.ok) throw new Error("Failed to fetch RFPs");
      const data = await resp.json();
      const rfps = data.rfps || [];
      set({
        rfps,
        loading: false,
        unreadCount: rfps.filter(r => r.status === "parsed" || r.status === "pending").length,
      });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  // Subscribe to realtime updates
  subscribeToRfps: () => {
    if (!supabase) return () => {};
    const channel = supabase
      .channel("pending-rfps-changes")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "pending_rfps",
      }, () => {
        // Re-fetch on any change
        get().fetchRfps();
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  },

  // Import an RFP → returns estimate data for IndexedDB
  importRfp: async (rfpId) => {
    const session = await getSession();
    if (!session) return null;

    const resp = await fetch(`${API_BASE}/api/import-rfp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ rfpId }),
    });
    if (!resp.ok) throw new Error("Failed to import RFP");
    return await resp.json();
  },

  // Dismiss an RFP
  dismissRfp: async (rfpId) => {
    if (!supabase) return;
    const session = await getSession();
    if (!session) return;

    await supabase
      .from("pending_rfps")
      .update({ status: "dismissed" })
      .eq("id", rfpId);

    set(s => ({
      rfps: s.rfps.map(r => r.id === rfpId ? { ...r, status: "dismissed" } : r),
      unreadCount: s.unreadCount - 1,
    }));
  },

  // Register a sender email address
  registerSenderEmail: async (email) => {
    if (!supabase) return { error: "Not configured" };
    const session = await getSession();
    if (!session) return { error: "Not authenticated" };

    const { error } = await supabase
      .from("user_email_mappings")
      .insert({ user_id: session.user.id, email: email.toLowerCase() });
    if (error) {
      console.error("[inbox] registerSenderEmail failed:", error.message, error.code);
      // Supabase duplicate key: code 23505
      if (error.code === "23505") return { error: "duplicate" };
      return { error: error.message };
    }
    return { success: true };
  },

  // Remove a sender email
  removeSenderEmail: async (email) => {
    if (!supabase) return { error: "Not configured" };
    const session = await getSession();
    if (!session) return { error: "Not authenticated" };

    const { error } = await supabase
      .from("user_email_mappings")
      .delete()
      .eq("email", email.toLowerCase())
      .eq("user_id", session.user.id);
    if (error) console.error("[inbox] removeSenderEmail failed:", error.message, error);
    return error ? { error: error.message } : { success: true };
  },

  // List registered sender emails
  fetchSenderEmails: async () => {
    if (!supabase) return [];
    const session = await getSession();
    if (!session) return [];

    const { data, error } = await supabase
      .from("user_email_mappings")
      .select("email")
      .eq("user_id", session.user.id);
    if (error) {
      console.error("[inbox] fetchSenderEmails failed:", error.message, error);
      return [];
    }
    return (data || []).map(d => d.email);
  },

  setFilter: (f) => set({ filter: f }),
  setSelectedRfpId: (id) => set({ selectedRfpId: id }),
}));
