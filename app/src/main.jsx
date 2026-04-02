import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { inject as injectAnalytics } from "@vercel/analytics";
import App from "./App";
import "./App.css";

// ── Sentry error tracking ──────────────────────────────────────
// DSN is set via VITE_SENTRY_DSN env var. If missing, Sentry is a no-op.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE, // "development" or "production"
    release: `nova@${import.meta.env.VITE_APP_VERSION || "0.1.0"}`,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
    ],
    tracesSampleRate: import.meta.env.MODE === "production" ? 0.2 : 1.0,
    replaysSessionSampleRate: 0.1, // Record 10% of normal sessions for health monitoring
    replaysOnErrorSampleRate: 1.0, // Always record error sessions
    // Tag all events with build timestamp for version tracking
    initialScope: {
      tags: {
        // eslint-disable-next-line no-undef
        build: typeof __BUILD_TS__ !== "undefined" ? __BUILD_TS__ : "dev",
        device_type: window.innerWidth >= 1024 ? "desktop" : window.innerWidth >= 700 ? "tablet" : "mobile",
        screen_width: String(window.innerWidth),
      },
    },
    beforeSend(event) {
      // Enrich events with NOVA category tags from breadcrumbs
      const novaBreadcrumbs = (event.breadcrumbs || []).filter(b => b.category?.startsWith("data:") || b.category?.startsWith("estimate:") || b.category?.startsWith("ocr:"));
      if (novaBreadcrumbs.length > 0) {
        event.tags = event.tags || {};
        event.tags["nova.last_category"] = novaBreadcrumbs[novaBreadcrumbs.length - 1].category;
      }
      return event;
    },
  });
}

// ── Build version — log at boot for debugging cache issues ────
// Vite `define` replaces bare identifiers (not string literals)
// eslint-disable-next-line no-undef
console.log("[NOVA] Build:", __BUILD_TS__);
window.__NOVA_BUILD = __BUILD_TS__; // eslint-disable-line no-undef

// ── Auto-reload on stale chunk errors (after new deployments) ──
// When Vercel deploys a new build, old chunk hashes become 404s.
// Catch the dynamic import error and reload once to get fresh chunks.
window.addEventListener("unhandledrejection", e => {
  const msg = e?.reason?.message || "";
  if (msg.includes("Failed to fetch dynamically imported module") || msg.includes("Importing a module script failed")) {
    // Only reload once per session to prevent infinite loops
    if (!sessionStorage.getItem("nova-chunk-reload")) {
      sessionStorage.setItem("nova-chunk-reload", "1");
      window.location.reload();
    }
  }
});

// ── Vercel Analytics (free Web Vitals + page views) ────────────
injectAnalytics();

// ── Core Web Vitals (LCP, FID, CLS, TTFB, INP → analytics + Sentry) ──
import("@/utils/webVitals").then(m => m.reportWebVitals()).catch(() => {});

// ── Render ─────────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Sentry.ErrorBoundary
        fallback={({ error, resetError }) => (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100vh",
              padding: 40,
              fontFamily: "Switzer, sans-serif",
              color: "#fff",
              background: "#0a0a1a",
            }}
          >
            <h1 style={{ fontSize: 24, marginBottom: 12 }}>Something went wrong</h1>
            <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 24, maxWidth: 500, textAlign: "center" }}>
              {error?.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={resetError}
              style={{
                padding: "10px 24px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                cursor: "pointer",
                fontSize: 14,
                fontFamily: "Switzer, sans-serif",
              }}
            >
              Try Again
            </button>
          </div>
        )}
      >
        <App />
      </Sentry.ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
