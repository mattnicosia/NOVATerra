// RomScopeDetail — Detailed scope items from template engine
import React from "react";
import { card, sectionLabel } from "@/utils/styles";
import { generateScopeTemplate } from "@/constants/scopeTemplates";
import { fmt } from "./romFormatters";

export default function RomScopeDetail({
  C, T, showScopeItems, setShowScopeItems,
  jobType, projectSF, rom, divisions,
  excludedItems, toggleItem,
}) {
  if (!showScopeItems) return null;

  let scopeResult;
  try {
    scopeResult = generateScopeTemplate(jobType, projectSF, {
      floors: rom.floors || 1,
      workType: rom.workType || "",
    });
  } catch (e) {
    console.error("[RomScopeDetail] Scope template generation failed:", e);
    return null;
  }
  if (!scopeResult || !scopeResult.items.length) return null;

  // Group items by division
  const byDiv = {};
  scopeResult.items.forEach(item => {
    if (!byDiv[item.division]) byDiv[item.division] = [];
    byDiv[item.division].push(item);
  });

  return (
    <div style={card(C, { padding: `${T.space[5]}px`, marginBottom: T.space[4] })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ ...sectionLabel(C) }}>DETAILED SCOPE ITEMS ({scopeResult.itemCount})</div>
        <button onClick={() => setShowScopeItems(false)} style={{
          background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 11,
          fontFamily: T.font.sans,
        }}>Hide</button>
      </div>

      {Object.entries(byDiv).sort(([a], [b]) => a.localeCompare(b)).map(([divCode, items]) => {
        const divName = divisions?.[divCode]?.name || `Division ${divCode}`;
        const activeItems = items.filter(i => !excludedItems.has(i.code));
        const divTotal = activeItems.reduce((sum, i) => sum + (i.midCost || 0), 0);

        return (
          <div key={divCode} style={{ marginBottom: 16 }}>
            {/* Division header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "6px 0", borderBottom: `1px solid ${C.border}`,
              marginBottom: 6,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 600, color: C.text,
                fontFamily: T.font.sans, textTransform: "uppercase", letterSpacing: "0.06em",
              }}>{divCode} — {divName}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.accent, fontFamily: T.font.sans }}>
                {fmt(divTotal)}
              </span>
            </div>

            {/* Line items with toggle */}
            {items.map((item, idx) => {
              const isExcluded = excludedItems.has(item.code);
              return (
              <div key={idx} style={{
                display: "grid",
                gridTemplateColumns: "20px 1fr 70px 40px 80px 80px 80px",
                gap: 8,
                padding: "4px 0",
                fontSize: 11,
                fontFamily: T.font.sans,
                color: C.textMuted,
                borderBottom: idx < items.length - 1 ? `1px solid ${C.borderLight}` : "none",
                alignItems: "center",
                opacity: isExcluded ? 0.35 : 1,
                textDecoration: isExcluded ? "line-through" : "none",
              }}>
                <input type="checkbox" checked={!isExcluded} onChange={() => toggleItem(item.code)}
                  style={{ accentColor: C.accent, cursor: "pointer", width: 13, height: 13 }} />
                <span style={{ color: C.text, fontSize: 11.5 }}>
                  <span style={{ color: C.textDim, marginRight: 6 }}>{item.code}</span>
                  {item.description}
                  {item.note && <span style={{ color: C.textDim, fontSize: 10, marginLeft: 6 }}>({item.note})</span>}
                </span>
                <span style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans }}>
                  {item.qty?.toLocaleString()}
                </span>
                <span style={{ textAlign: "center", color: C.textDim }}>{item.unit}</span>
                <span style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans, color: C.textDim }}>
                  {item.lowCost ? fmt(item.lowCost) : "\u2014"}
                </span>
                <span style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans, fontWeight: 500, color: C.text }}>
                  {item.midCost ? fmt(item.midCost) : "\u2014"}
                </span>
                <span style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans, color: C.textDim }}>
                  {item.highCost ? fmt(item.highCost) : "\u2014"}
                </span>
              </div>
              );
            })}
          </div>
        );
      })}

      {/* Scope totals */}
      {(() => {
        const active = scopeResult.items.filter(i => !excludedItems.has(i.code));
        const adjTotal = {
          low: active.reduce((s, i) => s + (i.lowCost || 0), 0),
          mid: active.reduce((s, i) => s + (i.midCost || 0), 0),
          high: active.reduce((s, i) => s + (i.highCost || 0), 0),
        };
        const excluded = scopeResult.itemCount - active.length;
        return (
        <div style={{
          display: "grid", gridTemplateColumns: "20px 1fr 70px 40px 80px 80px 80px",
          gap: 8, padding: "8px 0", borderTop: `2px solid ${C.border}`, marginTop: 8,
          fontSize: 12, fontWeight: 700, fontFamily: T.font.sans, color: C.text,
        }}>
          <span />
          <span>TOTAL ({active.length} items{excluded > 0 ? `, ${excluded} excluded` : ""})</span>
          <span />
          <span />
          <span style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans }}>{fmt(adjTotal.low)}</span>
          <span style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans, color: C.accent }}>{fmt(adjTotal.mid)}</span>
          <span style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans }}>{fmt(adjTotal.high)}</span>
        </div>
        );
      })()}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 70px 40px 80px 80px 80px",
        gap: 8, padding: "4px 0", fontSize: 11, fontFamily: T.font.sans, color: C.textMuted,
      }}>
        <span>Per SF</span>
        <span />
        <span />
        <span style={{ textAlign: "right" }}>{fmt(scopeResult.perSF.low)}/SF</span>
        <span style={{ textAlign: "right", color: C.accent }}>{fmt(scopeResult.perSF.mid)}/SF</span>
        <span style={{ textAlign: "right" }}>{fmt(scopeResult.perSF.high)}/SF</span>
      </div>

      {/* Source attribution */}
      <div style={{
        marginTop: 12, padding: "8px 12px", borderRadius: 6,
        background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
        fontSize: 10, color: C.textDim, lineHeight: 1.5, fontFamily: T.font.sans,
      }}>
        Source: NOVATerra scope template for {scopeResult.label}. Quantities are estimates based on project SF
        and building type. Actual quantities will vary based on design documents.
        {rom.calibrationNote && <span> {rom.calibrationNote}</span>}
      </div>
    </div>
  );
}
