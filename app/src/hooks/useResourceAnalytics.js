import { useMemo } from "react";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";

/* ────────────────────────────────────────────────────────
   useResourceAnalytics — estimation accuracy, velocity,
   cycle time, and benchmarks from historical estimates.
   ──────────────────────────────────────────────────────── */

const msToHours = ms => (ms || 0) / 3600000;

function getWeekKey(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  // Monday of this week
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));
  return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
}

export function useResourceAnalytics() {
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const activeCompanyId = useUiStore(s => s.appSettings?.activeCompanyId) || "";

  return useMemo(() => {
    // Filter to relevant company
    let entries = estimatesIndex;
    if (activeCompanyId && activeCompanyId !== "__all__") {
      entries = entries.filter(e => (e.companyId || "") === activeCompanyId);
    }

    // ── Completed estimates (have actual hours tracked) ──
    const withActual = entries.filter(e => e.timerTotalMs > 0 && e.estimatedHours > 0);

    // ── Per-estimator accuracy ──
    const accuracyMap = new Map();
    for (const e of withActual) {
      const name = e.estimator || "Unassigned";
      if (!accuracyMap.has(name)) {
        accuracyMap.set(name, { estimates: 0, totalEstimated: 0, totalActual: 0, ratios: [] });
      }
      const rec = accuracyMap.get(name);
      const actual = msToHours(e.timerTotalMs);
      rec.estimates += 1;
      rec.totalEstimated += e.estimatedHours;
      rec.totalActual += actual;
      rec.ratios.push(actual / e.estimatedHours);
    }

    const accuracyByEstimator = new Map();
    for (const [name, rec] of accuracyMap) {
      const avgRatio = rec.ratios.length > 0 ? rec.ratios.reduce((s, r) => s + r, 0) / rec.ratios.length : 1.0;
      accuracyByEstimator.set(name, {
        estimates: rec.estimates,
        avgAccuracy: Math.round(avgRatio * 100) / 100,
        totalEstimated: Math.round(rec.totalEstimated),
        totalActual: Math.round(rec.totalActual * 10) / 10,
        trend: rec.ratios.slice(-10), // last 10 for sparkline
      });
    }

    // ── Weekly velocity (rolling 8 weeks) ──
    const now = new Date();
    const eightWeeksAgo = new Date(now);
    eightWeeksAgo.setDate(now.getDate() - 56);
    const eightWeeksAgoStr = eightWeeksAgo.toISOString().slice(0, 10);

    const submitted = entries.filter(
      e => ["Won", "Lost", "Submitted"].includes(e.status) && e.bidDue >= eightWeeksAgoStr,
    );

    const velocityMap = new Map();
    for (const e of submitted) {
      const wk = getWeekKey(e.bidDue);
      if (!wk) continue;
      if (!velocityMap.has(wk)) velocityMap.set(wk, { week: wk, count: 0, hours: 0 });
      const rec = velocityMap.get(wk);
      rec.count += 1;
      rec.hours += e.estimatedHours || 0;
    }
    const weeklyVelocity = Array.from(velocityMap.values()).sort((a, b) => a.week.localeCompare(b.week));

    // ── Cycle time by estimator ──
    // Approximation: use bidDue - scheduledStart span from workload, or fall back to estimatedHours / 7
    const cycleTimeMap = new Map();
    for (const e of entries) {
      if (!e.bidDue || !e.estimator) continue;
      if (!["Won", "Lost", "Submitted"].includes(e.status)) continue;
      const name = e.estimator;
      if (!cycleTimeMap.has(name)) cycleTimeMap.set(name, { totalDays: 0, count: 0 });
      const rec = cycleTimeMap.get(name);
      // Rough cycle: estimatedHours / 7 (production hours per day)
      const days = e.estimatedHours > 0 ? Math.ceil(e.estimatedHours / 7) : 1;
      rec.totalDays += days;
      rec.count += 1;
    }

    const cycleTimeByEstimator = new Map();
    for (const [name, rec] of cycleTimeMap) {
      cycleTimeByEstimator.set(name, {
        avgDays: rec.count > 0 ? Math.round(rec.totalDays / rec.count) : 0,
        count: rec.count,
      });
    }

    // ── Benchmarks by buildingType + workType ──
    const benchmarkMap = new Map();
    for (const e of entries) {
      if (!e.estimatedHours || e.estimatedHours <= 0) continue;
      const key = e.buildingType || e.workType || "Other";
      if (!benchmarkMap.has(key)) benchmarkMap.set(key, { hours: [], count: 0 });
      const rec = benchmarkMap.get(key);
      rec.hours.push(e.estimatedHours);
      rec.count += 1;
    }

    const hoursBenchmarks = new Map();
    for (const [key, rec] of benchmarkMap) {
      if (rec.count < 2) continue; // need at least 2 data points
      const sorted = [...rec.hours].sort((a, b) => a - b);
      const avg = Math.round(rec.hours.reduce((s, h) => s + h, 0) / rec.count);
      const median = sorted[Math.floor(sorted.length / 2)];
      hoursBenchmarks.set(key, { avg, median, count: rec.count });
    }

    return {
      accuracyByEstimator,
      weeklyVelocity,
      cycleTimeByEstimator,
      hoursBenchmarks,
      totalCompleted: withActual.length,
    };
  }, [estimatesIndex, activeCompanyId]);
}
