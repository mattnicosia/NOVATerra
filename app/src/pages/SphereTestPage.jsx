// SphereTestPage v2 — Dev-only page to preview and tune the NOVACORE sphere
// Route: /sphere-test (only in development)

import { useState, useRef, useCallback } from "react";
import NovaSceneLazy from "@/components/nova/NovaSceneLazy";

const T_FONT = "'DM Sans', sans-serif";

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
      <span style={{ width: 90, fontSize: 11, fontWeight: 600, color: "#888", fontFamily: T_FONT }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: "#8B5CF6" }}
      />
      <span
        style={{ width: 46, fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "monospace", textAlign: "right" }}
      >
        {value.toFixed(2)}
      </span>
    </div>
  );
}

function ActionButton({ onClick, label, color = "#8B5CF6" }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 0",
        borderRadius: 8,
        border: `1px solid ${color}33`,
        background: `${color}18`,
        color,
        fontWeight: 700,
        fontSize: 11,
        cursor: "pointer",
        fontFamily: T_FONT,
        letterSpacing: "0.05em",
      }}
    >
      {label}
    </button>
  );
}

export default function SphereTestPage() {
  const sphereRef = useRef();

  const [morph, setMorph] = useState(0.0);
  const [intensity, setIntensity] = useState(0.7);
  const [sphereSize, setSphereSize] = useState(1.6);

  // Morph presets
  const setPreset = useCallback(m => setMorph(m), []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: T_FONT,
        padding: 32,
      }}
    >
      {/* Title */}
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "#fff",
          marginBottom: 4,
          letterSpacing: "-0.02em",
        }}
      >
        NOVACORE Sphere v2
      </h1>
      <p style={{ fontSize: 12, color: "#555", marginBottom: 24 }}>
        Domain-warped FBM · IQ Cosine Palette · Volumetric Raymarching · Atmosphere Glow
      </p>

      {/* Sphere */}
      <div style={{ position: "relative", marginBottom: 32 }}>
        <NovaSceneLazy
          ref={sphereRef}
          morphTarget={morph}
          intensity={intensity}
          size={sphereSize}
          width={520}
          height={520}
          onClick={() => sphereRef.current?.exhale()}
        />

        {/* State label */}
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 10,
            fontWeight: 700,
            color: morph < 0.3 ? "#8B5CF6" : morph < 0.7 ? "#C77DFF" : "#E8920A",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            textShadow: `0 0 20px ${morph < 0.3 ? "rgba(139,92,246,0.5)" : "rgba(232,146,10,0.5)"}`,
          }}
        >
          {morph < 0.15
            ? "NOVA — Idle"
            : morph < 0.35
              ? "NOVA — Thinking"
              : morph < 0.6
                ? "Transitioning"
                : morph < 0.85
                  ? "CORE — Active"
                  : "CORE — Fusion"}
        </div>
      </div>

      {/* Controls */}
      <div style={{ width: 440, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Main controls */}
        <div
          style={{
            padding: 20,
            borderRadius: 12,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Slider label="uMorph" value={morph} onChange={setMorph} />
          <Slider label="Intensity" value={intensity} onChange={setIntensity} min={0.2} />
          <Slider label="Size" value={sphereSize} onChange={setSphereSize} min={0.5} max={3} step={0.1} />

          {/* Preset buttons */}
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            <ActionButton onClick={() => setPreset(0.0)} label="NOVA" />
            <ActionButton onClick={() => setPreset(0.25)} label="THINK" />
            <ActionButton onClick={() => setPreset(0.55)} label="MID" color="#C77DFF" />
            <ActionButton onClick={() => setPreset(1.0)} label="CORE" color="#E8920A" />
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            padding: 20,
            borderRadius: 12,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#555",
              letterSpacing: "0.08em",
              marginBottom: 10,
              textTransform: "uppercase",
            }}
          >
            Actions
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <ActionButton onClick={() => sphereRef.current?.pulse()} label="PULSE" />
            <ActionButton onClick={() => sphereRef.current?.exhale()} label="EXHALE" />
            <ActionButton
              onClick={() => {
                let v = 0;
                const interval = setInterval(() => {
                  v += 0.015;
                  if (v > 2) {
                    clearInterval(interval);
                    setMorph(0);
                    return;
                  }
                  setMorph(v <= 1 ? v : 2 - v);
                }, 25);
              }}
              label="MORPH CYCLE"
              color="#E8920A"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
