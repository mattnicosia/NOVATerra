import React, { useRef, useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useUiStore } from "@/stores/uiStore";

/* ────────────────────────────────────────────────────────
   NovaOrbWidget — video orb + "Ask Nova" input
   ──────────────────────────────────────────────────────── */

export default function NovaOrbWidget() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = a => (dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
  const setAiChatOpen = useUiStore(s => s.setAiChatOpen);

  const [askValue, setAskValue] = useState("");
  const [askFocused, setAskFocused] = useState(false);

  function handleAskSubmit(e) {
    e.preventDefault();
    if (!askValue.trim()) return;
    setAiChatOpen(true);
    setAskValue("");
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 100,
          height: 100,
          borderRadius: "50%",
          overflow: "hidden",
          flexShrink: 0,
          cursor: "pointer",
        }}
        onClick={() => setAiChatOpen(true)}
      >
        <video
          src="/nova-orb.mp4"
          poster="/nova-orb-poster.png"
          autoPlay
          loop
          muted
          playsInline
          style={{
            width: "140%",
            height: "140%",
            objectFit: "cover",
            display: "block",
            marginLeft: "-20%",
            marginTop: "-20%",
          }}
        />
      </div>

      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 400,
            letterSpacing: "0.09em",
            color: C.textMuted,
            fontFamily: T.font.display,
          }}
        >
          NOVA online
        </div>

        <form onSubmit={handleAskSubmit} style={{ marginTop: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: 100,
              width: 240,
              border: `1px solid ${askFocused ? `${C.accent}66` : C.border}`,
              background: askFocused ? `${C.accent}0D` : ov(0.025),
              backdropFilter: C.noGlass ? "none" : "blur(20px)",
              WebkitBackdropFilter: C.noGlass ? "none" : "blur(20px)",
              boxShadow: askFocused ? `0 0 20px ${C.accent}26, 0 0 40px ${C.accent}0F` : "none",
              transition: "border-color 0.3s, background 0.3s, box-shadow 0.3s",
            }}
          >
            <input
              value={askValue}
              onChange={e => setAskValue(e.target.value)}
              onFocus={() => setAskFocused(true)}
              onBlur={() => setAskFocused(false)}
              placeholder="Ask Nova anything..."
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontFamily: T.font.display,
                fontSize: 10.5,
                fontWeight: 400,
                color: C.text,
                caretColor: C.accent,
              }}
            />
            <button
              type="submit"
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: "none",
                background: askValue.trim() ? `${C.accent}59` : ov(0.06),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
                transition: "background 0.25s",
                padding: 0,
              }}
            >
              <svg width={9} height={9} viewBox="0 0 12 12" fill="none" style={{ display: "block" }}>
                <path d="M2 10L10 6L2 2v3.2L7 6L2 6.8V10z" fill={askValue.trim() ? C.accent : C.textDim} />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
