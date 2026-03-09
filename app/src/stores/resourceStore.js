import { create } from "zustand";

const now = new Date();
const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

export const useResourceStore = create(set => ({
  // Calendar view mode — week is the "power view" (default)
  calendarView: "week", // "month" | "week" | "day"

  // Navigation state
  selectedDate: todayStr, // 'YYYY-MM-DD'
  viewMonth: { year: now.getFullYear(), month: now.getMonth() },

  // Filters
  selectedEstimators: [], // empty = show all
  showCompleted: false, // include Won/Lost/Cancelled estimates

  // Sidebar
  sidebarCollapsed: false,

  // Drag-and-drop state (unified: horizontal = reschedule, vertical = reassign)
  dragEstimateId: null,
  dragOverEstimator: null, // estimator name being hovered (or "__unassigned__")
  dragMode: null,          // "reschedule" | "reassign" | null
  dragDaysDelta: 0,        // Day offset for horizontal reschedule
  dragOriginalBidDue: "",  // Original bidDue for the bar being dragged

  // Workload view mode
  sortMode: "timeline", // "timeline" | "hours" | "due-date" | "weekly"

  // Weekly planning view
  weeklyViewWeekOffset: 0, // 0 = this week, -1 = last, +1 = next

  // Actions
  setCalendarView: v => set({ calendarView: v }),
  setSelectedDate: v => set({ selectedDate: v }),
  setViewMonth: (year, month) => set({ viewMonth: { year, month } }),
  setSelectedEstimators: v => set({ selectedEstimators: v }),
  setShowCompleted: v => set({ showCompleted: v }),
  setSidebarCollapsed: v => set({ sidebarCollapsed: v }),
  setDragEstimateId: v => set({ dragEstimateId: v }),
  setDragOverEstimator: v => set({ dragOverEstimator: v }),
  setDragMode: v => set({ dragMode: v }),
  setDragDaysDelta: v => set({ dragDaysDelta: v }),
  setDragOriginalBidDue: v => set({ dragOriginalBidDue: v }),
  setSortMode: v => set({ sortMode: v }),
  setWeeklyViewWeekOffset: v => set({ weeklyViewWeekOffset: v }),
  clearDragState: () => set({ dragEstimateId: null, dragOverEstimator: null, dragMode: null, dragDaysDelta: 0, dragOriginalBidDue: "" }),
}));
