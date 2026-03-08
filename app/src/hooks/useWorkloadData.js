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

const CAPACITY_HOURS = 8;

// ── Main Hook ─────────────────────────────────────────────────
export function useWorkloadData(dateRange) {
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const activeCompanyId = useUiStore(s => s.appSettings?.activeCompanyId) || "__all__";

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
      if (!e.bidDue) return false; // Need at least a due date
      return true;
    });

    // Build estimator map
    const estimatorMap = new Map(); // name → { color, estimates[] }
    const unassigned = [];

    active.forEach(est => {
      const estimator = est.estimator || "";
      const startDate = est.startDate ? new Date(est.startDate + "T00:00:00") : today; // Default start = today
      const bidDue = new Date(est.bidDue + "T00:00:00");
      const estHours = Number(est.estimatedHours) || 0;

      // Calculate working days
      const allDays = eachDay(startDate, bidDue);
      const workDays = allDays.filter(isWeekday);
      const hoursPerDay = workDays.length > 0 && estHours > 0 ? estHours / workDays.length : 0;

      // ── Progress & schedule status ──
      const hoursLogged = (est.timerTotalMs || 0) / 3600000;
      const percentComplete = estHours > 0
        ? Math.min(100, Math.round((hoursLogged / estHours) * 100))
        : 0;
      const daysTotal = countWeekdays(startDate, bidDue);
      const daysRemaining = countWeekdays(today, bidDue);
      const dayProgress = daysTotal > 0
        ? Math.round(((daysTotal - daysRemaining) / daysTotal) * 100)
        : 100;
      // Derive schedule health
      let scheduleStatus = "on-track";
      if (bidDue < today) {
        scheduleStatus = "overdue";
      } else if (dayProgress > 0 && percentComplete < dayProgress - 20) {
        scheduleStatus = "behind";
      } else if (percentComplete > dayProgress + 15) {
        scheduleStatus = "ahead";
      }

      const estEntry = {
        id: est.id,
        name: est.name || "Untitled",
        client: est.client || "",
        startDate: fmtDate(startDate),
        bidDue: est.bidDue,
        estimatedHours: estHours,
        hoursPerDay,
        status: est.status,
        grandTotal: est.grandTotal || 0,
        timerTotalMs: est.timerTotalMs || 0,
        workDays: workDays.map(fmtDate),
        // New progress fields
        hoursLogged: Math.round(hoursLogged * 10) / 10,
        percentComplete,
        daysTotal,
        daysRemaining,
        dayProgress,
        scheduleStatus,
      };

      if (!estimator) {
        unassigned.push(estEntry);
        return;
      }

      if (!estimatorMap.has(estimator)) {
        estimatorMap.set(estimator, {
          name: estimator,
          color: TEAM_COLORS[estimatorMap.size % TEAM_COLORS.length],
          estimates: [],
        });
      }
      estimatorMap.get(estimator).estimates.push(estEntry);
    });

    const estimatorRows = Array.from(estimatorMap.values());

    // Build daily load map: date → estimator → { totalHours, estimates[], utilization }
    const dailyLoad = new Map();
    const teamDailyLoad = new Map();
    const warnings = [];

    // Initialize days in range
    const rangeDays = eachDay(rangeStart, rangeEnd).filter(isWeekday);
    for (const day of rangeDays) {
      const key = fmtDate(day);
      dailyLoad.set(key, new Map());
      teamDailyLoad.set(key, { totalHours: 0, avgUtilization: 0 });
    }

    // Distribute hours
    for (const row of estimatorRows) {
      for (const est of row.estimates) {
        for (const dayStr of est.workDays) {
          if (!dailyLoad.has(dayStr)) continue; // Outside range
          const dayMap = dailyLoad.get(dayStr);
          if (!dayMap.has(row.name)) {
            dayMap.set(row.name, { totalHours: 0, estimates: [], utilization: 0 });
          }
          const cell = dayMap.get(row.name);
          cell.totalHours += est.hoursPerDay;
          cell.estimates.push({ id: est.id, name: est.name, hours: est.hoursPerDay });
          cell.utilization = cell.totalHours / CAPACITY_HOURS;

          // Update team total
          const team = teamDailyLoad.get(dayStr);
          if (team) team.totalHours += est.hoursPerDay;
        }
      }
    }

    // Compute team avg utilization
    for (const [dayStr, team] of teamDailyLoad) {
      if (estimatorRows.length > 0) {
        team.avgUtilization = team.totalHours / (estimatorRows.length * CAPACITY_HOURS);
      }
    }

    // Generate warnings
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

    // Bid clustering: check for weeks with 3+ bids due
    const bidsByWeek = new Map();
    for (const est of active) {
      const due = new Date(est.bidDue + "T00:00:00");
      // Get Monday of that week
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

    return {
      estimatorRows,
      dailyLoad,
      teamDailyLoad,
      unassignedEstimates: unassigned,
      warnings,
      rangeDays: rangeDays.map(fmtDate),
      rangeStart: fmtDate(rangeStart),
      rangeEnd: fmtDate(rangeEnd),
      CAPACITY_HOURS,
    };
  }, [estimatesIndex, activeCompanyId, dateRange?.start, dateRange?.end]);
}
