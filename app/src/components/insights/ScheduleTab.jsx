// ScheduleTab.jsx — Main schedule tab: auto-generates from estimate, Gantt + Takt views
// Lazy-loaded by InsightsPage (same pattern as ModelTab)

import { useEffect, useMemo, useCallback } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useItemsStore } from '@/stores/itemsStore';
import { useScheduleStore } from '@/stores/scheduleStore';
import { generateSchedule } from '@/utils/scheduleEngine';
import { fmt } from '@/utils/format';
import { card, bt, sectionLabel, accentButton } from '@/utils/styles';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';

import GanttChart from './GanttChart';
import TaktChart from './TaktChart';
import ScheduleSidebar from './ScheduleSidebar';

export default function ScheduleTab() {
  const C = useTheme();
  const T = C.T;

  const items = useItemsStore(s => s.items);
  const activities = useScheduleStore(s => s.activities);
  const generated = useScheduleStore(s => s.generated);
  const generating = useScheduleStore(s => s.generating);
  const setActivities = useScheduleStore(s => s.setActivities);
  const setGenerating = useScheduleStore(s => s.setGenerating);
  const viewMode = useScheduleStore(s => s.viewMode);
  const tradeOverrides = useScheduleStore(s => s.tradeOverrides);
  const projectEndDay = useScheduleStore(s => s.getProjectEndDay());
  const startDate = useScheduleStore(s => s.projectStartDate);
  const workDays = useScheduleStore(s => s.workDaysPerWeek);

  // Summary stats
  const criticalCount = useMemo(() => activities.filter(a => a.isCritical).length, [activities]);
  const totalCost = useMemo(() => activities.reduce((s, a) => s + a.totalCost, 0), [activities]);

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    // Small timeout so spinner renders
    setTimeout(() => {
      const result = generateSchedule(items, tradeOverrides);
      setActivities(result);
    }, 50);
  }, [items, tradeOverrides, setActivities, setGenerating]);

  // Auto-generate on mount if items exist and no schedule yet
  useEffect(() => {
    if (!generated && items.length > 0) {
      handleGenerate();
    }
  }, []); // Only on mount

  // Empty state
  if (!generated && !generating && items.length === 0) {
    return (
      <div style={{ ...card(C), padding: T.space[8], textAlign: "center" }}>
        <Ic d={I.schedule} size={48} color={C.textDim} />
        <div style={{ fontSize: T.fontSize.lg, color: C.textMuted, marginTop: T.space[4] }}>
          No estimate items yet
        </div>
        <div style={{ fontSize: T.fontSize.sm, color: C.textDim, marginTop: T.space[2] }}>
          Add items to your estimate, then come back to auto-generate a construction schedule.
        </div>
      </div>
    );
  }

  // Generating state
  if (generating) {
    return (
      <div style={{ ...card(C), padding: T.space[8], textAlign: "center" }}>
        <div style={{
          width: 32, height: 32, border: `3px solid ${C.bg3}`,
          borderTopColor: C.accent, borderRadius: "50%",
          animation: "spin 1s linear infinite",
          margin: "0 auto", marginBottom: T.space[3],
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: T.fontSize.sm, color: C.textMuted }}>Generating schedule...</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 160px)", gap: T.space[3] }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: T.space[3],
        padding: `${T.space[2]}px ${T.space[3]}px`,
        background: C.glassBg, borderRadius: T.radius.md,
        border: `1px solid ${C.glassBorder}`,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}>
        {/* Rebuild button */}
        <button
          onClick={handleGenerate}
          style={{
            ...bt(C),
            padding: "6px 14px", fontSize: T.fontSize.xs,
            background: C.bg2 || C.bg1, gap: 6,
            borderRadius: T.radius.sm,
          }}
          title="Regenerate schedule from current estimate"
        >
          <Ic d={I.refresh || "M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0114.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0020.49 15"} size={12} color={C.textMuted} />
          Rebuild
        </button>

        <div style={{ flex: 1 }} />

        {/* Summary stats */}
        <div style={{ display: "flex", gap: T.space[4], alignItems: "center" }}>
          <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
            <span style={{ fontFamily: "'DM Mono',monospace", color: C.accent, fontWeight: 600 }}>{projectEndDay}</span> days
          </div>
          <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
            <span style={{ fontFamily: "'DM Mono',monospace", color: C.text, fontWeight: 600 }}>{activities.length}</span> activities
          </div>
          <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
            <span style={{ fontFamily: "'DM Mono',monospace", color: C.red || "#ef4444", fontWeight: 600 }}>{criticalCount}</span> critical
          </div>
          <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
            <span style={{ fontFamily: "'DM Mono',monospace", color: C.text, fontWeight: 600 }}>{fmt(totalCost)}</span>
          </div>
        </div>
      </div>

      {/* Main content: Chart + Sidebar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: T.space[3], flex: 1, minHeight: 0 }}>
        {/* Chart area */}
        <div style={{ ...card(C), padding: T.space[3], overflow: "hidden", minHeight: 0 }}>
          {viewMode === "gantt" ? <GanttChart /> : <TaktChart />}
        </div>

        {/* Sidebar */}
        <ScheduleSidebar />
      </div>

      {/* Activity count badge */}
      <div style={{
        position: "fixed", bottom: 16, left: 16,
        background: C.glassBg, backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: `1px solid ${C.glassBorder}`,
        borderRadius: T.radius.md, padding: "6px 12px",
        fontSize: T.fontSize.xs, color: C.textMuted,
        display: "flex", alignItems: "center", gap: 6,
        zIndex: 100,
      }}>
        <Ic d={I.schedule} size={12} color={C.accent} />
        {activities.length} activities · {projectEndDay} working days
      </div>
    </div>
  );
}
