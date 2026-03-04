import { useState, useEffect } from "react";

// Hardcoded NOVA dark theme (same pattern as PortalPage — outside auth gate)
const C = {
  bg: "#0D0F14",
  text: "#E5E5EA",
  textMuted: "#AEAEB2",
  textDim: "#8E8E93",
  border: "rgba(255,255,255,0.08)",
  accent: "#7C5CFC",
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
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 32,
          }}
        >
          <img src="/novaterra-nt.png" alt="NT" style={{ height: 32, width: 32, objectFit: "contain" }} />
          <div>
            <img
              src="/novaterra-wordmark.png"
              alt="NOVATerra"
              style={{ height: 18, objectFit: "contain", display: "block" }}
            />
            <div style={{ color: C.textDim, fontSize: 11, marginTop: 2 }}>Sub Dashboard</div>
          </div>
        </div>

        {/* Loading */}
        {loading && !dashData && (
          <div style={{ textAlign: "center", padding: "60px 0", color: C.textMuted, fontSize: 14 }}>Loading...</div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              background: "rgba(255,69,58,0.08)",
              border: "1px solid rgba(255,69,58,0.15)",
              color: "#FF453A",
              fontSize: 13,
              marginBottom: 20,
            }}
          >
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
                }}
              />
              <button
                onClick={handleRequestLink}
                disabled={!email.includes("@")}
                style={{
                  background: "linear-gradient(135deg, #D946EF, #A855F7)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 24px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: email.includes("@") ? "pointer" : "not-allowed",
                  opacity: email.includes("@") ? 1 : 0.5,
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
            <h2 style={{ color: "#30D158", fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Check your email</h2>
            <p style={{ color: C.textMuted, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
              If <strong style={{ color: C.text }}>{email}</strong> has bid invitations in our system, you'll receive a
              secure link to your dashboard.
            </p>
          </div>
        )}

        {/* Dashboard content */}
        {dashData && (
          <>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
              <StatBox label="Total Bids" value={dashData.stats.total} color={C.accent} />
              <StatBox label="Submitted" value={dashData.stats.submitted} color="#30D158" />
              <StatBox label="Won" value={dashData.stats.won} color="#FFD60A" />
              <StatBox label="Win Rate" value={`${dashData.stats.winRate}%`} color="#FF9F0A" />
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
                return (
                  <div
                    key={inv.id}
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: `1px solid ${C.border}`,
                      borderRadius: 12,
                      padding: "14px 16px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 6,
                      }}
                    >
                      <div>
                        <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{inv.packageName}</div>
                        {inv.dueDate && (
                          <div style={{ color: C.textDim, fontSize: 11, marginTop: 2 }}>
                            Due{" "}
                            {new Date(inv.dueDate + "T12:00:00").toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </div>
                        )}
                      </div>
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

                    {/* Portal link for active invitations */}
                    {["sent", "opened", "downloaded"].includes(inv.status) && inv.portalToken && (
                      <a
                        href={`${appUrl}/portal/${inv.portalToken}`}
                        style={{
                          display: "inline-block",
                          marginTop: 8,
                          color: C.accent,
                          fontSize: 12,
                          fontWeight: 600,
                          textDecoration: "none",
                        }}
                      >
                        Open Portal &rarr;
                      </a>
                    )}
                  </div>
                );
              })}

              {dashData.invitations.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 0", color: C.textMuted, fontSize: 13 }}>
                  No bid invitations found.
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 40, color: "#48484A", fontSize: 11 }}>
          Powered by NOVA Estimating
        </div>
      </div>
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
