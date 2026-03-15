// ============================================================
// NOVA Core — Signup Page
// /signup — Public, no auth required
//
// Light theme, centered card, account creation form.
// Self-contained — no useTheme().
// ============================================================

import { useState, useCallback } from "react";

const FONT = "'Switzer', -apple-system, BlinkMacSystemFont, sans-serif";

const L = {
  bg: "#FAFAFA",
  card: "#FFFFFF",
  text: "#1A1A1A",
  textMuted: "#6B7280",
  textDim: "#9CA3AF",
  border: "#E5E7EB",
  accent: "#2563EB",
  accentHover: "#1D4ED8",
  green: "#16A34A",
  red: "#DC2626",
  inputBg: "#FFFFFF",
  inputBorder: "#D1D5DB",
  inputFocus: "#2563EB",
};

export default function SignupPage() {
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [successEmail, setSuccessEmail] = useState("");

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (submitting) return;

    // Client-side validation
    if (!orgName.trim()) { setError("Organization name is required"); return; }
    if (!email.trim()) { setError("Email is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/nova-core/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: orgName.trim(),
          email: email.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Signup failed (${res.status})`);
      }

      setSuccessEmail(email.trim());
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [orgName, email, password, submitting]);

  const handleResend = useCallback(async () => {
    // Simple resend — just re-submit (server will handle idempotently)
    try {
      await fetch("/api/nova-core/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: orgName.trim(),
          email: successEmail,
          password,
        }),
      });
    } catch {
      // Silent fail on resend
    }
  }, [orgName, successEmail, password]);

  const containerStyle = {
    minHeight: "100vh",
    background: L.bg,
    fontFamily: FONT,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "48px 16px",
  };

  const cardStyle = {
    width: "100%",
    maxWidth: 440,
    background: L.card,
    borderRadius: 12,
    border: `1px solid ${L.border}`,
    padding: "40px 36px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  };

  const labelStyle = {
    fontSize: 13,
    fontWeight: 600,
    color: L.text,
    marginBottom: 6,
    display: "block",
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 8,
    border: `1px solid ${L.inputBorder}`,
    background: L.inputBg,
    color: L.text,
    fontSize: 14,
    fontFamily: FONT,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  };

  // ── Success screen ──
  if (success) {
    return (
      <div style={containerStyle}>
        {/* Nav */}
        <div style={{ width: "100%", maxWidth: 440, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", color: L.text }}>NOVA</span>
        </div>
        <div style={cardStyle}>
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <svg width={56} height={56} viewBox="0 0 24 24" fill="none" stroke={L.green} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 20 }}>
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <div style={{ fontSize: 22, fontWeight: 700, color: L.text, marginBottom: 8 }}>
              Account created. Check your email.
            </div>
            <div style={{ fontSize: 14, color: L.textMuted, lineHeight: 1.6 }}>
              We sent a confirmation to <strong style={{ color: L.text }}>{successEmail}</strong>.
              Click the link to activate your account.
            </div>
            <button
              onClick={handleResend}
              style={{
                marginTop: 20, background: "none", border: "none", color: L.accent,
                fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: FONT,
                textDecoration: "underline",
              }}
            >
              Resend email
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ──
  return (
    <div style={containerStyle}>
      {/* Nav bar */}
      <div style={{ width: "100%", maxWidth: 440, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", color: L.text }}>NOVA</span>
        <span style={{ fontSize: 13, color: L.textMuted }}>
          Already have an account?{" "}
          <a href="/" style={{ color: L.accent, textDecoration: "none", fontWeight: 500 }}>Sign in</a>
        </span>
      </div>

      <div style={cardStyle}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: L.text, margin: "0 0 4px" }}>
          Start your free trial
        </h1>
        <div style={{ fontSize: 14, color: L.textMuted, marginBottom: 28 }}>
          21 days free. No credit card required.
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Org name */}
          <div>
            <label style={labelStyle}>Organization name <span style={{ color: L.red }}>*</span></label>
            <input
              type="text"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder="Acme Construction"
              required
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = L.inputFocus; }}
              onBlur={e => { e.target.style.borderColor = L.inputBorder; }}
            />
          </div>

          {/* Email */}
          <div>
            <label style={labelStyle}>Your email <span style={{ color: L.red }}>*</span></label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = L.inputFocus; }}
              onBlur={e => { e.target.style.borderColor = L.inputBorder; }}
            />
          </div>

          {/* Password */}
          <div>
            <label style={labelStyle}>Password <span style={{ color: L.red }}>*</span></label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                required
                minLength={8}
                style={{ ...inputStyle, paddingRight: 44 }}
                onFocus={e => { e.target.style.borderColor = L.inputFocus; }}
                onBlur={e => { e.target.style.borderColor = L.inputBorder; }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", padding: 4,
                  color: L.textDim, fontSize: 12, fontFamily: FONT,
                }}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div style={{
              padding: "10px 14px", borderRadius: 8,
              background: "#FEF2F2", border: "1px solid #FECACA",
              color: L.red, fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%", padding: "12px 24px", borderRadius: 8,
              border: "none", background: submitting ? L.textDim : L.accent,
              color: "#FFFFFF", fontSize: 15, fontWeight: 600, fontFamily: FONT,
              cursor: submitting ? "not-allowed" : "pointer",
              transition: "background 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {submitting && (
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ animation: "spin 1s linear infinite" }}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            )}
            {submitting ? "Creating your account..." : "Create account"}
          </button>
        </form>

        <div style={{ marginTop: 20, fontSize: 12, color: L.textDim, textAlign: "center" }}>
          By signing up you agree to our Terms of Service
        </div>

        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 24, fontSize: 12, color: L.textDim }}>
        Powered by NOVATerra
      </div>
    </div>
  );
}
