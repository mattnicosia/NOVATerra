import { useMemo } from "react";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useScanStore } from "@/stores/scanStore";
import { generateBaselineROM } from "@/utils/romEngine";

/**
 * useBidIntelligence — Computes bid/no-bid intelligence from historical data.
 *
 * Reads from estimatesIndex + masterData to provide:
 * - Client history (past projects, win rate)
 * - Architect history
 * - Job type stats
 * - ROM preview (if SF + jobType available)
 * - Actionable signals and recommendation
 *
 * @param {Object} parsedData - AI-parsed RFP data (from parseEmail)
 * @param {Object} editedFields - User-edited fields from ImportConfirmModal
 * @returns {Object} Intelligence data
 */
export function useBidIntelligence(parsedData, editedFields = {}) {
  const estimates = useEstimatesStore(s => s.estimatesIndex);
  const { masterData } = useMasterDataStore();
  const calibrationFactors = useScanStore(s => s.calibrationFactors);

  return useMemo(() => {
    const pd = parsedData || {};
    // Use edited fields if user changed them, fall back to parsed data
    const clientName = (editedFields.client || pd.client?.company || "").toLowerCase().trim();
    const architectName = (editedFields.architect || pd.architect?.company || "").toLowerCase().trim();
    const jobType = editedFields.jobType || pd.jobType || "";
    const projectSF = parseInt(editedFields.projectSF || pd.projectSF || 0, 10);
    const bidDue = editedFields.bidDue || pd.bidDue || "";

    // ── Client History ──
    const clientHistory = computeClientHistory(estimates, clientName);

    // ── Architect History ──
    const architectHistory = computeArchitectHistory(estimates, architectName);

    // ── Job Type Stats ──
    const jobTypeStats = computeJobTypeStats(estimates, jobType);

    // ── ROM Preview ──
    const romPreview = computeRomPreview(projectSF, jobType, calibrationFactors);

    // ── Overall Win Rate (for comparison) ──
    const allWon = estimates.filter(e => e.status === "Won").length;
    const allLost = estimates.filter(e => e.status === "Lost").length;
    const overallWinRate = allWon + allLost > 0 ? Math.round((allWon / (allWon + allLost)) * 100) : null;

    // ── Signals ──
    const signals = buildSignals({
      clientHistory,
      architectHistory,
      jobTypeStats,
      romPreview,
      overallWinRate,
      bidDue,
      projectSF,
      estimates,
    });

    // ── Recommendation ──
    const recommendation = computeRecommendation(signals, clientHistory, jobTypeStats);

    // ── Has any data? ──
    const hasData =
      clientHistory.totalProjects > 0 || jobTypeStats.totalBid > 0 || romPreview !== null || estimates.length > 0;

    return {
      clientHistory,
      architectHistory,
      jobTypeStats,
      romPreview,
      overallWinRate,
      signals,
      recommendation,
      hasData,
    };
  }, [estimates, masterData, calibrationFactors, parsedData, editedFields]);
}

function computeClientHistory(estimates, clientName) {
  if (!clientName) return { totalProjects: 0, winRate: null, avgValue: 0, lastProject: null };

  const clientEstimates = estimates.filter(e => (e.client || "").toLowerCase().trim() === clientName);

  const won = clientEstimates.filter(e => e.status === "Won");
  const lost = clientEstimates.filter(e => e.status === "Lost");
  const wonAndLost = won.length + lost.length;

  const sorted = [...clientEstimates].sort((a, b) => new Date(b.lastModified || 0) - new Date(a.lastModified || 0));

  return {
    totalProjects: clientEstimates.length,
    winRate: wonAndLost > 0 ? Math.round((won.length / wonAndLost) * 100) : null,
    wonCount: won.length,
    lostCount: lost.length,
    avgValue:
      clientEstimates.length > 0
        ? Math.round(clientEstimates.reduce((sum, e) => sum + (e.grandTotal || 0), 0) / clientEstimates.length)
        : 0,
    lastProject: sorted[0] ? { name: sorted[0].name, total: sorted[0].grandTotal, status: sorted[0].status } : null,
  };
}

function computeArchitectHistory(estimates, architectName) {
  if (!architectName) return { totalProjects: 0, avgValue: 0 };

  const archEstimates = estimates.filter(e => (e.architect || "").toLowerCase().trim() === architectName);

  return {
    totalProjects: archEstimates.length,
    avgValue:
      archEstimates.length > 0
        ? Math.round(archEstimates.reduce((sum, e) => sum + (e.grandTotal || 0), 0) / archEstimates.length)
        : 0,
  };
}

function computeJobTypeStats(estimates, jobType) {
  if (!jobType) return { totalBid: 0, won: 0, lost: 0, winRate: null, avgCostPerSF: null };

  const jtLower = jobType.toLowerCase();
  const jtEstimates = estimates.filter(e => (e.jobType || "").toLowerCase() === jtLower);

  const won = jtEstimates.filter(e => e.status === "Won").length;
  const lost = jtEstimates.filter(e => e.status === "Lost").length;
  const wonAndLost = won + lost;

  // Average cost per SF from completed estimates
  const withSF = jtEstimates.filter(e => e.projectSF > 0 && e.grandTotal > 0);
  const avgCostPerSF =
    withSF.length > 0
      ? Math.round(withSF.reduce((sum, e) => sum + e.grandTotal / e.projectSF, 0) / withSF.length)
      : null;

  return {
    totalBid: jtEstimates.length,
    won,
    lost,
    winRate: wonAndLost > 0 ? Math.round((won / wonAndLost) * 100) : null,
    avgCostPerSF,
  };
}

function computeRomPreview(projectSF, jobType, calibrationFactors) {
  if (!projectSF || projectSF < 100 || !jobType) return null;

  try {
    const rom = generateBaselineROM(projectSF, jobType, "new_construction", calibrationFactors);
    if (!rom || !rom.totalRange) return null;

    return {
      totalRange: rom.totalRange, // [low, high]
      costPerSF: rom.costPerSF, // { low, mid, high }
      topDivisions: rom.divisions
        ? rom.divisions
            .sort((a, b) => (b.mid || 0) - (a.mid || 0))
            .slice(0, 5)
            .map(d => ({ code: d.code, label: d.label, mid: d.mid }))
        : [],
    };
  } catch {
    return null;
  }
}

function buildSignals({
  clientHistory,
  architectHistory,
  jobTypeStats,
  romPreview,
  overallWinRate,
  bidDue,
  projectSF,
  estimates,
}) {
  const signals = [];

  // Client signals
  if (clientHistory.totalProjects > 0) {
    if (clientHistory.winRate !== null && clientHistory.winRate >= 50) {
      signals.push({
        type: "client",
        message: `Repeat client (won ${clientHistory.wonCount} of ${clientHistory.wonCount + clientHistory.lostCount})`,
        sentiment: "positive",
      });
    } else if (clientHistory.winRate !== null && clientHistory.winRate < 30) {
      signals.push({
        type: "client",
        message: `Low win rate with this client (${clientHistory.winRate}%)`,
        sentiment: "caution",
      });
    } else if (clientHistory.totalProjects > 0 && clientHistory.winRate === null) {
      signals.push({
        type: "client",
        message: `${clientHistory.totalProjects} past project${clientHistory.totalProjects > 1 ? "s" : ""} with this client`,
        sentiment: "neutral",
      });
    }
  }

  // Job type signals
  if (jobTypeStats.winRate !== null && overallWinRate !== null) {
    if (jobTypeStats.winRate > overallWinRate + 5) {
      signals.push({
        type: "jobType",
        message: `Win rate for ${jobTypeStats.totalBid} ${jobTypeStats.totalBid === 1 ? "project" : "projects"} is above your average (${jobTypeStats.winRate}% vs ${overallWinRate}%)`,
        sentiment: "positive",
      });
    } else if (jobTypeStats.winRate < overallWinRate - 10) {
      signals.push({
        type: "jobType",
        message: `Win rate below your average (${jobTypeStats.winRate}% vs ${overallWinRate}%)`,
        sentiment: "caution",
      });
    }
  }

  // Timeline signal
  if (bidDue) {
    const daysUntilDue = Math.ceil((new Date(bidDue) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysUntilDue <= 3 && daysUntilDue > 0) {
      signals.push({
        type: "timeline",
        message: `Tight timeline — bid due in ${daysUntilDue} day${daysUntilDue > 1 ? "s" : ""}`,
        sentiment: "caution",
      });
    } else if (daysUntilDue <= 7 && daysUntilDue > 3) {
      signals.push({
        type: "timeline",
        message: `${daysUntilDue} days until bid due`,
        sentiment: "neutral",
      });
    } else if (daysUntilDue < 0) {
      signals.push({
        type: "timeline",
        message: "Bid due date has passed",
        sentiment: "caution",
      });
    }
  }

  // Capacity signal
  const activeBids = estimates.filter(e => e.status === "Bidding" || e.status === "Submitted");
  if (activeBids.length >= 8) {
    signals.push({
      type: "capacity",
      message: `${activeBids.length} active bids — consider capacity`,
      sentiment: "caution",
    });
  }

  // ROM size signal
  if (romPreview?.totalRange) {
    const [low, high] = romPreview.totalRange;
    const avgPipeline =
      estimates.length > 0 ? estimates.reduce((sum, e) => sum + (e.grandTotal || 0), 0) / estimates.length : 0;
    if (high > avgPipeline * 3 && avgPipeline > 0) {
      signals.push({
        type: "size",
        message: "Project size significantly above your typical range",
        sentiment: "neutral",
      });
    }
  }

  return signals;
}

function computeRecommendation(signals, clientHistory, jobTypeStats) {
  const positiveCount = signals.filter(s => s.sentiment === "positive").length;
  const cautionCount = signals.filter(s => s.sentiment === "caution").length;

  if (positiveCount >= 2 && cautionCount === 0) return "strong_bid";
  if (positiveCount > cautionCount) return "consider";
  if (cautionCount >= 2) return "caution";
  if (clientHistory.totalProjects === 0 && jobTypeStats.totalBid === 0) return "insufficient_data";
  return "consider";
}
