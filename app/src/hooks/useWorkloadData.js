import { useMemo } from "react";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";

// ── Helpers ───────────────────────────────────────────────────
function isWeekday(date) {
  const d = date.getDay();
  return d !== 0 && d !== 6;
}

function eachDay(start, end) {
  const days = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const endD = new Date(end);
  endD.setHours(0, 0, 0, 0);
  while (d <= endD) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function countWeekdays(start, end) {
  let count = 0;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  while (d <= e) {
    if (isWeekday(d)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/** Walk backward N weekdays from date (exclusive — returns the Nth weekday before) */
function subtractWeekdays(date, n) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  let remaining = n;
  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    if (isWeekday(d)) remaining--;
  }
  return d;
}

/** Get all weekdays between two dates (inclusive) */
function weekdaysBetween(start, end) {
  const days = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  while (d <= e) {
    if (isWeekday(d)) days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

const TEAM_COLORS = [
  "#A78BFA",
  "#60A5FA",
  "#34D399",
  "#FB7185",
  "#FBBF24",
  "#F472B6",
  "#38BDF8",
  "#4ADE80",
  "#FB923C",
  "#C084FC",
];

// ── Main Hook ─────────────────────────────────────────────────
export function useWorkloadData(dateRange) {
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const activeCompanyId = useUiStore(s => s.appSettings?.activeCompanyId) || "__all__";
  const productionHoursPerDay = useUiStore(s => s.appSettings?.productionHoursPerDay) || 7;
  const bufferHours = useUiStore(s => s.appSettings?.bufferHours) || 0;

  return useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Default date range: 2 weeks back, 6 weeks forward
    const rangeStart = dateRange?.start ? new Date(dateRange.start) : addDays(today, -14);
    const rangeEnd = dateRange?.end ? new Date(dateRange.end) : addDays(today, 42);

    // Filter active estimates with scheduling data
    const active = estimatesIndex.filter(e => {
      if (!["Bidding", "Submitted"].includes(e.status)) return false;
      if (activeCompanyId !== "__all__" && e.companyProfileId !== activeCompanyId) return false;
      if (!e.bidDue) return false;
      return true;
    });

    // ── Phase 1: Group raw estimates by estimator ──
    const estimatorMap = new Map(); // name → { color, rawEstimates[] }
    const unassigned = [];

    active.forEach(est => {
      const estimator = est.estimator || "";
      const bidDue = new Date(est.bidDue + "T00:00:00");
      const estHours = Number(est.estimatedHours) || 0;
      const hoursLogged = (est.timerTotalMs || 0) / 3600000;
      const percentComplete = estHours > 0
        ? Math.min(100, Math.round((hoursLogged / estHours) * 100))
        : 0;

      const raw = {
        id: est.id,
        name: est.name || "Untitled",
        client: est.client || "",
        bidDue: est.bidDue,
        bidDueDate: bidDue,
        estimatedHours: estHours,
        status: est.status,
        grandTotal: est.grandTotal || 0,
        timerTotalMs: est.timerTotalMs || 0,
        hoursLogged: Math.round(hoursLogged * 10) / 10,
        percentComplete,
      };

      if (!estimator) {
        // Schedule unassigned estimates too (so they show on Gantt)
        unassigned.push(raw);
        return;
      }

      if (!estimatorMap.has(estimator)) {
        estimatorMap.set(estimator, {
          name: estimator,
          color: TEAM_COLORS[estimatorMap.size % TEAM_COLORS.length],
          rawEstimates: [],
        });
      }
      estimatorMap.get(estimator).rawEstimates.push(raw);
    });

    // ── Phase 2: Backward ALAP scheduling per estimator ──
    const bufferDays = bufferHours > 0 ? Math.ceil(bufferHours / productionHoursPerDay) : 0;
    const warnings = [];

    function scheduleEstimates(rawEstimates) {
      // Sort by bidDue descending — latest due date gets prime slot
      const sorted = [...rawEstimates].sort((a, b) => b.bidDue.localeCompare(a.bidDue));
      let previousBlockStart = null;
      const scheduled = [];

      for (const est of sorted) {
        const daysNeeded = est.estimatedHours > 0
          ? Math.ceil(est.estimatedHours / productionHoursPerDay)
          : 0;

        if (daysNeeded <= 0) {
          // Zero-hour estimate: single point at due date
          scheduled.push({
            ...est,
            scheduledStart: est.bidDue,
            scheduledEnd: est.bidDue,
            workDays: [est.bidDue],
            hoursPerDay: 0,
            daysNeeded: 0,
            conflict: false,
            daysTotal: 0,
            daysRemaining: countWeekdays(today, est.bidDueDate),
            dayProgress: 100,
            scheduleStatus: est.bidDueDate < today ? "overdue" : "on-track",
          });
          continue;
        }

        // Latest possible end for this block
        let latestEnd = new Date(est.bidDueDate);
        if (previousBlockStart) {
          // Must end before the previous block's start (minus buffer)
          const prevStart = new Date(previousBlockStart + "T00:00:00");
          const gapEnd = bufferDays > 0
            ? subtractWeekdays(prevStart, bufferDays)
            : subtractWeekdays(prevStart, 1);
          // But also can't end after its own due date
          if (gapEnd < latestEnd) latestEnd = gapEnd;
        }

        // Schedule backward: block ends at latestEnd, starts daysNeeded-1 weekdays before
        const scheduledStartDate = daysNeeded > 1
          ? subtractWeekdays(latestEnd, daysNeeded - 1)
          : new Date(latestEnd);
        const scheduledEndDate = new Date(latestEnd);

        // Ensure start lands on a weekday
        while (!isWeekday(scheduledStartDate)) {
          scheduledStartDate.setDate(scheduledStartDate.getDate() - 1);
        }

        // Conflict: needs to start before today
        const conflict = scheduledStartDate < today;

        const blockWorkDays = weekdaysBetween(scheduledStartDate, scheduledEndDate);
        const hoursPerDay = blockWorkDays.length > 0
          ? est.estimatedHours / blockWorkDays.length
          : productionHoursPerDay;

        // Schedule status
        const daysRemaining = countWeekdays(today, est.bidDueDate);
        const daysTotal = countWeekdays(scheduledStartDate, est.bidDueDate);
        const dayProgress = daysTotal > 0
          ? Math.round(((daysTotal - daysRemaining) / daysTotal) * 100)
          : 100;

        let scheduleStatus = "on-track";
        if (est.bidDueDate < today) scheduleStatus = "overdue";
        else if (conflict) scheduleStatus = "conflict";
        else if (dayProgress > 0 && est.percentComplete < dayProgress - 20) scheduleStatus = "behind";
        else if (est.percentComplete > dayProgress + 15) scheduleStatus = "ahead";

        const entry = {
          ...est,
          scheduledStart: fmtDate(scheduledStartDate),
          scheduledEnd: fmtDate(scheduledEndDate),
          workDays: blockWorkDays.map(fmtDate),
          hoursPerDay,
          daysNeeded,
          conflict,
          daysTotal,
          daysRemaining,
          dayProgress,
          scheduleStatus,
        };

        scheduled.push(entry);
        previousBlockStart = entry.scheduledStart;
      }

      return scheduled;
    }

    // Schedule each estimator's estimates
    for (const [, row] of estimatorMap) {
      row.estimates = scheduleEstimates(row.rawEstimates);
      delete row.rawEstimates;

      // Generate conflict warnings
      for (const est of row.estimates) {
        if (est.conflict) {
          warnings.push({
            type: "conflict",
            estimator: row.name,
            estimateId: est.id,
            estimateName: est.name,
            scheduledStart: est.scheduledStart,
            bidDue: est.bidDue,
          });
        }
      }
    }

    // Schedule unassigned estimates (no stacking, just backward from due date)
    const scheduledUnassigned = unassigned.map(est => {
      const daysNeeded = est.estimatedHours > 0
        ? Math.ceil(est.estimatedHours / productionHoursPerDay)
        : 0;
      if (daysNeeded <= 0) {
        return {
          ...est,
          scheduledStart: est.bidDue,
          scheduledEnd: est.bidDue,
          workDays: [est.bidDue],
          hoursPerDay: 0,
          daysNeeded: 0,
          conflict: false,
          daysTotal: 0,
          daysRemaining: countWeekdays(today, est.bidDueDate),
          dayProgress: 100,
          scheduleStatus: est.bidDueDate < today ? "overdue" : "on-track",
        };
      }
      const scheduledStartDate = daysNeeded > 1
        ? subtractWeekdays(est.bidDueDate, daysNeeded - 1)
        : new Date(est.bidDueDate);
      const blockWorkDays = weekdaysBetween(scheduledStartDate, est.bidDueDate);
      const daysRemaining = countWeekdays(today, est.bidDueDate);
      const daysTotal = countWeekdays(scheduledStartDate, est.bidDueDate);
      const dayProgress = daysTotal > 0
        ? Math.round(((daysTotal - daysRemaining) / daysTotal) * 100)
        : 100;
      let scheduleStatus = "on-track";
      if (est.bidDueDate < today) scheduleStatus = "overdue";
      else if (scheduledStartDate < today) scheduleStatus = "conflict";
      else if (dayProgress > 0 && est.percentComplete < dayProgress - 20) scheduleStatus = "behind";
      else if (est.percentComplete > dayProgress + 15) scheduleStatus = "ahead";

      return {
        ...est,
        scheduledStart: fmtDate(scheduledStartDate),
        scheduledEnd: fmtDate(est.bidDueDate),
        workDays: blockWorkDays.map(fmtDate),
        hoursPerDay: blockWorkDays.length > 0 ? est.estimatedHours / blockWorkDays.length : productionHoursPerDay,
        daysNeeded,
        conflict: scheduledStartDate < today,
        daysTotal,
        daysRemaining,
        dayProgress,
        scheduleStatus,
      };
    });

    const estimatorRows = Array.from(estimatorMap.values());

    // ── Build daily load map ──
    const dailyLoad = new Map();
    const teamDailyLoad = new Map();

    const rangeDays = eachDay(rangeStart, rangeEnd).filter(isWeekday);
    for (const day of rangeDays) {
      const key = fmtDate(day);
      dailyLoad.set(key, new Map());
      teamDailyLoad.set(key, { totalHours: 0, avgUtilization: 0 });
    }

    // Distribute hours from scheduled blocks
    for (const row of estimatorRows) {
      for (const est of row.estimates) {
        for (const dayStr of est.workDays) {
          if (!dailyLoad.has(dayStr)) continue;
          const dayMap = dailyLoad.get(dayStr);
          if (!dayMap.has(row.name)) {
            dayMap.set(row.name, { totalHours: 0, estimates: [], utilization: 0 });
          }
          const cell = dayMap.get(row.name);
          cell.totalHours += est.hoursPerDay;
          cell.estimates.push({ id: est.id, name: est.name, hours: est.hoursPerDay });
          cell.utilization = cell.totalHours / productionHoursPerDay;

          const team = teamDailyLoad.get(dayStr);
          if (team) team.totalHours += est.hoursPerDay;
        }
      }
    }

    // Compute team avg utilization
    for (const [, team] of teamDailyLoad) {
      if (estimatorRows.length > 0) {
        team.avgUtilization = team.totalHours / (estimatorRows.length * productionHoursPerDay);
      }
    }

    // ── Warnings: overloaded ──
    for (const [dayStr, dayMap] of dailyLoad) {
      for (const [estName, cell] of dayMap) {
        if (cell.utilization > 1.0) {
          warnings.push({
            type: "overloaded",
            estimator: estName,
            date: dayStr,
            hours: Math.round(cell.totalHours * 10) / 10,
          });
        }
      }
    }

    // ── Warnings: bid clustering ──
    const bidsByWeek = new Map();
    for (const est of active) {
      const due = new Date(est.bidDue + "T00:00:00");
      const day = due.getDay();
      const monday = new Date(due);
      monday.setDate(due.getDate() - ((day + 6) % 7));
      const weekKey = fmtDate(monday);
      if (!bidsByWeek.has(weekKey)) bidsByWeek.set(weekKey, []);
      bidsByWeek.get(weekKey).push(est);
    }
    for (const [weekKey, bids] of bidsByWeek) {
      if (bids.length >= 3) {
        warnings.push({
          type: "bid_cluster",
          date: weekKey,
          count: bids.length,
          bids: bids.map(b => ({ id: b.id, name: b.name, bidDue: b.bidDue })),
        });
      }
    }

    // Flat list for card-based views
    const allEstimates = [
      ...estimatorRows.flatMap(r => r.estimates.map(e => ({ ...e, estimator: r.name, estimatorColor: r.color }))),
      ...scheduledUnassigned.map(e => ({ ...e, estimator: "", estimatorColor: "#8E8E93" })),
    ];

    return {
      estimatorRows,
      dailyLoad,
      teamDailyLoad,
      unassignedEstimates: scheduledUnassigned,
      allEstimates,
      warnings,
      rangeDays: rangeDays.map(fmtDate),
      rangeStart: fmtDate(rangeStart),
      rangeEnd: fmtDate(rangeEnd),
      CAPACITY_HOURS: productionHoursPerDay,
    };
  }, [estimatesIndex, activeCompanyId, dateRange?.start, dateRange?.end, productionHoursPerDay, bufferHours]);
}
