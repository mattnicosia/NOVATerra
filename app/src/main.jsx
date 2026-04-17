import React, { Component } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { inject as injectAnalytics } from "@vercel/analytics";
import * as Sentry from "@sentry/react";
import { validateClientEnv } from "@/utils/validateEnv";
import App from "./App";
import "./App.css";

// ── Build version — log at boot for debugging cache issues ────
// Vite `define` replaces bare identifiers (not string literals)
// eslint-disable-next-line no-undef
console.log("[NOVA] Build:", __BUILD_TS__);
window.__NOVA_BUILD = __BUILD_TS__; // eslint-disable-line no-undef

// ── Env validation — fail loud at boot, not at first API call ──
let envError = null;
try {
  validateClientEnv();
} catch (err) {
  envError = err;
  console.error("[NOVA]", err.message);
}

// ── Sentry — production error tracking ────────────────────────
// DSN must be set in Vercel env as VITE_SENTRY_DSN. Skipped silently in dev.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
if (SENTRY_DSN && import.meta.env.PROD) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: typeof __BUILD_TS__ !== "undefined" ? String(__BUILD_TS__) : undefined, // eslint-disable-line no-undef
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    // Low sample rate — session replay captures estimate + pricing data which is PII-adjacent.
    // Bump this opt-in later via a feature flag if you need replays for specific debug scenarios.
    replaysOnErrorSampleRate: 0.1,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    beforeSend(event) {
      // Drop noise: chunk-load errors are handled by the auto-reload below
      const msg = event.exception?.values?.[0]?.value || "";
      if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)) return null;
      return event;
    },
  });
}

// ── Dev-only: expose stores for AI estimator simulation ──────
if (import.meta.env.DEV) {
  import("@/stores/authStore").then(m => { window.__NOVA_STORES = window.__NOVA_STORES || {}; window.__NOVA_STORES.auth = m.useAuthStore; });
  import("@/stores/estimatesStore").then(m => { window.__NOVA_STORES = window.__NOVA_STORES || {}; window.__NOVA_STORES.estimates = m.useEstimatesStore; });
  import("@/stores/itemsStore").then(m => { window.__NOVA_STORES = window.__NOVA_STORES || {}; window.__NOVA_STORES.items = m.useItemsStore; });
  import("@/stores/projectStore").then(m => { window.__NOVA_STORES = window.__NOVA_STORES || {}; window.__NOVA_STORES.project = m.useProjectStore; });
  import("@/stores/uiStore").then(m => { window.__NOVA_STORES = window.__NOVA_STORES || {}; window.__NOVA_STORES.ui = m.useUiStore; });
  import("@/stores/drawingPipelineStore").then(m => { window.__NOVA_STORES = window.__NOVA_STORES || {}; window.__NOVA_STORES.drawings = m.useDrawingPipelineStore; });
}

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

// ── Core Web Vitals (LCP, FID, CLS, TTFB, INP → analytics) ──
import("@/utils/webVitals").then(m => m.reportWebVitals()).catch(() => {});

// ── History indexer — loaded eagerly so window.__novaBackfillHistory is available from console ──
import("@/utils/historyIndexer").catch(() => {});
// ── Spec indexer — loaded eagerly so window.__novaIndexSpec / __novaListSpecs / __novaRemoveSpec are available ──
import("@/utils/specIndexer").catch(() => {});

// ── Root Error Boundary ───────────────────────────────────────
class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("[RootErrorBoundary]", error, errorInfo);
    // Forward to Sentry with React component stack as context
    Sentry.withScope(scope => {
      scope.setTag("boundary", "root");
      scope.setExtra("componentStack", errorInfo?.componentStack);
      Sentry.captureException(error);
    });
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    const error = this.state.error;
    return (
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
          onClick={() => this.setState({ hasError: false, error: null })}
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
        <button
          onClick={() => {
            // Nuclear reset: clear caches and reload
            try {
              localStorage.removeItem("bldg-session-token");
              sessionStorage.clear();
              if (window.caches) caches.keys().then(names => names.forEach(n => caches.delete(n)));
            } catch {
              // Reset should continue even if cache/storage access is unavailable.
            }
            window.location.href = "/";
          }}
          style={{
            padding: "10px 24px",
            borderRadius: 8,
            border: "1px solid rgba(255,100,100,0.3)",
            background: "rgba(255,100,100,0.1)",
            color: "#ff8888",
            cursor: "pointer",
            fontSize: 13,
            fontFamily: "Switzer, sans-serif",
            marginTop: 12,
          }}
        >
          Hard Reset & Reload
        </button>
      </div>
    );
  }
}

// ── Render ─────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById("root"));

if (envError) {
  // Misconfigured deploy — show a hard error instead of rendering a broken app
  root.render(
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100vh", padding: 40, fontFamily: "Switzer, sans-serif",
      color: "#fff", background: "#0a0a1a", textAlign: "center",
    }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Configuration error</h1>
      <pre style={{ fontSize: 12, opacity: 0.8, maxWidth: 600, whiteSpace: "pre-wrap", textAlign: "left" }}>
        {envError.message}
      </pre>
    </div>,
  );
} else {
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <RootErrorBoundary>
          <App />
        </RootErrorBoundary>
      </BrowserRouter>
    </React.StrictMode>,
  );
}
