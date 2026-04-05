import { create } from "zustand";
import { uid } from "@/utils/format";
import { supabase } from "@/utils/supabase";
import { useAuthStore } from "@/stores/authStore";
import { useOrgStore, selectIsManager } from "@/stores/orgStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useCalendarStore } from "@/stores/calendarStore";

const HEARTBEAT_MS = 60_000; // 60s heartbeat
const LOCK_TTL_MS = 180_000; // 3 min TTL
const PRESENCE_HEARTBEAT_MS = 120_000; // 2 min presence ping

function getUserInfo() {
  const user = useAuthStore.getState().user;
  const membership = useOrgStore.getState().membership;
  return {
    userId: user?.id,
    userName: membership?.display_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Unknown",
    userColor: membership?.color || "#60A5FA",
  };
}

function getOrgId() {
  return useOrgStore.getState().org?.id;
}

/* ─── Auto-response trigger type definitions ─── */
export const TRIGGER_TYPES = {
  portalOpened: { label: "Portal Opened", description: "Sub viewed the bid portal", color: "#7C5CFC" },
  proposalSubmitted: { label: "Proposal Submitted", description: "Sub uploaded their bid", color: "#34C759" },
  bidDue48h: { label: "48h Reminder", description: "Bid due in 48 hours", color: "#FF9F0A" },
  bidDue24h: { label: "24h Reminder", description: "Bid due in 24 hours", color: "#FF453A" },
  postAwardWinner: { label: "Award (Winner)", description: "Sub was awarded the bid", color: "#30D158" },
  postAwardLoser: { label: "Award (Result)", description: "Sub was not awarded", color: "#8E8E93" },
  noResponse72h: {
    label: "No Response (72h)",
    description: "Sub hasn't opened invitation in 72 hours",
    color: "#FF9F0A",
  },
};

const DEFAULT_TRIGGER_CONFIG = {
  portalOpened: { enabled: true },
  proposalSubmitted: { enabled: true },
  bidDue48h: { enabled: true },
  bidDue24h: { enabled: true },
  postAwardWinner: { enabled: true },
  postAwardLoser: { enabled: true },
  noResponse72h: { enabled: true },
};

/* ─── Correspondence sync helper ─── */
function syncCorrespondenceToIndex() {
  const { correspondences } = useCollaborationStore.getState();
  const id = useEstimatesStore.getState().activeEstimateId;
  if (!id) return;
  const pending = correspondences.filter(c => c.status === "pending" || c.status === "in_progress");
  const nextDue = pending.filter(c => c.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.dueDate || "";
  useEstimatesStore.getState().updateIndexEntry(id, {
    correspondenceCount: correspondences.length,
    correspondencePendingCount: pending.length,
    correspondenceNextDue: nextDue,
    correspondenceTotalHours: correspondences.reduce((s, c) => s + (c.estimatedHours || 0), 0),
  });
}

export const useCollaborationStore = create((set, get) => ({

  // ═══════════════════════════════════════════════════════════
  // LOCKS & PRESENCE DOMAIN (original collaborationStore)
  // ═══════════════════════════════════════════════════════════

  currentLock: null,
  isLockHolder: false,
  lockError: null,
  viewers: [],
  _lockChannel: null,
  _presenceChannel: null,
  _heartbeatInterval: null,
  _presenceInterval: null,
  _currentEstimateId: null,
  _activityDebounce: null,

  // ── Lock Lifecycle ────────────────────────────────────

  acquireLock: async estimateId => {
    const orgId = getOrgId();
    if (!orgId || !supabase) return;

    const { userId, userName, userColor } = getUserInfo();
    if (!userId) return;

    try {
      await supabase
        .from("estimate_locks")
        .delete()
        .eq("estimate_id", estimateId)
        .eq("org_id", orgId)
        .lt("expires_at", new Date().toISOString());

      const expiresAt = new Date(Date.now() + LOCK_TTL_MS).toISOString();
      const { data, error } = await supabase
        .from("estimate_locks")
        .insert({
          estimate_id: estimateId,
          org_id: orgId,
          locked_by: userId,
          locked_by_name: userName,
          locked_by_color: userColor,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505" || error.code === "409" || error.message?.includes("409")) {
          const { data: existing } = await supabase
            .from("estimate_locks")
            .select("*")
            .eq("estimate_id", estimateId)
            .eq("org_id", orgId)
            .single();

          if (existing) {
            if (new Date(existing.expires_at) < new Date()) {
              await supabase.from("estimate_locks").delete().eq("id", existing.id);
              if (!get()._lockRetried) {
                set({ _lockRetried: true });
                const result = await get().acquireLock(estimateId);
                set({ _lockRetried: false });
                return result;
              }
              console.warn("[collab] Lock retry exhausted for", estimateId);
              set({ _lockRetried: false });
              return;
            }

            set({
              currentLock: {
                estimateId,
                lockedBy: existing.locked_by,
                lockedByName: existing.locked_by_name,
                lockedByColor: existing.locked_by_color,
                expiresAt: existing.expires_at,
                acquiredAt: existing.acquired_at,
              },
              isLockHolder: existing.locked_by === userId,
              lockError: null,
            });

            if (existing.locked_by === userId) {
              get()._startHeartbeat(estimateId);
            }
          }
          return;
        }
        console.error("[collab] Lock acquisition error:", error);
        set({ lockError: error.message });
        return;
      }

      set({
        currentLock: {
          estimateId,
          lockedBy: userId,
          lockedByName: userName,
          lockedByColor: userColor,
          expiresAt: data.expires_at,
          acquiredAt: data.acquired_at,
        },
        isLockHolder: true,
        lockError: null,
      });
      get()._startHeartbeat(estimateId);
    } catch (err) {
      console.error("[collab] Lock error:", err);
      set({ lockError: err.message });
    }
  },

  releaseLock: async estimateId => {
    const orgId = getOrgId();
    if (!orgId || !supabase) return;

    const { userId } = getUserInfo();
    get()._stopHeartbeat();

    try {
      await supabase
        .from("estimate_locks")
        .delete()
        .eq("estimate_id", estimateId || get()._currentEstimateId)
        .eq("org_id", orgId)
        .eq("locked_by", userId);
    } catch (err) {
      console.error("[collab] Release lock error:", err);
    }

    set({ currentLock: null, isLockHolder: false, lockError: null });
  },

  forceReleaseLock: async estimateId => {
    const orgId = getOrgId();
    if (!orgId || !supabase) return;

    const isManager = selectIsManager(useOrgStore.getState());
    if (!isManager) return;

    try {
      await supabase
        .from("estimate_locks")
        .delete()
        .eq("estimate_id", estimateId || get()._currentEstimateId)
        .eq("org_id", orgId);

      set({ currentLock: null, isLockHolder: false, lockError: null });

      await get().acquireLock(estimateId || get()._currentEstimateId);
    } catch (err) {
      console.error("[collab] Force release error:", err);
    }
  },

  _startHeartbeat: estimateId => {
    get()._stopHeartbeat();
    const orgId = getOrgId();
    const { userId } = getUserInfo();

    const interval = setInterval(async () => {
      if (!supabase) return;
      const expiresAt = new Date(Date.now() + LOCK_TTL_MS).toISOString();
      try {
        await supabase
          .from("estimate_locks")
          .update({ expires_at: expiresAt })
          .eq("estimate_id", estimateId)
          .eq("org_id", orgId)
          .eq("locked_by", userId);
      } catch (err) {
        console.error("[collab] Heartbeat error:", err);
      }
    }, HEARTBEAT_MS);

    set({ _heartbeatInterval: interval });
  },

  _stopHeartbeat: () => {
    const { _heartbeatInterval } = get();
    if (_heartbeatInterval) {
      clearInterval(_heartbeatInterval);
      set({ _heartbeatInterval: null });
    }
  },

  // ── Presence ──────────────────────────────────────────

  joinEstimate: async estimateId => {
    const orgId = getOrgId();
    if (!orgId || !supabase) return;

    const { userId, userName, userColor } = getUserInfo();
    if (!userId) return;

    set({ _currentEstimateId: estimateId });

    try {
      await supabase.from("estimate_presence").upsert(
        {
          estimate_id: estimateId,
          org_id: orgId,
          user_id: userId,
          user_name: userName,
          user_color: userColor,
          last_seen: new Date().toISOString(),
        },
        { onConflict: "estimate_id,org_id,user_id" },
      );
    } catch (err) {
      console.error("[collab] Join presence error:", err);
    }

    await get()._refreshViewers(estimateId);

    const presInterval = setInterval(async () => {
      if (!supabase) return;
      try {
        await supabase
          .from("estimate_presence")
          .update({ last_seen: new Date().toISOString() })
          .eq("estimate_id", estimateId)
          .eq("org_id", orgId)
          .eq("user_id", userId);
      } catch {
        /* non-critical */
      }
    }, PRESENCE_HEARTBEAT_MS);

    set({ _presenceInterval: presInterval });
  },

  leaveEstimate: async estimateId => {
    const orgId = getOrgId();
    if (!orgId || !supabase) return;

    const { userId } = getUserInfo();
    const eid = estimateId || get()._currentEstimateId;

    const { _presenceInterval } = get();
    if (_presenceInterval) {
      clearInterval(_presenceInterval);
      set({ _presenceInterval: null });
    }

    try {
      await supabase
        .from("estimate_presence")
        .delete()
        .eq("estimate_id", eid)
        .eq("org_id", orgId)
        .eq("user_id", userId);
    } catch (err) {
      console.error("[collab] Leave presence error:", err);
    }

    set({ viewers: [], _currentEstimateId: null });
  },

  updateActivity: (activity) => {
    const prev = get()._activityDebounce;
    if (prev) clearTimeout(prev);

    const timer = setTimeout(async () => {
      const orgId = getOrgId();
      const estimateId = get()._currentEstimateId;
      if (!orgId || !estimateId || !supabase) return;
      const { userId } = getUserInfo();
      if (!userId) return;
      try {
        await supabase
          .from("estimate_presence")
          .update({ activity: activity || {} })
          .eq("estimate_id", estimateId)
          .eq("org_id", orgId)
          .eq("user_id", userId);
      } catch { /* activity broadcast non-critical */ }
    }, 2000);

    set({ _activityDebounce: timer });
  },

  _refreshViewers: async estimateId => {
    const orgId = getOrgId();
    if (!orgId || !supabase) return;

    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    try {
      const { data } = await supabase
        .from("estimate_presence")
        .select("user_id, user_name, user_color, last_seen, activity")
        .eq("estimate_id", estimateId)
        .eq("org_id", orgId)
        .gte("last_seen", fiveMinAgo);

      set({ viewers: data || [] });
    } catch (err) {
      console.error("[collab] Refresh viewers error:", err);
    }
  },

  // ── Subscriptions ─────────────────────────────────────

  subscribeLockChanges: estimateId => {
    if (!supabase) return;
    const orgId = getOrgId();
    if (!orgId) return;
    const { userId } = getUserInfo();

    const { _lockChannel } = get();
    if (_lockChannel) {
      try {
        supabase.removeChannel(_lockChannel);
      } catch {
        /* non-critical */
      }
    }

    const channel = supabase
      .channel(`lock-${estimateId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "estimate_locks", filter: `estimate_id=eq.${estimateId}` },
        payload => {
          if (payload.eventType === "DELETE") {
            const wasOurLock = get().isLockHolder;
            set({ currentLock: null, isLockHolder: false });
          } else if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const row = payload.new;
            set({
              currentLock: {
                estimateId: row.estimate_id,
                lockedBy: row.locked_by,
                lockedByName: row.locked_by_name,
                lockedByColor: row.locked_by_color,
                expiresAt: row.expires_at,
                acquiredAt: row.acquired_at,
              },
              isLockHolder: row.locked_by === userId,
            });
          }
        },
      )
      .subscribe();

    set({ _lockChannel: channel });
  },

  subscribePresence: estimateId => {
    if (!supabase) return;
    const orgId = getOrgId();
    if (!orgId) return;

    const { _presenceChannel } = get();
    if (_presenceChannel) {
      try {
        supabase.removeChannel(_presenceChannel);
      } catch {
        /* non-critical */
      }
    }

    const channel = supabase
      .channel(`presence-${estimateId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "estimate_presence", filter: `estimate_id=eq.${estimateId}` },
        () => {
          get()._refreshViewers(estimateId);
        },
      )
      .subscribe();

    set({ _presenceChannel: channel });
  },

  // ── Cleanup ───────────────────────────────────────────

  cleanup: async () => {
    const { _lockChannel, _presenceChannel, _currentEstimateId, isLockHolder } = get();

    get()._stopHeartbeat();
    const { _presenceInterval } = get();
    if (_presenceInterval) {
      clearInterval(_presenceInterval);
    }

    const cleanupChannels = () => {
      if (_lockChannel) {
        try {
          supabase?.removeChannel(_lockChannel);
        } catch {
          /* non-critical */
        }
      }
      if (_presenceChannel) {
        try {
          supabase?.removeChannel(_presenceChannel);
        } catch {
          /* non-critical */
        }
      }
    };
    setTimeout(cleanupChannels, 100);

    if (isLockHolder && _currentEstimateId) {
      await get().releaseLock(_currentEstimateId);
    }

    if (_currentEstimateId) {
      await get().leaveEstimate(_currentEstimateId);
    }

    set({
      currentLock: null,
      isLockHolder: false,
      lockError: null,
      viewers: [],
      _lockChannel: null,
      _presenceChannel: null,
      _heartbeatInterval: null,
      _presenceInterval: null,
      _currentEstimateId: null,
    });
  },

  // ═══════════════════════════════════════════════════════════
  // REVIEWS DOMAIN (was reviewStore)
  // ═══════════════════════════════════════════════════════════

  reviews: [],

  createReview: review => {
    const id = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const entry = {
      id,
      type: review.type || "request",
      estimatorName: review.estimatorName || "",
      managerName: review.managerName || "",
      estimateIds: review.estimateIds || [],
      estimateNames: review.estimateNames || [],
      status: "pending",
      createdAt: new Date().toISOString(),
      briefing: null,
      notes: "",
      feedback: "",
    };
    set(s => ({ reviews: [entry, ...s.reviews] }));
    return id;
  },

  setBriefing: (reviewId, briefing) => {
    set(s => ({
      reviews: s.reviews.map(r => (r.id === reviewId ? { ...r, briefing } : r)),
    }));
  },

  updateStatus: (reviewId, status, feedback) => {
    set(s => ({
      reviews: s.reviews.map(r =>
        r.id === reviewId ? { ...r, status, ...(feedback !== undefined ? { feedback } : {}) } : r,
      ),
    }));
  },

  setNotes: (reviewId, notes) => {
    set(s => ({
      reviews: s.reviews.map(r => (r.id === reviewId ? { ...r, notes } : r)),
    }));
  },

  deleteReview: reviewId => {
    set(s => ({ reviews: s.reviews.filter(r => r.id !== reviewId) }));
  },

  getReviewsForEstimator: name => get().reviews.filter(r => r.estimatorName === name),
  getReviewsForManager: name => get().reviews.filter(r => r.managerName === name),
  getPendingReviews: () => get().reviews.filter(r => r.status === "pending" || r.status === "in_progress"),

  // ═══════════════════════════════════════════════════════════
  // CORRESPONDENCE DOMAIN (was correspondenceStore)
  // ═══════════════════════════════════════════════════════════

  correspondences: [],

  setCorrespondences: v => set({ correspondences: v }),

  addCorrespondence: (fields = {}) => {
    const c = {
      id: uid(),
      title: "",
      question: "",
      response: "",
      respondent: "",
      category: "clarification",
      status: "pending",
      dueDate: "",
      estimatedHours: 0,
      hoursLogged: 0,
      createdAt: new Date().toISOString(),
      answeredAt: "",
      ...fields,
    };
    set(s => ({ correspondences: [...s.correspondences, c] }));
    syncCorrespondenceToIndex();
    if (c.dueDate) {
      const estimateId = useEstimatesStore.getState().activeEstimateId;
      useCalendarStore.getState().addTask({
        title: `Correspondence: ${c.title || "Untitled"}`,
        date: c.dueDate,
        description: c.question || "",
        color: "#60A5FA",
        estimateId: estimateId || "",
        correspondenceId: c.id,
      });
    }
    return c;
  },

  updateCorrespondence: (id, updates) => {
    const prev = get().correspondences.find(c => c.id === id);
    set(s => ({
      correspondences: s.correspondences.map(c => (c.id === id ? { ...c, ...updates } : c)),
    }));
    syncCorrespondenceToIndex();
    if (updates.dueDate !== undefined && prev) {
      const tasks = useCalendarStore.getState().tasks;
      const linked = tasks.find(t => t.correspondenceId === id);
      if (linked) {
        useCalendarStore.getState().updateTask(linked.id, { date: updates.dueDate });
      } else if (updates.dueDate) {
        const estimateId = useEstimatesStore.getState().activeEstimateId;
        useCalendarStore.getState().addTask({
          title: `Correspondence: ${updates.title || prev.title || "Untitled"}`,
          date: updates.dueDate,
          description: updates.question || prev.question || "",
          color: "#60A5FA",
          estimateId: estimateId || "",
          correspondenceId: id,
        });
      }
    }
    if (updates.status === "answered" || updates.status === "closed") {
      const tasks = useCalendarStore.getState().tasks;
      const linked = tasks.find(t => t.correspondenceId === id);
      if (linked) {
        useCalendarStore.getState().updateTask(linked.id, { completed: true });
      }
    }
  },

  removeCorrespondence: id => {
    set(s => ({
      correspondences: s.correspondences.filter(c => c.id !== id),
    }));
    syncCorrespondenceToIndex();
    const tasks = useCalendarStore.getState().tasks;
    const linked = tasks.find(t => t.correspondenceId === id);
    if (linked) {
      useCalendarStore.getState().deleteTask(linked.id);
    }
  },

  // ═══════════════════════════════════════════════════════════
  // AUTO-RESPONSE DOMAIN (was autoResponseStore)
  // ═══════════════════════════════════════════════════════════

  triggerConfig: { ...DEFAULT_TRIGGER_CONFIG },
  drafts: [],

  setTriggerConfig: v => set({ triggerConfig: v }),
  setDrafts: v => set({ drafts: v }),

  updateTrigger: (type, updates) =>
    set(s => ({
      triggerConfig: {
        ...s.triggerConfig,
        [type]: { ...(s.triggerConfig[type] || {}), ...updates },
      },
    })),

  addDraft: draft =>
    set(s => ({
      drafts: [
        ...s.drafts,
        {
          id: uid(),
          status: "pending",
          createdAt: new Date().toISOString(),
          ...draft,
        },
      ],
    })),

  updateDraft: (id, updates) =>
    set(s => ({
      drafts: s.drafts.map(d => (d.id === id ? { ...d, ...updates } : d)),
    })),

  approveDraft: id =>
    set(s => ({
      drafts: s.drafts.map(d => (d.id === id ? { ...d, status: "approved" } : d)),
    })),

  dismissDraft: id =>
    set(s => ({
      drafts: s.drafts.map(d => (d.id === id ? { ...d, status: "dismissed" } : d)),
    })),

  markSent: (id, emailId) =>
    set(s => ({
      drafts: s.drafts.map(d =>
        d.id === id ? { ...d, status: "sent", sentAt: new Date().toISOString(), emailId } : d,
      ),
    })),

  removeDraft: id => set(s => ({ drafts: s.drafts.filter(d => d.id !== id) })),

  getPendingDrafts: () => get().drafts.filter(d => d.status === "pending"),
  getPendingCount: () => get().drafts.filter(d => d.status === "pending").length,

  hasDraft: (triggerType, invitationId) =>
    get().drafts.some(
      d =>
        d.triggerType === triggerType &&
        d.invitationId === invitationId &&
        (d.status === "pending" || d.status === "sent"),
    ),
}));

// ── Backward-compatible aliases ──
export const useReviewStore = useCollaborationStore;
export const useCorrespondenceStore = useCollaborationStore;
export const useAutoResponseStore = useCollaborationStore;
