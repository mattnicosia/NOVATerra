// GanttChart.jsx — SVG Gantt chart visualization
// Renders horizontal bars per trade activity with dependency arrows and critical path

import { useMemo, useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useScheduleStore } from "@/stores/scheduleStore";
import { dayToDate, formatDate } from "@/utils/scheduleEngine";
import { fmt } from "@/utils/format";

const ROW_H = 36;
const LABEL_W = 180;
const PAD_T = 40;
const PAD_R = 20;
const PAD_B = 30;
const BAR_PAD = 5;

export default function GanttChart() {
  const C = useTheme();
  const T = C.T;
  const activities = useScheduleStore(s => s.activities);
  const selectedId = useScheduleStore(s => s.selectedActivityId);
  const setSelected = useScheduleStore(s => s.setSelectedActivityId);
  const startDate = useScheduleStore(s => s.projectStartDate);
  const workDays = useScheduleStore(s => s.workDaysPerWeek);

  const [hoveredId, setHoveredId] = useState(null);

  const totalDuration = useMemo(() => {
    if (activities.length === 0) return 1;
    return Math.max(...activities.map(a => a.earlyFinish), 1);
  }, [activities]);

  const chartW = Math.max(600, totalDuration * 8 + LABEL_W + PAD_R);
  const chartH = PAD_T + activities.length * ROW_H + PAD_B;

  // X-axis ticks
  const ticks = useMemo(() => {
    const interval = totalDuration > 120 ? 20 : totalDuration > 60 ? 10 : 5;
    const result = [];
    for (let d = 0; d <= totalDuration; d += interval) {
      result.push(d);
    }
    return result;
  }, [totalDuration]);

  const barW = chartW - LABEL_W - PAD_R;

  // Build activity ID map for dependency arrows
  const idxMap = useMemo(() => {
    const m = {};
    activities.forEach((a, i) => {
      m[a.id] = i;
    });
    return m;
  }, [activities]);

  if (activities.length === 0) return null;

  return (
    <div style={{ overflowX: "auto", overflowY: "auto", height: "100%" }}>
      <svg
        width={chartW}
        height={chartH}
        style={{ display: "block", minWidth: chartW }}
        viewBox={`0 0 ${chartW} ${chartH}`}
      >
        {/* Background alternating rows */}
        {activities.map((act, i) => (
          <rect
            key={act.id + "-bg"}
            x={0}
            y={PAD_T + i * ROW_H}
            width={chartW}
            height={ROW_H}
            fill={i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent"}
          />
        ))}

        {/* Vertical grid lines */}
        {ticks.map(d => {
          const x = LABEL_W + (d / totalDuration) * barW;
          return (
            <g key={`tick-${d}`}>
              <line x1={x} y1={PAD_T} x2={x} y2={chartH - PAD_B} stroke={C.border} strokeWidth={0.5} opacity={0.5} />
              <text
                x={x}
                y={chartH - PAD_B + 16}
                textAnchor="middle"
                fontSize={9}
                fill={C.textDim}
                fontFamily="'Switzer', sans-serif"
              >
                {d === 0 ? "Start" : `Day ${d}`}
              </text>
            </g>
          );
        })}

        {/* Header line */}
        <line x1={LABEL_W} y1={PAD_T} x2={chartW} y2={PAD_T} stroke={C.border} strokeWidth={1} />

        {/* Dependency arrows */}
        {activities.map(act => {
          if (act.predecessors.length === 0) return null;
          const actIdx = idxMap[act.id];
          const actY = PAD_T + actIdx * ROW_H + ROW_H / 2;
          const actX = LABEL_W + (act.earlyStart / totalDuration) * barW;

          return act.predecessors.map(pid => {
            const predIdx = idxMap[pid];
            if (predIdx === undefined) return null;
            const pred = activities[predIdx];
            const predY = PAD_T + predIdx * ROW_H + ROW_H / 2;
            const predXEnd = LABEL_W + (pred.earlyFinish / totalDuration) * barW;

            // Draw a simple right-angle connector
            const midX = (predXEnd + actX) / 2;

            return (
              <path
                key={`dep-${pid}-${act.id}`}
                d={`M ${predXEnd} ${predY} L ${midX} ${predY} L ${midX} ${actY} L ${actX} ${actY}`}
                fill="none"
                stroke={C.textDim}
                strokeWidth={1}
                opacity={0.4}
                markerEnd="url(#arrowhead)"
              />
            );
          });
        })}

        {/* Arrow marker definition */}
        <defs>
          <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
            <path d="M 0 0 L 6 2 L 0 4 Z" fill={C.textDim} opacity={0.6} />
          </marker>
        </defs>

        {/* Activity bars + labels */}
        {activities.map((act, i) => {
          const y = PAD_T + i * ROW_H;
          const barX = LABEL_W + (act.earlyStart / totalDuration) * barW;
          const barWidth = Math.max(4, (act.duration / totalDuration) * barW);
          const isSelected = act.id === selectedId;
          const isHovered = act.id === hoveredId;

          return (
            <g key={act.id}>
              {/* Trade label */}
              <text
                x={LABEL_W - 8}
                y={y + ROW_H / 2 + 1}
                textAnchor="end"
                fontSize={11}
                fontFamily="'Switzer', sans-serif"
                fontWeight={act.isCritical ? 600 : 400}
                fill={isSelected ? C.accent : C.text}
              >
                {act.label.length > 22 ? act.label.slice(0, 20) + "…" : act.label}
              </text>

              {/* Bar */}
              <rect
                x={barX}
                y={y + BAR_PAD}
                width={barWidth}
                height={ROW_H - BAR_PAD * 2}
                rx={4}
                fill={act.color}
                opacity={act.isCritical ? 1 : 0.75}
                stroke={isSelected ? "#fff" : act.isCritical ? "rgba(255,255,255,0.3)" : "none"}
                strokeWidth={isSelected ? 2 : act.isCritical ? 1 : 0}
                cursor="pointer"
                onClick={() => setSelected(act.id === selectedId ? null : act.id)}
                onMouseEnter={() => setHoveredId(act.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ transition: "opacity 0.15s" }}
              />

              {/* Duration label inside bar (if wide enough) */}
              {barWidth > 36 && (
                <text
                  x={barX + barWidth / 2}
                  y={y + ROW_H / 2 + 1}
                  textAnchor="middle"
                  fontSize={9}
                  fontFamily="'Switzer', sans-serif"
                  fontWeight={600}
                  fill="#fff"
                  pointerEvents="none"
                >
                  {act.duration}d
                </text>
              )}

              {/* Float indicator (if has float) */}
              {act.totalFloat > 0 && (
                <rect
                  x={barX + barWidth + 2}
                  y={y + ROW_H / 2 - 2}
                  width={Math.min((act.totalFloat / totalDuration) * barW, 60)}
                  height={4}
                  rx={2}
                  fill={C.textDim}
                  opacity={0.25}
                />
              )}

              {/* Critical path marker */}
              {act.isCritical && (
                <circle cx={LABEL_W - 16} cy={y + ROW_H / 2} r={3} fill={C.red || "#ef4444"} opacity={0.8} />
              )}

              {/* Hover tooltip */}
              {isHovered && (
                <g>
                  <rect
                    x={barX + barWidth + 8}
                    y={y + 2}
                    width={160}
                    height={ROW_H - 4}
                    rx={4}
                    fill="rgba(0,0,0,0.85)"
                  />
                  <text x={barX + barWidth + 14} y={y + 14} fontSize={9} fill="#fff" fontFamily="'Switzer', sans-serif">
                    {act.duration}d · ES:{act.earlyStart} EF:{act.earlyFinish}
                  </text>
                  <text x={barX + barWidth + 14} y={y + 26} fontSize={9} fill="#aaa" fontFamily="'Switzer', sans-serif">
                    {fmt(act.totalCost)} · Float: {act.totalFloat}d
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
