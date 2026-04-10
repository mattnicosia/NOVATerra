import { useMemo, useState } from "react";
import { generateScopeTemplate } from "@/constants/scopeTemplates";

const confidenceColor = (conf) => {
  if (conf >= 0.8) return "#22c55e";
  if (conf >= 0.6) return "#f59e0b";
  return "#ef4444";
};

// Infer directive from item context
const inferDirective = (si) => {
  const code = si.code || "";
  const div = code.substring(0, 2);
  const desc = (si.description || "").toLowerCase();
  if (["21", "22", "23", "26", "27", "28"].includes(div)) return "F/I by Sub";
  if (div === "11" || div === "14") return "F/O";
  if (div === "10" || div === "12") return "F/O";
  if (desc.includes("supply only") || desc.includes("owner furnished")) return "F/O";
  if (desc.includes("install only") || desc.includes("labor only")) return "I/O";
  return "F/I";
};

const DIRECTIVE_COLORS = {
  "F/I": "#8b5cf6",
  "F/O": "#f59e0b",
  "I/O": "#06b6d4",
  "F/I by Sub": "#ec4899",
};

const DIV_LABELS = {
  "01": "01 - General Requirements", "02": "02 - Existing Conditions", "03": "03 - Concrete",
  "04": "04 - Masonry", "05": "05 - Metals", "06": "06 - Wood & Plastics",
  "07": "07 - Thermal & Moisture", "08": "08 - Openings", "09": "09 - Finishes",
  "10": "10 - Specialties", "11": "11 - Equipment", "12": "12 - Furnishings",
  "13": "13 - Special Construction", "14": "14 - Conveying Equipment",
  "21": "21 - Fire Suppression", "22": "22 - Plumbing", "23": "23 - HVAC",
  "26": "26 - Electrical", "27": "27 - Communications", "28": "28 - Electronic Safety",
  "31": "31 - Earthwork", "32": "32 - Exterior Improvements", "33": "33 - Utilities",
};

const fmtCost = n => {
  if (!n && n !== 0) return "—";
  return "$" + Math.round(n).toLocaleString();
};

export default function RomScopePreview({ rom, scopeItems = [], C, T, onCreateAccount }) {
  const [collapsed, setCollapsed] = useState({});
  const [removedDivisions, setRemovedDivisions] = useState(new Set());

  // Generate full scope of work from template engine + merge schedule-detected items
  const { grouped, totalCount, divisionCount, activeCount } = useMemo(() => {
    const jobType = rom?.buildingType || rom?.jobType || "commercial-office";
    const sf = rom?.projectSF || 2000;
    const floors = rom?.floors || rom?.buildingParams?.floorCount || 1;

    // Build set of excluded divisions from wizard scope exclusions + zeroed ROM divisions
    const excludedDivs = new Set();
    // From wizard scopeExclusions (e.g. "demolition" -> div "02")
    const SCOPE_TO_DIVS = {
      demolition: ["02"], sitework: ["31"], sitedemo: ["31"], asbestos: ["02"],
      kitchenequip: ["11"], av: ["27"], security: ["28"], windowtreatments: ["12"],
      furniture: ["12"], signage: ["10"], landscaping: ["32"], lowvoltage: ["27"],
      fireprotection: ["21"], elevator: ["14"],
    };
    if (rom?.scopeExclusions?.length) {
      for (const ex of rom.scopeExclusions) {
        (SCOPE_TO_DIVS[ex] || []).forEach(d => excludedDivs.add(d));
      }
    }
    // Also check ROM divisions for excluded or zeroed ones
    if (rom?.divisions) {
      for (const [code, div] of Object.entries(rom.divisions)) {
        if (div.excluded || (div.total?.mid === 0 && div.total?.low === 0 && div.total?.high === 0)) {
          excludedDivs.add(code);
        }
      }
    }

    // Generate full template for all trades
    let allItems = [];
    try {
      const tpl = generateScopeTemplate(jobType, sf, { floors, workType: rom?.workType || "" });
      if (tpl?.items?.length) {
        allItems = tpl.items
          .filter(item => !excludedDivs.has(item.division))
          .map((item, i) => ({
            id: `tpl_${i}`,
            code: item.code || "",
            description: item.description || "",
            division: DIV_LABELS[item.division] || `${item.division} - Unknown`,
            divCode: item.division,
            quantity: item.qty || 0,
            unit: item.unit || "",
            confidence: 0.7, // template baseline
            source: "template",
            midCost: item.midCost || 0,
            lowCost: item.lowCost || 0,
            highCost: item.highCost || 0,
            note: item.note || null,
          }));
      }
    } catch (e) {
      console.warn("[RomScopePreview] Template generation failed:", e.message);
    }

    // Merge in schedule-detected items (higher confidence, replace matching codes)
    if (scopeItems?.length) {
      const tplCodes = new Set(allItems.map(it => it.code.replace(/\s/g, "")));
      for (const si of scopeItems) {
        const normCode = (si.code || "").replace(/\s/g, "");
        if (tplCodes.has(normCode)) {
          // Replace template item with schedule-detected one
          const idx = allItems.findIndex(it => it.code.replace(/\s/g, "") === normCode);
          if (idx >= 0) {
            allItems[idx] = {
              ...allItems[idx],
              ...si,
              division: allItems[idx].division, // keep the labeled division
              confidence: si.confidence || 0.9,
              source: "schedule",
            };
          }
        } else {
          // Add new schedule item not in template
          const divCode = (si.code || "").substring(0, 2).replace(/\s/g, "");
          allItems.push({
            ...si,
            id: si.id || `scan_${allItems.length}`,
            division: DIV_LABELS[divCode] || si.division || "Unassigned",
            divCode,
            confidence: si.confidence || 0.9,
            source: "schedule",
          });
        }
      }
    }

    if (!allItems.length) return { grouped: [], totalCount: 0, divisionCount: 0, activeCount: 0 };

    // Group by division
    const groups = {};
    for (const si of allItems) {
      const div = si.division || "Unassigned";
      if (!groups[div]) groups[div] = [];
      groups[div].push(si);
    }
    const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    const active = sorted.filter(([div]) => !removedDivisions.has(div))
      .reduce((sum, [, items]) => sum + items.length, 0);

    return {
      grouped: sorted,
      totalCount: allItems.length,
      divisionCount: Object.keys(groups).length,
      activeCount: active,
    };
  }, [rom, scopeItems, removedDivisions]);

  const toggleDivRemoved = (div) => {
    setRemovedDivisions(prev => {
      const next = new Set(prev);
      next.has(div) ? next.delete(div) : next.add(div);
      return next;
    });
  };

  if (!grouped.length) return null;

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

      {/* All items — full scope visible */}
      <div style={{ maxHeight: 600, overflowY: "auto" }}>
        {grouped.map(([div, items]) => {
          const isRemoved = removedDivisions.has(div);
          const isCollapsed = collapsed[div];
          const divMidTotal = items.reduce((s, it) => s + (it.midCost || 0), 0);

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
                <span style={{ fontSize: 9, opacity: 0.5 }}>{isCollapsed ? "\u25B6" : "\u25BC"}</span>
                {div}
                <span style={{ fontWeight: 400, color: C.textDim, fontSize: 10 }}>
                  ({items.length} items)
                </span>
                <div style={{ flex: 1 }} />
                {!isRemoved && divMidTotal > 0 && (
                  <span style={{ fontSize: 10, color: C.textDim, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {fmtCost(divMidTotal)}
                  </span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); toggleDivRemoved(div); }}
                  style={{
                    fontSize: 9,
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: `1px solid ${isRemoved ? (C.green || "#22c55e") + "40" : C.border}`,
                    background: isRemoved ? `${C.green || "#22c55e"}12` : "transparent",
                    color: isRemoved ? (C.green || "#22c55e") : C.textDim,
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
                      gap: 6,
                      padding: "4px 18px",
                      borderBottom: `1px solid ${C.border}06`,
                    }}
                  >
                    {/* Directive badge */}
                    <span
                      style={{
                        fontSize: 7.5,
                        fontWeight: 700,
                        padding: "1px 4px",
                        borderRadius: 3,
                        background: `${dirColor}15`,
                        color: dirColor,
                        minWidth: 30,
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
                        fontSize: 10,
                        color: C.accent,
                        minWidth: 56,
                        flexShrink: 0,
                      }}
                    >
                      {si.code || "\u2014"}
                    </span>

                    {/* Description */}
                    <span style={{
                      flex: 1, fontSize: 11.5, color: C.text,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {si.description}
                      {si.source === "schedule" && (
                        <span style={{
                          fontSize: 7, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
                          marginLeft: 4, background: `${C.green || "#22c55e"}18`, color: C.green || "#22c55e",
                        }}>
                          FROM DRAWINGS
                        </span>
                      )}
                    </span>

                    {/* Qty */}
                    <span style={{ fontSize: 10, color: C.textDim, minWidth: 55, textAlign: "right", flexShrink: 0 }}>
                      {si.quantity > 0 ? `${si.quantity.toLocaleString()} ${si.unit || ""}` : "\u2014"}
                    </span>

                    {/* Mid cost */}
                    {si.midCost > 0 && (
                      <span style={{
                        fontSize: 10, color: C.textDim, minWidth: 60, textAlign: "right", flexShrink: 0,
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}>
                        {fmtCost(si.midCost)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* CTA */}
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
          Create Detailed Estimate \u2192
        </button>
      </div>
    </div>
  );
}
