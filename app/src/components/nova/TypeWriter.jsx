// TypeWriter — Character-by-character text reveal with blinking cursor
// Used in NOVA onboarding and sign-in splash sequences
// Supports optional voice: when voice + voiceOptions provided, Nova speaks the line.
// onComplete fires when BOTH typing and voice are done (whichever is last).
import { useState, useEffect, useRef, useCallback } from 'react';

const PUNCTUATION = ['.', ',', '\u2014']; // period, comma, em-dash

export default function TypeWriter({ text, speed = 40, delay = 0, onComplete, onStart, voice, voiceOptions, style }) {
  const [count, setCount] = useState(0);
  const [showCursor, setShowCursor] = useState(true);
  const [cursorOn, setCursorOn] = useState(true);
  const startedRef = useRef(false);
  const completedRef = useRef(false);
  const typingDoneRef = useRef(false);
  const voiceDoneRef = useRef(false);
  const delayTimerRef = useRef(null);
  const typeTimerRef = useRef(null);
  const cursorHideRef = useRef(null);
  const cursorBlinkRef = useRef(null);

  // Check if both typing and voice (if applicable) are complete
  const checkAllDone = useCallback(() => {
    if (completedRef.current) return;
    const voiceActive = !!voice;
    if (typingDoneRef.current && (!voiceActive || voiceDoneRef.current)) {
      completedRef.current = true;
      if (onComplete) onComplete();
      cursorHideRef.current = setTimeout(() => setShowCursor(false), 1000);
    }
  }, [voice, onComplete]);

  // Handle initial delay
  useEffect(() => {
    if (delay > 0) {
      delayTimerRef.current = setTimeout(() => {
        startedRef.current = true;
        setCount(1); // kick off typing
      }, delay);
    } else {
      startedRef.current = true;
      setCount(1);
    }
    return () => clearTimeout(delayTimerRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire voice.speak on first character + onStart callback
  const firedStartRef = useRef(false);
  useEffect(() => {
    if (count === 1 && !firedStartRef.current) {
      firedStartRef.current = true;
      // Fire onStart (text ping trigger)
      if (onStart) onStart();
      // Fire voice.speak simultaneously
      if (voice) {
        // If no voice, mark voice as done immediately
        voiceDoneRef.current = false;
        voice.speak(text, {
          ...voiceOptions,
          onStart: voiceOptions?.onVoiceStart,
          onEnd: () => {
            voiceDoneRef.current = true;
            if (voiceOptions?.onVoiceEnd) voiceOptions.onVoiceEnd();
            checkAllDone();
          },
          onError: () => {
            // Voice failed — treat as done so typing still completes
            voiceDoneRef.current = true;
            checkAllDone();
          },
        });
      } else {
        voiceDoneRef.current = true;
      }
    }
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps

  // Typing loop
  useEffect(() => {
    if (!startedRef.current || count === 0) return;
    if (count >= text.length) {
      // Typing complete
      typingDoneRef.current = true;
      checkAllDone();
      return;
    }

    // Check if the character just typed is punctuation → extra pause
    const justTyped = text[count - 1];
    const extra = PUNCTUATION.includes(justTyped) ? 60 : 0;

    typeTimerRef.current = setTimeout(() => {
      setCount(c => c + 1);
    }, speed + extra);

    return () => clearTimeout(typeTimerRef.current);
  }, [count, text, speed, checkAllDone]);

  // Cursor blink
  useEffect(() => {
    if (!showCursor) {
      clearInterval(cursorBlinkRef.current);
      return;
    }
    cursorBlinkRef.current = setInterval(() => {
      setCursorOn(v => !v);
    }, 500);
    return () => clearInterval(cursorBlinkRef.current);
  }, [showCursor]);

  // Master cleanup
  useEffect(() => {
    return () => {
      clearTimeout(delayTimerRef.current);
      clearTimeout(typeTimerRef.current);
      clearTimeout(cursorHideRef.current);
      clearInterval(cursorBlinkRef.current);
    };
  }, []);

  return (
    <span style={{
      fontSize: 18,
      fontWeight: 300,
      letterSpacing: 1,
      color: 'rgba(220,200,255,0.75)',
      fontFamily: "'DM Sans', sans-serif",
      lineHeight: 1.6,
      ...style,
    }}>
      {text.slice(0, count)}
      {showCursor && (
        <span style={{
          display: 'inline-block',
          width: 1,
          height: '1.1em',
          background: 'rgba(160,100,255,0.5)',
          marginLeft: 2,
          verticalAlign: 'text-bottom',
          opacity: cursorOn ? 1 : 0,
          transition: 'opacity 100ms',
        }} />
      )}
    </span>
  );
}
