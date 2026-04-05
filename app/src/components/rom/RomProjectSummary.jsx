// RomProjectSummary — Project info card + cost summary card with range selector
import React from "react";
import { card, sectionLabel } from "@/utils/styles";
import { BUILDING_TYPE_LABELS, fmt, fmtSF, fmtNum } from "./romFormatters";

export default function RomProjectSummary({
  C, T, email, jobType, projectSF,
  selectedRange, setSelectedRange,
  totals, totalPerSF, grandTotals, grandPerSF,
  totalProjectCost, totalProjectPerSF,
  totalMarkupPct, totalSoftCostPct,
  hasSoftCosts,
}) {
  const dimText = { color: C.textMuted, fontFamily: T.font.sans };
  const brightText = { color: C.text, fontFamily: T.font.sans };
  const rangeOptions = ["low", "mid", "high"];
  const rangeLabels = { low: "Low", mid: "Mid", high: "High" };

  return (
    <>
      {/* Project Summary Card */}
      <div style={card(C, { padding: T.space[6], marginBottom: T.space[5] })}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: T.space[6], alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ ...sectionLabel(C), marginBottom: 4 }}>Building Type</div>
            <div style={{ ...brightText, fontSize: T.fontSize.lg, fontWeight: T.fontWeight.semibold }}>
              {BUILDING_TYPE_LABELS[jobType] || jobType}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ ...sectionLabel(C), marginBottom: 4 }}>Project Size</div>
            <div style={{ ...brightText, fontSize: T.fontSize.lg, fontWeight: T.fontWeight.semibold }}>
              {fmtNum(projectSF)} SF
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ ...sectionLabel(C), marginBottom: 4 }}>Prepared For</div>
            <div style={{ ...brightText, fontSize: T.fontSize.md, fontWeight: T.fontWeight.medium }}>{email}</div>
          </div>
        </div>
      </div>

      {/* Cost Summary Card with Range Selector */}
      <div style={card(C, { padding: T.space[6], marginBottom: T.space[5] })}>
        {/* Range selector */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: T.space[5] }}>
          <div
            style={{
              display: "inline-flex",
              borderRadius: 10,
              background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              padding: 3,
              gap: 2,
            }}
          >
            {rangeOptions.map(r => (
              <button
                key={r}
                onClick={() => setSelectedRange(r)}
                style={{
                  padding: "7px 22px",
                  borderRadius: 8,
                  border: "none",
                  fontSize: T.fontSize.sm,
                  fontWeight: T.fontWeight.semibold,
                  fontFamily: T.font.sans,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  background:
                    r === selectedRange
                      ? r === "mid"
                        ? C.gradient
                        : C.isDark
                          ? "rgba(255,255,255,0.12)"
                          : "rgba(0,0,0,0.08)"
                      : "transparent",
                  color: r === selectedRange ? "#fff" : C.textMuted,
                }}
              >
                {rangeLabels[r]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ ...sectionLabel(C), marginBottom: T.space[4], textAlign: "center" }}>
          {hasSoftCosts ? "Total Project Cost" : "Estimated Project Cost"}
        </div>

        {/* Big number */}
        <div style={{ textAlign: "center", marginBottom: T.space[4] }}>
          <div
            style={{
              fontSize: 42,
              fontWeight: T.fontWeight.bold,
              fontFamily: T.font.sans,
              background: C.gradient || C.accent,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              lineHeight: 1.1,
            }}
          >
            {fmt(hasSoftCosts ? totalProjectCost[selectedRange] : grandTotals[selectedRange])}
          </div>
          <div style={{ ...dimText, fontSize: T.fontSize.sm, marginTop: 6 }}>
            {fmtSF(hasSoftCosts ? totalProjectPerSF[selectedRange] : grandPerSF[selectedRange])}/SF &middot;{" "}
            {rangeLabels[selectedRange]} Range
            {totalMarkupPct > 0 && <span> &middot; incl. {totalMarkupPct.toFixed(1)}% markups</span>}
            {hasSoftCosts && <span> &middot; {totalSoftCostPct.toFixed(1)}% soft costs</span>}
          </div>
        </div>

        {/* All three ranges — compact */}
        <div
          style={{
            display: "flex",
            gap: T.space[4],
            justifyContent: "center",
            flexWrap: "wrap",
            paddingTop: T.space[4],
            borderTop: `1px solid ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
          }}
        >
          {rangeOptions.map(r => (
            <div
              key={r}
              onClick={() => setSelectedRange(r)}
              style={{
                textAlign: "center",
                cursor: "pointer",
                padding: "6px 16px",
                borderRadius: 8,
                background:
                  r === selectedRange ? (C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)") : "transparent",
                transition: "background 0.15s",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  color: r === selectedRange ? C.accent : C.textDim,
                  marginBottom: 2,
                }}
              >
                {rangeLabels[r]}
              </div>
              <div
                style={{
                  fontSize: T.fontSize.md,
                  fontWeight: r === selectedRange ? T.fontWeight.bold : T.fontWeight.medium,
                  color: r === selectedRange ? C.text : C.textMuted,
                }}
              >
                {fmt(totals[r])}
              </div>
              <div style={{ fontSize: 10, color: C.textDim }}>{fmtSF(totalPerSF[r])}/SF</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
