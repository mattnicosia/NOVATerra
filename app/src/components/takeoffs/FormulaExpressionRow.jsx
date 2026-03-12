// ═══════════════════════════════════════════════════════════════════════════
// FormulaExpressionRow — inline formula expression with tappable variable edit
// Shows "142 LF × 8' = 1,136 SF" below a takeoff row when a formula is active
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from "react";

const fmt = (n) => {
  if (n === null || n === undefined) return "—";
  const v = Math.round(n * 100) / 100;
  return v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(v);
};

function InlineVarInput({ variable, index, takeoff, updateTakeoff, C, T }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(variable.value));
  const inputRef = useRef(null);

  const key = (variable.key || "").toLowerCase();
  const unitSuffix = key === "height" || key === "width" || key === "length" ? "'"
    : key === "depth" || key === "thickness" ? '"'
    : key === "waste" || key === "laps" ? "%"
    : key === "coats" ? "×"
    : "";

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.select();
    }
  }, [editing]);

  const save = () => {
    const vars = [...(takeoff.variables || [])];
    vars[index] = { ...vars[index], value: val };
    updateTakeoff(takeoff.id, "variables", vars);
    setEditing(false);
  };

  if (!editing) {
    return (
      <span
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        style={{
          cursor: "pointer",
          fontWeight: 600,
          color: C.accent,
          padding: "0 2px",
          borderRadius: 3,
          borderBottom: `1px dashed ${C.accent}50`,
          transition: T.transition.fast,
        }}
        title={`Click to edit ${variable.key || "variable"}`}
      >
        {variable.value}{unitSuffix}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="number"
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={save}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === "Enter") { e.target.blur(); }
        if (e.key === "Escape") { setVal(String(variable.value)); setEditing(false); }
      }}
      onClick={e => e.stopPropagation()}
      style={{
        width: 36,
        padding: "1px 3px",
        fontSize: 10,
        fontWeight: 600,
        fontFamily: "inherit",
        textAlign: "center",
        color: C.accent,
        background: C.bg2,
        border: `1px solid ${C.accent}50`,
        borderRadius: 3,
        outline: "none",
      }}
    />
  );
}

export default function FormulaExpressionRow({ takeoff, measuredQty, computedQty, updateTakeoff, C, T }) {
  const vars = takeoff.variables || [];
  if (!vars.length || computedQty === null || measuredQty === null) return null;

  // Determine if the formula is a simple multiplication chain (most common: Qty * Height)
  // If so, show each variable as an inline × factor
  // For complex formulas (division, coverage), show the formula text + result
  const formula = (takeoff.formula || "").trim();
  const isSimpleMultiply = formula && /^Qty(\s*\*\s*\w+)+$/i.test(formula);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 8px 3px 27px",
        fontSize: 10,
        color: C.textDim,
        borderLeft: `2px solid ${C.accent}25`,
        background: `${C.accent}04`,
        lineHeight: 1.4,
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Measured quantity */}
      <span style={{ fontWeight: 600, color: C.purple || C.accent }}>
        {fmt(measuredQty)}
      </span>
      <span style={{ fontSize: 8, opacity: 0.7 }}>{takeoff.unit}</span>

      {/* Variable multipliers — each tappable for inline edit */}
      {isSimpleMultiply ? (
        vars.map((v, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 9, opacity: 0.5 }}>×</span>
            <InlineVarInput
              variable={v}
              index={i}
              takeoff={takeoff}
              updateTakeoff={updateTakeoff}
              C={C}
              T={T}
            />
          </span>
        ))
      ) : (
        <span style={{ fontSize: 9, fontStyle: "italic", opacity: 0.6 }}>
          {formula}
        </span>
      )}

      {/* Result */}
      <span style={{ fontSize: 9, opacity: 0.5 }}>=</span>
      <span style={{ fontWeight: 700, color: C.accent }}>
        {fmt(computedQty)}
      </span>
    </div>
  );
}
