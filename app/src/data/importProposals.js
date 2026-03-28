// Proposal import — loads extracted proposal data into masterDataStore
// AND generates learning records for ROM calibration.
// Run once per version, then the data persists in IDB + cloud sync.

import { useMasterDataStore } from "@/stores/masterDataStore";
import { useScanStore } from "@/stores/scanStore";
import { generateBaselineROM, computeCalibration } from "@/utils/romEngine";
import { MONTANA_PROPOSALS } from "./montana-proposals";
import { VIOLANTE_PROPOSALS } from "./violante-proposals";

const IMPORT_KEY = "proposals-imported-montana-v3"; // v3: force reimport + calibration
const VIOLANTE_IMPORT_KEY = "proposals-imported-violante-v3";
const CALIBRATION_KEY = "proposals-calibrated-v2"; // v2: force recalibration

// ── Generate a learning record from a proposal (same logic as HistoricalProposalsPanel) ──
function generateLearningRecord(proposal) {
  const bt = proposal.jobType || proposal.buildingType || "commercial-office";
  const wt = proposal.workType || "";
  const sf = proposal.projectSF || 0;
  if (!sf || sf <= 0) return null;

  // Only generate if we have division data
  const divEntries = Object.entries(proposal.divisions || {}).filter(([, v]) => parseFloat(v) > 0);
  if (divEntries.length === 0) return null;

  try {
    const romPrediction = generateBaselineROM(sf, bt, wt, {});
    const actuals = { divisions: {} };
    divEntries.forEach(([div, cost]) => {
      actuals.divisions[div] = Math.round(parseFloat(cost));
    });

    const calibration = computeCalibration(romPrediction, actuals);

    // Compute markup patterns if available
    const mkps = proposal.markups || [];
    const divTotal = Object.values(actuals.divisions).reduce((s, v) => s + v, 0);
    const mkpTotal = mkps.reduce((s, m) => s + (m.calculatedAmount || 0), 0);

    return {
      source: "historical-proposal",
      proposalId: proposal.id,
      proposalName: proposal.projectName || proposal.name,
      projectSF: sf,
      buildingType: bt,
      workType: wt,
      jobType: bt,
      laborType: proposal.laborType || "",
      zipCode: proposal.zipCode || "",
      stories: proposal.stories || 0,
      proposalType: proposal.proposalType || "gc", // GC vs Sub distinction
      normalizedToYear: new Date().getFullYear(),
      romPrediction: {
        divisions: Object.fromEntries(
          Object.entries(romPrediction.divisions || {}).map(([div, data]) => [div, { mid: data?.total?.mid || 0 }]),
        ),
      },
      actuals,
      calibration,
      markupPatterns: mkpTotal > 0 ? {
        markupTotal: mkpTotal,
        markupPct: divTotal > 0 ? Math.round((mkpTotal / divTotal) * 10000) / 100 : 0,
        items: mkps.map(m => ({ label: m.label, pct: m.type === "percent" ? m.inputValue : null, amount: m.calculatedAmount })),
      } : null,
    };
  } catch (err) {
    console.warn(`[proposals] Learning record generation failed for ${proposal.projectName}:`, err.message);
    return null;
  }
}

export function importMontanaProposals() {
  if (localStorage.getItem(IMPORT_KEY)) return false;

  const store = useMasterDataStore.getState();
  const existing = store.masterData?.historicalProposals || [];
  const existingNames = new Set(existing.map(p => (p.projectName || p.name || "").toLowerCase()));

  let imported = 0;
  for (const p of MONTANA_PROPOSALS) {
    if (existingNames.has((p.projectName || "").toLowerCase())) continue;
    store.addHistoricalProposal({
      projectName: p.projectName, client: p.client, architect: p.architect,
      totalCost: p.totalCost, proposalCost: p.totalCost, projectSF: p.projectSF,
      jobType: p.jobType, workType: p.workType, laborType: p.laborType,
      outcome: p.outcome, date: p.date, zipCode: p.zipCode, address: p.address,
      divisions: p.divisions, source: p.source, sourceFileName: p.sourceFileName,
      proposalType: "gc",
      gcCompany: "Anonymous GC-1", // Anonymized
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
  const existingNames = new Set(existing.map(p => (p.projectName || p.name || "").toLowerCase()));

  let imported = 0;
  for (const p of VIOLANTE_PROPOSALS) {
    if (existingNames.has((p.projectName || "").toLowerCase())) continue;
    store.addHistoricalProposal({
      projectName: p.projectName, client: p.client,
      totalCost: p.totalCost, proposalCost: p.totalCost, projectSF: p.projectSF,
      jobType: p.jobType, laborType: p.laborType, outcome: p.outcome,
      location: p.location, divisions: p.divisions, tradeBundles: p.tradeBundles,
      proposalType: p.proposalType || "sub", notes: p.notes,
      source: "violante-import",
      gcCompany: p.proposalType === "gc" ? "Anonymous Sub-GC" : (p.client || "Unknown"),
      subContractor: p.proposalType === "sub" ? "Anonymous Sub-1" : null, // Anonymized
    });
    imported++;
  }

  localStorage.setItem(VIOLANTE_IMPORT_KEY, new Date().toISOString());
  console.log(`[proposals] Imported ${imported} Violante proposals`);
  return imported;
}

// ── Generate learning records from ALL imported proposals ──
// This is the critical step that was missing — without this, proposals don't calibrate the ROM.
export async function calibrateFromImportedProposals() {
  // Check if already calibrated — BUT if 0 learning records exist, force recalibration
  const scanStore = useScanStore.getState();
  const existingRecords = scanStore.learningRecords || [];
  if (localStorage.getItem(CALIBRATION_KEY) && existingRecords.length > 0) return false;

  const store = useMasterDataStore.getState();
  const proposals = store.masterData?.historicalProposals || [];

  if (proposals.length === 0) {
    console.log("[calibrate] No proposals to calibrate from");
    return false;
  }

  let calibrated = 0;
  let skipped = 0;

  for (const proposal of proposals) {
    const record = generateLearningRecord(proposal);
    if (record) {
      await scanStore.addLearningRecord(record);
      calibrated++;
    } else {
      skipped++;
    }
  }

  localStorage.setItem(CALIBRATION_KEY, new Date().toISOString());
  console.log(`[calibrate] Generated ${calibrated} learning records, skipped ${skipped} (missing SF or divisions)`);
  console.log(`[calibrate] ROM engine now calibrated from ${calibrated} real proposals`);
  return calibrated;
}
