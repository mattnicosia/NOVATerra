import React, { Component } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { inject as injectAnalytics } from "@vercel/analytics";
import App from "./App";
import "./App.css";

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

// ── Core Web Vitals (LCP, FID, CLS, TTFB, INP → analytics) ──
import("@/utils/webVitals").then(m => m.reportWebVitals()).catch(() => {});

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
            } catch {}
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
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
