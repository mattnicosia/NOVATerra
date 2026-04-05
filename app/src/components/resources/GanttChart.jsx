import React, { useState, useEffect, useMemo, useRef } from "react";
import { useResourceStore } from "@/stores/resourceStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import Avatar from "@/components/shared/Avatar";
import BarContextMenu from "@/components/resources/BarContextMenu";
import EstimatorContextMenu from "@/components/resources/EstimatorContextMenu";
import { parseDateStr, addDays, toDateStr } from "@/utils/dateHelpers";
import { SCHEDULE_COLORS, getStatusColors, utilizationColor, hexAlpha } from "@/utils/resourceColors";
import { bt } from "@/utils/styles";
import { addWeekdays } from "@/hooks/useWorkloadData";

const TODAY = toDateStr(new Date());
const DAY_WIDTH = 44; // px per day column

function GanttChart({ workload, C, T, navigate, onEstimatorClick, onDrop, workWeek, onProjectClick }) {
  const STATUS_COLORS = getStatusColors(C);
  const {
    estimatorRows,
    unassignedEstimates,
    CAPACITY_HOURS,
    effectiveHoursPerDay,
    estimatorCapacity,
    dailyLoad,
    rangeDays,
    rangeStart: _rangeStart,
    rangeEnd: _rangeEnd,
  } = workload;
  const todayStr = new Date().toISOString().slice(0, 10);
  const dragEstimateId = useResourceStore(s => s.dragEstimateId);
  const dragOverEstimator = useResourceStore(s => s.dragOverEstimator);
  const dragMode = useResourceStore(s => s.dragMode);
  const dragDaysDelta = useResourceStore(s => s.dragDaysDelta);
  const {
    setDragEstimateId,
    setDragOverEstimator,
    setDragMode,
    setDragDaysDelta,
    setDragOriginalBidDue,
    clearDragState,
  } = useResourceStore.getState();

  // Refs for mouse drag (reschedule + reassign)
  const dragRef = useRef({ startX: 0, startY: 0, barId: null, bidDue: "", estimator: "", activated: false });
  const rowRectsRef = useRef([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [estimatorMenu, setEstimatorMenu] = useState(null); // { x, y, name, color, projectCount }
  // "Add Estimator" removed — estimators come from org members only
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
        useUiStore.getState().showToast(`Rescheduled to ${fmt(newDue)}`, "success");
      } else if (st.dragMode === "reassign" && st.dragOverEstimator) {
        const target = st.dragOverEstimator === "__unassigned__" ? "" : st.dragOverEstimator;
        if (target !== dr.estimator) {
          onDrop?.(dr.barId, target, dr.estimator);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand actions are stable; onDrop identity shouldn't re-register listeners
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

  // Pre-build O(1) lookup Map — replaces O(N) findIndex per bar (prevents O(N²) in rowData)
  const dayIndexMap = useMemo(() => {
    const m = new Map();
    days.forEach((d, i) => m.set(d.key, i));
    return m;
  }, [days]);

  // Get today position index
  const todayIdx = dayIndexMap.get(TODAY) ?? -1;
  const totalWidth = days.length * DAY_WIDTH;

  // Build estimate bars per row
  const rowData = useMemo(() => {
    return estimatorRows.map(row => {
      const bars = row.estimates.map(est => {
        const startIdx = dayIndexMap.get(est.scheduledStart) ?? -1;
        const endIdx = dayIndexMap.get(est.scheduledEnd) ?? -1;
        const s = Math.max(0, startIdx >= 0 ? startIdx : 0);
        const e = Math.min(days.length - 1, endIdx >= 0 ? endIdx : days.length - 1);
        // Build segment positions for split bars
        let segPositions = null;
        if (est.segments && est.segments.length > 1) {
          segPositions = est.segments.map(seg => {
            const si = dayIndexMap.get(seg.start) ?? -1;
            const ei = dayIndexMap.get(seg.end) ?? -1;
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
  }, [estimatorRows, days, dayIndexMap]);

  // Unassigned bars
  const unassignedBars = useMemo(() => {
    return unassignedEstimates.map(est => {
      const sKey = est.scheduledStart || TODAY;
      const eKey = est.scheduledEnd || TODAY;
      const startIdx = dayIndexMap.get(sKey) ?? -1;
      const endIdx = dayIndexMap.get(eKey) ?? -1;
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
  }, [unassignedEstimates, days, dayIndexMap]);

  // Tooltip state
  const [tooltip, setTooltip] = useState(null);

  // Inline hours editing state
  const [editingHoursId, setEditingHoursId] = useState(null);
  const [editingHoursVal, setEditingHoursVal] = useState("");

  const ROW_HEIGHT = 54;
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
            // Compute daily utilization — actual overlapping load for today
            const todayEstLoad = dailyLoad?.get(todayStr)?.get(row.name);
            const dailyHours = todayEstLoad?.totalHours || 0;
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
                    x: e.clientX,
                    y: e.clientY,
                    name: row.name,
                    color: row.color,
                    projectCount: row.estimates.length,
                  });
                }}
                style={{
                  height: Math.max(ROW_HEIGHT, row.bars.length * 26 + 16),
                  display: "flex",
                  alignItems: "center",
                  gap: T.space[2],
                  padding: `0 ${T.space[3]}px`,
                  borderBottom: `1px solid ${C.border}08`,
                  cursor: "pointer",
                  ...(isDropTarget
                    ? {
                        background: `${C.accent}12`,
                        outline: `2px solid ${C.accent}`,
                        outlineOffset: -2,
                        borderRadius: 4,
                      }
                    : {}),
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
                height: Math.max(ROW_HEIGHT, unassignedBars.length * 26 + 16),
                display: "flex",
                alignItems: "center",
                gap: T.space[2],
                padding: `0 ${T.space[3]}px`,
                borderTop: `2px solid ${C.border}`,
                background:
                  dragOverEstimator === "__unassigned__" && dragEstimateId
                    ? `${C.accent}12`
                    : C.isDark
                      ? "#FBBF2406"
                      : "#FBBF240A",
                ...(dragOverEstimator === "__unassigned__" && dragEstimateId
                  ? { outline: `2px solid ${C.accent}`, outlineOffset: -2, borderRadius: 4 }
                  : {}),
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

          {/* "Add Estimator" removed — estimators come from org members / invitations */}
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
                    <div style={{ fontSize: 8, color: C.textDim, fontWeight: 600, lineHeight: 1 }}>{day.monthName}</div>
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
              const rowHeight = Math.max(ROW_HEIGHT, row.bars.length * 26 + 16);
              const isDropTarget = dragOverEstimator === row.name && dragEstimateId;
              return (
                <div
                  key={row.name}
                  data-estimator-row={row.name}
                  style={{
                    position: "relative",
                    height: rowHeight,
                    overflow: "hidden",
                    borderBottom: `1px solid ${C.border}08`,
                    display: "flex",
                    ...(isDropTarget
                      ? { background: `${C.accent}08`, outline: `2px solid ${C.accent}40`, outlineOffset: -2 }
                      : {}),
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
                    const color = SCHEDULE_COLORS[bar.scheduleStatus] || STATUS_COLORS[bar.status] || C.purple;
                    const isDragging = dragEstimateId === bar.id;
                    const rescheduleOffset = isDragging && dragMode === "reschedule" ? dragDaysDelta * DAY_WIDTH : 0;

                    // Render segment connectors (dashed lines between split bar segments)
                    const segConnectors =
                      bar.segPositions && bar.segPositions.length > 1
                        ? bar.segPositions.slice(0, -1).map((seg, si) => {
                            const next = bar.segPositions[si + 1];
                            const gapLeft = seg.left + seg.width + 2 + rescheduleOffset;
                            const gapWidth = next.left - seg.left - seg.width;
                            if (gapWidth <= 0) return null;
                            return (
                              <div
                                key={`conn-${bar.id}-${si}`}
                                style={{
                                  position: "absolute",
                                  left: gapLeft,
                                  top: 6 + i * 22 + 8,
                                  width: gapWidth - 4,
                                  height: 2,
                                  borderTop: `2px dashed ${color}40`,
                                  zIndex: 1,
                                  pointerEvents: "none",
                                }}
                              />
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
                              startX: e.clientX,
                              startY: e.clientY,
                              barId: bar.id,
                              bidDue: bar.bidDue,
                              estimator: row.name,
                              activated: false,
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
                            if (onProjectClick) {
                              onProjectClick({ ...bar, estimator: row.name }, e);
                            } else {
                              navigate(`/estimate/${bar.id}/info`);
                            }
                          }}
                          onDoubleClick={e => {
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
                              hours:
                                bar._teamSize > 1
                                  ? `${bar.hoursLogged}h / ${Math.round(bar._perPersonHours)}h (of ${bar.estimatedHours}h total)`
                                  : `${bar.hoursLogged}h / ${bar.estimatedHours}h`,
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
                              teamSize: bar._teamSize || 1,
                              teamMembers: bar._teamMembers || [],
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
                            animation:
                              bar.conflict && !isDragging ? "conflictPulse 2s ease-in-out infinite" : undefined,
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
                            {bar.width > 80 &&
                              (editingHoursId === bar.id ? (
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
                                  {bar._teamSize > 1
                                    ? `${Math.round(bar._perPersonHours)}h`
                                    : `${bar.estimatedHours || 0}h`}
                                </span>
                              ))}
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
                                  color: C.purple,
                                  background: C.purple + "20",
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
                            {/* Team size badge */}
                            {bar._teamSize > 1 && (
                              <span
                                title={`Team: ${(bar._teamMembers || []).join(", ")}`}
                                style={{
                                  fontSize: 7,
                                  fontWeight: 700,
                                  color: "#30D158",
                                  background: "#30D15820",
                                  borderRadius: 3,
                                  padding: "0 3px",
                                  flexShrink: 0,
                                  marginLeft: 3,
                                  lineHeight: "12px",
                                }}
                              >
                                ×{bar._teamSize}
                              </span>
                            )}
                          </div>
                          {/* Due date marker — orange dot when bar ends before bidDue */}
                          {bar.bidDue !== bar.scheduledEnd &&
                            (() => {
                              const dueIdx = dayIndexMap.get(bar.bidDue) ?? -1;
                              if (dueIdx < 0) return null;
                              const dotLeft = dueIdx * DAY_WIDTH + DAY_WIDTH / 2 - bar.left - 2;
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
                            <div
                              style={{
                                position: "absolute",
                                top: -14,
                                right: -2,
                                fontSize: 8,
                                fontWeight: 700,
                                color: "#fff",
                                background: dragDaysDelta > 0 ? "#30D158" : "#FF9500",
                                borderRadius: 4,
                                padding: "1px 4px",
                                whiteSpace: "nowrap",
                                zIndex: 20,
                              }}
                            >
                              {dragDaysDelta > 0 ? "+" : ""}
                              {dragDaysDelta}d
                            </div>
                          )}
                        </div>
                        {/* Additional segment bars for split/paused projects */}
                        {bar.segPositions &&
                          bar.segPositions.length > 1 &&
                          bar.segPositions.slice(1).map((seg, si) => (
                            <div
                              key={`seg-${bar.id}-${si + 1}`}
                              onMouseDown={e => {
                                if (e.button !== 0) return;
                                e.preventDefault();
                                dragRef.current = {
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  barId: bar.id,
                                  bidDue: bar.bidDue,
                                  estimator: row.name,
                                  activated: false,
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
                                if (onProjectClick) {
                                  onProjectClick({ ...bar, estimator: row.name }, e);
                                } else {
                                  navigate(`/estimate/${bar.id}/info`);
                                }
                              }}
                              onDoubleClick={e => {
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
                                boxShadow:
                                  isDragging && dragMode === "reschedule" ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
                              }}
                            >
                              {seg.width > 60 && (
                                <span
                                  style={{
                                    fontSize: 8,
                                    fontWeight: 600,
                                    color: C.textMuted,
                                    padding: "0 6px",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {bar.name}
                                </span>
                              )}
                            </div>
                          ))}
                      </React.Fragment>
                    );
                  })}

                  {/* Capacity utilization bar at bottom of row */}
                  {estimatorCapacity &&
                    (() => {
                      const cap = estimatorCapacity.get(row.name);
                      if (!cap) return null;
                      return (
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            bottom: 0,
                            right: 0,
                            height: 3,
                            display: "flex",
                            pointerEvents: "none",
                          }}
                        >
                          {days.map(day => {
                            const entry = cap.find(c => c.date === day.key);
                            if (!entry) return <div key={day.key} style={{ width: DAY_WIDTH, flexShrink: 0 }} />;
                            const pct = capHours > 0 ? entry.remainingHours / capHours : 1;
                            const color =
                              pct > 0.5 ? "#30D158" : pct > 0.25 ? "#FF9500" : pct > 0 ? "#FF3B30" : "transparent";
                            return (
                              <div
                                key={day.key}
                                style={{ width: DAY_WIDTH, flexShrink: 0, display: "flex", justifyContent: "center" }}
                              >
                                {entry.used > 0 && (
                                  <div
                                    style={{
                                      width: DAY_WIDTH - 6,
                                      height: 3,
                                      borderRadius: 1.5,
                                      background: `${color}40`,
                                    }}
                                  />
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
                  height: Math.max(ROW_HEIGHT, unassignedBars.length * 26 + 16),
                  overflow: "hidden",
                  borderTop: `2px solid ${C.border}`,
                  background:
                    dragOverEstimator === "__unassigned__" && dragEstimateId
                      ? `${C.accent}08`
                      : C.isDark
                        ? "#FBBF2403"
                        : "#FBBF2406",
                  display: "flex",
                  ...(dragOverEstimator === "__unassigned__" && dragEstimateId
                    ? { outline: `2px solid ${C.accent}40`, outlineOffset: -2 }
                    : {}),
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
                          startX: e.clientX,
                          startY: e.clientY,
                          barId: bar.id,
                          bidDue: bar.bidDue,
                          estimator: "",
                          activated: false,
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
                        if (onProjectClick) {
                          onProjectClick({ ...bar, estimator: "" }, e);
                        } else {
                          navigate(`/estimate/${bar.id}/info`);
                        }
                      }}
                      onDoubleClick={e => {
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
          {tooltip.teamSize > 1 && (
            <div style={{ color: "#30D158", marginTop: 2 }}>
              Team ({tooltip.teamSize}): {tooltip.teamMembers.join(", ")}
            </div>
          )}
          {tooltip.scheduledRange && <div style={{ color: C.textMuted }}>Scheduled: {tooltip.scheduledRange}</div>}
          {tooltip.bidDue && <div style={{ color: C.textMuted }}>Due: {tooltip.bidDue}</div>}
          {tooltip.daysNeeded > 0 && (
            <div style={{ color: C.textMuted }}>
              {tooltip.daysNeeded} work day{tooltip.daysNeeded !== 1 ? "s" : ""} needed
            </div>
          )}
          <div style={{ color: C.textMuted }}>Days remaining: {tooltip.daysLeft}</div>
          {tooltip.correspondenceCount > 0 && (
            <div style={{ color: "#60A5FA", marginTop: 2 }}>
              {tooltip.correspondenceCount} correspondence{tooltip.correspondenceCount !== 1 ? "s" : ""},{" "}
              {tooltip.correspondenceTotalHours}h
              {tooltip.correspondenceNextDue ? ` · next due ${tooltip.correspondenceNextDue}` : ""}
            </div>
          )}
          {tooltip.emailCount > 1 && (
            <div style={{ color: C.purple, marginTop: 2 }}>{tooltip.emailCount} linked emails</div>
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

export default GanttChart;
