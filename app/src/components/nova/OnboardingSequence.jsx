// OnboardingSequence — Cinematic first-sign-in experience for NOVA
// Full-screen, no nav, 6 staged sequence: void → appear → first-contact →
// question → recognition → activation → transition
// Sound: Web Audio drone + text pings + activation chord
// Voice: ElevenLabs TTS via useNovaVoice (graceful fallback if unavailable)
import { useState, useEffect, useRef, useCallback } from "react";
import NovaSceneLazy from "@/components/nova/NovaSceneLazy";
import TypeWriter from "./TypeWriter";
import useNovaSound from "./useNovaSound";
import useNovaVoice from "./useNovaVoice";
import { VOICE_PRESETS } from "./voicePresets";
import { ROLES } from "./novaScript";
import { getScript } from "@/utils/novaScriptOverrides";

// ── Timer safety helpers ─────────────────────────────────────
function useTimerManager() {
  const timers = useRef(new Set());
  const intervals = useRef(new Set());
  const rafs = useRef(new Set());

  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  }, []);

  const every = useCallback((fn, ms) => {
    const id = setInterval(fn, ms);
    intervals.current.add(id);
    return id;
  }, []);

  const raf = useCallback(fn => {
    const id = requestAnimationFrame(t => {
      rafs.current.delete(id);
      fn(t);
    });
    rafs.current.add(id);
    return id;
  }, []);

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
      intervals.current.forEach(clearInterval);
      rafs.current.forEach(cancelAnimationFrame);
    };
  }, []);

  return { later, every, raf };
}

// ── Lerp ─────────────────────────────────────────────────────
function lerp(a, b, t) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

export default function OnboardingSequence({ onComplete, onTransitionStart }) {
  const S = getScript("ONBOARDING");
  const { later, raf } = useTimerManager();
  const sound = useNovaSound();
  const voice = useNovaVoice();

  // ── Core state ───────────────────────────────────────────
  const [stage, setStage] = useState("void");
  const [novaState, setNovaState] = useState("idle");
  const [coreOverride, setCoreOverride] = useState(null);
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [selectedRole, setSelectedRole] = useState(null);
  const [showSkip, setShowSkip] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

  // ── Visual state ─────────────────────────────────────────
  const [dotVisible, setDotVisible] = useState(false);
  const [portalScale, setPortalScale] = useState(0.02);
  const [portalOpacity, setPortalOpacity] = useState(0);
  const [lines, setLines] = useState([]); // { key, text, style?, voiceOpts? }
  const [inputVisible, setInputVisible] = useState(false);
  const [buttonsVisible, setButtonsVisible] = useState(false);
  const [textFade, setTextFade] = useState(1);
  const [bgColor, setBgColor] = useState("#04040c");
  const [posMode, setPosMode] = useState("centered"); // 'centered' | 'fixed'
  const [fixedPos, setFixedPos] = useState({ x: 0, y: 0 });

  const inputRef = useRef(null);
  const portalWrapRef = useRef(null);
  const nameRef = useRef("");
  const roleRef = useRef("");
  const lineKeyRef = useRef(0);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const nextKey = () => `l-${++lineKeyRef.current}`;

  // ── Responsive ───────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const handler = e => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // ── Escape key → skip ───────────────────────────────────
  useEffect(() => {
    const handler = e => {
      if (e.key === "Escape") {
        if (showSkip) handleSkip();
        else setShowSkip(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showSkip]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSkip = useCallback(() => {
    sound.stopDrone(400);
    voice.stop();
    localStorage.setItem("nova_onboarding_complete", "true");
    if (onComplete) onComplete();
  }, [onComplete, sound, voice]);

  // ── Text style ───────────────────────────────────────────
  const textStyle = {
    fontSize: isMobile ? 16 : 18,
    fontWeight: 300,
    letterSpacing: 1,
    color: "rgba(220,200,255,0.75)",
  };

  // ═══════════════════════════════════════════════════════════
  // STAGE MACHINE
  // ═══════════════════════════════════════════════════════════

  // ── Stage 0: VOID ──────────────────────────────────────
  useEffect(() => {
    if (stage !== "void") return;
    // Pre-warm voice lines during the void
    voice.preWarm(
      [S.firstContact.line1.text, S.firstContact.line2.text, S.question.line.text],
      VOICE_PRESETS.onboarding,
    );

    later(() => setDotVisible(true), S.void.dotAppearMs);
    later(() => setStage("appear"), S.void.advanceMs);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stage 1: APPEAR ────────────────────────────────────
  useEffect(() => {
    if (stage !== "appear") return;
    sound.startDrone(S.appear.droneFadeInMs);
    later(() => {
      setPortalScale(1);
      setPortalOpacity(1);
    }, S.appear.portalDelayMs);
    later(() => setStage("first-contact"), S.appear.advanceMs);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stage 2: FIRST CONTACT ─────────────────────────────
  useEffect(() => {
    if (stage !== "first-contact") return;
    setNovaState("thinking");
    sound.setDroneState("thinking");
    later(() => {
      setNovaState("idle");
      sound.setDroneState("idle");
    }, S.firstContact.thinkingFlashMs);
    later(() => {
      setLines([
        {
          key: nextKey(),
          lineId: "fc-1",
          text: S.firstContact.line1.text,
          style: textStyle,
          voiceOpts: VOICE_PRESETS[S.firstContact.line1.voice],
        },
      ]);
    }, S.firstContact.line1DelayMs);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFirstContactLine1Done = useCallback(() => {
    later(() => {
      setLines(prev => [
        ...prev.map(l => ({ ...l, done: true })),
        {
          key: nextKey(),
          lineId: "fc-2",
          text: S.firstContact.line2.text,
          style: textStyle,
          voiceOpts: VOICE_PRESETS[S.firstContact.line2.voice],
        },
      ]);
    }, S.firstContact.afterLine1Ms);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFirstContactLine2Done = useCallback(() => {
    later(() => {
      setTextFade(0);
      later(() => {
        setLines([]);
        setTextFade(1);
        later(() => setStage("question"), S.firstContact.silenceMs);
      }, S.firstContact.textFadeMs);
    }, S.firstContact.afterLine2Ms);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stage 3: QUESTION ──────────────────────────────────
  useEffect(() => {
    if (stage !== "question") return;
    setTextFade(0);
    later(() => {
      setLines([]);
      setTextFade(1);
      later(() => {
        setLines([
          {
            key: nextKey(),
            lineId: "q-1",
            text: S.question.line.text,
            style: textStyle,
            voiceOpts: VOICE_PRESETS[S.question.line.voice],
          },
        ]);
      }, S.question.silenceMs);
    }, S.question.textFadeMs);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleQuestionDone = useCallback(() => {
    later(() => {
      setInputVisible(true);
      later(() => inputRef.current?.focus(), S.question.inputFocusMs);
    }, S.question.inputDelayMs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNameSubmit = useCallback(
    e => {
      if (e.key !== "Enter") return;
      const fullName = e.target.value.trim();
      if (!fullName) return;
      const firstName = fullName.split(/\s+/)[0];
      nameRef.current = fullName;
      setUserName(fullName);
      setInputVisible(false);
      voice.preWarm([S.recognition.greetLine.text(firstName)], VOICE_PRESETS[S.recognition.greetLine.voice]);
      voice.preWarm([S.recognition.roleLine.text], VOICE_PRESETS[S.recognition.roleLine.voice]);
      voice.preWarm([S.absorb.line.text], VOICE_PRESETS[S.absorb.line.voice]);
      setStage("recognition");
    },
    [voice],
  );

  // ── Stage 4: RECOGNITION ──────────────────────────────
  useEffect(() => {
    if (stage !== "recognition") return;
    setTextFade(0);
    later(() => {
      setLines([]);
      setTextFade(1);
    }, S.recognition.textFadeMs);

    setNovaState("thinking");
    sound.setDroneState("thinking");
    later(() => {
      setNovaState("idle");
      sound.setDroneState("idle");
      const firstName = nameRef.current.split(/\s+/)[0];
      later(() => {
        setLines([
          {
            key: nextKey(),
            lineId: "r-greet",
            text: S.recognition.greetLine.text(firstName),
            style: textStyle,
            voiceOpts: VOICE_PRESETS[S.recognition.greetLine.voice],
          },
        ]);
      }, S.recognition.greetDelayMs);
    }, S.recognition.thinkingMs);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNameEchoDone = useCallback(() => {
    setCoreOverride(S.recognition.coreRampFrom);
    const rampStart = performance.now();
    function ramp(now) {
      const t = Math.min(1, (now - rampStart) / S.recognition.coreRampMs);
      setCoreOverride(lerp(S.recognition.coreRampFrom, S.recognition.coreRampTo, t));
      if (t < 1) raf(ramp);
      else setCoreOverride(null);
    }
    raf(ramp);

    later(() => {
      setLines(prev => [
        ...prev.map(l => ({ ...l, done: true })),
        {
          key: nextKey(),
          lineId: "r-role",
          text: S.recognition.roleLine.text,
          style: textStyle,
          voiceOpts: VOICE_PRESETS[S.recognition.roleLine.voice],
        },
      ]);
    }, S.recognition.coreRampMs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRoleQuestionDone = useCallback(() => {
    setButtonsVisible(true);
  }, []);

  const handleRoleSelect = useCallback(key => {
    roleRef.current = key;
    setSelectedRole(key);
    setUserRole(key);
    later(() => {
      setButtonsVisible(false);
      setTextFade(0);
      later(() => {
        setLines([]);
        setTextFade(1);
        later(() => setStage("absorb"), S.recognition.toAbsorbMs);
      }, S.recognition.roleFadeMs);
    }, S.recognition.roleGlowMs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stage: ABSORB ("Ah.") ─────────────────────────────
  useEffect(() => {
    if (stage !== "absorb") return;
    setNovaState(S.absorb.orbState);
    later(() => {
      setLines([
        {
          key: nextKey(),
          lineId: "absorb-1",
          text: S.absorb.line.text,
          style: textStyle,
          voiceOpts: VOICE_PRESETS[S.absorb.line.voice],
        },
      ]);
    }, S.absorb.lineDelayMs);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAbsorbDone = useCallback(() => {
    later(() => {
      setTextFade(0);
      later(() => {
        setLines([]);
        setTextFade(1);
        setNovaState("idle");
        later(() => setStage("activation"), S.absorb.silenceMs);
      }, S.absorb.textFadeMs);
    }, S.absorb.holdGlowMs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stage 5: ACTIVATION ─────────────────────────────────
  useEffect(() => {
    if (stage !== "activation") return;
    setTextFade(0);
    later(() => {
      setLines([]);
      setTextFade(1);
    }, S.activation.textFadeMs);
    later(() => setPortalScale(S.activation.portalScale), S.activation.portalScaleDelay);
    setNovaState(S.activation.orbState);
    sound.setDroneState(S.activation.orbState);
    later(() => sound.playActivation(), S.activation.chordDelayMs);
    localStorage.setItem("nova_user_name", nameRef.current);
    localStorage.setItem("nova_user_role", roleRef.current);
    later(() => setStage("transition"), S.activation.holdMs);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stage 6: TRANSITION ────────────────────────────────
  useEffect(() => {
    if (stage !== "transition") return;

    setTextFade(0);
    later(() => setLines([]), S.transition.textFadeMs);
    sound.stopDrone(S.transition.droneFadeMs);
    voice.stop();

    // Notify parent to reveal AppContent
    if (onTransitionStart) onTransitionStart();

    // Get portal's current position
    const rect = portalWrapRef.current?.getBoundingClientRect();
    if (rect) {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      setFixedPos({ x: cx, y: cy });
      setPosMode("fixed");

      // Double-rAF to ensure fixed position is committed before animating
      raf(() => {
        raf(() => {
          const orbEl = document.getElementById("nova-bar-orb");
          const orbRect = orbEl?.getBoundingClientRect();
          const targetX = orbRect ? orbRect.left + orbRect.width / 2 : 275;
          const targetY = orbRect ? orbRect.top + orbRect.height / 2 : 74;
          setFixedPos({ x: targetX, y: targetY });
          setPortalScale(S.transition.targetScale);
          setBgColor(S.transition.bgColor);
        });
      });
    }

    later(() => {
      localStorage.setItem("nova_onboarding_complete", "true");
      if (onComplete) onComplete();
    }, S.transition.completeMs);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Line completion routing (lineId-based, stable via ref) ──
  const handleLineComplete = useCallback(key => {
    const line = linesRef.current.find(l => l.key === key);
    if (!line?.lineId) return;
    const handlers = {
      "fc-1": handleFirstContactLine1Done,
      "fc-2": handleFirstContactLine2Done,
      "q-1": handleQuestionDone,
      "r-greet": handleNameEchoDone,
      "r-role": handleRoleQuestionDone,
      "absorb-1": handleAbsorbDone,
    };
    if (handlers[line.lineId]) handlers[line.lineId]();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Portal wrapper style ────────────────────────────────
  const heroSize = isMobile ? 210 : 345;

  const portalWrapStyle =
    posMode === "fixed"
      ? {
          position: "fixed",
          left: fixedPos.x,
          top: fixedPos.y,
          transform: `translate(-50%, -50%) scale(${portalScale})`,
          transition:
            "left 1.2s cubic-bezier(0.4,0,0.2,1), top 1.2s cubic-bezier(0.4,0,0.2,1), transform 1.2s cubic-bezier(0.4,0,0.2,1)",
          zIndex: 1001,
          opacity: portalOpacity,
        }
      : {
          position: "relative",
          transform: `scale(${portalScale})`,
          transition: "transform 2.5s cubic-bezier(0.16,1,0.3,1), opacity 1.5s ease-out",
          opacity: portalOpacity,
          zIndex: 1001,
        };

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: bgColor,
        transition: "background 1.2s ease",
        zIndex: 999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* ── Void dot ── */}
      {stage === "void" && dotVisible && (
        <div
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "rgba(160,100,255,0.4)",
            animation: "novaFadeIn 0.3s ease-out",
          }}
        />
      )}

      {/* ── Portal ── */}
      {stage !== "void" && (
        <div ref={portalWrapRef} style={portalWrapStyle}>
          <NovaSceneLazy width={heroSize} height={heroSize} size={0.85} intensity={0.7} artifact awaken={0.8} />
        </div>
      )}

      {/* ── Text area ── */}
      {stage !== "void" && stage !== "appear" && (
        <div
          style={{
            marginTop: posMode === "fixed" ? 0 : 48,
            maxWidth: isMobile ? 320 : 480,
            textAlign: "center",
            opacity: textFade,
            transition: "opacity 600ms ease",
            position: posMode === "fixed" ? "fixed" : "relative",
            top: posMode === "fixed" ? "60%" : undefined,
            left: posMode === "fixed" ? "50%" : undefined,
            transform: posMode === "fixed" ? "translateX(-50%)" : undefined,
          }}
        >
          {lines.map(line => (
            <div
              key={line.key}
              style={{
                marginBottom: 12,
                animation: "novaFadeIn 0.4s ease-out",
              }}
            >
              <TypeWriter
                text={line.text}
                speed={S.typewriterSpeed}
                style={line.style}
                voice={line.done ? undefined : voice}
                voiceOptions={
                  line.done
                    ? undefined
                    : {
                        ...line.voiceOpts,
                        onVoiceStart: () => sound.setDroneDuck(true),
                        onVoiceEnd: () => sound.setDroneDuck(false),
                      }
                }
                onStart={() => sound.playTextPing()}
                onComplete={() => handleLineComplete(line.key)}
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Name input ── */}
      {inputVisible && (
        <div
          style={{
            marginTop: 24,
            animation: "novaFadeIn 0.8s ease-out",
          }}
        >
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            onKeyDown={handleNameSubmit}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: "1px solid rgba(160,100,255,0.35)",
              color: "#fff",
              fontSize: isMobile ? 18 : 20,
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              textAlign: "center",
              maxWidth: 300,
              width: 300,
              outline: "none",
              padding: "8px 0",
              caretColor: "rgba(160,100,255,0.5)",
              letterSpacing: 1,
            }}
          />
        </div>
      )}

      {/* ── Role buttons ── */}
      {buttonsVisible && (
        <div
          style={{
            marginTop: 24,
            display: "flex",
            flexWrap: "wrap",
            flexDirection: isMobile ? "column" : "row",
            gap: 12,
            alignItems: "center",
            justifyContent: "center",
            maxWidth: isMobile ? 320 : 560,
          }}
        >
          {ROLES.map((role, i) => {
            const isSelected = selectedRole === role.key;
            const isHidden = selectedRole && !isSelected;
            return (
              <button
                key={role.key}
                onClick={() => handleRoleSelect(role.key)}
                style={{
                  border: `1px solid ${isSelected ? "rgba(160,100,255,0.4)" : "rgba(160,100,255,0.15)"}`,
                  background: "transparent",
                  color: isSelected ? "rgba(220,200,255,0.9)" : "rgba(220,200,255,0.6)",
                  borderRadius: 8,
                  padding: "12px 28px",
                  fontSize: isMobile ? 14 : 16,
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 300,
                  cursor: isHidden ? "default" : "pointer",
                  transition: "all 400ms",
                  opacity: isHidden ? 0 : 1,
                  transform: isHidden ? "scale(0.95)" : "scale(1)",
                  pointerEvents: isHidden ? "none" : "auto",
                  boxShadow: isSelected ? "0 0 12px rgba(160,100,255,0.15)" : "none",
                  animation: `novaFadeIn 0.6s ease-out ${i * S.roleStaggerMs}ms both`,
                }}
                onMouseEnter={e => {
                  if (!selectedRole) {
                    e.currentTarget.style.background = "rgba(160,100,255,0.08)";
                    e.currentTarget.style.color = "rgba(220,200,255,0.9)";
                    e.currentTarget.style.borderColor = "rgba(160,100,255,0.3)";
                  }
                }}
                onMouseLeave={e => {
                  if (!selectedRole) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "rgba(220,200,255,0.6)";
                    e.currentTarget.style.borderColor = "rgba(160,100,255,0.15)";
                  }
                }}
              >
                {role.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Skip link ── */}
      {showSkip && (
        <div
          onClick={handleSkip}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            fontSize: 13,
            color: "rgba(220,200,255,0.2)",
            cursor: "pointer",
            zIndex: 1002,
            fontFamily: "'DM Sans', sans-serif",
            transition: "color 300ms",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "rgba(220,200,255,0.5)")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(220,200,255,0.2)")}
        >
          Skip intro &rarr;
        </div>
      )}

      {/* ── Keyframe animations ── */}
      <style>{`
        @keyframes novaFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        input::placeholder {
          color: rgba(160,100,255,0.25);
          font-weight: 300;
        }
      `}</style>
    </div>
  );
}
