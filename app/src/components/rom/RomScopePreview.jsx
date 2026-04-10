import { useMemo, useState } from "react";

const confidenceColor = (conf) => {
  if (conf >= 0.8) return "#22c55e";
  if (conf >= 0.6) return "#f59e0b";
  return "#ef4444";
};

// Infer directive from scope item context
const inferDirective = (si) => {
  const code = si.code || "";
  const div = code.substring(0, 2);
  const desc = (si.description || "").toLowerCase();

  // MEP divisions are almost always subcontracted
  if (["21", "22", "23", "26", "27", "28"].includes(div)) return "F/I by Sub";
  // Equipment = furnish only (vendor delivers)
  if (div === "11" || div === "14") return "F/O";
  // Specialties, furnishings
  if (div === "10" || div === "12") return "F/O";
  // Supply-only keywords
  if (desc.includes("supply only") || desc.includes("owner furnished")) return "F/O";
  // Install-only keywords
  if (desc.includes("install only") || desc.includes("labor only")) return "I/O";
  // Default for GC self-performed trades
  return "F/I";
};

const DIRECTIVE_COLORS = {
  "F/I": "#8b5cf6",
  "F/O": "#f59e0b",
  "I/O": "#06b6d4",
  "F/I by Sub": "#ec4899",
};

export default function RomScopePreview({ scopeItems = [], C, T, onCreateAccount }) {
  const [collapsed, setCollapsed] = useState({});
  const [removedDivisions, setRemovedDivisions] = useState(new Set());

  const { grouped, totalCount, divisionCount, activeCount } = useMemo(() => {
    if (!scopeItems.length) return { grouped: [], totalCount: 0, divisionCount: 0, activeCount: 0 };

    const groups = {};
    for (const si of scopeItems) {
      const div = si.division || "Unassigned";
      if (!groups[div]) groups[div] = [];
      groups[div].push(si);
    }
    const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    const active = sorted.filter(([div]) => !removedDivisions.has(div))
      .reduce((sum, [, items]) => sum + items.length, 0);

    return {
      grouped: sorted,
      totalCount: scopeItems.length,
      divisionCount: Object.keys(groups).length,
      activeCount: active,
    };
  }, [scopeItems, removedDivisions]);

  const toggleDivRemoved = (div) => {
    setRemovedDivisions(prev => {
      const next = new Set(prev);
      next.has(div) ? next.delete(div) : next.add(div);
      return next;
    });
  };

  if (!scopeItems.length) return null;

  return (
    <div
      style={{
        marginTop: 24,
        borderRadius: 10,
        border: `1px solid ${C.border}`,
        background: C.bg2 || C.cardBg || C.bg,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 18px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
          Scope of Work
        </span>
        <span style={{ fontSize: 11, color: C.textDim }}>
          {activeCount} items across {divisionCount - removedDivisions.size} divisions
        </span>
        {removedDivisions.size > 0 && (
          <span style={{ fontSize: 10, color: C.orange, marginLeft: "auto" }}>
            {removedDivisions.size} division{removedDivisions.size !== 1 ? "s" : ""} removed
          </span>
        )}
      </div>

      {/* All items — no blur gate, full scope visible */}
      <div style={{ maxHeight: 600, overflowY: "auto" }}>
        {grouped.map(([div, items]) => {
          const isRemoved = removedDivisions.has(div);
          const isCollapsed = collapsed[div];

          return (
            <div key={div} style={{ opacity: isRemoved ? 0.35 : 1 }}>
              {/* Division header */}
              <div
                style={{
                  padding: "7px 18px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: C.text,
                  background: `${C.accent}06`,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  borderBottom: `1px solid ${C.border}08`,
                  textDecoration: isRemoved ? "line-through" : "none",
                }}
                onClick={() => setCollapsed(c => ({ ...c, [div]: !c[div] }))}
              >
                <span style={{ fontSize: 9, opacity: 0.5 }}>{isCollapsed ? "▶" : "▼"}</span>
                {div}
                <span style={{ fontWeight: 400, color: C.textDim, fontSize: 10 }}>
                  ({items.length} items)
                </span>
                <div style={{ flex: 1 }} />
                {/* Remove/restore division button */}
                <button
                  onClick={e => { e.stopPropagation(); toggleDivRemoved(div); }}
                  style={{
                    fontSize: 9,
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: `1px solid ${isRemoved ? C.green + "40" : C.border}`,
                    background: isRemoved ? `${C.green}12` : "transparent",
                    color: isRemoved ? C.green : C.textDim,
                    cursor: "pointer",
                  }}
                >
                  {isRemoved ? "Restore" : "Remove"}
                </button>
              </div>

              {/* Items */}
              {!isCollapsed && !isRemoved && items.map(si => {
                const directive = inferDirective(si);
                const dirColor = DIRECTIVE_COLORS[directive] || C.textDim;

                return (
                  <div
                    key={si.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 18px",
                      borderBottom: `1px solid ${C.border}08`,
                    }}
                  >
                    {/* Directive badge */}
                    <span
                      style={{
                        fontSize: 8,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 3,
                        background: `${dirColor}15`,
                        color: dirColor,
                        minWidth: 28,
                        textAlign: "center",
                        flexShrink: 0,
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}
                    >
                      {directive}
                    </span>

                    {/* CSI Code */}
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 11,
                        color: C.accent,
                        minWidth: 52,
                        flexShrink: 0,
                      }}
                    >
                      {si.code || "—"}
                    </span>

                    {/* Description */}
                    <span style={{ flex: 1, fontSize: 12, color: C.text }}>
                      {si.description}
                    </span>

                    {/* Confidence */}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "1px 5px",
                        borderRadius: 4,
                        background: `${confidenceColor(si.confidence)}18`,
                        color: confidenceColor(si.confidence),
                        flexShrink: 0,
                      }}
                    >
                      {Math.round((si.confidence || 0) * 100)}%
                    </span>

                    {/* Qty */}
                    <span style={{ fontSize: 11, color: C.textDim, minWidth: 40, textAlign: "right", flexShrink: 0 }}>
                      {si.quantity > 0 ? `${si.quantity} ${si.unit || ""}` : "---"}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* CTA — create account to get full estimate */}
      <div
        style={{
          padding: "12px 18px",
          borderTop: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 11, color: C.textDim, flex: 1 }}>
          Full scope of work included. Create a free account to get a detailed, priced estimate.
        </span>
        <button
          onClick={onCreateAccount}
          style={{
            padding: "7px 16px",
            fontSize: 12,
            fontWeight: 600,
            background: C.accent,
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          Create Detailed Estimate →
        </button>
      </div>
    </div>
  );
}
