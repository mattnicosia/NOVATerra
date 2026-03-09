import { create } from "zustand";
import { uid, today } from "@/utils/format";

const now = new Date();

export const useCalendarStore = create((set, get) => ({
  // User-created tasks
  tasks: [],

  // UI state
  selectedDate: today(),
  viewMonth: { year: now.getFullYear(), month: now.getMonth() },
  calendarView: "month", // 'month' | 'week' | 'day'

  // ── Actions ──────────────────────────────────────────────

  addTask: task => {
    const t = {
      id: uid(),
      title: task.title || "",
      date: task.date || today(),
      time: task.time || "",
      description: task.description || "",
      color: task.color || "",
      estimateId: task.estimateId || null,
      correspondenceId: task.correspondenceId || null,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    set({ tasks: [...get().tasks, t] });
    return t;
  },

  updateTask: (id, updates) => {
    set({ tasks: get().tasks.map(t => (t.id === id ? { ...t, ...updates } : t)) });
  },

  deleteTask: id => {
    set({ tasks: get().tasks.filter(t => t.id !== id) });
  },

  toggleComplete: id => {
    set({ tasks: get().tasks.map(t => (t.id === id ? { ...t, completed: !t.completed } : t)) });
  },

  setSelectedDate: date => set({ selectedDate: date }),

  setViewMonth: (year, month) => set({ viewMonth: { year, month } }),

  setCalendarView: view => set({ calendarView: view }),

  // Bulk set (for persistence restore / cloud sync)
  setTasks: tasks => set({ tasks: Array.isArray(tasks) ? tasks : [] }),
}));
