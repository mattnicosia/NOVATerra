/**
 * NovaOrb — AI companion orb with voice, canvas vision, and pointing.
 *
 * Clicky-inspired: sits near cursor, sees the canvas, responds with voice,
 * and can point at things via [POINT:x,y:label] tags rendered as canvas highlights.
 *
 * Activation: click orb or press 'N' (when not typing).
 * Flow: listen → capture canvas + transcript → Claude → response + highlights + TTS.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import useNovaVoice from "@/hooks/useNovaVoice";
import {
  callAnthropicStream,
  optimizeImageForAI,
  imageBlock,
} from "@/utils/ai";

// Parse [POINT:x,y:label] tags from NOVA response
function parsePointTags(text) {
  const points = [];
  const regex = /\[POINT:(\d+(?:\.\d+)?),(\d+(?:\.\d+)?):([^\]:]+?)(?::(\d+))?\]/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const xPct = parseFloat(m[1]);
    const yPct = parseFloat(m[2]);
    // Validate coordinates are in range
    if (xPct >= 0 && xPct <= 100 && yPct >= 0 && yPct <= 100) {
      points.push({ xPct, yPct, label: m[3], screen: m[4] ? parseInt(m[4]) : 0 });
    }
  }
  return points;
}

// Capture the drawing canvas + image as a combined screenshot
function captureCanvasImage(canvasRef, drawingImgRef) {
  const canvas = canvasRef?.current;
  const img = drawingImgRef?.current;
  if (!canvas && !img) return null;

  const w = canvas?.width || img?.naturalWidth || 800;
  const h = canvas?.height || img?.naturalHeight || 600;
  const offscreen = document.createElement("canvas");
  offscreen.width = w;
  offscreen.height = h;
  const ctx = offscreen.getContext("2d");

  // Draw the image first
  if (img && img.complete) {
    try { ctx.drawImage(img, 0, 0, w, h); } catch { /* cross-origin */ }
  }
  // Overlay the measurement canvas
  if (canvas) {
    try { ctx.drawImage(canvas, 0, 0); } catch { /* tainted */ }
  }
  return offscreen.toDataURL("image/jpeg", 0.75);
}

const SYSTEM_PROMPT = `You are NOVA, an expert construction estimating AI assistant embedded in a takeoff tool. You can SEE the construction drawing the user is looking at.

CAPABILITIES:
- You see the drawing image with all measurement overlays
- You know the current estimate items, quantities, and costs
- You can point at specific locations on the drawing using [POINT:xPct,yPct:label] tags (percentages 0-100 of image dimensions)

RULES:
- Be concise — 2-3 sentences max for voice responses
- When pointing at something, embed [POINT:x,y:label] in your response text
- Reference specific drawing elements you can see (walls, doors, dimensions, notes)
- If asked about quantities or measurements, reference what's visible on the drawing
- You are speaking to a professional estimator — use industry terminology
- Answer as a knowledgeable colleague, not a formal assistant`;

export default function NovaOrb({ canvasRef, drawingImgRef }) {
  const C = useTheme();
  const voice = useNovaVoice();
  const [mode, setMode] = useState("idle"); // idle, listening, thinking, speaking
  const [response, setResponse] = useState("");
  const [points, setPoints] = useState([]); // [POINT] highlights
  const [error, setError] = useState(null);
  const responseRef = useRef("");
  const abortRef = useRef(null);

  // Build context from current estimate state
  const buildContext = useCallback(() => {
    const s = useDrawingPipelineStore.getState();
    const takeoffs = s.takeoffs || [];
    const selectedDrawingId = s.selectedDrawingId;
    const drawing = s.drawings?.find(d => d.id === selectedDrawingId);

    let ctx = `Current drawing: ${drawing?.label || drawing?.sheetNumber || "unknown"}\n`;
    ctx += `Sheet: ${drawing?.sheetNumber || "?"}\n`;
    ctx += `Takeoff items on this sheet:\n`;

    const sheetItems = takeoffs.filter(t =>
      (t.measurements || []).some(m => m.sheetId === selectedDrawingId)
    );
    sheetItems.forEach(t => {
      const qty = (t.measurements || []).filter(m => m.sheetId === selectedDrawingId).length;
      ctx += `- ${t.description} (${t.unit || "EA"}, ${qty} measurements)\n`;
    });

    if (sheetItems.length === 0) ctx += "(no measurements on this sheet yet)\n";
    return ctx;
  }, []);

  const handleActivate = useCallback(() => {
    if (mode === "listening") {
      voice.stopListening();
      setMode("idle");
      return;
    }
    if (mode === "thinking" || mode === "speaking") {
      abortRef.current?.abort();
      voice.stopSpeaking();
      setMode("idle");
      setResponse("");
      setPoints([]);
      return;
    }

    setError(null);
    setResponse("");
    setPoints([]);
    setMode("listening");

    voice.startListening(async (transcript) => {
      if (!transcript?.trim()) {
        setMode("idle");
        return;
      }

      setMode("thinking");
      responseRef.current = "";

      try {
        // Capture canvas screenshot
        const screenshot = captureCanvasImage(canvasRef, drawingImgRef);
        const context = buildContext();

        // Prepare image block (may fail for cross-origin or corrupted images)
        let imgContentBlock = null;
        if (screenshot) {
          try {
            const optimized = await optimizeImageForAI(screenshot, 1200);
            if (optimized?.base64) imgContentBlock = imageBlock(optimized.base64);
          } catch { /* skip image if optimization fails */ }
        }

        const messages = [
          {
            role: "user",
            content: [
              ...(imgContentBlock ? [imgContentBlock] : []),
              { type: "text", text: `[CONTEXT]\n${context}\n\n[QUESTION]\n${transcript}` },
            ],
          },
        ];

        const controller = new AbortController();
        abortRef.current = controller;

        await callAnthropicStream({
          system: SYSTEM_PROMPT,
          max_tokens: 500,
          messages,
          signal: controller.signal,
          onText: (chunk) => {
            responseRef.current = chunk;
            setResponse(chunk);
          },
        });

        // Parse points from response
        const parsed = parsePointTags(responseRef.current);
        setPoints(parsed);

        // Speak the response
        setMode("speaking");
        voice.speak(responseRef.current);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error("[NovaOrb] Error:", err);
        setError(err.message);
        setMode("idle");
      }
    });
  }, [mode, voice, canvasRef, drawingImgRef, buildContext]);

  // Reset when speech ends — auto-dismiss response after delay
  useEffect(() => {
    if (!voice.speaking && (mode === "speaking" || (mode === "thinking" && responseRef.current))) {
      // Transition to a visible-but-done state, then dismiss
      if (mode === "speaking") {
        const t = setTimeout(() => setMode("idle"), 5000);
        return () => clearTimeout(t);
      }
    }
  }, [mode, voice.speaking]);

  // Store points in Zustand for canvas rendering
  useEffect(() => {
    useDrawingPipelineStore.getState().setTkNovaHighlights(points);
  }, [points]);

  // Clear stale highlights when the orb unmounts.
  useEffect(() => () => {
    useDrawingPipelineStore.getState().setTkNovaHighlights([]);
  }, []);

  // Keyboard shortcut: 'n' to toggle
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        e.target?.isContentEditable ||
        document.activeElement?.isContentEditable;
      if (isTyping) return;
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        handleActivate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleActivate]);

  if (!voice.supported) return null;

  const orbSize = mode === "idle" ? 36 : 44;
  const orbColor = mode === "listening" ? "#EF4444"
    : mode === "thinking" ? C.accent
    : mode === "speaking" ? "#10B981"
    : `${C.accent}80`;

  // Clean display text (strip POINT tags)
  const displayText = response.replace(/\[POINT:[^\]]+\]/g, "").trim();

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999 }}>
      {/* Response bubble */}
      {displayText && mode !== "idle" && (
        <div
          style={{
            position: "absolute",
            bottom: orbSize + 12,
            right: 0,
            width: 320,
            maxHeight: 200,
            overflow: "auto",
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: "10px 14px",
            fontSize: 12,
            lineHeight: 1.5,
            color: C.text,
            boxShadow: `0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px ${orbColor}20`,
          }}
        >
          <div style={{ fontSize: 9, fontWeight: 600, color: orbColor, marginBottom: 4, letterSpacing: "0.5px" }}>
            NOVA
          </div>
          {displayText}
        </div>
      )}

      {/* Transcript preview */}
      {mode === "listening" && (voice.interimTranscript || voice.transcript) && (
        <div
          style={{
            position: "absolute",
            bottom: orbSize + 12,
            right: 0,
            width: 280,
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 11,
            color: C.textDim,
            fontStyle: "italic",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          }}
        >
          {voice.interimTranscript || voice.transcript || "Listening..."}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          position: "absolute", bottom: orbSize + 12, right: 0, width: 250,
          background: "#7f1d1d", border: "1px solid #dc2626", borderRadius: 8,
          padding: "6px 10px", fontSize: 10, color: "#fca5a5",
        }}>
          {error}
        </div>
      )}

      {/* Orb button */}
      <button
        onClick={handleActivate}
        title={mode === "idle" ? "Ask NOVA (N)" : mode === "listening" ? "Stop listening" : "Stop"}
        style={{
          width: orbSize,
          height: orbSize,
          borderRadius: "50%",
          border: "none",
          background: `radial-gradient(circle at 35% 35%, ${orbColor}, ${orbColor}80)`,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 0 ${mode === "idle" ? 12 : 24}px ${orbColor}60, 0 4px 12px rgba(0,0,0,0.3)`,
          transition: "all 0.3s ease",
          animation: mode === "listening" ? "novaPulse 1.5s ease-in-out infinite" : "none",
          position: "relative",
        }}
      >
        {/* Mic icon (listening) */}
        {mode === "listening" && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
        {/* Thinking spinner */}
        {mode === "thinking" && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"
            style={{ animation: "spin 1s linear infinite" }}>
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
        )}
        {/* Speaker icon (speaking) */}
        {mode === "speaking" && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 010 14.14" />
            <path d="M15.54 8.46a5 5 0 010 7.07" />
          </svg>
        )}
        {/* NOVA diamond (idle) */}
        {mode === "idle" && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" opacity="0.9">
            <path d="M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9Z" />
          </svg>
        )}
      </button>

      <style>{`
        @keyframes novaPulse {
          0%, 100% { box-shadow: 0 0 12px ${orbColor}60, 0 4px 12px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 32px ${orbColor}90, 0 4px 12px rgba(0,0,0,0.3); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
