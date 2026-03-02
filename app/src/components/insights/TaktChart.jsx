// TaktChart.jsx — SVG Takt / Flowline diagram
// Shows trade progression through zones over time as diagonal flowlines

import { useMemo, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useScheduleStore } from '@/stores/scheduleStore';
import { generateTaktData } from '@/utils/scheduleEngine';

const PAD_L = 100;  // Zone label width
const PAD_T = 40;   // Header height
const PAD_R = 40;
const PAD_B = 40;
const ZONE_H = 80;  // Height per zone row

export default function TaktChart() {
  const C = useTheme();
  const T = C.T;
  const activities = useScheduleStore(s => s.activities);
  const zones = useScheduleStore(s => s.zones);
  const selectedId = useScheduleStore(s => s.selectedActivityId);
  const setSelected = useScheduleStore(s => s.setSelectedActivityId);

  const [hoveredId, setHoveredId] = useState(null);

  const taktLines = useMemo(() => {
    return generateTaktData(activities, zones);
  }, [activities, zones]);

  // Total time span
  const totalDuration = useMemo(() => {
    if (taktLines.length === 0) return 1;
    let maxDay = 0;
    taktLines.forEach(line => {
      line.segments.forEach(seg => {
        maxDay = Math.max(maxDay, seg.endDay);
      });
    });
    return Math.max(maxDay, 1);
  }, [taktLines]);

  const chartW = Math.max(600, totalDuration * 6 + PAD_L + PAD_R);
  const chartH = PAD_T + zones.length * ZONE_H + PAD_B;
  const timeW = chartW - PAD_L - PAD_R;

  // X-axis ticks
  const ticks = useMemo(() => {
    const interval = totalDuration > 120 ? 20 : totalDuration > 60 ? 10 : 5;
    const result = [];
    for (let d = 0; d <= totalDuration; d += interval) {
      result.push(d);
    }
    return result;
  }, [totalDuration]);

  if (activities.length === 0) return null;

  return (
    <div style={{ overflowX: "auto", overflowY: "auto", height: "100%" }}>
      <svg
        width={chartW}
        height={chartH}
        style={{ display: "block", minWidth: chartW }}
        viewBox={`0 0 ${chartW} ${chartH}`}
      >
        {/* Zone row backgrounds */}
        {zones.map((zone, zIdx) => (
          <rect
            key={zone + zIdx}
            x={PAD_L}
            y={PAD_T + zIdx * ZONE_H}
            width={timeW}
            height={ZONE_H}
            fill={zIdx % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent"}
          />
        ))}

        {/* Zone labels */}
        {zones.map((zone, zIdx) => (
          <text
            key={`zl-${zIdx}`}
            x={PAD_L - 10}
            y={PAD_T + zIdx * ZONE_H + ZONE_H / 2 + 4}
            textAnchor="end"
            fontSize={12}
            fontFamily="'DM Sans',sans-serif"
            fontWeight={500}
            fill={C.text}
          >
            {zone}
          </text>
        ))}

        {/* Horizontal zone dividers */}
        {zones.map((_, zIdx) => (
          <line
            key={`zd-${zIdx}`}
            x1={PAD_L}
            y1={PAD_T + zIdx * ZONE_H}
            x2={chartW - PAD_R}
            y2={PAD_T + zIdx * ZONE_H}
            stroke={C.border}
            strokeWidth={0.5}
            opacity={0.5}
          />
        ))}

        {/* Vertical time grid */}
        {ticks.map(d => {
          const x = PAD_L + (d / totalDuration) * timeW;
          return (
            <g key={`ttick-${d}`}>
              <line x1={x} y1={PAD_T} x2={x} y2={chartH - PAD_B} stroke={C.border} strokeWidth={0.5} opacity={0.4} />
              <text x={x} y={chartH - PAD_B + 16} textAnchor="middle" fontSize={9} fill={C.textDim} fontFamily="'DM Sans',sans-serif">
                {d === 0 ? "Start" : `Day ${d}`}
              </text>
            </g>
          );
        })}

        {/* X-axis header */}
        <text x={chartW / 2} y={16} textAnchor="middle" fontSize={10} fill={C.textMuted} fontFamily="'DM Sans',sans-serif" fontWeight={600}>
          Time (Working Days)
        </text>

        {/* Flowlines */}
        {taktLines.map(line => {
          const isSelected = line.activityId === selectedId;
          const isHovered = line.activityId === hoveredId;
          const opacity = isSelected ? 1 : isHovered ? 0.9 : 0.65;
          const strokeW = isSelected ? 4 : isHovered ? 3.5 : 3;

          // Build path: for each zone, draw horizontal segment + diagonal to next
          let d = "";
          line.segments.forEach((seg, zIdx) => {
            const x1 = PAD_L + (seg.startDay / totalDuration) * timeW;
            const x2 = PAD_L + (seg.endDay / totalDuration) * timeW;
            const y = PAD_T + zIdx * ZONE_H + ZONE_H / 2;

            if (zIdx === 0) {
              d += `M ${x1} ${y}`;
            } else {
              // Diagonal from previous zone end to this zone start
              d += ` L ${x1} ${y}`;
            }
            // Horizontal in-zone segment
            d += ` L ${x2} ${y}`;
          });

          return (
            <g key={line.activityId}>
              {/* Shadow for selected */}
              {isSelected && (
                <path d={d} fill="none" stroke={line.color} strokeWidth={8} opacity={0.2} strokeLinecap="round" strokeLinejoin="round" />
              )}

              {/* Main flowline */}
              <path
                d={d}
                fill="none"
                stroke={line.color}
                strokeWidth={strokeW}
                opacity={opacity}
                strokeLinecap="round"
                strokeLinejoin="round"
                cursor="pointer"
                onClick={() => setSelected(line.activityId === selectedId ? null : line.activityId)}
                onMouseEnter={() => setHoveredId(line.activityId)}
                onMouseLeave={() => setHoveredId(null)}
              />

              {/* Trade label at start */}
              {line.segments.length > 0 && (
                <text
                  x={PAD_L + (line.segments[0].startDay / totalDuration) * timeW - 4}
                  y={PAD_T + ZONE_H / 2 - 10}
                  textAnchor="start"
                  fontSize={8}
                  fontFamily="'DM Sans',sans-serif"
                  fontWeight={600}
                  fill={line.color}
                  opacity={isHovered || isSelected ? 1 : 0.7}
                >
                  {line.label.length > 16 ? line.label.slice(0, 14) + "…" : line.label}
                </text>
              )}

              {/* Critical indicator */}
              {line.isCritical && line.segments.length > 0 && (
                <circle
                  cx={PAD_L + (line.segments[0].startDay / totalDuration) * timeW}
                  cy={PAD_T + ZONE_H / 2}
                  r={4}
                  fill={C.red || "#ef4444"}
                  stroke="#fff"
                  strokeWidth={1}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
