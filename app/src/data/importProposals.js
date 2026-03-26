// One-time proposal import — loads extracted proposal data into masterDataStore
// Run once, then the data persists in IDB + cloud sync

import { useMasterDataStore } from "@/stores/masterDataStore";
import { MONTANA_PROPOSALS } from "./montana-proposals";
import { VIOLANTE_PROPOSALS } from "./violante-proposals";

const IMPORT_KEY = "proposals-imported-montana-v1";
const VIOLANTE_IMPORT_KEY = "proposals-imported-violante-v1";

export function importMontanaProposals() {
  // Only run once
  if (localStorage.getItem(IMPORT_KEY)) return false;

  const store = useMasterDataStore.getState();
  const existing = store.masterData?.historicalProposals || [];
  const existingNames = new Set(existing.map(p => p.projectName || p.name));

  let imported = 0;
  for (const p of MONTANA_PROPOSALS) {
    // Skip if already imported
    if (existingNames.has(p.projectName)) continue;

    store.addHistoricalProposal({
      projectName: p.projectName,
      client: p.client,
      architect: p.architect,
      totalCost: p.totalCost,
      proposalCost: p.totalCost,
      projectSF: p.projectSF,
      jobType: p.jobType,
      workType: p.workType,
      laborType: p.laborType,
      outcome: p.outcome,
      date: p.date,
      zipCode: p.zipCode,
      address: p.address,
      divisions: p.divisions,
      source: p.source,
      sourceFileName: p.sourceFileName,
      gcCompany: "Montana Contracting Corp",
    });
    imported++;
  }

  localStorage.setItem(IMPORT_KEY, new Date().toISOString());
  console.log(`[proposals] Imported ${imported} Montana proposals`);
  return imported;
}

export function importViolanteProposals() {
  if (localStorage.getItem(VIOLANTE_IMPORT_KEY)) return false;

  const store = useMasterDataStore.getState();
  const existing = store.masterData?.historicalProposals || [];
  const existingNames = new Set(existing.map(p => p.projectName || p.name));

  let imported = 0;
  for (const p of VIOLANTE_PROPOSALS) {
    if (existingNames.has(p.projectName)) continue;

    store.addHistoricalProposal({
      projectName: p.projectName,
      client: p.client,
      totalCost: p.totalCost,
      proposalCost: p.totalCost,
      projectSF: p.projectSF,
      jobType: p.jobType,
      laborType: p.laborType,
      outcome: p.outcome,
      location: p.location,
      divisions: p.divisions,
      tradeBundles: p.tradeBundles,
      proposalType: p.proposalType,
      notes: p.notes,
      source: "violante-import",
      gcCompany: p.proposalType === "gc" ? "Violante & Sons (GC)" : (p.client || "Unknown"),
      subContractor: p.proposalType === "sub" ? "Violante & Sons" : null,
    });
    imported++;
  }

  localStorage.setItem(VIOLANTE_IMPORT_KEY, new Date().toISOString());
  console.log(`[proposals] Imported ${imported} Violante proposals`);
  return imported;
}
