import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useItemsStore } from "@/stores/itemsStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp } from "@/utils/styles";
import { nn } from "@/utils/format";
import { evalFormula } from "@/utils/formula";

// ─── SVG Icon Paths ────────────────────────────────────────────
const ICONS = {
  height: "M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4",
  depth: "M12 3v14M8 13l4 4 4-4M4 21h16",
  width: "M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4",
  length: "M3 12h18M17 8l4 4-4 4",
  thick: "M6 4v16M18 4v16M6 12h12",
  spacing: "M4 4v16M12 4v16M20 4v16M4 20h16",
  waste: "M3 3l18 18M12 2a10 10 0 110 20 10 10 0 010-20",
  coats: "M4 6h16M4 10h16M4 14h16M4 18h16",
  coverage: "M3 3h18v18H3zM3 3l18 18",
  factor: "M6 6l12 12M18 6L6 18",
  pitch: "M3 18L12 6l9 12",
  laps: "M3 8h10M11 16h10M8 4v16M16 4v16",
};

// ─── Dimension Type Definitions ────────────────────────────────
const DIMENSION_TYPES = [
  { key: "Height", unit: "ft", colorKey: "blue", icon: ICONS.height, value: 8, desc: "Vertical dimension" },
  { key: "Depth", unit: "in", colorKey: "purple", icon: ICONS.depth, value: 4, desc: "Thickness / depth" },
  { key: "Width", unit: "ft", colorKey: "green", icon: ICONS.width, value: 1, desc: "Horizontal span" },
  { key: "Length", unit: "ft", colorKey: "green", icon: ICONS.length, value: 10, desc: "Linear dimension" },
  { key: "Thickness", unit: "in", colorKey: "purple", icon: ICONS.thick, value: 4, desc: "Material thickness" },
  { key: "Spacing", unit: '"OC', colorKey: "orange", icon: ICONS.spacing, value: 16, desc: "On-center spacing" },
  { key: "Waste", unit: "%", colorKey: "red", icon: ICONS.waste, value: 10, desc: "Waste factor" },
  { key: "Coats", unit: "", colorKey: "cyan", icon: ICONS.coats, value: 2, desc: "Number of coats" },
  { key: "Coverage", unit: "sf", colorKey: "orange", icon: ICONS.coverage, value: 100, desc: "Coverage per unit" },
  { key: "Factor", unit: "\u00D7", colorKey: "accent", icon: ICONS.factor, value: 1, desc: "Multiplier" },
  { key: "Pitch", unit: "/12", colorKey: "blue", icon: ICONS.pitch, value: 4, desc: "Roof pitch" },
  { key: "Laps", unit: "%", colorKey: "orange", icon: ICONS.laps, value: 10, desc: "Overlap factor" },
];

// ─── Scenario Presets (categorized) ────────────────────────────
const SCENARIOS = [
  { cat: "Concrete", label: "LF Wall \u2192 CY", formula: "Qty * Height * Width / 12 / 27", vars: ["Height", "Width"] },
  { cat: "Concrete", label: "SF Slab \u2192 CY", formula: "Qty * Depth / 12 / 27", vars: ["Depth"] },
  { cat: "Concrete", label: "SF \u2192 CY (thick)", formula: "Qty * Thickness / 12 / 27", vars: ["Thickness"] },
  { cat: "Masonry", label: "LF \u2192 SF Wall", formula: "Qty * Height", vars: ["Height"] },
  { cat: "Masonry", label: "Block Count", formula: "Qty * Height * 12 / Spacing", vars: ["Height", "Spacing"] },
  { cat: "Painting", label: "SF \u00D7 Coats", formula: "Qty * Coats", vars: ["Coats"] },
  { cat: "Painting", label: "SF \u00F7 Coverage", formula: "Qty / Coverage * Coats", vars: ["Coverage", "Coats"] },
  { cat: "General", label: "+ Waste %", formula: "Qty * (1 + Waste / 100)", vars: ["Waste"] },
  { cat: "General", label: "\u00D7 Factor", formula: "Qty * Factor", vars: ["Factor"] },
  { cat: "General", label: "\u00F7 Spacing (OC)", formula: "Qty / Spacing * 12", vars: ["Spacing"] },
  { cat: "General", label: "Area \u00D7 Depth", formula: "Qty * Depth / 27", vars: ["Depth"] },
];

// Helper: find dimension type definition for a variable key
const findDimType = key => DIMENSION_TYPES.find(d => d.key.toLowerCase() === (key || "").toLowerCase());

// Helper: resolve color from theme
const resolveColor = (C, colorKey) => {
  const map = {
    blue: C.blue,
    purple: C.purple,
    green: C.green,
    orange: C.orange,
    red: C.red,
    cyan: C.cyan || C.accent,
    accent: C.accent,
  };
  return map[colorKey] || C.accent;
};

// ─── Narrative Builder ─────────────────────────────────────────
// Parses the formula and builds a rich inline narrative
function buildNarrative(formula, variables, measured, unit, _result, _C) {
  if (!formula || !formula.trim()) return null;
  const segments = [];
  // Tokenize the formula
  const tokens = formula.match(/[A-Za-z_]\w*|[\d.]+|[+\-*/()]/g) || [];
  tokens.forEach((tok, _i) => {
    const isVar = /^[A-Za-z_]/.test(tok);
    if (isVar && tok.toLowerCase() === "qty") {
      segments.push({ type: "measured", text: `${measured}`, unit: unit || "EA" });
    } else if (isVar) {
      const v = variables.find(vv => (vv.key || "").toLowerCase() === tok.toLowerCase());
      const dt = findDimType(tok);
      const val = v ? nn(v.value) : tok;
      const vUnit = dt ? dt.unit : "";
      const color = dt ? dt.colorKey : "green";
      segments.push({ type: "variable", text: `${val}`, unit: vUnit, label: tok.toLowerCase(), color });
    } else if (/^[\d.]+$/.test(tok)) {
      segments.push({ type: "constant", text: tok });
    } else {
      // Operator
      const opMap = { "*": "\u00D7", "/": "\u00F7", "+": "+", "-": "\u2212" };
      segments.push({ type: "operator", text: opMap[tok] || tok });
    }
  });
  return segments;
}

// ─── Dimension Card Component ──────────────────────────────────
function DimensionCard({ v, idx, C, updateVariable, removeVariable }) {
  const T = C.T;
  const [hover, setHover] = useState(false);
  const dt = findDimType(v.key);
  const color = dt ? resolveColor(C, dt.colorKey) : resolveColor(C, "green");
  const icon = dt ? dt.icon : ICONS.factor;
  const unitLabel = dt ? dt.unit : "";
  const isCustom = !dt;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 90,
        minHeight: 86,
        padding: "10px 8px 8px",
        borderRadius: 10,
        border: `1.5px solid ${color}25`,
        background: `${color}08`,
        textAlign: "center",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        transition: "all 0.15s",
        boxShadow: hover ? `0 2px 8px ${color}15` : "none",
      }}
    >
      {/* Icon */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: 0.7 }}
      >
        <path d={icon} />
      </svg>

      {/* Label */}
      {isCustom ? (
        <input
          value={v.key}
          onChange={e => updateVariable(idx, "key", e.target.value)}
          placeholder="Name"
          style={{
            width: 70,
            padding: "1px 2px",
            fontSize: 10,
            fontWeight: 700,
            color,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            textAlign: "center",
            background: "transparent",
            border: `1px solid ${color}20`,
            borderRadius: 4,
            outline: "none",
            fontFamily: T.font.sans,
          }}
        />
      ) : (
        <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 0.6 }}>
          {v.key}
        </div>
      )}

      {/* Value input */}
      <input
        type="number"
        value={v.value}
        onChange={e => updateVariable(idx, "value", e.target.value)}
        onFocus={e => e.target.select()}
        placeholder="0"
        style={{
          width: 64,
          padding: "3px 4px",
          fontSize: 18,
          fontWeight: 700,
          fontFamily: T.font.sans,
          textAlign: "center",
          color: C.text,
          background: `${color}06`,
          border: `1px solid ${color}18`,
          borderRadius: 6,
          outline: "none",
          fontFeatureSettings: "'tnum'",
        }}
      />

      {/* Unit */}
      {unitLabel && <div style={{ fontSize: 10, color: C.textDim, fontWeight: 500 }}>{unitLabel}</div>}

      {/* Remove button (hover only) */}
      {hover && (
        <button
          onClick={() => removeVariable(idx)}
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            width: 18,
            height: 18,
            border: "none",
            background: C.red,
            color: "#fff",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: 10,
            lineHeight: 1,
            fontWeight: 700,
            boxShadow: `0 1px 4px ${C.red}40`,
          }}
        >
          \u00D7
        </button>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────
export default function ComputationChain({ item }) {
  const C = useTheme();
  const T = C.T;
  const updateItem = useItemsStore(s => s.updateItem);
  const items = useItemsStore(s => s.items);
  const setEstShowVars = useUiStore(s => s.setEstShowVars);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [scenarioCat, setScenarioCat] = useState("General");

  // Always get fresh item from store
  const fresh = items.find(i => i.id === item.id) || item;
  const variables = fresh.variables || [];
  const formula = fresh.formula || "";
  const measured = nn(fresh.quantity);
  const hasFormula = !!(formula && formula.trim());

  // Compute result
  const computeResult = () => {
    if (!hasFormula) return measured;
    return evalFormula(formula, variables, measured);
  };
  const result = computeResult();
  const resultRounded = Math.round(result * 100) / 100;

  // Variable management
  const updateVariable = (idx, field, value) => {
    const vars = [...variables];
    vars[idx] = { ...vars[idx], [field]: value };
    updateItem(fresh.id, "variables", vars);
  };

  const addVariable = preset => {
    const existing = variables.find(v => v.key && v.key.toLowerCase() === preset.key.toLowerCase());
    if (existing) return;
    updateItem(fresh.id, "variables", [...variables, { key: preset.key, value: preset.value }]);
    setShowAddMenu(false);
  };

  const addCustomVariable = () => {
    updateItem(fresh.id, "variables", [...variables, { key: "", value: "" }]);
    setShowAddMenu(false);
  };

  const removeVariable = idx => {
    const vars = [...variables];
    vars.splice(idx, 1);
    updateItem(fresh.id, "variables", vars);
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
    if (toAdd.length > 0) {
      updateItem(fresh.id, "variables", [...variables, ...toAdd]);
    }
    updateItem(fresh.id, "formula", scenario.formula);
  };

  const chainColor = C.cyan || C.accent;
  const narrative = buildNarrative(formula, variables, measured, fresh.unit, resultRounded, C);
  const scenarioCats = [...new Set(SCENARIOS.map(s => s.cat))];

  return (
    <div
      style={{
        padding: "16px 20px 16px 24px",
        background: C.bg1,
        borderBottom: `1px solid ${C.border}`,
        borderLeft: `4px solid ${chainColor}`,
        animation: "fadeIn 0.15s",
      }}
    >
      {/* ── Header ────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: `${chainColor}15`,
              border: `1px solid ${chainColor}30`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ic d={I.layers} size={15} color={chainColor} />
          </div>
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: chainColor,
                textTransform: "uppercase",
                letterSpacing: 0.8,
              }}
            >
              Dimension Engine
            </div>
            <div
              style={{
                fontSize: 11,
                color: C.textDim,
                marginTop: 1,
                maxWidth: 400,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {fresh.description}
            </div>
          </div>
        </div>
        <button
          className="icon-btn"
          onClick={() => setEstShowVars(null)}
          style={{
            width: 24,
            height: 24,
            border: `1px solid ${C.border}`,
            background: C.bg2,
            color: C.textDim,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <Ic d={I.x} size={11} />
        </button>
      </div>

      {/* ── Narrative Bar ─────────────────────────────────────── */}
      {hasFormula && narrative && (
        <div
          style={{
            padding: "10px 14px",
            background: `${chainColor}06`,
            borderRadius: 8,
            marginBottom: 14,
            fontSize: 13,
            color: C.text,
            lineHeight: 1.8,
            border: `1px solid ${chainColor}12`,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            gap: 2,
          }}
        >
          {narrative.map((seg, i) => {
            if (seg.type === "measured") {
              return (
                <span key={i} style={{ fontWeight: 700, color: C.purple, fontFamily: T.font.sans, fontSize: 14 }}>
                  {seg.text} <span style={{ fontSize: 11, fontWeight: 500, fontFamily: T.font.sans }}>{seg.unit}</span>
                </span>
              );
            }
            if (seg.type === "variable") {
              const clr = resolveColor(C, seg.color);
              return (
                <span key={i} style={{ fontWeight: 700, color: clr, fontFamily: T.font.sans, fontSize: 14 }}>
                  {seg.text}
                  <span style={{ fontSize: 10, fontWeight: 500, fontFamily: T.font.sans, marginLeft: 2 }}>
                    {seg.unit}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 400,
                      color: C.textDim,
                      fontFamily: T.font.sans,
                      marginLeft: 2,
                    }}
                  >
                    {seg.label}
                  </span>
                </span>
              );
            }
            if (seg.type === "operator") {
              return (
                <span key={i} style={{ color: C.textDim, fontWeight: 500, padding: "0 3px", fontSize: 14 }}>
                  {seg.text}
                </span>
              );
            }
            if (seg.type === "constant") {
              return (
                <span key={i} style={{ fontWeight: 600, color: C.text, fontFamily: T.font.sans, fontSize: 14 }}>
                  {seg.text}
                </span>
              );
            }
            return null;
          })}
          <span style={{ color: C.textDim, fontWeight: 500, padding: "0 4px", fontSize: 14 }}>=</span>
          <span
            style={{
              fontWeight: 800,
              color: chainColor,
              fontFamily: T.font.sans,
              fontSize: 16,
              background: `${chainColor}12`,
              padding: "2px 8px",
              borderRadius: 5,
            }}
          >
            {resultRounded}{" "}
            <span style={{ fontSize: 11, fontWeight: 500, fontFamily: T.font.sans }}>{fresh.unit || "EA"}</span>
          </span>
        </div>
      )}

      {/* ── Result Flow (Measured → Result) ────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        {/* Measured block */}
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: `1.5px solid ${C.purple}25`,
            background: `${C.purple}08`,
            textAlign: "center",
            minWidth: 90,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: C.purple,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 3,
            }}
          >
            Measured
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: C.purple,
              fontFamily: T.font.sans,
              fontFeatureSettings: "'tnum'",
            }}
          >
            {measured}
          </div>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>{fresh.unit || "EA"}</div>
        </div>

        {/* Arrow */}
        {hasFormula && (
          <>
            <svg width="28" height="12" viewBox="0 0 28 12" style={{ flexShrink: 0 }}>
              <defs>
                <linearGradient id="arrGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={C.purple} stopOpacity="0.4" />
                  <stop offset="100%" stopColor={chainColor} stopOpacity="0.8" />
                </linearGradient>
              </defs>
              <line x1="0" y1="6" x2="20" y2="6" stroke="url(#arrGrad)" strokeWidth="2" />
              <polygon points="20,1 28,6 20,11" fill={chainColor} opacity="0.7" />
            </svg>

            {/* Result block */}
            <div
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                border: `1.5px solid ${chainColor}35`,
                background: `${chainColor}10`,
                textAlign: "center",
                minWidth: 100,
                boxShadow: `0 2px 12px ${chainColor}12`,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: chainColor,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  marginBottom: 3,
                }}
              >
                Result
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: chainColor,
                  fontFamily: T.font.sans,
                  fontFeatureSettings: "'tnum'",
                }}
              >
                {resultRounded}
              </div>
              <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>{fresh.unit || "EA"}</div>
            </div>
          </>
        )}
      </div>

      {/* ── Dimension Cards ───────────────────────────────────── */}
      {/* Always show dimensions section */}
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            marginBottom: 8,
          }}
        >
          Dimensions
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
          {variables.map((v, idx) => (
            <DimensionCard
              key={idx}
              v={v}
              idx={idx}
              C={C}
              updateVariable={updateVariable}
              removeVariable={removeVariable}
            />
          ))}

          {/* Add dimension button */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              style={{
                width: 90,
                minHeight: 86,
                padding: "10px 8px",
                borderRadius: 10,
                border: `1.5px dashed ${C.border}`,
                background: "transparent",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                transition: "all 0.15s",
                color: C.textDim,
              }}
            >
              <Ic d={I.plus} size={18} color={C.textDim} />
              <span style={{ fontSize: 10, fontWeight: 600 }}>Add</span>
            </button>

            {/* Dropdown */}
            {showAddMenu && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  zIndex: 100,
                  marginTop: 4,
                  background: C.bg1,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  boxShadow: T.shadow.lg,
                  padding: 6,
                  minWidth: 160,
                  maxHeight: 280,
                  overflowY: "auto",
                }}
              >
                {DIMENSION_TYPES.map(dt => {
                  const exists = variables.some(v => v.key && v.key.toLowerCase() === dt.key.toLowerCase());
                  const clr = resolveColor(C, dt.colorKey);
                  return (
                    <button
                      key={dt.key}
                      onClick={() => addVariable(dt)}
                      disabled={exists}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "6px 8px",
                        border: "none",
                        borderRadius: 5,
                        background: "transparent",
                        cursor: exists ? "default" : "pointer",
                        opacity: exists ? 0.35 : 1,
                        textAlign: "left",
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={clr}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d={dt.icon} />
                      </svg>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: clr }}>{dt.key}</div>
                        <div style={{ fontSize: 9, color: C.textDim }}>{dt.desc}</div>
                      </div>
                    </button>
                  );
                })}
                <div style={{ height: 1, background: C.border, margin: "4px 0" }} />
                <button
                  onClick={addCustomVariable}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "6px 8px",
                    border: "none",
                    borderRadius: 5,
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  <Ic d={I.plus} size={14} color={C.textDim} />
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.textDim }}>Custom Variable</div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Formula Bar ───────────────────────────────────────── */}
      <div
        style={{
          padding: "10px 14px",
          background: C.bg2,
          borderRadius: 8,
          border: `1px solid ${C.border}`,
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div
            style={{ fontSize: 10, fontWeight: 700, color: C.orange, textTransform: "uppercase", letterSpacing: 0.6 }}
          >
            Formula
          </div>
          <input
            value={formula}
            onChange={e => updateItem(fresh.id, "formula", e.target.value)}
            placeholder="e.g. Qty * Height / 27"
            style={inp(C, {
              flex: 1,
              maxWidth: 400,
              padding: "6px 10px",
              fontSize: 13,
              fontFamily: T.font.sans,
              fontWeight: 500,
              background: C.bg,
              border: `1px solid ${formula ? C.orange + "30" : C.border}`,
              borderRadius: 6,
            })}
          />
          {hasFormula && (
            <button
              onClick={() => {
                updateItem(fresh.id, "formula", "");
              }}
              style={{
                padding: "4px 8px",
                fontSize: 10,
                fontWeight: 600,
                border: `1px solid ${C.border}`,
                background: "transparent",
                color: C.textDim,
                borderRadius: 5,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          )}
        </div>
        <div style={{ fontSize: 10, color: C.textDim, lineHeight: 1.5 }}>
          Use <strong style={{ color: C.purple }}>Qty</strong> for base quantity. Reference dimensions by name. Supports
          + - * / and parentheses.
        </div>
      </div>

      {/* ── Scenario Presets ───────────────────────────────────── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <div
            style={{ fontSize: 10, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.6 }}
          >
            Scenarios
          </div>
          <div style={{ display: "flex", gap: 0, background: C.bg2, borderRadius: 5, padding: 2 }}>
            {scenarioCats.map(cat => (
              <button
                key={cat}
                onClick={() => setScenarioCat(cat)}
                style={{
                  padding: "3px 10px",
                  fontSize: 10,
                  fontWeight: 600,
                  border: "none",
                  borderRadius: 4,
                  background: scenarioCat === cat ? C.accent : "transparent",
                  color: scenarioCat === cat ? "#fff" : C.textMuted,
                  cursor: "pointer",
                  transition: "all 0.1s",
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SCENARIOS.filter(s => s.cat === scenarioCat).map((s, i) => (
            <button
              key={i}
              onClick={() => applyScenario(s)}
              style={{
                padding: "5px 12px",
                fontSize: 11,
                fontWeight: 600,
                border: `1px solid ${C.accent}30`,
                background: `${C.accent}06`,
                color: C.accent,
                borderRadius: 6,
                cursor: "pointer",
                transition: "all 0.1s",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
