// Proposal import — loads extracted proposal data into masterDataStore
// AND generates learning records for ROM calibration.
// Run once per version, then the data persists in IDB + cloud sync.

import { useMasterDataStore } from "@/stores/masterDataStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { generateBaselineROM, computeCalibration } from "@/utils/romEngine";
import { MONTANA_PROPOSALS } from "./montana-proposals";
import { VIOLANTE_PROPOSALS } from "./violante-proposals";
import { AREA_BUILDERS_PROPOSALS } from "./area-builders-proposals";
import { EXTRACTED_PROPOSALS } from "./extracted-proposals";

const IMPORT_KEY = "proposals-imported-montana-v9"; // v9: added 7 non-residential proposals (Apr 2026)
const VIOLANTE_IMPORT_KEY = "proposals-imported-violante-v8"; // v8: all proposals now have ZIP codes
const AREA_BUILDERS_IMPORT_KEY = "proposals-imported-area-builders-v1";
const EXTRACTED_IMPORT_KEY = "proposals-imported-extracted-v1"; // v1: 160 batch-extracted GC proposals (Apr 2026)
const CALIBRATION_KEY = "proposals-calibrated-v11"; // v11: recalibrate with 160 batch-extracted proposals

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

  // v4: Remove ALL old Montana imports (any version) and reimport fresh with correct data
  const existing = store.masterData?.historicalProposals || [];
  const oldMontana = existing.filter(p => p.source === "montana-import" || p.gcCompany === "Montana Contracting Corp" || p.gcCompany === "Anonymous GC-1");
  if (oldMontana.length > 0) {
    console.log(`[proposals] Removing ${oldMontana.length} old Montana imports for clean reimport`);
    const cleaned = existing.filter(p => !oldMontana.includes(p));
    store.setMasterData({ ...store.masterData, historicalProposals: cleaned });
  }

  const currentExisting = store.masterData?.historicalProposals || [];
  // Only dedup against OTHER batch imports from same source — not PDF uploads
  const batchImportNames = new Set(
    currentExisting
      .filter(p => p.source === "montana-import")
      .map(p => (p.projectName || p.name || "").toLowerCase())
  );

  let imported = 0;
  for (const p of MONTANA_PROPOSALS) {
    if (batchImportNames.has((p.projectName || "").toLowerCase())) continue;
    store.addHistoricalProposal({
      projectName: p.projectName, client: p.client, architect: p.architect,
      totalCost: p.totalCost, proposalCost: p.totalCost, projectSF: p.projectSF,
      jobType: p.jobType, workType: p.workType, laborType: p.laborType,
      outcome: p.outcome, date: p.date, zipCode: p.zipCode, address: p.address,
      divisions: p.divisions, source: p.source, sourceFileName: p.sourceFileName,
      proposalType: p.proposalType || "gc", // Montana = always GC
      gcCompany: "Anonymous GC-1", // Anonymized
    });
    imported++;
  }

  localStorage.setItem(IMPORT_KEY, new Date().toISOString());
  console.log(`[proposals] Imported ${imported} Montana proposals (all GC)`);
  return imported;
}

export function importViolanteProposals() {
  if (localStorage.getItem(VIOLANTE_IMPORT_KEY)) return false;

  const store = useMasterDataStore.getState();
  const existing = store.masterData?.historicalProposals || [];

  // Remove old Violante imports that might be blocking reimport
  const oldViolante = existing.filter(p => (p.source === "violante-import" || p.subContractor === "Violante & Sons" || p.subContractor === "Anonymous Sub-1"));
  if (oldViolante.length > 0) {
    console.log(`[proposals] Removing ${oldViolante.length} old Violante imports for reimport`);
    const cleaned = existing.filter(p => !oldViolante.includes(p));
    store.setMasterData({ ...store.masterData, historicalProposals: cleaned });
  }

  const currentExisting = store.masterData?.historicalProposals || [];
  // Only dedup against OTHER batch imports from same source — not PDF uploads
  const batchImportNames = new Set(
    currentExisting
      .filter(p => p.source === "violante-import")
      .map(p => (p.projectName || p.name || "").toLowerCase())
  );

  let imported = 0;
  for (const p of VIOLANTE_PROPOSALS) {
    if (batchImportNames.has((p.projectName || "").toLowerCase())) continue;
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

export function importAreaBuildersProposals() {
  if (localStorage.getItem(AREA_BUILDERS_IMPORT_KEY)) return false;

  const store = useMasterDataStore.getState();
  const existing = store.masterData?.historicalProposals || [];

  // Remove old Area Builders imports for clean reimport
  const oldAB = existing.filter(p => p.source === "area-builders-import" || p.gcCompany === "Anonymous GC-3");
  if (oldAB.length > 0) {
    console.log(`[proposals] Removing ${oldAB.length} old Area Builders imports for clean reimport`);
    const cleaned = existing.filter(p => !oldAB.includes(p));
    store.setMasterData({ ...store.masterData, historicalProposals: cleaned });
  }

  const currentExisting = store.masterData?.historicalProposals || [];
  const batchImportNames = new Set(
    currentExisting
      .filter(p => p.source === "area-builders-import")
      .map(p => (p.projectName || p.name || "").toLowerCase())
  );

  let imported = 0;
  for (const p of AREA_BUILDERS_PROPOSALS) {
    if (batchImportNames.has((p.projectName || "").toLowerCase())) continue;
    store.addHistoricalProposal({
      projectName: p.projectName, client: p.client, architect: p.architect,
      totalCost: p.totalCost, proposalCost: p.totalCost, projectSF: p.projectSF,
      jobType: p.jobType, workType: p.workType, laborType: p.laborType,
      outcome: p.outcome, date: p.date, zipCode: p.zipCode, address: p.address,
      divisions: p.divisions, source: p.source, sourceFileName: p.sourceFileName,
      proposalType: "gc",
      gcCompany: "Anonymous GC-3", // Anonymized
    });
    imported++;
  }

  localStorage.setItem(AREA_BUILDERS_IMPORT_KEY, new Date().toISOString());
  console.log(`[proposals] Imported ${imported} Area Builders proposals (all GC, open shop NYC)`);
  return imported;
}

// ── Import 160 batch-extracted GC proposals (from PDF extraction pipeline) ──
export function importExtractedProposals() {
  if (localStorage.getItem(EXTRACTED_IMPORT_KEY)) return false;

  const store = useMasterDataStore.getState();
  const existing = store.masterData?.historicalProposals || [];

  // Remove old extracted imports for clean reimport
  const oldExtracted = existing.filter(p => p.source === "extracted-import");
  if (oldExtracted.length > 0) {
    console.log(`[proposals] Removing ${oldExtracted.length} old extracted imports for clean reimport`);
    const cleaned = existing.filter(p => !oldExtracted.includes(p));
    store.setMasterData({ ...store.masterData, historicalProposals: cleaned });
  }

  const currentExisting = store.masterData?.historicalProposals || [];
  const batchImportNames = new Set(
    currentExisting
      .filter(p => p.source === "extracted-import")
      .map(p => (p.projectName || p.name || "").toLowerCase())
  );

  let imported = 0;
  let skipped = 0;
  for (const p of EXTRACTED_PROPOSALS) {
    if (batchImportNames.has((p.projectName || "").toLowerCase())) continue;

    // Skip low-quality: zero cost, empty divisions, or low confidence with <3 divisions
    if (!p.totalCost || p.totalCost <= 0) { skipped++; continue; }
    const divCount = Object.keys(p.divisions || {}).length;
    if (divCount === 0) { skipped++; continue; }
    if (p.extractionConfidence === "low" && divCount < 3) { skipped++; continue; }

    store.addHistoricalProposal({
      projectName: p.projectName, client: p.client, architect: p.architect,
      totalCost: p.totalCost, proposalCost: p.totalCost, projectSF: p.projectSF,
      jobType: p.jobType, workType: p.workType, laborType: p.laborType,
      date: p.date, address: p.address,
      divisions: p.divisions, source: "extracted-import",
      sourceFileName: p.sourceFileName,
      proposalType: "gc", // All are GC proposals
      gcCompany: "Anonymous GC-2", // Anonymized
      extractionConfidence: p.extractionConfidence,
    });
    imported++;
  }

  localStorage.setItem(EXTRACTED_IMPORT_KEY, new Date().toISOString());
  console.log(`[proposals] Imported ${imported} batch-extracted proposals, skipped ${skipped} (quality filter)`);
  return imported;
}

// ── Import batch-parsed proposals from ingestion_runs into masterData ──
export async function importBatchParsedProposals() {
  const BATCH_KEY = "proposals-imported-batch-v1";
  if (localStorage.getItem(BATCH_KEY)) return false;

  // Dynamic import to avoid circular deps
  const { supabase } = await import("@/utils/supabase");

  const { data: runs, error } = await supabase
    .from("ingestion_runs")
    .select("*")
    .eq("parse_status", "parsed");

  if (error || !runs?.length) {
    console.log(`[proposals] No batch-parsed runs to import (${error?.message || "0 runs"})`);
    return 0;
  }

  const store = useMasterDataStore.getState();
  const existing = store.masterData?.historicalProposals || [];
  const existingFileIds = new Set(
    existing.filter(p => p.source === "batch-import").map(p => p.dropboxFileId),
  );

  let imported = 0;
  for (const run of runs) {
    if (existingFileIds.has(run.dropbox_file_id)) continue;

    const pd = run.parsed_data || {};
    const cl = run.classification || {};

    // Build divisions from line items
    const divisions = {};
    for (const item of pd.lineItems || []) {
      if (item.csiCode && item.amount > 0) {
        divisions[item.csiCode] = (divisions[item.csiCode] || 0) + Math.round(item.amount);
      }
    }

    // Map folder_type to proposalType
    const proposalType = run.folder_type === "gc" ? "gc" :
      run.folder_type === "vendor" ? "vendor" : "sub";

    store.addHistoricalProposal({
      projectName: cl.projectName || run.filename.replace(/\.[^.]+$/, ""),
      client: cl.companyName || run.company_name || "Unknown",
      totalCost: pd.totalBid || run.total_bid || 0,
      proposalCost: pd.totalBid || run.total_bid || 0,
      divisions,
      proposalType,
      source: "batch-import",
      sourceFileName: run.filename,
      dropboxFileId: run.dropbox_file_id,
      dropboxPath: run.dropbox_path,
      lineItems: pd.lineItems || [],
      inclusions: pd.inclusions || [],
      exclusions: pd.exclusions || [],
      alternates: pd.alternates || [],
      subcontractorName: pd.subcontractorName || null,
      confidence: pd.confidence || 0,
      gcCompany: proposalType === "gc" ? (cl.companyName || "Unknown GC") : null,
      subContractor: proposalType === "sub" ? (pd.subcontractorName || cl.companyName || "Unknown Sub") : null,
    });
    imported++;
  }

  if (imported > 0) {
    localStorage.setItem(BATCH_KEY, new Date().toISOString());
    console.log(`[proposals] Imported ${imported} batch-parsed proposals into CORE`);
  }
  return imported;
}

// ── Generate learning records from ALL imported proposals ──
// This is the critical step that was missing — without this, proposals don't calibrate the ROM.
export async function calibrateFromImportedProposals() {
  // Check if already calibrated — BUT if 0 learning records exist, force recalibration
  const scanStore = useDrawingPipelineStore.getState();
  const existingRecords = scanStore.learningRecords || [];
  if (localStorage.getItem(CALIBRATION_KEY) && existingRecords.length > 0) return false;

  const store = useMasterDataStore.getState();
  let proposals = store.masterData?.historicalProposals || [];

  // Fix-up: PDF-uploaded proposals without proposalType default to "gc" (they're GC proposals)
  let fixed = 0;
  proposals = proposals.map(p => {
    if (!p.proposalType || p.proposalType === "") {
      fixed++;
      return { ...p, proposalType: "gc" };
    }
    // Fix Montana proposals that were incorrectly tagged as "sub"
    if (p.source === "pdf" && p.proposalType === "sub" && !p.subContractor) {
      fixed++;
      return { ...p, proposalType: "gc" };
    }
    return p;
  });
  if (fixed > 0) {
    console.log(`[calibrate] Fixed proposalType on ${fixed} proposals (set to GC)`);
    store.setMasterData({ ...store.masterData, historicalProposals: proposals });
  }

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
