import { useMemo } from "react";
import {
  utilizationToSpeed,
  utilizationTier,
  computeRingRadii,
  nodeSize,
  distributeNodes,
} from "@/utils/fieldPhysics";

/**
 * useFieldParticles — Transform useWorkloadData output into orbital geometry.
 *
 * Input: workloadData from useWorkloadData()
 * Output: rings[], unassignedParticles[], teamUtilization
 *
 * This hook is pure computation — no side effects, no subscriptions.
 */
export function useFieldParticles(workloadData, colors, fieldRadius) {
  const { estimatorRows = [], unassignedEstimates = [], effectiveHoursPerDay = 7 } = workloadData || {};

  return useMemo(() => {
    if (!estimatorRows.length && !unassignedEstimates.length) {
      return { rings: [], unassignedParticles: [], teamUtilization: 0, pendingMoves: [] };
    }

    // ── Compute per-estimator utilization (next 5 weekdays) ──
    const today = new Date();
    const utilizationMap = new Map();

    for (const row of estimatorRows) {
      let totalHours = 0;
      let days = 0;
      // Sum hours across active estimates
      for (const est of row.estimates) {
        if (!est.workDays?.length) continue;
        const futureWorkDays = est.workDays.filter(d => d >= today.toISOString().slice(0, 10));
        totalHours += futureWorkDays.length * est.hoursPerDay;
        days = Math.max(days, futureWorkDays.length);
      }
      const capacity = Math.max(days, 5) * effectiveHoursPerDay;
      utilizationMap.set(row.name, capacity > 0 ? totalHours / capacity : 0);
    }

    // ── Build ring radii ──
    const radii = computeRingRadii(estimatorRows.length, fieldRadius);

    // ── Color tiers ──
    const tierColors = {
      calm: colors.blue || "#60A5FA",
      healthy: colors.accent || "#8B5CF6",
      warm: colors.orange || "#FF9500",
      hot: colors.red || "#FF3B30",
    };

    // ── Status colors for nodes ──
    const statusColorMap = {
      "on-track": colors.blue || "#60A5FA",
      ahead: colors.green || "#30D158",
      behind: colors.orange || "#FF9500",
      overdue: colors.red || "#FF3B30",
      conflict: colors.red || "#FF3B30",
    };

    // ── Build rings ──
    const rings = estimatorRows.map((row, i) => {
      const util = utilizationMap.get(row.name) || 0;
      const tier = utilizationTier(util);
      const angles = distributeNodes(row.estimates.length);

      const nodes = row.estimates.map((est, ni) => ({
        id: est.id,
        label: est.name || "Untitled",
        angle: angles[ni],
        size: nodeSize(est.estimatedHours || est._perPersonHours || 20),
        status: est.scheduleStatus || "on-track",
        statusColor: statusColorMap[est.scheduleStatus] || colors.accent,
        hours: est.estimatedHours || est._perPersonHours || 0,
        bidDue: est.bidDue || "",
        client: est.client || "",
        percentComplete: est.percentComplete || 0,
        isPending: false,
        collaboratorRingIdx: null,
        _teamSize: est._teamSize || 1,
      }));

      return {
        name: row.name,
        color: row.color || colors.accent,
        radius: radii[i] || fieldRadius * 0.5,
        angularVelocity: utilizationToSpeed(util),
        utilization: util,
        tier,
        statusColor: tierColors[tier],
        pending: row.pending || false,
        nodes,
      };
    });

    // ── Find collaboration tethers ──
    const estToRings = new Map();
    rings.forEach((ring, ri) => {
      ring.nodes.forEach(node => {
        if (!estToRings.has(node.id)) estToRings.set(node.id, []);
        estToRings.get(node.id).push(ri);
      });
    });
    // Mark nodes that appear on multiple rings
    for (const [estId, ringIdxs] of estToRings) {
      if (ringIdxs.length > 1) {
        for (const ri of ringIdxs) {
          const node = rings[ri].nodes.find(n => n.id === estId);
          if (node) {
            node.collaboratorRingIdx = ringIdxs.find(r => r !== ri) ?? null;
          }
        }
      }
    }

    // ── Unassigned particles ──
    const unassignedAngles = distributeNodes(unassignedEstimates.length);
    const unassignedParticles = unassignedEstimates.map((est, i) => {
      // Deterministic seed from index to avoid jumps on recompute
      const seed = (i + 1) * 2654435761; // Knuth multiplicative hash
      const seedNorm = ((seed >>> 0) % 10000) / 10000;
      return {
        id: est.id,
        label: est.name || "Untitled",
        angle: unassignedAngles[i],
        size: nodeSize(est.estimatedHours || 20),
        hours: est.estimatedHours || 0,
        bidDue: est.bidDue || "",
        drift: (seedNorm - 0.5) * 0.003,
        phase: seedNorm * Math.PI * 2,
      };
    });

    // ── Team utilization (average) ──
    const totalUtil = [...utilizationMap.values()].reduce((s, v) => s + v, 0);
    const teamUtilization = utilizationMap.size > 0 ? totalUtil / utilizationMap.size : 0;

    return { rings, unassignedParticles, teamUtilization, pendingMoves: [] };
  }, [estimatorRows, unassignedEstimates, effectiveHoursPerDay, colors, fieldRadius]);
}
