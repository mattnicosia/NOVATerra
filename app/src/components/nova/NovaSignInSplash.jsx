// NovaSignInSplash — Full returning-user sequence
// Script reference: Archive/NOVA-SCRIPT-FINAL.md § "RETURNING USER FLOW"
// Stages: void → appear → greeting → briefing → departure
import { useState, useEffect, useRef, useCallback } from 'react';
import NovaSceneLazy from '@/components/nova/NovaSceneLazy';
import TypeWriter from './TypeWriter';
import useNovaSound from './useNovaSound';
import useNovaVoice from './useNovaVoice';
import { VOICE_PRESETS } from './voicePresets';
import { getScript } from '@/utils/novaScriptOverrides';
import { useEstimatesStore } from '@/stores/estimatesStore';

// ── Timer helper ──
function useTimerManager() {
  const timers = useRef(new Set());
  const rafs = useRef(new Set());
  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => { timers.current.delete(id); fn(); }, ms);
    timers.current.add(id);
    return id;
  }, []);
  const raf = useCallback((fn) => {
    const id = requestAnimationFrame((t) => { rafs.current.delete(id); fn(t); });
    rafs.current.add(id);
    return id;
  }, []);
  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    rafs.current.forEach(cancelAnimationFrame);
  }, []);
  return { later, raf };
}

// ── Bid data helper ──
function getBidBriefing(estimates) {
  const now = new Date();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
  endOfWeek.setHours(23, 59, 59, 999);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayName = dayNames[now.getDay()];

  const dueThisWeek = estimates.filter(est => {
    if (!est.bidDue) return false;
    const due = new Date(est.bidDue);
    return due >= now && due <= endOfWeek;
  });

  if (dueThisWeek.length === 0) return null;

  const byDay = {};
  dueThisWeek.forEach(est => {
    const d = new Date(est.bidDue);
    const day = dayNames[d.getDay()];
    if (!byDay[day]) byDay[day] = 0;
    byDay[day]++;
  });

  return { total: dueThisWeek.length, byDay, todayName };
}

const textStyle = {
  fontSize: 16, fontWeight: 300, letterSpacing: 1,
  color: 'rgba(220,200,255,0.75)',
};

const dayStyle = {
  ...textStyle, fontSize: 14,
  color: 'rgba(200,180,255,0.45)',
};

export default function NovaSignInSplash({ onComplete, onTransitionStart }) {
  const S = getScript('RETURNING');
  const { later, raf } = useTimerManager();
  const sound = useNovaSound();
  const voice = useNovaVoice();

  const [stage, setStage] = useState('void');
  const [novaState, setNovaState] = useState('idle');
  const [dotVisible, setDotVisible] = useState(false);
  const [portalScale, setPortalScale] = useState(0.02);
  const [portalOpacity, setPortalOpacity] = useState(0);
  const [lines, setLines] = useState([]);
  const [textFade, setTextFade] = useState(1);
  const [bgColor, setBgColor] = useState('#04040c');
  const [posMode, setPosMode] = useState('centered');
  const [fixedPos, setFixedPos] = useState({ x: 0, y: 0 });

  const portalRef = useRef(null);
  const lineKeyRef = useRef(0);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const nextKey = () => `l-${++lineKeyRef.current}`;

  const fullName = localStorage.getItem('nova_user_name') || '';
  const firstName = fullName.split(/\s+/)[0] || '';
  const estimates = useEstimatesStore(s => s.estimatesIndex);
  const bidData = useRef(getBidBriefing(estimates));

  const handleClick = useCallback(() => {
    sound.stopDrone(400);
    voice.stop();
    if (onComplete) onComplete();
  }, [onComplete, sound, voice]);

  // ── VOID ──
  useEffect(() => {
    if (stage !== 'void') return;
    const greeting = S.greeting.greetLine.text(firstName);
    voice.preWarm([greeting, S.greeting.waitingLine.text], VOICE_PRESETS[S.greeting.greetLine.voice]);
    later(() => setDotVisible(true), S.void.dotAppearMs);
    later(() => setStage('appear'), S.void.advanceMs);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── APPEAR ──
  useEffect(() => {
    if (stage !== 'appear') return;
    sound.setVolume(S.appear.droneVolume);
    sound.startDrone(S.appear.droneFadeMs);
    later(() => { setPortalScale(1); setPortalOpacity(1); }, S.appear.portalDelayMs);
    later(() => setStage('greeting'), S.appear.advanceMs);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── GREETING ──
  useEffect(() => {
    if (stage !== 'greeting') return;
    setNovaState('thinking');
    sound.setDroneState('thinking');
    later(() => { setNovaState('idle'); sound.setDroneState('idle'); }, S.greeting.thinkingFlashMs);

    const greeting = S.greeting.greetLine.text(firstName);
    later(() => {
      setLines([{ key: nextKey(), lineId: 'greet', text: greeting, style: textStyle, voiceOpts: VOICE_PRESETS[S.greeting.greetLine.voice] }]);
    }, S.greeting.lineDelayMs);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGreetingDone = useCallback(() => {
    later(() => {
      setLines(prev => [
        ...prev.map(l => ({ ...l, done: true })),
        { key: nextKey(), lineId: 'wait', text: S.greeting.waitingLine.text, style: textStyle, voiceOpts: VOICE_PRESETS[S.greeting.waitingLine.voice] },
      ]);
    }, S.greeting.afterGreetMs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWaitingDone = useCallback(() => {
    later(() => {
      setTextFade(0);
      later(() => {
        setLines([]);
        setTextFade(1);
        setStage(bidData.current ? 'briefing' : 'briefing-none');
      }, S.greeting.textFadeMs);
    }, S.greeting.afterWaitingMs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── BRIEFING (bids due) ──
  useEffect(() => {
    if (stage !== 'briefing') return;
    const bd = bidData.current;
    if (!bd) { setStage('departure'); return; }

    setNovaState('thinking');
    sound.setDroneState('thinking');
    later(() => {
      setNovaState('idle');
      sound.setDroneState('idle');
      later(() => {
        setLines([{
          key: nextKey(), lineId: 'brief-main',
          text: S.briefing.mainLine.text(bd.total),
          style: textStyle,
          voiceOpts: VOICE_PRESETS[S.briefing.mainLine.voice],
        }]);
      }, S.briefing.lineDelayMs);
    }, S.briefing.thinkingMs);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBriefingMainDone = useCallback(() => {
    const bd = bidData.current;
    if (!bd) { later(() => setStage('departure'), 1000); return; }

    later(() => {
      const dayEntries = Object.entries(bd.byDay);
      const dayLines = dayEntries.map(([day, count], i) => {
        const isToday = day === bd.todayName;
        const isLast = i === dayEntries.length - 1;
        return {
          key: nextKey(),
          lineId: isLast ? 'day-last' : `day-${i}`,
          text: `${count} on ${day}.`,
          style: {
            ...dayStyle,
            color: isToday ? 'rgba(255,210,140,0.85)' : (count >= 3 ? 'rgba(200,180,255,0.65)' : dayStyle.color),
          },
          voiceOpts: VOICE_PRESETS[S.briefing.dayLineVoice],
          isToday,
        };
      });
      setLines(prev => [
        ...prev.map(l => ({ ...l, done: true })),
        ...dayLines,
      ]);
    }, S.briefing.dayLineDelayMs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDayLineDone = useCallback(() => {
    later(() => setStage('departure'), S.briefing.afterDaysMs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── BRIEFING NONE ──
  useEffect(() => {
    if (stage !== 'briefing-none') return;
    later(() => {
      setLines([{ key: nextKey(), lineId: 'no-bids', text: S.briefingNone.noBidsLine.text, style: textStyle, voiceOpts: VOICE_PRESETS[S.briefingNone.noBidsLine.voice] }]);
    }, S.briefingNone.lineDelayMs);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNoBidsDone = useCallback(() => {
    later(() => {
      setLines(prev => [
        ...prev.map(l => ({ ...l, done: true })),
        { key: nextKey(), lineId: 'clear', text: S.briefingNone.clearLine.text, style: textStyle, voiceOpts: VOICE_PRESETS[S.briefingNone.clearLine.voice] },
      ]);
    }, S.briefingNone.afterNoBidsMs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClearDone = useCallback(() => {
    setNovaState('affirm');
    later(() => setNovaState('idle'), S.briefingNone.affirmFlashMs);
    later(() => setStage('departure'), S.briefingNone.afterClearMs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── DEPARTURE ──
  useEffect(() => {
    if (stage !== 'departure') return;
    setTextFade(0);
    later(() => setLines([]), S.departure.textFadeMs);

    later(() => setPortalScale(S.departure.portalSwellScale), S.departure.portalSwellDelayMs);
    setNovaState(S.departure.orbState);
    sound.setDroneState(S.departure.orbState);
    sound.setVolume(S.departure.droneVolume);
    later(() => sound.playActivation(), S.departure.chordDelayMs);
    sound.stopDrone(S.departure.droneFadeMs);
    voice.stop();

    if (onTransitionStart) onTransitionStart();

    later(() => {
      const rect = portalRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        setFixedPos({ x: cx, y: cy });
        setPosMode('fixed');
        raf(() => {
          raf(() => {
            const orbEl = document.getElementById('nova-bar-orb');
            const orbRect = orbEl?.getBoundingClientRect();
            const targetX = orbRect ? orbRect.left + orbRect.width / 2 : 275;
            const targetY = orbRect ? orbRect.top + orbRect.height / 2 : 74;
            setFixedPos({ x: targetX, y: targetY });
            setPortalScale(50 / 200);
            setBgColor(S.departure.bgColor);
          });
        });
      }
    }, S.departure.flyDelayMs);

    later(() => { if (onComplete) onComplete(); }, S.departure.completeMs);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Line routing (lineId-based, stable via ref) ──
  const handleLineComplete = useCallback((key) => {
    const line = linesRef.current.find(l => l.key === key);
    if (!line?.lineId) return;
    const handlers = {
      'greet':      handleGreetingDone,
      'wait':       handleWaitingDone,
      'brief-main': handleBriefingMainDone,
      'day-last':   handleDayLineDone,
      'no-bids':    handleNoBidsDone,
      'clear':      handleClearDone,
    };
    if (handlers[line.lineId]) handlers[line.lineId]();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Styles ──
  const heroSize = 200;
  const portalWrapStyle = posMode === 'fixed' ? {
    position: 'fixed', left: fixedPos.x, top: fixedPos.y,
    transform: `translate(-50%, -50%) scale(${portalScale})`,
    transition: 'left 1.2s cubic-bezier(0.4,0,0.2,1), top 1.2s cubic-bezier(0.4,0,0.2,1), transform 1.2s cubic-bezier(0.4,0,0.2,1)',
    zIndex: 1001,
  } : {
    position: 'relative',
    transform: `scale(${portalScale})`,
    transition: 'transform 1.5s cubic-bezier(0.16,1,0.3,1), opacity 0.8s ease',
    opacity: portalOpacity, zIndex: 1001,
  };

  return (
    <div onClick={handleClick} style={{
      position: 'fixed', inset: 0,
      background: bgColor, transition: 'background 1.2s ease',
      zIndex: 999,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
      fontFamily: "'DM Sans', sans-serif",
      cursor: 'pointer',
    }}>
      {stage === 'void' && dotVisible && (
        <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(160,100,255,0.4)' }} />
      )}

      {stage !== 'void' && (
        <div ref={portalRef} style={portalWrapStyle}>
          <NovaSceneLazy width={heroSize} height={heroSize} size={0.85} intensity={0.7} artifact awaken={0.8} />
        </div>
      )}

      {stage !== 'void' && stage !== 'appear' && (
        <div style={{
          marginTop: posMode === 'fixed' ? 0 : 36,
          maxWidth: 480, textAlign: 'center',
          opacity: textFade, transition: 'opacity 600ms ease',
          position: posMode === 'fixed' ? 'fixed' : 'relative',
          top: posMode === 'fixed' ? '60%' : undefined,
          left: posMode === 'fixed' ? '50%' : undefined,
          transform: posMode === 'fixed' ? 'translateX(-50%)' : undefined,
        }}>
          {lines.map((line) => (
            <div key={line.key} style={{ marginBottom: 8, animation: 'novaSplashFadeIn 0.4s ease-out' }}>
              <TypeWriter
                text={line.text}
                speed={S.typewriterSpeed}
                style={line.style}
                voice={line.done ? undefined : voice}
                voiceOptions={line.done ? undefined : {
                  ...line.voiceOpts,
                  onVoiceStart: () => sound.setDroneDuck(true),
                  onVoiceEnd: () => sound.setDroneDuck(false),
                }}
                onStart={() => {
                  sound.playTextPing();
                  if (line.isToday) {
                    setNovaState('alert');
                    setTimeout(() => setNovaState('idle'), 600);
                  }
                }}
                onComplete={() => handleLineComplete(line.key)}
              />
            </div>
          ))}
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
