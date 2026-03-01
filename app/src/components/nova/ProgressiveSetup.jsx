// ProgressiveSetup — NOVA-driven onboarding conversation
// Dark-themed panel. Navigates to Settings. Collects company name, fills it in.
// Script: "Before we start, tell me a bit more about yourself."
//         "What is the name of your company?" → user types → NOVA fills Primary Profile
//         "Please, continue." → user finishes settings themselves
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NovaOrb from '@/components/dashboard/NovaOrb';
import TypeWriter from './TypeWriter';
import useNovaSound from './useNovaSound';
import useNovaVoice from './useNovaVoice';
import { VOICE_PRESETS } from './voicePresets';
import { getScript } from '@/utils/novaScriptOverrides';
import { useMasterDataStore } from '@/stores/masterDataStore';
import { useNovaStore } from '@/stores/novaStore';

// ── Timer helper ──
function useLater() {
  const timers = useRef(new Set());
  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => { timers.current.delete(id); fn(); }, ms);
    timers.current.add(id);
    return id;
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return later;
}

// ── Dark theme ──
const D = {
  bg:         '#0B0D11',
  bgAlt:      'rgba(160,100,255,0.06)',
  text:       'rgba(220,200,255,0.75)',
  textDim:    'rgba(160,140,200,0.5)',
  border:     'rgba(160,100,255,0.12)',
  accent:     'rgba(160,100,255,0.8)',
  userBubble: 'rgba(160,100,255,0.2)',
};

export default function ProgressiveSetup({ onComplete }) {
  const S = getScript('SETUP');
  const STEPS = S.steps;
  const later = useLater();
  const sound = useNovaSound();
  const voice = useNovaVoice();
  const navigate = useNavigate();
  const updateCompanyInfo = useMasterDataStore(s => s.updateCompanyInfo);

  const [stepIdx, setStepIdx] = useState(-1);
  const [messages, setMessages] = useState([]);
  const [currentText, setCurrentText] = useState('');
  const [currentKey, setCurrentKey] = useState(0);
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [novaState, setNovaState] = useState('idle');

  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const companyRef = useRef('');
  const msgKeyRef = useRef(0);
  const nextMsgKey = () => `msg-${++msgKeyRef.current}`;

  useEffect(() => {
    navigate(S.navigateTo);
    later(() => setPanelOpen(true), S.panelOpenMs);
    voice.preWarm(
      STEPS.filter(s => s.text).map(s => s.text),
      VOICE_PRESETS.onboarding
    );
    later(() => setStepIdx(0), S.startDelayMs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, currentText]);

  // Handle step changes
  useEffect(() => {
    if (stepIdx < 0 || stepIdx >= STEPS.length) return;
    const step = STEPS[stepIdx];

    if (step.type === 'dynamic') {
      // Insert company name into Primary Profile
      const name = companyRef.current;
      if (name) {
        updateCompanyInfo('name', name);
        localStorage.setItem('nova_company', name);
      }
      setNovaState('learning');
      useNovaStore.getState().startTask('import', 'Updating profile...');
      later(() => {
        useNovaStore.getState().completeTask('Profile updated');
        setNovaState('idle');
        sound.playTextPing();
        setCurrentText(step.text);
        setCurrentKey(prev => prev + 1);
      }, S.processingMs);
      return;
    }

    if (!step.text) return;
    sound.playTextPing();
    setCurrentText(step.text);
    setCurrentKey(prev => prev + 1);
  }, [stepIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle TypeWriter complete
  const handleLineComplete = useCallback(() => {
    if (stepIdx < 0 || stepIdx >= STEPS.length) return;
    const step = STEPS[stepIdx];

    const text = step.text;
    setMessages(prev => [...prev, { role: 'nova', text, key: nextMsgKey() }]);
    setCurrentText('');

    if (step.type === 'input') {
      later(() => {
        setInputVisible(true);
        setInputValue('');
        later(() => inputRef.current?.focus(), 100);
      }, S.inputDelayMs);
    } else {
      later(() => advanceStep(), step.holdMs);
    }
  }, [stepIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const advanceStep = useCallback(() => {
    const next = stepIdx + 1;
    if (next >= STEPS.length) {
      setClosing(true);
      later(() => {
        localStorage.setItem('nova_setup_complete', 'true');
        if (onComplete) onComplete();
      }, S.closeMs);
    } else {
      setStepIdx(next);
    }
  }, [stepIdx, onComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInputSubmit = useCallback((e) => {
    if (e.key !== 'Enter') return;
    const val = inputValue.trim();
    if (!val) return;

    setInputVisible(false);
    companyRef.current = val;

    // Add user message
    setMessages(prev => [...prev, { role: 'user', text: val, key: nextMsgKey() }]);

    // Brief thinking, then advance
    setNovaState('learning');
    useNovaStore.getState().startTask('import', 'Processing...');
    later(() => {
      useNovaStore.getState().resetStatus();
      setNovaState('idle');
      advanceStep();
    }, S.thinkingMs);
  }, [inputValue, stepIdx, advanceStep]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: 420,
      background: D.bg,
      boxShadow: '-4px 0 32px rgba(0,0,0,0.6)',
      display: 'flex', flexDirection: 'column',
      zIndex: 1000,
      fontFamily: "'DM Sans', sans-serif",
      transform: panelOpen && !closing ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 400ms cubic-bezier(0.4,0,0.2,1)',
      borderLeft: `1px solid ${D.border}`,
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', borderBottom: `1px solid ${D.border}`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 16px rgba(160,100,255,0.3)',
        }}>
          <NovaOrb size={42} scheme="nova" />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: D.text }}>NOVA</div>
          <div style={{ fontSize: 12, color: D.textDim }}>Getting to know you</div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflow: 'auto', padding: 20,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {messages.map(msg => (
          <div key={msg.key} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            {msg.role === 'nova' && (
              <div style={{ width: 30, height: 30, borderRadius: '50%', marginRight: 8, flexShrink: 0 }}>
                <NovaOrb size={30} scheme="nova" />
              </div>
            )}
            <div style={{
              maxWidth: '80%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: msg.role === 'user' ? D.userBubble : D.bgAlt,
              color: D.text,
              fontSize: 14, fontWeight: 400, lineHeight: 1.6, margin: 0,
            }}>
              {msg.text}
            </div>
          </div>
        ))}

        {/* Current typing line */}
        {currentText && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', marginRight: 8, flexShrink: 0 }}>
              <NovaOrb size={30} scheme="nova" />
            </div>
            <div style={{
              maxWidth: '80%', padding: '10px 14px',
              borderRadius: '16px 16px 16px 4px',
              background: D.bgAlt,
            }}>
              <TypeWriter
                key={currentKey}
                text={currentText}
                speed={S.typewriterSpeed}
                style={{ fontSize: 14, color: D.text }}
                voice={voice}
                voiceOptions={{
                  ...VOICE_PRESETS[STEPS[stepIdx]?.voice || 'onboarding'],
                  onVoiceStart: () => sound.setDroneDuck?.(true),
                  onVoiceEnd: () => sound.setDroneDuck?.(false),
                }}
                onComplete={handleLineComplete}
              />
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      {inputVisible && (
        <div style={{
          padding: '12px 20px', borderTop: `1px solid ${D.border}`,
          animation: 'novaSetupFadeIn 0.4s ease-out',
        }}>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleInputSubmit}
            placeholder={STEPS[stepIdx]?.placeholder || ''}
            style={{
              width: '100%', padding: '10px 14px',
              border: `1px solid ${D.border}`,
              borderRadius: 12,
              background: 'rgba(160,100,255,0.04)',
              color: D.text,
              fontSize: 14,
              fontFamily: "'DM Sans', sans-serif",
              outline: 'none',
              caretColor: D.accent,
            }}
          />
          <div style={{ fontSize: 10, color: D.textDim, marginTop: 6, textAlign: 'center' }}>
            Press Enter to continue
          </div>
        </div>
      )}

      <style>{`
        @keyframes novaSetupFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .nova-setup-input::placeholder {
          color: rgba(160,100,255,0.25);
        }
      `}</style>
    </div>
  );
}
