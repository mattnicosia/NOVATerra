import { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, nInp, bt } from '@/utils/styles';
import { nn } from '@/utils/format';

// ─── SVG Icon Paths (shared with estimate-side engine) ─────────
const ICONS = {
  height:   "M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4",
  depth:    "M12 3v14M8 13l4 4 4-4M4 21h16",
  width:    "M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4",
  length:   "M3 12h18M17 8l4 4-4 4",
  thick:    "M6 4v16M18 4v16M6 12h12",
  spacing:  "M4 4v16M12 4v16M20 4v16M4 20h16",
  waste:    "M3 3l18 18M12 2a10 10 0 110 20 10 10 0 010-20",
  coats:    "M4 6h16M4 10h16M4 14h16M4 18h16",
  coverage: "M3 3h18v18H3zM3 3l18 18",
  factor:   "M6 6l12 12M18 6L6 18",
  pitch:    "M3 18L12 6l9 12",
  laps:     "M3 8h10M11 16h10M8 4v16M16 4v16",
};

// ─── Dimension Type Definitions ────────────────────────────────
const DIMENSION_TYPES = [
  { key: "Height",    unit: "ft",  colorKey: "blue",   icon: ICONS.height,   value: 8,   desc: "Vertical dimension" },
  { key: "Depth",     unit: "in",  colorKey: "purple", icon: ICONS.depth,    value: 4,   desc: "Thickness / depth" },
  { key: "Width",     unit: "ft",  colorKey: "green",  icon: ICONS.width,    value: 1,   desc: "Horizontal span" },
  { key: "Length",    unit: "ft",  colorKey: "green",  icon: ICONS.length,   value: 10,  desc: "Linear dimension" },
  { key: "Thickness", unit: "in",  colorKey: "purple", icon: ICONS.thick,    value: 4,   desc: "Material thickness" },
  { key: "Spacing",   unit: '"OC', colorKey: "orange", icon: ICONS.spacing,  value: 16,  desc: "On-center spacing" },
  { key: "Waste",     unit: "%",   colorKey: "red",    icon: ICONS.waste,    value: 10,  desc: "Waste factor" },
  { key: "Coats",     unit: "",    colorKey: "cyan",   icon: ICONS.coats,    value: 2,   desc: "Number of coats" },
  { key: "Coverage",  unit: "sf",  colorKey: "orange", icon: ICONS.coverage, value: 100, desc: "Coverage per unit" },
  { key: "Factor",    unit: "\u00D7",  colorKey: "accent", icon: ICONS.factor, value: 1, desc: "Multiplier" },
  { key: "Pitch",     unit: "/12", colorKey: "blue",   icon: ICONS.pitch,    value: 4,   desc: "Roof pitch" },
  { key: "Laps",      unit: "%",   colorKey: "orange", icon: ICONS.laps,     value: 10,  desc: "Overlap factor" },
];

// ─── Scenario Presets ──────────────────────────────────────────
const SCENARIOS = [
  { cat: "Concrete", label: "LF Wall \u2192 CY",    formula: "Qty * Height * Width / 12 / 27", vars: ["Height", "Width"] },
  { cat: "Concrete", label: "SF Slab \u2192 CY",    formula: "Qty * Depth / 12 / 27",          vars: ["Depth"] },
  { cat: "Concrete", label: "SF \u2192 CY",          formula: "Qty * Thickness / 12 / 27",      vars: ["Thickness"] },
  { cat: "Masonry",  label: "LF \u2192 SF Wall",     formula: "Qty * Height",                    vars: ["Height"] },
  { cat: "Masonry",  label: "Block Count",             formula: "Qty * Height * 12 / Spacing",    vars: ["Height", "Spacing"] },
  { cat: "Painting", label: "SF \u00D7 Coats",       formula: "Qty * Coats",                     vars: ["Coats"] },
  { cat: "Painting", label: "SF \u00F7 Coverage",    formula: "Qty / Coverage * Coats",           vars: ["Coverage", "Coats"] },
  { cat: "General",  label: "+ Waste %",               formula: "Qty * (1 + Waste / 100)",         vars: ["Waste"] },
  { cat: "General",  label: "\u00D7 Factor",          formula: "Qty * Factor",                    vars: ["Factor"] },
  { cat: "General",  label: "\u00F7 Spacing",         formula: "Qty / Spacing * 12",              vars: ["Spacing"] },
];

const findDimType = (key) => DIMENSION_TYPES.find(d => d.key.toLowerCase() === (key || "").toLowerCase());
const resolveColor = (C, colorKey) => {
  const map = { blue: C.blue, purple: C.purple, green: C.green, orange: C.orange, red: C.red, cyan: C.cyan || C.accent, accent: C.accent };
  return map[colorKey] || C.accent;
};

// ─── Compact Dimension Card ────────────────────────────────────
function MiniCard({ v, idx, C, onUpdate, onRemove }) {
  const [hover, setHover] = useState(false);
  const dt = findDimType(v.key);
  const color = dt ? resolveColor(C, dt.colorKey) : resolveColor(C, "green");
  const icon = dt ? dt.icon : ICONS.factor;
  const unitLabel = dt ? dt.unit : "";
  const isCustom = !dt;

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        width: 72, padding: "7px 5px 5px", borderRadius: 8,
        border: `1.5px solid ${color}25`, background: `${color}08`,
        textAlign: "center", position: "relative",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
        transition: "all 0.15s",
        boxShadow: hover ? `0 1px 6px ${color}15` : "none",
      }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
        <path d={icon} />
      </svg>
      {isCustom ? (
        <input value={v.key} onChange={e => onUpdate(idx, "key", e.target.value)} placeholder="Name"
          style={{ width: 58, padding: "0 2px", fontSize: 8, fontWeight: 700, color, textTransform: "uppercase",
            letterSpacing: 0.5, textAlign: "center", background: "transparent", border: `1px solid ${color}20`,
            borderRadius: 3, outline: "none", fontFamily: "'DM Sans',sans-serif" }} />
      ) : (
        <div style={{ fontSize: 8, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 0.5 }}>{v.key}</div>
      )}
      <input type="number" value={v.value} onChange={e => onUpdate(idx, "value", e.target.value)}
        onFocus={e => e.target.select()} placeholder="0"
        style={{ width: 52, padding: "2px 3px", fontSize: 15, fontWeight: 700,
          fontFamily: "'DM Sans',sans-serif", textAlign: "center",
          color: C.text, background: `${color}06`, border: `1px solid ${color}18`,
          borderRadius: 5, outline: "none", fontFeatureSettings: "'tnum'" }} />
      {unitLabel && <div style={{ fontSize: 9, color: C.textDim, fontWeight: 500 }}>{unitLabel}</div>}
      {hover && (
        <button onClick={() => onRemove(idx)}
          style={{ position: "absolute", top: -5, right: -5, width: 15, height: 15, border: "none",
            background: C.red, color: "#fff", borderRadius: "50%", display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer", fontSize: 9, lineHeight: 1, fontWeight: 700,
            boxShadow: `0 1px 3px ${C.red}40` }}>
          \u00D7
        </button>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────
export default function TakeoffDimensionEngine({ takeoff, updateTakeoff, measuredQty, computedQty, measurements, computeMeasurementValue, selectedDrawingId, removeMeasurement }) {
  const C = useTheme();
  const T = C.T;
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [scenarioCat, setScenarioCat] = useState("General");

  const variables = takeoff.variables || [];
  const formula = takeoff.formula || "";
  const hasFormula = !!(formula && formula.trim());
  const totalMCount = (measurements || []).length;
  const accentColor = C.cyan || C.accent;

  // Variable management
  const updateVariable = (idx, field, val) => {
    const vars = [...variables];
    vars[idx] = { ...vars[idx], [field]: val };
    updateTakeoff(takeoff.id, "variables", vars);
  };
  const addVariable = (preset) => {
    if (variables.some(v => v.key && v.key.toLowerCase() === preset.key.toLowerCase())) return;
    updateTakeoff(takeoff.id, "variables", [...variables, { key: preset.key, value: preset.value }]);
    setShowAddMenu(false);
  };
  const addCustomVariable = () => {
    updateTakeoff(takeoff.id, "variables", [...variables, { key: "", value: "" }]);
    setShowAddMenu(false);
  };
  const removeVariable = (idx) => {
    const vars = [...variables]; vars.splice(idx, 1);
    updateTakeoff(takeoff.id, "variables", vars);
  };
  const applyScenario = (scenario) => {
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

  const scenarioCats = [...new Set(SCENARIOS.map(s => s.cat))];

  return (
    <div style={{
      padding: "10px 12px", background: C.bg1, borderBottom: `1px solid ${C.border}`,
      borderLeft: `3px solid ${accentColor}`, animation: "fadeIn 0.15s",
    }}>
      {/* Header */}
      <div style={{ fontSize: 10, fontWeight: 700, color: accentColor, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <Ic d={I.layers} size={13} color={accentColor} />
        Dimension Engine
      </div>

      {/* Tier 1: Result bar — DOMINANT */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, padding: "10px 14px", background: `linear-gradient(135deg, ${accentColor}08, ${C.purple || accentColor}06)`, borderRadius: 8, border: `1px solid ${accentColor}15` }}>
        <div style={{ textAlign: "center", minWidth: 64 }}>
          <div style={{ fontSize: 7, fontWeight: 700, color: C.purple, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>Measured</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.purple, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.1 }}>{measuredQty !== null ? measuredQty : nn(takeoff.quantity) || 0}</div>
          <div style={{ fontSize: 8, color: C.textDim, marginTop: 1 }}>{takeoff.unit}</div>
        </div>
        {hasFormula && (<>
          <svg width="24" height="12" viewBox="0 0 24 12" style={{ flexShrink: 0 }}>
            <line x1="0" y1="6" x2="16" y2="6" stroke={accentColor} strokeWidth="1.5" opacity="0.4" />
            <polygon points="16,2 24,6 16,10" fill={accentColor} opacity="0.6" />
          </svg>
          <div style={{ textAlign: "center", minWidth: 64 }}>
            <div style={{ fontSize: 7, fontWeight: 700, color: accentColor, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>Result</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: accentColor, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.1 }}>{computedQty !== null ? Math.round(computedQty * 100) / 100 : "\u2014"}</div>
            <div style={{ fontSize: 8, color: C.textDim, marginTop: 1 }}>{takeoff.unit}</div>
          </div>
        </>)}
        {hasFormula && computedQty === null && measuredQty === null && (
          <div style={{ fontSize: 9, color: C.orange, fontWeight: 600, marginLeft: 8 }}>Set scale to see result</div>
        )}
      </div>

      {/* Dimension Cards */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>Dimensions</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
          {variables.map((v, idx) => (
            <MiniCard key={idx} v={v} idx={idx} C={C} onUpdate={updateVariable} onRemove={removeVariable} />
          ))}
          {/* Add button */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowAddMenu(!showAddMenu)}
              style={{ width: 72, minHeight: 68, padding: "6px 4px", borderRadius: 8,
                border: `1.5px dashed ${C.border}`, background: "transparent", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, color: C.textDim }}>
              <Ic d={I.plus} size={14} color={C.textDim} />
              <span style={{ fontSize: 8, fontWeight: 600 }}>Add</span>
            </button>
            {showAddMenu && (
              <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, marginTop: 3,
                background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 7,
                boxShadow: T.shadow.lg, padding: 4, minWidth: 140, maxHeight: 240, overflowY: "auto" }}>
                {DIMENSION_TYPES.map(dt => {
                  const exists = variables.some(v => v.key && v.key.toLowerCase() === dt.key.toLowerCase());
                  const clr = resolveColor(C, dt.colorKey);
                  return (
                    <button key={dt.key} onClick={() => addVariable(dt)} disabled={exists}
                      style={{ display: "flex", alignItems: "center", gap: 6, width: "100%",
                        padding: "4px 6px", border: "none", borderRadius: 4,
                        background: "transparent", cursor: exists ? "default" : "pointer",
                        opacity: exists ? 0.35 : 1, textAlign: "left" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={dt.icon} /></svg>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: clr }}>{dt.key}</div>
                        <div style={{ fontSize: 8, color: C.textDim }}>{dt.desc}</div>
                      </div>
                    </button>
                  );
                })}
                <div style={{ height: 1, background: C.border, margin: "3px 0" }} />
                <button onClick={addCustomVariable}
                  style={{ display: "flex", alignItems: "center", gap: 6, width: "100%",
                    padding: "4px 6px", border: "none", borderRadius: 4,
                    background: "transparent", cursor: "pointer" }}>
                  <Ic d={I.plus} size={12} color={C.textDim} />
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.textDim }}>Custom</div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Formula Bar */}
      <div style={{ padding: "7px 10px", background: C.bg2, borderRadius: 6, border: `1px solid ${C.border}`, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: C.orange, textTransform: "uppercase", letterSpacing: 0.5 }}>Formula</span>
          <input value={formula} onChange={e => updateTakeoff(takeoff.id, "formula", e.target.value)}
            placeholder='e.g. Qty * Height / 27'
            style={inp(C, { flex: 1, padding: "4px 8px", fontSize: 11,
              fontFamily: "'DM Sans',sans-serif", fontWeight: 500,
              background: C.bg, border: `1px solid ${formula ? C.orange + "30" : C.border}`, borderRadius: 5 })} />
          {hasFormula && (
            <button onClick={() => updateTakeoff(takeoff.id, "formula", "")}
              style={{ padding: "2px 6px", fontSize: 8, fontWeight: 600, border: `1px solid ${C.border}`,
                background: "transparent", color: C.textDim, borderRadius: 4, cursor: "pointer" }}>Clear</button>
          )}
        </div>
        <div style={{ fontSize: 9, color: C.textDim, lineHeight: 1.4 }}>
          <strong style={{ color: C.purple }}>Qty</strong> = measured. Reference dimensions by name.
        </div>
      </div>

      {/* Tier 3: Scenarios — whisper */}
      <div style={{ marginBottom: 8, opacity: 0.85 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
          <span style={{ fontSize: 7, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.7 }}>Quick formulas</span>
          <div style={{ display: "flex", gap: 0, background: C.bg2, borderRadius: 4, padding: 2 }}>
            {scenarioCats.map(cat => (
              <button key={cat} onClick={() => setScenarioCat(cat)}
                style={{ padding: "2px 8px", fontSize: 9, fontWeight: 600, border: "none", borderRadius: 3,
                  background: scenarioCat === cat ? C.accent : "transparent",
                  color: scenarioCat === cat ? "#fff" : C.textMuted,
                  cursor: "pointer", transition: "all 0.1s" }}>{cat}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {SCENARIOS.filter(s => s.cat === scenarioCat).map((s, i) => (
            <button key={i} onClick={() => applyScenario(s)}
              onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.06)"; e.currentTarget.style.boxShadow = `0 2px 8px ${C.accent}25`; e.currentTarget.style.background = `${C.accent}12`; e.currentTarget.style.borderColor = `${C.accent}50`; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.background = `${C.accent}06`; e.currentTarget.style.borderColor = `${C.accent}30`; }}
              style={{ padding: "3px 9px", fontSize: 9, fontWeight: 600,
                border: `1px solid ${C.accent}30`, background: `${C.accent}06`,
                color: C.accent, borderRadius: 5, cursor: "pointer",
                transition: "all 0.12s ease-out" }}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Measurements list */}
      {totalMCount > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 }}>
            Measurements ({totalMCount})
          </div>
          {(measurements || []).map(m => {
            const mVal = computeMeasurementValue(m, selectedDrawingId);
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 9 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: m.color || takeoff.color, display: "inline-block" }} />
                <span style={{ color: C.textDim, fontWeight: 500, textTransform: "capitalize" }}>{m.type}</span>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, color: mVal !== null ? C.text : C.orange }}>{mVal !== null ? mVal : "\u26A0 no scale"}</span>
                <span style={{ color: C.textDim, fontSize: 7 }}>{m.sheetId === selectedDrawingId ? "(this)" : "(other)"}</span>
                <button onClick={() => removeMeasurement(takeoff.id, m.id)}
                  style={{ marginLeft: "auto", width: 12, height: 12, border: "none", background: "transparent", color: C.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
