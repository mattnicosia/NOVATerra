import React, { useRef, useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useUiStore } from "@/stores/uiStore";
import { useDashboardData } from "@/hooks/useDashboardData";
import NovaSceneLazy from "@/components/nova/NovaSceneLazy";

/* ────────────────────────────────────────────────────────
   NovaOrbWidget — orb + "Ask Nova" input
   ──────────────────────────────────────────────────────── */

const nn = v => (typeof v === "number" && !isNaN(v) ? v : 0);

export default function NovaOrbWidget() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = a => (dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
  const orbRef = useRef(null);
  const setAiChatOpen = useUiStore(s => s.setAiChatOpen);
  const { activeProject } = useDashboardData();

  const [askValue, setAskValue] = useState("");
  const [askFocused, setAskFocused] = useState(false);

  const value = activeProject ? nn(activeProject.value) : 0;

  useEffect(() => {
    if (orbRef.current && value > 0) {
      orbRef.current.setValueTarget(value);
    }
  }, [value]);

  function handleOrbClick() {
    orbRef.current?.exhale();
  }

  function handleAskSubmit(e) {
    e.preventDefault();
    if (!askValue.trim()) return;
    orbRef.current?.pulse();
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
      <NovaSceneLazy
        ref={orbRef}
        width={100}
        height={100}
        size={0.85}
        intensity={0.7}
        artifact
        awaken={0.8}
        onClick={handleOrbClick}
      />

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
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
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
