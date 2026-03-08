import { useMemo } from "react";
import { useEstimatesStore } from "@/stores/estimatesStore";

/**
 * useEstimatorStats — Per-estimator metrics for engagement & team management.
 *
 * Computes accuracy score, win rate, division expertise, and time tracking
 * from estimatesIndex data. No additional API calls needed.
 *
 * @param {string} estimatorName - The estimator name to filter by
 * @returns {object} Stats object
 */
export function useEstimatorStats(estimatorName) {
  const estimates = useEstimatesStore(s => s.estimatesIndex);

  return useMemo(() => {
    if (!estimatorName) {
      return { totalEstimates: 0, activeCount: 0, wonCount: 0, accuracy: null, winRate: null, topDivisions: [], totalHours: 0 };
    }

    const mine = estimates.filter(e => e.estimator === estimatorName);

    // ── Accuracy: avg absolute deviation % on Won projects with actual amounts ──
    const wonWithActual = mine.filter(
      e => e.status === "Won" && e.outcomeMetadata?.contractAmount > 0 && e.grandTotal > 0,
    );

    let accuracy = null;
    if (wonWithActual.length >= 3) {
      const deviations = wonWithActual.map(e => {
        return Math.abs(e.grandTotal - e.outcomeMetadata.contractAmount) / e.outcomeMetadata.contractAmount;
      });
      accuracy = Math.round((deviations.reduce((a, b) => a + b, 0) / deviations.length) * 100);
    }

    // ── Win rate ──
    const decided = mine.filter(e => e.status === "Won" || e.status === "Lost");
    const wonCount = mine.filter(e => e.status === "Won").length;
    const winRate = decided.length > 0 ? Math.round((wonCount / decided.length) * 100) : null;

    // ── Division expertise ──
    const divExp = {};
    for (const e of mine) {
      if (!e.divisionTotals) continue;
      for (const [div, total] of Object.entries(e.divisionTotals)) {
        if (!divExp[div]) divExp[div] = { count: 0, totalValue: 0, wonCount: 0 };
        divExp[div].count++;
        divExp[div].totalValue += total || 0;
        if (e.status === "Won") divExp[div].wonCount++;
      }
    }
    const topDivisions = Object.entries(divExp)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([div, data]) => ({ division: div, ...data }));

    // ── Total hours estimating ──
    const totalHours = Math.round((mine.reduce((sum, e) => sum + (e.timerTotalMs || 0), 0) / 3600000) * 10) / 10;

    return {
      totalEstimates: mine.length,
      activeCount: mine.filter(e => e.status === "Bidding" || e.status === "Submitted").length,
      wonCount,
      lostCount: mine.filter(e => e.status === "Lost").length,
      accuracy, // null if insufficient data, otherwise X (e.g. 8 = "within 8%")
      winRate, // null if insufficient data, otherwise %
      topDivisions, // [{ division, count, totalValue, wonCount }]
      totalHours,
      dataPoints: wonWithActual.length, // How many Won projects have actual amounts
    };
  }, [estimates, estimatorName]);
}

/**
 * Compute accuracy for all estimators at once (for heat map).
 */
export function useAllEstimatorStats() {
  const estimates = useEstimatesStore(s => s.estimatesIndex);

  return useMemo(() => {
    const byEstimator = {};
    for (const e of estimates) {
      const name = e.estimator || "Unassigned";
      if (!byEstimator[name]) byEstimator[name] = [];
      byEstimator[name].push(e);
    }

    const stats = {};
    for (const [name, ests] of Object.entries(byEstimator)) {
      const wonWithActual = ests.filter(
        e => e.status === "Won" && e.outcomeMetadata?.contractAmount > 0 && e.grandTotal > 0,
      );
      const decided = ests.filter(e => e.status === "Won" || e.status === "Lost");
      const wonCount = ests.filter(e => e.status === "Won").length;

      let accuracy = null;
      if (wonWithActual.length >= 3) {
        const devs = wonWithActual.map(
          e => Math.abs(e.grandTotal - e.outcomeMetadata.contractAmount) / e.outcomeMetadata.contractAmount,
        );
        accuracy = Math.round((devs.reduce((a, b) => a + b, 0) / devs.length) * 100);
      }

      // Division expertise
      const divExp = {};
      for (const e of ests) {
        if (!e.divisionTotals) continue;
        for (const [div, total] of Object.entries(e.divisionTotals)) {
          if (!divExp[div]) divExp[div] = { count: 0, totalValue: 0, wonCount: 0 };
          divExp[div].count++;
          divExp[div].totalValue += total || 0;
          if (e.status === "Won") divExp[div].wonCount++;
        }
      }

      stats[name] = {
        totalEstimates: ests.length,
        activeCount: ests.filter(e => e.status === "Bidding" || e.status === "Submitted").length,
        wonCount,
        winRate: decided.length > 0 ? Math.round((wonCount / decided.length) * 100) : null,
        accuracy,
        divisions: divExp,
        totalHours: Math.round((ests.reduce((s, e) => s + (e.timerTotalMs || 0), 0) / 3600000) * 10) / 10,
      };
    }
    return stats;
  }, [estimates]);
}
