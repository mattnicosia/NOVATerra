// ScheduleSidebar.jsx — Schedule details, settings, and activity inspector
// Follows the same pattern as ModelSidebar.jsx

import { useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useScheduleStore } from '@/stores/scheduleStore';
import { dayToDate, formatDate } from '@/utils/scheduleEngine';
import { fmt, nn } from '@/utils/format';
import { card, sectionLabel, bt, inp } from '@/utils/styles';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';

function StatBox({ label, value, C, T, accent }) {
  return (
    <div style={{
      textAlign: "center", padding: T.space[2],
      background: C.bg2 || C.bg1, borderRadius: T.radius.sm,
    }}>
      <div style={{
        fontSize: T.fontSize.lg, fontWeight: T.fontWeight.heavy,
        fontFamily: "'DM Mono',monospace",
        color: accent ? C.accent : C.text,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: C.textDim, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function ScheduleSidebar() {
  const C = useTheme();
  const T = C.T;

  const activities = useScheduleStore(s => s.activities);
  const selectedActivity = useScheduleStore(s => s.getSelectedActivity());
  const setSelected = useScheduleStore(s => s.setSelectedActivityId);
  const selectedId = useScheduleStore(s => s.selectedActivityId);
  const viewMode = useScheduleStore(s => s.viewMode);
  const setViewMode = useScheduleStore(s => s.setViewMode);
  const startDate = useScheduleStore(s => s.projectStartDate);
  const setStartDate = useScheduleStore(s => s.setProjectStartDate);
  const workDays = useScheduleStore(s => s.workDaysPerWeek);
  const setWorkDays = useScheduleStore(s => s.setWorkDaysPerWeek);
  const zones = useScheduleStore(s => s.zones);
  const addZone = useScheduleStore(s => s.addZone);
  const removeZone = useScheduleStore(s => s.removeZone);
  const renameZone = useScheduleStore(s => s.renameZone);
  const setTradeOverride = useScheduleStore(s => s.setTradeOverride);
  const clearTradeOverride = useScheduleStore(s => s.clearTradeOverride);
  const tradeOverrides = useScheduleStore(s => s.tradeOverrides);

  const projectEndDay = useScheduleStore(s => s.getProjectEndDay());
  const criticalPathDays = useMemo(() => {
    const crit = activities.filter(a => a.isCritical);
    if (crit.length === 0) return 0;
    return Math.max(...crit.map(a => a.earlyFinish));
  }, [activities]);

  const totalCost = useMemo(() => activities.reduce((s, a) => s + a.totalCost, 0), [activities]);
  const criticalCount = useMemo(() => activities.filter(a => a.isCritical).length, [activities]);

  const endDate = useMemo(() => {
    if (!startDate || projectEndDay === 0) return "—";
    return formatDate(dayToDate(projectEndDay, startDate, workDays));
  }, [startDate, projectEndDay, workDays]);

  const startDateDisplay = useMemo(() => {
    if (!startDate) return "—";
    return formatDate(new Date(startDate + 'T00:00:00'));
  }, [startDate]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.space[3], height: "100%", overflowY: "auto" }}>

      {/* View Mode Toggle */}
      <div style={{ ...card(C), padding: T.space[3] }}>
        <div style={{ ...sectionLabel(C), marginBottom: T.space[2] }}>View</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          {[
            { key: "gantt", label: "Gantt" },
            { key: "takt",  label: "Takt" },
          ].map(m => (
            <button
              key={m.key}
              onClick={() => setViewMode(m.key)}
              style={{
                ...bt(C),
                padding: "6px 10px", fontSize: T.fontSize.xs,
                background: viewMode === m.key ? (C.gradient || C.accent) : C.bg2 || C.bg1,
                color: viewMode === m.key ? "#fff" : C.textMuted,
                borderRadius: T.radius.sm - 1,
                justifyContent: "center",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Schedule Summary */}
      <div style={{ ...card(C), padding: T.space[3] }}>
        <div style={{ ...sectionLabel(C), marginBottom: T.space[2] }}>Schedule Summary</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          <StatBox label="Duration" value={`${projectEndDay}d`} C={C} T={T} accent />
          <StatBox label="Critical Path" value={`${criticalPathDays}d`} C={C} T={T} />
          <StatBox label="Activities" value={activities.length} C={C} T={T} />
          <StatBox label="Total Cost" value={fmt(totalCost)} C={C} T={T} />
        </div>
        <div style={{ marginTop: T.space[2], fontSize: T.fontSize.xs, color: C.textDim }}>
          {startDateDisplay} → {endDate}
        </div>
      </div>

      {/* Settings */}
      <div style={{ ...card(C), padding: T.space[3] }}>
        <div style={{ ...sectionLabel(C), marginBottom: T.space[2] }}>Settings</div>

        {/* Start Date */}
        <div style={{ marginBottom: T.space[2] }}>
          <div style={{ fontSize: T.fontSize.xs, color: C.textMuted, marginBottom: 3 }}>Start Date</div>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            style={{
              ...inp(C),
              width: "100%", fontSize: T.fontSize.sm, padding: "5px 8px",
            }}
          />
        </div>

        {/* Work Days */}
        <div style={{ marginBottom: T.space[2] }}>
          <div style={{ fontSize: T.fontSize.xs, color: C.textMuted, marginBottom: 3 }}>Work Days / Week</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {[5, 7].map(d => (
              <button
                key={d}
                onClick={() => setWorkDays(d)}
                style={{
                  ...bt(C),
                  padding: "5px 8px", fontSize: T.fontSize.xs, justifyContent: "center",
                  background: workDays === d ? C.accent : C.bg2 || C.bg1,
                  color: workDays === d ? "#fff" : C.textMuted,
                  borderRadius: T.radius.sm - 1,
                }}
              >
                {d} days
              </button>
            ))}
          </div>
        </div>

        {/* Zones (for Takt) */}
        {viewMode === "takt" && (
          <div>
            <div style={{ fontSize: T.fontSize.xs, color: C.textMuted, marginBottom: 3 }}>Zones</div>
            {zones.map((z, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                <input
                  value={z}
                  onChange={e => renameZone(idx, e.target.value)}
                  style={{ ...inp(C), flex: 1, fontSize: T.fontSize.xs, padding: "3px 6px" }}
                />
                {zones.length > 1 && (
                  <button
                    onClick={() => removeZone(idx)}
                    style={{ ...bt(C), padding: 3, background: "transparent" }}
                    title="Remove zone"
                  >
                    <Ic d={I.trash} size={10} color={C.textDim} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => addZone(`Zone ${zones.length + 1}`)}
              style={{
                ...bt(C),
                padding: "4px 8px", fontSize: T.fontSize.xs,
                color: C.accent, background: "transparent",
                width: "100%", justifyContent: "center",
              }}
            >
              + Add Zone
            </button>
          </div>
        )}
      </div>

      {/* Selected Activity Detail */}
      {selectedActivity && (
        <div style={{ ...card(C), padding: T.space[3] }}>
          <div style={{ ...sectionLabel(C), marginBottom: T.space[2] }}>Activity Detail</div>

          {/* Trade + color */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: T.space[2] }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: selectedActivity.color, flexShrink: 0 }} />
            <div style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.text }}>
              {selectedActivity.label}
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: T.space[2] }}>
            <DetailRow label="Duration" value={`${selectedActivity.duration}d`} C={C} T={T} />
            <DetailRow label="Float" value={`${selectedActivity.totalFloat}d`} C={C} T={T}
              valueColor={selectedActivity.totalFloat === 0 ? (C.red || "#ef4444") : (C.green || "#22c55e")} />
            <DetailRow label="Early Start" value={`Day ${selectedActivity.earlyStart}`} C={C} T={T} />
            <DetailRow label="Early Finish" value={`Day ${selectedActivity.earlyFinish}`} C={C} T={T} />
            <DetailRow label="Late Start" value={`Day ${selectedActivity.lateStart}`} C={C} T={T} />
            <DetailRow label="Late Finish" value={`Day ${selectedActivity.lateFinish}`} C={C} T={T} />
          </div>

          {/* Cost */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: T.space[2], marginBottom: T.space[2] }}>
            <DetailRow label="Labor Cost" value={fmt(selectedActivity.laborCost)} C={C} T={T} />
            <DetailRow label="Total Cost" value={fmt(selectedActivity.totalCost)} C={C} T={T} />
            <DetailRow label="Items" value={selectedActivity.itemCount} C={C} T={T} />
          </div>

          {/* Crew overrides */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: T.space[2] }}>
            <div style={{ fontSize: 9, color: C.textDim, marginBottom: 4 }}>Crew Configuration</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 8, color: C.textDim, marginBottom: 2 }}>Crew Size</div>
                <input
                  type="number"
                  value={tradeOverrides[selectedActivity.tradeKey]?.crewSize || selectedActivity.crewSize}
                  onChange={e => setTradeOverride(selectedActivity.tradeKey, 'crewSize', parseInt(e.target.value) || 1)}
                  style={{ ...inp(C), width: "100%", fontSize: T.fontSize.xs, padding: "3px 6px" }}
                  min={1}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 8, color: C.textDim, marginBottom: 2 }}>Daily Rate</div>
                <input
                  type="number"
                  value={tradeOverrides[selectedActivity.tradeKey]?.dailyRate || selectedActivity.dailyRate}
                  onChange={e => setTradeOverride(selectedActivity.tradeKey, 'dailyRate', parseInt(e.target.value) || 100)}
                  style={{ ...inp(C), width: "100%", fontSize: T.fontSize.xs, padding: "3px 6px" }}
                  min={100}
                  step={50}
                />
              </div>
            </div>
            {tradeOverrides[selectedActivity.tradeKey] && (
              <button
                onClick={() => clearTradeOverride(selectedActivity.tradeKey)}
                style={{ ...bt(C), padding: "3px 8px", fontSize: 9, color: C.textDim, background: "transparent", width: "100%", justifyContent: "center" }}
              >
                Reset to defaults
              </button>
            )}
          </div>

          {/* Critical badge */}
          {selectedActivity.isCritical && (
            <div style={{
              marginTop: T.space[2], padding: "4px 8px",
              background: `${C.red || "#ef4444"}20`,
              border: `1px solid ${C.red || "#ef4444"}40`,
              borderRadius: T.radius.sm,
              fontSize: T.fontSize.xs, color: C.red || "#ef4444",
              textAlign: "center", fontWeight: T.fontWeight.semibold,
            }}>
              Critical Path
            </div>
          )}
        </div>
      )}

      {/* Activity List */}
      <div style={{ ...card(C), padding: T.space[3], flex: 1, overflowY: "auto" }}>
        <div style={{ ...sectionLabel(C), marginBottom: T.space[2] }}>Activities ({activities.length})</div>
        {activities.map(act => (
          <div
            key={act.id}
            onClick={() => setSelected(act.id === selectedId ? null : act.id)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 6px", borderRadius: T.radius.sm - 1,
              background: act.id === selectedId ? C.accentBg : "transparent",
              cursor: "pointer", marginBottom: 1,
              transition: "background 0.1s",
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: 2, background: act.color, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: T.fontSize.xs, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {act.label}
            </div>
            <div style={{ fontSize: 9, fontFamily: "'DM Mono',monospace", color: C.textDim, flexShrink: 0 }}>
              {act.duration}d
            </div>
            {act.isCritical && (
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.red || "#ef4444", flexShrink: 0 }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailRow({ label, value, C, T, valueColor }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ fontSize: 9, color: C.textDim }}>{label}</span>
      <span style={{ fontSize: T.fontSize.xs, fontFamily: "'DM Mono',monospace", color: valueColor || C.text, fontWeight: 500 }}>
        {value}
      </span>
    </div>
  );
}
