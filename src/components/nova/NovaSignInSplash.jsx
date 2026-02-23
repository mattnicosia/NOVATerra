// NovaSignInSplash — Abbreviated ~5s returning-user greeting
// Plays every browser session after the first-time onboarding is complete.
// Portal fades in → types "Welcome back, {Name}." → flies to FAB corner → app reveals
// Sound: drone (0.8x volume), text ping, activation chord (60% volume)
// Voice: ElevenLabs TTS (graceful fallback if unavailable)
import { useState, useEffect, useRef, useCallback } from 'react';
import NovaPortal from './NovaPortal';
import TypeWriter from './TypeWriter';
import useNovaSound from './useNovaSound';
import useNovaVoice from './useNovaVoice';
import { VOICE_PRESETS } from './voicePresets';

export default function NovaSignInSplash({ onComplete, onTransitionStart }) {
  const [phase, setPhase] = useState('dark');   // dark → greet → hold → fly → done
  const [novaState, setNovaState] = useState('idle');
  const [portalOpacity, setPortalOpacity] = useState(0);
  const [glowOpacity, setGlowOpacity] = useState(0);
  const [textOpacity, setTextOpacity] = useState(1);
  const [showText, setShowText] = useState(false);
  const [bgColor, setBgColor] = useState('#04040c');
  const [posMode, setPosMode] = useState('centered');
  const [fixedPos, setFixedPos] = useState({ x: 0, y: 0 });
  const [portalScale, setPortalScale] = useState(1);

  const portalRef = useRef(null);
  const timers = useRef(new Set());
  const rafs = useRef(new Set());

  const sound = useNovaSound();
  const voice = useNovaVoice();

  const fullName = localStorage.getItem('nova_user_name') || '';
  const firstName = fullName.split(/\s+/)[0] || '';
  const greeting = firstName ? `Welcome back, ${firstName}.` : 'Welcome back.';

  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
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

  // Cleanup
  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
      rafs.current.forEach(cancelAnimationFrame);
    };
  }, []);

  // Pre-warm voice on mount
  useEffect(() => {
    voice.preWarm([greeting], VOICE_PRESETS.welcomeBack);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Click anywhere to skip
  const handleClick = useCallback(() => {
    sound.stopDrone(400);
    voice.stop();
    if (onComplete) onComplete();
  }, [onComplete, sound, voice]);

  // ── Phase: dark → greet ──
  useEffect(() => {
    if (phase !== 'dark') return;
    // Start drone at 0.8x volume
    sound.setVolume(0.8);
    sound.startDrone(1500);

    // Fade in portal
    later(() => {
      setPortalOpacity(1);
      setGlowOpacity(1);
    }, 100);
    // After portal visible, start greeting
    later(() => setPhase('greet'), 800);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase: greet ──
  useEffect(() => {
    if (phase !== 'greet') return;
    // Brief thinking flash
    setNovaState('thinking');
    sound.setDroneState('thinking');
    later(() => {
      setNovaState('idle');
      sound.setDroneState('idle');
    }, 300);
    // Show text
    later(() => setShowText(true), 400);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTypeDone = useCallback(() => {
    later(() => setPhase('hold'), 200);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase: hold ──
  useEffect(() => {
    if (phase !== 'hold') return;
    later(() => setPhase('fly'), 1000);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase: fly ──
  useEffect(() => {
    if (phase !== 'fly') return;
    // Fade text
    setTextOpacity(0);

    // Affirm state + activation chord at 60%
    setNovaState('affirm');
    sound.setDroneState('affirm');
    sound.setVolume(0.6);
    sound.playActivation();

    // Stop drone
    sound.stopDrone(1200);
    voice.stop();

    // Notify parent
    if (onTransitionStart) onTransitionStart();

    // Get portal position for fixed transition
    const rect = portalRef.current?.getBoundingClientRect();
    if (rect) {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      setFixedPos({ x: cx, y: cy });
      setPosMode('fixed');

      // Double-rAF for CSS transition trigger
      raf(() => {
        raf(() => {
          const targetX = window.innerWidth - 24 - 28;
          const targetY = window.innerHeight - 24 - 28;
          setFixedPos({ x: targetX, y: targetY });
          setPortalScale(1); // already floating size, just move it
          setBgColor('#0B0D11');
        });
      });
    }

    // Complete
    later(() => {
      if (onComplete) onComplete();
    }, 1400);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Portal style ──
  const portalStyle = posMode === 'fixed' ? {
    position: 'fixed',
    left: fixedPos.x,
    top: fixedPos.y,
    transform: `translate(-50%, -50%) scale(${portalScale})`,
    transition: 'left 1.2s cubic-bezier(0.4,0,0.2,1), top 1.2s cubic-bezier(0.4,0,0.2,1), transform 1.2s cubic-bezier(0.4,0,0.2,1)',
    zIndex: 1001,
  } : {
    position: 'relative',
    opacity: portalOpacity,
    transition: 'opacity 0.6s ease',
    zIndex: 1001,
  };

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'fixed', inset: 0,
        background: bgColor,
        transition: 'background 1.2s ease',
        zIndex: 999,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
        fontFamily: "'DM Sans', sans-serif",
        cursor: 'pointer',
      }}
    >
      {/* Portal */}
      <div ref={portalRef} style={portalStyle}>
        {/* Glow */}
        <div style={{
          position: 'absolute',
          top: -10, left: -10, right: -10, bottom: -10,
          borderRadius: '50%',
          boxShadow: '0 0 16px rgba(160,100,255,0.4), 0 0 32px rgba(100,50,220,0.15)',
          opacity: glowOpacity,
          transition: 'opacity 0.8s ease',
          pointerEvents: 'none',
        }} />
        <NovaPortal size="floating" state={novaState} />
      </div>

      {/* Greeting text */}
      {showText && (
        <div style={{
          marginTop: 32,
          textAlign: 'center',
          opacity: textOpacity,
          transition: 'opacity 400ms ease',
          position: posMode === 'fixed' ? 'fixed' : 'relative',
          top: posMode === 'fixed' ? '55%' : undefined,
          left: posMode === 'fixed' ? '50%' : undefined,
          transform: posMode === 'fixed' ? 'translateX(-50%)' : undefined,
          animation: 'novaSplashFadeIn 0.4s ease-out',
        }}>
          <TypeWriter
            text={greeting}
            speed={35}
            voice={voice}
            voiceOptions={{
              ...VOICE_PRESETS.welcomeBack,
              onVoiceStart: () => sound.setDroneDuck(true),
              onVoiceEnd: () => sound.setDroneDuck(false),
            }}
            onStart={() => sound.playTextPing()}
            onComplete={handleTypeDone}
            style={{
              fontSize: 16,
              fontWeight: 300,
              letterSpacing: 1,
              color: 'rgba(220,200,255,0.65)',
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes novaSplashFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
