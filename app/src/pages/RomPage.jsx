// RomPage — /rom  •  Jony Ive redesign: typography-led, negative space, structural gray
// Two fields, one button, nothing else. The result is the cathedral.

import { useState, useRef } from "react";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { T } from "@/utils/designTokens";
import { useAuthStore } from "@/stores/authStore";
import { useRomStore } from "@/stores/romStore";
import { generateBaselineROM } from "@/utils/romEngine";
import { inp, accentButton } from "@/utils/styles";
import RomResult from "@/components/rom/RomResult";
import RomUpsell from "@/components/rom/RomUpsell";

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

/* ── Shared styles ── */
const display = (size = 48) => ({
  fontFamily: T.font.sans,
  fontWeight: 300,
  fontSize: size,
  letterSpacing: size > 32 ? -1.5 : -0.5,
  lineHeight: 1.05,
});

const ui = {
  fontFamily: T.font.sans,
};

/* ════════════════════════════════════════════════════════════════
   SIGNUP — Two fields, one button. Nothing else.
   ════════════════════════════════════════════════════════════════ */
function RomSignup() {
  const C = useTheme();
  const T = C.T;
  const signUp = useAuthStore(s => s.signUpWithPassword);
  const signIn = useAuthStore(s => s.signInWithPassword);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("signup");
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
          setConfirmEmail(true);
        } else if (result?.error) {
          const errMsg = typeof result.error === "string" ? result.error : result.error.message || "Signup failed";
          if (errMsg.toLowerCase().includes("already")) {
            const loginResult = await signIn(email.trim(), password);
            if (loginResult?.error)
              setError(
                typeof loginResult.error === "string" ? loginResult.error : loginResult.error.message || "Login failed",
              );
          } else setError(errMsg);
        }
      } else {
        const result = await signIn(email.trim(), password);
        if (result?.error)
          setError(typeof result.error === "string" ? result.error : result.error.message || "Login failed");
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    }
    setLoading(false);
  }

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "14px 16px",
    fontSize: 15,
    ...ui,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 12,
    color: "#EEEDF5",
    outline: "none",
    transition: "border 0.15s",
  };

  return (
    <div style={{ width: "100%", maxWidth: 420 }}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={inputStyle}
            autoComplete="email"
            onFocus={e => (e.target.style.borderColor = "rgba(139,92,246,0.5)")}
            onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.10)")}
          />
        </div>
        <div style={{ marginBottom: 24 }}>
          <input
            type="password"
            placeholder={mode === "signup" ? "Create a password" : "Password"}
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={inputStyle}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            onFocus={e => (e.target.style.borderColor = "rgba(139,92,246,0.5)")}
            onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.10)")}
          />
        </div>

        {error && (
          <div style={{ color: "#FB7185", fontSize: 13, marginBottom: 16, textAlign: "center", ...ui }}>{error}</div>
        )}

        {confirmEmail && (
          <div
            style={{
              background: "rgba(56,189,248,0.06)",
              border: "1px solid rgba(56,189,248,0.15)",
              borderRadius: 12,
              padding: "16px 20px",
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: "#38BDF8", marginBottom: 4, ...ui }}>
              Check your email
            </div>
            <div style={{ fontSize: 12, color: "rgba(238,237,245,0.5)", lineHeight: 1.5, ...ui }}>
              Confirmation link sent to <strong style={{ color: "#EEEDF5" }}>{email}</strong>.
            </div>
            <div
              onClick={() => {
                setConfirmEmail(false);
                setMode("login");
              }}
              style={{ fontSize: 12, color: "rgba(139,92,246,0.8)", cursor: "pointer", marginTop: 8, ...ui }}
            >
              Ready to sign in
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "15px 24px",
            borderRadius: 12,
            border: "none",
            background: "rgba(139,92,246,1)",
            color: "#fff",
            cursor: loading ? "wait" : "pointer",
            fontSize: 15,
            fontWeight: 600,
            ...ui,
            opacity: loading ? 0.6 : 1,
            transition: "all 0.15s",
          }}
        >
          {loading ? "One moment..." : mode === "signup" ? "Get Your ROM" : "Sign In"}
        </button>
      </form>

      <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "rgba(238,237,245,0.35)", ...ui }}>
        {mode === "signup" ? "Already have an account? " : "New here? "}
        <span
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setError("");
          }}
          style={{ color: "rgba(139,92,246,0.8)", cursor: "pointer" }}
        >
          {mode === "signup" ? "Sign in" : "Create account"}
        </span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   ROM TOOL — Two inputs, one button. The form disappears; the result stays.
   ════════════════════════════════════════════════════════════════ */
function RomTool({ onGenerate }) {
  const user = useAuthStore(s => s.user);
  const [buildingType, setBuildingType] = useState("commercial-office");
  const [projectSF, setProjectSF] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!projectSF || parseFloat(projectSF) <= 0) {
      setError("Enter square footage");
      return;
    }
    setError("");
    onGenerate(user?.email || "", buildingType, parseFloat(projectSF));
  }

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "14px 16px",
    fontSize: 15,
    ...ui,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 12,
    color: "#EEEDF5",
    outline: "none",
    transition: "border 0.15s",
  };

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 420 }}>
      <div style={{ marginBottom: 16 }}>
        <select
          value={buildingType}
          onChange={e => setBuildingType(e.target.value)}
          style={{
            ...inputStyle,
            cursor: "pointer",
            appearance: "none",
            WebkitAppearance: "none",
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23666' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 16px center",
            paddingRight: 40,
          }}
        >
          {BUILDING_TYPES.map(bt => (
            <option key={bt.value} value={bt.value}>
              {bt.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 24 }}>
        <input
          type="number"
          placeholder="Square footage"
          min="1"
          value={projectSF}
          onChange={e => setProjectSF(e.target.value)}
          style={inputStyle}
          onFocus={e => (e.target.style.borderColor = "rgba(139,92,246,0.5)")}
          onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.10)")}
        />
        {error && <div style={{ color: "#FB7185", fontSize: 12, marginTop: 6, ...ui }}>{error}</div>}
      </div>

      <button
        type="submit"
        style={{
          width: "100%",
          padding: "15px 24px",
          borderRadius: 12,
          border: "none",
          background: "rgba(139,92,246,1)",
          color: "#fff",
          cursor: "pointer",
          fontSize: 15,
          fontWeight: 600,
          ...ui,
          transition: "all 0.15s",
        }}
      >
        Generate ROM
      </button>

      <div style={{ textAlign: "center", marginTop: 14, fontSize: 12, color: "rgba(238,237,245,0.25)", ...ui }}>
        {user?.email}
      </div>
    </form>
  );
}

/* ════════════════════════════════════════════════════════════════
   PAGE — Hero typography. Negative space. Gray does the work.
   ════════════════════════════════════════════════════════════════ */
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

  if (loading) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#06060C",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(238,237,245,0.2)",
          fontSize: 14,
          ...ui,
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#06060C",
        overflowY: "auto",
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {/* Atmospheric gradient — subtle, not competing */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(139,92,246,0.06) 0%, transparent 60%)",
        }}
      />

      {/* Content layer */}
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* ── Header — minimal ── */}
        <header
          style={{
            padding: "20px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ ...display(18), fontWeight: 500, color: "rgba(238,237,245,0.5)", letterSpacing: -0.3 }}>
            NOVA
          </div>
          <div
            style={{
              fontSize: 10,
              color: "rgba(238,237,245,0.2)",
              ...ui,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            Powered by NOVA
          </div>
        </header>

        {/* ── Hero section ── */}
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: romResult ? "48px 24px 32px" : "100px 24px 48px",
            textAlign: "center",
            transition: "padding 0.5s ease",
          }}
        >
          {/* Display headline — Outfit, light weight, massive */}
          <h1
            style={{
              ...display(romResult ? 36 : 52),
              color: "#EEEDF5",
              margin: 0,
              marginBottom: romResult ? 8 : 12,
              transition: "font-size 0.5s ease",
            }}
          >
            {romResult ? "Your Estimate" : "Know your number."}
          </h1>

          {!romResult && (
            <p
              style={{
                fontSize: 16,
                fontWeight: 400,
                ...ui,
                color: "rgba(238,237,245,0.35)",
                margin: 0,
                marginBottom: 48,
                maxWidth: 380,
                lineHeight: 1.6,
              }}
            >
              Division-level ROM in seconds.
              <br />
              Free. No credit card.
            </p>
          )}

          {/* Gate: signup or ROM tool */}
          {!romResult && (!user ? <RomSignup /> : <RomTool onGenerate={handleGenerate} />)}
        </section>

        {/* ── Result ── */}
        {romResult && (
          <section
            ref={resultRef}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "0 24px 64px",
              maxWidth: 900,
              margin: "0 auto",
            }}
          >
            <RomResult rom={romResult} email={email} />

            {/* Regenerate / new estimate */}
            <div style={{ marginTop: 32, display: "flex", gap: 16, alignItems: "center" }}>
              <button
                onClick={() => {
                  setRomResult(null);
                }}
                style={{
                  padding: "10px 24px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "transparent",
                  color: "rgba(238,237,245,0.5)",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                  ...ui,
                  transition: "all 0.15s",
                }}
              >
                New Estimate
              </button>
            </div>

            <div style={{ marginTop: 48 }}>
              <RomUpsell />
            </div>
          </section>
        )}

        {/* ── Footer ── */}
        <footer
          style={{
            padding: "32px 24px",
            textAlign: "center",
            borderTop: "1px solid rgba(255,255,255,0.03)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "rgba(238,237,245,0.15)",
              ...ui,
              letterSpacing: 0.5,
            }}
          >
            BLDG Estimating
          </div>
        </footer>
      </div>
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
