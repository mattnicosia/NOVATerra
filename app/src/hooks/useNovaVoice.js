/**
 * useNovaVoice — Web Speech API hook for NOVA voice input/output.
 *
 * STT: SpeechRecognition (Chrome built-in, free)
 * TTS: SpeechSynthesis (all browsers, free)
 *
 * Upgrade path: AssemblyAI (STT) + ElevenLabs (TTS) for production quality.
 */
import { useRef, useState, useCallback, useEffect } from "react";

export default function useNovaVoice() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const recognitionRef = useRef(null);
  const onResultRef = useRef(null);
  const voicesRef = useRef([]);
  const suppressResultRef = useRef(false);

  const speechRecognition =
    typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const supported = !!speechRecognition;

  // Pre-load voices (they load async in some browsers)
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const loadVoices = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  const startListening = useCallback((onFinalResult) => {
    if (!speechRecognition || typeof window === "undefined") return;
    window.speechSynthesis?.cancel();

    const recognition = new speechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;
    recognition._finalTranscript = ""; // Track final result directly on instance

    onResultRef.current = onFinalResult;
    suppressResultRef.current = false;

    recognition.onstart = () => {
      setListening(true);
      setTranscript("");
      setInterimTranscript("");
    };

    recognition.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          final += t;
        } else {
          interim += t;
        }
      }
      if (interim) setInterimTranscript(interim);
      if (final) {
        setTranscript(final);
        setInterimTranscript("");
        recognition._finalTranscript = final;
      }
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      // Use the instance-stored transcript (avoids stale closure)
      const finalText = recognition._finalTranscript || "";
      if (!suppressResultRef.current && onResultRef.current) onResultRef.current(finalText);
      suppressResultRef.current = false;
    };

    recognition.onerror = (e) => {
      console.warn("[NovaVoice] STT error:", e.error);
      setListening(false);
      recognitionRef.current = null;
      // Still fire callback on error so caller can handle (empty string = no input)
      if (!suppressResultRef.current && e.error !== "aborted" && onResultRef.current) onResultRef.current("");
      suppressResultRef.current = false;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [speechRecognition]);

  const stopListening = useCallback(() => {
    suppressResultRef.current = true;
    recognitionRef.current?.stop();
  }, []);

  const speak = useCallback((text) => {
    const Utterance = typeof window !== "undefined" ? window.SpeechSynthesisUtterance || globalThis.SpeechSynthesisUtterance : null;
    if (typeof window === "undefined" || !window.speechSynthesis || !Utterance) {
      setSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    // Strip markdown and [POINT:...] tags
    const clean = text
      .replace(/\[POINT:[^\]]+\]/g, "")
      .replace(/[*_#`]/g, "")
      .replace(/\n+/g, ". ")
      .trim();
    if (!clean) { setSpeaking(false); return; }

    // Truncate if too long for browser TTS (32KB safety limit)
    const truncated = clean.length > 2000 ? clean.slice(0, 2000) + "..." : clean;

    const utterance = new Utterance(truncated);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    // Prefer a natural-sounding voice (use cached voices)
    const voices = voicesRef.current.length > 0 ? voicesRef.current : window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes("Samantha")) ||
      voices.find(v => v.name.includes("Google") && v.lang === "en-US") ||
      voices.find(v => v.lang === "en-US");
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  useEffect(() => () => {
    suppressResultRef.current = true;
    recognitionRef.current?.stop?.();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel?.();
  }, []);

  return {
    supported,
    listening,
    speaking,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
}
