// NovaFloatingOrb — Floating NOVA portal button (replaces AIFab)
// Shows NovaPortal at 'floating' size with glow ring
// State reflects NOVA's current activity
import { useState } from 'react';
import NovaPortal from './NovaPortal';

export default function NovaFloatingOrb({ state = "idle", onClick, title }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title || "NOVA — AI Assistant"}
      style={{
        position: "relative",
        width: 56,
        height: 56,
        borderRadius: "50%",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: hovered ? "scale(1.08)" : "scale(1)",
        transition: "transform 0.2s ease",
      }}
    >
      {/* Glow ring */}
      <div style={{
        position: "absolute",
        top: -6, left: -6, right: -6, bottom: -6,
        borderRadius: "50%",
        boxShadow: state === "alert"
          ? "0 0 16px rgba(210,160,60,0.4), 0 0 32px rgba(180,120,30,0.2)"
          : state === "thinking"
          ? "0 0 20px rgba(160,100,255,0.5), 0 0 40px rgba(120,60,220,0.25)"
          : "0 0 16px rgba(160,100,255,0.4), 0 0 32px rgba(100,50,220,0.15)",
        animation: "novaGlowPulse 4s ease-in-out infinite",
        pointerEvents: "none",
      }} />
      <NovaPortal size="floating" state={state} />
      <style>{`
        @keyframes novaGlowPulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
      `}</style>
    </button>
  );
}
