// NovaScriptEditor — Visual editor for NOVA dialogue, timing, and behavior
// Lives in Settings page. Reads/writes novaScriptOverrides (localStorage).
import { useState, useCallback, useRef } from 'react';
import { useTheme } from '@/hooks/useTheme';
import Sec from '@/components/shared/Sec';
import { inp, nInp, bt } from '@/utils/styles';
import {
  getOverrides, setOverride, resetSection, getScript,
  getDisplayValue, getDefaultValue, isTemplateFn, hasOverride,
  addStepOverride, removeStepOverride, moveStepOverride,
} from '@/utils/novaScriptOverrides';
import { ONBOARDING, TOUR, SETUP, RETURNING } from '@/components/nova/novaScript';
import { useNovaAudioStore } from '@/stores/novaAudioStore';
import { saveAudioBlob, removeAudioBlob, loadAudioBlob, saveSlotVolume } from '@/utils/novaAudioStorage';

// ── Constants ────────────────────────────────────────────────
const VOICE_OPTIONS = ['greeting', 'onboarding', 'name', 'welcomeBack', 'briefing', 'alert'];
const ORB_OPTIONS = ['idle', 'thinking', 'learning', 'alert', 'affirm'];
const SETUP_TYPE_OPTIONS = ['message', 'input', 'dynamic'];
const SECTIONS = ['ONBOARDING', 'TOUR', 'SETUP', 'RETURNING', 'SOUNDS'];
const SECTION_LABELS = { ONBOARDING: 'Onboarding', TOUR: 'Tour', SETUP: 'Setup', RETURNING: 'Returning', SOUNDS: 'Sounds' };

const AUDIO_SLOTS = [
  { key: 'drone', label: 'Background Drone', desc: 'Ambient loop during NOVA sequences' },
  { key: 'textPing', label: 'Text Ping', desc: 'Short sound on each text reveal' },
  { key: 'activation', label: 'Activation Chord', desc: 'Rising chord at activation moments' },
];

// ── Default step templates for "Add Step" ────────────────────
const DEFAULT_TOUR_STEP = { text: 'New step...', target: null, orbState: 'idle', voice: 'onboarding', holdMs: 2000 };
const DEFAULT_SETUP_STEP = { id: 'new-step', text: 'New step...', type: 'message', voice: 'onboarding', holdMs: 1200 };

// ── Schema: defines what fields the editor shows per section ─
// type: 'text' | 'number' | 'voice' | 'orbState' | 'color' | 'readonly'

function onboardingFields() {
  return [
    { group: 'Void', fields: [
      { label: 'Dot appear', path: 'void.dotAppearMs', type: 'number', suffix: 'ms' },
      { label: 'Advance to appear', path: 'void.advanceMs', type: 'number', suffix: 'ms' },
    ]},
    { group: 'Appear', fields: [
      { label: 'Drone fade-in', path: 'appear.droneFadeInMs', type: 'number', suffix: 'ms' },
      { label: 'Portal delay', path: 'appear.portalDelayMs', type: 'number', suffix: 'ms' },
      { label: 'Advance to first-contact', path: 'appear.advanceMs', type: 'number', suffix: 'ms' },
    ]},
    { group: 'First Contact', fields: [
      { label: 'Thinking flash', path: 'firstContact.thinkingFlashMs', type: 'number', suffix: 'ms' },
      { label: 'Line 1 delay', path: 'firstContact.line1DelayMs', type: 'number', suffix: 'ms' },
      { label: 'Line 1 text', path: 'firstContact.line1.text', type: 'text' },
      { label: 'Line 1 voice', path: 'firstContact.line1.voice', type: 'voice' },
      { label: 'After line 1', path: 'firstContact.afterLine1Ms', type: 'number', suffix: 'ms' },
      { label: 'Line 2 text', path: 'firstContact.line2.text', type: 'text' },
      { label: 'Line 2 voice', path: 'firstContact.line2.voice', type: 'voice' },
      { label: 'After line 2', path: 'firstContact.afterLine2Ms', type: 'number', suffix: 'ms' },
      { label: 'Text fade', path: 'firstContact.textFadeMs', type: 'number', suffix: 'ms' },
      { label: 'Silence', path: 'firstContact.silenceMs', type: 'number', suffix: 'ms' },
    ]},
    { group: 'Question', fields: [
      { label: 'Text fade', path: 'question.textFadeMs', type: 'number', suffix: 'ms' },
      { label: 'Silence before question', path: 'question.silenceMs', type: 'number', suffix: 'ms' },
      { label: 'Text', path: 'question.line.text', type: 'text' },
      { label: 'Voice', path: 'question.line.voice', type: 'voice' },
      { label: 'Input delay', path: 'question.inputDelayMs', type: 'number', suffix: 'ms' },
      { label: 'Input focus delay', path: 'question.inputFocusMs', type: 'number', suffix: 'ms' },
    ]},
    { group: 'Recognition', fields: [
      { label: 'Text fade', path: 'recognition.textFadeMs', type: 'number', suffix: 'ms' },
      { label: 'Thinking', path: 'recognition.thinkingMs', type: 'number', suffix: 'ms' },
      { label: 'Greet delay', path: 'recognition.greetDelayMs', type: 'number', suffix: 'ms' },
      { label: 'Greet text', path: 'recognition.greetLine.text', type: 'text', hint: 'Use {name} for first name' },
      { label: 'Greet voice', path: 'recognition.greetLine.voice', type: 'voice' },
      { label: 'Core ramp duration', path: 'recognition.coreRampMs', type: 'number', suffix: 'ms' },
      { label: 'Role question text', path: 'recognition.roleLine.text', type: 'text' },
      { label: 'Role question voice', path: 'recognition.roleLine.voice', type: 'voice' },
      { label: 'Role glow', path: 'recognition.roleGlowMs', type: 'number', suffix: 'ms' },
      { label: 'Role fade', path: 'recognition.roleFadeMs', type: 'number', suffix: 'ms' },
      { label: 'To absorb delay', path: 'recognition.toAbsorbMs', type: 'number', suffix: 'ms' },
    ]},
    { group: 'Absorb', fields: [
      { label: 'Orb state', path: 'absorb.orbState', type: 'orbState' },
      { label: 'Line delay', path: 'absorb.lineDelayMs', type: 'number', suffix: 'ms' },
      { label: 'Text', path: 'absorb.line.text', type: 'text' },
      { label: 'Voice', path: 'absorb.line.voice', type: 'voice' },
      { label: 'Hold glow', path: 'absorb.holdGlowMs', type: 'number', suffix: 'ms' },
      { label: 'Text fade', path: 'absorb.textFadeMs', type: 'number', suffix: 'ms' },
      { label: 'Silence before activation', path: 'absorb.silenceMs', type: 'number', suffix: 'ms' },
    ]},
    { group: 'Activation', fields: [
      { label: 'Text fade', path: 'activation.textFadeMs', type: 'number', suffix: 'ms' },
      { label: 'Portal scale delay', path: 'activation.portalScaleDelay', type: 'number', suffix: 'ms' },
      { label: 'Portal scale', path: 'activation.portalScale', type: 'number', step: 0.01 },
      { label: 'Orb state', path: 'activation.orbState', type: 'orbState' },
      { label: 'Chord delay', path: 'activation.chordDelayMs', type: 'number', suffix: 'ms' },
      { label: 'Hold', path: 'activation.holdMs', type: 'number', suffix: 'ms' },
    ]},
    { group: 'Transition', fields: [
      { label: 'Text fade', path: 'transition.textFadeMs', type: 'number', suffix: 'ms' },
      { label: 'Drone fade', path: 'transition.droneFadeMs', type: 'number', suffix: 'ms' },
      { label: 'Background', path: 'transition.bgColor', type: 'color' },
      { label: 'Complete', path: 'transition.completeMs', type: 'number', suffix: 'ms' },
    ]},
    { group: 'Misc', fields: [
      { label: 'Role button stagger', path: 'roleStaggerMs', type: 'number', suffix: 'ms' },
      { label: 'Typewriter speed', path: 'typewriterSpeed', type: 'number', suffix: 'ms/char' },
    ]},
  ];
}

function tourFields() {
  const merged = getScript('TOUR');
  const groups = [
    { group: 'Global Timing', fields: [
      { label: 'Start delay', path: 'startDelayMs', type: 'number', suffix: 'ms' },
      { label: 'Illuminate delay', path: 'illuminateDelayMs', type: 'number', suffix: 'ms' },
      { label: 'Step gap', path: 'stepGapMs', type: 'number', suffix: 'ms' },
      { label: 'Exit fade', path: 'exitFadeMs', type: 'number', suffix: 'ms' },
      { label: 'Typewriter speed', path: 'typewriterSpeed', type: 'number', suffix: 'ms/char' },
    ]},
  ];
  merged.steps.forEach((step, i) => {
    groups.push({
      group: `Step ${i + 1}`,
      stepManage: { section: 'TOUR', arrayPath: 'steps', index: i, total: merged.steps.length },
      fields: [
        { label: 'Text', path: `steps.${i}.text`, type: 'text' },
        { label: 'Voice', path: `steps.${i}.voice`, type: 'voice' },
        { label: 'Orb state', path: `steps.${i}.orbState`, type: 'orbState' },
        { label: 'Hold', path: `steps.${i}.holdMs`, type: 'number', suffix: 'ms' },
        { label: 'Target selector', path: `steps.${i}.target`, type: 'text', hint: 'CSS selector or null' },
      ],
    });
  });
  return groups;
}

function setupFields() {
  const merged = getScript('SETUP');
  const groups = [
    { group: 'Global Timing', fields: [
      { label: 'Panel open delay', path: 'panelOpenMs', type: 'number', suffix: 'ms' },
      { label: 'Start delay', path: 'startDelayMs', type: 'number', suffix: 'ms' },
      { label: 'Input delay', path: 'inputDelayMs', type: 'number', suffix: 'ms' },
      { label: 'Processing', path: 'processingMs', type: 'number', suffix: 'ms' },
      { label: 'Thinking', path: 'thinkingMs', type: 'number', suffix: 'ms' },
      { label: 'Close animation', path: 'closeMs', type: 'number', suffix: 'ms' },
      { label: 'Typewriter speed', path: 'typewriterSpeed', type: 'number', suffix: 'ms/char' },
    ]},
  ];
  merged.steps.forEach((step, i) => {
    groups.push({
      group: `Step: ${step.id || i + 1}`,
      stepManage: { section: 'SETUP', arrayPath: 'steps', index: i, total: merged.steps.length },
      fields: [
        { label: 'Text', path: `steps.${i}.text`, type: 'text' },
        { label: 'Voice', path: `steps.${i}.voice`, type: 'voice' },
        { label: 'Type', path: `steps.${i}.type`, type: 'setupType' },
        { label: 'Hold', path: `steps.${i}.holdMs`, type: 'number', suffix: 'ms' },
        ...(step.type === 'input' ? [{ label: 'Placeholder', path: `steps.${i}.placeholder`, type: 'text' }] : []),
      ],
    });
  });
  return groups;
}

function returningFields() {
  return [
    { group: 'Void', fields: [
      { label: 'Dot appear', path: 'void.dotAppearMs', type: 'number', suffix: 'ms' },
      { label: 'Advance', path: 'void.advanceMs', type: 'number', suffix: 'ms' },
    ]},
    { group: 'Appear', fields: [
      { label: 'Drone volume', path: 'appear.droneVolume', type: 'number', step: 0.1 },
      { label: 'Drone fade', path: 'appear.droneFadeMs', type: 'number', suffix: 'ms' },
      { label: 'Portal delay', path: 'appear.portalDelayMs', type: 'number', suffix: 'ms' },
      { label: 'Advance', path: 'appear.advanceMs', type: 'number', suffix: 'ms' },
    ]},
    { group: 'Greeting', fields: [
      { label: 'Thinking flash', path: 'greeting.thinkingFlashMs', type: 'number', suffix: 'ms' },
      { label: 'Line delay', path: 'greeting.lineDelayMs', type: 'number', suffix: 'ms' },
      { label: 'Greeting text', path: 'greeting.greetLine.text', type: 'text', hint: 'Use {name} for first name' },
      { label: 'Greeting voice', path: 'greeting.greetLine.voice', type: 'voice' },
      { label: 'After greeting', path: 'greeting.afterGreetMs', type: 'number', suffix: 'ms' },
      { label: 'Waiting text', path: 'greeting.waitingLine.text', type: 'text' },
      { label: 'Waiting voice', path: 'greeting.waitingLine.voice', type: 'voice' },
      { label: 'After waiting', path: 'greeting.afterWaitingMs', type: 'number', suffix: 'ms' },
      { label: 'Text fade', path: 'greeting.textFadeMs', type: 'number', suffix: 'ms' },
    ]},
    { group: 'Briefing (bids due)', fields: [
      { label: 'Thinking', path: 'briefing.thinkingMs', type: 'number', suffix: 'ms' },
      { label: 'Line delay', path: 'briefing.lineDelayMs', type: 'number', suffix: 'ms' },
      { label: 'Main line text', path: 'briefing.mainLine.text', type: 'text', hint: 'Use {n} for bid count' },
      { label: 'Main line voice', path: 'briefing.mainLine.voice', type: 'voice' },
      { label: 'Day line delay', path: 'briefing.dayLineDelayMs', type: 'number', suffix: 'ms' },
      { label: 'Day line voice', path: 'briefing.dayLineVoice', type: 'voice' },
      { label: 'After days', path: 'briefing.afterDaysMs', type: 'number', suffix: 'ms' },
    ]},
    { group: 'Briefing (no bids)', fields: [
      { label: 'Line delay', path: 'briefingNone.lineDelayMs', type: 'number', suffix: 'ms' },
      { label: 'No bids text', path: 'briefingNone.noBidsLine.text', type: 'text' },
      { label: 'No bids voice', path: 'briefingNone.noBidsLine.voice', type: 'voice' },
      { label: 'After no bids', path: 'briefingNone.afterNoBidsMs', type: 'number', suffix: 'ms' },
      { label: 'Clear text', path: 'briefingNone.clearLine.text', type: 'text' },
      { label: 'Clear voice', path: 'briefingNone.clearLine.voice', type: 'voice' },
      { label: 'Affirm flash', path: 'briefingNone.affirmFlashMs', type: 'number', suffix: 'ms' },
      { label: 'After clear', path: 'briefingNone.afterClearMs', type: 'number', suffix: 'ms' },
    ]},
    { group: 'Departure', fields: [
      { label: 'Text fade', path: 'departure.textFadeMs', type: 'number', suffix: 'ms' },
      { label: 'Portal swell delay', path: 'departure.portalSwellDelayMs', type: 'number', suffix: 'ms' },
      { label: 'Portal swell scale', path: 'departure.portalSwellScale', type: 'number', step: 0.01 },
      { label: 'Orb state', path: 'departure.orbState', type: 'orbState' },
      { label: 'Drone volume', path: 'departure.droneVolume', type: 'number', step: 0.1 },
      { label: 'Chord delay', path: 'departure.chordDelayMs', type: 'number', suffix: 'ms' },
      { label: 'Drone fade', path: 'departure.droneFadeMs', type: 'number', suffix: 'ms' },
      { label: 'Fly delay', path: 'departure.flyDelayMs', type: 'number', suffix: 'ms' },
      { label: 'Background', path: 'departure.bgColor', type: 'color' },
      { label: 'Complete', path: 'departure.completeMs', type: 'number', suffix: 'ms' },
    ]},
    { group: 'Misc', fields: [
      { label: 'Typewriter speed', path: 'typewriterSpeed', type: 'number', suffix: 'ms/char' },
    ]},
  ];
}

const FIELD_SCHEMAS = {
  ONBOARDING: onboardingFields,
  TOUR: tourFields,
  SETUP: setupFields,
  RETURNING: returningFields,
};

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function NovaScriptEditor() {
  const C = useTheme();
  const T = C.T;
  const [activeSection, setActiveSection] = useState('ONBOARDING');
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [tick, setTick] = useState(0); // force re-render after override changes
  const fileInputRefs = useRef({});
  const audioAssets = useNovaAudioStore(s => s.audioAssets);
  const slotVolumes = useNovaAudioStore(s => s.volumes);
  const previewAudioRef = useRef(null);
  const [previewSlot, setPreviewSlot] = useState(null); // which slot is currently previewing

  const groups = activeSection !== 'SOUNDS' ? FIELD_SCHEMAS[activeSection]() : [];

  const handleChange = useCallback((section, path, value, fieldType) => {
    let val = value;
    if (fieldType === 'number') {
      val = value === '' ? '' : Number(value);
      if (isNaN(val)) return;
    }
    setOverride(section, path, val);
    setTick(t => t + 1);
  }, []);

  const handleReset = useCallback((section) => {
    resetSection(section);
    setTick(t => t + 1);
  }, []);

  const handleAddStep = useCallback((section, arrayPath) => {
    const template = section === 'TOUR' ? { ...DEFAULT_TOUR_STEP } : { ...DEFAULT_SETUP_STEP, id: `step-${Date.now()}` };
    addStepOverride(section, arrayPath, template);
    setTick(t => t + 1);
  }, []);

  const handleRemoveStep = useCallback((section, arrayPath, index) => {
    removeStepOverride(section, arrayPath, index);
    setExpandedGroup(null);
    setTick(t => t + 1);
  }, []);

  const handleMoveStep = useCallback((section, arrayPath, from, to) => {
    moveStepOverride(section, arrayPath, from, to);
    setExpandedGroup(null);
    setTick(t => t + 1);
  }, []);

  const handleAudioUpload = useCallback(async (slot, file) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      alert('File is over 15 MB. Please use a smaller audio file.');
      return;
    }
    await saveAudioBlob(slot, file);
    setTick(t => t + 1);
  }, []);

  const handleAudioRemove = useCallback(async (slot) => {
    await removeAudioBlob(slot);
    setTick(t => t + 1);
  }, []);

  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setPreviewSlot(null);
  }, []);

  const handleAudioPreview = useCallback(async (slot) => {
    // If this slot is already playing, stop it
    if (previewSlot === slot) { stopPreview(); return; }
    // Stop any other playing preview first
    stopPreview();
    try {
      const dataUrl = await loadAudioBlob(slot);
      if (dataUrl) {
        const audio = new Audio(dataUrl);
        audio.volume = slotVolumes[slot] ?? 1;
        audio.play();
        audio.onended = () => { previewAudioRef.current = null; setPreviewSlot(null); };
        previewAudioRef.current = audio;
        setPreviewSlot(slot);
      }
    } catch (e) {
      console.warn('Preview failed:', e);
    }
  }, [previewSlot, slotVolumes, stopPreview]);

  const handleVolumeChange = useCallback((slot, level) => {
    saveSlotVolume(slot, level);
    // Update live preview volume if this slot is playing
    if (previewAudioRef.current && previewSlot === slot) {
      previewAudioRef.current.volume = level;
    }
  }, [previewSlot]);

  const handleReplay = useCallback((section) => {
    if (section === 'ONBOARDING') {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        altKey: true, shiftKey: true, code: 'KeyN', key: 'N', bubbles: true,
      }));
    } else if (section === 'TOUR') {
      localStorage.removeItem('nova_tour_complete');
      localStorage.removeItem('nova_setup_complete');
      window.location.href = '/';
    } else if (section === 'SETUP') {
      localStorage.removeItem('nova_setup_complete');
      window.location.href = '/';
    } else if (section === 'RETURNING') {
      sessionStorage.removeItem('nova_splash_shown');
      window.location.reload();
    }
  }, []);

  // ── Styles ──
  const tabStyle = (active) => bt(C, {
    padding: '6px 14px',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.3,
    background: active ? (C.accent + '18') : 'transparent',
    color: active ? C.accent : C.textDim,
    border: `1px solid ${active ? C.accent + '40' : C.border}`,
    borderRadius: T.radius.sm,
  });

  const groupHeaderStyle = (expanded) => ({
    padding: '8px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: expanded ? (C.accent + '08') : C.bg2 || 'rgba(255,255,255,0.03)',
    border: `1px solid ${expanded ? C.accent + '30' : C.border}`,
    transition: T.transition.fast,
    fontSize: 11,
    fontWeight: 600,
    color: expanded ? C.text : C.textDim,
    letterSpacing: 0.3,
    marginBottom: expanded ? 0 : 4,
    userSelect: 'none',
  });

  const groupBodyStyle = {
    padding: '10px 12px',
    marginBottom: 4,
    background: C.bg1 || 'rgba(0,0,0,0.15)',
    borderRadius: '0 0 6px 6px',
    border: `1px solid ${C.accent}20`,
    borderTop: 'none',
  };

  const fieldRowStyle = {
    display: 'grid',
    gridTemplateColumns: '140px 1fr',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  };

  const labelStyle = {
    fontSize: 10,
    fontWeight: 600,
    color: C.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    lineHeight: 1.2,
  };

  const hintStyle = {
    fontSize: 9,
    color: C.accent,
    fontStyle: 'italic',
    marginTop: 2,
  };

  const stepBtnStyle = (C) => ({
    background: 'transparent',
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    color: C.textDim,
    cursor: 'pointer',
    fontSize: 10,
    fontWeight: 700,
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    lineHeight: 1,
    transition: '0.15s',
  });

  const overrideDotStyle = {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: C.accent,
    display: 'inline-block',
    marginLeft: 4,
    verticalAlign: 'middle',
  };

  // ── Render a single field ──
  const renderField = (section, field) => {
    const val = getDisplayValue(section, field.path);
    const isOverridden = hasOverride(section, field.path);
    const isFn = isTemplateFn(section, field.path);

    return (
      <div key={field.path} style={fieldRowStyle}>
        <div style={labelStyle}>
          {field.label}
          {isOverridden && <span style={overrideDotStyle} title="Modified" />}
        </div>
        <div>
          {field.type === 'text' && (
            <input
              type="text"
              value={val ?? ''}
              onChange={e => handleChange(section, field.path, e.target.value, 'text')}
              style={inp(C, { padding: '5px 10px', fontSize: 12 })}
            />
          )}

          {field.type === 'number' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                value={val ?? ''}
                step={field.step || (field.suffix === 'ms' ? 100 : 1)}
                min={0}
                onChange={e => handleChange(section, field.path, e.target.value, 'number')}
                style={nInp(C, { padding: '5px 10px', fontSize: 12, width: 100 })}
              />
              {field.suffix && (
                <span style={{ fontSize: 10, color: C.textMuted }}>{field.suffix}</span>
              )}
            </div>
          )}

          {field.type === 'voice' && (
            <select
              value={val || 'onboarding'}
              onChange={e => handleChange(section, field.path, e.target.value, 'text')}
              style={inp(C, { padding: '5px 10px', fontSize: 12, cursor: 'pointer' })}
            >
              {VOICE_OPTIONS.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          )}

          {field.type === 'orbState' && (
            <select
              value={val || 'idle'}
              onChange={e => handleChange(section, field.path, e.target.value, 'text')}
              style={inp(C, { padding: '5px 10px', fontSize: 12, cursor: 'pointer' })}
            >
              {ORB_OPTIONS.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          )}

          {field.type === 'color' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={val || '#000000'}
                onChange={e => handleChange(section, field.path, e.target.value, 'text')}
                style={{ width: 28, height: 28, border: 'none', cursor: 'pointer', background: 'transparent' }}
              />
              <input
                type="text"
                value={val || ''}
                onChange={e => handleChange(section, field.path, e.target.value, 'text')}
                style={inp(C, { padding: '5px 10px', fontSize: 12, fontFamily: "'DM Mono',monospace" })}
              />
            </div>
          )}

          {field.type === 'setupType' && (
            <select
              value={val || 'message'}
              onChange={e => handleChange(section, field.path, e.target.value, 'text')}
              style={inp(C, { padding: '5px 10px', fontSize: 12, cursor: 'pointer' })}
            >
              {SETUP_TYPE_OPTIONS.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          )}

          {field.type === 'readonly' && (
            <span style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic' }}>{String(val)}</span>
          )}

          {(field.hint || isFn) && (
            <div style={hintStyle}>
              {field.hint || (isFn ? 'Use {name} or {n} for dynamic values' : '')}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Sec title="NOVA Script Editor">
      {/* ── Description ── */}
      <div style={{ fontSize: 12, color: C.textDim, marginBottom: 12, lineHeight: 1.5 }}>
        Edit what NOVA says, how long pauses last, and which voice/orb state to use.
        Changes save automatically and take effect on next replay.
      </div>

      {/* ── Section tabs ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {SECTIONS.map(s => (
          <button
            key={s}
            onClick={() => { setActiveSection(s); setExpandedGroup(null); }}
            style={tabStyle(activeSection === s)}
          >
            {SECTION_LABELS[s]}
          </button>
        ))}
      </div>

      {/* ── Collapsible groups ── */}
      {groups.map((g, gi) => {
        const isExpanded = expandedGroup === gi;
        const sm = g.stepManage; // { section, arrayPath, index, total } if step is manageable
        return (
          <div key={`${activeSection}-${gi}-${tick}`}>
            <div
              style={groupHeaderStyle(isExpanded)}
              onClick={() => setExpandedGroup(isExpanded ? null : gi)}
            >
              <span style={{ flex: 1 }}>{g.group}</span>
              {/* Step management buttons */}
              {sm && (
                <span style={{ display: 'flex', gap: 2, marginRight: 8 }} onClick={e => e.stopPropagation()}>
                  {sm.index > 0 && (
                    <button
                      onClick={() => handleMoveStep(sm.section, sm.arrayPath, sm.index, sm.index - 1)}
                      style={stepBtnStyle(C)}
                      title="Move up"
                    >↑</button>
                  )}
                  {sm.index < sm.total - 1 && (
                    <button
                      onClick={() => handleMoveStep(sm.section, sm.arrayPath, sm.index, sm.index + 1)}
                      style={stepBtnStyle(C)}
                      title="Move down"
                    >↓</button>
                  )}
                  {sm.total > 1 && (
                    <button
                      onClick={() => handleRemoveStep(sm.section, sm.arrayPath, sm.index)}
                      style={{ ...stepBtnStyle(C), color: '#ff6b6b' }}
                      title="Remove step"
                    >✕</button>
                  )}
                </span>
              )}
              <span style={{ fontSize: 14, opacity: 0.5, transform: isExpanded ? 'rotate(90deg)' : 'none', transition: '0.15s' }}>
                ▸
              </span>
            </div>
            {isExpanded && (
              <div style={groupBodyStyle}>
                {g.fields.map(f => renderField(activeSection, f))}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Add Step button (for Tour & Setup) ── */}
      {(activeSection === 'TOUR' || activeSection === 'SETUP') && (
        <button
          onClick={() => handleAddStep(activeSection, 'steps')}
          style={bt(C, {
            width: '100%',
            padding: '8px 14px',
            marginTop: 4,
            fontSize: 11,
            fontWeight: 600,
            background: C.accent + '0C',
            color: C.accent,
            border: `1px dashed ${C.accent}40`,
            borderRadius: 6,
          })}
        >
          + Add Step
        </button>
      )}

      {/* ── Sounds tab content ── */}
      {activeSection === 'SOUNDS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>
            Upload your own audio files to replace the default synthesized sounds.
            Supported formats: MP3, WAV, OGG. Max 15 MB per file.
          </div>
          {AUDIO_SLOTS.map(slot => {
            const meta = audioAssets[slot.key];
            const isPlaying = previewSlot === slot.key;
            const vol = slotVolumes[slot.key] ?? 1;
            return (
              <div
                key={slot.key}
                style={{
                  padding: '12px 14px',
                  borderRadius: 6,
                  background: C.bg2 || 'rgba(255,255,255,0.03)',
                  border: `1px solid ${meta ? C.accent + '30' : C.border}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.text, letterSpacing: 0.3 }}>
                      {slot.label}
                      {meta && <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.accent, display: 'inline-block', marginLeft: 6, verticalAlign: 'middle' }} />}
                    </div>
                    <div style={{ fontSize: 9, color: C.textMuted, marginTop: 2 }}>{slot.desc}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {meta && (
                      <>
                        <button
                          onClick={() => handleAudioPreview(slot.key)}
                          style={bt(C, {
                            padding: '4px 10px', fontSize: 10, borderRadius: 4,
                            background: isPlaying ? C.accent + '30' : C.accent + '18',
                            color: C.accent,
                            border: `1px solid ${C.accent}40`,
                          })}
                        >
                          {isPlaying ? '■ Stop' : '▶ Preview'}
                        </button>
                        <button
                          onClick={() => { stopPreview(); handleAudioRemove(slot.key); }}
                          style={bt(C, { padding: '4px 10px', fontSize: 10, background: 'transparent', color: '#ff6b6b', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 4 })}
                        >
                          Remove
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => fileInputRefs.current[slot.key]?.click()}
                      style={bt(C, { padding: '4px 10px', fontSize: 10, background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 4 })}
                    >
                      {meta ? 'Replace' : 'Upload'}
                    </button>
                    <input
                      ref={el => { fileInputRefs.current[slot.key] = el; }}
                      type="file"
                      accept="audio/*"
                      style={{ display: 'none' }}
                      onChange={e => { handleAudioUpload(slot.key, e.target.files?.[0]); e.target.value = ''; }}
                    />
                  </div>
                </div>
                {meta && (
                  <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'DM Mono',monospace", marginTop: 6 }}>
                    {meta.name} ({(meta.size / 1024).toFixed(0)} KB)
                  </div>
                )}
                {!meta && (
                  <div style={{ fontSize: 9, color: C.textMuted, fontStyle: 'italic', marginTop: 6 }}>
                    Using default synthesized sound
                  </div>
                )}
                {/* ── Volume slider ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 9, color: C.textMuted, minWidth: 38 }}>Volume</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={vol}
                    onChange={e => handleVolumeChange(slot.key, parseFloat(e.target.value))}
                    style={{ flex: 1, height: 3, accentColor: C.accent, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 9, color: C.textMuted, minWidth: 28, textAlign: 'right', fontFamily: "'DM Mono',monospace" }}>
                    {Math.round(vol * 100)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Footer: Reset + Replay (not shown for Sounds tab) ── */}
      {activeSection !== 'SOUNDS' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button
            onClick={() => handleReset(activeSection)}
            style={bt(C, {
              padding: '6px 14px',
              fontSize: 11,
              background: 'transparent',
              color: C.textDim,
              border: `1px solid ${C.border}`,
            })}
          >
            Reset {SECTION_LABELS[activeSection]} to Defaults
          </button>
          <button
            onClick={() => handleReplay(activeSection)}
            style={bt(C, {
              padding: '6px 14px',
              fontSize: 11,
              background: C.accent + '18',
              color: C.accent,
              border: `1px solid ${C.accent}40`,
            })}
          >
            ▶ Replay {SECTION_LABELS[activeSection]}
          </button>
        </div>
      )}
    </Sec>
  );
}
