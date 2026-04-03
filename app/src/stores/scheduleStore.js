// DEPRECATED — consolidated into taskStore. Use useTaskStore directly.
// This shim maps old property names to new sched-prefixed names.
import { useTaskStore } from "./taskStore";

const mapState = s => ({
  activities: s.schedActivities,
  projectStartDate: s.schedProjectStartDate,
  workDaysPerWeek: s.schedWorkDaysPerWeek,
  tradeOverrides: s.schedTradeOverrides,
  zones: s.schedZones,
  viewMode: s.schedViewMode,
  selectedActivityId: s.schedSelectedActivityId,
  generated: s.schedGenerated,
  generating: s.schedGenerating,
  setActivities: s.setSchedActivities,
  setProjectStartDate: s.setSchedProjectStartDate,
  setWorkDaysPerWeek: s.setSchedWorkDaysPerWeek,
  setViewMode: s.setSchedViewMode,
  setSelectedActivityId: s.setSchedSelectedActivityId,
  setZones: s.setSchedZones,
  setGenerating: s.setSchedGenerating,
  setTradeOverride: s.setSchedTradeOverride,
  clearTradeOverride: s.clearSchedTradeOverride,
  addZone: s.addSchedZone,
  removeZone: s.removeSchedZone,
  renameZone: s.renameSchedZone,
  getSelectedActivity: s.getSchedSelectedActivity,
  getProjectEndDay: s.getSchedProjectEndDay,
  getCriticalPathLength: s.getSchedCriticalPathLength,
  reset: s.resetSchedule,
});

export const useScheduleStore = selector => {
  return useTaskStore(s => {
    const mapped = mapState(s);
    return selector ? selector(mapped) : mapped;
  });
};

// Support .getState() calls
useScheduleStore.getState = () => mapState(useTaskStore.getState());
