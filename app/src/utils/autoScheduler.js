/* ────────────────────────────────────────────────────────
   autoScheduler — experience-weighted constraint solver
   that proposes optimal estimator assignments.

   Modes:
   • "all"    — Optimize across all estimators
   • "single" — Optimize one estimator's queue ordering
   • "multi"  — Optimize across selected estimator subset

   Scoring (0–100 normalized from ~155 raw points):
   • Job type experience:     0-30  (historical count)
   • Building type match:     0-15
   • Work type match:         0-10
   • Win rate for this type:  0-15
   • Project size fit:        0-10
   • Load balance:           -20 to +20
   • Progress-aware:         -10 to +10
   • Continuity:              0-5
   • Conflict avoidance:     -30
   • Discipline match:        0-10
   • Manager preference:      0-10
   ──────────────────────────────────────────────────────── */

import { computeEstimatorExperience, computeMatchScore } from "./estimatorExperience";

function isWeekday(d) {
  const day = d.getDay();
  return day !== 0 && day !== 6;
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
    specialtiesMap: _specialtiesMap = new Map(),
    complexityMultipliers = { light: 0.8, normal: 1.0, heavy: 1.3 },
    allEstimates = [],
    mode = "all",
    selectedEstimators = [],
    progressMap = new Map(),
  } = settings;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Only schedule active estimates with due dates
  const eligible = estimates.filter(
    e => ["Bidding", "Submitted"].includes(e.status) && e.bidDue && e.estimatedHours > 0,
  );

  // Determine which estimators participate
  let activeEstimators = estimators;
  if (mode === "single" && selectedEstimators.length === 1) {
    activeEstimators = estimators.filter(e => selectedEstimators.includes(e.name));
  } else if (mode === "multi" && selectedEstimators.length > 0) {
    activeEstimators = estimators.filter(e => selectedEstimators.includes(e.name));
  }

  if (activeEstimators.length === 0) {
    return {
      assignments: new Map(),
      changes: [],
      stats: { totalEstimates: 0, changesProposed: 0, currentConflicts: 0, conflictsResolved: 0 },
    };
  }

  // Sort by due date ascending (most urgent first)
  const sorted = [...eligible].sort((a, b) => a.bidDue.localeCompare(b.bidDue));

  // Pre-compute experience profiles for all active estimators
  const experienceMap = new Map();
  for (const est of activeEstimators) {
    experienceMap.set(
      est.name,
      computeEstimatorExperience(allEstimates.length > 0 ? allEstimates : estimates, est.name),
    );
  }

  // Track per-estimator load as we assign
  const loadMap = new Map();
  for (const e of activeEstimators) {
    loadMap.set(e.name, 0);
  }

  const assignments = new Map();
  const changes = [];
  let conflictsResolved = 0;

  // ── Single-estimator mode: reorder queue, don't reassign ──
  if (mode === "single" && activeEstimators.length === 1) {
    const est = activeEstimators[0];
    const myEstimates = sorted.filter(e => e.estimator === est.name);

    // Score each estimate by urgency and fit
    const scored = myEstimates
      .map(e => {
        const complexityMult = complexityMultipliers[e.complexity] || 1.0;
        const adjustedHours = e.estimatedHours * complexityMult;
        const daysNeeded = Math.ceil(adjustedHours / effectiveHoursPerDay);
        const dueDate = new Date(e.bidDue + "T00:00:00");
        const startDate = subtractWeekdays(dueDate, Math.max(0, daysNeeded - 1));
        const wouldConflict = startDate < today;
        const progress = progressMap.get(e.id);

        // Priority score: urgency (how soon due) + behind-ness + conflict
        let priority = 0;
        const daysUntilDue = Math.round((dueDate - today) / 86400000);
        priority += Math.max(0, 30 - daysUntilDue); // More urgent = higher priority
        if (wouldConflict) priority += 20;
        if (progress?.scheduleStatus === "behind") priority += 15;
        if (progress?.scheduleStatus === "overdue") priority += 25;

        return { ...e, priority, daysNeeded, wouldConflict };
      })
      .sort((a, b) => b.priority - a.priority);

    // Suggest timeline adjustments for conflicting estimates
    for (const e of scored) {
      if (e.wouldConflict) {
        changes.push({
          estId: e.id,
          estName: e.name || "Untitled",
          from: est.name,
          to: est.name,
          hours: e.estimatedHours,
          bidDue: e.bidDue,
          reason: `Priority ${e.priority} — needs attention`,
          matchScore: 100,
          breakdown: {},
          flags: e.wouldConflict ? ["Timeline conflict — starts in the past"] : [],
          isReorder: true,
        });
      }
    }

    return {
      assignments: new Map(),
      changes,
      stats: {
        totalEstimates: myEstimates.length,
        changesProposed: changes.length,
        currentConflicts: scored.filter(e => e.wouldConflict).length,
        conflictsResolved: 0,
      },
    };
  }

  // ── All / Multi mode: full optimization ──
  for (const est of sorted) {
    const complexityMult = complexityMultipliers[est.complexity] || 1.0;
    const adjustedHours = est.estimatedHours * complexityMult;
    const daysNeeded = Math.ceil(adjustedHours / effectiveHoursPerDay);
    const dueDate = new Date(est.bidDue + "T00:00:00");
    const startDate = subtractWeekdays(dueDate, Math.max(0, daysNeeded - 1));
    const wouldConflict = startDate < today;

    let bestScore = -Infinity;
    let bestEstimator = null;
    let bestMatchResult = null;

    for (const estimator of activeEstimators) {
      let score = 0;
      const experience = experienceMap.get(estimator.name);
      const matchResult = computeMatchScore(experience, est, estimator);

      // ── Experience-based scoring (from match engine) ──
      // matchResult.score is 0-100, scale to 0-80 contribution
      score += Math.round(matchResult.score * 0.8);

      // ── Load balance (-20 to +20) ──
      const maxHours = estimator.maxHoursPerDay || effectiveHoursPerDay;
      const currentLoad = loadMap.get(estimator.name) || 0;
      const totalCapacity = maxHours * 20; // ~4 weeks
      const utilization = totalCapacity > 0 ? currentLoad / totalCapacity : 0;
      if (utilization < 0.3) score += 20;
      else if (utilization < 0.5) score += 15;
      else if (utilization < 0.7) score += 10;
      else if (utilization < 0.9) score += 0;
      else score -= 20;

      // ── Progress-aware (-10 to +10) ──
      // Check if this estimator is behind on existing work
      const estProgress = progressMap.get(est.id);
      if (estProgress) {
        if (estProgress.scheduleStatus === "behind") score -= 5;
        else if (estProgress.scheduleStatus === "overdue") score -= 10;
        else if (estProgress.scheduleStatus === "ahead") score += 5;
      }

      // ── Continuity (0-5) ──
      if (est.estimator === estimator.name) score += 5;

      // ── Conflict avoidance (-30) ──
      if (wouldConflict && currentLoad > totalCapacity * 0.8) score -= 30;

      if (score > bestScore) {
        bestScore = score;
        bestEstimator = estimator;
        bestMatchResult = matchResult;
      }
    }

    if (bestEstimator) {
      assignments.set(est.id, bestEstimator.name);
      loadMap.set(bestEstimator.name, (loadMap.get(bestEstimator.name) || 0) + adjustedHours);

      if (est.estimator !== bestEstimator.name) {
        const reasons = [];
        if (bestMatchResult?.score >= 60) reasons.push("experience match");
        const oldLoad = loadMap.get(est.estimator) || 0;
        const newLoad = loadMap.get(bestEstimator.name) || 0;
        if (oldLoad > newLoad) reasons.push("load balance");
        if (wouldConflict && est.estimator) {
          reasons.push("resolve conflict");
          conflictsResolved++;
        }

        changes.push({
          estId: est.id,
          estName: est.name || "Untitled",
          from: est.estimator || "Unassigned",
          to: bestEstimator.name,
          hours: est.estimatedHours,
          bidDue: est.bidDue,
          reason: reasons.join(", ") || "optimization",
          matchScore: bestMatchResult?.score || 0,
          breakdown: bestMatchResult?.breakdown || {},
          flags: bestMatchResult?.flags || [],
          skillMatch: (bestMatchResult?.score || 0) >= 60,
        });
      }
    }
  }

  // Current conflicts count
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
