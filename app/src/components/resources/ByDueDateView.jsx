import { useMemo } from "react";
import { cardSolid } from "@/utils/styles";
import { SCHEDULE_COLORS, hexAlpha } from "@/utils/resourceColors";
import { toDateStr, parseDateStr, addDays } from "@/utils/dateHelpers";
import Avatar from "@/components/shared/Avatar";

export default function ByDueDateView({ workload, C, T, navigate, onProjectClick }) {
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

    for (const est of sorted) {
      if (!est.bidDue) continue;
      const due = parseDateStr(est.bidDue);
      const day = due.getDay();
      const monday = new Date(due);
      monday.setDate(due.getDate() - ((day + 6) % 7));
      const weekKey = toDateStr(monday);

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
      if (a.label === "Overdue") return -1;
      if (b.label === "Overdue") return 1;
      return a.weekKey.localeCompare(b.weekKey);
    });
  }, [sorted, today]);

  const urgencyColor = daysRemaining => {
    if (daysRemaining < 0) return "#FF3B30";
    if (daysRemaining <= 3) return "#FF9500";
    if (daysRemaining <= 7) return "#FBBF24";
    return "#30D158";
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
          <div style={{ display: "flex", alignItems: "center", gap: T.space[2], marginBottom: T.space[3] }}>
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
                      <div style={{ fontSize: 9, color: C.textDim, marginTop: 1 }}>
                        {est.estimator || "Unassigned"}
                      </div>
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
