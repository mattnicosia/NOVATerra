import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useOrgStore } from "@/stores/orgStore";
import { COLORS, SPACING, MOTION } from "@/constants/designTokens";

/* ────────────────────────────────────────────────────────────────
   LoginMockupPage — Board Spec IV: Pure void login
   #08090E background, no card, no glass, no gradient.
   Fields float in space. Two-beat entrance animation.
   ──────────────────────────────────────────────────────────────── */

const FONT = "'Switzer', -apple-system, BlinkMacSystemFont, sans-serif";
const ACCENT = COLORS.accent.DEFAULT;     // #7C6BF0
const ACCENT_HOVER = COLORS.accent.hover; // #9B8AFB
const TEXT = COLORS.text.primary;         // #FAFAFA
const TEXT_SEC = COLORS.text.secondary;   // #A1A1AA
const TEXT_DIM = COLORS.text.tertiary;    // #52525B
const BORDER = COLORS.border.subtle;      // #25253A
const INPUT_BG = COLORS.bg.surface;       // #1A1A24
const BG = COLORS.bg.primary;            // #08090E

const keyframesCSS = `
@keyframes loginWordmarkIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes loginFormIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes loginFadeUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes loginFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
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
  borderRadius: SPACING.inputRadius,
  outline: "none",
  background: INPUT_BG,
  color: TEXT,
  transition: `border-color ${MOTION.slow}, box-shadow ${MOTION.slow}`,
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
    background: disabled ? "rgba(255,255,255,0.08)" : ACCENT,
    border: disabled ? "none" : "1px solid rgba(255,255,255,0.1)",
    borderRadius: SPACING.buttonRadius,
    cursor: disabled ? "default" : "pointer",
    transition: `all ${MOTION.slow} ease-out`,
    opacity: disabled ? 0.5 : 1,
  };
}

const focusHandler = e => {
  e.target.style.borderColor = ACCENT;
  e.target.style.boxShadow = `0 0 0 2px rgba(124,107,240,0.15)`;
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
   LOGIN FORM — fields float in void, no card container
   ═══════════════════════════════════════════════════════════════ */

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState(() => {
    if (localStorage.getItem("pendingInviteToken")) return "signup";
    return "password";
  });
  const [wordmarkVisible, setWordmarkVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Invite state — locked email when signing up via invitation link
  const [inviteData, setInviteData] = useState(null); // { email, org_name, role }
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState(null);

  // Auth store
  const signInWithPassword = useAuthStore(s => s.signInWithPassword);
  const signInWithMagicLink = useAuthStore(s => s.signInWithMagicLink);
  const signUpWithPassword = useAuthStore(s => s.signUpWithPassword);
  const resetPasswordFn = useAuthStore(s => s.resetPassword);
  const authError = useAuthStore(s => s.authError);
  const magicLinkSent = useAuthStore(s => s.magicLinkSent);
  const clearError = useAuthStore(s => s.clearError);
  const clearMagicLinkSent = useAuthStore(s => s.clearMagicLinkSent);

  // Lookup invitation on mount when invite token exists — locks email to invited address
  useEffect(() => {
    if (mode !== "signup") return;
    const token = localStorage.getItem("pendingInviteToken");
    if (!token) return;
    let cancelled = false;
    setInviteLoading(true);
    useOrgStore.getState().lookupInvitation(token).then(result => {
      if (cancelled) return;
      setInviteLoading(false);
      if (result?.error) {
        setInviteError(result.error);
        // Bad token — clear it and let them sign in normally
        localStorage.removeItem("pendingInviteToken");
        setTimeout(() => setMode("password"), 3000);
      } else if (result?.email) {
        setInviteData(result);
        setEmail(result.email);
      }
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Two-beat entrance: wordmark first, then form
  // Skip animation for returning users (existing session in storage)
  useEffect(() => {
    const hasSession = !!localStorage.getItem("sb-auth-token") || !!sessionStorage.getItem("sb-auth-token");
    if (hasSession) {
      setWordmarkVisible(true);
      setFormVisible(true);
      return;
    }
    const t1 = setTimeout(() => setWordmarkVisible(true), 50);
    const t2 = setTimeout(() => setFormVisible(true), 350); // 300ms after wordmark
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Mode switching
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
  // Email validation helper
  const isValidEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const [validationError, setValidationError] = useState("");

  const handlePasswordLogin = useCallback(
    async e => {
      e.preventDefault();
      setValidationError("");
      if (!email.trim() || !password) return;
      if (!isValidEmail(email.trim())) { setValidationError("Please enter a valid email address"); return; }
      setSubmitting(true);
      const result = await signInWithPassword(email.trim(), password);
      setSubmitting(false);
      if (!result?.error) setTransitioning(true);
    },
    [email, password, signInWithPassword],
  );

  const handleMagicLink = useCallback(
    async e => {
      e.preventDefault();
      setValidationError("");
      if (!email.trim()) return;
      if (!isValidEmail(email.trim())) { setValidationError("Please enter a valid email address"); return; }
      setSubmitting(true);
      await signInWithMagicLink(email.trim());
      setSubmitting(false);
    },
    [email, signInWithMagicLink],
  );

  const handleSignUp = useCallback(
    async e => {
      e.preventDefault();
      setValidationError("");
      if (!email.trim() || !password) return;
      if (!isValidEmail(email.trim())) { setValidationError("Please enter a valid email address"); return; }
      if (password.length < 8) { setValidationError("Password must be at least 8 characters"); return; }
      setSubmitting(true);
      const result = await signUpWithPassword(email.trim(), password, fullName.trim());
      setSubmitting(false);
      if (result?.success && !result?.confirmEmail) setTransitioning(true);
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
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#30D158" strokeWidth={2.5} strokeLinecap="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: TEXT, margin: "0 0 8px", fontFamily: FONT }}>
          Check your email
        </h2>
        <p style={{ fontSize: 13, color: TEXT_SEC, margin: "0 0 24px", lineHeight: 1.5, fontFamily: FONT }}>
          We sent a {mode === "magic" ? "magic link" : "confirmation link"} to{" "}
          <strong style={{ color: TEXT }}>{email}</strong>
        </p>
        <button
          onClick={() => { clearMagicLinkSent?.(); switchMode("password"); }}
          style={{ ...submitBtnStyle(false), maxWidth: 200, margin: "0 auto", background: "rgba(255,255,255,0.08)", border: "none" }}
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
            background: `${ACCENT}1A`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 18px",
            border: `1px solid ${ACCENT}40`,
          }}
        >
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth={2} strokeLinecap="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: TEXT, margin: "0 0 8px", fontFamily: FONT }}>
          Reset link sent
        </h2>
        <p style={{ fontSize: 13, color: TEXT_SEC, margin: "0 0 24px", lineHeight: 1.5, fontFamily: FONT }}>
          Check <strong style={{ color: TEXT }}>{email}</strong> for a password reset link
        </p>
        <button
          onClick={() => { setResetSent(false); switchMode("password"); }}
          style={{ ...submitBtnStyle(false), maxWidth: 200, margin: "0 auto", background: "rgba(255,255,255,0.08)", border: "none" }}
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
      ? submitting ? "Signing in\u2026" : "Sign In"
      : mode === "magic"
        ? submitting ? "Sending\u2026" : "Send Magic Link"
        : mode === "signup"
          ? submitting ? "Creating\u2026" : "Create Account"
          : submitting ? "Sending\u2026" : "Send Reset Link";

  const headingLabel = mode === "signup" ? "Create Account" : mode === "forgot" ? "Reset Password" : null;

  return (
    <>
      {/* Transition overlay */}
      {transitioning && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: `radial-gradient(circle at 50% 45%, ${ACCENT}99 0%, rgba(255,255,255,0.95) 50%, white 100%)`,
            animation: "loginFadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both",
            pointerEvents: "all",
          }}
        />
      )}

      <div style={{ width: "100%", maxWidth: 340 }}>
        {/* NOVA Wordmark — first beat */}
        <div
          style={{
            textAlign: "center",
            marginBottom: 32,
            opacity: wordmarkVisible ? 1 : 0,
            transition: `opacity 300ms ${MOTION.easeOut}`,
          }}
        >
          <h1
            style={{
              fontSize: 32,
              fontWeight: 300,
              letterSpacing: "0.35em",
              color: TEXT_SEC,
              margin: "0 0 8px",
              fontFamily: FONT,
              textTransform: "uppercase",
            }}
          >
            NOVA
          </h1>
          <p
            style={{
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: "0.15em",
              color: TEXT_DIM,
              margin: 0,
              textTransform: "uppercase",
            }}
          >
            CONSTRUCTION INTELLIGENCE
          </p>
        </div>

        {/* Form — second beat, no card container */}
        <div
          style={{
            opacity: formVisible ? 1 : 0,
            transform: formVisible ? "translateY(0)" : "translateY(12px)",
            transition: `opacity 200ms ${MOTION.easeOut}, transform 200ms ${MOTION.easeOut}`,
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
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={TEXT_SEC} strokeWidth={2} strokeLinecap="round">
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
                background: INPUT_BG,
                borderRadius: SPACING.inputRadius,
                padding: 3,
                marginBottom: 18,
                gap: 2,
                border: `1px solid ${BORDER}`,
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
                    color: mode === tab.key ? TEXT : TEXT_SEC,
                    background: mode === tab.key ? "rgba(255,255,255,0.08)" : "transparent",
                    border: "none",
                    borderRadius: 7,
                    cursor: "pointer",
                    transition: `all ${MOTION.medium} ease-out`,
                    boxShadow: mode === tab.key ? "0 1px 4px rgba(0,0,0,0.3)" : "none",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Invite banner */}
          {inviteData && mode === "signup" && (
            <div style={{
              marginBottom: 20, padding: "12px 16px", borderRadius: 8,
              background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
              fontSize: 12, lineHeight: 1.5, color: "#A5B4FC", fontFamily: FONT,
            }}>
              You've been invited to join <strong style={{ color: "#E0E7FF" }}>{inviteData.org_name}</strong> as
              an {inviteData.role}. Sign up with your invited email below.
            </div>
          )}
          {inviteError && (
            <div style={{
              marginBottom: 20, padding: "12px 16px", borderRadius: 8,
              background: "rgba(255,69,58,0.08)", border: "1px solid rgba(255,69,58,0.2)",
              fontSize: 12, lineHeight: 1.5, color: "#FF453A", fontFamily: FONT,
            }}>
              {inviteError === "Invalid or expired invitation"
                ? "This invitation link is invalid or has expired. Contact your admin for a new invite."
                : inviteError}
            </div>
          )}
          {inviteLoading && (
            <div style={{
              marginBottom: 20, padding: "16px", textAlign: "center",
              fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: FONT,
            }}>
              Verifying invitation...
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
                  autoFocus={!!inviteData}
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
              onChange={e => { if (!inviteData) { setEmail(e.target.value); setValidationError(""); } }}
              placeholder="you@company.com"
              readOnly={!!inviteData}
              autoFocus={!inviteData}
              autoComplete="email"
              style={{
                ...inputStyle,
                marginBottom: showPasswordField ? 14 : 18,
                ...(inviteData ? { opacity: 0.6, cursor: "not-allowed", background: "rgba(255,255,255,0.02)" } : {}),
              }}
              onFocus={inviteData ? undefined : focusHandler}
              onBlur={inviteData ? undefined : blurHandler}
            />
            {validationError && (
              <p style={{ fontSize: 12, color: "#FF453A", margin: "-8px 0 10px", fontFamily: FONT }}>{validationError}</p>
            )}

            {/* Password field */}
            {showPasswordField && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
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
                <div style={{ marginBottom: mode === "signup" ? 6 : 18 }}>
                  <PasswordInput
                    value={password}
                    onChange={e => { setPassword(e.target.value); setValidationError(""); }}
                    placeholder={mode === "signup" ? "Create a password" : "Enter your password"}
                  />
                </div>
                {mode === "signup" && (
                  <p style={{ fontSize: 11, color: password.length >= 8 ? "rgba(48,209,88,0.7)" : TEXT_SEC, margin: "0 0 14px", fontFamily: FONT }}>
                    {password.length >= 8 ? "✓ " : ""}Minimum 8 characters
                  </p>
                )}
              </>
            )}

            {/* Auth error */}
            {authError && (
              <div
                style={{
                  marginBottom: 12,
                  padding: "8px 12px",
                  borderRadius: SPACING.inputRadius,
                  background: "rgba(255,69,58,0.08)",
                  border: "1px solid rgba(255,69,58,0.18)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  animation: "loginFadeIn 0.3s ease-out both",
                }}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth={2} strokeLinecap="round">
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
              onMouseEnter={e => {
                if (!isFormDisabled && !submitting) {
                  e.currentTarget.style.background = ACCENT_HOVER;
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = `0 4px 16px ${COLORS.accent.shadow}`;
                }
              }}
              onMouseLeave={e => {
                if (!isFormDisabled && !submitting) {
                  e.currentTarget.style.background = ACCENT;
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }
              }}
            >
              {submitting && (
                <span style={{
                  display: "inline-block", width: 14, height: 14,
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff", borderRadius: "50%",
                  animation: "spin 0.6s linear infinite",
                  marginRight: 8, verticalAlign: "middle",
                }} />
              )}
              {submitLabel}
            </button>
          </form>
        </div>

        {/* Footer links */}
        <div
          style={{
            textAlign: "center",
            marginTop: 20,
            opacity: formVisible ? 1 : 0,
            transition: `opacity 200ms ${MOTION.easeOut}`,
          }}
        >
          {mode === "signup" ? (
            <p style={{ fontSize: 12, color: TEXT_DIM, margin: "0 0 12px" }}>
              Already have an account?{" "}
              <span onClick={() => switchMode("password")} style={{ color: ACCENT, fontWeight: 600, cursor: "pointer" }}>
                Sign in
              </span>
            </p>
          ) : (
            <p style={{ fontSize: 12, color: TEXT_DIM, margin: "0 0 12px" }}>
              Don't have an account?{" "}
              <span onClick={() => switchMode("signup")} style={{ color: ACCENT, fontWeight: 600, cursor: "pointer" }}>
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
   MAIN EXPORT — Pure void background
   ═══════════════════════════════════════════════════════════════ */

export default function LoginMockupPage() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: BG,
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
