// scheduleEngine.js — Pure scheduling logic: activity generation, CPM, Takt
// No React dependencies — reads data passed as arguments

import { uid } from '@/utils/format';
import { TRADE_GROUPINGS, TRADE_MAP } from '@/constants/tradeGroupings';
import { TRADE_SCHEDULE_DEFAULTS } from '@/constants/productivityRates';
import { getTradeColor } from '@/utils/geometryBuilder';

// ── Generate activities from estimate items ─────────────────
export function generateActivities(items, tradeOverrides = {}) {
  // Group items by trade key, sum labor costs
  const byTrade = {};

  items.forEach(item => {
    const tradeKey = item.trade || 'unassigned';
    if (!byTrade[tradeKey]) {
      byTrade[tradeKey] = { laborCost: 0, materialCost: 0, totalCost: 0, itemCount: 0 };
    }
    const qty = parseFloat(item.quantity) || 0;
    const mat = parseFloat(item.material) || 0;
    const lab = parseFloat(item.labor) || 0;
    const equip = parseFloat(item.equipment) || 0;
    const sub = parseFloat(item.subcontractor) || 0;

    byTrade[tradeKey].laborCost += qty * lab;
    byTrade[tradeKey].materialCost += qty * mat;
    byTrade[tradeKey].totalCost += qty * (mat + lab + equip + sub);
    byTrade[tradeKey].itemCount += 1;
  });

  // Build activities sorted by trade order
  const activities = [];

  TRADE_GROUPINGS.forEach(tg => {
    const data = byTrade[tg.key];
    if (!data || data.totalCost === 0) return; // skip empty trades

    const defaults = TRADE_SCHEDULE_DEFAULTS[tg.key] || { crewSize: 3, dailyRate: 600, parallelGroup: null, lag: 0 };
    const overrides = tradeOverrides[tg.key] || {};

    const crewSize = overrides.crewSize || defaults.crewSize;
    const dailyRate = overrides.dailyRate || defaults.dailyRate;
    const crewDailyCost = crewSize * dailyRate;

    // Duration from labor cost, minimum 1 day
    const computedDuration = Math.max(1, Math.ceil(data.laborCost / crewDailyCost));
    const duration = overrides.duration || computedDuration;

    activities.push({
      id: uid(),
      tradeKey: tg.key,
      label: tg.label,
      sortOrder: tg.sort,
      laborCost: data.laborCost,
      materialCost: data.materialCost,
      totalCost: data.totalCost,
      itemCount: data.itemCount,
      duration,
      crewSize,
      dailyRate,
      parallelGroup: defaults.parallelGroup,
      lag: overrides.lag !== undefined ? overrides.lag : defaults.lag,
      color: getTradeColor(tg.key),
      // CPM fields — computed by computeCPM()
      predecessors: [],
      predecessorType: "FS",
      earlyStart: 0,
      earlyFinish: 0,
      lateStart: 0,
      lateFinish: 0,
      totalFloat: 0,
      isCritical: false,
    });
  });

  return activities;
}

// ── Build dependency links ──────────────────────────────────
export function buildDependencies(activities) {
  if (activities.length === 0) return activities;

  const parallelGroupLeaders = {}; // { groupName: activityId }
  let lastSequentialId = null;

  activities.forEach((act, i) => {
    if (act.parallelGroup) {
      if (!parallelGroupLeaders[act.parallelGroup]) {
        // First in parallel group: depends on previous sequential activity
        parallelGroupLeaders[act.parallelGroup] = act.id;
        if (lastSequentialId) {
          act.predecessors = [lastSequentialId];
          act.predecessorType = "FS";
        }
      } else {
        // Subsequent in group: start-to-start with group leader
        act.predecessors = [parallelGroupLeaders[act.parallelGroup]];
        act.predecessorType = "SS";
      }
    } else {
      // Sequential: depends on previous activity (or last parallel group's longest)
      if (lastSequentialId) {
        act.predecessors = [lastSequentialId];
        act.predecessorType = "FS";
      }
      lastSequentialId = act.id;
    }

    // After a parallel group ends, the next sequential task must wait for ALL in group
    if (!act.parallelGroup && i > 0) {
      // Find any parallel group that just ended (all its members are before this index)
      const prevGroups = {};
      for (let j = 0; j < i; j++) {
        const prev = activities[j];
        if (prev.parallelGroup) {
          if (!prevGroups[prev.parallelGroup]) prevGroups[prev.parallelGroup] = [];
          prevGroups[prev.parallelGroup].push(prev.id);
        }
      }
      // If the immediate predecessor was part of a parallel group,
      // this activity should depend on ALL members of that group
      const prevAct = activities[i - 1];
      if (prevAct?.parallelGroup && prevGroups[prevAct.parallelGroup]) {
        act.predecessors = prevGroups[prevAct.parallelGroup];
        act.predecessorType = "FS";
      }
    }
  });

  return activities;
}

// ── Topological sort (Kahn's algorithm) ────────────────────
function topoSort(activities) {
  const idMap = Object.fromEntries(activities.map(a => [a.id, a]));
  const inDeg = {};
  const adj = {};
  activities.forEach(a => { inDeg[a.id] = 0; adj[a.id] = []; });

  activities.forEach(a => {
    a.predecessors.forEach(pid => {
      if (adj[pid]) {
        adj[pid].push(a.id);
        inDeg[a.id]++;
      }
    });
  });

  const queue = activities.filter(a => inDeg[a.id] === 0).map(a => a.id);
  const order = [];

  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    adj[id].forEach(sid => {
      inDeg[sid]--;
      if (inDeg[sid] === 0) queue.push(sid);
    });
  }

  return order.map(id => idMap[id]).filter(Boolean);
}

// ── Critical Path Method ────────────────────────────────────
export function computeCPM(activities) {
  if (activities.length === 0) return activities;

  const idMap = Object.fromEntries(activities.map(a => [a.id, a]));
  const sorted = topoSort(activities);

  // Forward pass
  sorted.forEach(act => {
    if (act.predecessors.length === 0) {
      act.earlyStart = 0;
    } else {
      act.earlyStart = Math.max(...act.predecessors.map(pid => {
        const pred = idMap[pid];
        if (!pred) return 0;
        if (act.predecessorType === "SS") {
          return pred.earlyStart + act.lag;
        }
        return pred.earlyFinish + act.lag;
      }));
    }
    act.earlyFinish = act.earlyStart + act.duration;
  });

  // Project end
  const projectEnd = Math.max(...activities.map(a => a.earlyFinish));

  // Build successor map for backward pass
  const successors = {};
  activities.forEach(a => { successors[a.id] = []; });
  activities.forEach(a => {
    a.predecessors.forEach(pid => {
      if (successors[pid]) {
        successors[pid].push({ id: a.id, type: a.predecessorType, lag: a.lag });
      }
    });
  });

  // Backward pass
  const reversed = [...sorted].reverse();
  reversed.forEach(act => {
    const succs = successors[act.id];
    if (succs.length === 0) {
      act.lateFinish = projectEnd;
    } else {
      act.lateFinish = Math.min(projectEnd, ...succs.map(s => {
        const succ = idMap[s.id];
        if (!succ) return projectEnd;
        if (s.type === "SS") {
          return succ.lateStart - s.lag + act.duration;
        }
        return succ.lateStart - s.lag;
      }));
    }
    act.lateStart = act.lateFinish - act.duration;
    act.totalFloat = act.lateStart - act.earlyStart;
    act.isCritical = Math.abs(act.totalFloat) < 0.5; // float ~ 0
  });

  return activities;
}

// ── Takt / Flowline data ────────────────────────────────────
export function generateTaktData(activities, zones) {
  if (!zones || zones.length === 0) zones = ["Zone 1"];

  return activities.map(act => {
    const daysPerZone = Math.max(1, Math.ceil(act.duration / zones.length));
    const segments = zones.map((zone, zIdx) => ({
      zone,
      startDay: act.earlyStart + zIdx * daysPerZone,
      endDay: act.earlyStart + (zIdx + 1) * daysPerZone,
    }));

    return {
      activityId: act.id,
      tradeKey: act.tradeKey,
      label: act.label,
      color: act.color,
      isCritical: act.isCritical,
      segments,
    };
  });
}

// ── Date utilities ──────────────────────────────────────────
export function dayToDate(dayNumber, startDate, workDaysPerWeek = 5) {
  const start = new Date(startDate + 'T00:00:00');
  if (workDaysPerWeek === 7) {
    const result = new Date(start);
    result.setDate(result.getDate() + dayNumber);
    return result;
  }
  // 5-day work week: skip weekends
  let remaining = dayNumber;
  const result = new Date(start);
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return result;
}

export function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Full pipeline ───────────────────────────────────────────
export function generateSchedule(items, tradeOverrides = {}) {
  let activities = generateActivities(items, tradeOverrides);
  activities = buildDependencies(activities);
  activities = computeCPM(activities);
  return activities;
}
