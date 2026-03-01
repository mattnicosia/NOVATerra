import { useMemo } from 'react';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useCalendarStore } from '@/stores/calendarStore';

/**
 * Aggregates estimate dates + user tasks into a unified event map for a given month.
 * Returns { events: [], eventsByDate: Map<'YYYY-MM-DD', event[]> }
 */
export function useCalendarEvents(year, month) {
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const tasks = useCalendarStore(s => s.tasks);

  return useMemo(() => {
    const events = [];

    // ── Estimate date fields ──────────────────────────────
    for (const est of estimatesIndex) {
      if (est.bidDue) {
        events.push({
          date: est.bidDue, type: 'bidDue', label: `Bid Due: ${est.name}`,
          estimateId: est.id, colorKey: 'accent',
        });
      }
      if (est.walkthroughDate) {
        events.push({
          date: est.walkthroughDate, type: 'walkthrough', label: `Walkthrough: ${est.name}`,
          estimateId: est.id, colorKey: 'orange',
        });
      }
      if (est.rfiDueDate) {
        events.push({
          date: est.rfiDueDate, type: 'rfiDue', label: `RFI Due: ${est.name}`,
          estimateId: est.id, colorKey: 'red',
        });
      }
      if (est.otherDueDate) {
        const lbl = est.otherDueLabel || 'Other';
        events.push({
          date: est.otherDueDate, type: 'other', label: `${lbl}: ${est.name}`,
          estimateId: est.id, colorKey: 'purple',
        });
      }
    }

    // ── User tasks ────────────────────────────────────────
    for (const t of tasks) {
      events.push({
        date: t.date, type: 'task', label: t.title, taskId: t.id,
        colorKey: 'green', completed: t.completed, time: t.time,
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
  }, [estimatesIndex, tasks]);
}
