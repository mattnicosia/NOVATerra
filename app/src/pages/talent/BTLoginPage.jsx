import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/stores/authStore";
import { inp, accentButton, bt } from "@/utils/styles";
import { BT_BRAND, BT_COLORS } from "@/constants/btBrand";

function LoginForm() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const signInWithPassword = useAuthStore(s => s.signInWithPassword);
  const resetPassword = useAuthStore(s => s.resetPassword);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [, setShowForgot] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError("");

    if (!email.trim()) return setError("Email is required.");
    if (!password) return setError("Password is required.");

    setLoading(true);
    try {
      const result = await signInWithPassword(email, password);

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      navigate("/assessment");
    } catch (err) {
      setError(err.message || "Sign in failed.");
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError("");
    if (!email.trim()) {
      setError("Enter your email above, then click forgot password.");
      return;
    }
    setLoading(true);
    const result = await resetPassword(email);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setResetSent(true);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={cardContainerStyle(T)}>
        <BrandHeader T={T} />

        {resetSent ? (
          <div style={{ textAlign: "center", padding: `${T.space[5]}px 0` }}>
            <div
              style={{
                fontSize: T.fontSize.lg,
                fontWeight: T.fontWeight.bold,
                color: "#EEEDF5",
                marginBottom: T.space[3],
                fontFamily: T.font.sans,
              }}
            >
              Check your email
            </div>
            <div
              style={{
                fontSize: T.fontSize.base,
                color: "rgba(238,237,245,0.55)",
                lineHeight: T.lineHeight.relaxed,
                fontFamily: T.font.sans,
              }}
            >
              We sent a password reset link to <strong style={{ color: "#EEEDF5" }}>{email}</strong>.
            </div>
            <button
              onClick={() => {
                setResetSent(false);
                setShowForgot(false);
              }}
              style={{
                ...bt(C, {
                  background: "none",
                  color: BT_COLORS.primary,
                  fontSize: T.fontSize.sm,
                  padding: "8px 0",
                  marginTop: T.space[4],
                  fontFamily: T.font.sans,
                }),
              }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: T.space[4] }}>
            {/* Email */}
            <div>
              <label style={labelStyle(T)}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jane@company.com"
                style={fieldStyle(C, T)}
              />
            </div>

            {/* Password */}
            <div>
              <label style={labelStyle(T)}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                style={fieldStyle(C, T)}
              />
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  fontSize: T.fontSize.sm,
                  color: BT_COLORS.danger,
                  background: `${BT_COLORS.danger}12`,
                  border: `1px solid ${BT_COLORS.danger}30`,
                  borderRadius: T.radius.sm,
                  padding: `${T.space[2]}px ${T.space[3]}px`,
                  fontFamily: T.font.sans,
                }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                ...accentButton(C, {
                  width: "100%",
                  justifyContent: "center",
                  padding: "12px 18px",
                  fontSize: T.fontSize.md,
                  opacity: loading ? 0.6 : 1,
                  background: `linear-gradient(135deg, ${BT_COLORS.primary}, #9B7DFC)`,
                  marginTop: T.space[1],
                }),
              }}
            >
              {loading ? "Signing In..." : "Sign In"}
            </button>

            {/* Forgot password */}
            <div style={{ textAlign: "center" }}>
              <button
                type="button"
                onClick={handleForgotPassword}
                style={{
                  ...bt(C, {
                    background: "none",
                    color: "rgba(238,237,245,0.4)",
                    fontSize: T.fontSize.sm,
                    padding: 0,
                    fontFamily: T.font.sans,
                  }),
                }}
              >
                Forgot password?
              </button>
            </div>
          </form>
        )}

        <FooterLinks T={T} />
      </div>
    </div>
  );
}

// ── Brand header ──
function BrandHeader({ T }) {
  return (
    <div style={{ textAlign: "center", marginBottom: T.space[6] }}>
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          color: "#EEEDF5",
          letterSpacing: 1.5,
          fontFamily: T.font.sans,
          marginBottom: T.space[1],
        }}
      >
        {BT_BRAND.name.split(" ")[0]}{" "}
        <span style={{ fontWeight: 500, color: "rgba(238,237,245,0.7)" }}>{BT_BRAND.name.split(" ")[1]}</span>
      </div>
      <div
        style={{
          fontSize: T.fontSize.sm,
          color: "rgba(238,237,245,0.4)",
          letterSpacing: 2,
          textTransform: "uppercase",
          fontFamily: T.font.sans,
          marginBottom: T.space[2],
        }}
      >
        {BT_BRAND.tagline}
      </div>
      <div
        style={{
          fontSize: T.fontSize.xs,
          color: BT_COLORS.primary,
          fontWeight: 600,
          letterSpacing: 1.5,
          fontFamily: T.font.sans,
        }}
      >
        {BT_BRAND.poweredBy}
      </div>
    </div>
  );
}

// ── Footer links ──
function FooterLinks({ T }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: T.space[2],
        marginTop: T.space[5],
      }}
    >
      <Link to="/talent/register" style={linkStyle(T)}>
        Don't have an account? <span style={{ color: BT_COLORS.primary }}>Register</span>
      </Link>
      <Link to="/" style={linkStyle(T)}>
        Looking for <span style={{ color: BT_COLORS.primary }}>NOVATerra</span>?
      </Link>
    </div>
  );
}

// ── Styles ──
const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(180deg, #06060C 0%, #0C0B14 50%, #12101C 100%)",
  fontFamily: T.font.sans,
  padding: 20,
};

const cardContainerStyle = T => ({
  width: "100%",
  maxWidth: 440,
  background: "rgba(18,16,28,0.85)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: T.radius.lg,
  padding: `${T.space[8]}px ${T.space[7]}px`,
  boxShadow: "0 16px 48px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.05)",
});

const labelStyle = T => ({
  display: "block",
  fontSize: T.fontSize.xs,
  fontWeight: 600,
  color: "rgba(238,237,245,0.45)",
  textTransform: "uppercase",
  letterSpacing: 1.2,
  marginBottom: T.space[1],
  fontFamily: T.font.sans,
});

const fieldStyle = (C, T) => ({
  ...inp(C),
  background: "rgba(0,0,0,0.35)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#EEEDF5",
  padding: "10px 14px",
  fontSize: T.fontSize.base,
  borderRadius: T.radius.sm,
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
  fontFamily: T.font.sans,
  transition: "border-color 150ms ease",
});

const linkStyle = T => ({
  fontSize: T.fontSize.sm,
  color: "rgba(238,237,245,0.45)",
  textDecoration: "none",
  fontFamily: T.font.sans,
  transition: "color 150ms ease",
});

// ── Wrapped export with ThemeProvider ──
export default function BTLoginPage() {
  return (
    <ThemeProvider>
      <LoginForm />
    </ThemeProvider>
  );
}
