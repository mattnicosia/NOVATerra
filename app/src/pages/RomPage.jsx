// RomPage — /rom page with inline signup gate + ROM funnel
// Requires account creation to use. Wraps in ThemeProvider for dark aesthetic.

import { useState, useRef } from "react";
import { ThemeProvider } from "@/hooks/useTheme";
import { useTheme } from "@/hooks/useTheme";
import { T } from "@/utils/designTokens";
import { useAuthStore } from "@/stores/authStore";
import { useRomStore } from "@/stores/romStore";
import { generateBaselineROM } from "@/utils/romEngine";
import { inp, accentButton, card, sectionLabel } from "@/utils/styles";
import RomResult from "@/components/rom/RomResult";
import RomUpsell from "@/components/rom/RomUpsell";

/* ── Building type options ── */
const BUILDING_TYPES = [
  { value: "commercial-office", label: "Commercial Office" },
  { value: "retail", label: "Retail" },
  { value: "healthcare", label: "Healthcare" },
  { value: "education", label: "Education" },
  { value: "industrial", label: "Industrial" },
  { value: "residential-multi", label: "Residential - Multi-Family" },
  { value: "hospitality", label: "Hospitality" },
  { value: "residential-single", label: "Residential - Single Family" },
  { value: "mixed-use", label: "Mixed-Use" },
  { value: "government", label: "Government" },
  { value: "religious", label: "Religious" },
  { value: "restaurant", label: "Restaurant" },
  { value: "parking", label: "Parking" },
];

/* ── Inline signup form (email + password — Elon's rule: 2 fields, 1 button) ── */
function RomSignup() {
  const C = useTheme();
  const signUp = useAuthStore(s => s.signUpWithPassword);
  const signIn = useAuthStore(s => s.signInWithPassword);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("signup"); // signup | login
  const [confirmEmail, setConfirmEmail] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setConfirmEmail(false);
    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const result = await signUp(email.trim(), password);
        if (result?.confirmEmail) {
          // Supabase requires email confirmation — show message
          setConfirmEmail(true);
        } else if (result?.error) {
          const errMsg = typeof result.error === "string" ? result.error : result.error.message || "Signup failed";
          // If "already registered", switch to login automatically
          if (errMsg.toLowerCase().includes("already")) {
            const loginResult = await signIn(email.trim(), password);
            if (loginResult?.error) {
              const loginErr =
                typeof loginResult.error === "string" ? loginResult.error : loginResult.error.message || "Login failed";
              setError(loginErr);
            }
          } else {
            setError(errMsg);
          }
        }
      } else {
        const result = await signIn(email.trim(), password);
        if (result?.error) {
          const errMsg = typeof result.error === "string" ? result.error : result.error.message || "Login failed";
          setError(errMsg);
        }
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    }
    setLoading(false);
  }

  const labelStyle = {
    ...sectionLabel(C),
    display: "block",
    marginBottom: 6,
    fontSize: 11,
  };

  return (
    <div style={{ width: "100%", maxWidth: 480 }}>
      <div style={card(C, { padding: T.space[7] })}>
        {/* Header */}
        <div style={{ marginBottom: T.space[6], textAlign: "center" }}>
          <h2
            style={{
              fontSize: T.fontSize["2xl"],
              fontWeight: T.fontWeight.bold,
              color: C.text,
              fontFamily: "'DM Sans',sans-serif",
              margin: 0,
              marginBottom: T.space[2],
            }}
          >
            Free ROM Estimate
          </h2>
          <p
            style={{
              fontSize: T.fontSize.md,
              color: C.textMuted,
              fontFamily: "'DM Sans',sans-serif",
              margin: 0,
              lineHeight: T.lineHeight.relaxed,
            }}
          >
            Get a division-level Rough Order of Magnitude in seconds.
            <br />
            Create a free account to get started.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div style={{ marginBottom: T.space[4] }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={inp(C)}
              autoComplete="email"
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: T.space[5] }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              placeholder={mode === "signup" ? "Create a password" : "Your password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={inp(C)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                color: C.red || "#FB7185",
                fontSize: 12,
                marginBottom: T.space[4],
                fontFamily: "'DM Sans',sans-serif",
                textAlign: "center",
              }}
            >
              {error}
            </div>
          )}

          {/* Email confirmation notice */}
          {confirmEmail && (
            <div
              style={{
                background: "rgba(56,189,248,0.08)",
                border: "1px solid rgba(56,189,248,0.25)",
                borderRadius: T.radius.lg,
                padding: `${T.space[4]}px ${T.space[5]}px`,
                marginBottom: T.space[4],
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: T.fontWeight.semibold, color: "#38BDF8", marginBottom: 4 }}>
                Check your email
              </div>
              <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
                We sent a confirmation link to <strong style={{ color: C.text }}>{email}</strong>.
                <br />
                Click the link, then come back here and sign in.
              </div>
              <div
                onClick={() => {
                  setConfirmEmail(false);
                  setMode("login");
                }}
                style={{
                  fontSize: 12,
                  color: C.accent,
                  cursor: "pointer",
                  marginTop: 8,
                  fontWeight: T.fontWeight.medium,
                }}
              >
                Ready to sign in
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={accentButton(C, {
              width: "100%",
              justifyContent: "center",
              padding: "13px 24px",
              fontSize: T.fontSize.lg,
              fontWeight: T.fontWeight.bold,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? "wait" : "pointer",
            })}
          >
            {loading ? "One moment..." : mode === "signup" ? "Create Account & Generate ROM" : "Sign In & Generate ROM"}
          </button>
        </form>

        {/* Toggle signup/login */}
        <div
          style={{
            textAlign: "center",
            marginTop: T.space[5],
            fontSize: T.fontSize.sm,
            color: C.textMuted,
            fontFamily: "'DM Sans',sans-serif",
          }}
        >
          {mode === "signup" ? "Already have an account? " : "Don't have an account? "}
          <span
            onClick={() => {
              setMode(mode === "signup" ? "login" : "signup");
              setError("");
            }}
            style={{
              color: C.accent,
              cursor: "pointer",
              fontWeight: T.fontWeight.medium,
            }}
          >
            {mode === "signup" ? "Sign in" : "Create one"}
          </span>
        </div>

        {/* Powered by */}
        <div
          style={{
            textAlign: "center",
            marginTop: T.space[5],
            fontSize: T.fontSize.xs,
            color: C.textDim,
            fontFamily: "'DM Sans',sans-serif",
            letterSpacing: 0.5,
          }}
        >
          Powered by NOVA
        </div>
      </div>
    </div>
  );
}

/* ── ROM Tool (shown after auth) ── */
function RomTool({ onGenerate }) {
  const C = useTheme();
  const user = useAuthStore(s => s.user);
  const [buildingType, setBuildingType] = useState("commercial-office");
  const [projectSF, setProjectSF] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!projectSF || parseFloat(projectSF) <= 0) {
      setError("Square footage must be greater than 0");
      return;
    }
    setError("");
    onGenerate(user?.email || "", buildingType, parseFloat(projectSF));
  }

  const labelStyle = {
    ...sectionLabel(C),
    display: "block",
    marginBottom: 6,
    fontSize: 11,
  };

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 480 }}>
      <div style={card(C, { padding: T.space[7] })}>
        {/* Header */}
        <div style={{ marginBottom: T.space[6], textAlign: "center" }}>
          <h2
            style={{
              fontSize: T.fontSize["2xl"],
              fontWeight: T.fontWeight.bold,
              color: C.text,
              fontFamily: "'DM Sans',sans-serif",
              margin: 0,
              marginBottom: T.space[2],
            }}
          >
            Generate a ROM
          </h2>
          <p
            style={{
              fontSize: T.fontSize.sm,
              color: C.textDim,
              fontFamily: "'DM Sans',sans-serif",
              margin: 0,
            }}
          >
            Signed in as <span style={{ color: C.textMuted }}>{user?.email}</span>
          </p>
        </div>

        {/* Building Type */}
        <div style={{ marginBottom: T.space[5] }}>
          <label style={labelStyle}>Building Type</label>
          <select
            value={buildingType}
            onChange={e => setBuildingType(e.target.value)}
            style={inp(C, {
              cursor: "pointer",
              appearance: "none",
              WebkitAppearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 12px center",
              paddingRight: 32,
            })}
          >
            {BUILDING_TYPES.map(bt => (
              <option key={bt.value} value={bt.value}>
                {bt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Project SF */}
        <div style={{ marginBottom: T.space[5] }}>
          <label style={labelStyle}>Project Square Footage</label>
          <input
            type="number"
            placeholder="e.g. 50000"
            min="1"
            value={projectSF}
            onChange={e => setProjectSF(e.target.value)}
            style={inp(C)}
          />
          {error && (
            <div
              style={{
                color: C.red || "#FB7185",
                fontSize: 11,
                marginTop: 4,
                fontFamily: "'DM Sans',sans-serif",
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          style={accentButton(C, {
            width: "100%",
            justifyContent: "center",
            padding: "12px 24px",
            fontSize: T.fontSize.lg,
            fontWeight: T.fontWeight.bold,
            marginTop: T.space[2],
          })}
        >
          Generate ROM
        </button>
      </div>
    </form>
  );
}

/* ── Page Composition ── */
function RomPageInner() {
  const resultRef = useRef(null);
  const user = useAuthStore(s => s.user);
  const loading = useAuthStore(s => s.loading);

  const romResult = useRomStore(s => s.romResult);
  const email = useRomStore(s => s.email);
  const setRomResult = useRomStore(s => s.setRomResult);
  const setEmail = useRomStore(s => s.setEmail);
  const setBuildingType = useRomStore(s => s.setBuildingType);
  const setProjectSF = useRomStore(s => s.setProjectSF);
  const setLeadCaptured = useRomStore(s => s.setLeadCaptured);

  function handleGenerate(userEmail, buildingType, projectSF) {
    setEmail(userEmail);
    setBuildingType(buildingType);
    setProjectSF(String(projectSF));
    setLeadCaptured(true);

    const result = generateBaselineROM(projectSF, buildingType);
    setRomResult(result);

    setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  // Show a simple loading state while auth initializes
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#06060C",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'DM Sans',sans-serif",
          color: "rgba(238,237,245,0.3)",
          fontSize: 14,
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #06060C 0%, #0C0B14 30%, #12101C 70%, #06060C 100%)",
        fontFamily: "'DM Sans',sans-serif",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          padding: `${T.space[5]}px ${T.space[6]}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 4,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: T.fontWeight.bold,
            color: "#EEEDF5",
            fontFamily: "'DM Sans',sans-serif",
            letterSpacing: -0.5,
          }}
        >
          NOVATerra
        </div>
        <div
          style={{
            fontSize: T.fontSize.xs,
            color: "rgba(238,237,245,0.4)",
            fontFamily: "'DM Sans',sans-serif",
            textTransform: "uppercase",
            letterSpacing: T.tracking.caps,
          }}
        >
          Free ROM Tool
        </div>
      </header>

      {/* ── Content ── */}
      <main
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: `${T.space[8]}px ${T.space[5]}px`,
          gap: T.space[7],
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        {/* Gate: signup or ROM tool */}
        {!user ? <RomSignup /> : <RomTool onGenerate={handleGenerate} />}

        {/* Result + Upsell — shown after ROM is generated */}
        {romResult && (
          <div
            ref={resultRef}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: T.space[7],
              width: "100%",
            }}
          >
            <RomResult rom={romResult} email={email} />
            <RomUpsell />
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer
        style={{
          padding: `${T.space[6]}px ${T.space[5]}px`,
          textAlign: "center",
          borderTop: "1px solid rgba(255,255,255,0.04)",
          marginTop: T.space[8],
        }}
      >
        <div
          style={{
            fontSize: T.fontSize.xs,
            color: "rgba(238,237,245,0.25)",
            fontFamily: "'DM Sans',sans-serif",
            letterSpacing: 0.3,
          }}
        >
          BLDG Estimating &middot; Powered by NOVA
        </div>
      </footer>
    </div>
  );
}

export default function RomPage() {
  return (
    <ThemeProvider>
      <RomPageInner />
    </ThemeProvider>
  );
}
