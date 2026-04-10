// RomUnifiedTable — Single expandable table: divisions → trades → line items + markups + soft costs
import React, { useState, useMemo } from "react";
import { card, sectionLabel, colHeader } from "@/utils/styles";
import { fmt, fmtSF, ConfidenceDot, ConfidenceBadge } from "./romFormatters";
import { generateTradeScopes } from "@/utils/tradeScopeGenerator";
import { TRADE_COLORS } from "@/constants/tradeGroupings";

// Infer directive from line item context
const inferItemDirective = (item) => {
  const code = item.code || "";
  const div = code.substring(0, 2);
  const desc = (item.description || "").toLowerCase();
  if (["21", "22", "23", "26", "27", "28"].includes(div)) return "F/I by Sub";
  if (div === "11" || div === "14") return "F/O";
  if (div === "10" || div === "12") return "F/O";
  if (desc.includes("supply only") || desc.includes("owner furnished")) return "F/O";
  if (desc.includes("install only") || desc.includes("labor only")) return "I/O";
  return "F/I";
};
const DIR_COLORS = { "F/I": "#8b5cf6", "F/O": "#f59e0b", "I/O": "#06b6d4", "F/I by Sub": "#ec4899" };

export default function RomUnifiedTable({
  C, T,
  divEntries, selectedRange, expandedDivs, toggleDiv,
  subdivisionData, showSubdivisions,
  userOverrides, llmRefinements, validateLlmRefinement,
  editingSub, setEditingSub, editingValue, setEditingValue, setUserOverride,
  getDivisionMultiplier, adjustDivision, resetDivisionAdjustment,
  totals, totalPerSF, grandTotals, grandPerSF,
  markups, editingMarkup, setEditingMarkup, editingMarkupValue, setEditingMarkupValue,
  updateMarkup, addMarkup, removeMarkup, commitMarkupEdit, totalMarkupPct,
  // Soft costs
  softCosts, softCostsExpanded, setSoftCostsExpanded,
  editingSoftCost, setEditingSoftCost, editingSoftCostValue, setEditingSoftCostValue,
  updateSoftCost, addSoftCost, removeSoftCost, commitSoftCostEdit, toggleAllSoftCosts,
  totalSoftCostPct, hasSoftCosts, softCostTotals,
  totalProjectCost, totalProjectPerSF,
  projectSF,
  // Trade scopes
  jobType, rom, divisions, excludedItems, toggleItem,
}) {
  const rangeLabels = { low: "Low", mid: "Mid", high: "High" };
  const [expandedTrades, setExpandedTrades] = useState({});

  // Generate trade scopes grouped by primary CSI division
  const tradeScopesByDiv = useMemo(() => {
    if (!rom || !jobType) return {};
    try {
      const result = generateTradeScopes(jobType, projectSF, {
        floors: rom.floors || 1,
        workType: rom.workType || "",
        romDivisions: divisions,
        scanLineItems: rom.scheduleLineItems || [],
      });
      if (!result?.trades?.length) return {};
      // Group trades by their primary CSI division code
      const grouped = {};
      for (const trade of result.trades) {
        // Find primary division from trade items
        const divCounts = {};
        for (const item of trade.items) {
          const d = (item.division || item.code?.substring(0, 2) || "").padStart(2, "0");
          divCounts[d] = (divCounts[d] || 0) + 1;
        }
        const primaryDiv = Object.entries(divCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "01";
        if (!grouped[primaryDiv]) grouped[primaryDiv] = [];
        grouped[primaryDiv].push(trade);
      }
      return grouped;
    } catch {
      return {};
    }
  }, [rom, jobType, projectSF, divisions]);

  const toggleTrade = (divCode, tradeKey) => {
    setExpandedTrades(prev => {
      const divTrades = new Set(prev[divCode] || []);
      divTrades.has(tradeKey) ? divTrades.delete(tradeKey) : divTrades.add(tradeKey);
      return { ...prev, [divCode]: divTrades };
    });
  };

  // ── Styles ──
  const cellBase = {
    padding: "10px 14px",
    fontFamily: T.font.sans,
    fontSize: T.fontSize.sm,
    borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
    verticalAlign: "middle",
  };
  const headerCell = {
    ...colHeader(C),
    padding: "10px 14px",
    borderBottom: `2px solid ${C.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)"}`,
    whiteSpace: "nowrap",
    textAlign: "left",
  };
  const rightAlign = { textAlign: "right" };
  const colHighlight = range =>
    range === selectedRange ? { color: C.accent, fontWeight: T.fontWeight.bold } : { color: C.textMuted };
  const thinBorder = `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`;

  return (
    <div style={card(C, { padding: 0, marginBottom: T.space[5], overflow: "hidden" })}>
      <div style={{
        padding: `${T.space[4]}px ${T.space[5]}px`,
        borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
      }}>
        <div style={{ ...sectionLabel(C), margin: 0 }}>Cost Breakdown</div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.font.sans, minWidth: 600 }}>
          <thead>
            <tr>
              <th style={headerCell}>Div #</th>
              <th style={{ ...headerCell, width: "30%" }}>Description</th>
              <th style={{ ...headerCell, ...rightAlign, ...(selectedRange === "low" ? { color: C.accent } : {}) }}>$/SF (Low)</th>
              <th style={{ ...headerCell, ...rightAlign, ...(selectedRange === "mid" ? { color: C.accent } : {}) }}>$/SF (Mid)</th>
              <th style={{ ...headerCell, ...rightAlign, ...(selectedRange === "high" ? { color: C.accent } : {}) }}>$/SF (High)</th>
              <th style={{ ...headerCell, ...rightAlign }}>Total ({rangeLabels[selectedRange]})</th>
              <th style={{ ...headerCell, textAlign: "center", fontSize: 9, width: 80 }}>Adjust</th>
            </tr>
          </thead>
          <tbody>
            {/* ═══ Division rows ═══ */}
            {divEntries.map(([divNum, div], i) => {
              const isExpanded = expandedDivs.has(divNum);
              const divTrades = tradeScopesByDiv[divNum] || [];
              const hasTrades = divTrades.length > 0;
              const hasSubdivisions = showSubdivisions && subdivisionData[divNum]?.length > 0;

              return (
                <React.Fragment key={divNum}>
                  {/* Division row */}
                  <tr
                    onClick={() => toggleDiv(divNum)}
                    style={{
                      background: i % 2 === 0 ? "transparent" : C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)",
                      cursor: "pointer",
                      transition: "background 0.1s",
                      opacity: getDivisionMultiplier(divNum) === 0 ? 0.35 : 1,
                      textDecoration: getDivisionMultiplier(divNum) === 0 ? "line-through" : "none",
                    }}
                  >
                    <td style={{ ...cellBase, color: C.textMuted, fontWeight: T.fontWeight.medium }}>
                      <span style={{
                        display: "inline-block", width: 14, fontSize: 10, color: C.textDim,
                        transition: "transform 0.15s", transform: isExpanded ? "rotate(90deg)" : "none",
                      }}>&#9656;</span>
                      {divNum}
                    </td>
                    <td style={{ ...cellBase, color: C.text, fontWeight: T.fontWeight.medium }}>
                      {div.label}
                      <ConfidenceBadge
                        sampleCount={div.sampleCount}
                        confidence={div.confidence}
                        sources={div.sampleSources}
                        C={C}
                      />
                      {hasTrades && (
                        <span style={{ fontSize: 8, color: C.textDim, marginLeft: 6 }}>
                          {divTrades.reduce((s, t) => s + t.itemCount, 0)} items
                        </span>
                      )}
                    </td>
                    <td style={{ ...cellBase, ...rightAlign, ...colHighlight("low"), fontFeatureSettings: "'tnum'" }}>
                      {fmtSF((div.perSF?.low || 0) * getDivisionMultiplier(divNum))}
                    </td>
                    <td style={{ ...cellBase, ...rightAlign, ...colHighlight("mid"), fontFeatureSettings: "'tnum'" }}>
                      {fmtSF((div.perSF?.mid || 0) * getDivisionMultiplier(divNum))}
                    </td>
                    <td style={{ ...cellBase, ...rightAlign, ...colHighlight("high"), fontFeatureSettings: "'tnum'" }}>
                      {fmtSF((div.perSF?.high || 0) * getDivisionMultiplier(divNum))}
                    </td>
                    <td style={{ ...cellBase, ...rightAlign, color: C.text, fontWeight: T.fontWeight.semibold, fontFeatureSettings: "'tnum'" }}>
                      {fmt((div.total?.[selectedRange] || 0) * getDivisionMultiplier(divNum))}
                    </td>
                    <td style={{ ...cellBase, textAlign: "center", padding: "6px 8px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                        {getDivisionMultiplier(divNum) === 0 ? (
                          /* Removed state — show restore button */
                          <button onClick={() => resetDivisionAdjustment(divNum)} style={{
                            fontSize: 9, padding: "3px 10px", borderRadius: 4,
                            border: `1px solid ${C.green}40`, background: `${C.green}12`,
                            color: C.green, cursor: "pointer", fontWeight: 600,
                          }}>Restore</button>
                        ) : (
                          <>
                            <button onClick={() => adjustDivision(divNum, -0.05)} style={{
                              width: 22, height: 22, borderRadius: 4, border: `1px solid ${C.border}`,
                              background: "transparent", color: C.textMuted, cursor: "pointer",
                              fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                              lineHeight: 1, fontFamily: T.font.sans,
                            }}>{"\u2212"}</button>
                            <span style={{
                              fontSize: 10, color: getDivisionMultiplier(divNum) !== 1.0 ? C.accent : C.textDim,
                              fontWeight: getDivisionMultiplier(divNum) !== 1.0 ? 600 : 400,
                              minWidth: 32, textAlign: "center", fontFamily: T.font.sans,
                              cursor: getDivisionMultiplier(divNum) !== 1.0 ? "pointer" : "default",
                            }} onClick={() => getDivisionMultiplier(divNum) !== 1.0 && resetDivisionAdjustment(divNum)}
                              title={getDivisionMultiplier(divNum) !== 1.0 ? "Click to reset" : ""}>
                              {Math.round(getDivisionMultiplier(divNum) * 100)}%
                            </span>
                            <button onClick={() => adjustDivision(divNum, 0.05)} style={{
                              width: 22, height: 22, borderRadius: 4, border: `1px solid ${C.border}`,
                              background: "transparent", color: C.textMuted, cursor: "pointer",
                              fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                              lineHeight: 1, fontFamily: T.font.sans,
                            }}>+</button>
                            {/* Remove division button */}
                            <button onClick={() => {
                              const cur = getDivisionMultiplier(divNum);
                              adjustDivision(divNum, -cur);
                            }} title="Remove this division" style={{
                              width: 22, height: 22, borderRadius: 4, border: `1px solid ${C.border}`,
                              background: "transparent", color: C.red || "#ef4444", cursor: "pointer",
                              fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                              lineHeight: 1, marginLeft: 2,
                            }}>×</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Subdivision rows (Level 1 — same as before) */}
                  {isExpanded && hasSubdivisions &&
                    subdivisionData[divNum].map((sub) => {
                      const isLlm = sub.source === "llm";
                      const isUser = sub.confidence === "user" || !!userOverrides[sub.code];
                      const llmData = llmRefinements[sub.code];
                      const isValidated = llmData?.validated;
                      const subSource = isUser ? "User" : isLlm ? (isValidated ? "LLM \u2713" : "LLM") : "Baseline";
                      const sourceColor = isUser ? C.green : isLlm ? C.accent : C.textDim;
                      const sourceBg = isUser ? "rgba(34,197,94,0.12)" : isLlm ? C.accentBg : "rgba(107,114,128,0.12)";
                      const isEditingThis = editingSub === `${divNum}-${sub.code}`;
                      const divMidPerSF = div.perSF?.mid || 0;

                      return (
                        <tr key={`sub-${divNum}-${sub.code}`} style={{ background: C.accentBg }}>
                          <td style={{ ...cellBase, paddingLeft: 36, color: C.textDim, fontSize: T.fontSize.xs }}>
                            <ConfidenceDot confidence={sub.confidence} />
                            {sub.code}
                            {isLlm && !isUser && (
                              <button
                                onClick={() => validateLlmRefinement(sub.code)}
                                title={isValidated ? "Validated" : "Validate this estimate"}
                                style={{
                                  marginLeft: 4, padding: 0, border: "none", background: "none",
                                  cursor: isValidated ? "default" : "pointer", fontSize: 11,
                                  color: isValidated ? "#22C55E" : C.textDim, opacity: isValidated ? 1 : 0.6,
                                }}
                              >{isValidated ? "\u2714" : "\u2610"}</button>
                            )}
                          </td>
                          <td style={{ ...cellBase, color: C.textMuted, fontSize: T.fontSize.xs }}>
                            <span style={{ marginRight: 6 }}>{sub.label}</span>
                            <span style={{
                              fontSize: 8, fontWeight: 600, padding: "1px 5px", borderRadius: 3,
                              background: sourceBg, color: sourceColor, verticalAlign: "middle",
                            }}>{subSource}</span>
                          </td>
                          <td style={{ ...cellBase, ...rightAlign, ...colHighlight("low"), fontSize: T.fontSize.xs, fontFeatureSettings: "'tnum'" }}>
                            {sub.perSF ? fmtSF(sub.perSF.low) : "\u2014"}
                          </td>
                          <td
                            style={{ ...cellBase, ...rightAlign, ...colHighlight("mid"), fontSize: T.fontSize.xs, fontFeatureSettings: "'tnum'", cursor: "pointer" }}
                            onClick={() => {
                              if (!isEditingThis && sub.perSF) {
                                setEditingSub(`${divNum}-${sub.code}`);
                                setEditingValue(sub.perSF.mid.toFixed(2));
                              }
                            }}
                          >
                            {isEditingThis ? (
                              <input
                                type="number" autoFocus value={editingValue}
                                onChange={e => setEditingValue(e.target.value)}
                                onBlur={() => {
                                  const val = parseFloat(editingValue);
                                  if (!isNaN(val) && val > 0 && divMidPerSF > 0) setUserOverride(sub.code, { pctOfDiv: val / divMidPerSF });
                                  setEditingSub(null); setEditingValue("");
                                }}
                                onKeyDown={e => {
                                  if (e.key === "Enter") e.target.blur();
                                  if (e.key === "Escape") { setEditingSub(null); setEditingValue(""); }
                                }}
                                style={{
                                  width: 60, padding: "2px 4px", fontSize: 11, fontFamily: T.font.sans,
                                  background: C.bg1, color: C.text, border: `1px solid ${C.accent}`,
                                  borderRadius: 4, textAlign: "right", outline: "none",
                                }}
                              />
                            ) : (
                              <span style={{
                                borderBottom: sub.perSF ? `1px dashed ${C.isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}` : "none",
                              }}>
                                {sub.perSF ? fmtSF(sub.perSF.mid) : "\u2014"}
                              </span>
                            )}
                          </td>
                          <td style={{ ...cellBase, ...rightAlign, ...colHighlight("high"), fontSize: T.fontSize.xs, fontFeatureSettings: "'tnum'" }}>
                            {sub.perSF ? fmtSF(sub.perSF.high) : "\u2014"}
                          </td>
                          <td style={{ ...cellBase, ...rightAlign, color: C.textMuted, fontSize: T.fontSize.xs, fontFeatureSettings: "'tnum'" }}>
                            {sub.total ? fmt(sub.total[selectedRange] || sub.total.mid) : "\u2014"}
                          </td>
                          <td style={cellBase} />
                        </tr>
                      );
                    })}

                  {/* Trade rows (Level 1) */}
                  {isExpanded && hasTrades && divTrades.map(trade => {
                    const tradeColor = TRADE_COLORS?.[trade.key] || C.accent;
                    const isTradeExpanded = expandedTrades[divNum]?.has(trade.key);

                    return (
                      <React.Fragment key={`trade-${divNum}-${trade.key}`}>
                        <tr
                          onClick={() => toggleTrade(divNum, trade.key)}
                          style={{
                            background: C.isDark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.012)",
                            cursor: "pointer",
                          }}
                        >
                          <td style={{ ...cellBase, paddingLeft: 36, borderBottom: thinBorder }}>
                            <span style={{
                              display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                              background: tradeColor, marginRight: 4, verticalAlign: "middle",
                            }} />
                          </td>
                          <td style={{ ...cellBase, borderBottom: thinBorder }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{trade.label}</span>
                            <span style={{ fontSize: 9, color: C.textDim, marginLeft: 6 }}>
                              {trade.itemCount} item{trade.itemCount !== 1 ? "s" : ""} · {trade.pctOfTotal}%
                            </span>
                            <svg viewBox="0 0 10 6" fill="none" stroke={C.textDim} strokeWidth="1.5" strokeLinecap="round"
                              style={{ width: 8, height: 5, marginLeft: 6, verticalAlign: "middle",
                                transition: "transform 150ms", transform: isTradeExpanded ? "rotate(180deg)" : "none" }}>
                              <path d="M1 1l4 4 4-4" />
                            </svg>
                          </td>
                          <td style={{ ...cellBase, ...rightAlign, fontSize: 11, color: C.textDim, borderBottom: thinBorder, fontFeatureSettings: "'tnum'" }}>
                            {fmt(trade.costLow)}
                          </td>
                          <td style={{ ...cellBase, ...rightAlign, fontSize: 11, color: C.text, fontWeight: 600, borderBottom: thinBorder, fontFeatureSettings: "'tnum'" }}>
                            {fmt(trade.costMid)}
                          </td>
                          <td style={{ ...cellBase, ...rightAlign, fontSize: 11, color: C.textDim, borderBottom: thinBorder, fontFeatureSettings: "'tnum'" }}>
                            {fmt(trade.costHigh)}
                          </td>
                          <td style={{ ...cellBase, ...rightAlign, fontSize: 11, color: C.text, fontWeight: 500, borderBottom: thinBorder, fontFeatureSettings: "'tnum'" }}>
                            {fmt(trade.costMid)}
                          </td>
                          <td style={{ ...cellBase, borderBottom: thinBorder }} />
                        </tr>

                        {/* Line items (Level 2) */}
                        {isTradeExpanded && trade.items.map((item, idx) => {
                          const isExcluded = excludedItems.has(item.code);
                          return (
                            <tr key={`item-${divNum}-${trade.key}-${idx}`} style={{
                              background: C.isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.008)",
                              opacity: isExcluded ? 0.35 : 1,
                            }}>
                              <td style={{ ...cellBase, paddingLeft: 56, borderBottom: thinBorder }}>
                                <input type="checkbox" checked={!isExcluded} onChange={() => toggleItem(item.code)}
                                  style={{ accentColor: tradeColor, cursor: "pointer", width: 12, height: 12 }} />
                              </td>
                              <td style={{ ...cellBase, fontSize: 10.5, borderBottom: thinBorder, textDecoration: isExcluded ? "line-through" : "none" }}>
                                {(() => { const dir = inferItemDirective(item); const dc = DIR_COLORS[dir] || C.textDim; return (
                                  <span style={{ fontSize: 7.5, fontWeight: 700, padding: "1px 4px", borderRadius: 3, marginRight: 4, background: `${dc}15`, color: dc, fontFamily: "'IBM Plex Mono', monospace" }}>{dir}</span>
                                ); })()}
                                <span style={{ color: C.textDim, marginRight: 4, fontSize: 9 }}>{item.code}</span>
                                <span style={{ color: C.text }}>{item.description}</span>
                                {item._fromDrawings && (
                                  <span style={{ fontSize: 7, fontWeight: 700, padding: "1px 4px", borderRadius: 3, marginLeft: 4, background: `${C.green}18`, color: C.green }}>
                                    FROM DRAWINGS
                                  </span>
                                )}
                                {item.qty != null && (
                                  <span style={{ fontSize: 9, color: C.textDim, marginLeft: 6 }}>
                                    {item.qty.toLocaleString()} {item.unit}
                                  </span>
                                )}
                              </td>
                              <td style={{ ...cellBase, ...rightAlign, fontSize: 10, color: C.textDim, borderBottom: thinBorder, fontFeatureSettings: "'tnum'" }}>
                                {item.lowCost ? fmt(item.lowCost) : "\u2014"}
                              </td>
                              <td style={{ ...cellBase, ...rightAlign, fontSize: 10, color: C.text, borderBottom: thinBorder, fontFeatureSettings: "'tnum'" }}>
                                {item.midCost ? fmt(item.midCost) : "\u2014"}
                              </td>
                              <td style={{ ...cellBase, ...rightAlign, fontSize: 10, color: C.textDim, borderBottom: thinBorder, fontFeatureSettings: "'tnum'" }}>
                                {item.highCost ? fmt(item.highCost) : "\u2014"}
                              </td>
                              <td style={{ ...cellBase, ...rightAlign, fontSize: 10, color: C.textMuted, borderBottom: thinBorder, fontFeatureSettings: "'tnum'" }}>
                                {item.midCost ? fmt(item.midCost) : "\u2014"}
                              </td>
                              <td style={{ ...cellBase, borderBottom: thinBorder }} />
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}

            {/* ═══ Subtotal (Construction) ═══ */}
            <tr style={{
              borderTop: `2px solid ${C.isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
              background: C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
            }}>
              <td style={{ ...cellBase, fontWeight: T.fontWeight.bold, color: C.text }} />
              <td style={{ ...cellBase, fontWeight: T.fontWeight.bold, color: C.text }}>Subtotal (Construction)</td>
              <td style={{ ...cellBase, ...rightAlign, fontWeight: T.fontWeight.bold, ...colHighlight("low"), fontFeatureSettings: "'tnum'" }}>{fmtSF(totalPerSF.low)}</td>
              <td style={{ ...cellBase, ...rightAlign, fontWeight: T.fontWeight.bold, ...colHighlight("mid"), fontFeatureSettings: "'tnum'" }}>{fmtSF(totalPerSF.mid)}</td>
              <td style={{ ...cellBase, ...rightAlign, fontWeight: T.fontWeight.bold, ...colHighlight("high"), fontFeatureSettings: "'tnum'" }}>{fmtSF(totalPerSF.high)}</td>
              <td style={{ ...cellBase, ...rightAlign, fontWeight: T.fontWeight.bold, color: C.text, fontSize: T.fontSize.md, fontFeatureSettings: "'tnum'" }}>{fmt(totals[selectedRange])}</td>
              <td style={cellBase} />
            </tr>

            {/* ═══ Markup rows ═══ */}
            {markups.map(m => {
              const markupAmt = totals[selectedRange] * (m.enabled ? m.pct / 100 : 0);
              const isEditLabel = editingMarkup?.id === m.id && editingMarkup?.field === "label";
              const isEditPct = editingMarkup?.id === m.id && editingMarkup?.field === "pct";

              return (
                <tr key={`mu-${m.id}`} style={{ background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)" }}>
                  <td style={{ ...cellBase, color: C.textDim, borderBottom: thinBorder }}>
                    <button
                      onClick={() => updateMarkup(m.id, "enabled", !m.enabled)}
                      title={m.enabled ? "Disable" : "Enable"}
                      style={{
                        width: 16, height: 16, borderRadius: 4,
                        border: `1px solid ${m.enabled ? C.accent : C.textDim}`,
                        background: m.enabled ? C.accent : "transparent",
                        cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, color: "#fff", lineHeight: 1, padding: 0,
                      }}
                    >{m.enabled ? "\u2713" : ""}</button>
                  </td>
                  <td style={{
                    ...cellBase, color: m.enabled ? C.textMuted : C.textDim, fontSize: T.fontSize.sm,
                    borderBottom: thinBorder, textDecoration: m.enabled ? "none" : "line-through",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {isEditLabel ? (
                        <input autoFocus value={editingMarkupValue}
                          onChange={e => setEditingMarkupValue(e.target.value)}
                          onBlur={commitMarkupEdit}
                          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { setEditingMarkup(null); setEditingMarkupValue(""); } }}
                          style={{
                            flex: 1, padding: "2px 4px", fontSize: 12, fontFamily: T.font.sans,
                            background: C.bg1, color: C.text, border: `1px solid ${C.accent}`, borderRadius: 4, outline: "none",
                          }}
                        />
                      ) : (
                        <span
                          onClick={() => { setEditingMarkup({ id: m.id, field: "label" }); setEditingMarkupValue(m.label); }}
                          style={{ cursor: "pointer", borderBottom: `1px dashed ${C.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"}` }}
                        >{m.label}</span>
                      )}
                      <button onClick={() => removeMarkup(m.id)} title="Remove markup"
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.textDim, fontSize: 12, padding: 0, opacity: 0.5 }}
                      >&times;</button>
                    </div>
                  </td>
                  <td colSpan={3} style={{
                    ...cellBase, textAlign: "center", color: m.enabled ? C.textMuted : C.textDim,
                    fontSize: T.fontSize.sm, fontFeatureSettings: "'tnum'", borderBottom: thinBorder,
                  }}>
                    {isEditPct ? (
                      <input type="number" autoFocus value={editingMarkupValue}
                        onChange={e => setEditingMarkupValue(e.target.value)}
                        onBlur={commitMarkupEdit}
                        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { setEditingMarkup(null); setEditingMarkupValue(""); } }}
                        style={{
                          width: 50, padding: "2px 4px", fontSize: 12, fontFamily: T.font.sans,
                          background: C.bg1, color: C.text, border: `1px solid ${C.accent}`, borderRadius: 4, textAlign: "center", outline: "none",
                        }}
                      />
                    ) : (
                      <span
                        onClick={() => { setEditingMarkup({ id: m.id, field: "pct" }); setEditingMarkupValue(String(m.pct)); }}
                        style={{ cursor: "pointer", borderBottom: `1px dashed ${C.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"}` }}
                      >{m.pct}%</span>
                    )}
                  </td>
                  <td style={{
                    ...cellBase, ...rightAlign, color: m.enabled ? C.text : C.textDim,
                    fontWeight: T.fontWeight.medium, fontFeatureSettings: "'tnum'", fontSize: T.fontSize.sm,
                    borderBottom: thinBorder,
                  }}>
                    {m.enabled ? fmt(markupAmt) : "\u2014"}
                  </td>
                  <td style={{ ...cellBase, borderBottom: thinBorder }} />
                </tr>
              );
            })}

            {/* Add markup button */}
            <tr>
              <td style={{ ...cellBase, borderBottom: "none" }} />
              <td colSpan={4} style={{ ...cellBase, borderBottom: "none" }}>
                <button onClick={addMarkup} style={{
                  background: "none", border: "none", cursor: "pointer", color: C.accent,
                  fontSize: 11, fontWeight: 600, fontFamily: T.font.sans, padding: 0,
                }}>+ Add Markup</button>
              </td>
              <td style={{ ...cellBase, borderBottom: "none" }} />
              <td style={{ ...cellBase, borderBottom: "none" }} />
            </tr>

            {/* ═══ Grand Total (Hard Cost) ═══ */}
            <tr style={{ borderTop: `2px solid ${C.accent}40`, background: C.accentBg }}>
              <td style={{ ...cellBase, fontWeight: T.fontWeight.bold, color: C.text, borderBottom: "none" }} />
              <td style={{ ...cellBase, fontWeight: T.fontWeight.bold, color: C.text, borderBottom: "none", fontSize: T.fontSize.md }}>Grand Total</td>
              <td style={{ ...cellBase, ...rightAlign, fontWeight: T.fontWeight.bold, ...colHighlight("low"), borderBottom: "none", fontFeatureSettings: "'tnum'" }}>{fmtSF(grandPerSF.low)}</td>
              <td style={{ ...cellBase, ...rightAlign, fontWeight: T.fontWeight.bold, ...colHighlight("mid"), borderBottom: "none", fontFeatureSettings: "'tnum'" }}>{fmtSF(grandPerSF.mid)}</td>
              <td style={{ ...cellBase, ...rightAlign, fontWeight: T.fontWeight.bold, ...colHighlight("high"), borderBottom: "none", fontFeatureSettings: "'tnum'" }}>{fmtSF(grandPerSF.high)}</td>
              <td style={{
                ...cellBase, ...rightAlign, fontWeight: T.fontWeight.bold, borderBottom: "none",
                fontSize: T.fontSize.lg, fontFeatureSettings: "'tnum'",
                background: C.gradient || C.accent, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>{fmt(grandTotals[selectedRange])}</td>
              <td style={{ ...cellBase, borderBottom: "none" }} />
            </tr>

            {/* ═══ Soft Costs section ═══ */}
            <tr
              onClick={() => setSoftCostsExpanded(!softCostsExpanded)}
              style={{
                borderTop: `1px solid ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
                cursor: "pointer",
                background: C.isDark ? "rgba(255,149,0,0.03)" : "rgba(255,149,0,0.02)",
              }}
            >
              <td style={{ ...cellBase }}>
                <span style={{
                  display: "inline-block", fontSize: 10, color: C.textDim,
                  transition: "transform 0.15s", transform: softCostsExpanded ? "rotate(90deg)" : "none",
                }}>&#9656;</span>
              </td>
              <td colSpan={4} style={{ ...cellBase, fontWeight: T.fontWeight.bold, color: C.text }}>
                Soft Costs
                {hasSoftCosts && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, marginLeft: 8,
                    background: C.isDark ? "rgba(255,149,0,0.12)" : "rgba(255,149,0,0.08)", color: "#FF9500",
                  }}>
                    {totalSoftCostPct.toFixed(1)}%
                  </span>
                )}
                <span style={{ marginLeft: 8 }} onClick={e => { e.stopPropagation(); toggleAllSoftCosts(!hasSoftCosts); setSoftCostsExpanded(true); }}>
                  <button style={{
                    padding: "2px 10px", borderRadius: 4, fontSize: 9, fontWeight: 600, cursor: "pointer",
                    background: hasSoftCosts ? "rgba(255,149,0,0.12)" : `${C.textDim}10`,
                    border: `1px solid ${hasSoftCosts ? "rgba(255,149,0,0.25)" : C.border}`,
                    color: hasSoftCosts ? "#FF9500" : C.textMuted, fontFamily: T.font.sans,
                  }}>{hasSoftCosts ? "Disable All" : "Enable All"}</button>
                </span>
              </td>
              <td style={{ ...cellBase, ...rightAlign, fontWeight: T.fontWeight.semibold, color: "#FF9500", fontFeatureSettings: "'tnum'" }}>
                {hasSoftCosts ? fmt(softCostTotals[selectedRange]) : "\u2014"}
              </td>
              <td style={cellBase} />
            </tr>

            {softCostsExpanded && softCosts.map(sc => {
              const scAmt = grandTotals[selectedRange] * (sc.enabled ? sc.pct / 100 : 0);
              const scPerSF = projectSF > 0 ? scAmt / projectSF : 0;
              const isEditLabel = editingSoftCost?.id === sc.id && editingSoftCost?.field === "label";
              const isEditPct = editingSoftCost?.id === sc.id && editingSoftCost?.field === "pct";

              return (
                <tr key={`sc-${sc.id}`} style={{ background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)" }}>
                  <td style={{ ...cellBase, borderBottom: thinBorder }}>
                    <button
                      onClick={() => updateSoftCost(sc.id, "enabled", !sc.enabled)}
                      title={sc.enabled ? "Disable" : "Enable"}
                      style={{
                        width: 16, height: 16, borderRadius: 4,
                        border: `1px solid ${sc.enabled ? "#FF9500" : C.textDim}`,
                        background: sc.enabled ? "#FF9500" : "transparent",
                        cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, color: "#fff", lineHeight: 1, padding: 0,
                      }}
                    >{sc.enabled ? "\u2713" : ""}</button>
                  </td>
                  <td style={{
                    ...cellBase, color: sc.enabled ? C.text : C.textDim, fontSize: T.fontSize.sm,
                    borderBottom: thinBorder, textDecoration: sc.enabled ? "none" : "line-through", opacity: sc.enabled ? 1 : 0.6,
                    paddingLeft: 36,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {isEditLabel ? (
                        <input autoFocus value={editingSoftCostValue}
                          onChange={e => setEditingSoftCostValue(e.target.value)}
                          onBlur={commitSoftCostEdit}
                          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { setEditingSoftCost(null); setEditingSoftCostValue(""); } }}
                          style={{
                            flex: 1, padding: "2px 4px", fontSize: 12, fontFamily: T.font.sans,
                            background: C.bg1, color: C.text, border: `1px solid #FF9500`, borderRadius: 4, outline: "none",
                          }}
                        />
                      ) : (
                        <span
                          onClick={() => { setEditingSoftCost({ id: sc.id, field: "label" }); setEditingSoftCostValue(sc.label); }}
                          style={{ cursor: "pointer", borderBottom: `1px dashed ${C.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"}` }}
                        >{sc.label}</span>
                      )}
                      <button onClick={() => removeSoftCost(sc.id)} title="Remove"
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.textDim, fontSize: 12, padding: 0, opacity: 0.5 }}
                      >&times;</button>
                    </div>
                    {sc.note && <div style={{ fontSize: 9, color: C.textDim, marginTop: 2 }}>{sc.note}</div>}
                  </td>
                  <td colSpan={3} style={{
                    ...cellBase, textAlign: "center", color: sc.enabled ? C.text : C.textDim,
                    fontSize: T.fontSize.sm, fontFeatureSettings: "'tnum'", borderBottom: thinBorder,
                  }}>
                    {isEditPct ? (
                      <input type="number" autoFocus value={editingSoftCostValue}
                        onChange={e => setEditingSoftCostValue(e.target.value)}
                        onBlur={commitSoftCostEdit}
                        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { setEditingSoftCost(null); setEditingSoftCostValue(""); } }}
                        style={{
                          width: 50, padding: "2px 4px", fontSize: 12, fontFamily: T.font.sans,
                          background: C.bg1, color: C.text, border: `1px solid #FF9500`, borderRadius: 4, textAlign: "center", outline: "none",
                        }}
                      />
                    ) : (
                      <span
                        onClick={() => { setEditingSoftCost({ id: sc.id, field: "pct" }); setEditingSoftCostValue(String(sc.pct)); }}
                        style={{ cursor: "pointer", borderBottom: `1px dashed ${C.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"}` }}
                      >{sc.pct}%</span>
                    )}
                  </td>
                  <td style={{
                    ...cellBase, ...rightAlign, color: sc.enabled ? C.text : C.textDim,
                    fontWeight: T.fontWeight.medium, fontFeatureSettings: "'tnum'", fontSize: T.fontSize.sm,
                    borderBottom: thinBorder,
                  }}>
                    {sc.enabled ? fmt(scAmt) : "\u2014"}
                  </td>
                  <td style={{ ...cellBase, borderBottom: thinBorder }} />
                </tr>
              );
            })}

            {/* Add soft cost button */}
            {softCostsExpanded && (
              <tr>
                <td style={{ ...cellBase, borderBottom: "none" }} />
                <td colSpan={4} style={{ ...cellBase, borderBottom: "none", paddingLeft: 36 }}>
                  <button onClick={addSoftCost} style={{
                    background: "none", border: "none", cursor: "pointer", color: "#FF9500",
                    fontSize: 11, fontWeight: 600, fontFamily: T.font.sans, padding: 0,
                  }}>+ Add Soft Cost</button>
                </td>
                <td style={{ ...cellBase, borderBottom: "none" }} />
                <td style={{ ...cellBase, borderBottom: "none" }} />
              </tr>
            )}

            {/* ═══ Total Project Cost (Hard + Soft) ═══ */}
            {hasSoftCosts && (
              <tr style={{ borderTop: `2px solid ${C.accent}40`, background: C.accentBg }}>
                <td style={{ ...cellBase, borderBottom: "none" }} />
                <td style={{ ...cellBase, fontWeight: T.fontWeight.bold, color: C.text, borderBottom: "none", fontSize: T.fontSize.md }}>Total Project Cost</td>
                <td style={{ ...cellBase, ...rightAlign, fontWeight: T.fontWeight.bold, ...colHighlight("low"), borderBottom: "none", fontFeatureSettings: "'tnum'" }}>
                  {fmtSF(totalProjectPerSF.low)}
                </td>
                <td style={{ ...cellBase, ...rightAlign, fontWeight: T.fontWeight.bold, ...colHighlight("mid"), borderBottom: "none", fontFeatureSettings: "'tnum'" }}>
                  {fmtSF(totalProjectPerSF.mid)}
                </td>
                <td style={{ ...cellBase, ...rightAlign, fontWeight: T.fontWeight.bold, ...colHighlight("high"), borderBottom: "none", fontFeatureSettings: "'tnum'" }}>
                  {fmtSF(totalProjectPerSF.high)}
                </td>
                <td style={{
                  ...cellBase, ...rightAlign, fontWeight: T.fontWeight.bold, borderBottom: "none",
                  fontSize: T.fontSize.lg, fontFeatureSettings: "'tnum'",
                  background: C.gradient || C.accent, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                }}>{fmt(totalProjectCost[selectedRange])}</td>
                <td style={{ ...cellBase, borderBottom: "none" }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
