import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { useAuthStore } from "./authStore";

// API base URL — uses Vercel in dev, relative path in production
const API_BASE = import.meta.env.DEV ? "https://app-nova-42373ca7.vercel.app" : "";

const READ_IDS_KEY = "nova-inbox-read-ids";

// Helper: get current session from authStore
async function getSession() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

export const useInboxStore = create((set, get) => ({
  rfps: [],
  loading: false,
  error: null,
  unreadCount: 0,
  selectedRfpId: null,
  filter: "all", // "all" | "unread" | "imported" | "dismissed"
  readIds: [],

  // Load read IDs from localStorage
  loadReadIds: () => {
    try {
      const raw = localStorage.getItem(READ_IDS_KEY);
      if (raw) set({ readIds: JSON.parse(raw) });
    } catch {}
  },

  // Mark an RFP as read
  markAsRead: rfpId => {
    const current = get().readIds;
    if (current.includes(rfpId)) return;
    const updated = [...current, rfpId];
    set({ readIds: updated });
    try {
      localStorage.setItem(READ_IDS_KEY, JSON.stringify(updated));
    } catch {}
    // Recalculate unread count
    const rfps = get().rfps;
    set({
      unreadCount: rfps.filter(r => (r.status === "parsed" || r.status === "pending") && !updated.includes(r.id))
        .length,
    });
  },

  // Fetch ALL RFPs (always fetches every status — filtering is done client-side)
  fetchRfps: async () => {
    const session = await getSession();
    if (!session) return;

    set({ loading: true, error: null });
    try {
      const resp = await fetch(`${API_BASE}/api/pending-rfps?status=pending,parsed,imported,dismissed,error`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!resp.ok) throw new Error("Failed to fetch RFPs");
      const data = await resp.json();
      const rfps = data.rfps || [];
      const readIds = get().readIds;
      set({
        rfps,
        loading: false,
        unreadCount: rfps.filter(r => (r.status === "parsed" || r.status === "pending") && !readIds.includes(r.id))
          .length,
      });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  // Subscribe to realtime updates (with auto-reconnect on channel error)
  subscribeToRfps: () => {
    if (!supabase) return () => {};

    let reconnectTimeout = null;
    const channel = supabase
      .channel("pending-rfps-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pending_rfps",
        },
        () => {
          // Re-fetch on any change
          get().fetchRfps();
        },
      )
      .subscribe(status => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[inbox] Realtime channel error — reconnecting in 5s");
          reconnectTimeout = setTimeout(() => {
            try {
              supabase.removeChannel(channel);
            } catch {}
            get().subscribeToRfps();
          }, 5000);
        }
      });

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      supabase.removeChannel(channel);
    };
  },

  // Import an RFP → returns estimate data for IndexedDB
  importRfp: async (rfpId, companyProfileId) => {
    const session = await getSession();
    if (!session) return null;

    const resp = await fetch(`${API_BASE}/api/import-rfp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ rfpId, companyProfileId }),
    });
    if (!resp.ok) throw new Error("Failed to import RFP");
    return await resp.json();
  },

  // Dismiss an RFP
  dismissRfp: async rfpId => {
    if (!supabase) return;
    const session = await getSession();
    if (!session) return;

    await supabase.from("pending_rfps").update({ status: "dismissed" }).eq("id", rfpId);

    const readIds = get().readIds;
    const wasUnread = get().rfps.some(
      r => r.id === rfpId && (r.status === "parsed" || r.status === "pending") && !readIds.includes(r.id),
    );

    set(s => ({
      rfps: s.rfps.map(r => (r.id === rfpId ? { ...r, status: "dismissed" } : r)),
      unreadCount: wasUnread ? s.unreadCount - 1 : s.unreadCount,
    }));
  },

  // Register a sender email address
  registerSenderEmail: async email => {
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
  removeSenderEmail: async email => {
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

    const { data, error } = await supabase.from("user_email_mappings").select("email").eq("user_id", session.user.id);
    if (error) {
      console.error("[inbox] fetchSenderEmails failed:", error.message, error);
      return [];
    }
    return (data || []).map(d => d.email);
  },

  // Retry parsing an errored RFP
  retryParse: async rfpId => {
    const session = await getSession();
    if (!session) return { error: "Not authenticated" };

    // Optimistically set status to pending
    set(s => ({
      rfps: s.rfps.map(r => (r.id === rfpId ? { ...r, status: "pending", parse_error: null } : r)),
    }));

    try {
      const resp = await fetch(`${API_BASE}/api/retry-parse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ rfpId }),
      });
      if (!resp.ok) throw new Error("Retry failed");
      const result = await resp.json();

      // Update local state with result
      set(s => ({
        rfps: s.rfps.map(r =>
          r.id === rfpId
            ? {
                ...r,
                status: result.status,
                parsed_data: result.projectName ? { ...r.parsed_data, projectName: result.projectName } : r.parsed_data,
                parse_error: result.error || null,
              }
            : r,
        ),
      }));

      return result;
    } catch (err) {
      // Revert to error status on failure
      set(s => ({
        rfps: s.rfps.map(r => (r.id === rfpId ? { ...r, status: "error" } : r)),
      }));
      return { error: err.message };
    }
  },

  setFilter: f => set({ filter: f }),
  setSelectedRfpId: id => set({ selectedRfpId: id }),
}));
