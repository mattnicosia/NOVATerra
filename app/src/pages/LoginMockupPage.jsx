import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";

/* ────────────────────────────────────────────────────────────────
   LoginMockupPage — Clean black login
   Stripped of all sphere/chamber graphics while we sort NOVACORE.
   Pure black background, centered glass card.
   ──────────────────────────────────────────────────────────────── */

const FONT = "'Switzer', -apple-system, BlinkMacSystemFont, sans-serif";
const ACCENT = "#C83232";
const ACCENT_DIM = "#5C1A1A";
const TEXT = "rgba(238,237,245,0.92)";
const TEXT_MUTED = "rgba(238,237,245,0.50)";
const TEXT_DIM = "rgba(238,237,245,0.28)";
const BORDER = "rgba(255,255,255,0.10)";
const INPUT_BG = "rgba(255,255,255,0.04)";

const keyframesCSS = `
@keyframes loginFadeUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes loginFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes glowPulse {
  0%, 100% { opacity: 0.5; width: 50px; }
  50% { opacity: 1; width: 70px; }
}
`;

/* ═══════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════ */

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

/* ── Password input ──────────────────────────────────────────── */
function PasswordInput({ value, onChange, placeholder, onFocusCb, ...rest }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{ ...inputStyle, paddingRight: 42 }}
        onFocus={e => {
          focusHandler(e);
          onFocusCb?.();
        }}
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

/* ═══════════════════════════════════════════════════════════════
   LOGIN FORM — centered on black
   ═══════════════════════════════════════════════════════════════ */

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState("password"); // password | magic | signup | forgot
  const [visible, setVisible] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Auth store
  const signInWithPassword = useAuthStore(s => s.signInWithPassword);
  const signInWithMagicLink = useAuthStore(s => s.signInWithMagicLink);
  const signUpWithPassword = useAuthStore(s => s.signUpWithPassword);
  const resetPasswordFn = useAuthStore(s => s.resetPassword);
  const authError = useAuthStore(s => s.authError);
  const magicLinkSent = useAuthStore(s => s.magicLinkSent);
  const clearError = useAuthStore(s => s.clearError);
  const clearMagicLinkSent = useAuthStore(s => s.clearMagicLinkSent);

  // Stagger form entry
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);

  // Mode switching — clears error, resets sub-states
  const switchMode = useCallback(
    newMode => {
      setMode(newMode);
      clearError?.();
      setResetSent(false);
      clearMagicLinkSent?.();
    },
    [clearError, clearMagicLinkSent],
  );

  // ── Auth handlers ──────────────────────────────────────────
  const handlePasswordLogin = useCallback(
    async e => {
      e.preventDefault();
      if (!email.trim() || !password) return;
      setSubmitting(true);
      const result = await signInWithPassword(email.trim(), password);
      setSubmitting(false);
      if (!result?.error) {
        setTransitioning(true);
      }
    },
    [email, password, signInWithPassword],
  );

  const handleMagicLink = useCallback(
    async e => {
      e.preventDefault();
      if (!email.trim()) return;
      setSubmitting(true);
      await signInWithMagicLink(email.trim());
      setSubmitting(false);
    },
    [email, signInWithMagicLink],
  );

  const handleSignUp = useCallback(
    async e => {
      e.preventDefault();
      if (!email.trim() || !password) return;
      setSubmitting(true);
      const result = await signUpWithPassword(email.trim(), password, fullName.trim());
      setSubmitting(false);
      if (result?.success && !result?.confirmEmail) {
        setTransitioning(true);
      }
    },
    [email, password, fullName, signUpWithPassword],
  );

  const handleForgotPassword = useCallback(
    async e => {
      e.preventDefault();
      if (!email.trim()) return;
      setSubmitting(true);
      const result = await resetPasswordFn(email.trim());
      setSubmitting(false);
      if (result?.success) setResetSent(true);
    },
    [email, resetPasswordFn],
  );

  const handleSubmit =
    mode === "password"
      ? handlePasswordLogin
      : mode === "magic"
        ? handleMagicLink
        : mode === "signup"
          ? handleSignUp
          : handleForgotPassword;

  if (!visible) return null;

  // ── Confirmation screens ───────────────────────────────────
  if (magicLinkSent) {
    return (
      <div
        style={{
          maxWidth: 340,
          textAlign: "center",
          animation: "loginFadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "rgba(48,209,88,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 18px",
            border: "1px solid rgba(48,209,88,0.25)",
          }}
        >
          <svg
            width={28}
            height={28}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#30D158"
            strokeWidth={2.5}
            strokeLinecap="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: TEXT, margin: "0 0 8px", fontFamily: FONT }}>
          Check your email
        </h2>
        <p style={{ fontSize: 13, color: TEXT_MUTED, margin: "0 0 24px", lineHeight: 1.5, fontFamily: FONT }}>
          We sent a {mode === "magic" ? "magic link" : "confirmation link"} to{" "}
          <strong style={{ color: TEXT }}>{email}</strong>
        </p>
        <button
          onClick={() => {
            clearMagicLinkSent?.();
            switchMode("password");
          }}
          style={{
            ...submitBtnStyle(false),
            maxWidth: 200,
            margin: "0 auto",
            background: "rgba(255,255,255,0.08)",
            boxShadow: "none",
          }}
        >
          Back to Sign In
        </button>
      </div>
    );
  }

  if (resetSent) {
    return (
      <div
        style={{
          maxWidth: 340,
          textAlign: "center",
          animation: "loginFadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "rgba(124,92,252,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 18px",
            border: "1px solid rgba(124,92,252,0.25)",
          }}
        >
          <svg
            width={28}
            height={28}
            viewBox="0 0 24 24"
            fill="none"
            stroke={ACCENT}
            strokeWidth={2}
            strokeLinecap="round"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: TEXT, margin: "0 0 8px", fontFamily: FONT }}>
          Reset link sent
        </h2>
        <p style={{ fontSize: 13, color: TEXT_MUTED, margin: "0 0 24px", lineHeight: 1.5, fontFamily: FONT }}>
          Check <strong style={{ color: TEXT }}>{email}</strong> for a password reset link
        </p>
        <button
          onClick={() => {
            setResetSent(false);
            switchMode("password");
          }}
          style={{
            ...submitBtnStyle(false),
            maxWidth: 200,
            margin: "0 auto",
            background: "rgba(255,255,255,0.08)",
            boxShadow: "none",
          }}
        >
          Back to Sign In
        </button>
      </div>
    );
  }

  // ── Determine form fields based on mode ────────────────────
  const showPasswordField = mode === "password" || mode === "signup";
  const showNameField = mode === "signup";
  const showTabs = mode === "password" || mode === "magic";
  const isFormDisabled = mode === "magic" || mode === "forgot" ? !email.trim() : !email.trim() || !password;

  const submitLabel =
    mode === "password"
      ? submitting
        ? "Signing in…"
        : "Sign In"
      : mode === "magic"
        ? submitting
          ? "Sending…"
          : "Send Magic Link"
        : mode === "signup"
          ? submitting
            ? "Creating…"
            : "Create Account"
          : submitting
            ? "Sending…"
            : "Send Reset Link";

  const headingLabel = mode === "signup" ? "Create Account" : mode === "forgot" ? "Reset Password" : null;

  return (
    <>
      {/* White flash overlay for sign-in transition */}
      {transitioning && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background:
              "radial-gradient(circle at 50% 45%, rgba(124,92,252,0.6) 0%, rgba(255,255,255,0.95) 50%, white 100%)",
            animation: "loginFadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both",
            pointerEvents: "all",
          }}
        />
      )}

      <div
        style={{
          width: "100%",
          maxWidth: 340,
          animation: "loginFadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        {/* Brand */}
        <div
          style={{
            textAlign: "center",
            marginBottom: 18,
            animation: "loginFadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both",
          }}
        >
          {/* Subtle glow line */}
          <div
            style={{
              height: 1,
              margin: "0 auto 16px",
              background: `linear-gradient(90deg, transparent, ${ACCENT}50, transparent)`,
              boxShadow: `0 0 12px ${ACCENT}30`,
              animation: "glowPulse 5s ease-in-out infinite",
            }}
          />
          <img
            src="/nova-logo-cut.svg"
            alt="NOVA"
            style={{
              height: 28,
              objectFit: "contain",
              display: "block",
              margin: "0 auto 2px",
              userSelect: "none",
              filter: "drop-shadow(0 2px 20px rgba(200,50,50,0.4))",
            }}
            draggable={false}
          />
          <p
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.16em",
              color: "rgba(238,237,245,0.30)",
              margin: 0,
              textTransform: "uppercase",
            }}
          >
            Construction Intelligence
          </p>
        </div>

        {/* Glass card */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.015) 100%)",
            backdropFilter: "blur(48px) saturate(1.6)",
            WebkitBackdropFilter: "blur(48px) saturate(1.6)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 16,
            padding: "20px 24px",
            boxShadow: [
              "0 24px 80px rgba(0,0,0,0.5)",
              "0 8px 32px rgba(0,0,0,0.35)",
              "inset 0 1px 0 rgba(255,255,255,0.05)",
            ].join(", "),
            animation: "loginFadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both",
          }}
        >
          {/* Mode heading (signup / forgot) */}
          {headingLabel && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => switchMode("password")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 2,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <svg
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={TEXT_MUTED}
                  strokeWidth={2}
                  strokeLinecap="round"
                >
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <span style={{ fontSize: 14, fontWeight: 600, color: TEXT, fontFamily: FONT }}>{headingLabel}</span>
            </div>
          )}

          {/* Mode tabs (password / magic link) */}
          {showTabs && (
            <div
              style={{
                display: "flex",
                background: "rgba(255,255,255,0.04)",
                borderRadius: 8,
                padding: 3,
                marginBottom: 18,
                gap: 2,
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              {[
                { key: "password", label: "Password" },
                { key: "magic", label: "Magic Link" },
              ].map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => switchMode(tab.key)}
                  style={{
                    flex: 1,
                    padding: "7px 0",
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

          <form onSubmit={handleSubmit}>
            {/* Full Name (signup only) */}
            {showNameField && (
              <>
                <label style={labelStyle}>Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Jane Smith"
                  style={{ ...inputStyle, marginBottom: 14 }}
                  onFocus={focusHandler}
                  onBlur={blurHandler}
                />
              </>
            )}

            <label style={labelStyle}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoFocus
              style={{ ...inputStyle, marginBottom: showPasswordField ? 14 : 18 }}
              onFocus={focusHandler}
              onBlur={blurHandler}
            />

            {/* Password field (password + signup modes) */}
            {showPasswordField && (
              <>
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}
                >
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Password</label>
                  {mode === "password" && (
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
                  )}
                </div>
                <div style={{ marginBottom: 18 }}>
                  <PasswordInput
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "Create a password" : "Enter your password"}
                  />
                </div>
              </>
            )}

            {/* Auth error */}
            {authError && (
              <div
                style={{
                  marginBottom: 12,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "rgba(255,69,58,0.08)",
                  border: "1px solid rgba(255,69,58,0.18)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  animation: "loginFadeIn 0.3s ease-out both",
                }}
              >
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#FF453A"
                  strokeWidth={2}
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span style={{ fontSize: 12, color: "#FF453A", fontFamily: FONT }}>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isFormDisabled || submitting}
              style={submitBtnStyle(isFormDisabled || submitting)}
            >
              {submitLabel}
            </button>
          </form>
        </div>

        {/* Footer links */}
        <div
          style={{
            textAlign: "center",
            marginTop: 14,
            animation: "loginFadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.35s both",
          }}
        >
          {mode === "signup" ? (
            <p style={{ fontSize: 12, color: "rgba(238,237,245,0.25)", margin: "0 0 12px" }}>
              Already have an account?{" "}
              <span
                onClick={() => switchMode("password")}
                style={{ color: ACCENT, fontWeight: 600, cursor: "pointer" }}
              >
                Sign in
              </span>
            </p>
          ) : (
            <p style={{ fontSize: 12, color: "rgba(238,237,245,0.25)", margin: "0 0 12px" }}>
              Don't have an account?{" "}
              <span
                onClick={() => switchMode("signup")}
                style={{ color: ACCENT, fontWeight: 600, cursor: "pointer" }}
              >
                Create one
              </span>
            </p>
          )}
          <p
            style={{
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: "0.12em",
              color: "rgba(238,237,245,0.15)",
              margin: 0,
              textTransform: "uppercase",
            }}
          >
            Powered by NOVA
          </p>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN EXPORT
   Black background, centered login card.
   ═══════════════════════════════════════════════════════════════ */

export default function LoginMockupPage() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#000000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <style>{keyframesCSS}</style>
      <LoginForm />
    </div>
  );
}
