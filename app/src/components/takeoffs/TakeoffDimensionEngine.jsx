import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, bt } from "@/utils/styles";
import { nn } from "@/utils/format";

// ─── Dimension Type Definitions ────────────────────────────────
const DIMENSION_TYPES = [
  { key: "Height", unit: "ft", colorKey: "blue", value: 8, desc: "Vertical dimension" },
  { key: "Depth", unit: "in", colorKey: "purple", value: 4, desc: "Thickness / depth" },
  { key: "Width", unit: "ft", colorKey: "green", value: 1, desc: "Horizontal span" },
  { key: "Length", unit: "ft", colorKey: "green", value: 10, desc: "Linear dimension" },
  { key: "Thickness", unit: "in", colorKey: "purple", value: 4, desc: "Material thickness" },
  { key: "Spacing", unit: '"OC', colorKey: "orange", value: 16, desc: "On-center spacing" },
  { key: "Waste", unit: "%", colorKey: "red", value: 10, desc: "Waste factor" },
  { key: "Coats", unit: "", colorKey: "cyan", value: 2, desc: "Number of coats" },
  { key: "Coverage", unit: "sf", colorKey: "orange", value: 100, desc: "Coverage per unit" },
  { key: "Factor", unit: "\u00D7", colorKey: "accent", value: 1, desc: "Multiplier" },
  { key: "Pitch", unit: "/12", colorKey: "blue", value: 4, desc: "Roof pitch" },
  { key: "Laps", unit: "%", colorKey: "orange", value: 10, desc: "Overlap factor" },
];

// ─── Scenario Presets ──────────────────────────────────────────
const SCENARIOS = [
  { cat: "Masonry", label: "LF \u2192 SF Wall", formula: "Qty * Height", vars: ["Height"] },
  { cat: "Concrete", label: "LF Wall \u2192 CY", formula: "Qty * Height * Width / 12 / 27", vars: ["Height", "Width"] },
  { cat: "Concrete", label: "SF Slab \u2192 CY", formula: "Qty * Depth / 12 / 27", vars: ["Depth"] },
  { cat: "Concrete", label: "SF \u2192 CY", formula: "Qty * Thickness / 12 / 27", vars: ["Thickness"] },
  { cat: "Masonry", label: "Block Count", formula: "Qty * Height * 12 / Spacing", vars: ["Height", "Spacing"] },
  { cat: "Painting", label: "SF \u00D7 Coats", formula: "Qty * Coats", vars: ["Coats"] },
  { cat: "Painting", label: "SF \u00F7 Coverage", formula: "Qty / Coverage * Coats", vars: ["Coverage", "Coats"] },
  { cat: "General", label: "+ Waste %", formula: "Qty * (1 + Waste / 100)", vars: ["Waste"] },
  { cat: "General", label: "\u00D7 Factor", formula: "Qty * Factor", vars: ["Factor"] },
  { cat: "General", label: "\u00F7 Spacing", formula: "Qty / Spacing * 12", vars: ["Spacing"] },
];

const findDimType = key => DIMENSION_TYPES.find(d => d.key.toLowerCase() === (key || "").toLowerCase());
const resolveColor = (C, colorKey) => {
  const map = { blue: C.blue, purple: C.purple, green: C.green, orange: C.orange, red: C.red, cyan: C.cyan || C.accent, accent: C.accent };
  return map[colorKey] || C.accent;
};

// Context-aware: show only relevant dimension presets based on unit
function getRelevantPresets(unit) {
  const u = (unit || "").toUpperCase();
  if (["LF", "VLF"].includes(u)) return ["Height", "Width", "Waste", "Factor"];
  if (["SF", "SY"].includes(u)) return ["Depth", "Thickness", "Waste", "Coats", "Coverage", "Factor"];
  if (["CY", "CF"].includes(u)) return ["Depth", "Thickness", "Waste", "Factor"];
  if (u === "EA") return ["Waste", "Factor", "Spacing"];
  return ["Height", "Depth", "Width", "Waste", "Factor"];
}

// Context-aware: show only relevant scenarios
function getRelevantScenarios(unit) {
  const u = (unit || "").toUpperCase();
  if (["LF", "VLF"].includes(u)) return SCENARIOS.filter(s => s.cat === "Masonry" || s.cat === "Concrete" || s.label === "+ Waste %" || s.label === "\u00D7 Factor");
  if (["SF", "SY"].includes(u)) return SCENARIOS.filter(s => s.cat === "Painting" || s.cat === "Concrete" || s.label === "+ Waste %" || s.label === "\u00D7 Factor");
  if (["CY", "CF"].includes(u)) return SCENARIOS.filter(s => s.label === "+ Waste %" || s.label === "\u00D7 Factor");
  return SCENARIOS.filter(s => s.cat === "General");
}

// ─── Main Component ────────────────────────────────────────────
export default function TakeoffDimensionEngine({
  takeoff,
  updateTakeoff,
  measuredQty,
  computedQty,
  measurements,
  computeMeasurementValue,
  selectedDrawingId,
  removeMeasurement,
  drawingViewType,
}) {
  const C = useTheme();
  const T = C.T;

  const variables = takeoff.variables || [];
  const formula = takeoff.formula || "";
  const hasFormula = !!(formula && formula.trim());

  // Context detection
  const isLF = ["LF", "VLF"].includes((takeoff.unit || "").toUpperCase());
  const isPlanView = drawingViewType === "plan";
  const suggestHeight = isLF && isPlanView && !hasFormula && variables.length === 0;

  // Auto-add Height variable when context suggests it
  const contextApplied = useRef(false);
  useEffect(() => {
    if (suggestHeight && !contextApplied.current) {
      contextApplied.current = true;
      const dt = DIMENSION_TYPES.find(d => d.key === "Height");
      if (dt) {
        const fresh = takeoff.variables || [];
        if (!fresh.some(v => v.key && v.key.toLowerCase() === "height")) {
          updateTakeoff(takeoff.id, "variables", [...fresh, { key: dt.key, value: dt.value }]);
        }
      }
    }
  }, [suggestHeight]);

  const [showMore, setShowMore] = useState(false);
  const accentColor = C.cyan || C.accent;

  // Variable management
  const updateVariable = (idx, field, val) => {
    const fresh = takeoff.variables || [];
    const vars = [...fresh];
    vars[idx] = { ...vars[idx], [field]: val };
    updateTakeoff(takeoff.id, "variables", vars);
  };
  const addVariable = preset => {
    const fresh = takeoff.variables || [];
    if (fresh.some(v => v.key && v.key.toLowerCase() === preset.key.toLowerCase())) return;
    updateTakeoff(takeoff.id, "variables", [...fresh, { key: preset.key, value: preset.value }]);
  };
  const removeVariable = idx => {
    const fresh = takeoff.variables || [];
    const vars = [...fresh];
    vars.splice(idx, 1);
    updateTakeoff(takeoff.id, "variables", vars);
  };
  const applyScenario = scenario => {
    const currentKeys = new Set(variables.map(v => (v.key || "").toLowerCase()));
    const toAdd = [];
    scenario.vars.forEach(req => {
      if (!currentKeys.has(req.toLowerCase())) {
        const dt = DIMENSION_TYPES.find(d => d.key === req);
        toAdd.push({ key: req, value: dt ? dt.value : 1 });
      }
    });
    if (toAdd.length > 0) updateTakeoff(takeoff.id, "variables", [...variables, ...toAdd]);
    updateTakeoff(takeoff.id, "formula", scenario.formula);
  };
  const clearAll = () => {
    updateTakeoff(takeoff.id, "formula", "");
    updateTakeoff(takeoff.id, "variables", []);
  };

  const relevantPresets = getRelevantPresets(takeoff.unit);
  const relevantScenarios = getRelevantScenarios(takeoff.unit);

  return (
    <div
      style={{
        padding: "8px 10px",
        background: C.bg1,
        borderBottom: `1px solid ${C.border}`,
        borderLeft: `3px solid ${accentColor}`,
        animation: "fadeIn 0.15s",
      }}
    >
      {/* Context hint for plan view + LF */}
      {isLF && isPlanView && !hasFormula && (
        <div style={{
          fontSize: 9, color: C.accent, fontWeight: 500, marginBottom: 6,
          padding: "4px 8px", background: `${C.accent}08`, borderRadius: 5,
          border: `1px solid ${C.accent}15`,
        }}>
          Plan view detected — select a formula below to convert LF to SF
        </div>
      )}

      {/* Quick formulas — context-filtered, one click to apply */}
      {!hasFormula && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 8, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
            Quick Formulas
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {relevantScenarios.map((s, i) => {
              const highlight = isLF && isPlanView && s.label === "LF \u2192 SF Wall";
              return (
                <button
                  key={i}
                  onClick={() => applyScenario(s)}
                  style={{
                    padding: "3px 8px", fontSize: 9, fontWeight: 600,
                    border: highlight ? `1px solid ${C.accent}60` : `1px solid ${C.accent}25`,
                    background: highlight ? `${C.accent}18` : `${C.accent}06`,
                    color: C.accent, borderRadius: 4, cursor: "pointer",
                    transition: "all 0.12s",
                    boxShadow: highlight ? `0 0 6px ${C.accent}20` : "none",
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active variables — inline compact row */}
      {variables.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
          {variables.map((v, idx) => {
            const dt = findDimType(v.key);
            const clr = dt ? resolveColor(C, dt.colorKey) : C.accent;
            const unitLabel = dt ? dt.unit : "";
            return (
              <div key={idx} style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "3px 6px", borderRadius: 5,
                border: `1px solid ${clr}25`, background: `${clr}06`,
              }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: clr, textTransform: "uppercase" }}>
                  {v.key}
                </span>
                <input
                  type="number"
                  value={v.value}
                  onChange={e => updateVariable(idx, "value", e.target.value)}
                  onFocus={e => e.target.select()}
                  style={{
                    width: 40, padding: "2px 3px", fontSize: 12, fontWeight: 700,
                    fontFamily: T.font.sans, textAlign: "center", color: C.text,
                    background: `${clr}06`, border: `1px solid ${clr}18`,
                    borderRadius: 4, outline: "none", fontFeatureSettings: "'tnum'",
                  }}
                />
                {unitLabel && <span style={{ fontSize: 8, color: C.textDim }}>{unitLabel}</span>}
                <button
                  onClick={() => removeVariable(idx)}
                  style={{
                    width: 14, height: 14, border: "none", background: "transparent",
                    color: C.red, cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center", padding: 0,
                  }}
                >
                  <Ic d={I.x} size={7} />
                </button>
              </div>
            );
          })}
          {/* Add dimension button */}
          <div style={{ display: "flex", gap: 3 }}>
            {DIMENSION_TYPES
              .filter(dt => relevantPresets.includes(dt.key))
              .filter(dt => !variables.some(v => v.key && v.key.toLowerCase() === dt.key.toLowerCase()))
              .slice(0, 4)
              .map(dt => {
                const clr = resolveColor(C, dt.colorKey);
                return (
                  <button key={dt.key} onClick={() => addVariable(dt)} title={dt.desc}
                    style={{
                      padding: "2px 6px", fontSize: 8, fontWeight: 600,
                      border: `1px dashed ${clr}30`, borderRadius: 3,
                      background: "transparent", color: `${clr}90`, cursor: "pointer",
                    }}
                  >
                    +{dt.key}
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Formula bar — compact, only when formula is active */}
      {hasFormula && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 6,
          padding: "4px 8px", background: C.bg2, borderRadius: 5, border: `1px solid ${C.border}`,
        }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: C.orange, textTransform: "uppercase", letterSpacing: 0.4, flexShrink: 0 }}>ƒ</span>
          <input
            value={formula}
            onChange={e => updateTakeoff(takeoff.id, "formula", e.target.value)}
            placeholder="e.g. Qty * Height"
            style={inp(C, {
              flex: 1, padding: "3px 6px", fontSize: 10, fontWeight: 500,
              background: C.bg, border: `1px solid ${C.orange}25`, borderRadius: 4,
            })}
          />
          {/* Result preview */}
          {computedQty !== null && (
            <span style={{ fontSize: 11, fontWeight: 700, color: accentColor, fontFeatureSettings: "'tnum'", flexShrink: 0 }}>
              = {Math.round(computedQty * 100) / 100}
            </span>
          )}
          <button
            onClick={clearAll}
            style={{
              padding: "2px 6px", fontSize: 8, fontWeight: 600,
              border: `1px solid ${C.border}`, background: "transparent",
              color: C.textDim, borderRadius: 3, cursor: "pointer", flexShrink: 0,
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Expand for measurements + more presets */}
      {(measurements || []).length > 0 && (
        <button
          onClick={() => setShowMore(!showMore)}
          style={{
            fontSize: 8, fontWeight: 600, color: C.textDim,
            background: "none", border: "none", cursor: "pointer",
            padding: "2px 0", display: "flex", alignItems: "center", gap: 3,
          }}
        >
          <Ic d={showMore ? I.chevronDown : I.chevronRight} size={8} color={C.textDim} />
          {(measurements || []).length} measurement{(measurements || []).length !== 1 ? "s" : ""}
        </button>
      )}

      {showMore && (measurements || []).length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 4, marginTop: 4 }}>
          {(measurements || []).map(m => {
            const mVal = computeMeasurementValue(m, selectedDrawingId);
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 0", fontSize: 9 }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: m.color || takeoff.color }} />
                <span style={{ color: C.textDim, fontWeight: 500, textTransform: "capitalize" }}>{m.type}</span>
                <span style={{ fontWeight: 600, color: mVal !== null ? C.text : C.orange }}>
                  {mVal !== null ? mVal : "\u26A0 no scale"}
                </span>
                <button
                  onClick={() => removeMeasurement(takeoff.id, m.id)}
                  style={{
                    marginLeft: "auto", width: 12, height: 12, border: "none",
                    background: "transparent", color: C.red, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Ic d={I.x} size={7} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
