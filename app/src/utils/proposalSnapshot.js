// ============================================================
// Living Proposal — Snapshot Builder
// Collects current estimate state into the JSONB shape
// needed for living_proposal_versions.snapshot_data
// ============================================================

import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useAlternatesStore } from "@/stores/alternatesStore";

/**
 * Build a frozen snapshot of the current estimate for publishing.
 * Returns { snapshotData, grandTotal, directCost, divisionTotals }
 */
export function buildProposalSnapshot() {
  const items = useItemsStore.getState().items;
  const totals = useItemsStore.getState().getTotals();
  const project = useProjectStore.getState();
  const est = useEstimatesStore.getState();
  const activeId = est.activeEstimateId;
  const entry = (est.estimatesIndex || []).find(e => e.id === activeId);
  const alternates = useAlternatesStore.getState().alternates || [];

  // Build division totals
  const divisionTotals = {};
  items.forEach(it => {
    const q = parseFloat(it.quantity) || 0;
    const div = it.division || "Unassigned";
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
  });

  // Strip heavy fields from items (takeoff references, render metadata)
  const cleanItems = items.map(it => ({
    id: it.id,
    description: it.description,
    division: it.division,
    csiCode: it.csiCode,
    trade: it.trade,
    directive: it.directive,
    quantity: it.quantity,
    unit: it.unit,
    material: it.material,
    labor: it.labor,
    equipment: it.equipment,
    subcontractor: it.subcontractor,
    notes: it.notes,
    subItems: it.subItems?.map(si => ({
      id: si.id,
      description: si.description,
      quantity: si.quantity,
      unit: si.unit,
      material: si.material,
      labor: si.labor,
      equipment: si.equipment,
      subcontractor: si.subcontractor,
    })),
  }));

  const snapshotData = {
    items: cleanItems,
    markup: entry?.markup || {},
    markupOrder: entry?.markupOrder || [],
    customMarkups: entry?.customMarkups || [],
    alternates: alternates.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      amount: a.amount,
      type: a.type,
    })),
    exclusions: entry?.exclusions || [],
    clarifications: entry?.clarifications || [],
    project: {
      name: project.name,
      address: project.address,
      city: project.city,
      state: project.state,
      zip: project.zip,
      owner: project.owner,
      architect: project.architect,
      bidDate: project.bidDate,
      jobType: project.jobType,
      squareFeet: project.squareFeet,
    },
    grandTotal: totals.grand,
    directCost: totals.direct,
    materialTotal: totals.material,
    laborTotal: totals.labor,
    equipmentTotal: totals.equipment,
    subTotal: totals.sub,
    markupTotal: totals.grand - totals.direct,
    itemCount: items.length,
  };

  return {
    snapshotData,
    grandTotal: totals.grand,
    directCost: totals.direct,
    divisionTotals,
  };
}
