/**
 * useSessionAwareness — Multi-device session indicator via Supabase Presence
 *
 * Shows when the same account is open on other devices/tabs (informational only).
 * Uses Supabase Realtime Presence channels — no database tables needed.
 *
 * Each tab joins a user-scoped presence channel with its own tabId.
 * On presence sync, other tabs' device info is surfaced in uiStore.otherSessions.
 */

import { useEffect, useRef } from "react";
import { supabase } from "@/utils/supabase";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";

// Generate a unique tab ID (persists across re-renders, lost on tab close)
function getTabId() {
  let id = sessionStorage.getItem("bldg-tab-id");
  if (!id) {
    id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem("bldg-tab-id", id);
  }
  return id;
}

// Detect device and browser from user agent
function getDeviceInfo() {
  const ua = navigator.userAgent;
  const device = ua.includes("Mac") ? "Mac"
    : ua.includes("Windows") ? "Windows"
    : ua.includes("Linux") ? "Linux"
    : ua.includes("iPhone") || ua.includes("iPad") ? "iOS"
    : ua.includes("Android") ? "Android"
    : "Device";
  const browser = ua.includes("Edg/") ? "Edge"
    : ua.includes("Chrome") ? "Chrome"
    : ua.includes("Firefox") ? "Firefox"
    : ua.includes("Safari") ? "Safari"
    : "Browser";
  return { device, browser };
}

export function useSessionAwareness() {
  const user = useAuthStore(s => s.user);
  const channelRef = useRef(null);

  useEffect(() => {
    if (!supabase || !user) return;

    const userId = user.id;
    const tabId = getTabId();
    const { device, browser } = getDeviceInfo();

    const channel = supabase.channel(`user-session-${userId}`, {
      config: { presence: { key: tabId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();

        // Collect all sessions except our own tab
        const others = [];
        for (const [key, entries] of Object.entries(state)) {
          if (key === tabId) continue;
          if (Array.isArray(entries) && entries.length > 0) {
            others.push({
              device: entries[0].device || "Device",
              browser: entries[0].browser || "Browser",
              lastSeen: entries[0].lastSeen || new Date().toISOString(),
            });
          }
        }

        useUiStore.getState().setOtherSessions(others);
      })
      .subscribe(async status => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            device,
            browser,
            lastSeen: new Date().toISOString(),
          });
          console.log("[sessionAwareness] Presence channel joined");
        }
      });

    channelRef.current = channel;

    return () => {
      // Clear other sessions on unmount
      useUiStore.getState().setOtherSessions([]);

      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) {
        // Untrack first, then remove channel
        ch.untrack().then(() => {
          setTimeout(() => {
            try { supabase?.removeChannel(ch); } catch {}
          }, 100);
        }).catch(() => {
          setTimeout(() => {
            try { supabase?.removeChannel(ch); } catch {}
          }, 100);
        });
      }
    };
  }, [user]);
}
