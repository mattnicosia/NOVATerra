import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useWorkloadData, addWeekdays } from "@/hooks/useWorkloadData";
import { useResourceStore } from "@/stores/resourceStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import { bt, cardSolid, inp } from "@/utils/styles";
import GanttChart from "@/components/resources/GanttChart";
import AlertsSection from "@/components/resources/AlertsSection";
import { useOrgStore, selectIsManager } from "@/stores/orgStore";
import { useAuthStore } from "@/stores/authStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import Avatar from "@/components/shared/Avatar";
import EstimatorScorecard from "@/components/shared/EstimatorScorecard";
import ReviewPanel from "@/components/shared/ReviewPanel";
import BarContextMenu from "@/components/resources/BarContextMenu";
import WeeklyPlanView from "@/components/resources/WeeklyPlanView";
import AnalyticsPanel from "@/components/resources/AnalyticsPanel";
import AutoScheduleModal from "@/components/resources/AutoScheduleModal";
import WhatIfModal from "@/components/resources/WhatIfModal";
import WorkloadTrendsPanel from "@/components/resources/WorkloadTrendsPanel";
import PdfExport from "@/components/resources/PdfExport";
import ResourceField from "@/components/resources/ResourceField";
import ResourcePulse from "@/components/resources/ResourcePulse";
import AtAGlance from "@/components/resources/AtAGlance";
import EstimatorHeatmap from "@/components/resources/EstimatorHeatmap";
import EstimatorContextMenu from "@/components/resources/EstimatorContextMenu";
import ProjectQuickActions from "@/components/resources/ProjectQuickActions";
import BoardView from "@/components/resources/BoardView";
import ScheduleSettings from "@/components/resources/ScheduleSettings";
import MyWorkloadView from "@/components/resources/MyWorkloadView";
import Modal from "@/components/shared/Modal";
import { useCollaborationStore } from "@/stores/collaborationStore";

/* ────────────────────────────────────────────────────────
   ResourcePage — Gantt Timeline

   Day-by-day Gantt chart showing each estimator's workload:
   • Left column: estimator names + utilization indicators
   • Right area: scrollable day columns with project bars
   • Bars show % complete, schedule status colors
   • Today line, unassigned queue at bottom
   ──────────────────────────────────────────────────────── */

// ── Constants ────────────────────────────────────────────
// Theme-aware status colors — call with C from useTheme()
const getStatusColors = (C) => ({
  Qualifying: C.orange,
  Bidding: C.purple,
  Submitted: C.blue,
  Won: C.green,
  Lost: C.red,
  "On Hold": C.yellow,
  Draft: C.textDim,
});

const SCHEDULE_COLORS = {
  ahead: "#30D158",
  "on-track": "#60A5FA",
  behind: "#FF9500",
  overdue: "#FF3B30",
  conflict: "#FF3B30",
};

function utilizationColor(hours, capacity = 7) {
  const pct = hours / capacity;
  if (pct <= 0) return "transparent";
  if (pct <= 0.5) return "#30D158";
  if (pct <= 0.875) return "#FF9500";
  if (pct <= 1.0) return "#FBBF24";
  return "#FF3B30";
}

// ── Date Helpers ─────────────────────────────────────────
const toDateStr = dt =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

const parseDateStr = s => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

const _isWeekdayFn = (d, workWeek = "mon-fri") => {
  const day = d.getDay();
  if (workWeek === "mon-sat") return day !== 0; // Sun off only
  return day !== 0 && day !== 6;
};

const hexAlpha = (hex, alpha) => {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return hex + a;
};

const TODAY = toDateStr(new Date());

const DAY_WIDTH = 44; // px per day column

// EstimatorContextMenu — extracted to @/components/resources/EstimatorContextMenu.jsx
// GanttChart — extracted to @/components/resources/GanttChart.jsx
// AlertsSection — extracted to @/components/resources/AlertsSection.jsx
// ══════════════════════════════════════════════════════════
// SCHEDULE LEGEND
// ══════════════════════════════════════════════════════════
function ScheduleLegend({ C, T }) {
  const items = [
    { label: "Ahead", color: SCHEDULE_COLORS.ahead },
    { label: "On Track", color: SCHEDULE_COLORS["on-track"] },
    { label: "Behind", color: SCHEDULE_COLORS.behind },
    { label: "Overdue", color: SCHEDULE_COLORS.overdue },
    { label: "Conflict", color: SCHEDULE_COLORS.conflict },
  ];
  return (
    <div style={{ display: "flex", gap: T.space[4], alignItems: "center" }}>
      {items.map(item => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: item.color }} />
          <span style={{ fontSize: 9, color: C.textDim }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// GANTT RANGE CONTROLS
// ══════════════════════════════════════════════════════════
function GanttRangeNav({ rangeLabel, onPrev, onNext, onToday, C, T }) {
  const btnStyle = {
    ...bt(C),
    padding: "4px 10px",
    fontSize: T.fontSize.sm,
    borderRadius: T.radius.sm,
    color: C.textMuted,
    background: C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1px solid ${C.border}`,
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
      <button onClick={onPrev} style={btnStyle}>
        ←
      </button>
      <span
        style={{
          fontSize: T.fontSize.base,
          fontWeight: T.fontWeight.semibold,
          color: C.text,
          minWidth: 200,
          textAlign: "center",
        }}
      >
        {rangeLabel}
      </span>
      <button onClick={onNext} style={btnStyle}>
        →
      </button>
      <button
        onClick={onToday}
        style={{ ...btnStyle, marginLeft: T.space[2], color: C.accent, borderColor: `${C.accent}30` }}
      >
        Today
      </button>
    </div>
  );
}

// ProjectQuickActions — extracted to @/components/resources/ProjectQuickActions.jsx
// BoardView — extracted to @/components/resources/BoardView.jsx
// ══════════════════════════════════════════════════════════
// BY HOURS VIEW
// ══════════════════════════════════════════════════════════
function ByHoursView({ workload, C, T, navigate, onProjectClick }) {
  const { estimatorRows, unassignedEstimates, CAPACITY_HOURS, effectiveHoursPerDay, dailyLoad } = workload;
  const capHours = effectiveHoursPerDay || CAPACITY_HOURS;
  const todayStr = new Date().toISOString().slice(0, 10);

  const ProgressBar = ({ value, max, color }) => (
    <div
      style={{
        height: 6,
        borderRadius: 3,
        background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
        overflow: "hidden",
        flex: 1,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.min(100, max > 0 ? (value / max) * 100 : 0)}%`,
          background: color,
          borderRadius: 3,
          transition: "width 300ms",
        }}
      />
    </div>
  );

  const EstimateRow = ({ est, estimatorName }) => {
    const color = SCHEDULE_COLORS[est.scheduleStatus] || C.purple;
    return (
      <div
        onClick={e => {
          if (onProjectClick) {
            onProjectClick({ ...est, estimator: estimatorName || "" }, e);
          } else {
            navigate(`/estimate/${est.id}/info`);
          }
        }}
        onDoubleClick={() => navigate(`/estimate/${est.id}/info`)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: T.space[3],
          padding: `${T.space[2]}px ${T.space[3]}px`,
          borderRadius: T.radius.sm,
          cursor: "pointer",
          background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
          border: `1px solid ${C.border}40`,
          transition: "background 100ms",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: T.fontSize.xs,
              fontWeight: T.fontWeight.semibold,
              color: C.text,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {est.name}
          </div>
          {est.bidDue && (
            <div style={{ fontSize: 9, color: C.textDim, marginTop: 1 }}>
              Due {parseDateStr(est.bidDue).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {est.daysRemaining > 0
                ? ` · ${est.daysRemaining}d left`
                : est.daysRemaining === 0
                  ? " · Today"
                  : " · Overdue"}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2], flexShrink: 0 }}>
          <ProgressBar value={est.hoursLogged} max={est.estimatedHours} color={color} />
          <span style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, minWidth: 60, textAlign: "right" }}>
            {est.hoursLogged}h / {est.estimatedHours}h
          </span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: T.space[4] }}>
      {estimatorRows.map(row => {
        const totalHours = row.estimates.reduce((s, e) => s + e.estimatedHours, 0);
        const totalLogged = row.estimates.reduce((s, e) => s + e.hoursLogged, 0);
        const sorted = [...row.estimates].sort((a, b) => b.estimatedHours - a.estimatedHours);
        // Daily capacity used — read actual overlapping load for today
        const todayLoad = dailyLoad?.get(todayStr)?.get(row.name);
        const dailyHours = todayLoad?.totalHours || 0;
        const utilPct = Math.round((dailyHours / capHours) * 100);
        const utilColor = utilizationColor(dailyHours, capHours);

        return (
          <div key={row.name} style={{ ...cardSolid(C), padding: T.space[4] }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: T.space[3], marginBottom: T.space[3] }}>
              <Avatar name={row.name} color={row.color} size={32} fontSize={12} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: T.fontSize.base, fontWeight: T.fontWeight.bold, color: C.text }}>
                  {row.name}
                </div>
                <div style={{ fontSize: 9, color: C.textDim }}>
                  {row.estimates.length} active project{row.estimates.length !== 1 ? "s" : ""}
                </div>
              </div>
              {/* Utilization badge */}
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: utilColor,
                  padding: "3px 8px",
                  borderRadius: T.radius.sm,
                  background: hexAlpha(utilColor, 0.12),
                }}
              >
                {utilPct}% utilized
              </div>
            </div>

            {/* Hours summary */}
            <div style={{ display: "flex", gap: T.space[4], marginBottom: T.space[3] }}>
              <div>
                <div style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text }}>
                  {totalHours}h
                </div>
                <div style={{ fontSize: 8, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Estimated
                </div>
              </div>
              <div>
                <div style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text }}>
                  {totalLogged}h
                </div>
                <div style={{ fontSize: 8, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Logged
                </div>
              </div>
              <div>
                <div style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text }}>
                  {Math.max(0, totalHours - totalLogged)}h
                </div>
                <div style={{ fontSize: 8, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Remaining
                </div>
              </div>
            </div>

            {/* Utilization bar */}
            <div style={{ marginBottom: T.space[3] }}>
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, utilPct)}%`,
                    background: utilColor,
                    borderRadius: 2,
                    transition: "width 300ms",
                  }}
                />
              </div>
            </div>

            {/* Estimates list */}
            <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>
              {sorted.map(est => (
                <EstimateRow key={est.id} est={est} estimatorName={row.name} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Unassigned card */}
      {unassignedEstimates.length > 0 && (
        <div style={{ ...cardSolid(C), padding: T.space[4], border: `1px solid #FBBF2430` }}>
          <div style={{ display: "flex", alignItems: "center", gap: T.space[3], marginBottom: T.space[3] }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "#FBBF2420",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
              }}
            >
              ?
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: T.fontSize.base, fontWeight: T.fontWeight.bold, color: "#FBBF24" }}>
                Unassigned
              </div>
              <div style={{ fontSize: 9, color: C.textDim }}>
                {unassignedEstimates.length} project{unassignedEstimates.length !== 1 ? "s" : ""} need assignment
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>
            {unassignedEstimates.map(est => (
              <EstimateRow key={est.id} est={est} estimatorName="" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// BY DUE DATE VIEW
// ══════════════════════════════════════════════════════════
function ByDueDateView({ workload, C, T, navigate, onProjectClick }) {
  const { allEstimates } = workload;
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Sort by bid due date (soonest first)
  const sorted = useMemo(() => {
    return [...(allEstimates || [])].sort((a, b) => {
      if (!a.bidDue) return 1;
      if (!b.bidDue) return -1;
      return a.bidDue.localeCompare(b.bidDue);
    });
  }, [allEstimates]);

  // Group by week
  const weeks = useMemo(() => {
    const groups = new Map();
    const _todayKey = toDateStr(today);

    for (const est of sorted) {
      if (!est.bidDue) continue;
      const due = parseDateStr(est.bidDue);
      // Get Monday of due week
      const day = due.getDay();
      const monday = new Date(due);
      monday.setDate(due.getDate() - ((day + 6) % 7));
      const weekKey = toDateStr(monday);

      // Label
      const thisMonday = new Date(today);
      thisMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      const thisMondayKey = toDateStr(thisMonday);
      const nextMonday = addDays(thisMonday, 7);
      const nextMondayKey = toDateStr(nextMonday);

      let label;
      if (weekKey < thisMondayKey) label = "Overdue";
      else if (weekKey === thisMondayKey) label = "This Week";
      else if (weekKey === nextMondayKey) label = "Next Week";
      else label = `Week of ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

      if (!groups.has(label)) groups.set(label, { label, weekKey, estimates: [] });
      groups.get(label).estimates.push(est);
    }

    return Array.from(groups.values()).sort((a, b) => {
      // Overdue first, then chronological
      if (a.label === "Overdue") return -1;
      if (b.label === "Overdue") return 1;
      return a.weekKey.localeCompare(b.weekKey);
    });
  }, [sorted, today]);

  const urgencyColor = daysRemaining => {
    if (daysRemaining < 0) return "#FF3B30"; // overdue
    if (daysRemaining <= 3) return "#FF9500"; // critical
    if (daysRemaining <= 7) return "#FBBF24"; // warning
    return "#30D158"; // comfortable
  };

  if (sorted.length === 0) {
    return (
      <div style={{ ...cardSolid(C), padding: T.space[6], textAlign: "center" }}>
        <div style={{ fontSize: T.fontSize.md, color: C.textMuted }}>No active bids with due dates</div>
        <div style={{ fontSize: T.fontSize.xs, color: C.textDim, marginTop: 4 }}>
          Set bid due dates on your estimates to see them here
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.space[5] }}>
      {weeks.map(week => (
        <div key={week.label}>
          {/* Week header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: T.space[2],
              marginBottom: T.space[3],
            }}
          >
            <div
              style={{
                fontSize: T.fontSize.sm,
                fontWeight: T.fontWeight.bold,
                color: week.label === "Overdue" ? "#FF3B30" : C.text,
              }}
            >
              {week.label}
            </div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: C.textDim,
                padding: "2px 8px",
                borderRadius: T.radius.full,
                background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              }}
            >
              {week.estimates.length} bid{week.estimates.length !== 1 ? "s" : ""}
            </div>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          {/* Estimate cards */}
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: T.space[3] }}
          >
            {week.estimates.map(est => {
              const uColor = urgencyColor(est.daysRemaining);
              const schedColor = SCHEDULE_COLORS[est.scheduleStatus] || C.purple;
              const hoursRemaining = Math.max(0, est.estimatedHours - est.hoursLogged);
              return (
                <div
                  key={est.id}
                  onClick={e => {
                    if (onProjectClick) {
                      onProjectClick({ ...est, estimator: est.estimator || "" }, e);
                    } else {
                      navigate(`/estimate/${est.id}/info`);
                    }
                  }}
                  onDoubleClick={() => navigate(`/estimate/${est.id}/info`)}
                  style={{
                    ...cardSolid(C),
                    padding: T.space[3],
                    cursor: "pointer",
                    borderLeft: `3px solid ${uColor}`,
                    transition: "background 100ms",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: T.space[3] }}>
                    {/* Estimator avatar */}
                    {est.estimator ? (
                      <Avatar name={est.estimator} color={est.estimatorColor} size={28} fontSize={10} />
                    ) : (
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: "#FBBF2420",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          color: "#FBBF24",
                        }}
                      >
                        ?
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Name */}
                      <div
                        style={{
                          fontSize: T.fontSize.sm,
                          fontWeight: T.fontWeight.semibold,
                          color: C.text,
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {est.name}
                      </div>
                      {/* Estimator name */}
                      <div style={{ fontSize: 9, color: C.textDim, marginTop: 1 }}>{est.estimator || "Unassigned"}</div>
                    </div>

                    {/* Due date badge */}
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: uColor,
                        padding: "3px 8px",
                        borderRadius: T.radius.sm,
                        background: hexAlpha(uColor, 0.12),
                        flexShrink: 0,
                      }}
                    >
                      {est.daysRemaining < 0
                        ? `${Math.abs(est.daysRemaining)}d overdue`
                        : est.daysRemaining === 0
                          ? "Due today"
                          : `${est.daysRemaining}d left`}
                    </div>
                  </div>

                  {/* Stats row */}
                  <div style={{ display: "flex", gap: T.space[4], marginTop: T.space[2], paddingLeft: 40 }}>
                    <div style={{ fontSize: 9, color: C.textDim }}>
                      <span style={{ fontWeight: 600, color: C.text }}>{est.estimatedHours}h</span> estimated
                    </div>
                    <div style={{ fontSize: 9, color: C.textDim }}>
                      <span style={{ fontWeight: 600, color: C.text }}>{est.hoursLogged}h</span> logged
                    </div>
                    <div style={{ fontSize: 9, color: C.textDim }}>
                      <span style={{ fontWeight: 600, color: uColor }}>{hoursRemaining}h</span> remaining
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ marginTop: T.space[2], paddingLeft: 40 }}>
                    <div
                      style={{
                        height: 4,
                        borderRadius: 2,
                        background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${est.percentComplete}%`,
                          background: schedColor,
                          borderRadius: 2,
                          transition: "width 300ms",
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                      <span style={{ fontSize: 8, color: C.textDim }}>{est.percentComplete}% complete</span>
                      <span
                        style={{
                          fontSize: 8,
                          fontWeight: 600,
                          color: schedColor,
                          textTransform: "capitalize",
                        }}
                      >
                        {est.scheduleStatus?.replace("-", " ")}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ScheduleSettings — extracted to @/components/resources/ScheduleSettings.jsx

// ══════════════════════════════════════════════════════════
// RESOURCE GUIDE MODAL
// ══════════════════════════════════════════════════════════
const GUIDE_VIDEO_URL = null; // Set to a Loom/YouTube embed URL to show video section

const GUIDE_STEPS = [
  {
    num: "1",
    title: "Create & Set Status",
    desc: 'Create an estimate from the Projects page, then set its status to "Bidding" to make it appear here.',
  },
  {
    num: "2",
    title: "Drag to Assign",
    desc: "Unassigned projects appear in the amber tray at the top. Drag any project card onto an estimator to assign it.",
  },
  {
    num: "3",
    title: "Reassign Anytime",
    desc: "Drag a project between estimator columns to reassign. Drop it back on the unassigned tray to remove the assignment.",
  },
  {
    num: "4",
    title: "Track Utilization",
    desc: "Each estimator shows a utilization percentage — green means capacity, amber means busy, red means overloaded.",
  },
  {
    num: "5",
    title: "NOVA Plan & Scenarios",
    desc: 'Use "NOVA Plan" to auto-balance workloads, or "Scenarios" to simulate adding or removing projects.',
  },
];

const GUIDE_TIPS = [
  "Use This Week view for day-by-day scheduling and drag-to-reschedule",
  "Double-click any project card to jump straight to the estimate",
  "The schedule status dot on each card shows if it's ahead, on-track, or behind",
  "Use the By Hours view to see detailed time breakdowns per estimator",
];

function ResourceGuideModal({ open, onClose }) {
  const C = useTheme();
  const T = C.T;

  return (
    <Modal open={open} onClose={onClose} wide>
      {/* Header */}
      <div style={{ marginBottom: T.space[5] }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div
              style={{
                fontSize: T.fontSize.xl,
                fontWeight: T.fontWeight.bold,
                color: C.text,
                letterSpacing: "-0.01em",
              }}
            >
              Resource Management
            </div>
            <div style={{ fontSize: T.fontSize.sm, color: C.textMuted, marginTop: 2 }}>
              Assign estimators, balance workloads, and track capacity
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              ...bt(C),
              padding: "6px 14px",
              fontSize: T.fontSize.xs,
              fontWeight: 600,
              color: C.textMuted,
              border: `1px solid ${C.border}`,
              borderRadius: T.radius.sm,
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Video Section (if URL is set) */}
      {GUIDE_VIDEO_URL && (
        <div
          style={{
            marginBottom: T.space[5],
            borderRadius: T.radius.md,
            overflow: "hidden",
            border: `1px solid ${C.border}`,
            aspectRatio: "16/9",
          }}
        >
          <iframe
            src={GUIDE_VIDEO_URL}
            title="Resource Management Guide"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        </div>
      )}

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: T.space[3], marginBottom: T.space[5] }}>
        {GUIDE_STEPS.map(step => (
          <div
            key={step.num}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: T.space[3],
              padding: `${T.space[3]}px ${T.space[4]}px`,
              borderRadius: T.radius.md,
              background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              border: `1px solid ${C.border}30`,
            }}
          >
            {/* Step number circle */}
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: `${C.accent}15`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 800,
                color: C.accent,
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              {step.num}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: T.fontSize.sm,
                  fontWeight: T.fontWeight.bold,
                  color: C.text,
                  marginBottom: 2,
                }}
              >
                {step.title}
              </div>
              <div style={{ fontSize: T.fontSize.xs, color: C.textMuted, lineHeight: 1.5 }}>{step.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Pro Tips */}
      <div
        style={{
          padding: `${T.space[3]}px ${T.space[4]}px`,
          borderRadius: T.radius.md,
          background: C.accentBg,
          border: `1px solid ${C.accent}20`,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.accent,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: T.space[2],
          }}
        >
          Pro Tips
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {GUIDE_TIPS.map((tip, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ color: C.accent, fontSize: 10, marginTop: 2, flexShrink: 0 }}>&#9679;</span>
              <span style={{ fontSize: T.fontSize.xs, color: C.textMuted, lineHeight: 1.5 }}>{tip}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════
// CONFLICT PULSE ANIMATION
// ══════════════════════════════════════════════════════════
const conflictKeyframes = document.createElement("style");
conflictKeyframes.textContent = `
  @keyframes conflictPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
`;
if (!document.querySelector("[data-conflict-pulse]")) {
  conflictKeyframes.setAttribute("data-conflict-pulse", "");
  document.head.appendChild(conflictKeyframes);
}

// MyWorkloadView — extracted to @/components/resources/MyWorkloadView.jsx

// ══════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════
export default function ResourcePage() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const {
    selectedDate: _selectedDate,
    setSelectedDate: _setSelectedDate,
    sidebarCollapsed: _sidebarCollapsed,
    setSidebarCollapsed: _setSidebarCollapsed,
    sortMode,
    setSortMode,
  } = useResourceStore();

  // Range state: shift by 2-week increments
  const [rangeOffset, setRangeOffset] = useState(0);
  const dateRange = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = addDays(today, -14 + rangeOffset * 14);
    const end = addDays(today, 42 + rangeOffset * 14);
    return { start: toDateStr(start), end: toDateStr(end) };
  }, [rangeOffset]);

  const workWeek = useUiStore(s => s.appSettings?.workWeek) || "mon-fri";
  const workload = useWorkloadData(dateRange);
  const [scorecardEstimator, setScorecardEstimator] = useState(null);
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [showAutoSchedule, setShowAutoSchedule] = useState(false);
  const [showWhatIf, setShowWhatIf] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [quickAction, setQuickAction] = useState(null); // { id, name, x, y, ... } for ProjectQuickActions popover
  const pendingReviews = useCollaborationStore(s => s.reviews.filter(r => r.status !== "completed").length);
  const isManager = useOrgStore(selectIsManager);
  const hasOrg = !!useOrgStore(s => s.org);

  // ── Estimator role-gate: show simplified My Workload view ──
  if (hasOrg && !isManager) return <MyWorkloadView />;

  // KPI summary
  const activeEstimators = workload.estimatorRows.length;
  const totalActiveBids =
    workload.estimatorRows.reduce((s, r) => s + r.estimates.length, 0) + workload.unassignedEstimates.length;
  const overloadWarnings = workload.warnings.filter(w => w.type === "overloaded").length;

  // Schedule health
  const _scheduleHealth = useMemo(() => {
    const all = workload.estimatorRows.flatMap(r => r.estimates);
    const behind = all.filter(e => e.scheduleStatus === "behind" || e.scheduleStatus === "overdue").length;
    const ahead = all.filter(e => e.scheduleStatus === "ahead").length;
    return { total: all.length, behind, ahead };
  }, [workload.estimatorRows]);

  // Range label
  const rangeLabel = useMemo(() => {
    if (!workload.rangeStart || !workload.rangeEnd) return "";
    const start = parseDateStr(workload.rangeStart);
    const end = parseDateStr(workload.rangeEnd);
    const opts = { month: "short", day: "numeric" };
    return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}, ${end.getFullYear()}`;
  }, [workload.rangeStart, workload.rangeEnd]);

  // Drag-and-drop handler: team-aware reassign estimate
  const handleDrop = useCallback(
    (estimateId, targetEstimator, fromEstimator) => {
      if (!estimateId) return;
      const est = workload.allEstimates?.find(e => e.id === estimateId);
      const estName = est?.name || "Estimate";
      const store = useEstimatesStore.getState();

      // Get current team state
      const lead = est?.estimator || "";
      const coEstimators = [...(est?.coEstimators || [])];
      const team = [lead, ...coEstimators].filter(Boolean);

      if (!targetEstimator) {
        // Dropped on unassigned — remove the dragged member from the team
        if (team.length <= 1) {
          // Solo estimator → just clear
          store.updateIndexEntry(estimateId, { estimator: "", coEstimators: [] });
        } else if (fromEstimator === lead) {
          // Removing lead → promote first co-estimator
          const newLead = coEstimators[0] || "";
          store.updateIndexEntry(estimateId, { estimator: newLead, coEstimators: coEstimators.slice(1) });
        } else {
          // Removing co-estimator
          store.updateIndexEntry(estimateId, { coEstimators: coEstimators.filter(c => c !== fromEstimator) });
        }
        useUiStore.getState().showToast(`Removed ${fromEstimator || "estimator"} from "${estName}"`, "success");
      } else if (team.length <= 1) {
        // Solo estimator — simple reassign (old behavior)
        store.updateIndexEntry(estimateId, { estimator: targetEstimator });
        useUiStore.getState().showToast(`Assigned "${estName}" to ${targetEstimator}`, "success");
      } else {
        // Team estimate — replace the dragged member with the target
        if (fromEstimator === lead) {
          store.updateIndexEntry(estimateId, { estimator: targetEstimator });
        } else {
          const newCo = coEstimators.map(c => (c === fromEstimator ? targetEstimator : c));
          store.updateIndexEntry(estimateId, { coEstimators: newCo });
        }
        useUiStore.getState().showToast(`Replaced ${fromEstimator} with ${targetEstimator} on "${estName}"`, "success");
      }
    },
    [workload.allEstimates],
  );

  // Project click handler — opens quick-actions popover
  const handleProjectClick = useCallback((est, e) => {
    setQuickAction({
      ...est,
      x: e.clientX + 8,
      y: e.clientY - 20,
    });
  }, []);

  return (
    <div
      style={{
        padding: `${T.space[6]}px ${T.space[7]}px`,
        maxWidth: 1600,
        margin: "0 auto",
        fontFamily: T.font?.display || "'Switzer', sans-serif",
      }}
    >
      {/* Page Title */}
      <div
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: T.space[5] }}
      >
        <div>
          <h1 style={{ fontSize: T.fontSize["2xl"], fontWeight: T.fontWeight.bold, color: C.text, margin: 0 }}>
            Resources
          </h1>
          <p style={{ fontSize: T.fontSize.sm, color: C.textMuted, marginTop: T.space[1] }}>
            Estimator workload timeline and capacity management
          </p>
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: "flex", gap: T.space[4], marginBottom: T.space[3] }}>
        {[
          { label: "Active Bids", value: totalActiveBids, color: C.purple },
          { label: "Estimators", value: activeEstimators, color: C.blue },
          {
            label: "Unassigned",
            value: workload.unassignedEstimates.length,
            color: workload.unassignedEstimates.length > 0 ? C.yellow : C.green,
          },
          {
            label: "Needs Action",
            value: workload.needsActionCount || 0,
            color: (workload.needsActionCount || 0) > 0 ? C.red : C.green,
            sub: (workload.needsActionCount || 0) > 0 ? "conflicts / overloads" : "all clear",
          },
          { label: "Overload Alerts", value: overloadWarnings, color: overloadWarnings > 0 ? C.red : C.green },
        ].map(kpi => (
          <div
            key={kpi.label}
            style={{
              flex: 1,
              ...cardSolid(C),
              padding: `${T.space[3]}px ${T.space[4]}px`,
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 700,
              }}
            >
              {kpi.label}
            </div>
            <div style={{ fontSize: T.fontSize["2xl"], fontWeight: T.fontWeight.bold, color: kpi.color, marginTop: 2 }}>
              {kpi.value}
            </div>
            {kpi.sub && <div style={{ fontSize: 8, color: C.textDim, marginTop: 1 }}>{kpi.sub}</div>}
          </div>
        ))}
      </div>

      {/* Action Toolbar — integrated below KPI cards */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: T.space[2],
          marginBottom: T.space[5],
          flexWrap: "wrap",
        }}
      >
        {isManager && <ScheduleSettings C={C} T={T} />}
        {isManager && (
          <>
            <button
              onClick={() => setShowAutoSchedule(true)}
              style={{
                ...bt(C),
                padding: "6px 14px",
                fontSize: T.fontSize.xs,
                fontWeight: 600,
                color: "#fff",
                background: `${C.accent}40`,
                border: `1px solid ${C.accent}60`,
                borderRadius: T.radius.sm,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              NOVA Plan
            </button>
            <button
              onClick={() => setShowWhatIf(true)}
              style={{
                ...bt(C),
                padding: "6px 14px",
                fontSize: T.fontSize.xs,
                fontWeight: 600,
                color: C.isDark ? "rgba(255,255,255,0.75)" : C.text,
                background: C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                border: `1px solid ${C.border}`,
                borderRadius: T.radius.sm,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              Scenarios
            </button>
          </>
        )}
        <button
          onClick={() => setShowReviewPanel(true)}
          style={{
            ...bt(C),
            padding: "6px 14px",
            fontSize: T.fontSize.xs,
            fontWeight: 600,
            color: "#fff",
            background: `${C.accent}30`,
            border: `1px solid ${C.accent}50`,
            borderRadius: T.radius.sm,
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          Reviews
          {pendingReviews > 0 && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "#fff",
                background: C.accent,
                borderRadius: T.radius.full,
                padding: "2px 7px",
                minWidth: 18,
                textAlign: "center",
                lineHeight: "1.2",
              }}
            >
              {pendingReviews}
            </span>
          )}
        </button>
        <PdfExport workload={workload} />
        <button
          onClick={() => setShowGuide(true)}
          style={{
            ...bt(C),
            padding: "6px 14px",
            fontSize: T.fontSize.xs,
            fontWeight: 600,
            color: C.isDark ? "rgba(255,255,255,0.75)" : C.text,
            background: C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
            border: `1px solid ${C.border}`,
            borderRadius: T.radius.sm,
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          How It Works
        </button>
      </div>

      {/* View Toggle Strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: T.space[4],
          flexWrap: "wrap",
          gap: T.space[3],
        }}
      >
        <div
          style={{
            display: "flex",
            background: C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
            borderRadius: T.radius.md,
            padding: 2,
            border: `1px solid ${C.border}`,
          }}
        >
          {[
            { key: "glance", label: "At a Glance" },
            { key: "board", label: "Board" },
            { key: "weekly", label: "Timeline" },
            { key: "hours", label: "By Hours" },
            { key: "due-date", label: "By Due Date" },
            { key: "analytics", label: "Analytics" },
          ].map(v => (
            <button
              key={v.key}
              onClick={() => setSortMode(v.key)}
              style={{
                ...bt(C),
                padding: "6px 16px",
                fontSize: T.fontSize.xs,
                fontWeight: sortMode === v.key ? T.fontWeight.bold : T.fontWeight.medium,
                color: sortMode === v.key ? "#fff" : C.isDark ? "rgba(255,255,255,0.65)" : C.text,
                background: sortMode === v.key ? (C.isDark ? "rgba(255,255,255,0.12)" : C.accent) : "transparent",
                borderRadius: T.radius.sm,
                border: sortMode === v.key ? `1px solid ${C.border}` : "1px solid transparent",
                boxShadow: sortMode === v.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 150ms",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Show legend + range nav only in timeline mode */}
        {sortMode === "timeline" && <ScheduleLegend C={C} T={T} />}
      </div>

      {/* Timeline Nav (only in timeline mode) */}
      {sortMode === "timeline" && (
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: T.space[4] }}
        >
          <GanttRangeNav
            rangeLabel={rangeLabel}
            onPrev={() => setRangeOffset(o => o - 1)}
            onNext={() => setRangeOffset(o => o + 1)}
            onToday={() => setRangeOffset(0)}
            C={C}
            T={T}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontSize: 9,
                color: C.textDim,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Week
            </span>
            {["mon-fri", "mon-sat"].map(ww => (
              <button
                key={ww}
                onClick={() => useUiStore.getState().updateSetting("workWeek", ww)}
                style={{
                  ...bt(C),
                  padding: "3px 8px",
                  fontSize: 9,
                  fontWeight: workWeek === ww ? 700 : 500,
                  color: workWeek === ww ? C.text : C.textMuted,
                  background: workWeek === ww ? (C.isDark ? "rgba(255,255,255,0.10)" : "#fff") : "transparent",
                  border: workWeek === ww ? `1px solid ${C.border}` : `1px solid transparent`,
                  borderRadius: T.radius.sm,
                }}
              >
                {ww === "mon-fri" ? "M-F" : "M-Sa"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* At a Glance — daily overview */}
      {sortMode === "glance" && (
        <>
          <AtAGlance
            workload={workload}
            C={C}
            T={T}
            navigate={navigate}
            onProjectClick={handleProjectClick}
          />
          <div style={{ marginTop: T.space[4] }}>
            <EstimatorHeatmap workload={workload} C={C} T={T} />
          </div>
          <div style={{ marginTop: T.space[3] }}>
            <ResourcePulse />
          </div>
        </>
      )}

      {/* Board View (default — drag-and-drop assignment) */}
      {sortMode === "board" && (
        <>
          <BoardView
            workload={workload}
            C={C}
            T={T}
            navigate={navigate}
            onDrop={handleDrop}
            onProjectClick={handleProjectClick}
          />
          <div style={{ marginTop: T.space[4] }}>
            <EstimatorHeatmap workload={workload} C={C} T={T} />
          </div>
          <div style={{ marginTop: T.space[3] }}>
            <ResourcePulse />
          </div>
        </>
      )}

      {/* Timeline View (Gantt Chart) */}
      {sortMode === "timeline" && (
        <>
          <GanttChart
            workload={workload}
            C={C}
            T={T}
            navigate={navigate}
            onEstimatorClick={setScorecardEstimator}
            onDrop={handleDrop}
            workWeek={workWeek}
            onProjectClick={handleProjectClick}
          />
          <div style={{ marginTop: T.space[3] }}>
            <ResourcePulse />
          </div>
          <AlertsSection warnings={workload.warnings} C={C} T={T} />
        </>
      )}

      {/* Orbital Resource Field */}
      {sortMode === "field" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ width: "100%", height: "calc(100vh - 260px)", minHeight: 400 }}>
            <ResourceField />
          </div>
          <ResourcePulse />
        </div>
      )}

      {/* Weekly Plan View */}
      {sortMode === "weekly" && <WeeklyPlanView workload={workload} C={C} T={T} />}

      {/* By Hours View */}
      {sortMode === "hours" && (
        <ByHoursView workload={workload} C={C} T={T} navigate={navigate} onProjectClick={handleProjectClick} />
      )}

      {/* By Due Date View */}
      {sortMode === "due-date" && (
        <ByDueDateView workload={workload} C={C} T={T} navigate={navigate} onProjectClick={handleProjectClick} />
      )}

      {/* Analytics View */}
      {sortMode === "analytics" && (
        <AnalyticsPanel C={C} T={T} estimatorColors={new Map(workload.estimatorRows.map(r => [r.name, r.color]))} />
      )}

      {/* Workload Trends — shows on Timeline and Analytics views */}
      {(sortMode === "weekly" || sortMode === "analytics") && <WorkloadTrendsPanel workload={workload} C={C} T={T} />}

      {/* Estimator Scorecard Modal */}
      {scorecardEstimator && (
        <EstimatorScorecard
          open
          estimatorName={scorecardEstimator.name}
          color={scorecardEstimator.color}
          contextEstimate={scorecardEstimator.contextEstimate}
          estimatorProfile={scorecardEstimator.profile}
          onClose={() => setScorecardEstimator(null)}
        />
      )}

      {/* Review Panel Modal */}
      <ReviewPanel open={showReviewPanel} onClose={() => setShowReviewPanel(false)} />

      {/* Auto Schedule Modal */}
      {showAutoSchedule && <AutoScheduleModal workload={workload} onClose={() => setShowAutoSchedule(false)} />}

      {/* What If Modal */}
      {showWhatIf && <WhatIfModal workload={workload} onClose={() => setShowWhatIf(false)} />}

      {/* Resource Guide Modal */}
      <ResourceGuideModal open={showGuide} onClose={() => setShowGuide(false)} />

      {/* Project Quick Actions Popover */}
      {quickAction && (
        <ProjectQuickActions
          data={quickAction}
          onClose={() => setQuickAction(null)}
          estimatorRows={workload.estimatorRows}
          C={C}
          T={T}
          navigate={navigate}
        />
      )}
    </div>
  );
}
