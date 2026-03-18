import { useMemo } from "react";
import { useEstimatesStore } from "@/stores/estimatesStore";

/**
 * useBusinessMetrics — Analytics aggregation hook for the Owner's Portal.
 *
 * Reads from estimatesIndex (lightweight metadata already in memory) to compute:
 * - Pipeline metrics (active bids, pipeline value, win rate, pending)
 * - Team capacity (per-estimator workload, turnaround times)
 * - Financial metrics (backlog, avg proposal value, cost/SF, revenue trend)
 * - Recent outcomes (last N won/lost with metadata)
 *
 * All data comes from the index — no need to load full estimate blobs.
 */
export function useBusinessMetrics() {
  const estimates = useEstimatesStore(s => s.estimatesIndex);

  return useMemo(() => {
    const now = new Date();

    // ── Pipeline Metrics ──
    const bidding = estimates.filter(e => e.status === "Bidding");
    const submitted = estimates.filter(e => e.status === "Submitted");
    const won = estimates.filter(e => e.status === "Won");
    const lost = estimates.filter(e => e.status === "Lost");
    const onHold = estimates.filter(e => e.status === "On Hold");
    const cancelled = estimates.filter(e => e.status === "Cancelled");

    const activeBids = [...bidding, ...submitted];
    const pipelineValue = activeBids.reduce((sum, e) => sum + (e.grandTotal || 0), 0);
    const wonAndLost = won.length + lost.length;
    const winRate = wonAndLost > 0 ? Math.round((won.length / wonAndLost) * 100) : 0;

    const pipeline = {
      activeBidsCount: activeBids.length,
      biddingCount: bidding.length,
      submittedCount: submitted.length,
      wonCount: won.length,
      lostCount: lost.length,
      onHoldCount: onHold.length,
      cancelledCount: cancelled.length,
      pipelineValue,
      winRate,
      totalEstimates: estimates.length,
    };

    // ── Status Distribution (for chart) ──
    const statusDistribution = [
      { status: "Bidding", count: bidding.length, color: "#007AFF" },
      { status: "Submitted", count: submitted.length, color: "#FF9500" },
      { status: "Won", count: won.length, color: "#30D158" },
      { status: "Lost", count: lost.length, color: "#FF3B30" },
      { status: "On Hold", count: onHold.length, color: "#8E8E93" },
      { status: "Cancelled", count: cancelled.length, color: "#636366" },
    ];

    // ── Recent Outcomes (last 10 Won or Lost) ──
    const allOutcomes = [...won, ...lost]
      .filter(e => e.outcomeMetadata?.awardDate || e.lastModified)
      .sort((a, b) => {
        const dateA = a.outcomeMetadata?.awardDate || a.lastModified || "";
        const dateB = b.outcomeMetadata?.awardDate || b.lastModified || "";
        return dateB.localeCompare(dateA);
      })
      .slice(0, 10);

    const recentOutcomes = allOutcomes.map(e => ({
      id: e.id,
      name: e.name,
      client: e.client,
      status: e.status,
      grandTotal: e.grandTotal,
      contractAmount: e.outcomeMetadata?.contractAmount || 0,
      lostReason: e.outcomeMetadata?.lostReason || "",
      competitor: e.outcomeMetadata?.competitor || "",
      awardDate: e.outcomeMetadata?.awardDate || "",
      estimator: e.estimator,
    }));

    // ── Team Capacity ──
    // Group by estimator
    const estimatorMap = {};
    for (const e of estimates) {
      const name = e.estimator || "Unassigned";
      if (!estimatorMap[name]) {
        estimatorMap[name] = { name, active: 0, total: 0, totalMs: 0, won: 0, estimates: [] };
      }
      estimatorMap[name].total++;
      estimatorMap[name].totalMs += e.timerTotalMs || 0;
      estimatorMap[name].estimates.push(e);
      if (e.status === "Bidding" || e.status === "Submitted") {
        estimatorMap[name].active++;
      }
      if (e.status === "Won") {
        estimatorMap[name].won++;
      }
    }

    const teamCapacity = Object.values(estimatorMap).map(est => ({
      name: est.name,
      activeEstimates: est.active,
      totalEstimates: est.total,
      totalHours: Math.round((est.totalMs / 3600000) * 10) / 10, // to 1 decimal
      avgHoursPerEstimate: est.total > 0 ? Math.round((est.totalMs / 3600000 / est.total) * 10) / 10 : 0,
      wonCount: est.won,
    }));

    // Sort by active estimates (descending) for capacity visibility
    teamCapacity.sort((a, b) => b.activeEstimates - a.activeEstimates);

    // ── Upcoming Deadlines ──
    const upcoming = estimates
      .filter(e => {
        if (e.status !== "Bidding" && e.status !== "Submitted") return false;
        if (!e.bidDue) return false;
        return true;
      })
      .map(e => {
        const dueDate = new Date(e.bidDue);
        const daysUntil = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
        return { ...e, dueDate, daysUntil };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 10);

    // ── Financial Metrics ──
    const backlogValue = won.reduce((sum, e) => sum + (e.outcomeMetadata?.contractAmount || e.grandTotal || 0), 0);

    const allTotals = estimates.filter(e => e.grandTotal > 0).map(e => e.grandTotal);
    const avgProposalValue =
      allTotals.length > 0 ? Math.round(allTotals.reduce((a, b) => a + b, 0) / allTotals.length) : 0;

    // Cost per SF by building type
    const sfByType = {};
    for (const e of estimates) {
      if (!e.buildingType || !e.projectSF || e.projectSF <= 0 || !e.grandTotal) continue;
      if (!sfByType[e.buildingType]) sfByType[e.buildingType] = { totalCost: 0, totalSF: 0, count: 0 };
      sfByType[e.buildingType].totalCost += e.grandTotal;
      sfByType[e.buildingType].totalSF += Number(e.projectSF) || 0;
      sfByType[e.buildingType].count++;
    }
    const costPerSF = Object.entries(sfByType).map(([type, data]) => ({
      buildingType: type,
      avgCostPerSF: data.totalSF > 0 ? Math.round(data.totalCost / data.totalSF) : 0,
      count: data.count,
    }));

    // Revenue trend — monthly Won contract amounts
    const revenueTrend = [];
    for (const e of won) {
      const dateStr = e.outcomeMetadata?.awardDate || e.lastModified || "";
      if (!dateStr) continue;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) continue;
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const existing = revenueTrend.find(r => r.month === monthKey);
      const amount = e.outcomeMetadata?.contractAmount || e.grandTotal || 0;
      if (existing) {
        existing.value += amount;
        existing.count++;
      } else {
        revenueTrend.push({ month: monthKey, value: amount, count: 1 });
      }
    }
    revenueTrend.sort((a, b) => a.month.localeCompare(b.month));

    const financial = {
      backlogValue,
      avgProposalValue,
      costPerSF,
      revenueTrend,
    };

    return {
      pipeline,
      statusDistribution,
      recentOutcomes,
      teamCapacity,
      upcoming,
      financial,
    };
  }, [estimates]);
}
