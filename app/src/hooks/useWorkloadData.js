import { useMemo } from "react";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import { useMasterDataStore } from "@/stores/masterDataStore";

// ── Helpers ───────────────────────────────────────────────────
function isWeekday(date, workWeek = "mon-fri") {
  const d = date.getDay();
  if (workWeek === "mon-sat") return d !== 0; // Sunday off only
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

function countWeekdays(start, end, workWeek) {
  let count = 0;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  while (d <= e) {
    if (isWeekday(d, workWeek)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/** Walk backward N weekdays from date (exclusive — returns the Nth weekday before) */
function subtractWeekdays(date, n, workWeek) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  let remaining = n;
  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    if (isWeekday(d, workWeek)) remaining--;
  }
  return d;
}

/** Walk forward N weekdays from date */
export function addWeekdays(date, n, workWeek) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  let remaining = Math.abs(n);
  const direction = n >= 0 ? 1 : -1;
  while (remaining > 0) {
    d.setDate(d.getDate() + direction);
    if (isWeekday(d, workWeek)) remaining--;
  }
  return d;
}

/** Get all weekdays between two dates (inclusive) */
function weekdaysBetween(start, end, workWeek) {
  const days = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  while (d <= e) {
    if (isWeekday(d, workWeek)) days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// Module-level defaults — prevents new object reference on every render from busting useMemo
const DEFAULT_COMPLEXITY = { light: 0.8, normal: 1.0, heavy: 1.3 };
const DEFAULT_ESTIMATORS = [];

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
  const overheadPercent = useUiStore(s => s.appSettings?.overheadPercent) ?? 15;
  const behindThreshold = useUiStore(s => s.appSettings?.behindThreshold) ?? 20;
  const aheadThreshold = useUiStore(s => s.appSettings?.aheadThreshold) ?? 15;
  const useAccuracyAdjustment = useUiStore(s => s.appSettings?.useAccuracyAdjustment) || false;
  const complexityMultipliers = useUiStore(s => s.appSettings?.complexityMultipliers) || DEFAULT_COMPLEXITY;
  const workWeek = useUiStore(s => s.appSettings?.workWeek) || "mon-fri";
  const estimators = useMasterDataStore(s => s.masterData?.estimators) || DEFAULT_ESTIMATORS;

  return useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Effective capacity = production hours minus overhead (admin, meetings, etc.)
    const effectiveHoursPerDay = productionHoursPerDay * (1 - overheadPercent / 100);

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
      const estHours = (Number(est.estimatedHours) || 0) + (Number(est.correspondenceTotalHours) || 0);
      const hoursLogged = (est.timerTotalMs || 0) / 3600000;
      const percentComplete = estHours > 0 ? Math.min(100, Math.round((hoursLogged / estHours) * 100)) : 0;

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
        complexity: est.complexity || "normal",
        primaryDiscipline: est.primaryDiscipline || "",
        correspondenceCount: est.correspondenceCount || 0,
        correspondencePendingCount: est.correspondencePendingCount || 0,
        correspondenceNextDue: est.correspondenceNextDue || "",
        correspondenceTotalHours: est.correspondenceTotalHours || 0,
        emailCount: est.emailCount || 0,
        lastEmailAt: est.lastEmailAt || "",
        schedulePauses: est.schedulePauses || [],
      };

      if (!estimator) {
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

    // ── Accuracy adjustment map (opt-in) ──
    const accuracyFactors = new Map(); // estimatorName → ratio
    if (useAccuracyAdjustment) {
      const completed = estimatesIndex.filter(e => e.timerTotalMs > 0 && e.estimatedHours > 0 && e.estimator);
      const byEstimator = new Map();
      for (const e of completed) {
        if (!byEstimator.has(e.estimator)) byEstimator.set(e.estimator, []);
        byEstimator.get(e.estimator).push(e.timerTotalMs / 3600000 / e.estimatedHours);
      }
      for (const [name, ratios] of byEstimator) {
        if (ratios.length >= 3) {
          // need 3+ data points
          accuracyFactors.set(name, ratios.reduce((s, r) => s + r, 0) / ratios.length);
        }
      }
    }

    // ── Phase 2: Backward ALAP scheduling per estimator ──
    const bufferDays = bufferHours > 0 ? Math.ceil(bufferHours / effectiveHoursPerDay) : 0;
    const warnings = [];

    function scheduleEstimates(rawEstimates, estimatorName) {
      // Sort by bidDue descending — latest due date gets prime slot
      const sorted = [...rawEstimates].sort((a, b) => b.bidDue.localeCompare(a.bidDue));
      let previousBlockStart = null;
      const scheduled = [];
      const accFactor = accuracyFactors.get(estimatorName) || 1.0;

      for (const est of sorted) {
        const complexityMult = complexityMultipliers[est.complexity] || 1.0;
        const adjustedHours = est.estimatedHours * accFactor * complexityMult;
        const daysNeeded = adjustedHours > 0 ? Math.ceil(adjustedHours / effectiveHoursPerDay) : 0;

        if (daysNeeded <= 0) {
          scheduled.push({
            ...est,
            scheduledStart: est.bidDue,
            scheduledEnd: est.bidDue,
            workDays: [est.bidDue],
            hoursPerDay: 0,
            daysNeeded: 0,
            conflict: false,
            daysTotal: 0,
            daysRemaining: countWeekdays(today, est.bidDueDate, workWeek),
            dayProgress: 100,
            scheduleStatus: est.bidDueDate < today ? "overdue" : "on-track",
          });
          continue;
        }

        // Latest possible end for this block
        let latestEnd = new Date(est.bidDueDate);
        if (previousBlockStart) {
          const prevStart = new Date(previousBlockStart + "T00:00:00");
          const gapEnd =
            bufferDays > 0
              ? subtractWeekdays(prevStart, bufferDays, workWeek)
              : subtractWeekdays(prevStart, 1, workWeek);
          if (gapEnd < latestEnd) latestEnd = gapEnd;
        }

        // Schedule backward
        const scheduledStartDate =
          daysNeeded > 1 ? subtractWeekdays(latestEnd, daysNeeded - 1, workWeek) : new Date(latestEnd);
        const scheduledEndDate = new Date(latestEnd);

        while (!isWeekday(scheduledStartDate, workWeek)) {
          scheduledStartDate.setDate(scheduledStartDate.getDate() - 1);
        }

        const conflict = scheduledStartDate < today;

        let blockWorkDays = weekdaysBetween(scheduledStartDate, scheduledEndDate, workWeek);

        // Filter out paused days and extend start if needed
        const pauses = est.schedulePauses || [];
        if (pauses.length > 0) {
          const pausedSet = new Set();
          for (const p of pauses) {
            const pDays = weekdaysBetween(new Date(p.start + "T00:00:00"), new Date(p.end + "T00:00:00"), workWeek);
            for (const pd of pDays) pausedSet.add(fmtDate(pd));
          }
          const activeDays = blockWorkDays.filter(d => !pausedSet.has(fmtDate(d)));
          const deficit = daysNeeded - activeDays.length;
          if (deficit > 0) {
            // Extend start earlier to compensate for paused days
            const newStart = subtractWeekdays(scheduledStartDate, deficit, workWeek);
            scheduledStartDate.setTime(newStart.getTime());
            blockWorkDays = weekdaysBetween(scheduledStartDate, scheduledEndDate, workWeek).filter(
              d => !pausedSet.has(fmtDate(d)),
            );
          } else {
            blockWorkDays = activeDays;
          }
        }

        const hoursPerDay = blockWorkDays.length > 0 ? est.estimatedHours / blockWorkDays.length : effectiveHoursPerDay;

        const daysRemaining = countWeekdays(today, est.bidDueDate, workWeek);
        const daysTotal = countWeekdays(scheduledStartDate, est.bidDueDate, workWeek);
        const dayProgress = daysTotal > 0 ? Math.round(((daysTotal - daysRemaining) / daysTotal) * 100) : 100;

        let scheduleStatus = "on-track";
        if (est.bidDueDate < today) scheduleStatus = "overdue";
        else if (conflict) scheduleStatus = "conflict";
        else if (dayProgress > 0 && est.percentComplete < dayProgress - behindThreshold) scheduleStatus = "behind";
        else if (est.percentComplete > dayProgress + aheadThreshold) scheduleStatus = "ahead";

        // Build segments (contiguous groups of work days, split by gaps/pauses)
        const workDayStrs = blockWorkDays.map(fmtDate);
        const segments = [];
        if (workDayStrs.length > 0) {
          let segStart = workDayStrs[0];
          let segEnd = workDayStrs[0];
          for (let wi = 1; wi < workDayStrs.length; wi++) {
            const prev = new Date(segEnd + "T00:00:00");
            const curr = new Date(workDayStrs[wi] + "T00:00:00");
            // Gap > 1 calendar day between consecutive work days means a break
            const gap = (curr - prev) / 86400000;
            const expectedGap = workWeek === "mon-sat" ? 2 : prev.getDay() === 5 ? 3 : prev.getDay() === 6 ? 2 : 1;
            if (gap > expectedGap) {
              segments.push({ start: segStart, end: segEnd });
              segStart = workDayStrs[wi];
            }
            segEnd = workDayStrs[wi];
          }
          segments.push({ start: segStart, end: segEnd });
        }

        const entry = {
          ...est,
          scheduledStart: fmtDate(scheduledStartDate),
          scheduledEnd: fmtDate(scheduledEndDate),
          workDays: workDayStrs,
          hoursPerDay,
          daysNeeded,
          conflict,
          daysTotal,
          daysRemaining,
          dayProgress,
          scheduleStatus,
          segments: segments.length > 1 ? segments : null, // null = single bar (no splits)
        };

        scheduled.push(entry);
        previousBlockStart = entry.scheduledStart;
      }

      return scheduled;
    }

    // Schedule each estimator's estimates
    for (const [, row] of estimatorMap) {
      row.estimates = scheduleEstimates(row.rawEstimates, row.name);
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
            suggestions: [], // populated after dailyLoad is built
          });
        }
      }
    }

    // Schedule unassigned estimates (no stacking)
    const scheduledUnassigned = unassigned.map(est => {
      const daysNeeded = est.estimatedHours > 0 ? Math.ceil(est.estimatedHours / effectiveHoursPerDay) : 0;
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
      const scheduledStartDate =
        daysNeeded > 1 ? subtractWeekdays(est.bidDueDate, daysNeeded - 1) : new Date(est.bidDueDate);
      const blockWorkDays = weekdaysBetween(scheduledStartDate, est.bidDueDate);
      const daysRemaining = countWeekdays(today, est.bidDueDate);
      const daysTotal = countWeekdays(scheduledStartDate, est.bidDueDate);
      const dayProgress = daysTotal > 0 ? Math.round(((daysTotal - daysRemaining) / daysTotal) * 100) : 100;
      let scheduleStatus = "on-track";
      if (est.bidDueDate < today) scheduleStatus = "overdue";
      else if (scheduledStartDate < today) scheduleStatus = "conflict";
      else if (dayProgress > 0 && est.percentComplete < dayProgress - behindThreshold) scheduleStatus = "behind";
      else if (est.percentComplete > dayProgress + aheadThreshold) scheduleStatus = "ahead";

      return {
        ...est,
        scheduledStart: fmtDate(scheduledStartDate),
        scheduledEnd: fmtDate(est.bidDueDate),
        workDays: blockWorkDays.map(fmtDate),
        hoursPerDay: blockWorkDays.length > 0 ? est.estimatedHours / blockWorkDays.length : effectiveHoursPerDay,
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

    const rangeDays = eachDay(rangeStart, rangeEnd).filter(d => isWeekday(d, workWeek));
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
          cell.utilization = cell.totalHours / effectiveHoursPerDay;

          const team = teamDailyLoad.get(dayStr);
          if (team) team.totalHours += est.hoursPerDay;
        }
      }
    }

    // Compute team avg utilization
    for (const [, team] of teamDailyLoad) {
      if (estimatorRows.length > 0) {
        team.avgUtilization = team.totalHours / (estimatorRows.length * effectiveHoursPerDay);
      }
    }

    // ── Estimator capacity map (remaining hours per day) ──
    const estimatorCapacity = new Map();
    for (const row of estimatorRows) {
      const cap = [];
      for (const dayStr of rangeDays.map(fmtDate)) {
        const load = dailyLoad.get(dayStr)?.get(row.name);
        const used = load?.totalHours || 0;
        cap.push({ date: dayStr, remainingHours: Math.max(0, effectiveHoursPerDay - used), used });
      }
      estimatorCapacity.set(row.name, cap);
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

    // ── Warnings: predictive overload (next 10 weekdays) ──
    const futureDays = [];
    {
      const d = new Date(today);
      let count = 0;
      while (count < 10) {
        d.setDate(d.getDate() + 1);
        if (isWeekday(d, workWeek)) {
          futureDays.push(fmtDate(new Date(d)));
          count++;
        }
      }
    }
    const predictedSet = new Set(); // prevent duplicate warnings per estimator-day
    for (const dayStr of futureDays) {
      const dayMap = dailyLoad.get(dayStr);
      if (!dayMap) continue;
      for (const [estName, cell] of dayMap) {
        if (cell.utilization > 0.9) {
          const key = `${estName}:${dayStr}`;
          if (predictedSet.has(key)) continue;
          // Don't duplicate if already an overloaded warning for today
          if (dayStr === fmtDate(today)) continue;
          predictedSet.add(key);
          const dayDate = new Date(dayStr + "T00:00:00");
          warnings.push({
            type: "predicted_overload",
            estimator: estName,
            date: dayStr,
            hours: Math.round(cell.totalHours * 10) / 10,
            utilization: Math.round(cell.utilization * 100),
            daysFromNow: countWeekdays(today, dayDate),
          });
        }
      }
    }

    // ── Build estimator specialties map ──
    const specialtiesMap = new Map();
    for (const e of estimators) {
      if (e.name && e.specialties) specialtiesMap.set(e.name, e.specialties);
    }

    // ── Conflict resolution suggestions ──
    for (const w of warnings) {
      if (w.type !== "conflict") continue;
      const suggestions = [];
      const estDiscipline = w.primaryDiscipline || "";

      // Find estimators with capacity around the conflict window
      for (const row of estimatorRows) {
        if (row.name === w.estimator) continue;
        // Check average utilization over next 5 weekdays
        const cap = estimatorCapacity.get(row.name);
        if (!cap) continue;
        const next5 = cap.filter(c => {
          const d = new Date(c.date + "T00:00:00");
          return d >= today && countWeekdays(today, d) <= 5;
        });
        const avgRemaining = next5.length > 0 ? next5.reduce((s, c) => s + c.remainingHours, 0) / next5.length : 0;
        if (avgRemaining > effectiveHoursPerDay * 0.3) {
          const specs = specialtiesMap.get(row.name) || [];
          const skillMatch = estDiscipline && specs.includes(estDiscipline);
          suggestions.push({
            action: "reassign",
            target: row.name,
            targetColor: row.color,
            label: skillMatch ? `Reassign to ${row.name} (skill match)` : `Reassign to ${row.name}`,
            capacity: Math.round(avgRemaining * 10) / 10,
            skillMatch,
          });
        }
      }
      // Sort skill matches first
      suggestions.sort((a, b) => (b.skillMatch ? 1 : 0) - (a.skillMatch ? 1 : 0));

      // Extend due date suggestion
      const startDate = new Date(w.scheduledStart + "T00:00:00");
      if (startDate < today) {
        const daysShort = countWeekdays(startDate, today);
        const newDue = addWeekdays(new Date(w.bidDue + "T00:00:00"), daysShort);
        suggestions.push({
          action: "extend",
          daysNeeded: daysShort,
          newBidDue: fmtDate(newDue),
          label: `Extend due date by ${daysShort} day${daysShort !== 1 ? "s" : ""}`,
        });
      }

      w.suggestions = suggestions.slice(0, 3);
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

    // ── Load imbalance warnings ──
    if (estimatorRows.length > 1) {
      for (const [dayStr, dayMap] of dailyLoad) {
        const d = new Date(dayStr + "T00:00:00");
        if (d < today || countWeekdays(today, d) > 5) continue;
        let overloaded = null;
        let underloaded = null;
        for (const row of estimatorRows) {
          const load = dayMap.get(row.name);
          const util = load ? load.totalHours / effectiveHoursPerDay : 0;
          if (util > 1.0 && (!overloaded || util > overloaded.util)) {
            overloaded = { name: row.name, util };
          }
          if (util < 0.5 && (!underloaded || util < underloaded.util)) {
            underloaded = { name: row.name, util };
          }
        }
        if (overloaded && underloaded) {
          warnings.push({
            type: "load_imbalance",
            date: dayStr,
            overloaded: { name: overloaded.name, utilization: Math.round(overloaded.util * 100) },
            underloaded: { name: underloaded.name, utilization: Math.round(underloaded.util * 100) },
          });
        }
      }
    }

    // ── Needs Action count ──
    const needsActionCount = warnings.filter(w => w.type === "conflict" || w.type === "overloaded").length;

    // Flat list for card-based views
    const allEstimates = [
      ...estimatorRows.flatMap(r => r.estimates.map(e => ({ ...e, estimator: r.name, estimatorColor: r.color }))),
      ...scheduledUnassigned.map(e => ({ ...e, estimator: "", estimatorColor: "#8E8E93" })),
    ];

    return {
      estimatorRows,
      dailyLoad,
      teamDailyLoad,
      estimatorCapacity,
      unassignedEstimates: scheduledUnassigned,
      allEstimates,
      warnings,
      needsActionCount,
      rangeDays: rangeDays.map(fmtDate),
      rangeStart: fmtDate(rangeStart),
      rangeEnd: fmtDate(rangeEnd),
      CAPACITY_HOURS: productionHoursPerDay,
      effectiveHoursPerDay,
    };
  }, [
    estimatesIndex,
    activeCompanyId,
    dateRange?.start,
    dateRange?.end,
    productionHoursPerDay,
    bufferHours,
    overheadPercent,
    behindThreshold,
    aheadThreshold,
    useAccuracyAdjustment,
    complexityMultipliers,
    workWeek,
    estimators,
  ]);
}
