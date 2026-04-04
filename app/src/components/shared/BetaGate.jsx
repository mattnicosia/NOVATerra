/**
 * BetaGate — Private beta access gate
 *
 * Shows when isBetaApproved is false. For now, all authenticated users
 * are approved (the gate never actually renders), but the infrastructure
 * is ready to flip the switch via a Supabase profile flag.
 *
 * When activated, it shows a branded modal with a "Request Access" flow
 * that stores the request in localStorage and optionally Supabase.
 */
import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/stores/authStore";

export default function BetaGate() {
  const C = useTheme();
  const T = C.T;
  const user = useAuthStore(s => s.user);
  const [email, setEmail] = useState(user?.email || "");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleRequest = async () => {
    if (!email || submitting) return;
    setSubmitting(true);
    try {
      // Store locally
      const requests = JSON.parse(localStorage.getItem("bldg-beta-requests") || "[]");
      requests.push({ email, requestedAt: new Date().toISOString(), userId: user?.id });
      localStorage.setItem("bldg-beta-requests", JSON.stringify(requests));

      // Attempt Supabase insert (best-effort, table may not exist yet)
      try {
        const { supabase } = await import("@/utils/supabase");
        if (supabase) {
          await supabase.from("beta_requests").insert({
            email,
            user_id: user?.id || null,
            requested_at: new Date().toISOString(),
          });
        }
      } catch {
        // Table may not exist — that's fine, localStorage has it
      }

      setSubmitted(true);
    } catch {
      setSubmitted(true); // Show success anyway — localStorage captured it
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99998,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        fontFamily: T?.font?.display || T?.font?.sans || "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background: C.bg1 || "#1a1a1e",
          border: `1px solid ${C.border || "rgba(255,255,255,0.08)"}`,
          borderRadius: 20,
          padding: "48px 40px",
          maxWidth: 420,
          width: "90%",
          textAlign: "center",
        }}
      >
        {/* Logo area */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 56,
            height: 56,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${C.accent || "#7C5CFC"}, ${C.accentAlt || "#BF5AF2"})`,
            marginBottom: 20,
          }}
        >
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 20h20" />
            <path d="M5 20V8l7-5 7 5v12" />
            <path d="M9 20v-6h6v6" />
          </svg>
        </div>

        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: C.text || "#fff",
            marginBottom: 8,
            letterSpacing: -0.3,
          }}
        >
          NOVATerra Private Beta
        </h2>

        {!submitted ? (
          <>
            <p
              style={{
                fontSize: 14,
                color: C.textMuted || "#999",
                lineHeight: 1.6,
                marginBottom: 28,
              }}
            >
              NOVATerra is in private beta. Enter your email to request access and we will get back to you shortly.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                onKeyDown={e => e.key === "Enter" && handleRequest()}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: `1px solid ${C.border || "rgba(255,255,255,0.1)"}`,
                  background: C.bg2 || "rgba(255,255,255,0.04)",
                  color: C.text || "#fff",
                  fontSize: 14,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              <button
                onClick={handleRequest}
                disabled={submitting || !email}
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  border: "none",
                  background: C.accent || "#7C5CFC",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: submitting ? "wait" : "pointer",
                  opacity: submitting || !email ? 0.6 : 1,
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                  transition: "opacity 0.15s",
                }}
              >
                {submitting ? "Sending..." : "Request Access"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x2705;</div>
            <p
              style={{
                fontSize: 14,
                color: C.textMuted || "#999",
                lineHeight: 1.6,
              }}
            >
              Your request has been received. We will notify you at <strong style={{ color: C.text || "#fff" }}>{email}</strong> when your access is ready.
            </p>
          </>
        )}

        <p
          style={{
            fontSize: 11,
            color: C.textDim || "rgba(255,255,255,0.3)",
            marginTop: 24,
          }}
        >
          Questions? Reach us at matt@bldgestimating.com
        </p>
      </div>
    </div>
  );
}
