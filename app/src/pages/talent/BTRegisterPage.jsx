import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/utils/supabase";
import { inp, accentButton } from "@/utils/styles";
import { BT_BRAND, BT_COLORS } from "@/constants/btBrand";

const EXPERIENCE_OPTIONS = ["0-2", "3-5", "6-10", "11-15", "16-20", "20+"];

function RegisterForm() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const signUpWithPassword = useAuthStore(s => s.signUpWithPassword);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [experience, setExperience] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);

  const validateEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const handleSubmit = async e => {
    e.preventDefault();
    setError("");

    if (!fullName.trim()) return setError("Full name is required.");
    if (!validateEmail(email)) return setError("Please enter a valid email.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");

    setLoading(true);
    try {
      const result = await signUpWithPassword(email, password, fullName.trim());

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      if (result.confirmEmail) {
        setConfirmEmail(true);
        setLoading(false);
        return;
      }

      // Insert into bt_user_roles (graceful fail if table doesn't exist)
      if (supabase && result.success) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            await supabase.from("bt_user_roles").insert({
              user_id: user.id,
              role: "candidate",
            });
            // Insert candidate profile
            await supabase.from("bt_candidates").insert({
              user_id: user.id,
              full_name: fullName.trim(),
              email,
              years_experience: experience || null,
            });
          }
        } catch {
          // Table doesn't exist yet — continue
        }
      }

      navigate("/assessment");
    } catch (err) {
      setError(err.message || "Registration failed.");
      setLoading(false);
    }
  };

  if (confirmEmail) {
    return (
      <div style={pageStyle}>
        <div style={cardContainerStyle(T)}>
          <BrandHeader T={T} />
          <div style={{ textAlign: "center", padding: `${T.space[6]}px 0` }}>
            <div
              style={{
                fontSize: T.fontSize.xl,
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
              We sent a confirmation link to <strong style={{ color: "#EEEDF5" }}>{email}</strong>. Click the link to
              activate your account.
            </div>
          </div>
          <FooterLinks T={T} mode="register" />
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardContainerStyle(T)}>
        <BrandHeader T={T} />

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: T.space[4] }}>
          {/* Full Name */}
          <div>
            <label style={labelStyle(T)}>Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Jane Smith"
              style={fieldStyle(C, T)}
            />
          </div>

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
              placeholder="Min 6 characters"
              style={fieldStyle(C, T)}
            />
          </div>

          {/* Years of Experience */}
          <div>
            <label style={labelStyle(T)}>Years of Experience</label>
            <select
              value={experience}
              onChange={e => setExperience(e.target.value)}
              style={{
                ...fieldStyle(C, T),
                appearance: "none",
                cursor: "pointer",
                color: experience ? "#EEEDF5" : "rgba(238,237,245,0.35)",
              }}
            >
              <option value="" disabled>
                Select range
              </option>
              {EXPERIENCE_OPTIONS.map(opt => (
                <option key={opt} value={opt} style={{ color: "#EEEDF5", background: "#12101C" }}>
                  {opt} years
                </option>
              ))}
            </select>
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
            {loading ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        <FooterLinks T={T} mode="register" />
      </div>
    </div>
  );
}

// ── Brand header ──
function BrandHeader({ T }) {
  return (
    <div style={{ textAlign: "center", marginBottom: T.space[6] }}>
      {/* BLDG Talent wordmark */}
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
      {/* Tagline */}
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
      {/* Powered by */}
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
function FooterLinks({ T, mode }) {
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
      {mode === "register" ? (
        <Link to="/talent/login" style={linkStyle(T)}>
          Already have an account? <span style={{ color: BT_COLORS.primary }}>Sign in</span>
        </Link>
      ) : (
        <Link to="/talent/register" style={linkStyle(T)}>
          Don't have an account? <span style={{ color: BT_COLORS.primary }}>Register</span>
        </Link>
      )}
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
export default function BTRegisterPage() {
  return (
    <ThemeProvider>
      <RegisterForm />
    </ThemeProvider>
  );
}
