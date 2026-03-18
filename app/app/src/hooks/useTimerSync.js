/* global BroadcastChannel */
import { useEffect, useRef } from "react";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useActivityTimerStore } from "@/stores/activityTimerStore";

const CHANNEL_NAME = "bldg-timer";
const LS_KEY = "bldg-timer-sync"; // Fallback for browsers without BroadcastChannel

/**
 * useTimerSync — Cross-tab timer coordination.
 *
 * Problem: If an estimator has the same estimate open in multiple tabs,
 * all tabs would count time simultaneously (Proest bug). This hook ensures
 * only ONE tab is the active timer at any moment.
 *
 * Protocol:
 * - When a tab starts timing, it broadcasts CLAIM(tabId, estimateId)
 * - Other tabs receive this and pause their own timers
 * - When a tab hides/closes, it broadcasts RELEASE(tabId)
 * - Last tab to CLAIM wins (most recent focus = active timer)
 *
 * Uses BroadcastChannel API with localStorage `storage` event fallback for Safari.
 */
export function useTimerSync() {
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);
  const channelRef = useRef(null);
  const tabIdRef = useRef(null);

  useEffect(() => {
    // Generate a unique tab ID (persisted for this tab's lifetime via sessionStorage)
    if (!tabIdRef.current) {
      tabIdRef.current =
        sessionStorage.getItem("bldg-timer-tab-id") ||
        (() => {
          const id = crypto.randomUUID();
          sessionStorage.setItem("bldg-timer-tab-id", id);
          return id;
        })();
    }

    const tabId = tabIdRef.current;

    // ── Message handler — respond to other tabs' claims ──
    const handleMessage = data => {
      if (!data || data.tabId === tabId) return; // Ignore own messages

      if (data.type === "CLAIM") {
        // Another tab claimed timing rights — pause ours
        const store = useActivityTimerStore.getState();
        if (store.isRunning) {
          store.pauseSession();
        }
      }

      if (data.type === "RELEASE") {
        // Another tab released — we can resume if we have an active estimate and are paused
        const store = useActivityTimerStore.getState();
        const estId = useEstimatesStore.getState().activeEstimateId;
        if (estId && store.isPaused && !document.hidden) {
          store.resumeSession();
          broadcast({ type: "CLAIM", tabId, estimateId: estId });
        }
      }
    };

    // ── Set up BroadcastChannel (with localStorage fallback) ──
    let cleanup = () => {};

    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = channel;

      channel.onmessage = e => handleMessage(e.data);

      cleanup = () => {
        channel.close();
        channelRef.current = null;
      };
    } else {
      // Fallback: localStorage storage event (works cross-tab in Safari)
      const handleStorage = e => {
        if (e.key !== LS_KEY || !e.newValue) return;
        try {
          const data = JSON.parse(e.newValue);
          handleMessage(data);
        } catch {
          // ignore
        }
      };

      window.addEventListener("storage", handleStorage);
      cleanup = () => window.removeEventListener("storage", handleStorage);
    }

    // ── Claim timing rights when this tab has an active estimate ──
    if (activeEstimateId && !document.hidden) {
      broadcast({ type: "CLAIM", tabId, estimateId: activeEstimateId });
    }

    // ── Visibility change: claim/release on tab focus ──
    const handleVisibility = () => {
      const estId = useEstimatesStore.getState().activeEstimateId;
      if (!estId) return;

      if (document.hidden) {
        broadcast({ type: "RELEASE", tabId });
      } else {
        // Tab became visible — claim timing rights
        broadcast({ type: "CLAIM", tabId, estimateId: estId });
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    // ── Before unload: release ──
    const handleUnload = () => {
      broadcast({ type: "RELEASE", tabId });
    };

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      cleanup();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [activeEstimateId]);
}

/**
 * Broadcast a message to all other tabs.
 */
function broadcast(data) {
  // Try BroadcastChannel first
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(data);
      channel.close();
    } catch {
      // Fallback to localStorage
      broadcastViaStorage(data);
    }
  } else {
    broadcastViaStorage(data);
  }
}

function broadcastViaStorage(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...data, _ts: Date.now() }));
    // Remove immediately — the `storage` event fires on OTHER tabs when value changes
    // Removal won't trigger another event because it's the same tab
    setTimeout(() => localStorage.removeItem(LS_KEY), 100);
  } catch {
    // ignore
  }
}
