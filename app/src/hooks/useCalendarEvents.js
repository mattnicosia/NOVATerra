import { useMemo } from "react";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useCalendarStore } from "@/stores/calendarStore";
import { useTaskStore, TASK_TYPES } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";

/**
 * Aggregates estimate dates + user tasks + taskStore tasks into a unified event map.
 * Filters estimates by active company profile (same logic as useDashboardData).
 * Returns { events: [], eventsByDate: Map<'YYYY-MM-DD', event[]> }
 */
export function useCalendarEvents(_year, _month) {
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const calendarTasks = useCalendarStore(s => s.tasks);
  const richTasks = useTaskStore(s => s.tasks);
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);

  return useMemo(() => {
    const events = [];

    // Filter estimates by company profile
    const filtered =
      activeCompanyId === "__all__"
        ? estimatesIndex
        : estimatesIndex.filter(e => (e.companyProfileId || "") === (activeCompanyId || ""));

    // ── Estimate date fields ──────────────────────────────
    for (const est of filtered) {
      if (est.bidDue) {
        events.push({
          date: est.bidDue,
          type: "bidDue",
          label: `Bid Due: ${est.name}`,
          estimateId: est.id,
          colorKey: "accent",
        });
      }
      if (est.walkthroughDate) {
        events.push({
          date: est.walkthroughDate,
          type: "walkthrough",
          label: `Walkthrough: ${est.name}`,
          estimateId: est.id,
          colorKey: "orange",
        });
      }
      if (est.rfiDueDate) {
        events.push({
          date: est.rfiDueDate,
          type: "rfiDue",
          label: `RFI Due: ${est.name}`,
          estimateId: est.id,
          colorKey: "red",
        });
      }
      if (est.otherDueDate) {
        const lbl = est.otherDueLabel || "Other";
        events.push({
          date: est.otherDueDate,
          type: "other",
          label: `${lbl}: ${est.name}`,
          estimateId: est.id,
          colorKey: "purple",
        });
      }
    }

    // ── Calendar store tasks (legacy) ─────────────────────
    for (const t of calendarTasks) {
      events.push({
        date: t.date,
        type: "task",
        label: t.title,
        taskId: t.id,
        colorKey: "green",
        completed: t.completed,
        time: t.time,
        description: t.description,
      });
    }

    // ── Rich tasks from taskStore (with due dates) ────────
    for (const t of richTasks) {
      if (!t.dueDate) continue;
      const typeInfo = TASK_TYPES[t.type];
      // Map task type to calendar color
      const colorMap = {
        "bid-prep": "red",
        deadline: "red",
        rfi: "purple",
        "scope-gap": "orange",
        review: "green",
        "follow-up": "purple",
        procurement: "accent",
        action: "accent",
      };
      events.push({
        date: t.dueDate,
        type: "task",
        label: `${typeInfo?.icon || "⚡"} ${t.title}`,
        taskId: t.id,
        richTask: true,
        colorKey: colorMap[t.type] || "accent",
        completed: t.status === "done",
        time: t.dueTime || "",
        description: t.description,
        priority: t.priority,
        taskType: t.type,
      });
    }

    // Build date→events map for O(1) cell lookup
    const eventsByDate = new Map();
    for (const ev of events) {
      if (!ev.date) continue;
      const key = ev.date; // YYYY-MM-DD
      if (!eventsByDate.has(key)) eventsByDate.set(key, []);
      eventsByDate.get(key).push(ev);
    }

    return { events, eventsByDate };
  }, [estimatesIndex, calendarTasks, richTasks, activeCompanyId]);
}
