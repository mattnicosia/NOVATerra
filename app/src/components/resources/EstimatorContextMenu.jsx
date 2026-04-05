import React, { useRef, useEffect, useState } from "react";

export default function EstimatorContextMenu({ pos, name, color, projectCount, C, _T, onViewScorecard, onRemove, onClose }) {
  const menuRef = useRef(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const handler = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  useEffect(() => {
    const handler = e => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const x = Math.min(pos.x, window.innerWidth - 200);
  const y = Math.min(pos.y, window.innerHeight - 180);

  const itemStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 12px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 500,
    color: C.text,
    cursor: "pointer",
    transition: "background 80ms",
    border: "none",
    background: "transparent",
    width: "100%",
    textAlign: "left",
  };

  return (
    <div
      ref={menuRef}
      onClick={e => e.stopPropagation()}
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 1000,
        background: C.isDark
          ? "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))"
          : "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.90))",
        backdropFilter: "blur(40px) saturate(1.8)",
        WebkitBackdropFilter: "blur(40px) saturate(1.8)",
        border: `1px solid ${C.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)"}`,
        borderRadius: 10,
        padding: "6px 4px",
        minWidth: 180,
        boxShadow: C.isDark
          ? "0 12px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)"
          : "0 8px 30px rgba(0,0,0,0.15)",
      }}
    >
      <div
        style={{
          padding: "4px 12px 6px",
          fontSize: 9,
          fontWeight: 700,
          color: C.textDim,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          borderBottom: `1px solid ${C.border}20`,
          marginBottom: 2,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: color,
          }}
        />
        {name}
      </div>
      {confirming ? (
        <div style={{ padding: "8px 12px" }}>
          <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6 }}>
            Remove <strong>{name}</strong>?
            {projectCount > 0 && (
              <>
                {" "}
                {projectCount} project{projectCount !== 1 ? "s" : ""} will become unassigned.
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={onRemove}
              style={{
                ...itemStyle,
                width: "auto",
                padding: "4px 10px",
                background: "#FF3B3015",
                color: "#FF3B30",
                fontWeight: 600,
                borderRadius: 4,
              }}
            >
              Remove
            </button>
            <button
              onClick={() => setConfirming(false)}
              style={{ ...itemStyle, width: "auto", padding: "4px 10px", color: C.textMuted, borderRadius: 4 }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={onViewScorecard}
            style={itemStyle}
            onMouseEnter={e => (e.target.style.background = `${C.accent}12`)}
            onMouseLeave={e => (e.target.style.background = "transparent")}
          >
            <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>📊</span>
            View Scorecard
          </button>
          <div style={{ height: 1, background: `${C.border}40`, margin: "4px 8px" }} />
          <button
            onClick={() => setConfirming(true)}
            style={{ ...itemStyle, color: "#FF3B30" }}
            onMouseEnter={e => (e.target.style.background = "#FF3B3010")}
            onMouseLeave={e => (e.target.style.background = "transparent")}
          >
            <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>✕</span>
            Remove Estimator
          </button>
        </>
      )}
    </div>
  );
}
