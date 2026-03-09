/* ────────────────────────────────────────────────────────
   Estimator Experience Engine — pure functions that compute
   experience profiles and match scores from estimatesIndex.

   Shared intelligence layer for:
   • autoScheduler.js (assignment scoring)
   • BarContextMenu (smart reassign ranking)
   • EstimatorScorecard (experience display)
   ──────────────────────────────────────────────────────── */

/**
 * Compute full experience profile for one estimator.
 * Looks at ALL estimates (any status) assigned to this estimator.
 */
export function computeEstimatorExperience(estimatesIndex, estimatorName) {
  const mine = estimatesIndex.filter(e => e.estimator === estimatorName);

  // ── Job type breakdown ──
  const jtMap = {};
  for (const e of mine) {
    const jt = e.jobType || "Unknown";
    if (!jtMap[jt]) jtMap[jt] = { count: 0, wonCount: 0, lostCount: 0, totalValue: 0, totalSF: 0, sfCount: 0 };
    jtMap[jt].count++;
    jtMap[jt].totalValue += e.grandTotal || 0;
    if (e.projectSF > 0) {
      jtMap[jt].totalSF += e.projectSF;
      jtMap[jt].sfCount++;
    }
    if (e.status === "Won") jtMap[jt].wonCount++;
    if (e.status === "Lost") jtMap[jt].lostCount++;
  }
  const jobTypes = Object.entries(jtMap)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([type, d]) => ({
      type,
      ...d,
      avgSF: d.sfCount > 0 ? Math.round(d.totalSF / d.sfCount) : 0,
      winRate: d.wonCount + d.lostCount >= 2 ? Math.round((d.wonCount / (d.wonCount + d.lostCount)) * 100) : null,
    }));

  // ── Building type breakdown ──
  const btMap = {};
  for (const e of mine) {
    const bt = e.buildingType || "Unknown";
    if (!btMap[bt]) btMap[bt] = { count: 0, wonCount: 0, lostCount: 0, totalValue: 0 };
    btMap[bt].count++;
    btMap[bt].totalValue += e.grandTotal || 0;
    if (e.status === "Won") btMap[bt].wonCount++;
    if (e.status === "Lost") btMap[bt].lostCount++;
  }
  const buildingTypes = Object.entries(btMap)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([type, d]) => ({
      type,
      ...d,
      winRate: d.wonCount + d.lostCount >= 2 ? Math.round((d.wonCount / (d.wonCount + d.lostCount)) * 100) : null,
    }));

  // ── Work type breakdown ──
  const wtMap = {};
  for (const e of mine) {
    const wt = e.workType || "Unknown";
    if (!wtMap[wt]) wtMap[wt] = { count: 0, wonCount: 0, lostCount: 0 };
    wtMap[wt].count++;
    if (e.status === "Won") wtMap[wt].wonCount++;
    if (e.status === "Lost") wtMap[wt].lostCount++;
  }
  const workTypes = Object.entries(wtMap)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([type, d]) => ({
      type,
      ...d,
      winRate: d.wonCount + d.lostCount >= 2 ? Math.round((d.wonCount / (d.wonCount + d.lostCount)) * 100) : null,
    }));

  // ── Project size range ──
  const sfs = mine.filter(e => e.projectSF > 0).map(e => e.projectSF);
  const projectSizeRange =
    sfs.length > 0
      ? {
          minSF: Math.min(...sfs),
          maxSF: Math.max(...sfs),
          avgSF: Math.round(sfs.reduce((a, b) => a + b, 0) / sfs.length),
          medianSF: sfs.sort((a, b) => a - b)[Math.floor(sfs.length / 2)],
        }
      : null;

  // ── Overall stats ──
  const wonCount = mine.filter(e => e.status === "Won").length;
  const lostCount = mine.filter(e => e.status === "Lost").length;
  const decided = wonCount + lostCount;

  // ── Recent projects (last 5 by bidDue) ──
  const recentProjects = [...mine]
    .sort((a, b) => (b.bidDue || "").localeCompare(a.bidDue || ""))
    .slice(0, 5)
    .map(e => ({
      id: e.id,
      name: e.name || "Untitled",
      status: e.status,
      bidDue: e.bidDue,
      jobType: e.jobType,
      buildingType: e.buildingType,
      grandTotal: e.grandTotal,
    }));

  return {
    jobTypes,
    buildingTypes,
    workTypes,
    projectSizeRange,
    totalEstimates: mine.length,
    wonCount,
    lostCount,
    overallWinRate: decided >= 2 ? Math.round((wonCount / decided) * 100) : null,
    recentProjects,
  };
}

/**
 * Compute match score between an estimator's experience and a specific estimate.
 * Returns 0-100 score with per-factor breakdown and warning flags.
 */
export function computeMatchScore(experience, estimate, estimatorProfile = {}) {
  if (!experience || !estimate) return { score: 0, breakdown: {}, flags: [] };

  const breakdown = {};
  const flags = [];
  let totalRaw = 0;
  const MAX_RAW = 120; // Sum of all max factor points

  // ── 1. Job type experience (0-30 pts) ──
  const estJobType = estimate.jobType;
  if (estJobType) {
    const jtMatch = experience.jobTypes.find(jt => jt.type === estJobType);
    if (jtMatch) {
      // Scale: 1 project = 2pts, 5 = 10, 10 = 20, 15+ = 30
      const pts = Math.min(30, Math.round(jtMatch.count * 2));
      totalRaw += pts;
      breakdown.jobType = {
        score: pts,
        max: 30,
        label: `${jtMatch.count} ${estJobType} project${jtMatch.count !== 1 ? "s" : ""}`,
      };
      if (jtMatch.count >= 10) flags.push(`Strong ${estJobType} experience (${jtMatch.count} projects)`);
      else if (jtMatch.count === 1) flags.push(`Limited ${estJobType} experience (1 project)`);
    } else {
      breakdown.jobType = { score: 0, max: 30, label: `No ${estJobType} experience` };
      flags.push(`No ${estJobType} experience`);
    }
  }

  // ── 2. Building type match (0-15 pts) ──
  const estBuildingType = estimate.buildingType;
  if (estBuildingType) {
    const btMatch = experience.buildingTypes.find(bt => bt.type === estBuildingType);
    if (btMatch) {
      const pts = Math.min(15, Math.round(btMatch.count * 1.5));
      totalRaw += pts;
      breakdown.buildingType = { score: pts, max: 15, label: `${btMatch.count} ${estBuildingType}` };
    } else {
      breakdown.buildingType = { score: 0, max: 15, label: `No ${estBuildingType} experience` };
    }
  }

  // ── 3. Work type match (0-10 pts) ──
  const estWorkType = estimate.workType;
  if (estWorkType) {
    const wtMatch = experience.workTypes.find(wt => wt.type === estWorkType);
    if (wtMatch) {
      const pts = Math.min(10, wtMatch.count);
      totalRaw += pts;
      breakdown.workType = { score: pts, max: 10, label: `${wtMatch.count} ${estWorkType}` };
    } else {
      breakdown.workType = { score: 0, max: 10, label: `No ${estWorkType} experience` };
    }
  }

  // ── 4. Win rate for this job type (0-15 pts) ──
  if (estJobType) {
    const jtMatch = experience.jobTypes.find(jt => jt.type === estJobType);
    if (jtMatch?.winRate !== null && jtMatch?.winRate !== undefined) {
      const pts = Math.round((jtMatch.winRate / 100) * 15);
      totalRaw += pts;
      breakdown.winRate = { score: pts, max: 15, label: `${jtMatch.winRate}% win rate for ${estJobType}` };
    } else {
      breakdown.winRate = { score: 0, max: 15, label: "Insufficient data" };
    }
  }

  // ── 5. Project size fit (0-10 pts) ──
  const estSF = estimate.projectSF;
  if (estSF > 0 && experience.projectSizeRange) {
    const { minSF, maxSF } = experience.projectSizeRange;
    if (estSF >= minSF && estSF <= maxSF) {
      totalRaw += 10; // Perfect fit
      breakdown.projectSize = { score: 10, max: 10, label: `Within range (${fmtSF(minSF)}–${fmtSF(maxSF)})` };
    } else {
      // Partial credit — how far outside range
      const dist = estSF < minSF ? (minSF - estSF) / minSF : (estSF - maxSF) / maxSF;
      const pts = Math.max(0, Math.round(10 * (1 - Math.min(1, dist))));
      totalRaw += pts;
      breakdown.projectSize = {
        score: pts,
        max: 10,
        label: `${fmtSF(estSF)} vs range ${fmtSF(minSF)}–${fmtSF(maxSF)}`,
      };
    }
  }

  // ── 6. Manager preference (0-10 pts) ──
  const preferred = estimatorProfile.preferredJobTypes || [];
  if (estJobType && preferred.length > 0) {
    if (preferred.includes(estJobType)) {
      totalRaw += 10;
      breakdown.preference = { score: 10, max: 10, label: "Preferred job type" };
    } else {
      breakdown.preference = { score: 0, max: 10, label: "Not a preferred type" };
    }
  }

  // ── 7. Discipline match (0-10 pts) ──
  const specialties = estimatorProfile.specialties || [];
  const estDiscipline = estimate.primaryDiscipline;
  if (estDiscipline && specialties.length > 0) {
    if (specialties.includes(estDiscipline)) {
      totalRaw += 10;
      breakdown.discipline = { score: 10, max: 10, label: `${estDiscipline} specialty` };
    } else {
      breakdown.discipline = { score: 0, max: 10, label: `No ${estDiscipline} specialty` };
    }
  }

  // ── Normalize to 0-100 ──
  const score = MAX_RAW > 0 ? Math.min(100, Math.round((totalRaw / MAX_RAW) * 100)) : 0;

  return { score, breakdown, flags };
}

/**
 * Compute experiences for all estimators at once.
 */
export function computeAllExperiences(estimatesIndex, estimatorNames) {
  const map = new Map();
  for (const name of estimatorNames) {
    map.set(name, computeEstimatorExperience(estimatesIndex, name));
  }
  return map;
}

// ── Helpers ──
function fmtSF(sf) {
  if (sf >= 1000000) return `${(sf / 1000000).toFixed(1)}M SF`;
  if (sf >= 1000) return `${Math.round(sf / 1000)}K SF`;
  return `${sf} SF`;
}
