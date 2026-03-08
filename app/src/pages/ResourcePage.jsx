import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useWorkloadData } from "@/hooks/useWorkloadData";
import { useResourceStore } from "@/stores/resourceStore";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import { bt } from "@/utils/styles";
import Avatar from "@/components/shared/Avatar";
import EstimatorScorecard from "@/components/shared/EstimatorScorecard";
import ReviewPanel from "@/components/shared/ReviewPanel";
import { useReviewStore } from "@/stores/reviewStore";

/* ────────────────────────────────────────────────────────
   ResourcePage — Unified Resource Calendar

   One calendar that IS the resource manager:
   • Week view (power view): 5-column Mon-Fri grid with
     estimator sections, utilization tinting, bid events
   • Month view: utilization-tinted cells + mini-bars
   • Day view: full estimator breakdown for one day
   • Persistent unassigned queue sidebar (right)
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

function utilizationColor(hours, capacity = 8) {
  const pct = hours / capacity;
  if (pct <= 0) return "transparent";
  if (pct <= 0.5) return "#30D158";
  if (pct <= 0.875) return "#FF9500";
  if (pct <= 1.0) return "#FBBF24";
  return "#FF3B30";
}

function utilizationAlpha(hours, capacity = 8) {
  if (hours <= 0) return 0;
  const pct = Math.min(hours / capacity, 1.5);
  return 0.04 + pct * 0.08;
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

const getMonday = dateStr => {
  const dt = parseDateStr(dateStr);
  const day = dt.getDay();
  // Sunday=0 → go back 6, Monday=1 → go back 0, etc.
  dt.setDate(dt.getDate() - ((day + 6) % 7));
  return dt;
};

const fmtWeekRange = monday => {
  const fri = addDays(monday, 4);
  const opts = { month: "short", day: "numeric" };
  const mStr = monday.toLocaleDateString("en-US", opts);
  const fStr = fri.toLocaleDateString("en-US", opts);
  const year = monday.getFullYear();
  return `${mStr} – ${fStr}, ${year}`;
};

const fmtMonthYear = (year, month) =>
  new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

const fmtDayHeader = dateStr => {
  const dt = parseDateStr(dateStr);
  return dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
};

const hexAlpha = (hex, alpha) => {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return hex + a;
};

const TODAY = toDateStr(new Date());

// ── Time Budget Helpers ─────────────────────────────────
function countBusinessDays(from, to) {
  let count = 0;
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function getTimeBudget(est) {
  const spentMs = est.timerTotalMs || 0;
  const spentHours = spentMs / 3600000;
  const budgetHours = Number(est.estimatedHours) || 0;
  const remainingHours = Math.max(0, budgetHours - spentHours);
  const budgetPct = budgetHours > 0 ? (spentHours / budgetHours) * 100 : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = est.bidDue ? parseDateStr(est.bidDue) : null;
  const startDate = est.startDate ? parseDateStr(est.startDate) : today;

  const businessDaysLeft = dueDate && dueDate >= today ? countBusinessDays(today, dueDate) : 0;
  const businessDaysElapsed = startDate < today ? countBusinessDays(startDate, addDays(today, -1)) : 0;

  const burnRate = businessDaysElapsed > 0 ? spentHours / businessDaysElapsed : 0;
  const neededRate = businessDaysLeft > 0 ? remainingHours / businessDaysLeft : remainingHours > 0 ? 999 : 0;

  let status, statusColor, statusIcon;
  if (budgetHours <= 0) {
    status = "No budget";
    statusColor = "#8E8E93";
    statusIcon = "—";
  } else if (dueDate && today > dueDate && remainingHours > 0) {
    status = "Overdue";
    statusColor = "#FF3B30";
    statusIcon = "!!";
  } else if (budgetPct >= 100) {
    status = "Over budget";
    statusColor = "#FF3B30";
    statusIcon = "!!";
  } else if (businessDaysLeft <= 2 && remainingHours > businessDaysLeft * 8) {
    status = "At risk";
    statusColor = "#FF9500";
    statusIcon = "!";
  } else if (burnRate > 0 && neededRate > burnRate * 1.5) {
    status = "At risk";
    statusColor = "#FF9500";
    statusIcon = "!";
  } else {
    status = "On track";
    statusColor = "#30D158";
    statusIcon = "✓";
  }

  return {
    spentHours: Math.round(spentHours * 10) / 10,
    budgetHours,
    remainingHours: Math.round(remainingHours * 10) / 10,
    budgetPct: Math.round(Math.min(150, budgetPct)),
    burnRate: Math.round(burnRate * 10) / 10,
    neededRate: neededRate >= 999 ? "∞" : Math.round(neededRate * 10) / 10,
    businessDaysLeft,
    businessDaysElapsed,
    status,
    statusColor,
    statusIcon,
  };
}

// ══════════════════════════════════════════════════════════
// VIEW TOGGLE (glass segmented control)
// ══════════════════════════════════════════════════════════
function ViewToggle({ view, setView, C, T }) {
  const views = [
    { key: "month", label: "M" },
    { key: "week", label: "W" },
    { key: "day", label: "D" },
  ];
  return (
    <div
      style={{
        display: "inline-flex",
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${C.border}`,
        borderRadius: T.radius.md,
        padding: 2,
        gap: 1,
      }}
    >
      {views.map(v => (
        <button
          key={v.key}
          onClick={() => setView(v.key)}
          style={{
            ...bt(C),
            padding: "4px 12px",
            fontSize: T.fontSize.xs,
            fontWeight: view === v.key ? T.fontWeight.bold : T.fontWeight.normal,
            color: view === v.key ? C.text : C.textDim,
            background: view === v.key ? "rgba(255,255,255,0.08)" : "transparent",
            borderRadius: T.radius.sm,
            border: "none",
            minWidth: 28,
            justifyContent: "center",
          }}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// CALENDAR NAV (← title → + Today)
// ══════════════════════════════════════════════════════════
function CalendarNav({ view, selectedDate, viewMonth, setSelectedDate, setViewMonth, C, T }) {
  const goBack = useCallback(() => {
    if (view === "week") {
      const mon = getMonday(selectedDate);
      setSelectedDate(toDateStr(addDays(mon, -7)));
    } else if (view === "month") {
      const d = new Date(viewMonth.year, viewMonth.month - 1, 1);
      setViewMonth(d.getFullYear(), d.getMonth());
    } else {
      setSelectedDate(toDateStr(addDays(parseDateStr(selectedDate), -1)));
    }
  }, [view, selectedDate, viewMonth, setSelectedDate, setViewMonth]);

  const goForward = useCallback(() => {
    if (view === "week") {
      const mon = getMonday(selectedDate);
      setSelectedDate(toDateStr(addDays(mon, 7)));
    } else if (view === "month") {
      const d = new Date(viewMonth.year, viewMonth.month + 1, 1);
      setViewMonth(d.getFullYear(), d.getMonth());
    } else {
      setSelectedDate(toDateStr(addDays(parseDateStr(selectedDate), 1)));
    }
  }, [view, selectedDate, viewMonth, setSelectedDate, setViewMonth]);

  const goToday = useCallback(() => {
    setSelectedDate(TODAY);
    const now = new Date();
    setViewMonth(now.getFullYear(), now.getMonth());
  }, [setSelectedDate, setViewMonth]);

  let title = "";
  if (view === "week") title = fmtWeekRange(getMonday(selectedDate));
  else if (view === "month") title = fmtMonthYear(viewMonth.year, viewMonth.month);
  else title = fmtDayHeader(selectedDate);

  const btnStyle = {
    ...bt(C),
    padding: "4px 10px",
    fontSize: T.fontSize.sm,
    borderRadius: T.radius.sm,
    color: C.textMuted,
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${C.border}`,
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
      <button onClick={goBack} style={btnStyle}>
        ←
      </button>
      <span
        style={{
          fontSize: T.fontSize.base,
          fontWeight: T.fontWeight.semibold,
          color: C.text,
          minWidth: 180,
          textAlign: "center",
        }}
      >
        {title}
      </span>
      <button onClick={goForward} style={btnStyle}>
        →
      </button>
      <button
        onClick={goToday}
        style={{
          ...btnStyle,
          marginLeft: T.space[2],
          color: C.accent,
          borderColor: `${C.accent}30`,
        }}
      >
        Today
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// WEEK VIEW (the power view)
// ══════════════════════════════════════════════════════════
function WeekView({ workload, eventsByDate, C, T, navigate, selectedDate, setSelectedDate, setCalendarView }) {
  const { dailyLoad, teamDailyLoad, estimatorRows, CAPACITY_HOURS } = workload;

  // Mon-Fri of the week containing selectedDate
  const weekDays = useMemo(() => {
    const monday = getMonday(selectedDate);
    return Array.from({ length: 5 }, (_, i) => toDateStr(addDays(monday, i)));
  }, [selectedDate]);

  const teamCapacity = Math.max(1, estimatorRows.length) * CAPACITY_HOURS;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 1,
        background: `${C.border}20`,
        border: `1px solid ${C.border}`,
        borderRadius: T.radius.lg,
        overflow: "hidden",
      }}
    >
      {weekDays.map(dateStr => {
        const isToday = dateStr === TODAY;
        const teamLoad = teamDailyLoad.get(dateStr);
        const dayMap = dailyLoad.get(dateStr);
        const events = eventsByDate?.get?.(dateStr) || [];
        const teamHours = teamLoad?.totalHours || 0;
        const utilPct = teamCapacity > 0 ? teamHours / teamCapacity : 0;
        const bgColor = utilizationColor(teamHours, teamCapacity);
        const bgAlpha = utilizationAlpha(teamHours, teamCapacity);
        const dt = parseDateStr(dateStr);

        // Bid/walkthrough/RFI events only (not tasks)
        const bidEvents = events.filter(e => e.type === "bidDue" || e.type === "walkthrough" || e.type === "rfiDue");

        return (
          <div
            key={dateStr}
            style={{
              background: isToday ? `${C.accent}0C` : bgAlpha > 0 ? hexAlpha(bgColor, bgAlpha) : C.bg2,
              padding: T.space[2],
              minHeight: 220,
              display: "flex",
              flexDirection: "column",
              gap: T.space[1],
              borderLeft: isToday ? `2px solid ${C.accent}50` : "none",
            }}
          >
            {/* Date header + utilization badge */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
              <div>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: isToday ? C.accent : C.textDim,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {dt.toLocaleDateString("en-US", { weekday: "short" })}
                </div>
                <div
                  style={{
                    fontSize: T.fontSize.md,
                    fontWeight: isToday ? T.fontWeight.bold : T.fontWeight.semibold,
                    color: isToday ? C.accent : C.text,
                  }}
                >
                  {dt.getDate()}
                </div>
              </div>
              {teamHours > 0 && (
                <div
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: utilizationColor(teamHours, teamCapacity),
                    padding: "2px 6px",
                    borderRadius: T.radius.sm,
                    background: hexAlpha(utilizationColor(teamHours, teamCapacity), 0.12),
                  }}
                >
                  {Math.round(utilPct * 100)}%
                </div>
              )}
            </div>

            {/* Bid events */}
            {bidEvents.slice(0, 3).map((ev, i) => (
              <div
                key={i}
                onClick={e => {
                  e.stopPropagation();
                  if (ev.estimateId) navigate(`/estimate/${ev.estimateId}/info`);
                }}
                style={{
                  fontSize: 8,
                  fontWeight: 600,
                  color: ev.colorKey === "accent" ? C.accent : ev.colorKey === "orange" ? "#FF9500" : "#FF3B30",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  cursor: ev.estimateId ? "pointer" : "default",
                  lineHeight: 1.3,
                }}
              >
                {ev.type === "bidDue" ? "BID " : ev.type === "walkthrough" ? "WALK " : "RFI "}
                {ev.label}
              </div>
            ))}
            {bidEvents.length > 3 && <div style={{ fontSize: 7, color: C.textDim }}>+{bidEvents.length - 3} more</div>}

            {/* Estimator sections */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
              {dayMap &&
                Array.from(dayMap.entries())
                  .slice(0, 5)
                  .map(([estName, cell]) => {
                    const row = estimatorRows.find(r => r.name === estName);
                    const color = row?.color || "#A78BFA";
                    const utilColor = utilizationColor(cell.totalHours, CAPACITY_HOURS);
                    return (
                      <div
                        key={estName}
                        style={{
                          background: hexAlpha(color, 0.08),
                          borderRadius: 6,
                          padding: "4px 6px",
                          borderLeft: `3px solid ${color}`,
                        }}
                      >
                        {/* Estimator header */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
                          <Avatar name={estName} color={color} size={14} fontSize={7} />
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              color: C.text,
                              flex: 1,
                              overflow: "hidden",
                              whiteSpace: "nowrap",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {estName}
                          </span>
                          <span
                            style={{
                              fontSize: 8,
                              fontWeight: 700,
                              color: utilColor,
                              padding: "1px 4px",
                              borderRadius: 3,
                              background: hexAlpha(utilColor, 0.12),
                              flexShrink: 0,
                            }}
                          >
                            {Math.round(cell.totalHours * 10) / 10}h
                          </span>
                        </div>
                        {/* Estimate list with time budget */}
                        {cell.estimates.slice(0, 3).map(est => {
                          // Find full estimate for time budget
                          const fullEst = estimatorRows.flatMap(r => r.estimates).find(e => e.id === est.id);
                          const tb = fullEst ? getTimeBudget(fullEst) : null;
                          return (
                            <div
                              key={est.id}
                              onClick={e => {
                                e.stopPropagation();
                                navigate(`/estimate/${est.id}/info`);
                              }}
                              style={{
                                fontSize: 8,
                                color: C.textMuted,
                                padding: "1px 0 1px 9px",
                                overflow: "hidden",
                                whiteSpace: "nowrap",
                                textOverflow: "ellipsis",
                                cursor: "pointer",
                                lineHeight: 1.4,
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                            >
                              {tb && tb.budgetHours > 0 && (
                                <span
                                  style={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: "50%",
                                    background: tb.statusColor,
                                    flexShrink: 0,
                                    opacity: 0.9,
                                  }}
                                  title={`${tb.status}: ${tb.spentHours}/${tb.budgetHours}h (${tb.budgetPct}%)`}
                                />
                              )}
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{est.name}</span>
                            </div>
                          );
                        })}
                        {cell.estimates.length > 3 && (
                          <div style={{ fontSize: 7, color: C.textDim, paddingLeft: 9 }}>
                            +{cell.estimates.length - 3}
                          </div>
                        )}
                      </div>
                    );
                  })}
              {dayMap && dayMap.size > 5 && (
                <div style={{ fontSize: 8, color: C.textDim, textAlign: "center" }}>+{dayMap.size - 5} estimators</div>
              )}
              {(!dayMap || dayMap.size === 0) && bidEvents.length === 0 && (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    color: C.textDim,
                    opacity: 0.5,
                  }}
                >
                  Available
                </div>
              )}
            </div>

            {/* Click to expand */}
            <button
              onClick={() => {
                setSelectedDate(dateStr);
                setCalendarView("day");
              }}
              style={{
                ...bt(C),
                padding: "2px 0",
                fontSize: 8,
                color: C.textDim,
                background: "transparent",
                border: "none",
                justifyContent: "center",
                opacity: 0.5,
              }}
            >
              Detail →
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// MONTH VIEW (utilization-tinted + mini-bars)
// ══════════════════════════════════════════════════════════
function MonthView({ workload, eventsByDate, C, T, navigate, viewMonth, setSelectedDate, setCalendarView }) {
  const { estimatorRows, dailyLoad, teamDailyLoad, CAPACITY_HOURS } = workload;
  const { year, month } = viewMonth;
  const teamCapacity = Math.max(1, estimatorRows.length) * CAPACITY_HOURS;

  // Build estimator bars per day (which estimators work each day)
  const estimateBars = useMemo(() => {
    const bars = {};
    for (const row of estimatorRows) {
      for (const est of row.estimates) {
        for (const dayStr of est.workDays || []) {
          if (!bars[dayStr]) bars[dayStr] = [];
          // Deduplicate by estimator — one bar per estimator per day
          if (!bars[dayStr].find(b => b.estimator === row.name)) {
            bars[dayStr].push({ estimator: row.name, color: row.color, id: est.id });
          }
        }
      }
    }
    return bars;
  }, [estimatorRows]);

  // Build 42-cell grid
  const firstDay = new Date(year, month, 1);
  const startOfGrid = new Date(firstDay);
  startOfGrid.setDate(firstDay.getDate() - firstDay.getDay());

  const cells = [];
  const cursor = new Date(startOfGrid);
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return (
    <div
      style={{
        background: C.bg2,
        border: `1px solid ${C.border}`,
        borderRadius: T.radius.lg,
        overflow: "hidden",
      }}
    >
      {/* Day-of-week header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${C.border}` }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontSize: 9,
              fontWeight: 700,
              color: C.textDim,
              padding: `${T.space[2]}px 0`,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid: 6 rows × 7 cols */}
      {Array.from({ length: 6 }, (_, wi) => (
        <div
          key={wi}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            borderBottom: wi < 5 ? `1px solid ${C.border}08` : "none",
          }}
        >
          {cells.slice(wi * 7, wi * 7 + 7).map(day => {
            const dateStr = toDateStr(day);
            const isCurrentMonth = day.getMonth() === month;
            const isToday = dateStr === TODAY;
            const events = eventsByDate?.get?.(dateStr) || [];
            const bidEvents = events.filter(e => e.type === "bidDue");
            const dayBars = estimateBars[dateStr] || [];
            const teamLoad = teamDailyLoad.get(dateStr);
            const teamHours = teamLoad?.totalHours || 0;
            const bgColor = utilizationColor(teamHours, teamCapacity);
            const bgAlpha = utilizationAlpha(teamHours, teamCapacity);

            return (
              <div
                key={dateStr}
                onClick={() => {
                  setSelectedDate(dateStr);
                  setCalendarView("day");
                }}
                style={{
                  minHeight: 80,
                  padding: 4,
                  borderLeft: `1px solid ${C.border}06`,
                  background: isToday ? `${C.accent}0A` : bgAlpha > 0 ? hexAlpha(bgColor, bgAlpha) : "transparent",
                  opacity: isCurrentMonth ? 1 : 0.3,
                  cursor: "pointer",
                  transition: "background 100ms",
                }}
              >
                {/* Date number */}
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: isToday ? 700 : 400,
                    color: isToday ? C.accent : C.text,
                    marginBottom: 2,
                  }}
                >
                  {day.getDate()}
                </div>
                {/* Bid event labels */}
                {bidEvents.slice(0, 2).map((ev, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 7,
                      color: C.accent,
                      fontWeight: 600,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      lineHeight: 1.3,
                    }}
                  >
                    BID {ev.label}
                  </div>
                ))}
                {bidEvents.length > 2 && <div style={{ fontSize: 6, color: C.textDim }}>+{bidEvents.length - 2}</div>}
                {/* Estimator mini-bars */}
                {dayBars.slice(0, 4).map((bar, i) => (
                  <div
                    key={i}
                    style={{
                      height: 3,
                      borderRadius: 1.5,
                      background: bar.color,
                      marginTop: 1,
                      opacity: 0.7,
                    }}
                    title={bar.estimator}
                  />
                ))}
                {dayBars.length > 4 && (
                  <div style={{ fontSize: 6, color: C.textDim, marginTop: 1 }}>+{dayBars.length - 4}</div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: T.space[4],
          padding: `${T.space[2]}px ${T.space[4]}px`,
          borderTop: `1px solid ${C.border}`,
          fontSize: 9,
          color: C.textDim,
          flexWrap: "wrap",
        }}
      >
        <span>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 2,
              background: "#30D15830",
              marginRight: 4,
            }}
          />
          Available
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 2,
              background: "#FF950030",
              marginRight: 4,
            }}
          />
          Busy
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 2,
              background: "#FF3B3030",
              marginRight: 4,
            }}
          />
          Overloaded
        </span>
        <span style={{ color: C.accent, fontWeight: 600 }}>BID = bid due</span>
        <span>Colored bars = estimator workload</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// DAY VIEW (full estimator breakdown)
// ══════════════════════════════════════════════════════════
function DayView({ workload, eventsByDate, C, T, navigate, selectedDate, onEstimatorClick }) {
  const { dailyLoad, estimatorRows, CAPACITY_HOURS } = workload;
  const dayMap = dailyLoad.get(selectedDate);
  const events = eventsByDate?.get?.(selectedDate) || [];
  const isToday = selectedDate === TODAY;

  return (
    <div
      style={{
        background: C.bg2,
        border: `1px solid ${C.border}`,
        borderRadius: T.radius.lg,
        overflow: "hidden",
      }}
    >
      {/* Day header */}
      <div
        style={{
          padding: `${T.space[3]}px ${T.space[4]}px`,
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: T.space[3],
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text }}>
            {isToday ? "Today" : fmtDayHeader(selectedDate)}
          </div>
          {isToday && <div style={{ fontSize: T.fontSize.xs, color: C.textMuted }}>{fmtDayHeader(selectedDate)}</div>}
        </div>
        {dayMap &&
          dayMap.size > 0 &&
          (() => {
            let totalHrs = 0;
            dayMap.forEach(cell => {
              totalHrs += cell.totalHours;
            });
            const teamCap = Math.max(1, estimatorRows.length) * CAPACITY_HOURS;
            const utilPct = Math.round((totalHrs / teamCap) * 100);
            const utilClr = utilizationColor(totalHrs, teamCap);
            return (
              <div
                style={{
                  fontSize: T.fontSize.sm,
                  fontWeight: 700,
                  color: utilClr,
                  padding: "4px 10px",
                  borderRadius: T.radius.sm,
                  background: hexAlpha(utilClr, 0.12),
                }}
              >
                {Math.round(totalHrs * 10) / 10}h · {utilPct}% capacity
              </div>
            );
          })()}
      </div>

      {/* Events section */}
      {events.length > 0 && (
        <div style={{ padding: `${T.space[3]}px ${T.space[4]}px`, borderBottom: `1px solid ${C.border}08` }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: T.space[2],
            }}
          >
            Events
          </div>
          {events.map((ev, i) => {
            const colorMap = {
              accent: C.accent,
              orange: "#FF9500",
              red: "#FF3B30",
              purple: "#A78BFA",
              green: "#30D158",
            };
            const clr = colorMap[ev.colorKey] || C.textMuted;
            return (
              <div
                key={i}
                onClick={() => ev.estimateId && navigate(`/estimate/${ev.estimateId}/info`)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: T.space[2],
                  padding: `${T.space[1]}px 0`,
                  cursor: ev.estimateId ? "pointer" : "default",
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: clr, flexShrink: 0 }} />
                <span style={{ fontSize: T.fontSize.xs, fontWeight: 600, color: clr, minWidth: 36 }}>
                  {ev.type === "bidDue"
                    ? "BID"
                    : ev.type === "walkthrough"
                      ? "WALK"
                      : ev.type === "rfiDue"
                        ? "RFI"
                        : ev.type === "task"
                          ? "TASK"
                          : "OTHER"}
                </span>
                <span
                  style={{
                    fontSize: T.fontSize.xs,
                    color: C.text,
                    flex: 1,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {ev.label}
                </span>
                {ev.time && <span style={{ fontSize: T.fontSize.xs, color: C.textDim }}>{ev.time}</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Estimator breakdown */}
      <div style={{ padding: `${T.space[3]}px ${T.space[4]}px` }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: T.space[2],
          }}
        >
          Estimator Workload
        </div>

        {dayMap && dayMap.size > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>
            {Array.from(dayMap.entries()).map(([estName, cell]) => {
              const row = estimatorRows.find(r => r.name === estName);
              const color = row?.color || "#A78BFA";
              const utilClr = utilizationColor(cell.totalHours, CAPACITY_HOURS);
              const utilPct = Math.round(cell.utilization * 100);
              return (
                <div
                  key={estName}
                  style={{
                    background: hexAlpha(color, 0.06),
                    borderRadius: T.radius.md,
                    padding: `${T.space[3]}px`,
                    borderLeft: `4px solid ${color}`,
                  }}
                >
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", gap: T.space[2], marginBottom: T.space[2] }}>
                    <Avatar name={estName} color={color} size={20} fontSize={9} />
                    <span
                      onClick={e => {
                        e.stopPropagation();
                        if (onEstimatorClick) onEstimatorClick({ name: estName, color });
                      }}
                      style={{
                        fontSize: T.fontSize.sm,
                        fontWeight: 700,
                        color: C.text,
                        flex: 1,
                        cursor: "pointer",
                      }}
                      title="View scorecard"
                    >
                      {estName}
                    </span>
                    <span
                      style={{
                        fontSize: T.fontSize.xs,
                        fontWeight: 700,
                        color: utilClr,
                        padding: "2px 8px",
                        borderRadius: T.radius.sm,
                        background: hexAlpha(utilClr, 0.12),
                      }}
                    >
                      {Math.round(cell.totalHours * 10) / 10}h · {utilPct}%
                    </span>
                  </div>
                  {/* Utilization bar */}
                  <div
                    style={{
                      height: 4,
                      borderRadius: 2,
                      background: `${C.border}20`,
                      marginBottom: T.space[2],
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, utilPct)}%`,
                        borderRadius: 2,
                        background: utilClr,
                        transition: "width 200ms",
                      }}
                    />
                  </div>
                  {/* Estimate list with time budget */}
                  {cell.estimates.map(est => {
                    // Find full estimate entry for time budget data
                    const fullEst = estimatorRows.flatMap(r => r.estimates).find(e => e.id === est.id);
                    const tb = fullEst ? getTimeBudget(fullEst) : null;
                    return (
                      <div
                        key={est.id}
                        onClick={() => navigate(`/estimate/${est.id}/info`)}
                        style={{
                          padding: `${T.space[2]}px 0`,
                          borderBottom: `1px solid ${C.border}06`,
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: T.fontSize.xs,
                              color: C.text,
                              overflow: "hidden",
                              whiteSpace: "nowrap",
                              textOverflow: "ellipsis",
                              flex: 1,
                            }}
                          >
                            {est.name}
                          </span>
                          <span
                            style={{
                              fontSize: T.fontSize.xs,
                              fontWeight: 600,
                              color: C.textMuted,
                              marginLeft: T.space[2],
                            }}
                          >
                            {Math.round(est.hours * 10) / 10}h/day
                          </span>
                        </div>
                        {/* Time budget bar */}
                        {tb && tb.budgetHours > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                fontSize: 9,
                                marginBottom: 2,
                              }}
                            >
                              <span style={{ color: C.textDim }}>
                                {tb.spentHours}h / {tb.budgetHours}h
                              </span>
                              <span
                                style={{
                                  color: tb.statusColor,
                                  fontWeight: 700,
                                  fontSize: 8,
                                }}
                              >
                                {tb.statusIcon} {tb.status}
                              </span>
                            </div>
                            <div
                              style={{
                                height: 3,
                                borderRadius: 1.5,
                                background: `${C.border}20`,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  width: `${Math.min(100, tb.budgetPct)}%`,
                                  borderRadius: 1.5,
                                  background: tb.statusColor,
                                  transition: "width 200ms",
                                }}
                              />
                            </div>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: 8,
                                color: C.textDim,
                                marginTop: 2,
                              }}
                            >
                              <span>{tb.remainingHours}h remaining</span>
                              <span>
                                {tb.businessDaysLeft}d left · {tb.burnRate}h/d rate
                                {tb.neededRate !== "∞" && tb.neededRate > 0 ? ` · need ${tb.neededRate}h/d` : ""}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Team total */}
            {dayMap.size > 1 &&
              (() => {
                let total = 0;
                dayMap.forEach(c => {
                  total += c.totalHours;
                });
                return (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: `${T.space[2]}px ${T.space[3]}px`,
                      background: `${C.border}08`,
                      borderRadius: T.radius.sm,
                      fontSize: T.fontSize.xs,
                      fontWeight: 700,
                      color: C.text,
                    }}
                  >
                    <span>Team Total</span>
                    <span>{Math.round(total * 10) / 10}h</span>
                  </div>
                );
              })()}
          </div>
        ) : (
          <div style={{ padding: T.space[6], textAlign: "center", color: C.textDim, fontSize: T.fontSize.sm }}>
            No workload scheduled for this day.
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// UNASSIGNED SIDEBAR (persistent right panel)
// ══════════════════════════════════════════════════════════
function UnassignedSidebar({ estimates, collapsed, onToggle, C, T, navigate }) {
  if (collapsed) {
    return (
      <div
        style={{
          width: 44,
          minWidth: 44,
          background: C.bg2,
          border: `1px solid ${C.border}`,
          borderRadius: T.radius.lg,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: `${T.space[3]}px 0`,
          gap: T.space[2],
          cursor: "pointer",
        }}
        onClick={onToggle}
        title="Expand unassigned queue"
      >
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: estimates.length > 0 ? "#FBBF24" : "#30D158",
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            letterSpacing: "0.05em",
          }}
        >
          UNASSIGNED
        </div>
        {estimates.length > 0 && (
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "#FBBF2420",
              color: "#FBBF24",
              fontSize: 10,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {estimates.length}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        width: 280,
        minWidth: 280,
        background: C.bg2,
        border: `1px solid ${C.border}`,
        borderRadius: T.radius.lg,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: `${T.space[3]}px ${T.space[3]}px`,
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
          <span style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.text }}>Unassigned</span>
          {estimates.length > 0 && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "#FBBF24",
                background: "#FBBF2418",
                padding: "2px 7px",
                borderRadius: T.radius.full,
              }}
            >
              {estimates.length}
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          style={{
            ...bt(C),
            padding: "2px 6px",
            fontSize: 10,
            color: C.textDim,
            background: "transparent",
            border: "none",
          }}
          title="Collapse sidebar"
        >
          ✕
        </button>
      </div>

      {/* Cards */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: T.space[2],
          display: "flex",
          flexDirection: "column",
          gap: T.space[2],
        }}
      >
        {estimates.length === 0 ? (
          <div
            style={{
              padding: T.space[6],
              textAlign: "center",
              color: "#30D158",
              fontSize: T.fontSize.sm,
            }}
          >
            <div style={{ fontSize: 20, marginBottom: T.space[1] }}>✓</div>
            All estimates assigned
          </div>
        ) : (
          estimates.map(est => {
            const sc = STATUS_COLORS[est.status] || "#A78BFA";
            return (
              <div
                key={est.id}
                onClick={() => navigate(`/estimate/${est.id}/info`)}
                // Phase 2: drag-to-assign — add draggable + onDragStart with est.id
                style={{
                  padding: `${T.space[2]}px ${T.space[3]}px`,
                  background: "rgba(255,255,255,0.02)",
                  border: `1px dashed ${C.textDim}40`,
                  borderRadius: T.radius.md,
                  cursor: "pointer",
                  transition: "all 100ms",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.borderColor = `${sc}50`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                  e.currentTarget.style.borderColor = `${C.textDim}40`;
                }}
              >
                <div
                  style={{
                    fontSize: T.fontSize.sm,
                    fontWeight: 600,
                    color: C.text,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    marginBottom: 2,
                  }}
                >
                  {est.name}
                </div>
                {est.client && (
                  <div
                    style={{
                      fontSize: 9,
                      color: C.textMuted,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      marginBottom: 4,
                    }}
                  >
                    {est.client}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: T.space[2], fontSize: 9, color: C.textDim }}>
                  {est.bidDue && (
                    <span>
                      Due {parseDateStr(est.bidDue).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                  {est.estimatedHours > 0 && (
                    <span style={{ color: C.textMuted, fontWeight: 600 }}>{est.estimatedHours}h</span>
                  )}
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 8,
                      fontWeight: 600,
                      color: sc,
                      padding: "1px 5px",
                      borderRadius: 3,
                      background: hexAlpha(sc, 0.12),
                    }}
                  >
                    {est.status}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
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
// TIME BUDGET PANEL (burn rate intelligence)
// ══════════════════════════════════════════════════════════
function TimeBudgetPanel({ estimatorRows, unassignedEstimates, C, T, navigate, onEstimatorClick }) {
  // Collect all estimates that have a time budget
  const allEstimates = useMemo(() => {
    const all = [];
    for (const row of estimatorRows) {
      for (const est of row.estimates) {
        const tb = getTimeBudget(est);
        if (tb.budgetHours > 0) {
          all.push({ ...est, estimator: row.name, color: row.color, tb });
        }
      }
    }
    // Also include unassigned with budgets
    for (const est of unassignedEstimates) {
      const tb = getTimeBudget(est);
      if (tb.budgetHours > 0) {
        all.push({ ...est, estimator: null, color: "#FBBF24", tb });
      }
    }
    // Sort: overdue/over-budget first, then at-risk, then on-track
    const priority = { Overdue: 0, "Over budget": 1, "At risk": 2, "On track": 3, "No budget": 4 };
    all.sort((a, b) => (priority[a.tb.status] || 4) - (priority[b.tb.status] || 4));
    return all;
  }, [estimatorRows, unassignedEstimates]);

  if (allEstimates.length === 0) return null;

  const atRiskCount = allEstimates.filter(
    e => e.tb.status === "At risk" || e.tb.status === "Over budget" || e.tb.status === "Overdue",
  ).length;

  return (
    <div style={{ marginTop: T.space[5] }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: T.space[3],
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
          <span style={{ fontSize: T.fontSize.sm, fontWeight: 700, color: C.text }}>Time Budgets</span>
          {atRiskCount > 0 && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "#FF9500",
                background: "#FF950018",
                padding: "2px 7px",
                borderRadius: T.radius.full,
              }}
            >
              {atRiskCount} need attention
            </span>
          )}
        </div>
        <span style={{ fontSize: 9, color: C.textDim }}>{allEstimates.length} tracked estimates</span>
      </div>

      <div
        style={{
          background: C.bg2,
          border: `1px solid ${C.border}`,
          borderRadius: T.radius.lg,
          overflow: "hidden",
        }}
      >
        {/* Column headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 100px 120px 80px 80px 70px",
            padding: `${T.space[2]}px ${T.space[3]}px`,
            borderBottom: `1px solid ${C.border}`,
            fontSize: 8,
            fontWeight: 700,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          <span>Estimate</span>
          <span>Estimator</span>
          <span>Budget</span>
          <span>Burn Rate</span>
          <span>Days Left</span>
          <span style={{ textAlign: "right" }}>Status</span>
        </div>

        {/* Rows */}
        {allEstimates.map(est => {
          const { tb } = est;
          return (
            <div
              key={est.id}
              onClick={() => navigate(`/estimate/${est.id}/info`)}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 100px 120px 80px 80px 70px",
                padding: `${T.space[2]}px ${T.space[3]}px`,
                borderBottom: `1px solid ${C.border}06`,
                cursor: "pointer",
                alignItems: "center",
                transition: "background 100ms",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {/* Name */}
              <div
                style={{
                  fontSize: T.fontSize.xs,
                  fontWeight: 600,
                  color: C.text,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  paddingRight: T.space[2],
                }}
              >
                {est.name}
                {est.client && <span style={{ color: C.textDim, fontWeight: 400, marginLeft: 4 }}>· {est.client}</span>}
              </div>

              {/* Estimator */}
              <div
                style={{ display: "flex", alignItems: "center", gap: 4, cursor: est.estimator ? "pointer" : "default" }}
                onClick={e => {
                  if (est.estimator && onEstimatorClick) {
                    e.stopPropagation();
                    onEstimatorClick({ name: est.estimator, color: est.color });
                  }
                }}
              >
                <Avatar name={est.estimator || "?"} color={est.color} size={16} fontSize={8} />
                <span
                  style={{
                    fontSize: T.fontSize.xs,
                    color: est.estimator ? C.textMuted : "#FBBF24",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {est.estimator || "Unassigned"}
                </span>
              </div>

              {/* Budget bar */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 9,
                    color: C.textDim,
                    marginBottom: 2,
                  }}
                >
                  <span>
                    {tb.spentHours}h / {tb.budgetHours}h
                  </span>
                  <span style={{ fontWeight: 600, color: tb.statusColor }}>{tb.budgetPct}%</span>
                </div>
                <div
                  style={{
                    height: 3,
                    borderRadius: 1.5,
                    background: `${C.border}20`,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, tb.budgetPct)}%`,
                      borderRadius: 1.5,
                      background: tb.statusColor,
                    }}
                  />
                </div>
              </div>

              {/* Burn rate */}
              <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
                <span style={{ fontWeight: 600 }}>{tb.burnRate}</span>h/d
                {tb.neededRate !== "∞" && tb.neededRate > 0 && tb.neededRate !== tb.burnRate && (
                  <div style={{ fontSize: 8, color: tb.statusColor }}>need {tb.neededRate}h/d</div>
                )}
              </div>

              {/* Days left */}
              <div>
                <span
                  style={{
                    fontSize: T.fontSize.xs,
                    fontWeight: 600,
                    color: tb.businessDaysLeft <= 2 && tb.remainingHours > 0 ? "#FF9500" : C.textMuted,
                  }}
                >
                  {tb.businessDaysLeft}d
                </span>
                {est.bidDue && (
                  <div style={{ fontSize: 8, color: C.textDim }}>
                    {parseDateStr(est.bidDue).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                )}
              </div>

              {/* Status */}
              <div style={{ textAlign: "right" }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: tb.statusColor,
                    padding: "2px 6px",
                    borderRadius: T.radius.sm,
                    background: hexAlpha(tb.statusColor, 0.12),
                  }}
                >
                  {tb.statusIcon} {tb.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
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
    calendarView,
    setCalendarView,
    selectedDate,
    setSelectedDate,
    viewMonth,
    setViewMonth,
    sidebarCollapsed,
    setSidebarCollapsed,
  } = useResourceStore();
  const workload = useWorkloadData();
  const { eventsByDate } = useCalendarEvents();
  const [scorecardEstimator, setScorecardEstimator] = useState(null); // { name, color }
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const pendingReviews = useReviewStore(s => s.reviews.filter(r => r.status !== "completed").length);

  // KPI summary
  const activeEstimators = workload.estimatorRows.length;
  const totalActiveBids =
    workload.estimatorRows.reduce((s, r) => s + r.estimates.length, 0) + workload.unassignedEstimates.length;
  const overloadWarnings = workload.warnings.filter(w => w.type === "overloaded").length;

  // Budget health KPI
  const budgetHealth = useMemo(() => {
    let tracked = 0,
      atRisk = 0;
    const allEsts = [...workload.estimatorRows.flatMap(r => r.estimates), ...workload.unassignedEstimates];
    for (const est of allEsts) {
      const tb = getTimeBudget(est);
      if (tb.budgetHours > 0) {
        tracked++;
        if (tb.status === "At risk" || tb.status === "Over budget" || tb.status === "Overdue") {
          atRisk++;
        }
      }
    }
    return { tracked, atRisk };
  }, [workload.estimatorRows, workload.unassignedEstimates]);

  return (
    <div
      style={{
        padding: `${T.space[6]}px ${T.space[7]}px`,
        maxWidth: 1400,
        margin: "0 auto",
        fontFamily: T.font.display,
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
            Pipeline scheduling, team capacity, and workload management
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
          { label: "Overload Alerts", value: overloadWarnings, color: overloadWarnings > 0 ? "#FF3B30" : "#34D399" },
          {
            label: "Budget Health",
            value:
              budgetHealth.atRisk > 0
                ? `${budgetHealth.atRisk}/${budgetHealth.tracked}`
                : budgetHealth.tracked > 0
                  ? `${budgetHealth.tracked}`
                  : "—",
            color: budgetHealth.atRisk > 0 ? "#FF9500" : budgetHealth.tracked > 0 ? "#30D158" : "#8E8E93",
            sub: budgetHealth.atRisk > 0 ? "at risk" : "all on track",
          },
        ].map(kpi => (
          <div
            key={kpi.label}
            style={{
              flex: 1,
              background: C.bg2,
              border: `1px solid ${C.border}`,
              borderRadius: T.radius.lg,
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

      {/* Header Row: ViewToggle + Nav */}
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
        <ViewToggle view={calendarView} setView={setCalendarView} C={C} T={T} />
        <CalendarNav
          view={calendarView}
          selectedDate={selectedDate}
          viewMonth={viewMonth}
          setSelectedDate={setSelectedDate}
          setViewMonth={setViewMonth}
          C={C}
          T={T}
        />
      </div>

      {/* Main content: Calendar + Sidebar */}
      <div style={{ display: "flex", gap: T.space[4], alignItems: "flex-start" }}>
        {/* Calendar area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {calendarView === "week" && (
            <WeekView
              workload={workload}
              eventsByDate={eventsByDate}
              C={C}
              T={T}
              navigate={navigate}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              setCalendarView={setCalendarView}
            />
          )}
          {calendarView === "month" && (
            <MonthView
              workload={workload}
              eventsByDate={eventsByDate}
              C={C}
              T={T}
              navigate={navigate}
              viewMonth={viewMonth}
              setSelectedDate={setSelectedDate}
              setCalendarView={setCalendarView}
            />
          )}
          {calendarView === "day" && (
            <DayView
              workload={workload}
              eventsByDate={eventsByDate}
              C={C}
              T={T}
              navigate={navigate}
              selectedDate={selectedDate}
              onEstimatorClick={setScorecardEstimator}
            />
          )}
        </div>

        {/* Unassigned sidebar */}
        <UnassignedSidebar
          estimates={workload.unassignedEstimates}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          C={C}
          T={T}
          navigate={navigate}
        />
      </div>

      {/* Time Budget Intelligence */}
      <TimeBudgetPanel
        estimatorRows={workload.estimatorRows}
        unassignedEstimates={workload.unassignedEstimates}
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
