import { cardSolid } from "@/utils/styles";
import { SCHEDULE_COLORS, utilizationColor, hexAlpha } from "@/utils/resourceColors";
import { parseDateStr } from "@/utils/dateHelpers";
import Avatar from "@/components/shared/Avatar";

export default function ByHoursView({ workload, C, T, navigate, onProjectClick }) {
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
