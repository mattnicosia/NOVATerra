// ModuleSpecsForm — Spec input forms (single-instance and multi-instance with accordion)
// Extracted from ModulePanel.jsx
import { useState, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { inp } from "@/utils/styles";
import { evalCondition } from "@/utils/moduleCalc";

/**
 * Renders a simple specs form for single-instance categories.
 */
export function SingleSpecsForm({ specs, specValues, onSpecChange }) {
  const C = useTheme();

  if (!specs || specs.length === 0) return null;

  return (
    <div
      style={{
        margin: "4px 8px",
        padding: "6px 8px",
        background: C.bg2,
        borderRadius: 5,
        display: "flex",
        gap: 4,
        flexWrap: "wrap",
      }}
    >
      {specs.map(spec => (
        <div
          key={spec.id}
          style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 72, flex: "1 1 72px", maxWidth: 120 }}
        >
          <label
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: C.textMuted,
              textTransform: "uppercase",
              letterSpacing: 0.3,
            }}
          >
            {spec.label} {spec.unit && <span style={{ color: C.textDimmer }}>({spec.unit})</span>}
          </label>
          {spec.type === "number" ? (
            <input
              type="number"
              value={specValues ? (specValues[spec.id] ?? spec.default) : spec.default}
              onChange={e => onSpecChange(spec.id, e.target.value)}
              min={spec.min}
              max={spec.max}
              step={spec.step || 1}
              style={inp(C, {
                padding: "2px 3px",
                fontSize: 10,
                background: C.bg1,
                border: `1px solid ${C.border}`,
                borderRadius: 3,
                width: "100%",
              })}
            />
          ) : (
            <select
              value={specValues ? (specValues[spec.id] ?? spec.default) : spec.default}
              onChange={e => onSpecChange(spec.id, e.target.value)}
              style={inp(C, {
                padding: "2px 3px",
                fontSize: 10,
                background: C.bg1,
                border: `1px solid ${C.border}`,
                borderRadius: 3,
                width: "100%",
                cursor: "pointer",
              })}
            >
              {spec.options.map(opt => (
                <option key={opt} value={opt}>
                  {spec.displayMap?.[opt] || opt}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Renders the instance specs form with condition filtering, templates, and spec group accordion.
 */
export function InstanceSpecsForm({ specs, catId, catInst, templates, onSpecChange }) {
  const C = useTheme();

  const [collapsedSpecGroups, setCollapsedSpecGroups] = useState(new Set());
  const toggleSpecGroup = useCallback(groupKey => {
    setCollapsedSpecGroups(prev => {
      const next = new Set(prev);
      next.has(groupKey) ? next.delete(groupKey) : next.add(groupKey);
      return next;
    });
  }, []);

  if (!specs || specs.length === 0) return null;

  // Build context from instance specs for condition evaluation
  const specCtx = { ...catInst.specs };
  specs.forEach(s => {
    if (specCtx[s.id] === undefined) specCtx[s.id] = s.default;
  });

  const materialSpec = specs.find(s => s.id === "Material");
  const restSpecs = specs.filter(s => s.id !== "Material");

  const applyTemplate = template => {
    Object.entries(template.specs).forEach(([k, v]) => {
      onSpecChange(catId, catInst.id, k, v);
    });
  };

  const renderSpec = spec => (
    <div
      key={spec.id}
      style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 72, flex: "1 1 72px", maxWidth: 120 }}
    >
      <label
        style={{ fontSize: 8, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.3 }}
      >
        {spec.label} {spec.unit && <span style={{ color: C.textDimmer }}>({spec.unit})</span>}
      </label>
      {spec.type === "number" ? (
        <input
          type="number"
          value={catInst.specs?.[spec.id] ?? spec.default}
          onChange={e => onSpecChange(catId, catInst.id, spec.id, e.target.value)}
          min={spec.min}
          max={spec.max}
          step={spec.step || 1}
          style={inp(C, {
            padding: "2px 3px",
            fontSize: 10,
            background: C.bg1,
            border: `1px solid ${C.border}`,
            borderRadius: 3,
            width: "100%",
          })}
        />
      ) : (
        <select
          value={catInst.specs?.[spec.id] ?? spec.default}
          onChange={e => onSpecChange(catId, catInst.id, spec.id, e.target.value)}
          style={inp(C, {
            padding: "2px 3px",
            fontSize: 10,
            background: C.bg1,
            border: `1px solid ${C.border}`,
            borderRadius: 3,
            width: "100%",
            cursor: "pointer",
          })}
        >
          {spec.options.map(opt => (
            <option key={opt} value={opt}>
              {spec.displayMap?.[opt] || opt}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  return (
    <div style={{ margin: "4px 8px" }}>
      {/* Quick-start template pills */}
      {templates && templates.length > 0 && (
        <div
          style={{
            padding: "5px 8px",
            background: `linear-gradient(135deg, ${C.bg2}, ${C.bg1})`,
            borderRadius: "5px 5px 0 0",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            gap: 4,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{ fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}
          >
            Quick Start
          </span>
          {templates.map((tmpl, ti) => (
            <button
              key={ti}
              onClick={() => applyTemplate(tmpl)}
              style={{
                padding: "3px 8px",
                fontSize: 9,
                fontWeight: 600,
                border: `1px solid ${C.accent}30`,
                background: C.bg1,
                color: C.text,
                borderRadius: 10,
                cursor: "pointer",
                transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = C.accent + "15";
                e.currentTarget.style.borderColor = C.accent;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = C.bg1;
                e.currentTarget.style.borderColor = C.accent + "30";
              }}
            >
              {tmpl.label}
            </button>
          ))}
        </div>
      )}
      {materialSpec && (
        <div
          style={{
            padding: "6px 8px",
            background: C.bg2,
            borderRadius: templates?.length ? 0 : "5px 5px 0 0",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            gap: 4,
          }}
        >
          {renderSpec(materialSpec)}
        </div>
      )}
      {(() => {
        const visibleSpecs = restSpecs.filter(s => !s.condition || evalCondition(s.condition, specCtx));
        const getGroup = spec => {
          if (spec.specGroup) return spec.specGroup;
          const id = spec.id;
          if (id.startsWith("Dw")) return "Drywall";
          if (id.startsWith("Sheath") || id === "WrbType" || id === "MSSheathing" || id.includes("Sheathing"))
            return "Sheathing";
          if (id.startsWith("Insul") || id.includes("Insul") || id === "WrbType") return "Insulation & WRB";
          if (
            id.startsWith("Roof") &&
            (id.includes("Finish") ||
              id.includes("Underlayment") ||
              id.includes("Flashing") ||
              id.includes("RidgeVent"))
          )
            return "Roofing Finish";
          if (id === "ShingleStyle" || id === "MetalPanWidth" || id === "TPOThickness") return "Roofing Finish";
          return "Structure";
        };
        const groups = [];
        const groupMap = {};
        visibleSpecs.forEach(s => {
          const g = getGroup(s);
          if (!groupMap[g]) {
            groupMap[g] = [];
            groups.push(g);
          }
          groupMap[g].push(s);
        });
        if (groups.length <= 1) {
          return (
            <div
              style={{
                padding: "6px 8px",
                background: C.bg2,
                borderRadius: materialSpec ? "0 0 5px 5px" : 5,
                display: "flex",
                gap: 4,
                flexWrap: "wrap",
              }}
            >
              {visibleSpecs.map(spec => renderSpec(spec))}
            </div>
          );
        }
        return groups.map((g, gi) => {
          const groupKey = `${catId}-${catInst.id}-${g}`;
          const isCollapsed = collapsedSpecGroups.has(groupKey);
          const isLast = gi === groups.length - 1;
          const customized = groupMap[g].filter(s => {
            const val = catInst.specs?.[s.id];
            return val !== undefined && val !== s.default;
          }).length;
          return (
            <div key={g}>
              <div
                onClick={() => toggleSpecGroup(groupKey)}
                style={{
                  padding: "4px 8px",
                  background: C.bg2,
                  borderBottom: isCollapsed && !isLast ? `1px solid ${C.border}` : "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="none"
                  stroke={C.textDim}
                  strokeWidth="1.5"
                  style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)", transition: "transform 0.15s" }}
                >
                  <path d="M2 1l3 3-3 3" />
                </svg>
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: C.textDim,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {g}
                </span>
                {customized > 0 && (
                  <span style={{ fontSize: 7, color: C.accent, fontWeight: 600 }}>({customized} customized)</span>
                )}
              </div>
              {!isCollapsed && (
                <div
                  style={{
                    padding: "6px 8px",
                    background: C.bg2,
                    borderRadius: isLast ? "0 0 5px 5px" : 0,
                    display: "flex",
                    gap: 4,
                    flexWrap: "wrap",
                    borderBottom: !isLast ? `1px solid ${C.border}20` : "none",
                  }}
                >
                  {groupMap[g].map(spec => renderSpec(spec))}
                </div>
              )}
            </div>
          );
        });
      })()}
    </div>
  );
}
