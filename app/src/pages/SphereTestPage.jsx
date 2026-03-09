// SphereTestPage v4 — Side-by-side layout: sphere left, controls right
// Route: /sphere-test (only in development)
// v4: Added crystallization controls (manual override + auto Hodgin temporal)

import { useState, useRef, useCallback } from "react";
import NovaSceneLazy from "@/components/nova/NovaSceneLazy";

const T_FONT = "'DM Sans', sans-serif";

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <span style={{ width: 70, fontSize: 10, fontWeight: 600, color: "#888", fontFamily: T_FONT }}>{label}</span>
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
        style={{ width: 38, fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "monospace", textAlign: "right" }}
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
        padding: "7px 0",
        borderRadius: 6,
        border: `1px solid ${color}33`,
        background: `${color}18`,
        color,
        fontWeight: 700,
        fontSize: 10,
        cursor: "pointer",
        fontFamily: T_FONT,
        letterSpacing: "0.05em",
      }}
    >
      {label}
    </button>
  );
}

function ControlSection({ title, children }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: "#555",
          letterSpacing: "0.08em",
          marginBottom: 8,
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function ToggleButton({ active, onClick, label, activeColor }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 14px",
        borderRadius: 6,
        border: `1px solid ${active ? activeColor : "#555"}33`,
        background: active ? `${activeColor}18` : "rgba(255,255,255,0.05)",
        color: active ? activeColor : "#888",
        fontWeight: 700,
        fontSize: 10,
        cursor: "pointer",
        fontFamily: T_FONT,
      }}
    >
      {active ? "ON" : "OFF"}
    </button>
  );
}

export default function SphereTestPage() {
  const sphereRef = useRef();

  const [morph, setMorph] = useState(0.0);
  const [intensity, setIntensity] = useState(0.7);
  const [sphereSize, setSphereSize] = useState(1.6);
  const [artifact, setArtifact] = useState(false);
  const [awaken, setAwaken] = useState(0.0);
  const [chamber, setChamber] = useState(false);

  // Crystallization controls — null = auto Hodgin temporal, number = manual override
  const [crystalAuto, setCrystalAuto] = useState(true);
  const [crystallize, setCrystallize] = useState(0.25);
  const [crystalLayers, setCrystalLayers] = useState(5.0);

  const setPreset = useCallback(m => setMorph(m), []);

  return (
    <div
      style={{
        height: "100vh",
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: T_FONT,
        gap: 32,
        padding: 24,
        overflow: "hidden",
      }}
    >
      {/* ── Left: Sphere viewport ────────────────────────────── */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <NovaSceneLazy
          ref={sphereRef}
          morphTarget={morph}
          intensity={intensity}
          size={sphereSize}
          width={560}
          height={560}
          artifact={artifact}
          awaken={awaken}
          chamber={chamber}
          crystallize={crystalAuto ? null : crystallize}
          crystalLayers={crystalAuto ? null : crystalLayers}
          onClick={() => sphereRef.current?.exhale()}
        />

        {/* State label */}
        <div
          style={{
            position: "absolute",
            bottom: 12,
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

      {/* ── Right: Controls panel ────────────────────────────── */}
      <div
        style={{ width: 320, display: "flex", flexDirection: "column", gap: 10, maxHeight: "100vh", overflow: "auto" }}
      >
        {/* Title */}
        <div style={{ marginBottom: 4 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 2, letterSpacing: "-0.02em" }}>
            NOVACORE v14 — Phase Transition
          </h1>
          <p style={{ fontSize: 10, color: "#555", margin: 0 }}>
            Domain-warped FBM · IQ Palette · Mod Noise Crystallization
          </p>
        </div>

        {/* Sphere controls */}
        <ControlSection title="Sphere">
          <Slider label="uMorph" value={morph} onChange={setMorph} />
          <Slider label="Intensity" value={intensity} onChange={setIntensity} min={0.2} />
          <Slider label="Size" value={sphereSize} onChange={setSphereSize} min={0.5} max={3} step={0.1} />
          <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
            <ActionButton onClick={() => setPreset(0.0)} label="NOVA" />
            <ActionButton onClick={() => setPreset(0.25)} label="THINK" />
            <ActionButton onClick={() => setPreset(0.55)} label="MID" color="#C77DFF" />
            <ActionButton onClick={() => setPreset(1.0)} label="CORE" color="#E8920A" />
          </div>
        </ControlSection>

        {/* Crystallization */}
        <ControlSection title="Phase Transition">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ width: 70, fontSize: 10, fontWeight: 600, color: "#888" }}>Mode</span>
            <button
              onClick={() => setCrystalAuto(!crystalAuto)}
              style={{
                padding: "5px 14px",
                borderRadius: 6,
                border: `1px solid ${crystalAuto ? "#4ADE80" : "#8B5CF6"}33`,
                background: crystalAuto ? "rgba(74,222,128,0.08)" : "rgba(139,92,246,0.08)",
                color: crystalAuto ? "#4ADE80" : "#8B5CF6",
                fontWeight: 700,
                fontSize: 10,
                cursor: "pointer",
                fontFamily: T_FONT,
              }}
            >
              {crystalAuto ? "AUTO (Hodgin)" : "MANUAL"}
            </button>
          </div>
          {!crystalAuto && (
            <>
              <Slider label="Crystallize" value={crystallize} onChange={setCrystallize} />
              <Slider label="Layers" value={crystalLayers} onChange={setCrystalLayers} min={2} max={12} step={0.5} />
            </>
          )}
          <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
            <ActionButton
              onClick={() => {
                setCrystalAuto(false);
                setCrystallize(0.0);
              }}
              label="FLUID"
              color="#3B82F6"
            />
            <ActionButton
              onClick={() => {
                setCrystalAuto(false);
                setCrystallize(0.35);
                setCrystalLayers(5);
              }}
              label="STRATA"
            />
            <ActionButton
              onClick={() => {
                setCrystalAuto(false);
                setCrystallize(0.7);
                setCrystalLayers(8);
              }}
              label="CRYSTAL"
              color="#C77DFF"
            />
            <ActionButton
              onClick={() => {
                setCrystalAuto(false);
                setCrystallize(1.0);
                setCrystalLayers(12);
              }}
              label="SHATTER"
              color="#E8920A"
            />
          </div>
        </ControlSection>

        {/* The Artifact */}
        <ControlSection title="The Artifact">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: artifact ? 8 : 0 }}>
            <span style={{ width: 70, fontSize: 10, fontWeight: 600, color: "#888" }}>Housing</span>
            <ToggleButton active={artifact} onClick={() => setArtifact(!artifact)} activeColor="#4ADE80" />
          </div>
          {artifact && (
            <>
              <Slider label="Awaken" value={awaken} onChange={setAwaken} />
              <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
                <ActionButton onClick={() => setAwaken(0.0)} label="DORMANT" color="#555" />
                <ActionButton onClick={() => setAwaken(0.35)} label="STIR" color="#3B82F6" />
                <ActionButton onClick={() => setAwaken(0.7)} label="AWAKEN" color="#8B5CF6" />
                <ActionButton onClick={() => setAwaken(1.0)} label="ALIVE" color="#4ADE80" />
              </div>
            </>
          )}
        </ControlSection>

        {/* The Chamber */}
        <ControlSection title="The Chamber">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 70, fontSize: 10, fontWeight: 600, color: "#888" }}>Environment</span>
            <ToggleButton active={chamber} onClick={() => setChamber(!chamber)} activeColor="#F59E0B" />
          </div>
        </ControlSection>

        {/* Actions */}
        <ControlSection title="Actions">
          <div style={{ display: "flex", gap: 6 }}>
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
        </ControlSection>
      </div>
    </div>
  );
}
