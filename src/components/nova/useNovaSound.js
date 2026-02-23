// useNovaSound — Web Audio API sound layer for NOVA
// Drone (3 oscillators + breathing), text pings, activation chord, drone ducking for voice.
// Zero external files. All synthesized.
import { useRef, useCallback, useEffect } from 'react';

// ── AudioContext singleton (browser requires user interaction first) ───
let _audioCtx = null;
let _ctxReady = false;

function getAudioCtx() {
  if (_audioCtx) return _audioCtx;
  _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

// One-time unlock on first user interaction
function ensureUnlocked() {
  if (_ctxReady) return;
  const unlock = () => {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    _ctxReady = true;
    document.removeEventListener('click', unlock);
    document.removeEventListener('keydown', unlock);
    document.removeEventListener('touchstart', unlock);
  };
  document.addEventListener('click', unlock, { once: false });
  document.addEventListener('keydown', unlock, { once: false });
  document.addEventListener('touchstart', unlock, { once: false });
}

// ── Drone frequency/gain configs per state ───────────────────────────
const DRONE_STATES = {
  idle:     { freqs: [85, 170, 128], gains: [0.12, 0.05, 0.03] },
  thinking: { freqs: [90, 180, 135], gains: [0.12, 0.08, 0.03] },
  alert:    { freqs: [80, 170, 128], gains: [0.12, 0.05, 0.03], extra: { freq: 220, gain: 0.04 } },
  affirm:   { freqs: [88, 176, 132], gains: [0.16, 0.07, 0.03] },
};

// ── Text ping frequencies (cycle through) ────────────────────────────
const PING_FREQS = [1050, 1120, 990, 1080];

export default function useNovaSound() {
  const masterGainRef = useRef(null);
  const droneOscsRef = useRef([]);
  const droneGainsRef = useRef([]);
  const extraOscRef = useRef(null);
  const extraGainRef = useRef(null);
  const breathIntervalRef = useRef(null);
  const pingIndexRef = useRef(0);
  const volumeRef = useRef(1.0);
  const duckRef = useRef(false);
  const droneActiveRef = useRef(false);
  const targetGainsRef = useRef([0.12, 0.05, 0.03]);

  // Ensure AudioContext unlock listener is registered
  useEffect(() => {
    ensureUnlocked();
  }, []);

  // ── Start drone ────────────────────────────────────────────────────
  const startDrone = useCallback((fadeInMs = 2000) => {
    if (droneActiveRef.current) return;
    if (document.hidden) return;
    droneActiveRef.current = true;

    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    // Master gain
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.connect(ctx.destination);
    masterGainRef.current = master;

    const state = DRONE_STATES.idle;
    const oscs = [];
    const gains = [];

    state.freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(state.gains[i], ctx.currentTime + fadeInMs / 1000);

      osc.connect(gain);
      gain.connect(master);
      osc.start();
      oscs.push(osc);
      gains.push(gain);
    });

    droneOscsRef.current = oscs;
    droneGainsRef.current = gains;
    targetGainsRef.current = [...state.gains];

    // Ramp master up
    master.gain.linearRampToValueAtTime(volumeRef.current, ctx.currentTime + fadeInMs / 1000);

    // Breathing modulation — 4s cycle, 0.85x to 1.0x of target volume
    breathIntervalRef.current = setInterval(() => {
      if (!masterGainRef.current || document.hidden) return;
      const now = ctx.currentTime;
      const breathCycle = 4; // seconds
      const t = (now % breathCycle) / breathCycle;
      const breathMult = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
      const duckMult = duckRef.current ? 0.6 : 1.0;
      masterGainRef.current.gain.setTargetAtTime(
        volumeRef.current * breathMult * duckMult,
        now, 0.1
      );
    }, 50);
  }, []);

  // ── Stop drone ─────────────────────────────────────────────────────
  const stopDrone = useCallback((fadeOutMs = 1200) => {
    if (!droneActiveRef.current) return;
    droneActiveRef.current = false;

    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const fadeEnd = now + fadeOutMs / 1000;

    // Fade out each gain + master
    droneGainsRef.current.forEach(g => {
      g.gain.linearRampToValueAtTime(0, fadeEnd);
    });
    if (extraGainRef.current) {
      extraGainRef.current.gain.linearRampToValueAtTime(0, fadeEnd);
    }
    if (masterGainRef.current) {
      masterGainRef.current.gain.linearRampToValueAtTime(0, fadeEnd);
    }

    // Stop oscillators after fade
    setTimeout(() => {
      droneOscsRef.current.forEach(o => { try { o.stop(); } catch (e) {} });
      droneOscsRef.current = [];
      droneGainsRef.current = [];
      if (extraOscRef.current) { try { extraOscRef.current.stop(); } catch (e) {} }
      extraOscRef.current = null;
      extraGainRef.current = null;
      if (masterGainRef.current) {
        try { masterGainRef.current.disconnect(); } catch (e) {}
        masterGainRef.current = null;
      }
    }, fadeOutMs + 100);

    // Stop breathing
    if (breathIntervalRef.current) {
      clearInterval(breathIntervalRef.current);
      breathIntervalRef.current = null;
    }
  }, []);

  // ── Set drone state (frequency + gain modulation) ──────────────────
  const setDroneState = useCallback((state) => {
    if (!droneActiveRef.current) return;
    const config = DRONE_STATES[state] || DRONE_STATES.idle;
    const ctx = getAudioCtx();
    const rampTime = ctx.currentTime + 0.4; // 400ms ramp

    droneOscsRef.current.forEach((osc, i) => {
      if (config.freqs[i] !== undefined) {
        osc.frequency.linearRampToValueAtTime(config.freqs[i], rampTime);
      }
    });
    droneGainsRef.current.forEach((gain, i) => {
      if (config.gains[i] !== undefined) {
        gain.gain.linearRampToValueAtTime(config.gains[i], rampTime);
        targetGainsRef.current[i] = config.gains[i];
      }
    });

    // Extra oscillator for alert state
    if (config.extra) {
      if (!extraOscRef.current) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = config.extra.freq;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.gain.linearRampToValueAtTime(config.extra.gain, rampTime);
        osc.connect(gain);
        gain.connect(masterGainRef.current);
        osc.start();
        extraOscRef.current = osc;
        extraGainRef.current = gain;
      }
    } else if (extraOscRef.current) {
      // Fade out extra osc
      extraGainRef.current.gain.linearRampToValueAtTime(0, rampTime);
      const oldOsc = extraOscRef.current;
      setTimeout(() => { try { oldOsc.stop(); } catch (e) {} }, 500);
      extraOscRef.current = null;
      extraGainRef.current = null;
    }
  }, []);

  // ── Text ping — crystalline tone ───────────────────────────────────
  const playTextPing = useCallback(() => {
    if (document.hidden) return;
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') return;

    const freq = PING_FREQS[pingIndexRef.current % PING_FREQS.length];
    pingIndexRef.current++;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06 * volumeRef.current, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  }, []);

  // ── Activation chord — rising triad ────────────────────────────────
  const playActivation = useCallback(() => {
    if (document.hidden) return;
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') return;
    const now = ctx.currentTime;

    const voices = [
      { freq: 220, peak: 0.10 },
      { freq: 330, peak: 0.07 },
      { freq: 440, peak: 0.05 },
    ];

    voices.forEach(({ freq, peak }) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      // 200ms attack
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak * volumeRef.current, now + 0.2);
      // 800ms sustain (implicit — hold at peak)
      // 1500ms exponential decay
      gain.gain.setValueAtTime(peak * volumeRef.current, now + 1.0);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(now + 2.6);
    });
  }, []);

  // ── Volume control ─────────────────────────────────────────────────
  const setVolume = useCallback((level) => {
    volumeRef.current = Math.max(0, Math.min(1, level));
  }, []);

  // ── Drone duck (for voice) ─────────────────────────────────────────
  const setDroneDuck = useCallback((ducked) => {
    duckRef.current = ducked;
    if (!masterGainRef.current) return;
    const ctx = getAudioCtx();
    const rampTime = ducked ? 0.2 : 0.4; // duck faster, release slower
    const target = volumeRef.current * (ducked ? 0.6 : 1.0);
    masterGainRef.current.gain.setTargetAtTime(target, ctx.currentTime, rampTime);
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      droneOscsRef.current.forEach(o => { try { o.stop(); } catch (e) {} });
      if (extraOscRef.current) { try { extraOscRef.current.stop(); } catch (e) {} }
      if (masterGainRef.current) { try { masterGainRef.current.disconnect(); } catch (e) {} }
      if (breathIntervalRef.current) clearInterval(breathIntervalRef.current);
    };
  }, []);

  return {
    startDrone,
    stopDrone,
    setDroneState,
    playTextPing,
    playActivation,
    setVolume,
    setDroneDuck,
  };
}
