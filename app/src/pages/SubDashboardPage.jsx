import { useState, useEffect } from "react";

// Hardcoded NOVA dark theme (same pattern as PortalPage — outside auth gate)
const C = {
  bg: "#0D0F14",
  text: "#E5E5EA",
  textMuted: "#AEAEB2",
  textDim: "#8E8E93",
  border: "rgba(255,255,255,0.08)",
  accent: "#7C5CFC",
  red: "#FF453A",
  green: "#30D158",
  yellow: "#FFD60A",
  orange: "#FF9F0A",
};

const STATUS_MAP = {
  pending: { color: "#AEAEB2", label: "Pending" },
  sent: { color: "#64D2FF", label: "Invited" },
  opened: { color: "#FFD60A", label: "Viewed" },
  downloaded: { color: "#FF9F0A", label: "Downloaded" },
  submitted: { color: "#30D158", label: "Submitted" },
  parsed: { color: "#BF5AF2", label: "Submitted" },
  awarded: { color: "#30D158", label: "Awarded" },
  not_awarded: { color: "#8E8E93", label: "Not Selected" },
};

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`;
}

function dueIn(dateStr) {
  if (!dateStr) return null;
  const due = new Date(dateStr + "T23:59:59");
  const now = new Date();
  const diffMs = due - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0)
    return { text: `${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? "s" : ""} overdue`, overdue: true };
  if (diffDays === 0) return { text: "Due today", overdue: false };
  if (diffDays === 1) return { text: "Due tomorrow", overdue: false };
  return { text: `Due in ${diffDays} days`, overdue: false };
}

export default function SubDashboardPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dashData, setDashData] = useState(null);
  const [error, setError] = useState(null);

  // Auto-load if token in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) loadDashboard(token);
  }, []);

  const handleRequestLink = async () => {
    if (!email.includes("@")) return;
    setLoading(true);
    try {
      await fetch("/api/sub-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {
      setError("Failed to send link. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const loadDashboard = async token => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/sub-dashboard?token=${encodeURIComponent(token)}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load dashboard");
      }
      const data = await resp.json();
      setDashData(data);
    } catch (err) {
      setError(err.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        fontFamily: "'DM Sans', -apple-system, sans-serif",
        padding: "40px 24px",
      }}
    >
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        {/* Header — NOVA branding + GC company */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 32,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* NOVA orb icon */}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "linear-gradient(135deg, #7C5CFC, #BF5AF2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="8" stroke="#fff" strokeWidth="1.5" opacity="0.8" />
                <circle cx="12" cy="12" r="3" fill="#fff" opacity="0.9" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.04em", color: C.text }}>NOVA</div>
              <div style={{ color: C.textDim, fontSize: 11, marginTop: 1 }}>Sub Dashboard</div>
            </div>
          </div>
          {/* GC Company badge */}
          {dashData?.gcCompany && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: "8px 14px",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: `${C.accent}20`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 700,
                  color: C.accent,
                }}
              >
                {dashData.gcCompany.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{dashData.gcCompany}</div>
                <div style={{ color: C.textDim, fontSize: 10 }}>General Contractor</div>
              </div>
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && !dashData && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: `3px solid ${C.border}`,
                borderTopColor: C.accent,
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 16px",
              }}
            />
            <div style={{ color: C.textMuted, fontSize: 14 }}>Loading your dashboard...</div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              background: "rgba(255,69,58,0.08)",
              border: "1px solid rgba(255,69,58,0.15)",
              color: C.red,
              fontSize: 13,
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 16 }}>⚠</span>
            {error}
          </div>
        )}

        {/* Email entry (no token) */}
        {!dashData && !loading && !sent && (
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: 32,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: "linear-gradient(135deg, rgba(124,92,252,0.2), rgba(191,90,242,0.1))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="2" stroke={C.accent} strokeWidth="1.5" />
                <path d="M3 7l9 5 9-5" stroke={C.accent} strokeWidth="1.5" />
              </svg>
            </div>
            <h1 style={{ color: C.text, fontSize: 22, fontWeight: 600, margin: "0 0 8px" }}>View Your Bid History</h1>
            <p style={{ color: C.textMuted, fontSize: 14, margin: "0 0 24px", lineHeight: 1.5 }}>
              Enter the email you use for bid invitations to receive a secure dashboard link.
            </p>
            <div style={{ display: "flex", gap: 8, maxWidth: 400, margin: "0 auto" }}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                onKeyDown={e => e.key === "Enter" && handleRequestLink()}
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${C.border}`,
                  color: C.text,
                  fontSize: 14,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              <button
                onClick={handleRequestLink}
                disabled={!email.includes("@")}
                style={{
                  background: "linear-gradient(135deg, #7C5CFC, #BF5AF2)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 24px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: email.includes("@") ? "pointer" : "not-allowed",
                  opacity: email.includes("@") ? 1 : 0.5,
                  fontFamily: "inherit",
                }}
              >
                Send Link
              </button>
            </div>
          </div>
        )}

        {/* Sent confirmation */}
        {sent && !dashData && (
          <div
            style={{
              background: "rgba(48,209,88,0.06)",
              border: "1px solid rgba(48,209,88,0.15)",
              borderRadius: 16,
              padding: 32,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x2709;</div>
            <h2 style={{ color: C.green, fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Check your email</h2>
            <p style={{ color: C.textMuted, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
              If <strong style={{ color: C.text }}>{email}</strong> has bid invitations in our system, you'll receive a
              secure link to your dashboard.
            </p>
          </div>
        )}

        {/* Dashboard content */}
        {dashData && (
          <>
            {/* Welcome text */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ color: C.text, fontSize: 16, fontWeight: 600 }}>
                Welcome back{dashData.email ? `, ${dashData.email.split("@")[0]}` : ""}
              </div>
              <div style={{ color: C.textDim, fontSize: 12, marginTop: 2 }}>
                Your bid history and active invitations
              </div>
            </div>

            {/* Stats — responsive 2×2 on small screens */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 12,
                marginBottom: 24,
              }}
            >
              <StatBox label="Total Bids" value={dashData.stats.total} color={C.accent} />
              <StatBox label="Submitted" value={dashData.stats.submitted} color={C.green} />
              <StatBox label="Won" value={dashData.stats.won} color={C.yellow} />
              <StatBox label="Win Rate" value={`${dashData.stats.winRate}%`} color={C.orange} />
            </div>

            {/* Invitations list */}
            <div
              style={{
                color: C.textMuted,
                fontSize: 12,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 10,
              }}
            >
              Your Bids ({dashData.invitations.length})
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dashData.invitations.map(inv => {
                const s = STATUS_MAP[inv.status] || STATUS_MAP.pending;
                const appUrl = window.location.origin;
                const due = dueIn(inv.dueDate);
                const isActive = ["sent", "opened", "downloaded"].includes(inv.status);
                const isOverdue = due?.overdue && isActive;

                return (
                  <div
                    key={inv.id}
                    style={{
                      background: isOverdue ? "rgba(255,69,58,0.04)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${isOverdue ? "rgba(255,69,58,0.15)" : C.border}`,
                      borderRadius: 12,
                      padding: "14px 16px",
                      transition: "border-color 200ms",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 4,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Project name (if available) */}
                        {inv.projectName && (
                          <div
                            style={{
                              color: C.textDim,
                              fontSize: 10,
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: 0.5,
                              marginBottom: 3,
                            }}
                          >
                            {inv.projectName}
                          </div>
                        )}
                        <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{inv.packageName}</div>
                        {/* Timeline row */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                          {inv.sentAt && (
                            <span style={{ color: C.textDim, fontSize: 11 }}>Sent {timeAgo(inv.sentAt)}</span>
                          )}
                          {inv.dueDate && due && (
                            <>
                              <span style={{ color: C.textDim, fontSize: 11 }}>·</span>
                              <span
                                style={{
                                  color: isOverdue
                                    ? C.red
                                    : due.text.includes("today") || due.text.includes("tomorrow")
                                      ? C.orange
                                      : C.textDim,
                                  fontSize: 11,
                                  fontWeight: isOverdue ? 600 : 400,
                                }}
                              >
                                {due.text}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                        {isOverdue && (
                          <span
                            style={{
                              background: "rgba(255,69,58,0.15)",
                              color: C.red,
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: 9,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: 0.5,
                            }}
                          >
                            Overdue
                          </span>
                        )}
                        <span
                          style={{
                            background: `${s.color}18`,
                            color: s.color,
                            padding: "3px 10px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {s.label}
                        </span>
                      </div>
                    </div>

                    {/* Feedback (if not awarded) */}
                    {inv.feedbackNotes && inv.status === "not_awarded" && (
                      <div
                        style={{
                          background: "rgba(124,92,252,0.06)",
                          borderLeft: "3px solid rgba(124,92,252,0.3)",
                          padding: "8px 12px",
                          borderRadius: "0 6px 6px 0",
                          marginTop: 8,
                        }}
                      >
                        <div
                          style={{
                            color: C.accent,
                            fontSize: 10,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            marginBottom: 4,
                          }}
                        >
                          Feedback
                        </div>
                        <div style={{ color: C.text, fontSize: 12, lineHeight: 1.5 }}>{inv.feedbackNotes}</div>
                      </div>
                    )}

                    {/* Portal link for active invitations — prominent CTA */}
                    {isActive && inv.portalToken && (
                      <a
                        href={`${appUrl}/portal/${inv.portalToken}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 10,
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 600,
                          textDecoration: "none",
                          background: "linear-gradient(135deg, #7C5CFC, #BF5AF2)",
                          padding: "6px 14px",
                          borderRadius: 8,
                          transition: "opacity 200ms",
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M5 12h14M12 5l7 7-7 7"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        Open Portal
                      </a>
                    )}

                    {/* Awarded checkmark */}
                    {inv.status === "awarded" && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 8,
                          color: C.green,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" fill="rgba(48,209,88,0.15)" />
                          <path
                            d="M8 12l3 3 5-5"
                            stroke="#30D158"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        Awarded to you
                      </div>
                    )}
                  </div>
                );
              })}

              {dashData.invitations.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "48px 24px",
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      background: "rgba(124,92,252,0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 12px",
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="5" width="18" height="14" rx="2" stroke={C.accent} strokeWidth="1.5" />
                      <path d="M3 7l9 5 9-5" stroke={C.accent} strokeWidth="1.5" />
                    </svg>
                  </div>
                  <div style={{ color: C.text, fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                    No bid invitations yet
                  </div>
                  <div style={{ color: C.textMuted, fontSize: 13, lineHeight: 1.5, maxWidth: 320, margin: "0 auto" }}>
                    When a general contractor sends you a bid invitation through NOVA, it will appear here.
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 40, color: "#48484A", fontSize: 11 }}>Powered by NOVA</div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div
      style={{
        background: `${color}08`,
        border: `1px solid ${color}15`,
        borderRadius: 12,
        padding: "14px 12px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "#8E8E93",
          textTransform: "uppercase",
          letterSpacing: 0.3,
          marginTop: 6,
        }}
      >
        {label}
      </div>
    </div>
  );
}
