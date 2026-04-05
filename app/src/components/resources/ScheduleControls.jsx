import { bt } from "@/utils/styles";
import { SCHEDULE_COLORS } from "@/utils/resourceColors";

export function ScheduleLegend({ C, T }) {
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

export function GanttRangeNav({ rangeLabel, onPrev, onNext, onToday, C, T }) {
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
