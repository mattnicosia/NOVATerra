/**
 * useVersionCheck — Auto-detect stale deployments and prompt refresh
 *
 * Periodically fetches index.html and compares the main script hash
 * against what's currently loaded. If they differ, a new deployment
 * landed and the user should refresh to get the latest code.
 *
 * This prevents the "Steve is seeing old icons" problem where a user
 * keeps a tab open across multiple deployments.
 */

import { useEffect, useRef } from "react";
import { useUiStore } from "@/stores/uiStore";

const CHECK_INTERVAL_MS = 5 * 60_000; // check every 5 minutes
const INITIAL_DELAY_MS = 60_000; // wait 1 minute before first check

// Extract the main JS bundle hash from index.html content
function extractScriptHash(html) {
  // Vite produces: <script type="module" crossorigin src="/assets/index-DEkTwkxo.js">
  const match = html.match(/src="\/assets\/index-([a-zA-Z0-9_-]+)\.js"/);
  return match ? match[1] : null;
}

// Get the currently loaded script hash from the DOM
function getCurrentHash() {
  const scripts = document.querySelectorAll('script[type="module"][src*="/assets/index-"]');
  for (const s of scripts) {
    const match = s.src.match(/\/assets\/index-([a-zA-Z0-9_-]+)\.js/);
    if (match) return match[1];
  }
  return null;
}

export function useVersionCheck() {
  const prompted = useRef(false);

  useEffect(() => {
    const currentHash = getCurrentHash();
    if (!currentHash) return; // can't determine current version

    let timer = null;

    const check = async () => {
      if (prompted.current) return; // already prompted, stop checking
      try {
        const res = await fetch("/?_vc=" + Date.now(), {
          cache: "no-store",
          headers: { Accept: "text/html" },
        });
        if (!res.ok) return;
        const html = await res.text();
        const remoteHash = extractScriptHash(html);
        if (remoteHash && remoteHash !== currentHash) {
          prompted.current = true;
          console.log(`[version] New deploy detected: ${currentHash} → ${remoteHash}`);
          useUiStore.getState().showToast(
            "New version available — refreshing...",
            "info",
          );
          // Auto-refresh after a short delay so the toast is visible
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        }
      } catch {
        // Network error — skip this check
      }
    };

    // Initial check after delay, then periodic
    const initialTimer = setTimeout(() => {
      check();
      timer = setInterval(check, CHECK_INTERVAL_MS);
    }, INITIAL_DELAY_MS);

    return () => {
      clearTimeout(initialTimer);
      if (timer) clearInterval(timer);
    };
  }, []);
}
