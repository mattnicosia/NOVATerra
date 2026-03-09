/* ────────────────────────────────────────────────────────
   autoScheduler — constraint solver that proposes optimal
   estimator assignments to minimize conflicts and balance load.

   Algorithm:
   1. Sort estimates by due date ASC (most urgent first)
   2. Score each estimator for each estimate:
      - Skill match: +3
      - Current load <70%: +2
      - Already assigned (continuity): +1
      - Would create conflict: -5
   3. Assign to highest-scoring estimator
   4. Return proposed assignments
   ──────────────────────────────────────────────────────── */

function isWeekday(d) {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

function countWeekdays(start, end) {
  let count = 0;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const endD = new Date(end);
  endD.setHours(0, 0, 0, 0);
  while (d <= endD) {
    if (isWeekday(d)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function subtractWeekdays(fromDate, n) {
  const d = new Date(fromDate);
  let remaining = n;
  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    if (isWeekday(d)) remaining--;
  }
  return d;
}

export function autoSchedule(estimates, estimators, settings = {}) {
  const {
    effectiveHoursPerDay = 5.95,
    specialtiesMap = new Map(),
    complexityMultipliers = { light: 0.8, normal: 1.0, heavy: 1.3 },
  } = settings;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Only schedule active estimates with due dates
  const eligible = estimates.filter(e =>
    ["Bidding", "Submitted"].includes(e.status) && e.bidDue && e.estimatedHours > 0,
  );

  // Sort by due date ascending (most urgent first)
  const sorted = [...eligible].sort((a, b) => a.bidDue.localeCompare(b.bidDue));

  // Track per-estimator load as we assign
  const loadMap = new Map(); // estimator → total hours assigned
  for (const e of estimators) {
    loadMap.set(e.name, 0);
  }

  const assignments = new Map(); // estId → estimatorName
  const changes = []; // { estId, estName, from, to, reason }
  let conflictsResolved = 0;

  for (const est of sorted) {
    const complexityMult = complexityMultipliers[est.complexity] || 1.0;
    const adjustedHours = est.estimatedHours * complexityMult;
    const daysNeeded = Math.ceil(adjustedHours / effectiveHoursPerDay);
    const dueDate = new Date(est.bidDue + "T00:00:00");
    const startDate = subtractWeekdays(dueDate, Math.max(0, daysNeeded - 1));
    const wouldConflict = startDate < today;

    let bestScore = -Infinity;
    let bestEstimator = null;

    for (const estimator of estimators) {
      let score = 0;

      // Skill match
      const specs = specialtiesMap.get(estimator.name) || [];
      if (est.primaryDiscipline && specs.includes(est.primaryDiscipline)) {
        score += 3;
      }

      // Load balance — prefer estimators with lower load
      const currentLoad = loadMap.get(estimator.name) || 0;
      const totalCapacity = effectiveHoursPerDay * 20; // ~4 weeks
      const utilization = totalCapacity > 0 ? currentLoad / totalCapacity : 0;
      if (utilization < 0.5) score += 3;
      else if (utilization < 0.7) score += 2;
      else if (utilization < 0.9) score += 1;
      else score -= 2;

      // Continuity bonus (already assigned)
      if (est.estimator === estimator.name) score += 1;

      // Conflict check — if this estimator already has too much, penalize
      if (wouldConflict && currentLoad > totalCapacity * 0.8) score -= 5;

      if (score > bestScore) {
        bestScore = score;
        bestEstimator = estimator;
      }
    }

    if (bestEstimator) {
      assignments.set(est.id, bestEstimator.name);
      loadMap.set(bestEstimator.name, (loadMap.get(bestEstimator.name) || 0) + adjustedHours);

      if (est.estimator !== bestEstimator.name) {
        const reasons = [];
        const specs = specialtiesMap.get(bestEstimator.name) || [];
        if (est.primaryDiscipline && specs.includes(est.primaryDiscipline)) reasons.push("skill match");
        if ((loadMap.get(est.estimator) || 0) > (loadMap.get(bestEstimator.name) || 0)) reasons.push("load balance");
        if (wouldConflict && est.estimator) { reasons.push("resolve conflict"); conflictsResolved++; }

        changes.push({
          estId: est.id,
          estName: est.name || "Untitled",
          from: est.estimator || "Unassigned",
          to: bestEstimator.name,
          hours: est.estimatedHours,
          bidDue: est.bidDue,
          reason: reasons.join(", ") || "optimization",
          skillMatch: est.primaryDiscipline && specs.includes(est.primaryDiscipline),
        });
      }
    }
  }

  // Compute utilization delta
  const currentConflicts = eligible.filter(e => {
    if (!e.estimator) return false;
    const daysNeeded = Math.ceil(e.estimatedHours / effectiveHoursPerDay);
    const dueDate = new Date(e.bidDue + "T00:00:00");
    const startDate = subtractWeekdays(dueDate, Math.max(0, daysNeeded - 1));
    return startDate < today;
  }).length;

  return {
    assignments,
    changes,
    stats: {
      totalEstimates: eligible.length,
      changesProposed: changes.length,
      currentConflicts,
      conflictsResolved,
    },
  };
}
