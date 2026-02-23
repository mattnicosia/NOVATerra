import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/hooks/useTheme';
import Ic from '@/components/shared/Ic';
import BldgOmniLogo from '@/components/shared/BldgOmniLogo';
import NovaPortal from '@/components/nova/NovaPortal';
import { I } from '@/constants/icons';

export default function LoginPage() {
  const C = useTheme();
  const T = C.T;

  const signInWithMagicLink = useAuthStore(s => s.signInWithMagicLink);
  const signInWithPassword = useAuthStore(s => s.signInWithPassword);
  const signUpWithPassword = useAuthStore(s => s.signUpWithPassword);
  const authError = useAuthStore(s => s.authError);
  const magicLinkSent = useAuthStore(s => s.magicLinkSent);
  const clearError = useAuthStore(s => s.clearError);
  const clearMagicLinkSent = useAuthStore(s => s.clearMagicLinkSent);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState("magic"); // "magic" | "password" | "signup"
  const [submitting, setSubmitting] = useState(false);

  const handleMagicLink = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    await signInWithMagicLink(email.trim());
    setSubmitting(false);
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    await signInWithPassword(email.trim(), password);
    setSubmitting(false);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    await signUpWithPassword(email.trim(), password, fullName.trim());
    setSubmitting(false);
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    clearError();
    clearMagicLinkSent();
    setPassword("");
    setFullName("");
  };

  // Use light palette colors directly for the login page
  const bgColor = "#F5F5F7";
  const cardBg = "#FFFFFF";
  const textColor = "#1D1D1F";
  const textMuted = "#6E6E73";
  const textDim = "#AEAEB2";
  const borderColor = "#D1D1D6";
  const accentColor = "#FF7A3D";
  const accentDark = "#E06020";
  const greenColor = "#30D158";
  const redColor = "#FF3B30";

  // Magic link sent confirmation
  if (magicLinkSent) {
    return (
      <div style={{
        minHeight: "100vh",
        background: bgColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{
          background: cardBg,
          borderRadius: 16,
          padding: "48px 40px",
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
          border: `1px solid #E5E5EA`,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: `${greenColor}14`,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
          }}>
            <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={greenColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <path d="M22 4 12 14.01l-3-3" />
            </svg>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: textColor, marginBottom: 8 }}>
            Check your email
          </h2>
          <p style={{ fontSize: 14, color: textMuted, lineHeight: 1.6, marginBottom: 24 }}>
            We sent a sign-in link to <strong style={{ color: textColor }}>{email}</strong>. Click the link in your email to continue.
          </p>
          <button
            onClick={() => { clearMagicLinkSent(); clearError(); }}
            style={{
              background: "transparent",
              border: "none",
              color: accentColor,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: bgColor,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        background: cardBg,
        borderRadius: 16,
        padding: "48px 40px",
        maxWidth: 420,
        width: "100%",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
        border: `1px solid #E5E5EA`,
      }}>
        {/* Logo / Brand — NOVA Portal */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            position: "relative",
            width: 72, height: 72,
            margin: "0 auto 16px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {/* Glow ring behind portal */}
            <div style={{
              position: "absolute", top: -4, left: -4, right: -4, bottom: -4,
              borderRadius: "50%",
              boxShadow: "0 0 20px rgba(160,100,255,0.3), 0 0 40px rgba(100,50,220,0.12)",
              animation: "novaLoginGlow 4s ease-in-out infinite",
            }} />
            <NovaPortal size="floating" state="idle" />
          </div>
          <div style={{ marginBottom: 4 }}>
            <BldgOmniLogo size={26} color={textColor} />
          </div>
          <p style={{ fontSize: 13, color: textMuted, fontWeight: 500 }}>
            Powered by NOVA
          </p>
          <style>{`@keyframes novaLoginGlow { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 0.9; transform: scale(1.06); } }`}</style>
        </div>

        {/* Mode tabs */}
        <div style={{
          display: "flex",
          background: "#F0F0F2",
          borderRadius: 10,
          padding: 3,
          marginBottom: 24,
          gap: 2,
        }}>
          {[
            { key: "magic", label: "Magic Link" },
            { key: "password", label: "Password" },
            { key: "signup", label: "Sign Up" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => switchMode(tab.key)}
              style={{
                flex: 1,
                padding: "9px 0",
                fontSize: 13,
                fontWeight: mode === tab.key ? 600 : 500,
                fontFamily: "'DM Sans', sans-serif",
                color: mode === tab.key ? textColor : textMuted,
                background: mode === tab.key ? cardBg : "transparent",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                transition: "all 150ms ease-out",
                boxShadow: mode === tab.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Error message */}
        {authError && (
          <div style={{
            background: `${redColor}0D`,
            border: `1px solid ${redColor}30`,
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={redColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span style={{ fontSize: 13, color: redColor, fontWeight: 500 }}>
              {authError}
            </span>
          </div>
        )}

        {/* Magic Link Form */}
        {mode === "magic" && (
          <form onSubmit={handleMagicLink}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoFocus
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                fontSize: 15,
                fontFamily: "'DM Sans', sans-serif",
                border: `1px solid ${borderColor}`,
                borderRadius: 10,
                outline: "none",
                background: cardBg,
                color: textColor,
                marginBottom: 20,
                transition: "border-color 150ms, box-shadow 150ms",
              }}
              onFocus={e => { e.target.style.borderColor = accentColor; e.target.style.boxShadow = `0 0 0 3px ${accentColor}18`; }}
              onBlur={e => { e.target.style.borderColor = borderColor; e.target.style.boxShadow = "none"; }}
            />
            <button
              type="submit"
              disabled={submitting || !email.trim()}
              style={{
                width: "100%",
                padding: "12px 0",
                fontSize: 15,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                color: "#fff",
                background: submitting ? textDim : accentColor,
                border: "none",
                borderRadius: 10,
                cursor: submitting ? "default" : "pointer",
                transition: "all 150ms ease-out",
                boxShadow: submitting ? "none" : `0 4px 12px ${accentColor}30`,
              }}
            >
              {submitting ? "Sending..." : "Send Magic Link"}
            </button>
            <p style={{ fontSize: 12, color: textDim, textAlign: "center", marginTop: 16, lineHeight: 1.5 }}>
              No password needed. We'll email you a secure sign-in link.
            </p>
          </form>
        )}

        {/* Password Login Form */}
        {mode === "password" && (
          <form onSubmit={handlePasswordLogin}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoFocus
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                fontSize: 15,
                fontFamily: "'DM Sans', sans-serif",
                border: `1px solid ${borderColor}`,
                borderRadius: 10,
                outline: "none",
                background: cardBg,
                color: textColor,
                marginBottom: 16,
                transition: "border-color 150ms, box-shadow 150ms",
              }}
              onFocus={e => { e.target.style.borderColor = accentColor; e.target.style.boxShadow = `0 0 0 3px ${accentColor}18`; }}
              onBlur={e => { e.target.style.borderColor = borderColor; e.target.style.boxShadow = "none"; }}
            />
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                fontSize: 15,
                fontFamily: "'DM Sans', sans-serif",
                border: `1px solid ${borderColor}`,
                borderRadius: 10,
                outline: "none",
                background: cardBg,
                color: textColor,
                marginBottom: 20,
                transition: "border-color 150ms, box-shadow 150ms",
              }}
              onFocus={e => { e.target.style.borderColor = accentColor; e.target.style.boxShadow = `0 0 0 3px ${accentColor}18`; }}
              onBlur={e => { e.target.style.borderColor = borderColor; e.target.style.boxShadow = "none"; }}
            />
            <button
              type="submit"
              disabled={submitting || !email.trim() || !password}
              style={{
                width: "100%",
                padding: "12px 0",
                fontSize: 15,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                color: "#fff",
                background: submitting ? textDim : accentColor,
                border: "none",
                borderRadius: 10,
                cursor: submitting ? "default" : "pointer",
                transition: "all 150ms ease-out",
                boxShadow: submitting ? "none" : `0 4px 12px ${accentColor}30`,
              }}
            >
              {submitting ? "Signing in..." : "Sign In"}
            </button>
          </form>
        )}

        {/* Sign Up Form */}
        {mode === "signup" && (
          <form onSubmit={handleSignUp}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="John Smith"
              autoFocus
              style={{
                width: "100%",
                padding: "12px 14px",
                fontSize: 15,
                fontFamily: "'DM Sans', sans-serif",
                border: `1px solid ${borderColor}`,
                borderRadius: 10,
                outline: "none",
                background: cardBg,
                color: textColor,
                marginBottom: 16,
                transition: "border-color 150ms, box-shadow 150ms",
              }}
              onFocus={e => { e.target.style.borderColor = accentColor; e.target.style.boxShadow = `0 0 0 3px ${accentColor}18`; }}
              onBlur={e => { e.target.style.borderColor = borderColor; e.target.style.boxShadow = "none"; }}
            />
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                fontSize: 15,
                fontFamily: "'DM Sans', sans-serif",
                border: `1px solid ${borderColor}`,
                borderRadius: 10,
                outline: "none",
                background: cardBg,
                color: textColor,
                marginBottom: 16,
                transition: "border-color 150ms, box-shadow 150ms",
              }}
              onFocus={e => { e.target.style.borderColor = accentColor; e.target.style.boxShadow = `0 0 0 3px ${accentColor}18`; }}
              onBlur={e => { e.target.style.borderColor = borderColor; e.target.style.boxShadow = "none"; }}
            />
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Create a password"
              required
              minLength={6}
              style={{
                width: "100%",
                padding: "12px 14px",
                fontSize: 15,
                fontFamily: "'DM Sans', sans-serif",
                border: `1px solid ${borderColor}`,
                borderRadius: 10,
                outline: "none",
                background: cardBg,
                color: textColor,
                marginBottom: 20,
                transition: "border-color 150ms, box-shadow 150ms",
              }}
              onFocus={e => { e.target.style.borderColor = accentColor; e.target.style.boxShadow = `0 0 0 3px ${accentColor}18`; }}
              onBlur={e => { e.target.style.borderColor = borderColor; e.target.style.boxShadow = "none"; }}
            />
            <button
              type="submit"
              disabled={submitting || !email.trim() || !password}
              style={{
                width: "100%",
                padding: "12px 0",
                fontSize: 15,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                color: "#fff",
                background: submitting ? textDim : accentColor,
                border: "none",
                borderRadius: 10,
                cursor: submitting ? "default" : "pointer",
                transition: "all 150ms ease-out",
                boxShadow: submitting ? "none" : `0 4px 12px ${accentColor}30`,
              }}
            >
              {submitting ? "Creating account..." : "Create Account"}
            </button>
            <p style={{ fontSize: 12, color: textDim, textAlign: "center", marginTop: 16, lineHeight: 1.5 }}>
              Password must be at least 6 characters.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
