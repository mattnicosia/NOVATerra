import { useMemo } from "react";
import { cardSolid } from "@/utils/styles";
import Avatar from "@/components/shared/Avatar";

/* ────────────────────────────────────────────────────────
   EstimatorHeatmap — GitHub-style calendar heatmap (P0)

   Each row = estimator. Each cell = one weekday.
   Color intensity = hours committed that day.
   Instantly shows gaps, overloads, and patterns.
   ──────────────────────────────────────────────────────── */

const CELL_SIZE = 18;
const CELL_GAP = 2;

// Generate weekdays for N weeks starting from a given Monday
function buildWeekdays(startMonday, weeks) {
  const days = [];
  const d = new Date(startMonday);
  for (let w = 0; w < weeks; w++) {
    for (let wd = 0; wd < 5; wd++) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    // Skip weekend
    d.setDate(d.getDate() + 2);
  }
  return days;
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function EstimatorHeatmap({ workload, C, T }) {
  const {
    estimatorRows,
    dailyLoad,
    effectiveHoursPerDay,
  } = workload;

  const capHours = effectiveHoursPerDay || 7;
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayStr = fmtDate(today);

  // 6 weeks of weekdays: 1 week back + 5 weeks forward
  const weeks = 6;
  const startMonday = useMemo(() => {
    const m = getMonday(today);
    m.setDate(m.getDate() - 7); // 1 week back
    return m;
  }, [today]);

  const days = useMemo(() => buildWeekdays(startMonday, weeks), [startMonday]);

  // Week labels
  const weekLabels = useMemo(() => {
    const labels = [];
    for (let w = 0; w < weeks; w++) {
      const d = days[w * 5];
      if (!d) continue;
      const m = getMonday(today);
      const dayKey = fmtDate(d);
      const mondayKey = fmtDate(m);
      const nextMondayKey = fmtDate(new Date(m.getTime() + 7 * 86400000));
      if (dayKey === fmtDate(new Date(m.getTime() - 7 * 86400000))) labels.push("Last Week");
      else if (dayKey === mondayKey) labels.push("This Week");
      else if (dayKey === nextMondayKey) labels.push("Next Week");
      else labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    }
    return labels;
  }, [days, today]);

  // Cell color based on utilization
  const cellColor = (hours) => {
    if (hours <= 0) return C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)";
    const pct = hours / capHours;
    if (pct <= 0.3) return C.isDark ? "rgba(48,209,88,0.15)" : "rgba(48,209,88,0.20)";
    if (pct <= 0.6) return C.isDark ? "rgba(48,209,88,0.30)" : "rgba(48,209,88,0.40)";
    if (pct <= 0.85) return C.isDark ? "rgba(255,149,0,0.30)" : "rgba(255,149,0,0.35)";
    if (pct <= 1.0) return C.isDark ? "rgba(255,149,0,0.50)" : "rgba(255,149,0,0.55)";
    return C.isDark ? "rgba(255,59,48,0.50)" : "rgba(255,59,48,0.55)";
  };

  const dk = C.isDark;

  return (
    <div style={{ ...cardSolid(C), padding: T.space[4], overflowX: "auto" }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: C.textDim,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: T.space[3],
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>Utilization Heatmap</span>
        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 8, color: C.textDim }}>Light</span>
          {[0, 0.3, 0.6, 0.85, 1.1].map((pct, i) => (
            <div
              key={i}
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: cellColor(pct * capHours),
              }}
            />
          ))}
          <span style={{ fontSize: 8, color: C.textDim }}>Over</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {/* Week labels header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          <div style={{ width: 120, flexShrink: 0 }} />
          {weekLabels.map((label, w) => (
            <div
              key={w}
              style={{
                width: 5 * (CELL_SIZE + CELL_GAP),
                fontSize: 8,
                fontWeight: 600,
                color: label === "This Week" ? C.accent : C.textDim,
                textAlign: "center",
                flexShrink: 0,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Day-of-week header (single letters) */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 2 }}>
          <div style={{ width: 120, flexShrink: 0 }} />
          {days.map((d, i) => (
            <div
              key={i}
              style={{
                width: CELL_SIZE,
                marginRight: CELL_GAP,
                // Extra gap between weeks
                marginLeft: i > 0 && i % 5 === 0 ? 4 : 0,
                fontSize: 7,
                fontWeight: 500,
                color: fmtDate(d) === todayStr ? C.accent : C.textDim,
                textAlign: "center",
                flexShrink: 0,
              }}
            >
              {d.toLocaleDateString("en-US", { weekday: "narrow" })}
            </div>
          ))}
        </div>

        {/* Estimator rows */}
        {estimatorRows.map(row => (
          <div key={row.name} style={{ display: "flex", alignItems: "center", marginBottom: CELL_GAP }}>
            {/* Estimator label */}
            <div
              style={{
                width: 120,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 6,
                paddingRight: 8,
              }}
            >
              <Avatar name={row.name} color={row.color} size={16} fontSize={7} />
              <span
                style={{
                  fontSize: T.fontSize.xs,
                  fontWeight: T.fontWeight.semibold,
                  color: C.text,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  flex: 1,
                }}
              >
                {row.name}
              </span>
            </div>

            {/* Day cells */}
            {days.map((d, i) => {
              const dayStr = fmtDate(d);
              const load = dailyLoad?.get(dayStr)?.get(row.name);
              const hours = load?.totalHours || 0;
              const isPast = d < today;
              const isToday = dayStr === todayStr;
              const isFuture = d > today;

              return (
                <div
                  key={i}
                  title={`${row.name} · ${dayStr} · ${Math.round(hours * 10) / 10}h / ${capHours}h`}
                  style={{
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    marginRight: CELL_GAP,
                    marginLeft: i > 0 && i % 5 === 0 ? 4 : 0,
                    borderRadius: 3,
                    background: cellColor(hours),
                    border: isToday
                      ? `2px solid ${C.accent}`
                      : `1px solid ${dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                    opacity: isPast && hours === 0 ? 0.4 : 1,
                    flexShrink: 0,
                    cursor: "default",
                    transition: "transform 100ms",
                    position: "relative",
                  }}
                >
                  {/* Show hours number in cell if overloaded */}
                  {hours > capHours && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 7,
                        fontWeight: 700,
                        color: "#fff",
                      }}
                    >
                      {Math.round(hours)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
