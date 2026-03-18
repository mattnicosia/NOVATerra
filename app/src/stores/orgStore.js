import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { useAuthStore } from "@/stores/authStore";

// Preset team colors for estimator identity
export const TEAM_COLORS = [
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#10B981",
  "#14B8A6",
  "#06B6D4",
  "#3B82F6",
  "#6D28D9",
  "#84CC16",
];

// Only allow these fields in updateProfile (prevent role escalation)
const PROFILE_SAFE_FIELDS = ["display_name", "avatar_url", "color"];

// ── Selectors (use these instead of getters for reactive Zustand state) ──
export const selectIsOrgMode = s => !!s.org;
export const selectIsManager = s => {
  const r = s.membership?.role;
  return r === "owner" || r === "manager";
};
export const selectIsOwner = s => s.membership?.role === "owner";

export const useOrgStore = create((set, get) => ({
  // State
  org: null, // { id, name, slug, owner_id, settings, created_at }
  membership: null, // Current user's org_members row
  members: [], // All org members (loaded for managers)
  invitations: [], // Pending invitations (loaded for managers)
  allInvitations: [], // All invitations (pending + accepted + expired) for status display
  orgReady: false, // true once fetchOrg has resolved (even with no org)
  _fetchGeneration: 0, // Invalidated on reset to discard in-flight fetchOrg

  // ── Fetch org + membership after auth ──
  fetchOrg: async () => {
    if (!supabase) {
      set({ orgReady: true });
      return;
    }
    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      set({ orgReady: true });
      return;
    }

    const generation = get()._fetchGeneration;

    // Helper: single attempt to fetch org membership
    const attemptFetch = async () => {
      const { data: memberRow, error: memErr } = await supabase
        .from("org_members")
        .select("*, organizations(*)")
        .eq("user_id", userId)
        .eq("active", true)
        .maybeSingle();
      if (memErr) throw memErr;
      return memberRow;
    };

    try {
      let memberRow = null;
      try {
        memberRow = await attemptFetch();
      } catch (err1) {
        // ─── RETRY ONCE on failure ───
        // A transient network error here causes the app to load in solo mode,
        // making all org-scoped data invisible. Retry once before giving up.
        console.warn("[orgStore] fetchOrg attempt 1 failed, retrying:", err1.message);
        await new Promise(r => setTimeout(r, 1500));
        if (generation !== get()._fetchGeneration) return;
        memberRow = await attemptFetch(); // throws if still failing
      }

      // Stale check: if reset() was called while we were fetching, discard
      if (generation !== get()._fetchGeneration) return;

      if (memberRow && memberRow.organizations) {
        const { organizations: orgData, ...mem } = memberRow;
        set({ org: orgData, membership: mem, orgReady: true });
        // Persist org ID for recovery — survives IDB eviction
        try {
          localStorage.setItem("bldg-last-org-id", orgData.id);
        } catch {
          /* non-critical */
        }

        // If manager/owner, also load members + invitations
        if (mem.role === "owner" || mem.role === "manager") {
          get().fetchMembers();
          get().fetchInvitations();
        }
      } else {
        set({ org: null, membership: null, members: [], invitations: [], orgReady: true });
      }
    } catch (err) {
      console.warn("[orgStore] fetchOrg failed after retry:", err.message);
      // Stale check
      if (generation !== get()._fetchGeneration) return;
      set({ org: null, membership: null, members: [], invitations: [], orgReady: true });
    }
  },

  // ── Load all org members ──
  fetchMembers: async () => {
    const org = get().org;
    if (!supabase || !org) return;

    try {
      const { data, error } = await supabase
        .from("org_members")
        .select("*")
        .eq("org_id", org.id)
        .eq("active", true)
        .order("joined_at", { ascending: true });

      if (error) throw error;
      set({ members: data || [] });
    } catch (err) {
      console.warn("[orgStore] fetchMembers failed:", err.message);
    }
  },

  // ── Load pending invitations ──
  fetchInvitations: async () => {
    const org = get().org;
    if (!supabase || !org) return;

    try {
      const { data, error } = await supabase
        .from("org_invitations")
        .select("*")
        .eq("org_id", org.id)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      set({ invitations: data || [] });
    } catch (err) {
      console.warn("[orgStore] fetchInvitations failed:", err.message);
    }
  },

  // ── Load ALL invitations (for status display in settings) ──
  fetchAllInvitations: async () => {
    const org = get().org;
    if (!supabase || !org) return;

    try {
      const { data, error } = await supabase
        .from("org_invitations")
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      set({ allInvitations: data || [] });
    } catch (err) {
      console.warn("[orgStore] fetchAllInvitations failed:", err.message);
    }
  },

  // ── Send estimator invitation (create record + send email) ──
  sendEstimatorInvite: async (email, _displayName) => {
    // 1. Create invitation via existing inviteMember (role = "estimator")
    const result = await get().inviteMember(email, "estimator");
    if (result.error) return result;

    // 2. Call send-team-invite serverless function
    try {
      const session = useAuthStore.getState().session;
      const resp = await fetch("/api/send-team-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ invitationId: result.invitation.id }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        console.warn("[orgStore] send-team-invite failed:", resp.status, errData.error);
        // Invitation was created but email failed — still return success with warning
        get().fetchAllInvitations();
        get().fetchInvitations();
        return { success: true, emailFailed: true, emailError: errData.error || `HTTP ${resp.status}` };
      }

      // 3. Refresh all invitations
      get().fetchAllInvitations();
      get().fetchInvitations();
      return { success: true };
    } catch (err) {
      console.error("[orgStore] sendEstimatorInvite email failed:", err.message);
      get().fetchAllInvitations();
      get().fetchInvitations();
      return { success: true, emailFailed: true, emailError: err.message || "Network error" };
    }
  },

  // ── Create organization (current user becomes owner) ──
  createOrg: async name => {
    if (!supabase) return { error: "Supabase not configured" };
    const user = useAuthStore.getState().user;
    if (!user) return { error: "Not authenticated" };
    if (get().org) return { error: "Already in an organization" };

    let createdOrg = null;
    try {
      // Create org
      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .insert({ name, owner_id: user.id })
        .select()
        .single();

      if (orgErr) throw orgErr;
      createdOrg = org;

      // Create owner membership
      const { data: mem, error: memErr } = await supabase
        .from("org_members")
        .insert({
          org_id: org.id,
          user_id: user.id,
          role: "owner",
          display_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Owner",
          joined_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (memErr) throw memErr;

      set({ org, membership: mem, members: [mem] });
      return { success: true, org };
    } catch (err) {
      // Clean up orphaned org if membership insert failed
      if (createdOrg?.id) {
        await supabase
          .from("organizations")
          .delete()
          .eq("id", createdOrg.id)
          .catch(() => {});
      }
      console.error("[orgStore] createOrg failed:", err.message);
      return { error: err.message };
    }
  },

  // ── Invite a member ──
  inviteMember: async (email, role = "estimator") => {
    const org = get().org;
    if (!supabase || !org) return { error: "No organization" };
    const user = useAuthStore.getState().user;
    if (!user) return { error: "Not authenticated" };

    const normalizedEmail = email.toLowerCase().trim();

    try {
      // Check for existing pending invitation
      const { data: existing } = await supabase
        .from("org_invitations")
        .select("id")
        .eq("org_id", org.id)
        .eq("email", normalizedEmail)
        .is("accepted_at", null)
        .maybeSingle();

      if (existing) return { error: "An invitation has already been sent to this email" };

      const { data, error } = await supabase
        .from("org_invitations")
        .insert({
          org_id: org.id,
          email: normalizedEmail,
          role,
          invited_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Refresh invitations list
      get().fetchInvitations();
      return { success: true, invitation: data };
    } catch (err) {
      console.error("[orgStore] inviteMember failed:", err.message);
      return { error: err.message };
    }
  },

  // ── Accept invitation (called by invitee) ──
  acceptInvitation: async token => {
    if (!supabase) return { error: "Supabase not configured" };
    if (!token || typeof token !== "string") return { error: "Invalid invitation token" };
    const user = useAuthStore.getState().user;
    if (!user) return { error: "You must be signed in to accept an invitation" };

    try {
      const { data, error } = await supabase.rpc("accept_invitation", {
        invitation_token: token,
      });

      if (error) throw error;
      if (data?.error) return { error: data.error };

      // Refresh org data
      await get().fetchOrg();
      return { success: true };
    } catch (err) {
      console.error("[orgStore] acceptInvitation failed:", err.message);
      return { error: err.message };
    }
  },

  // ── Update a member (manager/owner action) ──
  updateMember: async (memberId, updates) => {
    if (!supabase) return { error: "Supabase not configured" };
    const mem = get().membership;
    if (!mem || (mem.role !== "owner" && mem.role !== "manager")) {
      return { error: "Insufficient permissions" };
    }

    try {
      const { error } = await supabase.from("org_members").update(updates).eq("id", memberId);

      if (error) throw error;
      get().fetchMembers();
      return { success: true };
    } catch (err) {
      console.error("[orgStore] updateMember failed:", err.message);
      return { error: err.message };
    }
  },

  // ── Remove a member (manager/owner action) ──
  removeMember: async memberId => {
    if (!supabase) return { error: "Supabase not configured" };

    // Prevent removing the org owner
    const target = get().members.find(m => m.id === memberId);
    if (target?.role === "owner") return { error: "Cannot remove the organization owner" };
    // Prevent self-removal
    if (memberId === get().membership?.id) return { error: "Cannot remove yourself" };

    try {
      const { error } = await supabase.from("org_members").update({ active: false }).eq("id", memberId);

      if (error) throw error;
      get().fetchMembers();
      return { success: true };
    } catch (err) {
      console.error("[orgStore] removeMember failed:", err.message);
      return { error: err.message };
    }
  },

  // ── Revoke invitation ──
  revokeInvitation: async invitationId => {
    if (!supabase) return { error: "Supabase not configured" };

    try {
      const { error } = await supabase.from("org_invitations").delete().eq("id", invitationId);

      if (error) throw error;
      get().fetchInvitations();
      return { success: true };
    } catch (err) {
      console.error("[orgStore] revokeInvitation failed:", err.message);
      return { error: err.message };
    }
  },

  // ── Update own profile (any member) — only safe fields allowed ──
  updateProfile: async updates => {
    const mem = get().membership;
    if (!supabase || !mem) return { error: "No membership" };

    // Whitelist fields to prevent role escalation
    const safeUpdates = {};
    for (const key of PROFILE_SAFE_FIELDS) {
      if (key in updates) safeUpdates[key] = updates[key];
    }
    if (Object.keys(safeUpdates).length === 0) return { error: "No valid fields to update" };

    try {
      const { error } = await supabase.from("org_members").update(safeUpdates).eq("id", mem.id);

      if (error) throw error;

      // Re-read fresh membership state after async gap
      const currentMem = get().membership;
      if (currentMem) {
        set({ membership: { ...currentMem, ...safeUpdates } });
      }
      // Refresh members list if loaded
      if (get().members.length > 0) get().fetchMembers();
      return { success: true };
    } catch (err) {
      console.error("[orgStore] updateProfile failed:", err.message);
      return { error: err.message };
    }
  },

  // ── Reset (called on sign-out) ──
  reset: () =>
    set(s => ({
      org: null,
      membership: null,
      members: [],
      invitations: [],
      allInvitations: [],
      orgReady: false,
      _fetchGeneration: s._fetchGeneration + 1, // invalidate in-flight fetchOrg
    })),
}));
