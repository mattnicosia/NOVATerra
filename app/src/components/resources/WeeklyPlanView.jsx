import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useResourceStore } from "@/stores/resourceStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import { cardSolid, bt } from "@/utils/styles";
import Avatar from "@/components/shared/Avatar";

/* ────────────────────────────────────────────────────────
   WeeklyPlanView — 5-day planning grid

   Mon-Fri columns × estimator rows. Each cell shows
   estimate cards scheduled on that day plus a capacity bar.
   Right sidebar shows unassigned / overflow work.
   ──────────────────────────────────────────────────────── */

const SCHEDULE_COLORS = {
  ahead: "#30D158",
  "on-track": "#60A5FA",
  behind: "#FF9500",
  overdue: "#FF3B30",
  conflict: "#FF3B30",
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const toDateStr = dt =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

const parseDateStr = s => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

function getWeekDays(offset) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Find Monday of this week
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7) + offset * 7);
  const days = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(toDateStr(d));
  }
  return days;
}

function WeekLabel({ weekDays }) {
  const start = parseDateStr(weekDays[0]);
  const end = parseDateStr(weekDays[4]);
  const opts = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}, ${end.getFullYear()}`;
}

// ── Estimate Card ──
function EstCard({ est, C, T: _T, navigate, compact }) {
  const color = SCHEDULE_COLORS[est.scheduleStatus] || C.purple;
  return (
    <div
      onClick={() => navigate(`/estimate/${est.id}/info`)}
      draggable
      onDragStart={e => {
        e.dataTransfer.setData("text/plain", est.id);
        useResourceStore.getState().setDragEstimateId(est.id);
      }}
      onDragEnd={() => useResourceStore.getState().clearDragState()}
      style={{
        padding: compact ? "4px 6px" : "6px 8px",
        borderRadius: 6,
        background: C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
        border: `1px solid ${color}30`,
        borderLeft: `3px solid ${color}`,
        cursor: "pointer",
        transition: "background 100ms",
        fontSize: compact ? 9 : 10,
      }}
    >
      <div
        style={{
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
      <div style={{ display: "flex", alignItems: "center", gap: 4, color: C.textDim, fontSize: compact ? 8 : 9 }}>
        <span>{est.hoursPerDay?.toFixed(1)}h</span>
        {est.percentComplete > 0 && (
          <>
            <span style={{ color: C.border }}>·</span>
            <span style={{ color }}>{est.percentComplete}%</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──
export default function WeeklyPlanView({ workload, C, T }) {
  const navigate = useNavigate();
  const weekOffset = useResourceStore(s => s.weeklyViewWeekOffset);
  const setWeekOffset = useResourceStore(s => s.setWeeklyViewWeekOffset);
  const { setDragOverEstimator, clearDragState } = useResourceStore.getState();

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const todayStr = toDateStr(new Date());

  const {
    estimatorRows,
    unassignedEstimates,
    effectiveHoursPerDay,
    CAPACITY_HOURS,
    estimatorCapacity,
    dailyLoad: _dailyLoad,
  } = workload;
  const capHours = effectiveHoursPerDay || CAPACITY_HOURS;

  // Build per-estimator × per-day grid
  const grid = useMemo(() => {
    const result = [];
    for (const row of estimatorRows) {
      const dayCells = weekDays.map(dayStr => {
        const ests = row.estimates.filter(e => e.workDays && e.workDays.includes(dayStr));
        const cap = estimatorCapacity?.get(row.name);
        const dayEntry = cap?.find(c => c.date === dayStr);
        return {
          dayStr,
          estimates: ests,
          totalHours: ests.reduce((s, e) => s + (e.hoursPerDay || 0), 0),
          remaining: dayEntry ? dayEntry.remainingHours : capHours,
        };
      });
      result.push({ ...row, dayCells });
    }
    return result;
  }, [estimatorRows, weekDays, estimatorCapacity, capHours]);

  // Sidebar: unassigned + estimates not in this week
  const sidebarEstimates = useMemo(() => {
    const weekSet = new Set(weekDays);
    const overflow = estimatorRows.flatMap(r =>
      r.estimates.filter(e => e.workDays && !e.workDays.some(d => weekSet.has(d))),
    );
    return [...unassignedEstimates, ...overflow];
  }, [estimatorRows, unassignedEstimates, weekDays]);

  // Handle drop onto a day cell — team-aware
  const handleDrop = useCallback(
    (estimatorName, dayStr, e) => {
      e.preventDefault();
      const estId = e.dataTransfer.getData("text/plain") || useResourceStore.getState().dragEstimateId;
      if (!estId) return;
      const store = useEstimatesStore.getState();
      const est = store.estimatesIndex.find(ei => ei.id === estId);
      const lead = est?.estimator || "";
      const coEsts = est?.coEstimators || [];
      const team = [lead, ...coEsts].filter(Boolean);

      if (!lead) {
        // Unassigned → assign as lead
        store.updateIndexEntry(estId, { estimator: estimatorName });
        useUiStore.getState().showToast(`Assigned to ${estimatorName}`);
      } else if (team.includes(estimatorName)) {
        // Already on team — no-op
        useUiStore.getState().showToast(`${estimatorName} is already on this estimate`, "info");
      } else {
        // Has a lead → add as co-estimator
        store.updateIndexEntry(estId, { coEstimators: [...coEsts, estimatorName] });
        useUiStore.getState().showToast(`Added ${estimatorName} to team`);
      }
      clearDragState();
    },
    [clearDragState],
  );

  const weekLabel = WeekLabel({ weekDays });
  const isThisWeek = weekOffset === 0;

  return (
    <div>
      {/* Week Navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: T.space[3], marginBottom: T.space[4] }}>
        <button
          onClick={() => setWeekOffset(weekOffset - 1)}
          style={{
            ...bt(C),
            padding: "6px 10px",
            fontSize: T.fontSize.xs,
            color: C.textMuted,
            borderRadius: T.radius.sm,
            border: `1px solid ${C.border}`,
          }}
        >
          ← Prev
        </button>
        <button
          onClick={() => setWeekOffset(0)}
          style={{
            ...bt(C),
            padding: "6px 14px",
            fontSize: T.fontSize.xs,
            fontWeight: isThisWeek ? 700 : 500,
            color: isThisWeek ? C.accent : C.textMuted,
            borderRadius: T.radius.sm,
            border: `1px solid ${isThisWeek ? C.accent + "40" : C.border}`,
          }}
        >
          This Week
        </button>
        <button
          onClick={() => setWeekOffset(weekOffset + 1)}
          style={{
            ...bt(C),
            padding: "6px 10px",
            fontSize: T.fontSize.xs,
            color: C.textMuted,
            borderRadius: T.radius.sm,
            border: `1px solid ${C.border}`,
          }}
        >
          Next →
        </button>
        <span style={{ fontSize: T.fontSize.sm, fontWeight: 600, color: C.text, marginLeft: T.space[2] }}>
          {weekLabel}
        </span>
      </div>

      <div style={{ display: "flex", gap: T.space[4] }}>
        {/* Main Grid */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {/* Day Headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "140px repeat(5, 1fr)",
              gap: 1,
              marginBottom: 1,
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Estimator
            </div>
            {weekDays.map((dayStr, i) => {
              const dt = parseDateStr(dayStr);
              const isToday = dayStr === todayStr;
              return (
                <div
                  key={dayStr}
                  style={{
                    padding: "8px 12px",
                    fontSize: 10,
                    fontWeight: isToday ? 700 : 600,
                    color: isToday ? C.accent : C.textMuted,
                    textAlign: "center",
                    background: isToday ? `${C.accent}08` : "transparent",
                    borderRadius: 6,
                  }}
                >
                  {DAY_NAMES[i]} {dt.getDate()}
                </div>
              );
            })}
          </div>

          {/* Estimator Rows */}
          {grid.map(row => (
            <div
              key={row.name}
              style={{
                display: "grid",
                gridTemplateColumns: "140px repeat(5, 1fr)",
                gap: 1,
                marginBottom: 2,
                background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)",
                borderRadius: 8,
                border: `1px solid ${C.border}30`,
              }}
            >
              {/* Name cell */}
              <div
                style={{
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderRight: `1px solid ${C.border}20`,
                }}
              >
                <Avatar name={row.name} color={row.color} size={24} fontSize={9} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: C.text,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {row.name}
                  </div>
                  <div style={{ fontSize: 8, color: C.textDim }}>
                    {row.estimates.length} bid{row.estimates.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>

              {/* Day cells */}
              {row.dayCells.map(cell => {
                const isToday = cell.dayStr === todayStr;
                const utilPct = capHours > 0 ? cell.totalHours / capHours : 0;
                const capColor = utilPct <= 0.5 ? "#30D158" : utilPct <= 0.875 ? "#FF9500" : "#FF3B30";

                return (
                  <div
                    key={cell.dayStr}
                    onDragOver={e => {
                      e.preventDefault();
                      setDragOverEstimator(row.name);
                    }}
                    onDragLeave={() => setDragOverEstimator(null)}
                    onDrop={e => handleDrop(row.name, cell.dayStr, e)}
                    style={{
                      padding: "6px 6px 10px",
                      minHeight: 80,
                      position: "relative",
                      background: isToday ? `${C.accent}05` : "transparent",
                      borderLeft: `1px solid ${C.border}15`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    {cell.estimates.map(est => (
                      <EstCard key={est.id} est={est} C={C} T={T} navigate={navigate} compact />
                    ))}

                    {/* Capacity indicator */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: 2,
                        left: 6,
                        right: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          height: 3,
                          borderRadius: 2,
                          background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.min(100, utilPct * 100)}%`,
                            background: capColor,
                            borderRadius: 2,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 7, color: C.textDim, flexShrink: 0 }}>{cell.remaining.toFixed(1)}h</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {grid.length === 0 && (
            <div style={{ textAlign: "center", padding: T.space[6], color: C.textDim, fontSize: T.fontSize.sm }}>
              No estimators with active bids
            </div>
          )}
        </div>

        {/* Sidebar: Available Work */}
        {sidebarEstimates.length > 0 && (
          <div
            style={{
              width: 220,
              flexShrink: 0,
              ...cardSolid(C),
              padding: T.space[3],
              alignSelf: "flex-start",
              maxHeight: "70vh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: T.space[3],
              }}
            >
              Available Work ({sidebarEstimates.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sidebarEstimates.map(est => (
                <EstCard key={est.id} est={est} C={C} T={T} navigate={navigate} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
