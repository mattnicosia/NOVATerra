import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useWorkloadData } from "@/hooks/useWorkloadData";
import { useResourceStore } from "@/stores/resourceStore";
import { bt, cardSolid } from "@/utils/styles";
import Avatar from "@/components/shared/Avatar";
import EstimatorScorecard from "@/components/shared/EstimatorScorecard";
import ReviewPanel from "@/components/shared/ReviewPanel";
import { useReviewStore } from "@/stores/reviewStore";

/* ────────────────────────────────────────────────────────
   ResourcePage — Gantt Timeline

   Day-by-day Gantt chart showing each estimator's workload:
   • Left column: estimator names + utilization indicators
   • Right area: scrollable day columns with project bars
   • Bars show % complete, schedule status colors
   • Today line, unassigned queue at bottom
   ──────────────────────────────────────────────────────── */

// ── Constants ────────────────────────────────────────────
const STATUS_COLORS = {
  Bidding: "#A78BFA",
  Submitted: "#60A5FA",
  Won: "#34D399",
  Lost: "#FB7185",
  "On Hold": "#FBBF24",
  Draft: "#8E8E93",
};

const SCHEDULE_COLORS = {
  ahead: "#30D158",
  "on-track": "#60A5FA",
  behind: "#FF9500",
  overdue: "#FF3B30",
};

function utilizationColor(hours, capacity = 8) {
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

const isWeekday = d => {
  const day = d.getDay();
  return day !== 0 && day !== 6;
};

const hexAlpha = (hex, alpha) => {
  const a = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return hex + a;
};

const TODAY = toDateStr(new Date());

const DAY_WIDTH = 44; // px per day column

// ══════════════════════════════════════════════════════════
// GANTT CHART
// ══════════════════════════════════════════════════════════
function GanttChart({ workload, C, T, navigate, onEstimatorClick }) {
  const { estimatorRows, unassignedEstimates, CAPACITY_HOURS, rangeDays, rangeStart, rangeEnd } = workload;

  // Build day columns (weekdays only from rangeDays)
  const days = useMemo(() => {
    return rangeDays.map(dayStr => {
      const dt = parseDateStr(dayStr);
      return {
        key: dayStr,
        date: dt,
        dayNum: dt.getDate(),
        dayName: dt.toLocaleDateString("en-US", { weekday: "short" }),
        monthName: dt.toLocaleDateString("en-US", { month: "short" }),
        isToday: dayStr === TODAY,
        isMonday: dt.getDay() === 1,
      };
    });
  }, [rangeDays]);

  // Get today position index
  const todayIdx = days.findIndex(d => d.key === TODAY);
  const totalWidth = days.length * DAY_WIDTH;

  // Build estimate bars per row
  const rowData = useMemo(() => {
    return estimatorRows.map(row => {
      const bars = row.estimates.map(est => {
        const startIdx = days.findIndex(d => d.key === est.startDate);
        const endIdx = days.findIndex(d => d.key === est.bidDue);
        // Clamp to visible range
        const s = Math.max(0, startIdx >= 0 ? startIdx : 0);
        const e = Math.min(days.length - 1, endIdx >= 0 ? endIdx : days.length - 1);
        return {
          ...est,
          startCol: s,
          endCol: e,
          left: s * DAY_WIDTH,
          width: Math.max(DAY_WIDTH, (e - s + 1) * DAY_WIDTH - 4),
        };
      });
      return { ...row, bars };
    });
  }, [estimatorRows, days]);

  // Unassigned bars
  const unassignedBars = useMemo(() => {
    return unassignedEstimates.map(est => {
      const sKey = est.startDate || TODAY;
      const eKey = est.bidDue || TODAY;
      const startIdx = days.findIndex(d => d.key === sKey);
      const endIdx = days.findIndex(d => d.key === eKey);
      const s = Math.max(0, startIdx >= 0 ? startIdx : 0);
      const e = Math.min(days.length - 1, endIdx >= 0 ? endIdx : days.length - 1);
      return {
        ...est,
        startCol: s,
        endCol: e,
        left: s * DAY_WIDTH,
        width: Math.max(DAY_WIDTH, (e - s + 1) * DAY_WIDTH - 4),
      };
    });
  }, [unassignedEstimates, days]);

  // Tooltip state
  const [tooltip, setTooltip] = useState(null);

  const ROW_HEIGHT = 40;
  const HEADER_HEIGHT = 48;
  const LABEL_WIDTH = 200;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: T.radius.lg, overflow: "hidden" }}>
        {/* Left labels column */}
        <div
          style={{
            width: LABEL_WIDTH,
            flexShrink: 0,
            borderRight: `1px solid ${C.border}`,
            background: C.bg1,
            zIndex: 3,
          }}
        >
          {/* Label header */}
          <div
            style={{
              height: HEADER_HEIGHT,
              display: "flex",
              alignItems: "center",
              padding: `0 ${T.space[3]}px`,
              borderBottom: `1px solid ${C.border}`,
              fontSize: 9,
              fontWeight: 700,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Estimator
          </div>

          {/* Estimator rows */}
          {rowData.map(row => {
            // Compute daily utilization for this estimator
            const dailyHours = row.estimates.reduce((s, e) => s + e.hoursPerDay, 0);
            const utilColor = utilizationColor(dailyHours, CAPACITY_HOURS);
            return (
              <div
                key={row.name}
                onClick={() => onEstimatorClick?.({ name: row.name, color: row.color })}
                style={{
                  height: Math.max(ROW_HEIGHT, row.bars.length * 22 + 12),
                  display: "flex",
                  alignItems: "center",
                  gap: T.space[2],
                  padding: `0 ${T.space[3]}px`,
                  borderBottom: `1px solid ${C.border}08`,
                  cursor: "pointer",
                }}
              >
                <Avatar name={row.name} color={row.color} size={24} fontSize={10} />
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
                    {row.name}
                  </div>
                  <div style={{ fontSize: 9, color: C.textDim }}>
                    {row.estimates.length} project{row.estimates.length !== 1 ? "s" : ""}
                  </div>
                </div>
                {/* Utilization indicator */}
                {dailyHours > 0 && (
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: utilColor,
                      padding: "2px 6px",
                      borderRadius: T.radius.sm,
                      background: hexAlpha(utilColor, 0.12),
                    }}
                  >
                    {Math.round(dailyHours * 10) / 10}h
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned section */}
          {unassignedBars.length > 0 && (
            <div
              style={{
                height: Math.max(ROW_HEIGHT, unassignedBars.length * 22 + 12),
                display: "flex",
                alignItems: "center",
                gap: T.space[2],
                padding: `0 ${T.space[3]}px`,
                borderTop: `2px solid ${C.border}`,
                background: C.isDark ? "#FBBF2406" : "#FBBF240A",
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "#FBBF2420",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                }}
              >
                ?
              </div>
              <div>
                <div style={{ fontSize: T.fontSize.xs, fontWeight: T.fontWeight.semibold, color: "#FBBF24" }}>
                  Unassigned
                </div>
                <div style={{ fontSize: 9, color: C.textDim }}>
                  {unassignedBars.length} project{unassignedBars.length !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right scrollable timeline area */}
        <div style={{ flex: 1, overflowX: "auto", position: "relative" }}>
          <div style={{ minWidth: totalWidth, position: "relative" }}>
            {/* Day headers */}
            <div
              style={{
                display: "flex",
                height: HEADER_HEIGHT,
                borderBottom: `1px solid ${C.border}`,
                position: "sticky",
                top: 0,
                background: C.bg1,
                zIndex: 2,
              }}
            >
              {days.map(day => (
                <div
                  key={day.key}
                  style={{
                    width: DAY_WIDTH,
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRight: day.isMonday ? `1px solid ${C.border}` : `1px solid ${C.border}08`,
                    background: day.isToday ? `${C.accent}0C` : "transparent",
                  }}
                >
                  {/* Show month label on 1st and Mondays */}
                  {(day.dayNum === 1 || day.isMonday) && (
                    <div style={{ fontSize: 8, color: C.textDim, fontWeight: 600, lineHeight: 1 }}>
                      {day.monthName}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 9,
                      color: day.isToday ? C.accent : C.textDim,
                      fontWeight: day.isToday ? 700 : 400,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {day.dayName.slice(0, 1)}
                  </div>
                  <div
                    style={{
                      fontSize: T.fontSize.xs,
                      fontWeight: day.isToday ? T.fontWeight.bold : T.fontWeight.semibold,
                      color: day.isToday ? C.accent : C.text,
                    }}
                  >
                    {day.dayNum}
                  </div>
                </div>
              ))}
            </div>

            {/* Today line */}
            {todayIdx >= 0 && (
              <div
                style={{
                  position: "absolute",
                  left: todayIdx * DAY_WIDTH + DAY_WIDTH / 2,
                  top: HEADER_HEIGHT,
                  bottom: 0,
                  width: 2,
                  background: C.accent,
                  opacity: 0.4,
                  zIndex: 1,
                  pointerEvents: "none",
                  borderRadius: 1,
                }}
              />
            )}

            {/* Estimator rows with bars */}
            {rowData.map(row => {
              const rowHeight = Math.max(ROW_HEIGHT, row.bars.length * 22 + 12);
              return (
                <div
                  key={row.name}
                  style={{
                    position: "relative",
                    height: rowHeight,
                    borderBottom: `1px solid ${C.border}08`,
                    display: "flex",
                  }}
                >
                  {/* Day grid lines */}
                  {days.map(day => (
                    <div
                      key={day.key}
                      style={{
                        width: DAY_WIDTH,
                        flexShrink: 0,
                        borderRight: day.isMonday ? `1px solid ${C.border}15` : `1px solid ${C.border}06`,
                        background: day.isToday ? `${C.accent}04` : "transparent",
                      }}
                    />
                  ))}

                  {/* Project bars (absolute positioned over grid) */}
                  {row.bars.map((bar, i) => {
                    const color = SCHEDULE_COLORS[bar.scheduleStatus] || STATUS_COLORS[bar.status] || "#A78BFA";
                    return (
                      <div
                        key={bar.id}
                        onClick={e => {
                          e.stopPropagation();
                          navigate(`/estimate/${bar.id}/info`);
                        }}
                        onMouseEnter={() =>
                          setTooltip({
                            name: bar.name,
                            hours: `${bar.hoursLogged}h / ${bar.estimatedHours}h`,
                            pct: bar.percentComplete,
                            daysLeft: bar.daysRemaining,
                            status: bar.scheduleStatus,
                          })
                        }
                        onMouseLeave={() => setTooltip(null)}
                        style={{
                          position: "absolute",
                          left: bar.left + 2,
                          top: 6 + i * 22,
                          width: bar.width,
                          height: 18,
                          borderRadius: 4,
                          overflow: "hidden",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          border: `1px solid ${color}40`,
                          transition: "opacity 100ms",
                        }}
                      >
                        {/* Fill portion (% complete) */}
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${bar.percentComplete}%`,
                            background: `${color}50`,
                            zIndex: 0,
                          }}
                        />
                        {/* Remaining portion */}
                        <div
                          style={{
                            position: "absolute",
                            left: `${bar.percentComplete}%`,
                            top: 0,
                            bottom: 0,
                            right: 0,
                            background: `${color}15`,
                            zIndex: 0,
                          }}
                        />
                        {/* Label */}
                        <div
                          style={{
                            position: "relative",
                            zIndex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "100%",
                            padding: "0 6px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              color: C.text,
                              overflow: "hidden",
                              whiteSpace: "nowrap",
                              textOverflow: "ellipsis",
                              flex: 1,
                            }}
                          >
                            {bar.name}
                          </span>
                          <span
                            style={{
                              fontSize: 8,
                              fontWeight: 700,
                              color,
                              flexShrink: 0,
                              marginLeft: 4,
                            }}
                          >
                            {bar.percentComplete}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Unassigned row */}
            {unassignedBars.length > 0 && (
              <div
                style={{
                  position: "relative",
                  height: Math.max(ROW_HEIGHT, unassignedBars.length * 22 + 12),
                  borderTop: `2px solid ${C.border}`,
                  background: C.isDark ? "#FBBF2403" : "#FBBF2406",
                  display: "flex",
                }}
              >
                {days.map(day => (
                  <div
                    key={day.key}
                    style={{
                      width: DAY_WIDTH,
                      flexShrink: 0,
                      borderRight: `1px solid ${C.border}06`,
                    }}
                  />
                ))}
                {unassignedBars.map((bar, i) => (
                  <div
                    key={bar.id}
                    onClick={e => {
                      e.stopPropagation();
                      navigate(`/estimate/${bar.id}/info`);
                    }}
                    style={{
                      position: "absolute",
                      left: bar.left + 2,
                      top: 6 + i * 22,
                      width: bar.width,
                      height: 18,
                      borderRadius: 4,
                      background: "#FBBF2420",
                      border: "1px solid #FBBF2430",
                      display: "flex",
                      alignItems: "center",
                      padding: "0 6px",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: "#FBBF24",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {bar.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: C.bg1,
            border: `1px solid ${C.border}`,
            borderRadius: T.radius.md,
            padding: `${T.space[3]}px ${T.space[4]}px`,
            boxShadow: T.shadow?.md || "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 100,
            fontSize: T.fontSize.xs,
            color: C.text,
            minWidth: 180,
          }}
        >
          <div style={{ fontWeight: T.fontWeight.bold, marginBottom: 4 }}>{tooltip.name}</div>
          <div style={{ color: C.textMuted }}>Hours: {tooltip.hours}</div>
          <div style={{ color: C.textMuted }}>Complete: {tooltip.pct}%</div>
          <div style={{ color: C.textMuted }}>Days remaining: {tooltip.daysLeft}</div>
          <div style={{ marginTop: 4 }}>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: SCHEDULE_COLORS[tooltip.status] || C.textMuted,
                padding: "2px 6px",
                borderRadius: T.radius.sm,
                background: hexAlpha(SCHEDULE_COLORS[tooltip.status] || "#8E8E93", 0.12),
                textTransform: "capitalize",
              }}
            >
              {tooltip.status}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ALERTS SECTION
// ══════════════════════════════════════════════════════════
function AlertsSection({ warnings, C, T }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div style={{ marginTop: T.space[5] }}>
      <div style={{ fontSize: T.fontSize.sm, fontWeight: 700, color: C.text, marginBottom: T.space[2] }}>Alerts</div>
      <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>
        {warnings.slice(0, 8).map((w, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: T.space[3],
              padding: `${T.space[2]}px ${T.space[3]}px`,
              background: w.type === "overloaded" ? "#FF3B3010" : "#FBBF2410",
              border: `1px solid ${w.type === "overloaded" ? "#FF3B3025" : "#FBBF2425"}`,
              borderRadius: T.radius.md,
              fontSize: T.fontSize.xs,
              color: C.text,
            }}
          >
            <span style={{ fontSize: 14 }}>{w.type === "overloaded" ? "🔴" : "⚠️"}</span>
            {w.type === "overloaded" && (
              <span>
                <strong>{w.estimator}</strong> is overloaded on{" "}
                {parseDateStr(w.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {w.hours}h
                scheduled
              </span>
            )}
            {w.type === "bid_cluster" && (
              <span>
                <strong>{w.count} bids</strong> due the week of{" "}
                {parseDateStr(w.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// SCHEDULE LEGEND
// ══════════════════════════════════════════════════════════
function ScheduleLegend({ C, T }) {
  const items = [
    { label: "Ahead", color: SCHEDULE_COLORS.ahead },
    { label: "On Track", color: SCHEDULE_COLORS["on-track"] },
    { label: "Behind", color: SCHEDULE_COLORS.behind },
    { label: "Overdue", color: SCHEDULE_COLORS.overdue },
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
      <button onClick={onPrev} style={btnStyle}>←</button>
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
      <button onClick={onNext} style={btnStyle}>→</button>
      <button onClick={onToday} style={{ ...btnStyle, marginLeft: T.space[2], color: C.accent, borderColor: `${C.accent}30` }}>
        Today
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════
export default function ResourcePage() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const {
    selectedDate,
    setSelectedDate,
    sidebarCollapsed,
    setSidebarCollapsed,
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

  const workload = useWorkloadData(dateRange);
  const [scorecardEstimator, setScorecardEstimator] = useState(null);
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const pendingReviews = useReviewStore(s => s.reviews.filter(r => r.status !== "completed").length);

  // KPI summary
  const activeEstimators = workload.estimatorRows.length;
  const totalActiveBids =
    workload.estimatorRows.reduce((s, r) => s + r.estimates.length, 0) + workload.unassignedEstimates.length;
  const overloadWarnings = workload.warnings.filter(w => w.type === "overloaded").length;

  // Schedule health
  const scheduleHealth = useMemo(() => {
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

  return (
    <div
      style={{
        padding: `${T.space[6]}px ${T.space[7]}px`,
        maxWidth: 1600,
        margin: "0 auto",
        fontFamily: T.font?.display || "'DM Sans',sans-serif",
      }}
    >
      {/* Page Title */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: T.space[5] }}>
        <div>
          <h1 style={{ fontSize: T.fontSize["2xl"], fontWeight: T.fontWeight.bold, color: C.text, margin: 0 }}>
            Resources
          </h1>
          <p style={{ fontSize: T.fontSize.sm, color: C.textMuted, marginTop: T.space[1] }}>
            Estimator workload timeline and capacity management
          </p>
        </div>
        <button
          onClick={() => setShowReviewPanel(true)}
          style={{
            ...bt(C),
            padding: "8px 16px",
            fontSize: T.fontSize.xs,
            fontWeight: 600,
            color: C.text,
            background: `${C.accent}12`,
            border: `1px solid ${C.accent}30`,
            borderRadius: T.radius.md,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ fontSize: 13 }}>📋</span>
          Reviews
          {pendingReviews > 0 && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "#fff",
                background: C.accent,
                borderRadius: T.radius.full,
                padding: "1px 6px",
                minWidth: 16,
                textAlign: "center",
              }}
            >
              {pendingReviews}
            </span>
          )}
        </button>
      </div>

      {/* KPI Strip */}
      <div style={{ display: "flex", gap: T.space[4], marginBottom: T.space[5] }}>
        {[
          { label: "Active Bids", value: totalActiveBids, color: "#A78BFA" },
          { label: "Estimators", value: activeEstimators, color: "#60A5FA" },
          {
            label: "Unassigned",
            value: workload.unassignedEstimates.length,
            color: workload.unassignedEstimates.length > 0 ? "#FBBF24" : "#34D399",
          },
          {
            label: "Behind Schedule",
            value: scheduleHealth.behind,
            color: scheduleHealth.behind > 0 ? "#FF9500" : "#30D158",
            sub: scheduleHealth.behind > 0 ? `of ${scheduleHealth.total}` : "all on track",
          },
          { label: "Overload Alerts", value: overloadWarnings, color: overloadWarnings > 0 ? "#FF3B30" : "#34D399" },
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

      {/* Nav + Legend Row */}
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
        <GanttRangeNav
          rangeLabel={rangeLabel}
          onPrev={() => setRangeOffset(o => o - 1)}
          onNext={() => setRangeOffset(o => o + 1)}
          onToday={() => setRangeOffset(0)}
          C={C}
          T={T}
        />
        <ScheduleLegend C={C} T={T} />
      </div>

      {/* Gantt Chart */}
      <GanttChart
        workload={workload}
        C={C}
        T={T}
        navigate={navigate}
        onEstimatorClick={setScorecardEstimator}
      />

      {/* Alerts */}
      <AlertsSection warnings={workload.warnings} C={C} T={T} />

      {/* Estimator Scorecard Modal */}
      {scorecardEstimator && (
        <EstimatorScorecard
          open
          estimatorName={scorecardEstimator.name}
          color={scorecardEstimator.color}
          onClose={() => setScorecardEstimator(null)}
        />
      )}

      {/* Review Panel Modal */}
      <ReviewPanel open={showReviewPanel} onClose={() => setShowReviewPanel(false)} />
    </div>
  );
}
