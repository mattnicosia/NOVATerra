/**
 * useSessionAwareness — Multi-device session detection + single-session enforcement
 *
 * Two responsibilities:
 * 1. INFORMATIONAL: Shows when the same account is open on other devices/tabs via Supabase Presence
 * 2. ENFORCEMENT: Checks DB on tab focus to verify this session is still active.
 *    If another device signs in, this session shows a modal and auto-signs-out.
 */

import { useEffect, useRef, useCallback } from "react";
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

  // No local token — adopt from DB, don't kick
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
    return true;
  }

  try {
    const { data, error } = await supabase
      .from("user_active_session")
      .select("session_token, device, browser")
      .eq("user_id", userId)
      .maybeSingle();

    // Table doesn't exist or no row = allow
    if (error) {
      if (error.code === "42P01") return true;
      console.warn("[sessionAwareness] check error:", error.message);
      return true;
    }
    if (!data) return true;

    // If DB token doesn't match ours, another device took over
    if (data.session_token !== localToken) {
      console.warn(
        "[sessionAwareness] Token mismatch — kicked by",
        data.device, data.browser,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[sessionAwareness] checkSessionValid failed:", err.message);
    return true; // Network error = don't kick
  }
}

export function useSessionAwareness() {
  const user = useAuthStore(s => s.user);
  const channelRef = useRef(null);
  const kickedRef = useRef(false);
  const missCountRef = useRef(0);
  const bootTimeRef = useRef(Date.now());

  // ── Kick handler: show modal then sign out ──
  const handleKicked = useCallback(async () => {
    if (kickedRef.current) return;
    kickedRef.current = true;

    // Set the kicked flag in uiStore so App.jsx can show a modal
    useUiStore.getState().setSessionKicked(true);

    // Auto sign out after 5 seconds
    setTimeout(async () => {
      try {
        await useAuthStore.getState().signOut();
      } catch {
        // Force reload if signOut fails
        window.location.reload();
      }
    }, 5000);
  }, []);

  // ── Enforcement check ──
  const runCheck = useCallback(async () => {
    if (!user || kickedRef.current) return;
    // Don't check in the first 10 seconds after boot — adoption might not be complete
    if (Date.now() - bootTimeRef.current < 10000) return;

    const valid = await checkSessionValid(user.id);
    console.log("[sessionAwareness] Check result:", valid ? "VALID" : "MISMATCH");
    if (!valid) {
      handleKicked();
    }
  }, [user, handleKicked]);

  useEffect(() => {
    if (!supabase || !user) return;

    const userId = user.id;
    const tabId = getTabId();
    const { device, browser } = getDeviceInfo();
    bootTimeRef.current = Date.now();
    kickedRef.current = false;
    missCountRef.current = 0;

    // ── 1. INFORMATIONAL: Presence channel for multi-device awareness ──
    const channel = supabase.channel(`user-session-${userId}`, {
      config: { presence: { key: tabId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
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

    // ── 2. ENFORCEMENT: Check on tab focus + periodic poll ──
    // Tab focus: immediate check when user switches back to this tab
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runCheck();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Periodic poll every 15 seconds
    const pollInterval = setInterval(runCheck, 15000);

    // ── Cleanup ──
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(pollInterval);
      useUiStore.getState().setOtherSessions([]);

      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) {
        ch.untrack()
          .then(() => {
            setTimeout(() => {
              try { supabase?.removeChannel(ch); } catch { /* */ }
            }, 100);
          })
          .catch(() => {
            setTimeout(() => {
              try { supabase?.removeChannel(ch); } catch { /* */ }
            }, 100);
          });
      }
    };
  }, [user, runCheck]);
}
