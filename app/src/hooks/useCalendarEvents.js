import { useMemo } from "react";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useCalendarStore } from "@/stores/calendarStore";
import { useUiStore } from "@/stores/uiStore";

/**
 * Aggregates estimate dates + user tasks into a unified event map for a given month.
 * Filters estimates by active company profile (same logic as useDashboardData).
 * Returns { events: [], eventsByDate: Map<'YYYY-MM-DD', event[]> }
 */
export function useCalendarEvents(_year, _month) {
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const tasks = useCalendarStore(s => s.tasks);
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

    // ── User tasks ────────────────────────────────────────
    for (const t of tasks) {
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

    // Build date→events map for O(1) cell lookup
    const eventsByDate = new Map();
    for (const ev of events) {
      if (!ev.date) continue;
      const key = ev.date; // YYYY-MM-DD
      if (!eventsByDate.has(key)) eventsByDate.set(key, []);
      eventsByDate.get(key).push(ev);
    }

    return { events, eventsByDate };
  }, [estimatesIndex, tasks, activeCompanyId]);
}
