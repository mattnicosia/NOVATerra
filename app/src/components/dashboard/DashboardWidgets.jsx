/**
 * DashboardWidgets — Sprint 4.2 dashboard enhancement widgets
 *
 * New widgets added to main dashboard:
 *   a) Estimate Health — Completeness %, missing items, unpriced lines
 *   b) Quick Actions — One-click: new estimate, upload plans, import CSV
 *   c) NOVA Insights — AI observations from recent scans
 *   d) Deadline Countdown — Visual urgency countdown for active bids
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useFirmMemoryStore } from "@/nova/learning/firmMemory";
import { useCorrectionStore } from "@/nova/learning/correctionStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, card, sectionLabel } from "@/utils/styles";
import { fmt } from "@/utils/format";
import { useEstimatesStore } from "@/stores/estimatesStore";

/**
 * Main widget grid — renders all widgets in a responsive 2-column layout.
 * On tablet: single-column stack for readability.
 * @param {{ estimates: Array }} props
 */
export default function DashboardWidgets({ estimates = [] }) {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const { isTablet } = useResponsive();

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isTablet ? "1fr" : "1fr 1fr",
        gap: T.space[4],
        marginBottom: T.space[6],
      }}
    >
      <EstimateHealthWidget estimates={estimates} C={C} T={T} navigate={navigate} />
      <QuickActionsWidget C={C} T={T} navigate={navigate} />
      <DeadlineCountdownWidget estimates={estimates} C={C} T={T} navigate={navigate} />
      <NovaInsightsWidget C={C} T={T} />
    </div>
  );
}

// ── Widget: Estimate Health ──────────────────────────────────────
function EstimateHealthWidget({ estimates, C, T, navigate }) {
  const stats = useMemo(() => {
    const active = estimates.filter(e => e.status === "Bidding" || e.status === "Pending");
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
      // Completeness: rough estimate based on having grand total + items
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
    <div
      style={{
        ...card(C),
        padding: T.space[4],
        border: `1px solid ${healthColor}15`,
      }}
    >
      <div style={{ ...sectionLabel(C), marginBottom: T.space[3], display: "flex", alignItems: "center", gap: 6 }}>
        <Ic d={I.check || I.ai} size={12} color={healthColor} />
        Estimate Health
      </div>

      {stats.active === 0 ? (
        <div style={{ fontSize: 11, color: C.textDim, textAlign: "center", padding: T.space[3] }}>
          No active bids to assess.
        </div>
      ) : (
        <>
          {/* Completeness ring */}
          <div style={{ display: "flex", alignItems: "center", gap: T.space[4], marginBottom: T.space[3] }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: `conic-gradient(${healthColor} ${stats.avgCompleteness * 3.6}deg, ${C.bg3} 0deg)`,
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
                  background: C.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  color: healthColor,
                }}
              >
                {stats.avgCompleteness}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>
                {stats.active} active bid{stats.active !== 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: 9, color: C.textDim }}>
                {stats.totalItems} total items · {stats.unpricedItems} unpriced
              </div>
            </div>
          </div>

          {/* Health indicators */}
          <div style={{ display: "flex", gap: T.space[2], flexWrap: "wrap" }}>
            {stats.unpricedItems > 0 && (
              <span
                style={{
                  fontSize: 8,
                  padding: "2px 8px",
                  borderRadius: T.radius.full,
                  background: `${C.orange}15`,
                  color: C.orange,
                  fontWeight: 600,
                }}
              >
                {stats.unpricedItems} unpriced line{stats.unpricedItems !== 1 ? "s" : ""}
              </span>
            )}
            {stats.missingDesc > 0 && (
              <span
                style={{
                  fontSize: 8,
                  padding: "2px 8px",
                  borderRadius: T.radius.full,
                  background: `${C.red}15`,
                  color: C.red,
                  fontWeight: 600,
                }}
              >
                {stats.missingDesc} missing client
              </span>
            )}
            {stats.unpricedItems === 0 && stats.missingDesc === 0 && (
              <span
                style={{
                  fontSize: 8,
                  padding: "2px 8px",
                  borderRadius: T.radius.full,
                  background: `${C.green}15`,
                  color: C.green,
                  fontWeight: 600,
                }}
              >
                ✓ All healthy
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Widget: Quick Actions ────────────────────────────────────────
function QuickActionsWidget({ C, T, navigate }) {
  const actions = [
    {
      label: "New Estimate",
      icon: I.estimate || I.folder,
      color: C.accent,
      action: () => navigate("/"),
      desc: "Start a fresh estimate",
    },
    {
      label: "Upload Plans",
      icon: I.upload || I.image,
      color: C.green,
      action: () => {
        const idx = useEstimatesStore.getState().estimatesIndex;
        const active = idx.find(e => e.status === "Bidding" || e.status === "Pending") || idx[0];
        navigate(active ? `/estimate/${active.id}/documents` : "/");
      },
      desc: "Scan drawings with NOVA",
    },
    {
      label: "Import CSV",
      icon: I.file || I.database,
      color: C.purple,
      action: () => navigate("/core?tab=database"),
      desc: "Import cost data",
    },
    {
      label: "Settings",
      icon: I.settings,
      color: C.orange,
      action: () => navigate("/settings"),
      desc: "Company & preferences",
    },
  ];

  return (
    <div style={{ ...card(C), padding: T.space[4] }}>
      <div style={{ ...sectionLabel(C), marginBottom: T.space[3], display: "flex", alignItems: "center", gap: 6 }}>
        <Ic d={I.grid || I.settings} size={12} color={C.accent} />
        Quick Actions
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {actions.map(a => (
          <button
            key={a.label}
            onClick={a.action}
            style={bt(C, {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: `${T.space[3]}px ${T.space[2]}px`,
              background: `${a.color}06`,
              border: `1px solid ${a.color}15`,
              borderRadius: T.radius.md,
              cursor: "pointer",
            })}
          >
            <Ic d={a.icon} size={16} color={a.color} />
            <span style={{ fontSize: 9, fontWeight: 600, color: C.text }}>{a.label}</span>
            <span style={{ fontSize: 7, color: C.textDim }}>{a.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Widget: Deadline Countdown ───────────────────────────────────
function DeadlineCountdownWidget({ estimates, C, T, navigate }) {
  const upcoming = useMemo(() => {
    return estimates
      .filter(e => e.bidDue && (e.status === "Bidding" || e.status === "Pending"))
      .map(e => {
        const daysLeft = Math.ceil((new Date(e.bidDue) - new Date()) / 86400000);
        return { ...e, daysLeft };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 4);
  }, [estimates]);

  return (
    <div style={{ ...card(C), padding: T.space[4] }}>
      <div style={{ ...sectionLabel(C), marginBottom: T.space[3], display: "flex", alignItems: "center", gap: 6 }}>
        <Ic d={I.clock || I.calendar} size={12} color={C.orange} />
        Deadline Countdown
      </div>
      {upcoming.length === 0 ? (
        <div style={{ fontSize: 11, color: C.textDim, textAlign: "center", padding: T.space[3] }}>
          No upcoming deadlines.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {upcoming.map(e => {
            const urgencyColor =
              e.daysLeft <= 0
                ? C.red
                : e.daysLeft <= 3
                  ? C.red
                  : e.daysLeft <= 7
                    ? C.orange
                    : C.green;
            const barPct = Math.max(5, Math.min(100, 100 - e.daysLeft * 3));

            return (
              <div
                key={e.id}
                onClick={() => navigate(`/estimate/${e.id}/takeoffs`)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: T.space[2],
                  padding: "6px 8px",
                  borderRadius: T.radius.sm,
                  cursor: "pointer",
                  background: `${urgencyColor}06`,
                  border: `1px solid ${urgencyColor}12`,
                }}
              >
                {/* Countdown badge */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: T.radius.sm,
                    background: `${urgencyColor}15`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 700, color: urgencyColor, lineHeight: 1 }}>
                    {e.daysLeft <= 0 ? "!" : e.daysLeft}
                  </span>
                  <span style={{ fontSize: 6, fontWeight: 600, color: urgencyColor, textTransform: "uppercase" }}>
                    {e.daysLeft <= 0 ? "DUE" : "days"}
                  </span>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: C.text,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {e.name || "Untitled"}
                  </div>
                  <div style={{ fontSize: 8, color: C.textDim }}>
                    {e.bidDue} · {fmt(e.grandTotal || 0)}
                  </div>
                  {/* Urgency bar */}
                  <div
                    style={{
                      height: 3,
                      borderRadius: 2,
                      background: C.bg3,
                      marginTop: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${barPct}%`,
                        height: "100%",
                        background: urgencyColor,
                        borderRadius: 2,
                        transition: "width 0.5s ease",
                      }}
                    />
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

// ── Widget: NOVA Insights ────────────────────────────────────────
function NovaInsightsWidget({ C, T }) {
  // Select raw state to avoid creating new objects on every render
  const firms = useFirmMemoryStore(s => s.firms);
  const corrections = useCorrectionStore(s => s.corrections);
  const globalPatterns = useCorrectionStore(s => s.globalPatterns);

  // Compute stats in useMemo for stable references
  const firmStats = useMemo(() => {
    const firmList = Object.values(firms || {});
    return {
      totalFirms: firmList.length,
      totalPatterns: firmList.reduce((sum, f) => sum + (f.patterns?.length || 0), 0),
    };
  }, [firms]);

  const correctionStats = useMemo(() => {
    const corrList = corrections || [];
    const patterns = globalPatterns || [];
    return {
      totalCorrections: corrList.length,
      uniquePatterns: patterns.length,
      topPatterns: patterns.slice(0, 5),
    };
  }, [corrections, globalPatterns]);

  const insights = useMemo(() => {
    const list = [];

    if (firmStats.totalFirms > 0) {
      list.push({
        text: `NOVA has learned patterns from ${firmStats.totalFirms} architect/engineer firm${firmStats.totalFirms !== 1 ? "s" : ""}`,
        color: C.accent,
        icon: "🏗",
      });
    }

    if (firmStats.totalPatterns > 0) {
      list.push({
        text: `${firmStats.totalPatterns} firm-specific convention${firmStats.totalPatterns !== 1 ? "s" : ""} tracked for faster scans`,
        color: C.purple,
        icon: "🧠",
      });
    }

    if (correctionStats.totalCorrections > 0) {
      list.push({
        text: `${correctionStats.totalCorrections} user correction${correctionStats.totalCorrections !== 1 ? "s" : ""} logged — NOVA is learning your preferences`,
        color: C.green,
        icon: "📈",
      });
    }

    if (correctionStats.uniquePatterns > 0) {
      list.push({
        text: `${correctionStats.uniquePatterns} recurring pattern${correctionStats.uniquePatterns !== 1 ? "s" : ""} identified for auto-correction`,
        color: C.blue || C.accent,
        icon: "⚡",
      });
    }

    if (correctionStats.topPatterns?.length > 0) {
      const top = correctionStats.topPatterns[0];
      list.push({
        text: `Most common correction: ${top.field || top.type} (${top.frequency}x)`,
        color: C.orange,
        icon: "🔧",
      });
    }

    if (list.length === 0) {
      list.push({
        text: "Upload and scan drawings to start building NOVA intelligence",
        color: C.textDim,
        icon: "✦",
      });
    }

    return list.slice(0, 4);
  }, [firmStats, correctionStats, C]);

  return (
    <div
      style={{
        ...card(C),
        padding: T.space[4],
        border: `1px solid ${C.accent}10`,
        background: `linear-gradient(135deg, ${C.bg}00, ${C.accent}04)`,
      }}
    >
      <div style={{ ...sectionLabel(C), marginBottom: T.space[3], display: "flex", alignItems: "center", gap: 6 }}>
        <Ic d={I.ai} size={12} color={C.accent} />
        NOVA Insights
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {insights.map((insight, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "4px 0",
            }}
          >
            <span style={{ fontSize: 12, lineHeight: 1, flexShrink: 0 }}>{insight.icon}</span>
            <span style={{ fontSize: 10, color: C.text, lineHeight: 1.5 }}>{insight.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
