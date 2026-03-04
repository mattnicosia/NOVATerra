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
    release: `novaterra@${import.meta.env.VITE_APP_VERSION || "0.1.0"}`,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
    ],
    tracesSampleRate: import.meta.env.MODE === "production" ? 0.2 : 1.0,
    replaysSessionSampleRate: 0.0, // Don't record normal sessions
    replaysOnErrorSampleRate: 1.0, // Always record error sessions
  });
}

// ── Vercel Analytics (free Web Vitals + page views) ────────────
injectAnalytics();

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
              fontFamily: "DM Sans, sans-serif",
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
                fontFamily: "DM Sans, sans-serif",
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
