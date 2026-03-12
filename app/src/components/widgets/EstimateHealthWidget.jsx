import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

/* ────────────────────────────────────────────────────────
   EstimateHealthWidget — Completeness %, missing items, unpriced lines
   Grid widget version of Sprint 4.2 Estimate Health
   ──────────────────────────────────────────────────────── */

export default function EstimateHealthWidget() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = (a) => dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
  const estimates = useEstimatesStore(s => s.estimates);

  const stats = useMemo(() => {
    const active = estimates.filter(e => e.status === "Bidding" || e.status === "Submitted");
    let totalItems = 0;
    let unpricedItems = 0;
    let missingDesc = 0;
    let completenessSum = 0;

    active.forEach(est => {
      const count = est.itemCount || 0;
      totalItems += count;
      const unpriced = est.unpricedCount || 0;
      unpricedItems += unpriced;
      if (!est.client) missingDesc++;
      const hasTotal = (est.grandTotal || 0) > 0;
      const hasItems = count > 0;
      const hasDue = !!est.bidDue;
      const pct = (hasTotal ? 30 : 0) + (hasItems ? 30 : 0) + (hasDue ? 20 : 0) + (unpriced === 0 ? 20 : 10);
      completenessSum += pct;
    });

    const avgCompleteness = active.length > 0 ? Math.round(completenessSum / active.length) : 0;
    return { active: active.length, totalItems, unpricedItems, missingDesc, avgCompleteness };
  }, [estimates]);

  const healthColor =
    stats.avgCompleteness >= 80 ? C.green : stats.avgCompleteness >= 50 ? C.orange : C.red;

  return (
    <div style={{ padding: "14px 16px", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{
        fontSize: 8.5,
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: ov(0.4),
        fontFamily: T.font.display,
        marginBottom: 10,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        <Ic d={I.check} size={11} color={healthColor} />
        Estimate Health
      </div>

      {stats.active === 0 ? (
        <div style={{ fontSize: 11, color: ov(0.35), textAlign: "center", padding: 16, flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          No active bids to assess.
        </div>
      ) : (
        <div style={{ flex: 1 }}>
          {/* Completeness ring */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: `conic-gradient(${healthColor} ${stats.avgCompleteness * 3.6}deg, ${ov(0.06)} 0deg)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: dk ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.8)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  color: healthColor,
                  fontFamily: T.font.display,
                }}
              >
                {stats.avgCompleteness}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.text, fontFamily: T.font.display }}>
                {stats.active} active bid{stats.active !== 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: 9, color: ov(0.4), fontFamily: T.font.display }}>
                {stats.totalItems} total items · {stats.unpricedItems} unpriced
              </div>
            </div>
          </div>

          {/* Health indicators */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {stats.unpricedItems > 0 && (
              <span style={{
                fontSize: 8,
                padding: "3px 8px",
                borderRadius: 99,
                background: `${C.orange}15`,
                color: C.orange,
                fontWeight: 600,
                fontFamily: T.font.display,
              }}>
                {stats.unpricedItems} unpriced line{stats.unpricedItems !== 1 ? "s" : ""}
              </span>
            )}
            {stats.missingDesc > 0 && (
              <span style={{
                fontSize: 8,
                padding: "3px 8px",
                borderRadius: 99,
                background: `${C.red}15`,
                color: C.red,
                fontWeight: 600,
                fontFamily: T.font.display,
              }}>
                {stats.missingDesc} missing client
              </span>
            )}
            {stats.unpricedItems === 0 && stats.missingDesc === 0 && (
              <span style={{
                fontSize: 8,
                padding: "3px 8px",
                borderRadius: 99,
                background: `${C.green}15`,
                color: C.green,
                fontWeight: 600,
                fontFamily: T.font.display,
              }}>
                All healthy
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
