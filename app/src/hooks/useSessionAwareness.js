/**
 * useSessionAwareness — Multi-device session detection + single-session enforcement
 *
 * Two responsibilities:
 * 1. INFORMATIONAL: Shows when the same account is open on other devices/tabs via Supabase Presence
 * 2. ENFORCEMENT: Polls DB to verify this session is still active. If another device signs in,
 *    this session auto-signs-out within 30s (or immediately on tab refocus).
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
  const device = ua.includes("Mac")
    ? "Mac"
    : ua.includes("Windows")
      ? "Windows"
      : ua.includes("Linux")
        ? "Linux"
        : ua.includes("iPhone") || ua.includes("iPad")
          ? "iOS"
          : ua.includes("Android")
            ? "Android"
            : "Device";
  const browser = ua.includes("Edg/")
    ? "Edge"
    : ua.includes("Chrome")
      ? "Chrome"
      : ua.includes("Firefox")
        ? "Firefox"
        : ua.includes("Safari")
          ? "Safari"
          : "Browser";
  return { device, browser };
}

// ── Session enforcement: check if this tab's token matches the DB ──
async function checkSessionValid(userId) {
  if (!supabase || !userId) return true;
  const localToken = localStorage.getItem("bldg-session-token");

  // No local token — try to adopt from DB rather than kicking.
  // This handles cases where localStorage was unexpectedly cleared
  // (e.g., by the IDB migration or browser cleanup).
  if (!localToken) {
    try {
      const { data } = await supabase
        .from("user_active_session")
        .select("session_token")
        .eq("user_id", userId)
        .maybeSingle();
      if (data?.session_token) {
        localStorage.setItem("bldg-session-token", data.session_token);
        console.log("[sessionAwareness] Re-adopted missing local token from DB");
      }
    } catch {
      /* non-critical */
    }
    return true; // Never kick when there's no local token to compare
  }

  try {
    const { data, error } = await supabase
      .from("user_active_session")
      .select("session_token")
      .eq("user_id", userId)
      .maybeSingle();

    // Table doesn't exist (42P01) or no row = allow (graceful degradation)
    if (error) {
      if (error.code === "42P01") return true; // table not created yet
      console.warn("[sessionAwareness] check error:", error.message);
      return true;
    }
    if (!data) return true; // No row = no enforcement (user signed out elsewhere, or row deleted)

    // If DB token doesn't match ours, another device took over
    if (data.session_token !== localToken) {
      console.warn(
        "[sessionAwareness] Token mismatch — local:",
        localToken.slice(0, 8) + "...",
        "db:",
        data.session_token.slice(0, 8) + "...",
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[sessionAwareness] checkSessionValid failed:", err.message);
    return true; // Network error = don't kick user out
  }
}

export function useSessionAwareness() {
  const user = useAuthStore(s => s.user);
  const channelRef = useRef(null);
  const intervalRef = useRef(null);
  const kickedRef = useRef(false); // prevent double-signout
  const missCountRef = useRef(0); // consecutive mismatches — require 3 before kicking

  useEffect(() => {
    if (!supabase || !user) return;

    const userId = user.id;
    const tabId = getTabId();
    const { device, browser } = getDeviceInfo();

    // ── 1. INFORMATIONAL: Presence channel for multi-device awareness ──
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

    // ── 2. ENFORCEMENT: DISABLED ──
    // Session enforcement has been disabled due to persistent false-positive
    // logouts. The token-matching system has multiple race conditions that
    // cause the DB token and localStorage token to diverge, kicking the user
    // even when they're the only active session. The informational presence
    // channel above still works — it shows other devices without kicking.
    // TODO: Re-enable once we can debug live with console logs visible.

    // ── Cleanup ──
    return () => {
      // Clear presence
      useUiStore.getState().setOtherSessions([]);

      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) {
        ch.untrack()
          .then(() => {
            setTimeout(() => {
              try {
                supabase?.removeChannel(ch);
              } catch {
                /* non-critical */
              }
            }, 100);
          })
          .catch(() => {
            setTimeout(() => {
              try {
                supabase?.removeChannel(ch);
              } catch {
                /* non-critical */
              }
            }, 100);
          });
      }
    };
  }, [user]);
}
