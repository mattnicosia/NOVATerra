// ConfidenceEngineAdmin — Admin-only panel for subdivision engine weight tuning
// Only visible to matt@bldgestimating.com

import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/stores/authStore";
import { useSubdivisionStore } from "@/stores/subdivisionStore";
// DEFAULT_ENGINE_CONFIG available from confidenceEngine if needed

function SliderRow({ label, value, onChange, min = 0, max = 1, step = 0.01, C, _T, suffix = "%" }) {
  const display = suffix === "%" ? (value * 100).toFixed(0) + "%" : value;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 32 }}>
      <span style={{ width: 120, fontSize: 12, fontWeight: 500, color: C.textMuted, flexShrink: 0 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: C.accent, cursor: "pointer" }}
      />
      <span
        style={{
          width: 48,
          fontSize: 12,
          fontWeight: 600,
          color: C.text,
          fontFamily: "'Switzer', sans-serif",
          textAlign: "right",
        }}
      >
        {display}
      </span>
    </div>
  );
}

function StatItem({ label, value, C }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
      <span style={{ fontSize: 11.5, color: C.textMuted }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: "'Switzer', sans-serif" }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

export default function ConfidenceEngineAdmin() {
  const C = useTheme();
  const T = C.T;

  const user = useAuthStore(s => s.user);
  const engineConfig = useSubdivisionStore(s => s.engineConfig);
  const updateWeights = useSubdivisionStore(s => s.updateWeights);
  const updateEngineConfig = useSubdivisionStore(s => s.updateEngineConfig);
  const resetEngineConfig = useSubdivisionStore(s => s.resetEngineConfig);
  const stats = useSubdivisionStore(s => s.getStats)();
  const [open, setOpen] = useState(false);

  const isAdmin = user?.email === "matt@bldgestimating.com";
  if (!isAdmin) return null;

  const w = engineConfig.weights || { baseline: 0.6, userHistorical: 0.3, llm: 0.1 };

  // When one weight changes, redistribute the difference proportionally among the other two
  const handleWeightChange = (key, newVal) => {
    const keys = ["baseline", "userHistorical", "llm"];
    const others = keys.filter(k => k !== key);
    const oldVal = w[key];
    const diff = newVal - oldVal;
    const othersSum = others.reduce((s, k) => s + w[k], 0);

    const newW = { ...w };
    newW[key] = newVal;

    if (othersSum > 0) {
      others.forEach(k => {
        const proportion = w[k] / othersSum;
        newW[k] = Math.max(0, w[k] - diff * proportion);
      });
    } else {
      const remainder = (1 - newVal) / others.length;
      others.forEach(k => {
        newW[k] = Math.max(0, remainder);
      });
    }

    // Normalize to exactly 1.0
    const total = keys.reduce((s, k) => s + newW[k], 0);
    if (total > 0) {
      keys.forEach(k => {
        newW[k] = newW[k] / total;
      });
    }

    updateWeights(newW);
  };

  return (
    <div
      style={{
        padding: "18px 20px",
        borderRadius: T.radius.md,
        background: C.bg2,
        border: `1px solid ${C.border}`,
      }}
    >
      {/* Collapsible header */}
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: C.text,
              fontFamily: T.font.sans,
            }}
          >
            Subdivision Engine Config
          </span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: C.accent,
              background: `${C.accent}18`,
              padding: "2px 7px",
              borderRadius: 4,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            admin
          </span>
        </div>
        <span
          style={{
            fontSize: 14,
            color: C.textMuted,
            transition: "transform 0.2s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▾
        </span>
      </div>

      {open && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Weight sliders */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: C.textMuted,
                marginBottom: 8,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Source Weights
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <SliderRow
                label="Baseline"
                value={w.baseline}
                onChange={v => handleWeightChange("baseline", v)}
                C={C}
                T={T}
              />
              <SliderRow
                label="User Historical"
                value={w.userHistorical}
                onChange={v => handleWeightChange("userHistorical", v)}
                C={C}
                T={T}
              />
              <SliderRow
                label="LLM"
                value={w.llm}
                onChange={v => handleWeightChange("llm", v)}
                C={C}
                T={T}
              />
            </div>
          </div>

          {/* Engine parameters */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: C.textMuted,
                marginBottom: 8,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Parameters
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 32 }}>
                <span style={{ width: 120, fontSize: 12, fontWeight: 500, color: C.textMuted, flexShrink: 0 }}>
                  Auto-shift
                </span>
                <div
                  onClick={() => updateEngineConfig({ autoShift: !engineConfig.autoShift })}
                  style={{
                    width: 36,
                    height: 20,
                    borderRadius: 10,
                    cursor: "pointer",
                    background: engineConfig.autoShift ? C.accent : C.border,
                    position: "relative",
                    transition: "background 0.2s",
                  }}
                >
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 8,
                      background: "#fff",
                      position: "absolute",
                      top: 2,
                      left: engineConfig.autoShift ? 18 : 2,
                      transition: "left 0.2s",
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, color: C.textMuted }}>{engineConfig.autoShift ? "On" : "Off"}</span>
              </div>
              <SliderRow
                label="Min User Samples"
                value={engineConfig.minUserSamples}
                onChange={v => updateEngineConfig({ minUserSamples: Math.round(v) })}
                min={1}
                max={20}
                step={1}
                C={C}
                T={T}
                suffix=""
              />
              <SliderRow
                label="Max User Weight"
                value={engineConfig.maxUserWeight}
                onChange={v => updateEngineConfig({ maxUserWeight: v })}
                min={0}
                max={1}
                step={0.05}
                C={C}
                T={T}
              />
              <SliderRow
                label="LLM Temperature"
                value={engineConfig.llmTemperature}
                onChange={v => updateEngineConfig({ llmTemperature: v })}
                min={0}
                max={2}
                step={0.05}
                C={C}
                T={T}
                suffix=""
              />
            </div>
          </div>

          {/* Stats */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: C.textMuted,
                marginBottom: 8,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Engine Stats
            </div>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: T.radius.sm,
                background: C.bg,
                border: `1px solid ${C.border}`,
              }}
            >
              <StatItem label="Total subdivisions" value={stats.totalSubs} C={C} />
              <StatItem label="Validated LLM" value={stats.validatedLlm} C={C} />
              <StatItem label="User overrides" value={stats.userOverrideCount} C={C} />
              <StatItem label="Calibrated" value={stats.calibratedCount} C={C} />
            </div>
          </div>

          {/* Reset button */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={resetEngineConfig}
              style={{
                padding: "6px 14px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: T.radius.sm,
                border: `1px solid ${C.border}`,
                background: "transparent",
                color: C.textMuted,
                cursor: "pointer",
                letterSpacing: "0.02em",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => {
                e.target.style.borderColor = "#e74c3c";
                e.target.style.color = "#e74c3c";
              }}
              onMouseLeave={e => {
                e.target.style.borderColor = C.border;
                e.target.style.color = C.textMuted;
              }}
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
