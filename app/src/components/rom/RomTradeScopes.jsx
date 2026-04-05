// RomTradeScopes — Trade-separated scopes of work
import React from "react";
import { card, sectionLabel } from "@/utils/styles";
import { generateTradeScopes } from "@/utils/tradeScopeGenerator";
import { TRADE_COLORS } from "@/constants/tradeGroupings";
import { fmt } from "./romFormatters";

export default function RomTradeScopes({
  C, T, showTradeScopes, setShowTradeScopes,
  expandedTrade, setExpandedTrade,
  jobType, projectSF, rom, divisions,
  excludedItems, toggleItem,
}) {
  if (!showTradeScopes) return null;

  let tradeResult;
  try {
    tradeResult = generateTradeScopes(jobType, projectSF, {
      floors: rom.floors || 1,
      workType: rom.workType || "",
      romDivisions: divisions,
      scanLineItems: rom.scheduleLineItems || [],
    });
  } catch (e) {
    console.error("[RomTradeScopes] Trade scope generation failed:", e);
    return null;
  }
  if (!tradeResult?.trades?.length) return null;

  return (
    <div style={card(C, { padding: `${T.space[5]}px`, marginBottom: T.space[4] })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ ...sectionLabel(C) }}>SCOPE OF WORK BY TRADE ({tradeResult.trades.length} trades)</div>
        <button onClick={() => setShowTradeScopes(false)} style={{
          background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 11, fontFamily: T.font.sans,
        }}>Hide</button>
      </div>

      {/* Trade cards */}
      {tradeResult.trades.map(trade => {
        const isExpanded = expandedTrade === trade.key;
        const tradeColor = TRADE_COLORS?.[trade.key] || C.accent;

        return (
          <div key={trade.key} style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${tradeColor}15`, overflow: "hidden" }}>
            {/* Trade header */}
            <div
              onClick={() => setExpandedTrade(isExpanded ? null : trade.key)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", cursor: "pointer",
                background: isExpanded ? `${tradeColor}08` : "transparent",
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: tradeColor, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: T.font.sans }}>
                  {trade.label}
                </div>
                <div style={{ fontSize: 9, color: C.textDim, marginTop: 1 }}>
                  {trade.itemCount} item{trade.itemCount !== 1 ? "s" : ""} · {trade.pctOfTotal}% of total
                </div>
              </div>
              <div style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{fmt(trade.costMid)}</div>
                <div style={{ fontSize: 9, color: C.textDim }}>{fmt(trade.costLow)} – {fmt(trade.costHigh)}</div>
              </div>
              <svg viewBox="0 0 10 6" fill="none" stroke={C.textDim} strokeWidth="1.5" strokeLinecap="round"
                style={{ width: 10, height: 6, transition: "transform 150ms", transform: isExpanded ? "rotate(180deg)" : "none" }}>
                <path d="M1 1l4 4 4-4" />
              </svg>
            </div>

            {/* Expanded: narrative + line items */}
            {isExpanded && (
              <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${tradeColor}10` }}>
                {trade.narrative && (
                  <div style={{
                    padding: "10px 0 8px", fontSize: 11, color: C.textMuted,
                    lineHeight: 1.6, fontFamily: T.font.sans,
                    borderBottom: `1px solid ${C.border}08`, marginBottom: 8,
                  }}>
                    {trade.narrative}
                  </div>
                )}

                {/* Line items header */}
                <div style={{
                  display: "grid", gridTemplateColumns: "18px 1fr 60px 35px 70px",
                  gap: 4, fontSize: 10, fontFamily: T.font.sans, color: C.textDim,
                  padding: "4px 0", borderBottom: `1px solid ${C.border}06`, fontWeight: 600,
                }}>
                  <span />
                  <span>Description</span>
                  <span style={{ textAlign: "right" }}>Qty</span>
                  <span style={{ textAlign: "center" }}>Unit</span>
                  <span style={{ textAlign: "right" }}>Est. Cost</span>
                </div>
                {trade.items.map((item, idx) => {
                  const isExcluded = excludedItems.has(item.code);
                  return (
                  <div key={idx} style={{
                    display: "grid", gridTemplateColumns: "18px 1fr 60px 35px 70px",
                    gap: 4, padding: "3px 0", fontSize: 10.5, fontFamily: T.font.sans,
                    borderBottom: idx < trade.items.length - 1 ? `1px solid ${C.borderLight || C.border}06` : "none",
                    alignItems: "center",
                    opacity: isExcluded ? 0.35 : 1,
                  }}>
                    <input type="checkbox" checked={!isExcluded} onChange={() => toggleItem(item.code)}
                      style={{ accentColor: tradeColor, cursor: "pointer", width: 12, height: 12 }} />
                    <span style={{ color: C.text, textDecoration: isExcluded ? "line-through" : "none" }}>
                      <span style={{ color: C.textDim, marginRight: 4, fontSize: 9 }}>{item.code}</span>
                      {item.description}
                      {item._fromDrawings && (
                        <span style={{ fontSize: 7, fontWeight: 700, padding: "1px 4px", borderRadius: 3, marginLeft: 4, background: `${C.green}18`, color: C.green }}>
                          FROM DRAWINGS
                        </span>
                      )}
                    </span>
                    <span style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans, color: C.textMuted }}>
                      {item.qty?.toLocaleString()}
                    </span>
                    <span style={{ textAlign: "center", color: C.textDim }}>{item.unit}</span>
                    <span style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans, color: C.text, fontWeight: 500 }}>
                      {item.midCost ? fmt(item.midCost) : "\u2014"}
                    </span>
                  </div>
                  );
                })}

                {/* Trade subtotal */}
                {(() => {
                  const activeItems = trade.items.filter(i => !excludedItems.has(i.code));
                  const adjMid = activeItems.reduce((s, i) => s + (i.midCost || 0), 0);
                  return (
                <div style={{
                  display: "grid", gridTemplateColumns: "18px 1fr 60px 35px 70px",
                  gap: 4, padding: "6px 0 0", borderTop: `1px solid ${tradeColor}20`, marginTop: 4,
                  fontSize: 11, fontWeight: 700, fontFamily: T.font.sans, color: tradeColor,
                }}>
                  <span />
                  <span>Subtotal{activeItems.length < trade.items.length ? ` (${activeItems.length}/${trade.items.length})` : ""}</span>
                  <span />
                  <span />
                  <span style={{ textAlign: "right" }}>{fmt(adjMid)}</span>
                </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}

      {/* Source */}
      <div style={{
        marginTop: 8, padding: "8px 12px", borderRadius: 6,
        background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
        fontSize: 10, color: C.textDim, lineHeight: 1.5, fontFamily: T.font.sans,
      }}>
        Trade scopes generated by NOVATerra from {tradeResult.buildingType} template.
        Scope narratives describe typical work for this building type. Upload drawings for project-specific scopes.
      </div>
    </div>
  );
}
