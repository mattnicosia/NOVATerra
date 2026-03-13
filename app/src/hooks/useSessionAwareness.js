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

// ── Session enforcement: check if this tab's token matches the DB ──
async function checkSessionValid(userId) {
  if (!supabase || !userId) return true;
  const localToken = sessionStorage.getItem("bldg-session-token");
  if (!localToken) return true; // No token yet (first load, table doesn't exist)

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
    if (!data) return true; // No row = no enforcement

    // If DB token doesn't match ours, another device took over
    return data.session_token === localToken;
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

    // ── 2. ENFORCEMENT: Poll DB every 30s to verify this session is still active ──
    const kickSession = () => {
      if (kickedRef.current) return;
      kickedRef.current = true;
      console.warn("[sessionAwareness] Session superseded by another device — signing out");
      // Show alert so user knows why they were signed out
      setTimeout(() => {
        alert("You've been signed out because your account was accessed from another device.");
      }, 100);
      useAuthStore.getState().signOut();
    };

    const runCheck = async () => {
      const valid = await checkSessionValid(userId);
      if (!valid) kickSession();
    };

    // Poll every 30 seconds
    intervalRef.current = setInterval(runCheck, 30000);

    // Also check immediately when tab regains focus
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        runCheck();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // ── Cleanup ──
    return () => {
      // Stop polling
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVisibility);

      // Clear presence
      useUiStore.getState().setOtherSessions([]);

      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) {
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
