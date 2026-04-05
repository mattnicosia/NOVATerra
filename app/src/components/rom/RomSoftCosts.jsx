// RomSoftCosts — Soft costs module with expandable table
import React from "react";
import { card, sectionLabel, colHeader } from "@/utils/styles";
import { fmt, fmtSF } from "./romFormatters";

export default function RomSoftCosts({
  C, T, selectedRange,
  softCosts, softCostsExpanded, setSoftCostsExpanded,
  editingSoftCost, setEditingSoftCost, editingSoftCostValue, setEditingSoftCostValue,
  updateSoftCost, addSoftCost, removeSoftCost, commitSoftCostEdit, toggleAllSoftCosts,
  totalSoftCostPct, hasSoftCosts, softCostTotals,
  grandTotals, projectSF,
  totalProjectCost, totalProjectPerSF,
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

  return (
    <div style={card(C, { padding: 0, marginBottom: T.space[5], overflow: "hidden" })}>
      {/* Header */}
      <div
        onClick={() => setSoftCostsExpanded(!softCostsExpanded)}
        style={{
          padding: `${T.space[4]}px ${T.space[5]}px`,
          borderBottom: softCostsExpanded ? `1px solid ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}` : "none",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", transition: "background 0.15s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            display: "inline-block", fontSize: 10, color: C.textDim,
            transition: "transform 0.15s", transform: softCostsExpanded ? "rotate(90deg)" : "none",
          }}>&#9656;</span>
          <div style={{ ...sectionLabel(C), margin: 0 }}>Soft Costs</div>
          {hasSoftCosts && (
            <span style={{
              fontSize: 10, fontWeight: 600, fontFamily: T.font.sans, padding: "2px 8px", borderRadius: 10,
              background: C.isDark ? "rgba(255,149,0,0.12)" : "rgba(255,149,0,0.08)", color: "#FF9500",
            }}>
              {totalSoftCostPct.toFixed(1)}% &middot; {fmt(softCostTotals[selectedRange])}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!softCostsExpanded && !hasSoftCosts && (
            <span style={{ fontSize: 10, color: C.textDim, fontFamily: T.font.sans }}>A/E fees, permits, inspections...</span>
          )}
          <button
            onClick={e => { e.stopPropagation(); toggleAllSoftCosts(!hasSoftCosts); setSoftCostsExpanded(true); }}
            style={{
              padding: "4px 12px", borderRadius: 6, fontSize: 10, fontWeight: 600, fontFamily: T.font.sans, cursor: "pointer",
              background: hasSoftCosts ? (C.isDark ? "rgba(255,149,0,0.12)" : "rgba(255,149,0,0.08)") : (C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"),
              border: `1px solid ${hasSoftCosts ? "rgba(255,149,0,0.25)" : C.border}`,
              color: hasSoftCosts ? "#FF9500" : C.textMuted, transition: "all 0.15s",
            }}
          >{hasSoftCosts ? "Disable All" : "Enable All"}</button>
        </div>
      </div>

      {/* Soft cost rows */}
      {softCostsExpanded && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.font.sans, minWidth: 500 }}>
            <thead>
              <tr>
                <th style={{ ...headerCell, width: 40 }} />
                <th style={{ ...headerCell, width: "35%" }}>Category</th>
                <th style={{ ...headerCell, textAlign: "center" }}>% of Hard Cost</th>
                <th style={{ ...headerCell, ...rightAlign }}>$/SF ({rangeLabels[selectedRange]})</th>
                <th style={{ ...headerCell, ...rightAlign }}>Amount ({rangeLabels[selectedRange]})</th>
              </tr>
            </thead>
            <tbody>
              {softCosts.map(sc => {
                const scAmt = grandTotals[selectedRange] * (sc.enabled ? sc.pct / 100 : 0);
                const scPerSF = projectSF > 0 ? scAmt / projectSF : 0;
                const isEditLabel = editingSoftCost?.id === sc.id && editingSoftCost?.field === "label";
                const isEditPct = editingSoftCost?.id === sc.id && editingSoftCost?.field === "pct";

                return (
                  <tr key={sc.id} style={{ background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)" }}>
                    <td style={{ ...cellBase, borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}` }}>
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
                      borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                      textDecoration: sc.enabled ? "none" : "line-through", opacity: sc.enabled ? 1 : 0.6,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {isEditLabel ? (
                          <input autoFocus value={editingSoftCostValue}
                            onChange={e => setEditingSoftCostValue(e.target.value)}
                            onBlur={commitSoftCostEdit}
                            onKeyDown={e => {
                              if (e.key === "Enter") e.target.blur();
                              if (e.key === "Escape") { setEditingSoftCost(null); setEditingSoftCostValue(""); }
                            }}
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
                    <td style={{
                      ...cellBase, textAlign: "center", color: sc.enabled ? C.text : C.textDim,
                      fontSize: T.fontSize.sm, fontFeatureSettings: "'tnum'",
                      borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                    }}>
                      {isEditPct ? (
                        <input type="number" autoFocus value={editingSoftCostValue}
                          onChange={e => setEditingSoftCostValue(e.target.value)}
                          onBlur={commitSoftCostEdit}
                          onKeyDown={e => {
                            if (e.key === "Enter") e.target.blur();
                            if (e.key === "Escape") { setEditingSoftCost(null); setEditingSoftCostValue(""); }
                          }}
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
                      ...cellBase, ...rightAlign, color: sc.enabled ? C.textMuted : C.textDim,
                      fontFeatureSettings: "'tnum'", fontSize: T.fontSize.sm,
                      borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                    }}>
                      {sc.enabled ? fmtSF(scPerSF) : "\u2014"}
                    </td>
                    <td style={{
                      ...cellBase, ...rightAlign, color: sc.enabled ? C.text : C.textDim,
                      fontWeight: T.fontWeight.medium, fontFeatureSettings: "'tnum'", fontSize: T.fontSize.sm,
                      borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                    }}>
                      {sc.enabled ? fmt(scAmt) : "\u2014"}
                    </td>
                  </tr>
                );
              })}

              {/* Add soft cost button row */}
              <tr>
                <td style={{ ...cellBase, borderBottom: "none" }} />
                <td colSpan={3} style={{ ...cellBase, borderBottom: "none" }}>
                  <button onClick={addSoftCost} style={{
                    background: "none", border: "none", cursor: "pointer", color: "#FF9500",
                    fontSize: 11, fontWeight: 600, fontFamily: T.font.sans, padding: 0,
                  }}>+ Add Soft Cost</button>
                </td>
                <td style={{ ...cellBase, borderBottom: "none" }} />
              </tr>

              {/* Soft cost subtotal */}
              {hasSoftCosts && (
                <tr style={{
                  borderTop: `1px solid ${C.isDark ? "rgba(255,149,0,0.2)" : "rgba(255,149,0,0.15)"}`,
                  background: C.isDark ? "rgba(255,149,0,0.06)" : "rgba(255,149,0,0.03)",
                }}>
                  <td style={{ ...cellBase, borderBottom: "none" }} />
                  <td style={{ ...cellBase, fontWeight: T.fontWeight.bold, color: C.text, borderBottom: "none" }}>Soft Cost Subtotal</td>
                  <td style={{ ...cellBase, textAlign: "center", fontWeight: T.fontWeight.bold, color: "#FF9500", borderBottom: "none", fontFeatureSettings: "'tnum'" }}>
                    {totalSoftCostPct.toFixed(1)}%
                  </td>
                  <td style={{ ...cellBase, ...rightAlign, fontWeight: T.fontWeight.bold, color: "#FF9500", borderBottom: "none", fontFeatureSettings: "'tnum'" }}>
                    {fmtSF(projectSF > 0 ? softCostTotals[selectedRange] / projectSF : 0)}
                  </td>
                  <td style={{ ...cellBase, ...rightAlign, fontWeight: T.fontWeight.bold, color: "#FF9500", borderBottom: "none", fontFeatureSettings: "'tnum'" }}>
                    {fmt(softCostTotals[selectedRange])}
                  </td>
                </tr>
              )}

              {/* Total Project Cost (hard + soft) */}
              {hasSoftCosts && (
                <tr style={{ borderTop: `2px solid ${C.accent}40`, background: C.accentBg }}>
                  <td style={{ ...cellBase, borderBottom: "none" }} />
                  <td style={{ ...cellBase, fontWeight: T.fontWeight.bold, color: C.text, borderBottom: "none", fontSize: T.fontSize.md }}>Total Project Cost</td>
                  <td style={{ ...cellBase, borderBottom: "none" }} />
                  <td style={{ ...cellBase, ...rightAlign, fontWeight: T.fontWeight.bold, borderBottom: "none", fontFeatureSettings: "'tnum'" }}>
                    {fmtSF(totalProjectPerSF[selectedRange])}
                  </td>
                  <td style={{
                    ...cellBase, ...rightAlign, fontWeight: T.fontWeight.bold, borderBottom: "none",
                    fontSize: T.fontSize.lg, fontFeatureSettings: "'tnum'",
                    background: C.gradient || C.accent, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                  }}>
                    {fmt(totalProjectCost[selectedRange])}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
