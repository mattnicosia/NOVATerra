import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { uid, nowStr } from '@/utils/format';

const SNAPSHOTS_KEY_PREFIX = "bldg-snapshots-";

/**
 * Snapshots Store — Point-in-time captures of estimate state.
 * Enables temporal views (how an estimate evolved) and living comparisons.
 *
 * Snapshot shape:
 * {
 *   id, estimateId, timestamp, label, trigger,
 *   grandTotal, direct, itemCount,
 *   divisionTotals: { "03 - Concrete": { material, labor, equipment, sub, total } },
 *   tradeTotals:    { "concrete": total },
 *   markupTotal,
 *   material, labor, equipment, sub
 * }
 */
export const useSnapshotsStore = create((set, get) => ({
  // keyed by estimateId
  snapshots: {},

  // ── Load ──────────────────────────────────────────────────
  loadSnapshots: async (estimateId) => {
    try {
      const raw = await storage.get(`${SNAPSHOTS_KEY_PREFIX}${estimateId}`);
      if (raw) {
        const parsed = JSON.parse(raw.value);
        set(s => ({
          snapshots: { ...s.snapshots, [estimateId]: parsed },
        }));
      }
    } catch (e) {
      console.error("Failed to load snapshots:", e);
    }
  },

  // ── Save ──────────────────────────────────────────────────
  _persist: async (estimateId) => {
    const list = get().snapshots[estimateId] || [];
    await storage.set(
      `${SNAPSHOTS_KEY_PREFIX}${estimateId}`,
      JSON.stringify(list)
    );
  },

  // ── Capture a snapshot ────────────────────────────────────
  captureSnapshot: (estimateId, items, totals, markup, markupOrder, customMarkups, project, { label, trigger } = {}) => {
    // Build division-level totals
    const divisionTotals = {};
    const tradeTotals = {};
    items.forEach(it => {
      const q = parseFloat(it.quantity) || 0;
      const div = it.division || "Unassigned";
      const trade = it.trade || "unassigned";

      if (!divisionTotals[div]) divisionTotals[div] = { material: 0, labor: 0, equipment: 0, sub: 0, total: 0, count: 0 };
      const m = q * (parseFloat(it.material) || 0);
      const l = q * (parseFloat(it.labor) || 0);
      const e = q * (parseFloat(it.equipment) || 0);
      const s = q * (parseFloat(it.subcontractor) || 0);
      divisionTotals[div].material += m;
      divisionTotals[div].labor += l;
      divisionTotals[div].equipment += e;
      divisionTotals[div].sub += s;
      divisionTotals[div].total += m + l + e + s;
      divisionTotals[div].count += 1;

      if (!tradeTotals[trade]) tradeTotals[trade] = 0;
      tradeTotals[trade] += m + l + e + s;
    });

    const snap = {
      id: uid(),
      estimateId,
      timestamp: Date.now(),
      dateStr: nowStr(),
      label: label || "Auto",
      trigger: trigger || "auto",
      grandTotal: totals.grand,
      direct: totals.direct,
      material: totals.material,
      labor: totals.labor,
      equipment: totals.equipment,
      sub: totals.sub,
      markupTotal: totals.grand - totals.direct,
      itemCount: items.length,
      divisionTotals,
      tradeTotals,
      projectName: project?.name || "",
    };

    set(s => {
      const prev = s.snapshots[estimateId] || [];
      // Keep max 100 snapshots per estimate
      const next = [...prev, snap].slice(-100);
      return { snapshots: { ...s.snapshots, [estimateId]: next } };
    });

    get()._persist(estimateId);
    return snap;
  },

  // ── Delete a snapshot ─────────────────────────────────────
  deleteSnapshot: (estimateId, snapId) => {
    set(s => {
      const prev = s.snapshots[estimateId] || [];
      return {
        snapshots: { ...s.snapshots, [estimateId]: prev.filter(sn => sn.id !== snapId) },
      };
    });
    get()._persist(estimateId);
  },

  // ── Rename a snapshot ─────────────────────────────────────
  renameSnapshot: (estimateId, snapId, newLabel) => {
    set(s => {
      const prev = s.snapshots[estimateId] || [];
      return {
        snapshots: {
          ...s.snapshots,
          [estimateId]: prev.map(sn => sn.id === snapId ? { ...sn, label: newLabel } : sn),
        },
      };
    });
    get()._persist(estimateId);
  },

  // ── Get snapshots for an estimate ─────────────────────────
  getSnapshots: (estimateId) => {
    return get().snapshots[estimateId] || [];
  },

  // ── Compute delta between two snapshots ───────────────────
  computeDelta: (snapA, snapB) => {
    if (!snapA || !snapB) return null;
    const delta = {
      grandTotal: snapB.grandTotal - snapA.grandTotal,
      direct: snapB.direct - snapA.direct,
      material: snapB.material - snapA.material,
      labor: snapB.labor - snapA.labor,
      equipment: snapB.equipment - snapA.equipment,
      sub: snapB.sub - snapA.sub,
      markupTotal: snapB.markupTotal - snapA.markupTotal,
      itemCount: snapB.itemCount - snapA.itemCount,
      grandTotalPct: snapA.grandTotal ? ((snapB.grandTotal - snapA.grandTotal) / snapA.grandTotal * 100) : 0,
      directPct: snapA.direct ? ((snapB.direct - snapA.direct) / snapA.direct * 100) : 0,
    };

    // Division-level delta
    const allDivs = new Set([
      ...Object.keys(snapA.divisionTotals || {}),
      ...Object.keys(snapB.divisionTotals || {}),
    ]);
    delta.divisions = {};
    allDivs.forEach(div => {
      const a = (snapA.divisionTotals || {})[div] || { total: 0 };
      const b = (snapB.divisionTotals || {})[div] || { total: 0 };
      delta.divisions[div] = {
        totalDelta: b.total - a.total,
        totalA: a.total,
        totalB: b.total,
        pct: a.total ? ((b.total - a.total) / a.total * 100) : (b.total ? 100 : 0),
      };
    });

    // Trade-level delta
    const allTrades = new Set([
      ...Object.keys(snapA.tradeTotals || {}),
      ...Object.keys(snapB.tradeTotals || {}),
    ]);
    delta.trades = {};
    allTrades.forEach(trade => {
      const a = (snapA.tradeTotals || {})[trade] || 0;
      const b = (snapB.tradeTotals || {})[trade] || 0;
      delta.trades[trade] = {
        totalDelta: b - a,
        totalA: a,
        totalB: b,
        pct: a ? ((b - a) / a * 100) : (b ? 100 : 0),
      };
    });

    return delta;
  },

  // ── Build "live now" snapshot from current state ──────────
  buildLiveSnapshot: (estimateId, items, totals, project) => {
    const divisionTotals = {};
    const tradeTotals = {};
    items.forEach(it => {
      const q = parseFloat(it.quantity) || 0;
      const div = it.division || "Unassigned";
      const trade = it.trade || "unassigned";

      if (!divisionTotals[div]) divisionTotals[div] = { material: 0, labor: 0, equipment: 0, sub: 0, total: 0, count: 0 };
      const m = q * (parseFloat(it.material) || 0);
      const l = q * (parseFloat(it.labor) || 0);
      const e = q * (parseFloat(it.equipment) || 0);
      const s = q * (parseFloat(it.subcontractor) || 0);
      divisionTotals[div].material += m;
      divisionTotals[div].labor += l;
      divisionTotals[div].equipment += e;
      divisionTotals[div].sub += s;
      divisionTotals[div].total += m + l + e + s;
      divisionTotals[div].count += 1;

      if (!tradeTotals[trade]) tradeTotals[trade] = 0;
      tradeTotals[trade] += m + l + e + s;
    });

    return {
      id: "_live",
      estimateId,
      timestamp: Date.now(),
      dateStr: "Now",
      label: "Current",
      trigger: "live",
      grandTotal: totals.grand,
      direct: totals.direct,
      material: totals.material,
      labor: totals.labor,
      equipment: totals.equipment,
      sub: totals.sub,
      markupTotal: totals.grand - totals.direct,
      itemCount: items.length,
      divisionTotals,
      tradeTotals,
      projectName: project?.name || "",
    };
  },
}));
