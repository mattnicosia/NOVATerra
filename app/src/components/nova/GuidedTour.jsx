// GuidedTour — 6-step workspace tour after first-time onboarding
// Runs over a dimmed dashboard. Orb narrates, sections illuminate.
// Script reference: Archive/NOVA-SCRIPT-FINAL.md § "GUIDED WORKSPACE TOUR"
import { useState, useEffect, useRef, useCallback } from "react";
import TypeWriter from "./TypeWriter";
import useNovaSound from "./useNovaSound";
import useNovaVoice from "./useNovaVoice";
import { VOICE_PRESETS } from "./voicePresets";
import { getScript } from "@/utils/novaScriptOverrides";
import { useNovaStore } from "@/stores/novaStore";
import NovaSceneLazy from "@/components/nova/NovaSceneLazy";

// ── Timer safety helpers (shared pattern from OnboardingSequence) ──
function useTimerManager() {
  const timers = useRef(new Set());
  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return { later };
}

const textStyle = {
  fontSize: 18,
  fontWeight: 300,
  letterSpacing: 1,
  color: "rgba(220,200,255,0.75)",
};

export default function GuidedTour({ onComplete }) {
  const S = getScript("TOUR");
  const TOUR_STEPS = S.steps;
  const { later } = useTimerManager();
  const sound = useNovaSound();
  const voice = useNovaVoice();

  const [step, setStep] = useState(-1); // -1 = not started
  const [lineText, setLineText] = useState("");
  const [lineKey, setLineKey] = useState(0);
  const [lineDone, setLineDone] = useState(false);
  const [illuminated, setIlluminated] = useState(new Set()); // Stays lit once illuminated
  const [overlayOpacity, setOverlayOpacity] = useState(1);
  const [exiting, setExiting] = useState(false);
  const novaStoreRef = useRef(useNovaStore.getState);

  // Start the tour after a brief pause
  useEffect(() => {
    voice.preWarm(
      TOUR_STEPS.map(s => s.text),
      VOICE_PRESETS.onboarding,
    );
    later(() => setStep(0), S.startDelayMs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle step changes
  useEffect(() => {
    if (step < 0 || step >= TOUR_STEPS.length) return;
    const current = TOUR_STEPS[step];

    // Set orb state — use 'learning' for warm glow instead of spinning
    if (current.orbState === "learning") {
      useNovaStore.setState({ status: "learning", activity: "Learning..." });
    } else if (current.orbState === "affirm") {
      useNovaStore.setState({ status: "affirm", activity: null });
    } else {
      // idle — reset from any previous state
      if (step > 0) {
        useNovaStore.setState({ status: "idle", activity: null });
      }
    }

    // Illuminate target (additive — stays lit)
    if (current.target) {
      later(() => {
        setIlluminated(prev => new Set([...prev, current.target]));
      }, S.illuminateDelayMs);
    }

    // Show text
    setLineDone(false);
    setLineText(current.text);
    setLineKey(prev => prev + 1);
    sound.playTextPing();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle line complete
  const handleLineComplete = useCallback(() => {
    setLineDone(true);
    const current = TOUR_STEPS[step];
    if (!current) return;

    later(() => {
      const nextStep = step + 1;
      if (nextStep >= TOUR_STEPS.length) {
        // Tour complete — fade overlay out
        setExiting(true);
        useNovaStore.getState().resetStatus();

        later(() => {
          setOverlayOpacity(0);
          later(() => {
            localStorage.setItem("nova_tour_complete", "true");
            if (onComplete) onComplete();
          }, S.exitFadeMs);
        }, 200);
      } else {
        setLineText("");
        later(() => setStep(nextStep), S.stepGapMs);
      }
    }, current.holdMs);
  }, [step, onComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply glow to illuminated sections
  useEffect(() => {
    const cleanups = [];
    illuminated.forEach(selector => {
      const el = document.querySelector(selector);
      if (el) {
        const prev = el.style.cssText;
        el.style.position = "relative";
        el.style.zIndex = "1001";
        el.style.boxShadow = "0 0 20px rgba(160,100,255,0.12), 0 0 40px rgba(160,100,255,0.06)";
        el.style.transition = "box-shadow 600ms ease, z-index 0ms";
        cleanups.push(() => {
          el.style.cssText = prev;
        });
      }
    });

    return () => {
      if (exiting) cleanups.forEach(fn => fn());
    };
  }, [illuminated, exiting]);

  // Clean up all glows on unmount
  useEffect(() => {
    return () => {
      TOUR_STEPS.forEach(s => {
        if (s.target) {
          const el = document.querySelector(s.target);
          if (el) {
            el.style.boxShadow = "";
            el.style.zIndex = "";
          }
        }
      });
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(4,4,12,0.65)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: 120,
        fontFamily: "'DM Sans', sans-serif",
        opacity: overlayOpacity,
        transition: "opacity 1.2s ease",
        pointerEvents: exiting ? "none" : "auto",
      }}
    >
      {/* Text area — centered at bottom */}
      {lineText && (
        <div
          style={{
            maxWidth: 560,
            textAlign: "center",
            animation: "novaFadeIn 0.4s ease-out",
          }}
        >
          <TypeWriter
            key={lineKey}
            text={lineText}
            speed={S.typewriterSpeed}
            style={textStyle}
            voice={lineDone ? undefined : voice}
            voiceOptions={
              lineDone
                ? undefined
                : {
                    ...VOICE_PRESETS[TOUR_STEPS[step]?.voice || "onboarding"],
                    onVoiceStart: () => sound.setDroneDuck?.(true),
                    onVoiceEnd: () => sound.setDroneDuck?.(false),
                  }
            }
            onComplete={handleLineComplete}
          />
        </div>
      )}

      <style>{`
        @keyframes novaFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
