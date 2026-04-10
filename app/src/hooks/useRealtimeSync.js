/**
 * useRealtimeSync — Live cross-device sync via Supabase Realtime
 *
 * Phase 1: Subscribes to postgres_changes on user_estimates + user_data.
 *          When another device pushes a change, this hook pulls and applies it locally.
 *
 * Phase 2: Force-pull on tab focus (visibilitychange).
 *          When the user returns to the tab, pull the active estimate if cloud is newer.
 *
 * Prerequisites:
 *   - Realtime replication enabled for user_estimates + user_data in Supabase Dashboard
 *   - Run: ALTER PUBLICATION supabase_realtime ADD TABLE public.user_estimates;
 *          ALTER PUBLICATION supabase_realtime ADD TABLE public.user_data;
 */

import { useEffect, useRef } from "react";
import { supabase } from "@/utils/supabase";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useOrgStore } from "@/stores/orgStore";
import * as cloudSync from "@/utils/cloudSync";
import { storage } from "@/utils/storage";
import { idbKey } from "@/utils/idbKey";

// Throttle timers for incoming changes (batch rapid updates)
const CHANGE_THROTTLE_MS = 500;

// Force-pull throttle (max once per 10s)
const FOCUS_PULL_THROTTLE_MS = 10_000;

// Reconnect delay on channel error
const RECONNECT_DELAY_MS = 5_000;

export function useRealtimeSync() {
  const user = useAuthStore(s => s.user);
  const persistenceLoaded = useUiStore(s => s.persistenceLoaded);
  const orgReady = useOrgStore(s => s.orgReady);

  const channelsRef = useRef([]);
  const throttleTimersRef = useRef(new Map()); // key -> timeout
  const lastFocusPullRef = useRef(0);
  const reconnectTimerRef = useRef(null);

  // ── Phase 1: Realtime channel subscriptions ──────────────────

  useEffect(() => {
    if (!supabase || !user || !persistenceLoaded || !orgReady) return;

    const userId = user.id;
    const org = useOrgStore.getState().org;
    const orgId = org?.id;

    // Build scope filter for Realtime
    // In org mode: filter by org_id. In solo mode: filter by user_id + org_id IS NULL.
    // Note: Supabase Realtime postgres_changes filter only supports eq, not is.null.
    // For solo mode, we filter client-side.
    const filterEstimates = orgId ? `org_id=eq.${orgId}` : `user_id=eq.${userId}`;
    const filterData = orgId ? `org_id=eq.${orgId}` : `user_id=eq.${userId}`;

    // ── Channel: user_estimates ──
    const estChannel = supabase
      .channel(`rt-estimates-${orgId || userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_estimates",
          filter: filterEstimates,
        },
        payload => {
          // Skip own writes — we already applied them locally
          if (payload.new?.updated_by === userId || payload.new?.user_id === userId) return;

          // Solo mode: skip rows with non-null org_id (belongs to a different scope)
          if (!orgId && payload.new?.org_id) return;

          const estimateId = payload.new?.estimate_id;
          if (!estimateId) return;

          // Throttle: batch rapid changes for the same estimate
          _throttledAction(`est-${estimateId}`, () => _handleEstimateChange(payload));
        },
      )
      .subscribe(status => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[realtimeSync] Estimates channel error — will reconnect");
          _scheduleReconnect();
        } else if (status === "SUBSCRIBED") {
          console.log("[realtimeSync] Estimates channel subscribed");
        }
      });

    // ── Channel: user_data ──
    const dataChannel = supabase
      .channel(`rt-data-${orgId || userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_data",
          filter: filterData,
        },
        payload => {
          if (payload.new?.user_id === userId) return;
          if (!orgId && payload.new?.org_id) return;

          const key = payload.new?.key;
          if (!key) return;

          _throttledAction(`data-${key}`, () => _handleDataChange(key));
        },
      )
      .subscribe(status => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[realtimeSync] Data channel error — will reconnect");
          _scheduleReconnect();
        } else if (status === "SUBSCRIBED") {
          console.log("[realtimeSync] Data channel subscribed");
        }
      });

    channelsRef.current = [estChannel, dataChannel];

    // ── Phase 2: Force-pull on tab focus ──────────────────────

    const handleVisibility = async () => {
      if (document.hidden) return;

      // Throttle: max once per 10s
      const now = Date.now();
      if (now - lastFocusPullRef.current < FOCUS_PULL_THROTTLE_MS) return;
      lastFocusPullRef.current = now;

      // Guard: don't pull if startup sync or auto-save is in progress
      const { cloudSyncInProgress } = useUiStore.getState();
      if (cloudSyncInProgress) return;

      // Check Realtime channel health — reconnect if closed
      for (const ch of channelsRef.current) {
        if (ch.state === "closed" || ch.state === "errored") {
          console.log("[realtimeSync] Channel unhealthy on focus — reconnecting");
          ch.subscribe();
        }
      }

      // Pull active estimate only (lightweight)
      const activeId = useEstimatesStore.getState().activeEstimateId;
      if (!activeId) return;

      try {
        const cloudEst = await cloudSync.pullEstimate(activeId);
        if (!cloudEst) return;

        // Compare timestamps — only apply if cloud is newer
        const localRecord = await cloudSync.readLocalEstimateRecord(activeId);
        const localTime = localRecord.data?._savedAt || null;
        const cloudTime = cloudEst._savedAt;

        if (cloudTime && (!localTime || new Date(cloudTime) > new Date(localTime))) {
          console.log(`[realtimeSync] Focus pull: cloud is newer for ${activeId} — applying`);
          await cloudSync.pullAndApplyEstimate(activeId);
        }
      } catch (err) {
        console.warn("[realtimeSync] Focus pull failed:", err.message);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    // ── Cleanup ──
    // Copy ref values before cleanup runs (React refs may change by cleanup time)
    const timers = throttleTimersRef.current;

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);

      // Clear throttle timers
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();

      // Clear reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      // Remove channels with slight delay (avoids "closed before connected" warnings)
      const channels = channelsRef.current;
      channelsRef.current = [];
      setTimeout(() => {
        for (const ch of channels) {
          try {
            supabase?.removeChannel(ch);
          } catch {
            /* channel cleanup non-critical */
          }
        }
      }, 100);
    };
  }, [user, persistenceLoaded, orgReady]);

  // ── Internal handlers ─────────────────────────────────────

  function _throttledAction(key, action) {
    const existing = throttleTimersRef.current.get(key);
    if (existing) clearTimeout(existing);
    throttleTimersRef.current.set(
      key,
      setTimeout(() => {
        throttleTimersRef.current.delete(key);
        action();
      }, CHANGE_THROTTLE_MS),
    );
  }

  function _scheduleReconnect() {
    if (reconnectTimerRef.current) return; // already scheduled
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      for (const ch of channelsRef.current) {
        if (ch.state === "closed" || ch.state === "errored") {
          console.log("[realtimeSync] Reconnecting channel:", ch.topic);
          ch.subscribe();
        }
      }
    }, RECONNECT_DELAY_MS);
  }
}

// ── Change handlers (outside hook for stable references) ──

async function _handleEstimateChange(payload) {
  const estimateId = payload.new?.estimate_id;
  if (!estimateId) return;

  // Soft-deleted estimate — remove from local index
  if (payload.new?.deleted_at) {
    console.log(`[realtimeSync] Estimate ${estimateId} deleted on another device`);
    const currentIndex = useEstimatesStore.getState().estimatesIndex;
    const filtered = currentIndex.filter(e => e.id !== estimateId);
    if (filtered.length !== currentIndex.length) {
      useEstimatesStore.setState({ estimatesIndex: filtered });
      // Also remove from IDB
      try {
        await storage.set(idbKey("bldg-index"), JSON.stringify(filtered));
        await storage.delete(idbKey(`bldg-est-${estimateId}`));
      } catch {
        /* IDB cleanup non-critical */
      }
    }
    return;
  }

  // New or updated estimate — pull full data and apply.
  // pullAndApplyEstimate() handles: timestamp guard (won't overwrite newer local),
  // IDB write, and _reloadActiveEstimate() with edit-recency guard.
  // Do NOT call loadEstimate() separately — it would re-read IDB that was just
  // written and call setItems() a second time, potentially with stale data.
  console.log(`[realtimeSync] Estimate ${estimateId} changed on another device — pulling`);
  const data = await cloudSync.pullAndApplyEstimate(estimateId);

  // If this is a new estimate not in our index, add it
  if (data) {
    const currentIndex = useEstimatesStore.getState().estimatesIndex;
    if (!currentIndex.some(e => e.id === estimateId)) {
      // Pull the updated index metadata from the estimate data
      const indexEntry = {
        id: estimateId,
        name: data.project?.projectName || "Untitled",
        updated_at: data._savedAt || new Date().toISOString(),
      };
      useEstimatesStore.getState().setEstimatesIndex(prev => [...prev, indexEntry]);
      // Update IDB index
      try {
        const updatedIndex = useEstimatesStore.getState().estimatesIndex;
        await storage.set(idbKey("bldg-index"), JSON.stringify(updatedIndex));
      } catch {
        /* IDB index update non-critical */
      }
    }
  }
}

async function _handleDataChange(key) {
  console.log(`[realtimeSync] Data key "${key}" changed on another device — pulling`);
  await cloudSync.pullAndApplyData(key);
}
