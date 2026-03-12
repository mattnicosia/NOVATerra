import { useState, memo } from "react";
import { useAuthStore } from "@/stores/authStore";

/* ────────────────────────────────────────────────────────
   LoginPage — immersive Nova-themed sign-in experience
   ──────────────────────────────────────────────────────── */

const FONT = "'Switzer', -apple-system, BlinkMacSystemFont, sans-serif";
const ACCENT = "#C83232";
const ACCENT_DIM = "#5C1A1A";
const GREEN = "#30D158";
const RED = "#FF453A";
const TEXT = "rgba(238,237,245,0.92)";
const TEXT_MUTED = "rgba(238,237,245,0.50)";
const TEXT_DIM = "rgba(238,237,245,0.28)";
const BORDER = "rgba(255,255,255,0.10)";
const GLASS_BG = "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)";
const INPUT_BG = "rgba(255,255,255,0.04)";

/* ── Inline keyframes ─────────────────────────────────── */
const keyframesCSS = `
@keyframes loginFadeIn {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes loginBreathOrb {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.08); opacity: 0.78; }
}
@keyframes loginSpinA {
  from { transform: rotate(0deg); } to { transform: rotate(360deg); }
}
@keyframes loginSpinB {
  from { transform: rotate(360deg); } to { transform: rotate(0deg); }
}
@keyframes loginSpinC {
  from { transform: rotateX(72deg) rotate(0deg); }
  to { transform: rotateX(72deg) rotate(360deg); }
}
@keyframes loginPulseGlow {
  0%, 100% { box-shadow: 0 0 40px rgba(200,50,50,0.25), 0 0 80px rgba(92,26,26,0.12); }
  50% { box-shadow: 0 0 60px rgba(200,50,50,0.4), 0 0 120px rgba(92,26,26,0.2); }
}
@keyframes loginShimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
@keyframes loginDriftBlob {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -20px) scale(1.1); }
  66% { transform: translate(-20px, 15px) scale(0.95); }
}
`;

const labelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: TEXT_DIM,
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  fontFamily: FONT,
};

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  fontSize: 14,
  fontFamily: FONT,
  fontWeight: 400,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  outline: "none",
  background: INPUT_BG,
  color: TEXT,
  transition: "border-color 200ms, box-shadow 200ms",
  boxSizing: "border-box",
};

function submitBtnStyle(disabled) {
  return {
    width: "100%",
    padding: "13px 0",
    fontSize: 14,
    fontWeight: 600,
    fontFamily: FONT,
    color: "#fff",
    background: disabled ? "rgba(255,255,255,0.08)" : `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DIM})`,
    border: "none",
    borderRadius: 10,
    cursor: disabled ? "default" : "pointer",
    transition: "all 200ms ease-out",
    boxShadow: disabled ? "none" : `0 4px 20px ${ACCENT}40, 0 0 0 1px ${ACCENT}30`,
    opacity: disabled ? 0.5 : 1,
  };
}

const focusHandler = e => {
  e.target.style.borderColor = `${ACCENT}66`;
  e.target.style.boxShadow = `0 0 0 3px ${ACCENT}1A`;
};
const blurHandler = e => {
  e.target.style.borderColor = BORDER;
  e.target.style.boxShadow = "none";
};

/* ── Password input with visibility toggle ────────────── */
function PasswordInput({ value, onChange, placeholder, ...rest }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{ ...inputStyle, paddingRight: 42 }}
        onFocus={focusHandler}
        onBlur={blurHandler}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        style={{
          position: "absolute",
          right: 10,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 4,
          display: "flex",
          alignItems: "center",
        }}
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? (
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke={TEXT_DIM}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          </svg>
        ) : (
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke={TEXT_DIM}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

/* ── CSS Nova Orb (matches index.html loading screen) ── */
function NovaOrbCSS({ size = 80 }) {
  const s = size;
  return (
    <div
      style={{
        position: "relative",
        width: s,
        height: s,
        perspective: 600,
        margin: "0 auto 12px",
      }}
    >
      {/* Halo */}
      <div
        style={{
          position: "absolute",
          inset: -Math.round(s * 0.2),
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(200,50,50,0.14) 0%, rgba(200,50,50,0.04) 50%, transparent 70%)",
          animation: "loginBreathOrb 5s ease-in-out infinite",
        }}
      />
      {/* Ring A */}
      <div
        style={{
          position: "absolute",
          inset: -Math.round(s * 0.07),
          borderRadius: "50%",
          border: "1px solid rgba(200,50,50,0.15)",
          animation: "loginSpinA 22s linear infinite",
        }}
      />
      {/* Ring B */}
      <div
        style={{
          position: "absolute",
          inset: Math.round(s * 0.05),
          borderRadius: "50%",
          border: "1px solid rgba(180,70,70,0.08)",
          animation: "loginSpinB 15s linear infinite",
        }}
      />
      {/* Ring C — equatorial 3D tilt */}
      <div
        style={{
          position: "absolute",
          inset: -Math.round(s * 0.03),
          borderRadius: "50%",
          border: "1px solid rgba(180,70,70,0.12)",
          animation: "loginSpinC 34s linear infinite",
        }}
      />
      {/* Core */}
      <div
        style={{
          width: s,
          height: s,
          borderRadius: "50%",
          position: "relative",
          background: [
            "radial-gradient(circle at 50% 48%, rgba(255,255,255,0.85) 0%, rgba(255,160,160,0.5) 8%, rgba(200,60,60,0.4) 20%, transparent 40%)",
            "radial-gradient(circle at 50% 50%, rgba(255,175,175,0.7) 0%, rgba(200,50,50,0.5) 18%, rgba(140,24,24,0.3) 35%, rgba(92,26,26,0.8) 55%)",
            "radial-gradient(circle at 50% 50%, #2A0808 0%, #1A0505 42%, #100303 82%, #080101 100%)",
          ].join(", "),
          boxShadow: "0 14px 40px rgba(200,50,50,0.35), 0 6px 18px rgba(0,0,0,0.55), 0 0 60px rgba(200,50,50,0.15)",
          animation: "loginPulseGlow 4s ease-in-out infinite",
        }}
      >
        {/* Edge vignette */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: "radial-gradient(circle, transparent 55%, rgba(8,1,1,0.7) 100%)",
          }}
        />
      </div>
    </div>
  );
}

/* ── Construction silhouette — faint cityscape ────────── */
const SKYLINE_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 200" fill="none" stroke="rgba(200,50,50,0.06)" stroke-width="1">
  <path d="M0,200 L0,140 L40,140 L40,100 L60,100 L60,80 L80,80 L80,100 L100,100 L100,140 L140,140 L140,120 L160,120 L160,90 L170,90 L170,40 L180,40 L180,90 L190,90 L190,120 L220,120 L220,140 L260,140 L260,110 L280,110 L280,60 L290,60 L290,50 L300,50 L300,60 L310,60 L310,110 L340,110 L340,140 L380,140 L380,130 L400,130 L400,70 L420,70 L420,130 L440,130 L440,140 L480,140 L480,100 L500,100 L500,45 L510,45 L510,35 L520,35 L520,45 L530,45 L530,100 L550,100 L550,140 L600,140 L600,120 L620,120 L620,55 L640,55 L640,120 L660,120 L660,140 L700,140 L700,90 L720,90 L720,65 L740,65 L740,90 L760,90 L760,140 L800,140 L800,110 L820,110 L820,75 L830,75 L830,30 L840,30 L840,75 L850,75 L850,110 L880,110 L880,140 L920,140 L920,130 L940,130 L940,85 L960,85 L960,130 L980,130 L980,140 L1020,140 L1020,100 L1040,100 L1040,60 L1060,60 L1060,100 L1080,100 L1080,140 L1120,140 L1120,120 L1140,120 L1140,80 L1160,80 L1160,120 L1180,120 L1180,140 L1200,140 L1200,200 Z"/>
  <line x1="510" y1="35" x2="510" y2="10"/>
  <line x1="830" y1="30" x2="830" y2="5"/>
  <line x1="170" y1="40" x2="170" y2="15"/>
</svg>`)}`;

/* ── Shell — immersive ambient background ─────────────── */
const Shell = memo(function Shell({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#06060C",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: FONT,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Inject keyframes */}
      <style>{keyframesCSS}</style>

      {/* Ambient nebula blobs */}
      <div
        style={{
          position: "fixed",
          top: "10%",
          left: "20%",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(200,50,50,0.08) 0%, transparent 70%)",
          filter: "blur(80px)",
          pointerEvents: "none",
          animation: "loginDriftBlob 22s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: "5%",
          right: "15%",
          width: 350,
          height: 350,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(200,50,50,0.06) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
          animation: "loginDriftBlob 18s ease-in-out infinite reverse",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "40%",
          right: "30%",
          width: 250,
          height: 250,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(180,70,70,0.05) 0%, transparent 70%)",
          filter: "blur(50px)",
          pointerEvents: "none",
          animation: "loginDriftBlob 26s ease-in-out infinite",
        }}
      />

      {/* Accent glow behind orb */}
      <div
        style={{
          position: "fixed",
          top: "18%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, rgba(200,50,50,0.1) 0%, transparent 60%)`,
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      {/* Construction silhouette */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: 200,
          backgroundImage: `url("${SKYLINE_SVG}")`,
          backgroundRepeat: "repeat-x",
          backgroundPosition: "bottom center",
          backgroundSize: "auto 200px",
          pointerEvents: "none",
          opacity: 0.7,
        }}
      />

      {/* Grain overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`,
          pointerEvents: "none",
          opacity: 0.5,
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: 380,
          animation: "loginFadeIn 0.6s ease-out both",
        }}
      >
        {children}
      </div>
    </div>
  );
});

/* ── LoginForm ──────────────────────────────────────── */
function LoginForm() {
  const signInWithMagicLink = useAuthStore(s => s.signInWithMagicLink);
  const signInWithPassword = useAuthStore(s => s.signInWithPassword);
  const signUpWithPassword = useAuthStore(s => s.signUpWithPassword);
  const resetPassword = useAuthStore(s => s.resetPassword);
  const authError = useAuthStore(s => s.authError);
  const clearError = useAuthStore(s => s.clearError);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState("password"); // password | magic | signup | forgot
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handlePasswordLogin = async e => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    await signInWithPassword(email.trim(), password);
    setSubmitting(false);
  };

  const handleMagicLink = async e => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    await signInWithMagicLink(email.trim());
    setSubmitting(false);
  };

  const handleSignUp = async e => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    await signUpWithPassword(email.trim(), password, fullName.trim());
    setSubmitting(false);
  };

  const handleForgotPassword = async e => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    const result = await resetPassword(email.trim());
    setSubmitting(false);
    if (result?.success) setResetSent(true);
  };

  const switchMode = m => {
    setMode(m);
    clearError();
    setPassword("");
    setFullName("");
    setResetSent(false);
  };

  return (
    <>
      {/* Nova Orb */}
      <NovaOrbCSS size={80} />

      {/* Brand */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <img
          src="/nova-logo-cut.svg"
          alt="NOVA"
          style={{
            height: 32,
            objectFit: "contain",
            display: "block",
            margin: "0 auto 6px",
            userSelect: "none",
          }}
          draggable={false}
        />
        <p
          style={{
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.12em",
            color: TEXT_DIM,
            margin: 0,
            textTransform: "uppercase",
          }}
        >
          Construction Intelligence
        </p>
      </div>

      {/* Card */}
      <div
        style={{
          background: GLASS_BG,
          backdropFilter: "blur(40px) saturate(1.6)",
          WebkitBackdropFilter: "blur(40px) saturate(1.6)",
          border: `1px solid ${BORDER}`,
          borderRadius: 18,
          padding: "24px 28px",
          boxShadow: [
            "0 24px 64px rgba(0,0,0,0.5)",
            "0 8px 24px rgba(0,0,0,0.3)",
            "inset 0 1px 0 rgba(255,255,255,0.06)",
            "inset 0 -1px 0 rgba(0,0,0,0.15)",
          ].join(", "),
          animation: "loginFadeIn 0.6s ease-out 0.15s both",
        }}
      >
        {/* Mode tabs — only Sign In methods */}
        {mode !== "signup" && mode !== "forgot" && (
          <div
            style={{
              display: "flex",
              background: "rgba(255,255,255,0.04)",
              borderRadius: 9,
              padding: 3,
              marginBottom: 22,
              gap: 2,
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {[
              { key: "password", label: "Password" },
              { key: "magic", label: "Magic Link" },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => switchMode(tab.key)}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  fontSize: 12,
                  fontWeight: mode === tab.key ? 600 : 500,
                  fontFamily: FONT,
                  color: mode === tab.key ? TEXT : TEXT_MUTED,
                  background: mode === tab.key ? "rgba(255,255,255,0.08)" : "transparent",
                  border: "none",
                  borderRadius: 7,
                  cursor: "pointer",
                  transition: "all 150ms ease-out",
                  boxShadow: mode === tab.key ? "0 1px 4px rgba(0,0,0,0.3)" : "none",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Back button for signup/forgot modes */}
        {(mode === "signup" || mode === "forgot") && (
          <button
            onClick={() => switchMode("password")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: TEXT_MUTED,
              fontSize: 12,
              fontWeight: 500,
              fontFamily: FONT,
              marginBottom: 18,
              padding: 0,
            }}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            Back to sign in
          </button>
        )}

        {/* Error message */}
        {authError && (
          <div
            style={{
              background: `${RED}12`,
              border: `1px solid ${RED}30`,
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke={RED}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span style={{ fontSize: 12, color: RED, fontWeight: 500 }}>{authError}</span>
          </div>
        )}

        {/* ── Password Login ── */}
        {mode === "password" && (
          <form onSubmit={handlePasswordLogin}>
            <label style={labelStyle}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoFocus
              required
              style={{ ...inputStyle, marginBottom: 14 }}
              onFocus={focusHandler}
              onBlur={blurHandler}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Password</label>
              <button
                type="button"
                onClick={() => switchMode("forgot")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: ACCENT,
                  fontSize: 11,
                  fontWeight: 500,
                  fontFamily: FONT,
                  padding: 0,
                  opacity: 0.8,
                }}
              >
                Forgot?
              </button>
            </div>
            <div style={{ marginBottom: 18 }}>
              <PasswordInput
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !email.trim() || !password}
              style={submitBtnStyle(submitting || !email.trim() || !password)}
            >
              {submitting ? "Signing in..." : "Sign In"}
            </button>
          </form>
        )}

        {/* ── Magic Link ── */}
        {mode === "magic" && (
          <form onSubmit={handleMagicLink}>
            <label style={labelStyle}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoFocus
              required
              style={{ ...inputStyle, marginBottom: 18 }}
              onFocus={focusHandler}
              onBlur={blurHandler}
            />
            <button
              type="submit"
              disabled={submitting || !email.trim()}
              style={submitBtnStyle(submitting || !email.trim())}
            >
              {submitting ? "Sending..." : "Send Magic Link"}
            </button>
            <p style={{ fontSize: 11, color: TEXT_DIM, textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>
              No password needed. We'll email you a secure sign-in link.
            </p>
          </form>
        )}

        {/* ── Sign Up ── */}
        {mode === "signup" && (
          <form onSubmit={handleSignUp}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: TEXT, margin: "0 0 18px", fontFamily: FONT }}>
              Create your account
            </h3>
            <label style={labelStyle}>Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="John Smith"
              autoFocus
              style={{ ...inputStyle, marginBottom: 14 }}
              onFocus={focusHandler}
              onBlur={blurHandler}
            />
            <label style={labelStyle}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              style={{ ...inputStyle, marginBottom: 14 }}
              onFocus={focusHandler}
              onBlur={blurHandler}
            />
            <label style={labelStyle}>Password</label>
            <div style={{ marginBottom: 18 }}>
              <PasswordInput
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Create a password (min 6 chars)"
                required
                minLength={6}
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !email.trim() || !password}
              style={submitBtnStyle(submitting || !email.trim() || !password)}
            >
              {submitting ? "Creating account..." : "Create Account"}
            </button>
          </form>
        )}

        {/* ── Forgot Password ── */}
        {mode === "forgot" && !resetSent && (
          <form onSubmit={handleForgotPassword}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: TEXT, margin: "0 0 6px", fontFamily: FONT }}>
              Reset your password
            </h3>
            <p style={{ fontSize: 12, color: TEXT_MUTED, margin: "0 0 18px", lineHeight: 1.5 }}>
              Enter your email and we'll send a reset link.
            </p>
            <label style={labelStyle}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoFocus
              required
              style={{ ...inputStyle, marginBottom: 18 }}
              onFocus={focusHandler}
              onBlur={blurHandler}
            />
            <button
              type="submit"
              disabled={submitting || !email.trim()}
              style={submitBtnStyle(submitting || !email.trim())}
            >
              {submitting ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        )}

        {/* ── Reset email sent ── */}
        {mode === "forgot" && resetSent && (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: `${GREEN}14`,
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
                stroke={GREEN}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <path d="M22 4 12 14.01l-3-3" />
              </svg>
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: TEXT, margin: "0 0 8px" }}>Check your email</h3>
            <p style={{ fontSize: 12, color: TEXT_MUTED, lineHeight: 1.6, margin: 0 }}>
              We sent a password reset link to your email.
            </p>
          </div>
        )}
      </div>

      {/* Sign up / Sign in link below card */}
      <div
        style={{
          textAlign: "center",
          marginTop: 20,
          animation: "loginFadeIn 0.6s ease-out 0.3s both",
        }}
      >
        {mode !== "signup" && mode !== "forgot" ? (
          <p style={{ fontSize: 12, color: TEXT_DIM, margin: 0 }}>
            Don't have an account?{" "}
            <button
              onClick={() => switchMode("signup")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: ACCENT,
                fontSize: 12,
                fontWeight: 600,
                fontFamily: FONT,
              }}
            >
              Create one
            </button>
          </p>
        ) : null}
      </div>
    </>
  );
}

/* ── Magic Link Confirmation ──────────────────────────── */
function MagicLinkSent() {
  const clearError = useAuthStore(s => s.clearError);
  const clearMagicLinkSent = useAuthStore(s => s.clearMagicLinkSent);

  return (
    <Shell>
      <NovaOrbCSS size={64} />
      <div style={{ textAlign: "center", marginTop: 8 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: `${GREEN}14`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <svg
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke={GREEN}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <path d="M22 4 12 14.01l-3-3" />
          </svg>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: "0 0 8px" }}>Check your email</h2>
        <p style={{ fontSize: 13, color: TEXT_MUTED, lineHeight: 1.6, margin: "0 0 24px" }}>
          We sent you a secure sign-in link. Click it to continue.
        </p>
        <button
          onClick={() => {
            clearMagicLinkSent();
            clearError();
          }}
          style={{
            background: "transparent",
            border: "none",
            color: ACCENT,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          Back to sign in
        </button>
      </div>
    </Shell>
  );
}

/* ── Main export ─────────────────────────────────────── */
export default function LoginPage() {
  const magicLinkSent = useAuthStore(s => s.magicLinkSent);

  if (magicLinkSent) {
    return <MagicLinkSent />;
  }

  return (
    <Shell>
      <LoginForm />
    </Shell>
  );
}
