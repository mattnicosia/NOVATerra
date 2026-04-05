// RomDivisionTable — Division breakdown table with subdivision drill-down and markups
import React from "react";
import { card, sectionLabel, colHeader } from "@/utils/styles";
import { fmt, fmtSF, ConfidenceDot } from "./romFormatters";

export default function RomDivisionTable({
  C, T,
  divEntries, selectedRange, expandedDivs, toggleDiv,
  subdivisionData, showSubdivisions,
  userOverrides, llmRefinements, validateLlmRefinement,
  editingSub, setEditingSub, editingValue, setEditingValue, setUserOverride,
  getDivisionMultiplier, adjustDivision, resetDivisionAdjustment,
  totals, totalPerSF, grandTotals, grandPerSF,
  markups, editingMarkup, setEditingMarkup, editingMarkupValue, setEditingMarkupValue,
  updateMarkup, addMarkup, removeMarkup, commitMarkupEdit,
  totalMarkupPct,
}) {
  const rangeLabels = { low: "Low", mid: "Mid", high: "High" };

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

  return (
    <div style={card(C, { padding: 0, marginBottom: T.space[5], overflow: "hidden" })}>
      <div
        style={{
          padding: `${T.space[4]}px ${T.space[5]}px`,
          borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
        }}
      >
        <div style={{ ...sectionLabel(C), margin: 0 }}>Division Breakdown</div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.font.sans, minWidth: 600 }}>
          <thead>
            <tr>
              <th style={headerCell}>Div #</th>
              <th style={{ ...headerCell, width: "30%" }}>Division Name</th>
              <th style={{ ...headerCell, ...rightAlign, ...(selectedRange === "low" ? { color: C.accent } : {}) }}>$/SF (Low)</th>
              <th style={{ ...headerCell, ...rightAlign, ...(selectedRange === "mid" ? { color: C.accent } : {}) }}>$/SF (Mid)</th>
              <th style={{ ...headerCell, ...rightAlign, ...(selectedRange === "high" ? { color: C.accent } : {}) }}>$/SF (High)</th>
              <th style={{ ...headerCell, ...rightAlign }}>Total ({rangeLabels[selectedRange]})</th>
              <th style={{ ...headerCell, textAlign: "center", fontSize: 9, width: 80 }}>Adjust</th>
            </tr>
          </thead>
          <tbody>
            {divEntries.map(([divNum, div], i) => (
              <React.Fragment key={divNum}>
                <tr
                  onClick={() => toggleDiv(divNum)}
                  style={{
                    background: i % 2 === 0 ? "transparent" : C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                >
                  <td style={{ ...cellBase, color: C.textMuted, fontWeight: T.fontWeight.medium }}>
                    <span style={{
                      display: "inline-block", width: 14, fontSize: 10, color: C.textDim,
                      transition: "transform 0.15s", transform: expandedDivs.has(divNum) ? "rotate(90deg)" : "none",
                    }}>&#9656;</span>
                    {divNum}
                  </td>
                  <td style={{ ...cellBase, color: C.text, fontWeight: T.fontWeight.medium }}>
                    {div.label}
                    {div.sampleCount > 0 && (
                      <span style={{
                        fontSize: 7, fontWeight: 600, padding: "1px 4px", borderRadius: 3, marginLeft: 6,
                        background: div.confidence === "strong" ? `${C.green}15` : div.confidence === "moderate" ? `${C.accent}12` : `${C.textDim}10`,
                        color: div.confidence === "strong" ? C.green : div.confidence === "moderate" ? C.accent : C.textDim,
                      }}>
                        {div.sampleCount} proposal{div.sampleCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </td>
                  <td style={{ ...cellBase, ...rightAlign, ...colHighlight("low"), fontFeatureSettings: "'tnum'" }}>
                    {fmtSF(div.perSF.low * getDivisionMultiplier(divNum))}
                  </td>
                  <td style={{ ...cellBase, ...rightAlign, ...colHighlight("mid"), fontFeatureSettings: "'tnum'" }}>
                    {fmtSF(div.perSF.mid * getDivisionMultiplier(divNum))}
                  </td>
                  <td style={{ ...cellBase, ...rightAlign, ...colHighlight("high"), fontFeatureSettings: "'tnum'" }}>
                    {fmtSF(div.perSF.high * getDivisionMultiplier(divNum))}
                  </td>
                  <td style={{ ...cellBase, ...rightAlign, color: C.text, fontWeight: T.fontWeight.semibold, fontFeatureSettings: "'tnum'" }}>
                    {fmt(div.total[selectedRange] * getDivisionMultiplier(divNum))}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center", padding: "6px 8px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "center" }} onClick={e => e.stopPropagation()}>
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
                    </div>
                  </td>
                </tr>
                {expandedDivs.has(divNum) && subdivisionData[divNum] &&
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
                      <tr key={`${divNum}-${sub.code}`} style={{ background: C.accentBg }}>
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
                            >
                              {isValidated ? "\u2714" : "\u2610"}
                            </button>
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
                      </tr>
                    );
                  })}
              </React.Fragment>
            ))}

            {/* Subtotal row */}
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
            </tr>

            {/* Markup rows */}
            {markups.map(m => {
              const markupAmt = totals[selectedRange] * (m.enabled ? m.pct / 100 : 0);
              const isEditLabel = editingMarkup?.id === m.id && editingMarkup?.field === "label";
              const isEditPct = editingMarkup?.id === m.id && editingMarkup?.field === "pct";

              return (
                <tr key={m.id} style={{ background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)" }}>
                  <td style={{ ...cellBase, color: C.textDim, borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}` }}>
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
                    borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                    textDecoration: m.enabled ? "none" : "line-through",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {isEditLabel ? (
                        <input autoFocus value={editingMarkupValue}
                          onChange={e => setEditingMarkupValue(e.target.value)}
                          onBlur={commitMarkupEdit}
                          onKeyDown={e => {
                            if (e.key === "Enter") e.target.blur();
                            if (e.key === "Escape") { setEditingMarkup(null); setEditingMarkupValue(""); }
                          }}
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
                    fontSize: T.fontSize.sm, fontFeatureSettings: "'tnum'",
                    borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                  }}>
                    {isEditPct ? (
                      <input type="number" autoFocus value={editingMarkupValue}
                        onChange={e => setEditingMarkupValue(e.target.value)}
                        onBlur={commitMarkupEdit}
                        onKeyDown={e => {
                          if (e.key === "Enter") e.target.blur();
                          if (e.key === "Escape") { setEditingMarkup(null); setEditingMarkupValue(""); }
                        }}
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
                    borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                  }}>
                    {m.enabled ? fmt(markupAmt) : "\u2014"}
                  </td>
                </tr>
              );
            })}

            {/* Add markup button row */}
            <tr>
              <td style={{ ...cellBase, borderBottom: "none" }} />
              <td colSpan={4} style={{ ...cellBase, borderBottom: "none" }}>
                <button onClick={addMarkup} style={{
                  background: "none", border: "none", cursor: "pointer", color: C.accent,
                  fontSize: 11, fontWeight: 600, fontFamily: T.font.sans, padding: 0,
                }}>+ Add Markup</button>
              </td>
              <td style={{ ...cellBase, borderBottom: "none" }} />
            </tr>

            {/* Grand Total row */}
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
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
