/**
 * hoursEstimator.js — NOVA auto-suggest estimated hours from historical data
 *
 * Looks at completed estimates with actual timer data (timerTotalMs) that match
 * the current project's buildingType and similar projectSF range, then suggests
 * how many hours this new estimate will likely take.
 */

export function suggestEstimatedHours(project, estimatesIndex) {
  // 1. Filter for completed estimates with actual time data
  const comparables = estimatesIndex.filter(e => {
    if (!e.timerTotalMs || e.timerTotalMs < 3600000) return false; // At least 1 hour tracked
    if (!["Won", "Lost", "Submitted"].includes(e.status)) return false;

    // Match buildingType (primary filter)
    if (project.buildingType && e.buildingType && e.buildingType !== project.buildingType) return false;

    // Match similar SF range (±50% if both have SF data)
    if (project.projectSF && e.projectSF) {
      const sf = Number(project.projectSF);
      const eSf = Number(e.projectSF);
      if (sf > 0 && eSf > 0) {
        const ratio = eSf / sf;
        if (ratio < 0.5 || ratio > 2.0) return false;
      }
    }

    // Match workType if available
    if (project.workType && e.workType && e.workType !== project.workType) return false;

    return true;
  });

  if (comparables.length < 2) return null; // Need at least 2 data points

  // 2. Compute average hours from actual time data
  const hours = comparables.map(e => e.timerTotalMs / 3600000);
  const avgHours = hours.reduce((a, b) => a + b, 0) / hours.length;

  // Standard deviation
  const variance = hours.reduce((sum, h) => sum + Math.pow(h - avgHours, 2), 0) / hours.length;
  const stdDev = Math.sqrt(variance);

  // 3. Apply SF scaling if both have SF data
  let scaledHours = avgHours;
  if (project.projectSF && Number(project.projectSF) > 0) {
    const avgSF = comparables.reduce((sum, e) => sum + (Number(e.projectSF) || 0), 0) / comparables.length;
    if (avgSF > 0) {
      const ratio = Number(project.projectSF) / avgSF;
      scaledHours = avgHours * Math.pow(ratio, 0.7); // Sub-linear scaling
    }
  }

  // 4. Build suggestion
  const suggested = Math.round(scaledHours);
  const rangeLow = Math.max(1, Math.round(scaledHours - stdDev));
  const rangeHigh = Math.round(scaledHours + stdDev);

  return {
    suggested,
    range: [rangeLow, rangeHigh],
    confidence: comparables.length >= 5 ? "high" : "moderate",
    basedOn: comparables.length,
    comparables: comparables.slice(0, 3).map(e => ({
      name: e.name,
      hours: Math.round((e.timerTotalMs / 3600000) * 10) / 10,
      sf: e.projectSF,
      type: e.buildingType,
    })),
  };
}
