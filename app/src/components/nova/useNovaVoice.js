// useNovaVoice — ElevenLabs TTS client hook for NOVA
// Calls /api/nova-voice server proxy. Caches audio blobs in-memory.
// Pre-warms lines in parallel. Graceful fallback if voice unavailable.
// Supports per-preset `speed` (playbackRate) — see voicePresets.js
import { useRef, useCallback, useEffect } from 'react';
import { NOVA_DEFAULT_SPEED } from './voicePresets';

export default function useNovaVoice() {
  const audioCache = useRef(new Map());   // text+opts key → objectURL
  const currentAudio = useRef(null);
  const isSpeakingRef = useRef(false);
  const isLoadingRef = useRef(false);
  const isAvailableRef = useRef(true);    // goes false on persistent failures
  const failCountRef = useRef(0);
  const mountedRef = useRef(true);

  // ── Cache key: text + stability + style → unique key ───────────────
  const cacheKey = (text, opts) =>
    `${text}|${opts?.stability ?? ''}|${opts?.style ?? ''}`;

  // ── Fetch audio from API ───────────────────────────────────────────
  const fetchAudio = useCallback(async (text, opts) => {
    const key = cacheKey(text, opts);
    if (audioCache.current.has(key)) return audioCache.current.get(key);

    try {
      const res = await fetch('/api/nova-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          stability: opts?.stability,
          similarity_boost: opts?.similarity_boost,
          style: opts?.style,
        }),
      });

      if (!res.ok) {
        failCountRef.current++;
        if (failCountRef.current >= 3) isAvailableRef.current = false;
        return null;
      }

      // Success — reset fail counter
      failCountRef.current = 0;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      if (mountedRef.current) {
        audioCache.current.set(key, url);
      } else {
        URL.revokeObjectURL(url);
      }

      return url;
    } catch (err) {
      // Silent failure — voice is an enhancement layer
      failCountRef.current++;
      if (failCountRef.current >= 3) isAvailableRef.current = false;
      return null;
    }
  }, []);

  // ── speak(text, options) ───────────────────────────────────────────
  const speak = useCallback(async (text, opts) => {
    if (!isAvailableRef.current || !text) {
      if (opts?.onError) opts.onError();
      return;
    }

    // Stop any currently playing audio
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current = null;
    }

    isLoadingRef.current = true;

    const url = await fetchAudio(text, opts);

    if (!url || !mountedRef.current) {
      isLoadingRef.current = false;
      if (opts?.onError) opts.onError();
      return;
    }

    isLoadingRef.current = false;

    const audio = new Audio(url);
    audio.playbackRate = opts?.speed ?? NOVA_DEFAULT_SPEED;
    currentAudio.current = audio;

    audio.addEventListener('play', () => {
      isSpeakingRef.current = true;
      if (opts?.onStart) opts.onStart();
    }, { once: true });

    audio.addEventListener('ended', () => {
      isSpeakingRef.current = false;
      currentAudio.current = null;
      if (opts?.onEnd) opts.onEnd();
    }, { once: true });

    audio.addEventListener('error', () => {
      isSpeakingRef.current = false;
      currentAudio.current = null;
      if (opts?.onError) opts.onError();
    }, { once: true });

    try {
      await audio.play();
    } catch (err) {
      // Autoplay blocked or other error — silent fallback
      isSpeakingRef.current = false;
      currentAudio.current = null;
      if (opts?.onError) opts.onError();
    }
  }, [fetchAudio]);

  // ── stop() ─────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current = null;
    }
    isSpeakingRef.current = false;
  }, []);

  // ── preWarm(texts, opts) ───────────────────────────────────────────
  // Fire off API calls in parallel. Populate cache for instant playback later.
  const preWarm = useCallback((texts, opts) => {
    if (!isAvailableRef.current) return;
    texts.forEach(text => {
      if (!audioCache.current.has(cacheKey(text, opts))) {
        fetchAudio(text, opts); // fire and forget — do NOT await
      }
    });
  }, [fetchAudio]);

  // ── Cleanup on unmount ─────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Stop playing audio
      if (currentAudio.current) {
        currentAudio.current.pause();
        currentAudio.current = null;
      }
      // Revoke all cached object URLs
      audioCache.current.forEach(url => URL.revokeObjectURL(url));
      audioCache.current.clear();
    };
  }, []);

  return {
    speak,
    stop,
    preWarm,
    get isSpeaking() { return isSpeakingRef.current; },
    get isLoading() { return isLoadingRef.current; },
    get isAvailable() { return isAvailableRef.current; },
  };
}
