import { useMemo } from "react";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";

/* ────────────────────────────────────────────────────────
   useMaterialDrivers — Zustand store → PBR uniform bridge

   Computes normalized 0-1 driver values from dashboard data
   that feed into the PBR material system. Each driver maps
   to a semantic meaning in the instrument panel.

   Reads directly from Zustand stores (no router dependency)
   so it can safely render in any context.
   ──────────────────────────────────────────────────────── */

const nn = v => (typeof v === "number" && !isNaN(v) ? v : 0);

export function useMaterialDrivers() {
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);

  return useMemo(() => {
    // Filter by company
    const all = activeCompanyId === "__all__"
      ? estimatesIndex
      : estimatesIndex.filter(e => (e.companyProfileId || "") === (activeCompanyId || ""));

    const active = all.filter(e => e.status === "Bidding" || e.status === "Submitted");
    const won = all.filter(e => e.status === "Won");
    const lost = all.filter(e => e.status === "Lost");
    const now = Date.now();

    // ── u_pipelineHealth: bids on track / total active ──
    // Drives carbon fiber roughness on Pipeline Pulse hero
    const bidsOnTrack = active.filter(e => {
      if (!e.bidDue) return true;
      return new Date(e.bidDue) > new Date();
    }).length;
    const pipelineHealth = active.length > 0 ? bidsOnTrack / active.length : 1.0;

    // ── u_deadlinePressure: proximity of nearest bid due date ──
    // Drives brushed aluminum roughness on Calendar
    let deadlinePressure = 0;
    const dueDates = active
      .map(e => e.bidDue ? new Date(e.bidDue).getTime() : null)
      .filter(Boolean)
      .sort((a, b) => a - b);
    if (dueDates.length > 0) {
      const hoursUntil = (dueDates[0] - now) / (1000 * 60 * 60);
      if (hoursUntil <= 4) deadlinePressure = 1.0;
      else if (hoursUntil <= 168) deadlinePressure = 1.0 - (hoursUntil - 4) / (168 - 4);
    }

    // ── u_marketVolatility: placeholder ──
    const marketVolatility = 0.15;

    // ── u_kpiDeviation: max deviation of any KPI from target ──
    let kpiDeviation = 0;
    const winRate = won.length + lost.length > 0
      ? Math.round((won.length / (won.length + lost.length)) * 100)
      : null;
    if (winRate !== null && winRate < 20) kpiDeviation = Math.max(kpiDeviation, 1.0);
    else if (winRate !== null && winRate < 40) kpiDeviation = Math.max(kpiDeviation, 0.6);
    if (active.length === 0 && all.length > 3) kpiDeviation = Math.max(kpiDeviation, 0.5);

    // ── u_unreadRatio: recent activity proxy ──
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const recentCount = all.filter(e => (e.lastModified || "") > oneDayAgo).length;
    const unreadRatio = all.length > 0 ? Math.min(1, recentCount / Math.max(all.length, 1)) : 0;

    const clamp = v => Math.max(0, Math.min(1, v));

    return {
      pipelineHealth: clamp(pipelineHealth),
      deadlinePressure: clamp(deadlinePressure),
      marketVolatility: clamp(marketVolatility),
      kpiDeviation: clamp(kpiDeviation),
      unreadRatio: clamp(unreadRatio),
    };
  }, [estimatesIndex, activeCompanyId]);
}
