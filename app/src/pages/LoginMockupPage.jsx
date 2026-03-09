import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import NovaSceneLazy from "@/components/nova/NovaSceneLazy";

/* ────────────────────────────────────────────────────────────────
   LoginMockupPage — NOVACORE v15 Cinematic Hybrid Login

   Layer stack (bottom → top):
   1. <video>  — Pre-rendered Blender chamber orbit loop
   2. <canvas> — Real-time NOVACORE sphere (sphere-only, no chamber)
   3. <div>    — Cinematic vignette overlays
   4. <div>    — Glass login form

   The sphere is DORMANT on page load. Form interaction triggers
   a progressive awakening ritual:
     email focus  → pre-awakening flicker
     typing email → fracture phase (light breaks through shell)
     password     → shell dissolves, inner glow visible
     sign-in      → full awakening + pulse + exhale → transition
   ──────────────────────────────────────────────────────────────── */

const FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const ACCENT = "#7C5CFC";
const ACCENT_DIM = "#6D28D9";
const TEXT = "rgba(238,237,245,0.92)";
const TEXT_MUTED = "rgba(238,237,245,0.50)";
const TEXT_DIM = "rgba(238,237,245,0.28)";
const BORDER = "rgba(255,255,255,0.10)";
const INPUT_BG = "rgba(255,255,255,0.04)";

// Video assets (will be in public/chamber/ once render completes)
const CHAMBER_VIDEO = "/chamber/chamber_orbit.webm";
const CHAMBER_POSTER = "/chamber/chamber_poster.jpg";

const keyframesCSS = `
@keyframes loginFadeUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes loginFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes breatheOrb {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.15); opacity: 1; }
}
@keyframes glowPulse {
  0%, 100% { opacity: 0.5; width: 50px; }
  50% { opacity: 1; width: 70px; }
}
@keyframes dormantPulse {
  0%, 100% { opacity: 0.15; }
  50% { opacity: 0.35; }
}
/* Sphere canvas — transparent bg, blends with video via screen mode */
.sphere-canvas canvas {
  background: transparent !important;
}
`;

/* ═══════════════════════════════════════════════════════════════
   AWAKENING STATE MACHINE
   Drives sphere awakening based on form interaction.
   ═══════════════════════════════════════════════════════════════ */

function useAwakeningState() {
  const [state, setState] = useState({
    awaken: 0.0,
    crystallize: 0.0,
    intensity: 0.3,
    phase: "dormant", // dormant | flickering | fracture | dissolving | alive | ascending
  });
  const sceneRef = useRef(null);
  const targetRef = useRef({ awaken: 0.0, crystallize: 0.0, intensity: 0.3 });
  const frameRef = useRef(null);

  // Smooth interpolation loop — lerps current values toward targets
  useEffect(() => {
    const tick = () => {
      const t = targetRef.current;
      setState(prev => {
        const lerp = (a, b, speed) => a + (b - a) * speed;
        const spd = 0.04; // Slow, deliberate transition
        const newAwaken = lerp(prev.awaken, t.awaken, spd);
        const newCrystallize = lerp(prev.crystallize, t.crystallize, spd);
        const newIntensity = lerp(prev.intensity, t.intensity, spd);

        // Add subtle dormant breathing when awaken < 0.05
        const breathe = prev.awaken < 0.05 ? 0.02 * Math.sin(Date.now() / 2000) : 0;

        return {
          ...prev,
          awaken: Math.max(0, newAwaken + breathe),
          crystallize: newCrystallize,
          intensity: newIntensity,
        };
      });
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  // Phase transitions — set targets based on user interaction
  const setPhase = useCallback(phase => {
    setState(prev => ({ ...prev, phase }));

    switch (phase) {
      case "dormant":
        targetRef.current = { awaken: 0.0, crystallize: 0.0, intensity: 0.3 };
        break;
      case "flickering":
        // Email field focused — pre-awakening flicker
        targetRef.current = { awaken: 0.05, crystallize: 0.0, intensity: 0.4 };
        break;
      case "fracture":
        // Typing email — light breaks through cracks
        targetRef.current = { awaken: 0.25, crystallize: 0.1, intensity: 0.55 };
        break;
      case "fracture-hold":
        // Valid email entered — hold at fracture phase
        targetRef.current = { awaken: 0.3, crystallize: 0.15, intensity: 0.6 };
        break;
      case "dissolving":
        // Typing password — shell becoming translucent
        targetRef.current = { awaken: 0.5, crystallize: 0.25, intensity: 0.75 };
        break;
      case "alive":
        // Sign-in enabled — sphere clearly alive, ready
        targetRef.current = { awaken: 0.6, crystallize: 0.3, intensity: 0.85 };
        break;
      case "ascending":
        // Sign-in clicked — full awakening
        targetRef.current = { awaken: 1.0, crystallize: 0.5, intensity: 1.2 };
        // Trigger pulse + exhale on the sphere
        if (sceneRef.current) {
          try {
            sceneRef.current.pulse?.();
            sceneRef.current.exhale?.();
          } catch (e) {
            /* sphere ref might not have these */
          }
        }
        break;
      default:
        break;
    }
  }, []);

  return { state, setPhase, sceneRef };
}

/* ═══════════════════════════════════════════════════════════════
   VIDEO BACKGROUND LAYER
   Pre-rendered Blender chamber orbit (falls back gracefully)
   ═══════════════════════════════════════════════════════════════ */

function ChamberVideoBackground() {
  const [videoLoaded, setVideoLoaded] = useState(false);
  const videoRef = useRef(null);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        background: "#08081A",
        overflow: "hidden",
      }}
    >
      {/* Pre-rendered Blender chamber video */}
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        poster={CHAMBER_POSTER}
        onCanPlay={() => setVideoLoaded(true)}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: videoLoaded ? 1 : 0,
          transition: "opacity 1.5s ease-in",
        }}
      >
        <source src={CHAMBER_VIDEO} type="video/webm" />
        <source src="/chamber/chamber_orbit.mp4" type="video/mp4" />
      </video>

      {/* Fallback: dark atmospheric background when video not available */}
      {!videoLoaded && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: [
              "radial-gradient(ellipse 60% 50% at 50% 60%,",
              "rgba(30, 20, 60, 0.4) 0%,",
              "rgba(8, 8, 26, 1.0) 60%,",
              "#08081A 100%)",
            ].join(" "),
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LIVE SPHERE LAYER
   Real-time NOVACORE sphere composited over video.
   Positioned at the sphere void in the Blender render.
   mix-blend-mode: screen — glow bleeds into video naturally.
   ═══════════════════════════════════════════════════════════════ */

function LiveSphereLayer({ awaken, crystallize, intensity, sceneRef }) {
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const onResize = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Sphere canvas covers center of viewport where the void is
  // In the Blender render, the void is roughly centered horizontally
  // and about 55-65% from top
  const sphereSize = Math.min(dims.w * 0.45, dims.h * 0.45, 600);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        // Offset sphere slightly below center to match ring platform void
        paddingTop: dims.h * 0.08,
      }}
    >
      <div
        className="sphere-canvas"
        style={{
          width: sphereSize,
          height: sphereSize,
          mixBlendMode: "screen", // Glow bleeds into video
          filter: `brightness(${0.8 + intensity * 0.4})`,
          transition: "filter 400ms ease-out",
        }}
      >
        <Suspense
          fallback={
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: sphereSize * 0.3,
                  height: sphereSize * 0.3,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(124,92,252,0.15) 0%, transparent 70%)",
                  animation: "dormantPulse 4s ease-in-out infinite",
                }}
              />
            </div>
          }
        >
          <NovaSceneLazy
            ref={sceneRef}
            width={sphereSize}
            height={sphereSize}
            size={0.85}
            intensity={intensity}
            artifact
            awaken={awaken}
            crystallize={crystallize}
            crystalLayers={5}
            style={{ background: "transparent" }}
          />
        </Suspense>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   VIGNETTE OVERLAYS
   Cinematic depth: bottom fade for form legibility, edge vignette
   ═══════════════════════════════════════════════════════════════ */

function CinematicVignettes() {
  return (
    <>
      {/* Bottom gradient — deep fade for form legibility */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: "55%",
          zIndex: 3,
          background: [
            "linear-gradient(to top,",
            "rgba(6,6,12,0.92) 0%,",
            "rgba(6,6,12,0.70) 20%,",
            "rgba(6,6,12,0.35) 45%,",
            "rgba(6,6,12,0.10) 70%,",
            "transparent 100%)",
          ].join(" "),
          pointerEvents: "none",
        }}
      />
      {/* Radial edge vignette for cinematic framing */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 3,
          background: "radial-gradient(ellipse 75% 85% at 50% 40%, transparent 0%, rgba(4,4,10,0.45) 100%)",
          pointerEvents: "none",
        }}
      />
    </>
  );
}

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
   LOGIN FORM OVERLAY
   Glass card floating over the chamber. Form interactions
   drive the sphere awakening ritual.
   ═══════════════════════════════════════════════════════════════ */

function LoginOverlay({ setPhase }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const prevEmailLen = useRef(0);
  const prevPwLen = useRef(0);

  // Stagger form entry
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, []);

  // Email state → awakening phase
  useEffect(() => {
    const isValidEmail = email.includes("@") && email.includes(".");
    if (isValidEmail) {
      setPhase("fracture-hold");
    } else if (email.length > 0) {
      setPhase("fracture");
    }
    prevEmailLen.current = email.length;
  }, [email, setPhase]);

  // Password state → awakening phase
  useEffect(() => {
    const isValidEmail = email.includes("@") && email.includes(".");
    if (password.length > 0 && isValidEmail) {
      setPhase(password.length >= 4 ? "alive" : "dissolving");
    }
    prevPwLen.current = password.length;
  }, [password, email, setPhase]);

  const handleEmailFocus = useCallback(() => {
    if (email.length === 0) setPhase("flickering");
  }, [email, setPhase]);

  const handlePasswordFocus = useCallback(() => {
    if (email.length > 0) setPhase("dissolving");
  }, [email, setPhase]);

  const handleSubmit = useCallback(
    e => {
      e.preventDefault();
      if (!email.trim() || !password) return;

      // Trigger full awakening
      setPhase("ascending");
      setTransitioning(true);

      // After animation, would navigate to dashboard
      // setTimeout(() => navigate('/dashboard'), 1200);
    },
    [email, password, setPhase],
  );

  if (!visible) return null;

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
          position: "fixed",
          inset: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          paddingBottom: "5vh",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 340,
            pointerEvents: "auto",
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
            <h1
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: "rgba(200,175,255,0.85)",
                margin: "0 0 4px",
                fontFamily: FONT,
                textShadow: "0 2px 20px rgba(109,40,217,0.4)",
              }}
            >
              NOVATerra
            </h1>
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
            {/* Mode tabs */}
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
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    fontSize: 12,
                    fontWeight: tab.key === "password" ? 600 : 500,
                    fontFamily: FONT,
                    color: tab.key === "password" ? TEXT : TEXT_MUTED,
                    background: tab.key === "password" ? "rgba(255,255,255,0.08)" : "transparent",
                    border: "none",
                    borderRadius: 7,
                    cursor: "pointer",
                    transition: "all 150ms ease-out",
                    boxShadow: tab.key === "password" ? "0 1px 4px rgba(0,0,0,0.3)" : "none",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit}>
              <label style={labelStyle}>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={handleEmailFocus}
                placeholder="you@company.com"
                autoFocus
                style={{ ...inputStyle, marginBottom: 14 }}
                onBlur={blurHandler}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Password</label>
                <button
                  type="button"
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
                  onFocusCb={handlePasswordFocus}
                />
              </div>
              <button
                type="submit"
                disabled={!email.trim() || !password}
                style={submitBtnStyle(!email.trim() || !password)}
              >
                Sign In
              </button>
            </form>
          </div>

          {/* Sign up + Powered by */}
          <div
            style={{
              textAlign: "center",
              marginTop: 14,
              animation: "loginFadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.35s both",
            }}
          >
            <p style={{ fontSize: 12, color: "rgba(238,237,245,0.25)", margin: "0 0 12px" }}>
              Don't have an account?{" "}
              <span style={{ color: ACCENT, fontWeight: 600, cursor: "pointer" }}>Create one</span>
            </p>
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
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN EXPORT
   Orchestrates all layers + awakening state machine.
   ═══════════════════════════════════════════════════════════════ */

export default function LoginMockupPage() {
  const { state, setPhase, sceneRef } = useAwakeningState();

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#08081A" }}>
      <style>{keyframesCSS}</style>

      {/* Layer 1: Pre-rendered Blender chamber video */}
      <ChamberVideoBackground />

      {/* Layer 2: Real-time NOVACORE sphere (sphere-only, no chamber) */}
      <LiveSphereLayer
        awaken={state.awaken}
        crystallize={state.crystallize}
        intensity={state.intensity}
        sceneRef={sceneRef}
      />

      {/* Layer 3: Cinematic vignettes */}
      <CinematicVignettes />

      {/* Layer 4: Glass login form (drives awakening) */}
      <LoginOverlay setPhase={setPhase} />
    </div>
  );
}
