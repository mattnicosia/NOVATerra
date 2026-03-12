import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { fmt } from "@/utils/format";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

/* ────────────────────────────────────────────────────────
   DeadlineCountdownWidget — Visual urgency countdown for active bids
   Grid widget version of Sprint 4.2 Deadline Countdown
   ──────────────────────────────────────────────────────── */

export default function DeadlineCountdownWidget() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = (a) => dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
  const navigate = useNavigate();
  const estimates = useEstimatesStore(s => s.estimatesIndex);

  const upcoming = useMemo(() => {
    return estimates
      .filter(e => e.bidDue && (e.status === "Bidding" || e.status === "Submitted"))
      .map(e => {
        const daysLeft = Math.ceil((new Date(e.bidDue) - new Date()) / 86400000);
        return { ...e, daysLeft };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 4);
  }, [estimates]);

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
        <Ic d={I.clock} size={11} color={C.orange} />
        Deadline Countdown
      </div>
      {upcoming.length === 0 ? (
        <div style={{ fontSize: 11, color: ov(0.35), textAlign: "center", padding: 16, flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          No upcoming deadlines.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, overflow: "auto" }}>
          {upcoming.map(e => {
            const urgencyColor =
              e.daysLeft <= 0 ? C.red
                : e.daysLeft <= 3 ? C.red
                  : e.daysLeft <= 7 ? C.orange
                    : C.green;
            const barPct = Math.max(5, Math.min(100, 100 - e.daysLeft * 3));

            return (
              <div
                key={e.id}
                onClick={() => navigate(`/estimate/${e.id}/takeoffs`)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: dk ? `${urgencyColor}08` : `${urgencyColor}06`,
                  border: `1px solid ${urgencyColor}12`,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e2 => { e2.currentTarget.style.background = dk ? `${urgencyColor}15` : `${urgencyColor}12`; }}
                onMouseLeave={e2 => { e2.currentTarget.style.background = dk ? `${urgencyColor}08` : `${urgencyColor}06`; }}
              >
                {/* Countdown badge */}
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: `${urgencyColor}15`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: urgencyColor, lineHeight: 1, fontFamily: T.font.display }}>
                    {e.daysLeft <= 0 ? "!" : e.daysLeft}
                  </span>
                  <span style={{ fontSize: 6, fontWeight: 600, color: urgencyColor, textTransform: "uppercase", fontFamily: T.font.display }}>
                    {e.daysLeft <= 0 ? "DUE" : "days"}
                  </span>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: C.text,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontFamily: T.font.display,
                  }}>
                    {e.name || "Untitled"}
                  </div>
                  <div style={{ fontSize: 8, color: ov(0.4), fontFamily: T.font.display }}>
                    {e.bidDue} · {fmt(e.grandTotal || 0)}
                  </div>
                  {/* Urgency bar */}
                  <div style={{
                    height: 3,
                    borderRadius: 2,
                    background: ov(0.06),
                    marginTop: 3,
                    overflow: "hidden",
                  }}>
                    <div style={{
                      width: `${barPct}%`,
                      height: "100%",
                      background: urgencyColor,
                      borderRadius: 2,
                      transition: "width 0.5s ease",
                    }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
