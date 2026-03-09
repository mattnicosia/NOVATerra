import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useWorkloadData, addWeekdays } from "@/hooks/useWorkloadData";
import { useResourceStore } from "@/stores/resourceStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import { bt, cardSolid, inp } from "@/utils/styles";
import { useOrgStore, selectIsManager } from "@/stores/orgStore";
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
  Qualifying: "#F59E0B",
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

const isWeekdayFn = (d, workWeek = "mon-fri") => {
  const day = d.getDay();
  if (workWeek === "mon-sat") return day !== 0; // Sun off only
  return day !== 0 && day !== 6;
};

const hexAlpha = (hex, alpha) => {
  const a = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return hex + a;
};

const TODAY = toDateStr(new Date());

const DAY_WIDTH = 44; // px per day column

// ══════════════════════════════════════════════════════════
// ESTIMATOR CONTEXT MENU (right-click on estimator name)
// ══════════════════════════════════════════════════════════
function EstimatorContextMenu({ pos, name, color, projectCount, C, T, onViewScorecard, onRemove, onClose }) {
  const menuRef = useRef(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const handler = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  useEffect(() => {
    const handler = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const x = Math.min(pos.x, window.innerWidth - 200);
  const y = Math.min(pos.y, window.innerHeight - 180);

  const itemStyle = {
    display: "flex", alignItems: "center", gap: 8,
    padding: "7px 12px", borderRadius: 6,
    fontSize: 11, fontWeight: 500, color: C.text, cursor: "pointer",
    transition: "background 80ms", border: "none",
    background: "transparent", width: "100%", textAlign: "left",
  };

  return (
    <div
      ref={menuRef}
      onClick={e => e.stopPropagation()}
      style={{
        position: "fixed", left: x, top: y, zIndex: 1000,
        background: C.isDark
          ? "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))"
          : "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.90))",
        backdropFilter: "blur(40px) saturate(1.8)",
        WebkitBackdropFilter: "blur(40px) saturate(1.8)",
        border: `1px solid ${C.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)"}`,
        borderRadius: 10, padding: "6px 4px", minWidth: 180,
        boxShadow: C.isDark
          ? "0 12px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)"
          : "0 8px 30px rgba(0,0,0,0.15)",
      }}
    >
      <div style={{
        padding: "4px 12px 6px", fontSize: 9, fontWeight: 700, color: C.textDim,
        textTransform: "uppercase", letterSpacing: "0.06em",
        borderBottom: `1px solid ${C.border}20`, marginBottom: 2,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <div style={{
          width: 12, height: 12, borderRadius: "50%", background: color,
        }} />
        {name}
      </div>
      {confirming ? (
        <div style={{ padding: "8px 12px" }}>
          <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6 }}>
            Remove <strong>{name}</strong>?
            {projectCount > 0 && <> {projectCount} project{projectCount !== 1 ? "s" : ""} will become unassigned.</>}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={onRemove}
              style={{ ...itemStyle, width: "auto", padding: "4px 10px", background: "#FF3B3015", color: "#FF3B30", fontWeight: 600, borderRadius: 4 }}
            >
              Remove
            </button>
            <button
              onClick={() => setConfirming(false)}
              style={{ ...itemStyle, width: "auto", padding: "4px 10px", color: C.textMuted, borderRadius: 4 }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={onViewScorecard}
            style={itemStyle}
            onMouseEnter={e => (e.target.style.background = `${C.accent}12`)}
            onMouseLeave={e => (e.target.style.background = "transparent")}
          >
            <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>📊</span>
            View Scorecard
          </button>
          <div style={{ height: 1, background: `${C.border}40`, margin: "4px 8px" }} />
          <button
            onClick={() => setConfirming(true)}
            style={{ ...itemStyle, color: "#FF3B30" }}
            onMouseEnter={e => (e.target.style.background = "#FF3B3010")}
            onMouseLeave={e => (e.target.style.background = "transparent")}
          >
            <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>✕</span>
            Remove Estimator
          </button>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// GANTT CHART
// ══════════════════════════════════════════════════════════
function GanttChart({ workload, C, T, navigate, onEstimatorClick, onDrop, workWeek }) {
  const { estimatorRows, unassignedEstimates, CAPACITY_HOURS, effectiveHoursPerDay, estimatorCapacity, rangeDays, rangeStart, rangeEnd } = workload;
  const dragEstimateId = useResourceStore(s => s.dragEstimateId);
  const dragOverEstimator = useResourceStore(s => s.dragOverEstimator);
  const dragMode = useResourceStore(s => s.dragMode);
  const dragDaysDelta = useResourceStore(s => s.dragDaysDelta);
  const { setDragEstimateId, setDragOverEstimator, setDragMode, setDragDaysDelta, setDragOriginalBidDue, clearDragState } = useResourceStore.getState();

  // Refs for mouse drag (reschedule + reassign)
  const dragRef = useRef({ startX: 0, startY: 0, barId: null, bidDue: "", estimator: "", activated: false });
  const rowRectsRef = useRef([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [estimatorMenu, setEstimatorMenu] = useState(null); // { x, y, name, color, projectCount }
  const [addingEstimator, setAddingEstimator] = useState(false);
  const [addEstimatorName, setAddEstimatorName] = useState("");
  const capHours = effectiveHoursPerDay || CAPACITY_HOURS;

  // Document-level mousemove/mouseup for bar drag (reschedule + reassign)
  useEffect(() => {
    const onMouseMove = e => {
      const dr = dragRef.current;
      if (!dr.barId) return;

      const dx = e.clientX - dr.startX;
      const dy = e.clientY - dr.startY;

      // Activation threshold: 5px
      if (!dr.activated && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;

      if (!dr.activated) {
        dr.activated = true;
        const mode = Math.abs(dx) >= Math.abs(dy) ? "reschedule" : "reassign";
        setDragMode(mode);
        setDragEstimateId(dr.barId);
        setDragOriginalBidDue(dr.bidDue);
      }

      const mode = useResourceStore.getState().dragMode;
      if (mode === "reschedule") {
        const delta = Math.round(dx / DAY_WIDTH);
        setDragDaysDelta(delta);
      } else if (mode === "reassign") {
        // Find which estimator row the cursor is over
        for (const rect of rowRectsRef.current) {
          if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
            setDragOverEstimator(rect.name);
            return;
          }
        }
        setDragOverEstimator(null);
      }
    };

    const onMouseUp = () => {
      const dr = dragRef.current;
      if (!dr.barId || !dr.activated) {
        dr.barId = null;
        dr.activated = false;
        return;
      }

      const st = useResourceStore.getState();
      if (st.dragMode === "reschedule" && st.dragDaysDelta !== 0) {
        const newDue = addWeekdays(new Date(dr.bidDue + "T00:00:00"), st.dragDaysDelta, workWeek);
        const fmt = d => d.toISOString().slice(0, 10);
        useEstimatesStore.getState().updateIndexEntry(dr.barId, { bidDue: fmt(newDue) });
        useUiStore.getState().showToast(
          `Rescheduled to ${fmt(newDue)}`,
          "success",
        );
      } else if (st.dragMode === "reassign" && st.dragOverEstimator) {
        const target = st.dragOverEstimator === "__unassigned__" ? "" : st.dragOverEstimator;
        if (target !== dr.estimator) {
          onDrop?.(dr.barId, target);
        }
      }

      dr.barId = null;
      dr.activated = false;
      clearDragState();
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [workWeek]);

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
        isWeekStart: dt.getDay() === 1, // Monday is always the visual week start
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
        const startIdx = days.findIndex(d => d.key === est.scheduledStart);
        const endIdx = days.findIndex(d => d.key === est.scheduledEnd);
        const s = Math.max(0, startIdx >= 0 ? startIdx : 0);
        const e = Math.min(days.length - 1, endIdx >= 0 ? endIdx : days.length - 1);
        // Build segment positions for split bars
        let segPositions = null;
        if (est.segments && est.segments.length > 1) {
          segPositions = est.segments.map(seg => {
            const si = days.findIndex(d => d.key === seg.start);
            const ei = days.findIndex(d => d.key === seg.end);
            const ss = Math.max(0, si >= 0 ? si : 0);
            const se = Math.min(days.length - 1, ei >= 0 ? ei : days.length - 1);
            return { left: ss * DAY_WIDTH, width: Math.max(DAY_WIDTH, (se - ss + 1) * DAY_WIDTH - 4) };
          });
        }
        return {
          ...est,
          startCol: s,
          endCol: e,
          left: s * DAY_WIDTH,
          width: Math.max(DAY_WIDTH, (e - s + 1) * DAY_WIDTH - 4),
          segPositions,
        };
      });
      return { ...row, bars };
    });
  }, [estimatorRows, days]);

  // Unassigned bars
  const unassignedBars = useMemo(() => {
    return unassignedEstimates.map(est => {
      const sKey = est.scheduledStart || TODAY;
      const eKey = est.scheduledEnd || TODAY;
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

  // Inline hours editing state
  const [editingHoursId, setEditingHoursId] = useState(null);
  const [editingHoursVal, setEditingHoursVal] = useState("");

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
            const utilColor = utilizationColor(dailyHours, capHours);
            const isDropTarget = dragOverEstimator === row.name && dragEstimateId;
            return (
              <div
                key={row.name}
                onClick={() => onEstimatorClick?.({ name: row.name, color: row.color })}
                onContextMenu={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEstimatorMenu({
                    x: e.clientX, y: e.clientY,
                    name: row.name, color: row.color,
                    projectCount: row.estimates.length,
                  });
                }}
                style={{
                  height: Math.max(ROW_HEIGHT, row.bars.length * 22 + 12),
                  display: "flex",
                  alignItems: "center",
                  gap: T.space[2],
                  padding: `0 ${T.space[3]}px`,
                  borderBottom: `1px solid ${C.border}08`,
                  cursor: "pointer",
                  ...(isDropTarget ? { background: `${C.accent}12`, outline: `2px solid ${C.accent}`, outlineOffset: -2, borderRadius: 4 } : {}),
                  transition: "background 100ms, outline 100ms",
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
          {(unassignedBars.length > 0 || dragEstimateId) && (
            <div
              style={{
                height: Math.max(ROW_HEIGHT, unassignedBars.length * 22 + 12),
                display: "flex",
                alignItems: "center",
                gap: T.space[2],
                padding: `0 ${T.space[3]}px`,
                borderTop: `2px solid ${C.border}`,
                background: dragOverEstimator === "__unassigned__" && dragEstimateId
                  ? `${C.accent}12`
                  : C.isDark ? "#FBBF2406" : "#FBBF240A",
                ...(dragOverEstimator === "__unassigned__" && dragEstimateId ? { outline: `2px solid ${C.accent}`, outlineOffset: -2, borderRadius: 4 } : {}),
                transition: "background 100ms, outline 100ms",
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

          {/* Add Estimator */}
          {addingEstimator ? (
            <div style={{ padding: `${T.space[2]}px ${T.space[3]}px`, borderTop: `1px solid ${C.border}08` }}>
              <input
                autoFocus
                placeholder="Estimator name..."
                value={addEstimatorName}
                onChange={e => setAddEstimatorName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && addEstimatorName.trim()) {
                    useMasterDataStore.getState().addMasterItem("estimators", { name: addEstimatorName.trim() });
                    useUiStore.getState().showToast(`Added estimator "${addEstimatorName.trim()}"`);
                    setAddEstimatorName("");
                    setAddingEstimator(false);
                  } else if (e.key === "Escape") {
                    setAddEstimatorName("");
                    setAddingEstimator(false);
                  }
                }}
                onBlur={() => { setAddEstimatorName(""); setAddingEstimator(false); }}
                style={{
                  width: "100%",
                  padding: "4px 8px",
                  fontSize: T.fontSize.xs,
                  borderRadius: T.radius.sm,
                  border: `1px solid ${C.accent}40`,
                  background: C.bg1,
                  color: C.text,
                  outline: "none",
                }}
              />
            </div>
          ) : (
            <div
              onClick={() => setAddingEstimator(true)}
              style={{
                padding: `${T.space[2]}px ${T.space[3]}px`,
                display: "flex",
                alignItems: "center",
                gap: T.space[2],
                cursor: "pointer",
                borderTop: `1px solid ${C.border}08`,
                transition: "background 80ms",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}08`)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: `${C.accent}15`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, color: C.accent, fontWeight: 700,
              }}>
                +
              </div>
              <span style={{ fontSize: T.fontSize.xs, color: C.textMuted, fontWeight: T.fontWeight.medium }}>
                Add Estimator
              </span>
            </div>
          )}
        </div>

        {/* Right scrollable timeline area */}
        <div style={{ flex: 1, overflowX: "auto", position: "relative" }} data-gantt-rows>
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
                    borderLeft: day.isWeekStart ? `1px solid ${C.border}` : "none",
                    borderRight: `1px solid ${C.border}08`,
                    background: day.isToday ? `${C.accent}0C` : "transparent",
                  }}
                >
                  {/* Show month label on 1st and week starts */}
                  {(day.dayNum === 1 || day.isWeekStart) && (
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
              const isDropTarget = dragOverEstimator === row.name && dragEstimateId;
              return (
                <div
                  key={row.name}
                  data-estimator-row={row.name}
                  style={{
                    position: "relative",
                    height: rowHeight,
                    borderBottom: `1px solid ${C.border}08`,
                    display: "flex",
                    ...(isDropTarget ? { background: `${C.accent}08`, outline: `2px solid ${C.accent}40`, outlineOffset: -2 } : {}),
                    transition: "background 100ms",
                  }}
                >
                  {/* Day grid lines */}
                  {days.map(day => (
                    <div
                      key={day.key}
                      style={{
                        width: DAY_WIDTH,
                        flexShrink: 0,
                        borderLeft: day.isWeekStart ? `1px solid ${C.border}15` : "none",
                        borderRight: `1px solid ${C.border}06`,
                        background: day.isToday ? `${C.accent}04` : "transparent",
                      }}
                    />
                  ))}

                  {/* Project bars (absolute positioned over grid) */}
                  {row.bars.map((bar, i) => {
                    const color = SCHEDULE_COLORS[bar.scheduleStatus] || STATUS_COLORS[bar.status] || "#A78BFA";
                    const isDragging = dragEstimateId === bar.id;
                    const rescheduleOffset = isDragging && dragMode === "reschedule" ? dragDaysDelta * DAY_WIDTH : 0;

                    // Render segment connectors (dashed lines between split bar segments)
                    const segConnectors = bar.segPositions && bar.segPositions.length > 1
                      ? bar.segPositions.slice(0, -1).map((seg, si) => {
                          const next = bar.segPositions[si + 1];
                          const gapLeft = seg.left + seg.width + 2 + rescheduleOffset;
                          const gapWidth = next.left - seg.left - seg.width;
                          if (gapWidth <= 0) return null;
                          return (
                            <div key={`conn-${bar.id}-${si}`} style={{
                              position: "absolute",
                              left: gapLeft,
                              top: 6 + i * 22 + 8,
                              width: gapWidth - 4,
                              height: 2,
                              borderTop: `2px dashed ${color}40`,
                              zIndex: 1,
                              pointerEvents: "none",
                            }} />
                          );
                        })
                      : null;

                    return (
                      <React.Fragment key={bar.id}>
                      {segConnectors}
                      <div
                        key={bar.id}
                        onMouseDown={e => {
                          if (e.button !== 0) return; // left click only
                          e.preventDefault();
                          dragRef.current = {
                            startX: e.clientX, startY: e.clientY,
                            barId: bar.id, bidDue: bar.bidDue,
                            estimator: row.name, activated: false,
                          };
                          // Capture row rects for vertical detection
                          const ganttEl = e.currentTarget.closest("[data-gantt-rows]");
                          if (ganttEl) {
                            const rows = ganttEl.querySelectorAll("[data-estimator-row]");
                            rowRectsRef.current = Array.from(rows).map(el => ({
                              name: el.dataset.estimatorRow,
                              top: el.getBoundingClientRect().top,
                              bottom: el.getBoundingClientRect().bottom,
                            }));
                          }
                        }}
                        onClick={e => {
                          if (dragRef.current.activated) return; // was a drag, not a click
                          e.stopPropagation();
                          navigate(`/estimate/${bar.id}/info`);
                        }}
                        onContextMenu={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({ x: e.clientX, y: e.clientY, bar, estimator: row.name });
                        }}
                        onMouseEnter={() =>
                          setTooltip({
                            name: bar.name,
                            hours: `${bar.hoursLogged}h / ${bar.estimatedHours}h`,
                            pct: bar.percentComplete,
                            daysLeft: bar.daysRemaining,
                            status: bar.scheduleStatus,
                            scheduledRange: `${bar.scheduledStart} → ${bar.scheduledEnd}`,
                            bidDue: bar.bidDue,
                            conflict: bar.conflict,
                            daysNeeded: bar.daysNeeded,
                            correspondenceCount: bar.correspondenceCount,
                            correspondenceTotalHours: bar.correspondenceTotalHours,
                            correspondenceNextDue: bar.correspondenceNextDue,
                            emailCount: bar.emailCount,
                          })
                        }
                        onMouseLeave={() => setTooltip(null)}
                        style={{
                          position: "absolute",
                          left: (bar.segPositions ? bar.segPositions[0].left : bar.left) + 2 + rescheduleOffset,
                          top: 6 + i * 22,
                          width: bar.segPositions ? bar.segPositions[0].width : bar.width,
                          height: 18,
                          borderRadius: 4,
                          overflow: "hidden",
                          cursor: isDragging ? "grabbing" : "grab",
                          display: "flex",
                          alignItems: "center",
                          border: `1px solid ${color}40`,
                          borderLeft: bar.conflict ? `3px solid #FF3B30` : `1px solid ${color}40`,
                          opacity: isDragging && dragMode === "reassign" ? 0.4 : 1,
                          transition: isDragging ? "none" : "opacity 100ms",
                          animation: bar.conflict && !isDragging ? "conflictPulse 2s ease-in-out infinite" : undefined,
                          zIndex: isDragging ? 10 : 1,
                          boxShadow: isDragging && dragMode === "reschedule" ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
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
                              minWidth: 0,
                            }}
                          >
                            {bar.complexity && bar.complexity !== "normal" && (
                              <span title={bar.complexity} style={{ fontSize: 7, marginRight: 2 }}>
                                {bar.complexity === "light" ? "\u26A1" : "\u25A0"}
                              </span>
                            )}
                            {bar.name}
                          </span>
                          {/* Hours — click to edit inline */}
                          {bar.width > 80 && (
                            editingHoursId === bar.id ? (
                              <input
                                autoFocus
                                type="number"
                                value={editingHoursVal}
                                onChange={e => setEditingHoursVal(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") {
                                    const h = Number(editingHoursVal);
                                    if (!isNaN(h) && h >= 0) {
                                      useEstimatesStore.getState().updateIndexEntry(bar.id, { estimatedHours: h });
                                    }
                                    setEditingHoursId(null);
                                  } else if (e.key === "Escape") {
                                    setEditingHoursId(null);
                                  }
                                }}
                                onBlur={() => {
                                  const h = Number(editingHoursVal);
                                  if (!isNaN(h) && h >= 0) {
                                    useEstimatesStore.getState().updateIndexEntry(bar.id, { estimatedHours: h });
                                  }
                                  setEditingHoursId(null);
                                }}
                                onClick={e => e.stopPropagation()}
                                onMouseDown={e => e.stopPropagation()}
                                style={{
                                  width: 32,
                                  fontSize: 8,
                                  fontWeight: 600,
                                  padding: "0 2px",
                                  border: `1px solid ${C.accent}`,
                                  borderRadius: 3,
                                  background: C.bg1,
                                  color: C.text,
                                  textAlign: "center",
                                  outline: "none",
                                  flexShrink: 0,
                                  marginLeft: 4,
                                  height: 14,
                                }}
                              />
                            ) : (
                              <span
                                onClick={e => {
                                  e.stopPropagation();
                                  setEditingHoursId(bar.id);
                                  setEditingHoursVal(String(bar.estimatedHours || 0));
                                }}
                                title="Click to edit hours"
                                style={{
                                  fontSize: 8,
                                  fontWeight: 600,
                                  color: C.textMuted,
                                  flexShrink: 0,
                                  marginLeft: 4,
                                  cursor: "text",
                                  padding: "0 2px",
                                  borderRadius: 2,
                                  transition: "background 0.15s",
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}26`)}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                              >
                                {bar.estimatedHours || 0}h
                              </span>
                            )
                          )}
                          {bar.width > 120 && (
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
                          )}
                          {/* Correspondence indicator */}
                          {bar.correspondenceCount > 0 && (
                            <span
                              title={`${bar.correspondenceCount} correspondence${bar.correspondenceCount !== 1 ? "s" : ""}`}
                              style={{
                                fontSize: 7,
                                fontWeight: 700,
                                color: "#60A5FA",
                                background: "#60A5FA20",
                                borderRadius: 3,
                                padding: "0 3px",
                                flexShrink: 0,
                                marginLeft: 3,
                                lineHeight: "12px",
                              }}
                            >
                              C{bar.correspondenceCount > 1 ? bar.correspondenceCount : ""}
                            </span>
                          )}
                          {/* Email count indicator */}
                          {bar.emailCount > 1 && (
                            <span
                              title={`${bar.emailCount} linked emails`}
                              style={{
                                fontSize: 7,
                                fontWeight: 700,
                                color: "#A78BFA",
                                background: "#A78BFA20",
                                borderRadius: 3,
                                padding: "0 3px",
                                flexShrink: 0,
                                marginLeft: 3,
                                lineHeight: "12px",
                              }}
                            >
                              {bar.emailCount}✉
                            </span>
                          )}
                        </div>
                        {/* Due date marker — orange dot when bar ends before bidDue */}
                        {bar.bidDue !== bar.scheduledEnd && (() => {
                          const dueIdx = days.findIndex(d => d.key === bar.bidDue);
                          if (dueIdx < 0) return null;
                          const dotLeft = (dueIdx * DAY_WIDTH + DAY_WIDTH / 2) - bar.left - 2;
                          if (dotLeft < 0 || dotLeft > bar.width) return null;
                          return (
                            <div
                              style={{
                                position: "absolute",
                                left: dotLeft - 3,
                                top: 6,
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: "#FF9500",
                                border: "1px solid rgba(0,0,0,0.2)",
                                zIndex: 2,
                              }}
                              title={`Due ${bar.bidDue}`}
                            />
                          );
                        })()}
                        {/* Reschedule delta badge */}
                        {isDragging && dragMode === "reschedule" && dragDaysDelta !== 0 && (
                          <div style={{
                            position: "absolute",
                            top: -14, right: -2,
                            fontSize: 8, fontWeight: 700,
                            color: "#fff",
                            background: dragDaysDelta > 0 ? "#30D158" : "#FF9500",
                            borderRadius: 4,
                            padding: "1px 4px",
                            whiteSpace: "nowrap",
                            zIndex: 20,
                          }}>
                            {dragDaysDelta > 0 ? "+" : ""}{dragDaysDelta}d
                          </div>
                        )}
                      </div>
                      {/* Additional segment bars for split/paused projects */}
                      {bar.segPositions && bar.segPositions.length > 1 && bar.segPositions.slice(1).map((seg, si) => (
                        <div
                          key={`seg-${bar.id}-${si + 1}`}
                          onMouseDown={e => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            dragRef.current = {
                              startX: e.clientX, startY: e.clientY,
                              barId: bar.id, bidDue: bar.bidDue,
                              estimator: row.name, activated: false,
                            };
                            const ganttEl = e.currentTarget.closest("[data-gantt-rows]");
                            if (ganttEl) {
                              const rows = ganttEl.querySelectorAll("[data-estimator-row]");
                              rowRectsRef.current = Array.from(rows).map(el => ({
                                name: el.dataset.estimatorRow,
                                top: el.getBoundingClientRect().top,
                                bottom: el.getBoundingClientRect().bottom,
                              }));
                            }
                          }}
                          onClick={e => {
                            if (dragRef.current.activated) return;
                            e.stopPropagation();
                            navigate(`/estimate/${bar.id}/info`);
                          }}
                          onContextMenu={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            setContextMenu({ x: e.clientX, y: e.clientY, bar, estimator: row.name });
                          }}
                          style={{
                            position: "absolute",
                            left: seg.left + 2 + rescheduleOffset,
                            top: 6 + i * 22,
                            width: seg.width,
                            height: 18,
                            borderRadius: 4,
                            overflow: "hidden",
                            cursor: isDragging ? "grabbing" : "grab",
                            border: `1px solid ${color}40`,
                            background: `${color}15`,
                            opacity: isDragging && dragMode === "reassign" ? 0.4 : 1,
                            zIndex: isDragging ? 10 : 1,
                            boxShadow: isDragging && dragMode === "reschedule" ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
                          }}
                        >
                          {seg.width > 60 && (
                            <span style={{
                              fontSize: 8, fontWeight: 600, color: C.textMuted,
                              padding: "0 6px", whiteSpace: "nowrap",
                            }}>
                              {bar.name}
                            </span>
                          )}
                        </div>
                      ))}
                      </React.Fragment>
                    );
                  })}

                  {/* Capacity utilization bar at bottom of row */}
                  {estimatorCapacity && (() => {
                    const cap = estimatorCapacity.get(row.name);
                    if (!cap) return null;
                    return (
                      <div style={{ position: "absolute", left: 0, bottom: 0, right: 0, height: 3, display: "flex", pointerEvents: "none" }}>
                        {days.map(day => {
                          const entry = cap.find(c => c.date === day.key);
                          if (!entry) return <div key={day.key} style={{ width: DAY_WIDTH, flexShrink: 0 }} />;
                          const pct = capHours > 0 ? entry.remainingHours / capHours : 1;
                          const color = pct > 0.5 ? "#30D158" : pct > 0.25 ? "#FF9500" : pct > 0 ? "#FF3B30" : "transparent";
                          return (
                            <div key={day.key} style={{ width: DAY_WIDTH, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                              {entry.used > 0 && (
                                <div style={{ width: DAY_WIDTH - 6, height: 3, borderRadius: 1.5, background: `${color}40` }} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            {/* Unassigned row */}
            {(unassignedBars.length > 0 || dragEstimateId) && (
              <div
                data-estimator-row="__unassigned__"
                style={{
                  position: "relative",
                  height: Math.max(ROW_HEIGHT, unassignedBars.length * 22 + 12),
                  borderTop: `2px solid ${C.border}`,
                  background: dragOverEstimator === "__unassigned__" && dragEstimateId
                    ? `${C.accent}08`
                    : C.isDark ? "#FBBF2403" : "#FBBF2406",
                  display: "flex",
                  ...(dragOverEstimator === "__unassigned__" && dragEstimateId ? { outline: `2px solid ${C.accent}40`, outlineOffset: -2 } : {}),
                  transition: "background 100ms",
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
                {unassignedBars.map((bar, i) => {
                  const isDragging = dragEstimateId === bar.id;
                  const rescheduleOffset = isDragging && dragMode === "reschedule" ? dragDaysDelta * DAY_WIDTH : 0;
                  return (
                  <div
                    key={bar.id}
                    onMouseDown={e => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      dragRef.current = {
                        startX: e.clientX, startY: e.clientY,
                        barId: bar.id, bidDue: bar.bidDue,
                        estimator: "", activated: false,
                      };
                      const ganttEl = e.currentTarget.closest("[data-gantt-rows]");
                      if (ganttEl) {
                        const rows = ganttEl.querySelectorAll("[data-estimator-row]");
                        rowRectsRef.current = Array.from(rows).map(el => ({
                          name: el.dataset.estimatorRow,
                          top: el.getBoundingClientRect().top,
                          bottom: el.getBoundingClientRect().bottom,
                        }));
                      }
                    }}
                    onClick={e => {
                      if (dragRef.current.activated) return;
                      e.stopPropagation();
                      navigate(`/estimate/${bar.id}/info`);
                    }}
                    style={{
                      position: "absolute",
                      left: bar.left + 2 + rescheduleOffset,
                      top: 6 + i * 22,
                      width: bar.width,
                      height: 18,
                      borderRadius: 4,
                      background: "#FBBF2420",
                      border: "1px solid #FBBF2430",
                      display: "flex",
                      alignItems: "center",
                      padding: "0 6px",
                      cursor: isDragging ? "grabbing" : "grab",
                      opacity: isDragging ? 0.4 : 1,
                      transition: "opacity 100ms",
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
                  );
                })}
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
          {tooltip.scheduledRange && (
            <div style={{ color: C.textMuted }}>Scheduled: {tooltip.scheduledRange}</div>
          )}
          {tooltip.bidDue && (
            <div style={{ color: C.textMuted }}>Due: {tooltip.bidDue}</div>
          )}
          {tooltip.daysNeeded > 0 && (
            <div style={{ color: C.textMuted }}>{tooltip.daysNeeded} work day{tooltip.daysNeeded !== 1 ? "s" : ""} needed</div>
          )}
          <div style={{ color: C.textMuted }}>Days remaining: {tooltip.daysLeft}</div>
          {tooltip.correspondenceCount > 0 && (
            <div style={{ color: "#60A5FA", marginTop: 2 }}>
              {tooltip.correspondenceCount} correspondence{tooltip.correspondenceCount !== 1 ? "s" : ""}, {tooltip.correspondenceTotalHours}h
              {tooltip.correspondenceNextDue ? ` · next due ${tooltip.correspondenceNextDue}` : ""}
            </div>
          )}
          {tooltip.emailCount > 1 && (
            <div style={{ color: "#A78BFA", marginTop: 2 }}>
              {tooltip.emailCount} linked emails
            </div>
          )}
          <div style={{ marginTop: 4, display: "flex", gap: 4, alignItems: "center" }}>
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
            {tooltip.conflict && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#FF3B30",
                  padding: "2px 6px",
                  borderRadius: T.radius.sm,
                  background: "#FF3B3018",
                }}
              >
                Conflict
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bar context menu */}
      {contextMenu && (
        <BarContextMenu
          pos={{ x: contextMenu.x, y: contextMenu.y }}
          bar={contextMenu.bar}
          currentEstimator={contextMenu.estimator}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Estimator context menu (right-click on estimator name) */}
      {estimatorMenu && (
        <EstimatorContextMenu
          pos={{ x: estimatorMenu.x, y: estimatorMenu.y }}
          name={estimatorMenu.name}
          color={estimatorMenu.color}
          projectCount={estimatorMenu.projectCount}
          C={C}
          T={T}
          onViewScorecard={() => {
            onEstimatorClick?.({ name: estimatorMenu.name, color: estimatorMenu.color });
            setEstimatorMenu(null);
          }}
          onRemove={() => {
            const name = estimatorMenu.name;
            // Reassign all their estimates to unassigned
            const allEsts = estimatorRows.flatMap(r => r.estimates);
            const theirs = allEsts.filter(e => e.estimator === name);
            for (const e of theirs) {
              useEstimatesStore.getState().updateIndexEntry(e.id, { estimator: "" });
            }
            // Find and remove from master data
            const estimators = useMasterDataStore.getState().masterData?.estimators || [];
            const match = estimators.find(e => e.name === name);
            if (match) {
              useMasterDataStore.getState().removeMasterItem("estimators", match.id);
            }
            useUiStore.getState().showToast(`Removed estimator "${name}"`);
            setEstimatorMenu(null);
          }}
          onClose={() => setEstimatorMenu(null)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ALERTS SECTION
// ══════════════════════════════════════════════════════════
function AlertsSection({ warnings, C, T }) {
  if (!warnings || warnings.length === 0) return null;

  const isRed = w => w.type === "overloaded" || w.type === "conflict";
  const isAmber = w => w.type === "predicted_overload" || w.type === "load_imbalance";
  const alertBg = w => isRed(w) ? "#FF3B3010" : isAmber(w) ? "#FF950010" : "#FBBF2410";
  const alertBorder = w => isRed(w) ? "#FF3B3025" : isAmber(w) ? "#FF950025" : "#FBBF2425";
  const alertIcon = w => {
    if (w.type === "conflict") return "\u{1F534}";
    if (w.type === "overloaded") return "\u{1F534}";
    if (w.type === "predicted_overload") return "\u{1F7E0}";
    if (w.type === "load_imbalance") return "\u2696\uFE0F";
    return "\u26A0\uFE0F";
  };

  const handleSuggestion = (w, s) => {
    if (s.action === "reassign") {
      useEstimatesStore.getState().updateIndexEntry(w.estimateId, { estimator: s.target });
      useUiStore.getState().showToast(`Reassigned to ${s.target}`);
    } else if (s.action === "extend") {
      useEstimatesStore.getState().updateIndexEntry(w.estimateId, { bidDue: s.newBidDue });
      useUiStore.getState().showToast(`Extended due date by ${s.daysNeeded} day${s.daysNeeded !== 1 ? "s" : ""}`);
    }
  };

  // Sort: conflicts first, then overloaded, then predicted, then imbalance, then rest
  const priority = { conflict: 0, overloaded: 1, predicted_overload: 2, load_imbalance: 3, bid_cluster: 4 };
  const sorted = [...warnings].sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9));

  return (
    <div style={{ marginTop: T.space[5] }}>
      <div style={{ fontSize: T.fontSize.sm, fontWeight: 700, color: C.text, marginBottom: T.space[2] }}>Alerts</div>
      <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>
        {sorted.slice(0, 10).map((w, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: T.space[3],
              padding: `${T.space[2]}px ${T.space[3]}px`,
              background: alertBg(w),
              border: `1px solid ${alertBorder(w)}`,
              borderRadius: T.radius.md,
              fontSize: T.fontSize.xs,
              color: C.text,
            }}
          >
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{alertIcon(w)}</span>
            <div style={{ flex: 1 }}>
              {w.type === "conflict" && (
                <>
                  <div>
                    <strong>{w.estimateName}</strong> ({w.estimator}) needs to start{" "}
                    {parseDateStr(w.scheduledStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })} (before today) to meet{" "}
                    {parseDateStr(w.bidDue).toLocaleDateString("en-US", { month: "short", day: "numeric" })} deadline
                  </div>
                  {w.suggestions?.length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      {w.suggestions.map((s, si) => (
                        <button
                          key={si}
                          onClick={() => handleSuggestion(w, s)}
                          style={{
                            ...bt(C),
                            padding: "3px 10px",
                            fontSize: 9,
                            fontWeight: 600,
                            borderRadius: T.radius.sm,
                            color: s.action === "reassign" ? "#30D158" : "#60A5FA",
                            background: s.action === "reassign" ? "#30D15812" : "#60A5FA12",
                            border: `1px solid ${s.action === "reassign" ? "#30D15830" : "#60A5FA30"}`,
                          }}
                        >
                          {s.label}
                          {s.capacity ? ` (${s.capacity}h free)` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {w.type === "overloaded" && (
                <span>
                  <strong>{w.estimator}</strong> is overloaded on{" "}
                  {parseDateStr(w.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {w.hours}h scheduled
                </span>
              )}
              {w.type === "predicted_overload" && (
                <span>
                  In <strong>{w.daysFromNow} day{w.daysFromNow !== 1 ? "s" : ""}</strong>, <strong>{w.estimator}</strong> will be at{" "}
                  <strong>{w.utilization}%</strong> capacity ({w.hours}h scheduled)
                </span>
              )}
              {w.type === "bid_cluster" && (
                <span>
                  <strong>{w.count} bids</strong> due the week of{" "}
                  {parseDateStr(w.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
              {w.type === "load_imbalance" && (
                <span>
                  <strong>{w.overloaded.name}</strong> at {w.overloaded.utilization}% while{" "}
                  <strong>{w.underloaded.name}</strong> is at {w.underloaded.utilization}% on{" "}
                  {parseDateStr(w.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
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
// BY HOURS VIEW
// ══════════════════════════════════════════════════════════
function ByHoursView({ workload, C, T, navigate }) {
  const { estimatorRows, unassignedEstimates, CAPACITY_HOURS, effectiveHoursPerDay } = workload;
  const capHours = effectiveHoursPerDay || CAPACITY_HOURS;

  const ProgressBar = ({ value, max, color }) => (
    <div style={{ height: 6, borderRadius: 3, background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", overflow: "hidden", flex: 1 }}>
      <div style={{ height: "100%", width: `${Math.min(100, max > 0 ? (value / max) * 100 : 0)}%`, background: color, borderRadius: 3, transition: "width 300ms" }} />
    </div>
  );

  const EstimateRow = ({ est }) => {
    const color = SCHEDULE_COLORS[est.scheduleStatus] || "#A78BFA";
    return (
      <div
        onClick={() => navigate(`/estimate/${est.id}/info`)}
        style={{
          display: "flex", alignItems: "center", gap: T.space[3],
          padding: `${T.space[2]}px ${T.space[3]}px`,
          borderRadius: T.radius.sm,
          cursor: "pointer",
          background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
          border: `1px solid ${C.border}40`,
          transition: "background 100ms",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: T.fontSize.xs, fontWeight: T.fontWeight.semibold, color: C.text, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
            {est.name}
          </div>
          {est.bidDue && (
            <div style={{ fontSize: 9, color: C.textDim, marginTop: 1 }}>
              Due {parseDateStr(est.bidDue).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {est.daysRemaining > 0 ? ` · ${est.daysRemaining}d left` : est.daysRemaining === 0 ? " · Today" : " · Overdue"}
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
        // Daily capacity used
        const dailyHours = row.estimates.reduce((s, e) => s + e.hoursPerDay, 0);
        const utilPct = Math.round((dailyHours / capHours) * 100);
        const utilColor = utilizationColor(dailyHours, capHours);

        return (
          <div key={row.name} style={{ ...cardSolid(C), padding: T.space[4] }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: T.space[3], marginBottom: T.space[3] }}>
              <Avatar name={row.name} color={row.color} size={32} fontSize={12} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: T.fontSize.base, fontWeight: T.fontWeight.bold, color: C.text }}>{row.name}</div>
                <div style={{ fontSize: 9, color: C.textDim }}>{row.estimates.length} active project{row.estimates.length !== 1 ? "s" : ""}</div>
              </div>
              {/* Utilization badge */}
              <div style={{
                fontSize: 10, fontWeight: 700, color: utilColor,
                padding: "3px 8px", borderRadius: T.radius.sm,
                background: hexAlpha(utilColor, 0.12),
              }}>
                {utilPct}% utilized
              </div>
            </div>

            {/* Hours summary */}
            <div style={{ display: "flex", gap: T.space[4], marginBottom: T.space[3] }}>
              <div>
                <div style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text }}>{totalHours}h</div>
                <div style={{ fontSize: 8, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>Estimated</div>
              </div>
              <div>
                <div style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text }}>{totalLogged}h</div>
                <div style={{ fontSize: 8, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>Logged</div>
              </div>
              <div>
                <div style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text }}>
                  {Math.max(0, totalHours - totalLogged)}h
                </div>
                <div style={{ fontSize: 8, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>Remaining</div>
              </div>
            </div>

            {/* Utilization bar */}
            <div style={{ marginBottom: T.space[3] }}>
              <div style={{ height: 4, borderRadius: 2, background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${Math.min(100, utilPct)}%`,
                  background: utilColor, borderRadius: 2, transition: "width 300ms",
                }} />
              </div>
            </div>

            {/* Estimates list */}
            <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>
              {sorted.map(est => <EstimateRow key={est.id} est={est} />)}
            </div>
          </div>
        );
      })}

      {/* Unassigned card */}
      {unassignedEstimates.length > 0 && (
        <div style={{ ...cardSolid(C), padding: T.space[4], border: `1px solid #FBBF2430` }}>
          <div style={{ display: "flex", alignItems: "center", gap: T.space[3], marginBottom: T.space[3] }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", background: "#FBBF2420",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
            }}>?</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: T.fontSize.base, fontWeight: T.fontWeight.bold, color: "#FBBF24" }}>Unassigned</div>
              <div style={{ fontSize: 9, color: C.textDim }}>{unassignedEstimates.length} project{unassignedEstimates.length !== 1 ? "s" : ""} need assignment</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>
            {unassignedEstimates.map(est => <EstimateRow key={est.id} est={est} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// BY DUE DATE VIEW
// ══════════════════════════════════════════════════════════
function ByDueDateView({ workload, C, T, navigate }) {
  const { allEstimates } = workload;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
    const todayKey = toDateStr(today);

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
  }, [sorted]);

  const urgencyColor = (daysRemaining) => {
    if (daysRemaining < 0) return "#FF3B30";  // overdue
    if (daysRemaining <= 3) return "#FF9500";  // critical
    if (daysRemaining <= 7) return "#FBBF24";  // warning
    return "#30D158";                          // comfortable
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
          <div style={{
            display: "flex", alignItems: "center", gap: T.space[2],
            marginBottom: T.space[3],
          }}>
            <div style={{
              fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold,
              color: week.label === "Overdue" ? "#FF3B30" : C.text,
            }}>
              {week.label}
            </div>
            <div style={{
              fontSize: 9, fontWeight: 600, color: C.textDim,
              padding: "2px 8px", borderRadius: T.radius.full,
              background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            }}>
              {week.estimates.length} bid{week.estimates.length !== 1 ? "s" : ""}
            </div>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          {/* Estimate cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: T.space[3] }}>
            {week.estimates.map(est => {
              const uColor = urgencyColor(est.daysRemaining);
              const schedColor = SCHEDULE_COLORS[est.scheduleStatus] || "#A78BFA";
              const hoursRemaining = Math.max(0, est.estimatedHours - est.hoursLogged);
              return (
                <div
                  key={est.id}
                  onClick={() => navigate(`/estimate/${est.id}/info`)}
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
                      <div style={{
                        width: 28, height: 28, borderRadius: "50%", background: "#FBBF2420",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, color: "#FBBF24",
                      }}>?</div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Name */}
                      <div style={{
                        fontSize: T.fontSize.sm, fontWeight: T.fontWeight.semibold, color: C.text,
                        overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                      }}>
                        {est.name}
                      </div>
                      {/* Estimator name */}
                      <div style={{ fontSize: 9, color: C.textDim, marginTop: 1 }}>
                        {est.estimator || "Unassigned"}
                      </div>
                    </div>

                    {/* Due date badge */}
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: uColor,
                      padding: "3px 8px", borderRadius: T.radius.sm,
                      background: hexAlpha(uColor, 0.12),
                      flexShrink: 0,
                    }}>
                      {est.daysRemaining < 0 ? `${Math.abs(est.daysRemaining)}d overdue`
                        : est.daysRemaining === 0 ? "Due today"
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
                    <div style={{ height: 4, borderRadius: 2, background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%", width: `${est.percentComplete}%`,
                        background: schedColor, borderRadius: 2, transition: "width 300ms",
                      }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                      <span style={{ fontSize: 8, color: C.textDim }}>{est.percentComplete}% complete</span>
                      <span style={{
                        fontSize: 8, fontWeight: 600, color: schedColor, textTransform: "capitalize",
                      }}>
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

// ══════════════════════════════════════════════════════════
// SCHEDULE SETTINGS POPOVER (Manager-only)
// ══════════════════════════════════════════════════════════
function ScheduleSettings({ C, T }) {
  const [open, setOpen] = useState(false);
  const productionHours = useUiStore(s => s.appSettings?.productionHoursPerDay) || 7;
  const bufferHours = useUiStore(s => s.appSettings?.bufferHours) || 0;
  const overheadPercent = useUiStore(s => s.appSettings?.overheadPercent) ?? 15;
  const behindThreshold = useUiStore(s => s.appSettings?.behindThreshold) ?? 20;
  const aheadThreshold = useUiStore(s => s.appSettings?.aheadThreshold) ?? 15;
  const updateSetting = useUiStore(s => s.updateSetting);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          ...bt(C),
          padding: "6px 10px",
          fontSize: T.fontSize.xs,
          color: C.textMuted,
          background: open ? `${C.accent}12` : (C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"),
          border: `1px solid ${open ? C.accent + "30" : C.border}`,
          borderRadius: T.radius.sm,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
        title="Schedule Settings"
      >
        <span style={{ fontSize: 13 }}>⚙</span>
        <span style={{ fontWeight: 600 }}>Schedule</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            background: C.bg1,
            border: `1px solid ${C.border}`,
            borderRadius: T.radius.md,
            padding: T.space[4],
            boxShadow: T.shadow?.md || "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 50,
            minWidth: 240,
          }}
        >
          <div style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.text, marginBottom: T.space[3] }}>
            Schedule Settings
          </div>

          {/* Production Hours/Day */}
          <div style={{ marginBottom: T.space[3] }}>
            <label style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>
              Production Hours / Day
            </label>
            <input
              type="number"
              min={1}
              max={12}
              step={0.5}
              value={productionHours}
              onChange={e => updateSetting("productionHoursPerDay", Number(e.target.value) || 7)}
              style={{
                ...inp(C),
                width: "100%",
                padding: "6px 10px",
                fontSize: T.fontSize.xs,
              }}
            />
            <div style={{ fontSize: 8, color: C.textDim, marginTop: 2 }}>
              Expected productive hours per estimator per day
            </div>
          </div>

          {/* Buffer Hours */}
          <div>
            <label style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>
              Buffer Between Estimates (hrs)
            </label>
            <input
              type="number"
              min={0}
              max={24}
              step={1}
              value={bufferHours}
              onChange={e => updateSetting("bufferHours", Number(e.target.value) || 0)}
              style={{
                ...inp(C),
                width: "100%",
                padding: "6px 10px",
                fontSize: T.fontSize.xs,
              }}
            />
            <div style={{ fontSize: 8, color: C.textDim, marginTop: 2 }}>
              Gap between consecutive estimate blocks (0 = no gap)
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: `1px solid ${C.border}40`, margin: `${T.space[3]}px 0` }} />

          {/* Overhead % */}
          <div style={{ marginBottom: T.space[3] }}>
            <label style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>
              Overhead %
            </label>
            <input
              type="number"
              min={0}
              max={50}
              step={5}
              value={overheadPercent}
              onChange={e => updateSetting("overheadPercent", Math.min(50, Math.max(0, Number(e.target.value) || 0)))}
              style={{
                ...inp(C),
                width: "100%",
                padding: "6px 10px",
                fontSize: T.fontSize.xs,
              }}
            />
            <div style={{ fontSize: 8, color: C.textDim, marginTop: 2 }}>
              Non-production time: admin, meetings, walkthroughs
            </div>
          </div>

          {/* Behind Threshold */}
          <div style={{ marginBottom: T.space[3] }}>
            <label style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>
              Behind Threshold %
            </label>
            <input
              type="number"
              min={5}
              max={50}
              step={5}
              value={behindThreshold}
              onChange={e => updateSetting("behindThreshold", Math.min(50, Math.max(5, Number(e.target.value) || 20)))}
              style={{
                ...inp(C),
                width: "100%",
                padding: "6px 10px",
                fontSize: T.fontSize.xs,
              }}
            />
            <div style={{ fontSize: 8, color: C.textDim, marginTop: 2 }}>
              Flag "behind" when progress lags day progress by this %
            </div>
          </div>

          {/* Ahead Threshold */}
          <div>
            <label style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>
              Ahead Threshold %
            </label>
            <input
              type="number"
              min={5}
              max={50}
              step={5}
              value={aheadThreshold}
              onChange={e => updateSetting("aheadThreshold", Math.min(50, Math.max(5, Number(e.target.value) || 15)))}
              style={{
                ...inp(C),
                width: "100%",
                padding: "6px 10px",
                fontSize: T.fontSize.xs,
              }}
            />
            <div style={{ fontSize: 8, color: C.textDim, marginTop: 2 }}>
              Flag "ahead" when progress exceeds day progress by this %
            </div>
          </div>
        </div>
      )}
    </div>
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
  const pendingReviews = useReviewStore(s => s.reviews.filter(r => r.status !== "completed").length);
  const isManager = useOrgStore(selectIsManager);

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

  // Drag-and-drop handler: reassign estimate to a different estimator
  const handleDrop = useCallback((estimateId, estimatorName) => {
    if (!estimateId) return;
    useEstimatesStore.getState().updateIndexEntry(estimateId, { estimator: estimatorName });
    const estName = workload.allEstimates?.find(e => e.id === estimateId)?.name || "Estimate";
    useUiStore.getState().showToast(
      estimatorName ? `Assigned "${estName}" to ${estimatorName}` : `Moved "${estName}" to Unassigned`,
      "success"
    );
  }, [workload.allEstimates]);

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
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
          {isManager && <ScheduleSettings C={C} T={T} />}
          {isManager && (
            <>
              <button
                onClick={() => setShowAutoSchedule(true)}
                style={{
                  ...bt(C),
                  padding: "6px 12px",
                  fontSize: T.fontSize.xs,
                  fontWeight: 600,
                  color: C.accent,
                  background: `${C.accent}10`,
                  border: `1px solid ${C.accent}30`,
                  borderRadius: T.radius.sm,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 12 }}>⚡</span>
                Optimize
              </button>
              <button
                onClick={() => setShowWhatIf(true)}
                style={{
                  ...bt(C),
                  padding: "6px 12px",
                  fontSize: T.fontSize.xs,
                  fontWeight: 600,
                  color: C.textMuted,
                  background: C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
                  border: `1px solid ${C.border}`,
                  borderRadius: T.radius.sm,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 12 }}>🔮</span>
                What If?
              </button>
            </>
          )}
          <PdfExport workload={workload} />
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
            label: "Needs Action",
            value: workload.needsActionCount || 0,
            color: (workload.needsActionCount || 0) > 0 ? "#FF3B30" : "#34D399",
            sub: (workload.needsActionCount || 0) > 0 ? "conflicts / overloads" : "all clear",
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

      {/* View Toggle Strip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: T.space[4], flexWrap: "wrap", gap: T.space[3] }}>
        <div style={{ display: "flex", background: C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", borderRadius: T.radius.md, padding: 2, border: `1px solid ${C.border}` }}>
          {[
            { key: "timeline", label: "Timeline" },
            { key: "weekly", label: "This Week" },
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
                color: sortMode === v.key ? (C.isDark ? "#fff" : C.text) : C.textMuted,
                background: sortMode === v.key ? (C.isDark ? "rgba(255,255,255,0.10)" : "#fff") : "transparent",
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: T.space[4] }}>
          <GanttRangeNav
            rangeLabel={rangeLabel}
            onPrev={() => setRangeOffset(o => o - 1)}
            onNext={() => setRangeOffset(o => o + 1)}
            onToday={() => setRangeOffset(0)}
            C={C}
            T={T}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, color: C.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Week</span>
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
          />
          <AlertsSection warnings={workload.warnings} C={C} T={T} />
        </>
      )}

      {/* Weekly Plan View */}
      {sortMode === "weekly" && (
        <WeeklyPlanView workload={workload} C={C} T={T} />
      )}

      {/* By Hours View */}
      {sortMode === "hours" && (
        <ByHoursView workload={workload} C={C} T={T} navigate={navigate} />
      )}

      {/* By Due Date View */}
      {sortMode === "due-date" && (
        <ByDueDateView workload={workload} C={C} T={T} navigate={navigate} />
      )}

      {/* Analytics View */}
      {sortMode === "analytics" && (
        <AnalyticsPanel
          C={C}
          T={T}
          estimatorColors={new Map(workload.estimatorRows.map(r => [r.name, r.color]))}
        />
      )}

      {/* Workload Trends — shows on Timeline and Analytics views */}
      {(sortMode === "timeline" || sortMode === "analytics") && (
        <WorkloadTrendsPanel workload={workload} C={C} T={T} />
      )}

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

      {/* Auto Schedule Modal */}
      {showAutoSchedule && (
        <AutoScheduleModal workload={workload} onClose={() => setShowAutoSchedule(false)} />
      )}

      {/* What If Modal */}
      {showWhatIf && (
        <WhatIfModal workload={workload} onClose={() => setShowWhatIf(false)} />
      )}
    </div>
  );
}
