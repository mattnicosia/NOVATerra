// ============================================================
// NOVA Core — Admin Billing Page
// /admin/billing — Trial status, subscription management, usage
// Data from GET /api/nova-core/billing/usage?org_id=[orgId]
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { card } from "@/utils/styles";

const DEFAULT_ORG = "0eb6aec0-2f8b-4061-ad75-0b1c9ff09ef1";
const DAILY_LIMIT = 10_000;
const MONTHLY_LIMIT = 300_000;

async function billingFetch(path, options = {}) {
  const res = await fetch(`/api/nova-core/billing${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Badge colors ──
const STATUS_COLORS = {
  DEMO: { bg: "#2D1B69", text: "#A78BFA" },
  ACTIVE: { bg: "#052E16", text: "#22C55E" },
  TRIAL: { bg: "#3D2E00", text: "#F59E0B" },
  EXPIRED: { bg: "#3B1111", text: "#EF4444" },
};

function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.TRIAL;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "6px 16px",
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 700,
        background: colors.bg,
        color: colors.text,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {status}
    </span>
  );
}

function SkeletonBlock({ width = "100%", height = 20 }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 6,
        background: "rgba(255,255,255,0.05)",
        animation: "skPulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function AdminBillingPage() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const orgId = DEFAULT_ORG;

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await billingFetch(`/usage?org_id=${orgId}`);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const result = await billingFetch("/create-checkout", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId }),
      });
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (err) {
      alert("Checkout failed: " + err.message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const result = await billingFetch("/portal-session", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId }),
      });
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err) {
      alert("Portal failed: " + err.message);
    } finally {
      setPortalLoading(false);
    }
  };

  // Derived state
  const is_demo = data?.is_demo ?? false;
  const is_paying = data?.is_paying ?? false;
  const trial_expired = data?.trial_expired ?? false;
  const days_remaining = data?.days_remaining_in_trial ?? 0;
  const api_calls_today = data?.api_calls_today ?? 0;
  const api_calls_month = data?.api_calls_month ?? 0;
  const overage = data?.overage_calls_this_month ?? 0;
  const mrr = data?.mrr_dollars ?? 0;
  const period_end = data?.current_period_end;

  const planStatus = is_demo
    ? "DEMO"
    : is_paying
      ? "ACTIVE"
      : trial_expired
        ? "EXPIRED"
        : "TRIAL";

  const cellStyle = {
    padding: "10px 14px",
    fontSize: 13,
    color: C.text,
    borderBottom: `1px solid ${C.border}`,
  };

  // ── Usage bar helper ──
  function usageColor(pct) {
    if (pct >= 80) return "#EF4444";
    if (pct >= 50) return "#F59E0B";
    return "#22C55E";
  }

  if (error && !data) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>Billing</h1>
        <div style={{ ...card(C), color: "#F87171", padding: 20 }}>Failed to load: {error}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, position: "relative" }}>
      {/* Page header */}
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>Billing</h1>

      {/* ════════════════════════════════════════════════════════ */}
      {/* SECTION 1 — Status Banner                              */}
      {/* ════════════════════════════════════════════════════════ */}
      {loading ? (
        <SkeletonBlock height={48} />
      ) : trial_expired && !is_paying && !is_demo ? (
        <div
          style={{
            padding: "14px 20px",
            borderRadius: T.radius.sm,
            background: "linear-gradient(135deg, #7F1D1D, #92400E)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <span style={{ fontSize: 14, color: "#FECACA", fontWeight: 600 }}>
            Your trial has ended. Subscribe to continue using NOVA Core.
          </span>
          <button
            onClick={handleCheckout}
            disabled={checkoutLoading}
            style={{
              padding: "8px 20px",
              borderRadius: T.radius.sm,
              border: "none",
              background: "#fff",
              color: "#7F1D1D",
              fontSize: 13,
              fontWeight: 700,
              cursor: checkoutLoading ? "not-allowed" : "pointer",
              fontFamily: T.font.sans,
              whiteSpace: "nowrap",
            }}
          >
            {checkoutLoading ? "Loading…" : "Subscribe now →"}
          </button>
        </div>
      ) : !is_paying && !is_demo && days_remaining <= 7 ? (
        <div
          style={{
            padding: "14px 20px",
            borderRadius: T.radius.sm,
            background: "#3D2E00",
            border: "1px solid #78550A",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <span style={{ fontSize: 14, color: "#F59E0B", fontWeight: 600 }}>
            {days_remaining} day{days_remaining !== 1 ? "s" : ""} left in your trial
          </span>
          <button
            onClick={handleCheckout}
            disabled={checkoutLoading}
            style={{
              padding: "8px 20px",
              borderRadius: T.radius.sm,
              border: "none",
              background: "#F59E0B",
              color: "#1A1A18",
              fontSize: 13,
              fontWeight: 700,
              cursor: checkoutLoading ? "not-allowed" : "pointer",
              fontFamily: T.font.sans,
              whiteSpace: "nowrap",
            }}
          >
            {checkoutLoading ? "Loading…" : "Subscribe now →"}
          </button>
        </div>
      ) : is_demo ? (
        <div
          style={{
            padding: "14px 20px",
            borderRadius: T.radius.sm,
            background: "#052E16",
            border: "1px solid #166534",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 14, color: "#22C55E", fontWeight: 600 }}>
            Demo account — full access, no billing required
          </span>
        </div>
      ) : null}

      {/* ════════════════════════════════════════════════════════ */}
      {/* SECTION 2 — Current Plan Card                          */}
      {/* ════════════════════════════════════════════════════════ */}
      {loading ? (
        <div style={{ ...card(C), padding: 28 }}>
          <div style={{ display: "flex", gap: 24, flexDirection: "column" }}>
            <SkeletonBlock width={120} height={32} />
            <SkeletonBlock width={200} height={16} />
            <SkeletonBlock width={160} height={16} />
          </div>
        </div>
      ) : (
        <div
          style={{
            ...card(C),
            padding: 28,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 32,
            flexWrap: "wrap",
          }}
        >
          {/* Left side */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 200 }}>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: C.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: 8,
                }}
              >
                Plan Status
              </div>
              <StatusBadge status={planStatus} />
            </div>

            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: C.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: 4,
                }}
              >
                Seats
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>1 seat</div>
            </div>

            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: C.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: 4,
                }}
              >
                MRR
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>
                ${mrr.toLocaleString()}/mo
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: C.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: 4,
                }}
              >
                Billing Period
              </div>
              <div style={{ fontSize: 14, color: C.text }}>
                {is_paying && period_end
                  ? `Renews ${new Date(period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                  : !is_paying && !is_demo && !trial_expired
                    ? `Trial ends in ${days_remaining} day${days_remaining !== 1 ? "s" : ""}`
                    : "—"}
              </div>
            </div>
          </div>

          {/* Right side */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 12,
              minWidth: 200,
            }}
          >
            {!is_paying && !is_demo && (
              <>
                <button
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                  style={{
                    padding: "12px 28px",
                    borderRadius: T.radius.sm,
                    border: "none",
                    background: checkoutLoading ? C.border : C.accent,
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: checkoutLoading ? "not-allowed" : "pointer",
                    fontFamily: T.font.sans,
                  }}
                >
                  {checkoutLoading ? "Loading…" : "Start subscription"}
                </button>
                <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 500 }}>
                  $299 / user / month
                </div>
                {!trial_expired && (
                  <div style={{ fontSize: 12, color: C.textDim }}>
                    No credit card required during trial
                  </div>
                )}
              </>
            )}

            {is_paying && (
              <>
                <button
                  onClick={handlePortal}
                  disabled={portalLoading}
                  style={{
                    padding: "10px 22px",
                    borderRadius: T.radius.sm,
                    border: `1px solid ${C.border}`,
                    background: "transparent",
                    color: C.text,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: portalLoading ? "not-allowed" : "pointer",
                    fontFamily: T.font.sans,
                  }}
                >
                  {portalLoading ? "Loading…" : "Manage billing"}
                </button>
                <button
                  onClick={handlePortal}
                  style={{
                    background: "none",
                    border: "none",
                    color: C.textMuted,
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: T.font.sans,
                    textDecoration: "underline",
                    padding: 0,
                  }}
                >
                  Cancel subscription
                </button>
              </>
            )}

            {is_demo && (
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#A78BFA",
                  padding: "8px 16px",
                  borderRadius: T.radius.sm,
                  background: "#2D1B69",
                }}
              >
                Demo account
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* SECTION 3 — Usage Bars                                 */}
      {/* ════════════════════════════════════════════════════════ */}
      {loading ? (
        <div style={{ ...card(C), padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          <SkeletonBlock height={16} />
          <SkeletonBlock height={12} />
          <SkeletonBlock height={16} />
          <SkeletonBlock height={12} />
        </div>
      ) : (
        <div style={{ ...card(C), padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Usage</h2>

          {/* Daily usage */}
          <UsageBar
            label="API calls today"
            current={api_calls_today}
            max={DAILY_LIMIT}
            C={C}
            T={T}
            colorFn={usageColor}
          />

          {/* Monthly usage */}
          <UsageBar
            label="API calls this month"
            current={api_calls_month}
            max={MONTHLY_LIMIT}
            C={C}
            T={T}
            colorFn={usageColor}
          />

          {overage > 0 && (
            <div
              style={{
                fontSize: 12,
                color: "#F59E0B",
                padding: "8px 12px",
                borderRadius: T.radius.sm,
                background: "#3D2E00",
                border: "1px solid #78550A",
              }}
            >
              {overage.toLocaleString()} calls exceeded daily limit this month
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* SECTION 4 — Quick Actions                              */}
      {/* ════════════════════════════════════════════════════════ */}
      {loading ? (
        <SkeletonBlock height={48} />
      ) : (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "View Intelligence Dashboard", to: "/admin/intelligence" },
            { label: "Manage API Keys", to: "/admin/orgs" },
            { label: "Upload a Proposal", to: "/admin/upload" },
            { label: "View Bid Leveling", to: "/admin/bid-leveling" },
          ].map((action) => (
            <button
              key={action.to}
              onClick={() => navigate(action.to)}
              style={{
                padding: "10px 18px",
                borderRadius: T.radius.sm,
                border: `1px solid ${C.border}`,
                background: "transparent",
                color: C.text,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: T.font.sans,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `${C.accent}15`;
                e.currentTarget.style.borderColor = C.accent;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = C.border;
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* PAYWALL OVERLAY                                        */}
      {/* ════════════════════════════════════════════════════════ */}
      {!loading && trial_expired && !is_paying && !is_demo && (
        <div
          style={{
            position: "absolute",
            top: 60,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(13,13,12,0.85)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: T.radius.md || 12,
            zIndex: 10,
          }}
        >
          <div
            style={{
              ...card(C),
              padding: 40,
              maxWidth: 420,
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              border: `1px solid ${C.border}`,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
              Trial ended{" "}
              {days_remaining < 0
                ? `${Math.abs(days_remaining)} day${Math.abs(days_remaining) !== 1 ? "s" : ""} ago`
                : ""}
            </div>
            <div style={{ fontSize: 14, color: C.textMuted }}>
              $299 / user / month — full access to NOVA Core
            </div>
            <button
              onClick={handleCheckout}
              disabled={checkoutLoading}
              style={{
                padding: "14px 36px",
                borderRadius: T.radius.sm,
                border: "none",
                background: checkoutLoading ? C.border : C.accent,
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: checkoutLoading ? "not-allowed" : "pointer",
                fontFamily: T.font.sans,
                marginTop: 8,
              }}
            >
              {checkoutLoading ? "Loading…" : "Subscribe now"}
            </button>
          </div>
        </div>
      )}

      {/* Keyframe for skeleton pulse */}
      <style>{`
        @keyframes skPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Usage Bar Component
// ══════════════════════════════════════════════════════════════
function UsageBar({ label, current, max, C, T, colorFn }) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const barColor = colorFn(pct);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 13, color: C.textMuted, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, color: C.text, fontFamily: "monospace" }}>
          {current.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: 8,
          borderRadius: 4,
          background: "rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 4,
            background: barColor,
            transition: "width 0.6s ease-out",
          }}
        />
      </div>
    </div>
  );
}
