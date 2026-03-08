import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { useAuthStore } from "@/stores/authStore";
import { useOrgStore, selectIsManager } from "@/stores/orgStore";

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

export const useCollaborationStore = create((set, get) => ({
  // ── State ─────────────────────────────────────────────
  currentLock: null, // { estimateId, lockedBy, lockedByName, lockedByColor, expiresAt, acquiredAt }
  isLockHolder: false,
  lockError: null,
  viewers: [], // [{ userId, userName, userColor, lastSeen }]
  _lockChannel: null,
  _presenceChannel: null,
  _heartbeatInterval: null,
  _presenceInterval: null,
  _currentEstimateId: null,

  // ── Lock Lifecycle ────────────────────────────────────

  acquireLock: async estimateId => {
    const orgId = getOrgId();
    if (!orgId || !supabase) return;

    const { userId, userName, userColor } = getUserInfo();
    if (!userId) return;

    try {
      // 1. Clean up expired locks
      await supabase
        .from("estimate_locks")
        .delete()
        .eq("estimate_id", estimateId)
        .eq("org_id", orgId)
        .lt("expires_at", new Date().toISOString());

      // 2. Try to insert lock
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
        // Conflict — someone else holds the lock
        if (error.code === "23505") {
          // Fetch existing lock
          const { data: existing } = await supabase
            .from("estimate_locks")
            .select("*")
            .eq("estimate_id", estimateId)
            .eq("org_id", orgId)
            .single();

          if (existing) {
            // Check if the lock is expired (race condition cleanup)
            if (new Date(existing.expires_at) < new Date()) {
              // Expired — delete and retry
              await supabase.from("estimate_locks").delete().eq("id", existing.id);
              return get().acquireLock(estimateId);
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

            // If we own it (same user, different tab), start heartbeat
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

      // Success — we hold the lock
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

    // Manager/owner can delete any lock
    const isManager = selectIsManager(useOrgStore.getState());
    if (!isManager) return;

    try {
      await supabase
        .from("estimate_locks")
        .delete()
        .eq("estimate_id", estimateId || get()._currentEstimateId)
        .eq("org_id", orgId);

      set({ currentLock: null, isLockHolder: false, lockError: null });

      // Try to acquire for ourselves
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

    // Upsert presence row
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

    // Fetch current viewers
    await get()._refreshViewers(estimateId);

    // Start presence heartbeat
    const presInterval = setInterval(async () => {
      if (!supabase) return;
      try {
        await supabase
          .from("estimate_presence")
          .update({ last_seen: new Date().toISOString() })
          .eq("estimate_id", estimateId)
          .eq("org_id", orgId)
          .eq("user_id", userId);
      } catch {}
    }, PRESENCE_HEARTBEAT_MS);

    set({ _presenceInterval: presInterval });
  },

  leaveEstimate: async estimateId => {
    const orgId = getOrgId();
    if (!orgId || !supabase) return;

    const { userId } = getUserInfo();
    const eid = estimateId || get()._currentEstimateId;

    // Stop presence heartbeat
    const { _presenceInterval } = get();
    if (_presenceInterval) {
      clearInterval(_presenceInterval);
      set({ _presenceInterval: null });
    }

    // Delete presence row
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

  _refreshViewers: async estimateId => {
    const orgId = getOrgId();
    if (!orgId || !supabase) return;

    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    try {
      const { data } = await supabase
        .from("estimate_presence")
        .select("user_id, user_name, user_color, last_seen")
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

    // Clean up existing channel
    const { _lockChannel } = get();
    if (_lockChannel) {
      try {
        supabase.removeChannel(_lockChannel);
      } catch {}
    }

    const channel = supabase
      .channel(`lock-${estimateId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "estimate_locks", filter: `estimate_id=eq.${estimateId}` },
        payload => {
          if (payload.eventType === "DELETE") {
            // Lock was released — if we're not the holder, we can try to acquire
            const wasOurLock = get().isLockHolder;
            set({ currentLock: null, isLockHolder: false });
            if (!wasOurLock) {
              // Optionally auto-acquire (or just notify)
              // For now, just clear the lock state — user sees "Available" and can click to edit
            }
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
      } catch {}
    }

    const channel = supabase
      .channel(`presence-${estimateId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "estimate_presence", filter: `estimate_id=eq.${estimateId}` },
        () => {
          // Refresh viewers on any change
          get()._refreshViewers(estimateId);
        },
      )
      .subscribe();

    set({ _presenceChannel: channel });
  },

  // ── Cleanup ───────────────────────────────────────────

  cleanup: async () => {
    const { _lockChannel, _presenceChannel, _currentEstimateId, isLockHolder } = get();

    // Stop heartbeats
    get()._stopHeartbeat();
    const { _presenceInterval } = get();
    if (_presenceInterval) {
      clearInterval(_presenceInterval);
    }

    // Unsubscribe channels
    if (_lockChannel) {
      try {
        supabase?.removeChannel(_lockChannel);
      } catch {}
    }
    if (_presenceChannel) {
      try {
        supabase?.removeChannel(_presenceChannel);
      } catch {}
    }

    // Release lock if we hold it
    if (isLockHolder && _currentEstimateId) {
      await get().releaseLock(_currentEstimateId);
    }

    // Leave presence
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
}));
