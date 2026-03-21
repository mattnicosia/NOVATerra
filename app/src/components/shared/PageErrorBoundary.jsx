import { Component } from "react";

/**
 * Page-level error boundary — catches render errors within a page
 * without crashing the entire app. Shows inline recovery UI.
 *
 * Usage:
 *   <PageErrorBoundary pageName="Takeoffs">
 *     <TakeoffsPage />
 *   </PageErrorBoundary>
 *
 * Resets automatically when children change (e.g., route navigation).
 */
export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    const page = this.props.pageName || "Unknown";
    console.error(`[PageErrorBoundary:${page}]`, error, errorInfo);
    // Report to Sentry if available
    if (typeof window !== "undefined" && window.__SENTRY__) {
      try {
        const Sentry = window.__SENTRY__.hub || window.Sentry;
        if (Sentry?.captureException) {
          Sentry.captureException(error, { extra: { page, componentStack: errorInfo?.componentStack } });
        }
      } catch {
        // Sentry not available, silently continue
      }
    }
  }

  componentDidUpdate(prevProps) {
    // Reset error state when children change (e.g., navigating to a different page)
    // Also reset when resetKey changes (used by router to clear errors on navigation)
    if (this.state.hasError && (
      prevProps.children !== this.props.children ||
      (this.props.resetKey !== undefined && prevProps.resetKey !== this.props.resetKey)
    )) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleDashboard = () => {
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const page = this.props.pageName || "This page";
    const isDev = import.meta.env.DEV;

    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
          minHeight: 300,
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            textAlign: "center",
            padding: 32,
            borderRadius: 12,
            background: "rgba(248,113,113,0.04)",
            border: "1px solid rgba(248,113,113,0.15)",
          }}
        >
          {/* Warning icon */}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 11,
              background: "rgba(248,113,113,0.1)",
              border: "1px solid rgba(248,113,113,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <svg
              width={22}
              height={22}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#F87171"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <h3
            style={{
              fontSize: 15,
              fontWeight: 700,
              margin: "0 0 6px",
              color: "rgba(238,237,245,0.85)",
            }}
          >
            {page} encountered an error
          </h3>

          <p
            style={{
              fontSize: 12,
              color: "rgba(238,237,245,0.4)",
              margin: "0 0 20px",
              lineHeight: 1.6,
            }}
          >
            Your data is safe. Try again or return to the dashboard.
          </p>

          {isDev && this.state.error && (
            <div
              style={{
                textAlign: "left",
                marginBottom: 16,
                padding: 10,
                borderRadius: 6,
                background: "rgba(248,113,113,0.06)",
                border: "1px solid rgba(248,113,113,0.1)",
                fontSize: 10,
                color: "#F87171",
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 100,
                overflow: "auto",
              }}
            >
              {this.state.error.message || String(this.state.error)}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={this.handleRetry}
              style={{
                padding: "8px 20px",
                borderRadius: 6,
                background: "linear-gradient(135deg, #7C5CFC, #6D28D9)",
                border: "none",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              Try Again
            </button>
            <button
              onClick={this.handleDashboard}
              style={{
                padding: "8px 20px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(238,237,245,0.6)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
            >
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
