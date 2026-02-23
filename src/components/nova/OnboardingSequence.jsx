// OnboardingSequence — Cinematic first-sign-in experience for NOVA
// Full-screen, no nav, 7 staged sequence: void → appear → first-contact →
// question → recognition → understanding → activation → transition
// Sound: Web Audio drone + text pings + activation chord
// Voice: ElevenLabs TTS via useNovaVoice (graceful fallback if unavailable)
import { useState, useEffect, useRef, useCallback } from 'react';
import NovaPortal from './NovaPortal';
import TypeWriter from './TypeWriter';
import useNovaSound from './useNovaSound';
import useNovaVoice from './useNovaVoice';
import { VOICE_PRESETS } from './voicePresets';

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

  const raf = useCallback((fn) => {
    const id = requestAnimationFrame((t) => {
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

// ── Roles ────────────────────────────────────────────────────
const ROLES = [
  { key: 'gc', label: 'General Contractor' },
  { key: 'sub', label: 'Subcontractor / Trade' },
  { key: 'owner', label: 'Owner / Developer' },
];

// ── Lerp ─────────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * Math.min(1, Math.max(0, t)); }

export default function OnboardingSequence({ onComplete, onTransitionStart }) {
  const { later, raf } = useTimerManager();
  const sound = useNovaSound();
  const voice = useNovaVoice();

  // ── Core state ───────────────────────────────────────────
  const [stage, setStage] = useState('void');
  const [novaState, setNovaState] = useState('idle');
  const [coreOverride, setCoreOverride] = useState(null);
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('');
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
  const [bgColor, setBgColor] = useState('#04040c');
  const [posMode, setPosMode] = useState('centered'); // 'centered' | 'fixed'
  const [fixedPos, setFixedPos] = useState({ x: 0, y: 0 });

  const inputRef = useRef(null);
  const portalWrapRef = useRef(null);
  const nameRef = useRef('');
  const roleRef = useRef('');
  const lineKeyRef = useRef(0);
  const nextKey = () => `l-${++lineKeyRef.current}`;

  // ── Responsive ───────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ── Escape key → skip ───────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (showSkip) handleSkip();
        else setShowSkip(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showSkip]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSkip = useCallback(() => {
    sound.stopDrone(400);
    voice.stop();
    localStorage.setItem('nova_onboarding_complete', 'true');
    if (onComplete) onComplete();
  }, [onComplete, sound, voice]);

  // ── Text style ───────────────────────────────────────────
  const textStyle = {
    fontSize: isMobile ? 16 : 18,
    fontWeight: 300,
    letterSpacing: 1,
    color: 'rgba(220,200,255,0.75)',
  };

  // ═══════════════════════════════════════════════════════════
  // STAGE MACHINE
  // ═══════════════════════════════════════════════════════════

  // ── Stage 0: VOID ──────────────────────────────────────
  useEffect(() => {
    if (stage !== 'void') return;
    // Pre-warm voice lines during the void (3 seconds of black)
    voice.preWarm([
      'Hi.',
      "I'm Nova.",
      'Who are you?',
    ], VOICE_PRESETS.onboarding);

    later(() => setDotVisible(true), 2000);
    later(() => setStage('appear'), 2500);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stage 1: APPEAR ────────────────────────────────────
  useEffect(() => {
    if (stage !== 'appear') return;
    // Start drone during portal expansion
    sound.startDrone(2000);

    // Trigger CSS transitions: scale up + fade in
    later(() => {
      setPortalScale(1);
      setPortalOpacity(1);
    }, 50);
    // After scale animation (2.5s) + 500ms hold
    later(() => setStage('first-contact'), 3000);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stage 2: FIRST CONTACT ─────────────────────────────
  useEffect(() => {
    if (stage !== 'first-contact') return;
    // Brief thinking flash
    setNovaState('thinking');
    sound.setDroneState('thinking');
    later(() => {
      setNovaState('idle');
      sound.setDroneState('idle');
    }, 400);

    // Type "Hi." after flash
    later(() => {
      setLines([{ key: nextKey(), text: 'Hi.', style: textStyle, voiceOpts: VOICE_PRESETS.greeting }]);
    }, 500);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFirstContactLine1Done = useCallback(() => {
    // 2s silence, then "I'm Nova."
    later(() => {
      setLines(prev => [
        ...prev.map(l => ({ ...l, done: true })),
        { key: nextKey(), text: "I'm Nova.", style: textStyle, voiceOpts: VOICE_PRESETS.onboarding },
      ]);
    }, 2000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFirstContactLine2Done = useCallback(() => {
    // 2s hold, then all text fades, 2s silence, then question
    later(() => {
      setTextFade(0);
      later(() => {
        setLines([]);
        setTextFade(1);
        later(() => setStage('question'), 2000);
      }, 600);
    }, 2000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stage 3: QUESTION ──────────────────────────────────
  useEffect(() => {
    if (stage !== 'question') return;
    // Fade out previous text
    setTextFade(0);
    later(() => {
      setLines([]);
      setTextFade(1);
      // 2s of just portal in darkness
      later(() => {
        setLines([{ key: nextKey(), text: 'Who are you?', style: textStyle, voiceOpts: VOICE_PRESETS.onboarding }]);
      }, 2000);
    }, 600);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleQuestionDone = useCallback(() => {
    later(() => {
      setInputVisible(true);
      later(() => inputRef.current?.focus(), 100);
    }, 800);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNameSubmit = useCallback((e) => {
    if (e.key !== 'Enter') return;
    const fullName = e.target.value.trim();
    if (!fullName) return;
    const firstName = fullName.split(/\s+/)[0];
    nameRef.current = fullName;
    setUserName(fullName);
    setInputVisible(false);
    // Pre-warm remaining voice lines after name is entered
    voice.preWarm([`${firstName}.`], VOICE_PRESETS.name);
    voice.preWarm(['What is it that you do?', "I'll know the rest soon enough."], VOICE_PRESETS.onboarding);
    setStage('recognition');
  }, [voice]);

  // ── Stage 4: RECOGNITION ──────────────────────────────
  useEffect(() => {
    if (stage !== 'recognition') return;
    // Fade out "Who are you?"
    setTextFade(0);
    later(() => {
      setLines([]);
      setTextFade(1);
    }, 400);

    // Thinking
    setNovaState('thinking');
    sound.setDroneState('thinking');
    later(() => {
      setNovaState('idle');
      sound.setDroneState('idle');
      // Type their first name only
      const firstName = nameRef.current.split(/\s+/)[0];
      later(() => {
        setLines([{ key: nextKey(), text: `${firstName}.`, style: textStyle, voiceOpts: VOICE_PRESETS.name }]);
      }, 200);
    }, 800);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNameEchoDone = useCallback(() => {
    // 4s silence with coreIntensity ramp
    setCoreOverride(0.8);
    const rampStart = performance.now();
    function ramp(now) {
      const t = Math.min(1, (now - rampStart) / 4000);
      setCoreOverride(lerp(0.8, 0.95, t));
      if (t < 1) raf(ramp);
      else setCoreOverride(null);
    }
    raf(ramp);

    later(() => {
      setLines(prev => [
        ...prev.map(l => ({ ...l, done: true })),
        { key: nextKey(), text: 'What is it that you do?', style: textStyle, voiceOpts: VOICE_PRESETS.onboarding },
      ]);
    }, 4000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRoleQuestionDone = useCallback(() => {
    setButtonsVisible(true);
  }, []);

  const handleRoleSelect = useCallback((key) => {
    roleRef.current = key;
    setSelectedRole(key);
    setUserRole(key);
    later(() => {
      setButtonsVisible(false);
      setStage('understanding');
    }, 600);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stage 5: UNDERSTANDING ─────────────────────────────
  useEffect(() => {
    if (stage !== 'understanding') return;
    setTextFade(0);
    later(() => {
      setLines([]);
      setTextFade(1);
    }, 400);

    setNovaState('thinking');
    sound.setDroneState('thinking');
    later(() => {
      setNovaState('idle');
      sound.setDroneState('idle');
      later(() => {
        setLines([{ key: nextKey(), text: "I'll know the rest soon enough.", style: textStyle, voiceOpts: VOICE_PRESETS.onboarding }]);
      }, 200);
    }, 1200);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUnderstandingDone = useCallback(() => {
    later(() => setStage('activation'), 2500);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stage 6: ACTIVATION ────────────────────────────────
  useEffect(() => {
    if (stage !== 'activation') return;
    // Fade out all text
    setTextFade(0);
    later(() => {
      setLines([]);
      setTextFade(1);
    }, 600);

    // Scale portal slightly
    later(() => setPortalScale(1.08), 800);

    // Affirm state
    setNovaState('affirm');
    sound.setDroneState('affirm');

    // Activation chord
    later(() => sound.playActivation(), 900);

    // Save user data
    localStorage.setItem('nova_user_name', nameRef.current);
    localStorage.setItem('nova_user_role', roleRef.current);

    // No text line — go directly to transition after swell + chord
    later(() => setStage('transition'), 2500);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stage 7: TRANSITION ────────────────────────────────
  useEffect(() => {
    if (stage !== 'transition') return;

    // Fade text
    setTextFade(0);
    later(() => setLines([]), 600);

    // Stop drone
    sound.stopDrone(1200);
    voice.stop();

    // Notify parent to reveal AppContent
    if (onTransitionStart) onTransitionStart();

    // Get portal's current position
    const rect = portalWrapRef.current?.getBoundingClientRect();
    if (rect) {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      setFixedPos({ x: cx, y: cy });
      setPosMode('fixed');

      // Double-rAF to ensure fixed position is committed before animating
      raf(() => {
        raf(() => {
          const targetX = window.innerWidth - 24 - 28;
          const targetY = window.innerHeight - 24 - 28;
          setFixedPos({ x: targetX, y: targetY });
          setPortalScale(56 / 345);
          setBgColor('#0B0D11');
        });
      });
    }

    // Complete after transition animation
    later(() => {
      localStorage.setItem('nova_onboarding_complete', 'true');
      if (onComplete) onComplete();
    }, 1400);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Line completion routing ─────────────────────────────
  const handleLineComplete = useCallback((key) => {
    const idx = lines.findIndex(l => l.key === key);
    const text = lines[idx]?.text || '';

    if (stage === 'first-contact') {
      if (text === 'Hi.') handleFirstContactLine1Done();
      else if (text === "I'm Nova.") handleFirstContactLine2Done();
    } else if (stage === 'question') {
      if (text === 'Who are you?') handleQuestionDone();
    } else if (stage === 'recognition') {
      const firstName = nameRef.current.split(/\s+/)[0];
      if (text === `${firstName}.`) handleNameEchoDone();
      else if (text === 'What is it that you do?') handleRoleQuestionDone();
    } else if (stage === 'understanding') {
      handleUnderstandingDone();
    }
  }, [stage, lines]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Portal wrapper style ────────────────────────────────
  const heroSize = isMobile ? 210 : 345;

  const portalWrapStyle = posMode === 'fixed' ? {
    position: 'fixed',
    left: fixedPos.x,
    top: fixedPos.y,
    transform: `translate(-50%, -50%) scale(${portalScale})`,
    transition: 'left 1.2s cubic-bezier(0.4,0,0.2,1), top 1.2s cubic-bezier(0.4,0,0.2,1), transform 1.2s cubic-bezier(0.4,0,0.2,1)',
    zIndex: 1001,
    opacity: portalOpacity,
  } : {
    position: 'relative',
    transform: `scale(${portalScale})`,
    transition: 'transform 2.5s cubic-bezier(0.16,1,0.3,1), opacity 1.5s ease-out',
    opacity: portalOpacity,
    zIndex: 1001,
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: bgColor,
      transition: 'background 1.2s ease',
      zIndex: 999,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
      fontFamily: "'DM Sans', sans-serif",
    }}>

      {/* ── Void dot ── */}
      {stage === 'void' && dotVisible && (
        <div style={{
          width: 4, height: 4, borderRadius: '50%',
          background: 'rgba(160,100,255,0.4)',
          animation: 'novaFadeIn 0.3s ease-out',
        }} />
      )}

      {/* ── Portal ── */}
      {stage !== 'void' && (
        <div ref={portalWrapRef} style={portalWrapStyle}>
          <NovaPortal
            size="hero"
            state={novaState}
            coreIntensityOverride={coreOverride}
            style={{ width: heroSize, height: heroSize }}
          />
        </div>
      )}

      {/* ── Text area ── */}
      {stage !== 'void' && stage !== 'appear' && (
        <div style={{
          marginTop: posMode === 'fixed' ? 0 : 48,
          maxWidth: isMobile ? 320 : 480,
          textAlign: 'center',
          opacity: textFade,
          transition: 'opacity 600ms ease',
          position: posMode === 'fixed' ? 'fixed' : 'relative',
          top: posMode === 'fixed' ? '60%' : undefined,
          left: posMode === 'fixed' ? '50%' : undefined,
          transform: posMode === 'fixed' ? 'translateX(-50%)' : undefined,
        }}>
          {lines.map((line) => (
            <div key={line.key} style={{
              marginBottom: 12,
              animation: 'novaFadeIn 0.4s ease-out',
            }}>
              <TypeWriter
                text={line.text}
                speed={40}
                style={line.style}
                voice={line.done ? undefined : voice}
                voiceOptions={line.done ? undefined : {
                  ...line.voiceOpts,
                  onVoiceStart: () => sound.setDroneDuck(true),
                  onVoiceEnd: () => sound.setDroneDuck(false),
                }}
                onStart={() => sound.playTextPing()}
                onComplete={() => handleLineComplete(line.key)}
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Name input ── */}
      {inputVisible && (
        <div style={{
          marginTop: 24,
          animation: 'novaFadeIn 0.8s ease-out',
        }}>
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            placeholder="First and Last Name"
            onKeyDown={handleNameSubmit}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid rgba(160,100,255,0.2)',
              color: '#fff',
              fontSize: isMobile ? 18 : 20,
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              textAlign: 'center',
              maxWidth: 300,
              width: 300,
              outline: 'none',
              padding: '8px 0',
              caretColor: 'rgba(160,100,255,0.5)',
              letterSpacing: 1,
            }}
          />
        </div>
      )}

      {/* ── Role buttons ── */}
      {buttonsVisible && (
        <div style={{
          marginTop: 24,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 12,
          alignItems: 'center',
        }}>
          {ROLES.map((role, i) => {
            const isSelected = selectedRole === role.key;
            const isHidden = selectedRole && !isSelected;
            return (
              <button
                key={role.key}
                onClick={() => handleRoleSelect(role.key)}
                style={{
                  border: `1px solid ${isSelected ? 'rgba(160,100,255,0.4)' : 'rgba(160,100,255,0.15)'}`,
                  background: 'transparent',
                  color: isSelected ? 'rgba(220,200,255,0.9)' : 'rgba(220,200,255,0.6)',
                  borderRadius: 8,
                  padding: '12px 28px',
                  fontSize: isMobile ? 14 : 16,
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 300,
                  cursor: isHidden ? 'default' : 'pointer',
                  transition: 'all 300ms',
                  opacity: isHidden ? 0 : 1,
                  pointerEvents: isHidden ? 'none' : 'auto',
                  boxShadow: isSelected ? '0 0 12px rgba(160,100,255,0.15)' : 'none',
                  animation: `novaFadeIn 0.6s ease-out ${i * 150}ms both`,
                }}
                onMouseEnter={e => {
                  if (!selectedRole) {
                    e.currentTarget.style.background = 'rgba(160,100,255,0.08)';
                    e.currentTarget.style.color = 'rgba(220,200,255,0.9)';
                    e.currentTarget.style.borderColor = 'rgba(160,100,255,0.3)';
                  }
                }}
                onMouseLeave={e => {
                  if (!selectedRole) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'rgba(220,200,255,0.6)';
                    e.currentTarget.style.borderColor = 'rgba(160,100,255,0.15)';
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
            position: 'fixed', bottom: 24, right: 24,
            fontSize: 13, color: 'rgba(220,200,255,0.2)',
            cursor: 'pointer', zIndex: 1002,
            fontFamily: "'DM Sans', sans-serif",
            transition: 'color 300ms',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'rgba(220,200,255,0.5)'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(220,200,255,0.2)'}
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
