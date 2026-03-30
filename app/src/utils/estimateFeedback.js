// estimateFeedback.js — Closes the autonomous improvement loop.
// When an estimate reaches "Submitted", "Won", or "Lost" status,
// this generates a learning record from the final bid values.
// The learning record feeds into scanStore's calibration pipeline,
// so every future ROM for the same building type is more accurate.
//
// Pipeline: final bid → division totals → computeCalibration() → addLearningRecord()
// Reuses the exact same infrastructure as historical proposal imports.

import { useEstimatesStore } from "@/stores/estimatesStore";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useScanStore } from "@/stores/scanStore";
import { generateBaselineROM, computeCalibration } from "@/utils/romEngine";
import { normalizeCSI } from "@/utils/scopeGapEngine";
import { validateProposal } from "@/utils/proposalValidation";

/**
 * Generate a learning record from a completed estimate's final bid values.
 * This is the feedback loop: ROM prediction → estimator's final numbers → calibration delta.
 *
 * @param {string} estimateId — the estimate to generate feedback from
 * @returns {Object|null} — the learning record, or null if validation fails
 */
export async function generateLearningFromEstimate(estimateId) {
  // ── 1. Read project metadata ──
  const project = useProjectStore.getState().project;
  const { jobType, workType, laborType, zipCode, projectSF } = project;
  const sf = parseFloat(projectSF);

  if (!sf || sf < 100) {
    console.warn(`[NOVA Feedback] Skipped: no project SF (${sf})`);
    return null;
  }
  if (!jobType) {
    console.warn(`[NOVA Feedback] Skipped: no building type set`);
    return null;
  }

  // ── 2. Deduplication guard ──
  const existingRecords = useScanStore.getState().learningRecords || [];
  if (existingRecords.some(r => r.source === "completed-estimate" && r.estimateId === estimateId)) {
    console.log(`[NOVA Feedback] Already generated for ${estimateId.slice(0, 8)}, skipping`);
    return null;
  }

  // ── 3. Compute division totals from items ──
  const items = useItemsStore.getState().items || [];
  const divisionTotals = {};
  let totalCost = 0;

  items.forEach(item => {
    const div = normalizeCSI(item.code || item.division);
    if (!div) return;
    const itemTotal =
      (parseFloat(item.material) || 0) +
      (parseFloat(item.labor) || 0) +
      (parseFloat(item.equipment) || 0) +
      (parseFloat(item.subcontractor) || 0);
    divisionTotals[div] = (divisionTotals[div] || 0) + itemTotal;
    totalCost += itemTotal;
  });

  const divCount = Object.keys(divisionTotals).length;
  if (divCount < 2 || totalCost < 1000) {
    console.warn(`[NOVA Feedback] Skipped: too few divisions (${divCount}) or low total ($${totalCost.toFixed(0)})`);
    return null;
  }

  // ── 4. Generate UNCALIBRATED ROM prediction for fair delta comparison ──
  const romPrediction = generateBaselineROM(sf, jobType, workType || "", {});

  if (!romPrediction?.divisions) {
    console.warn(`[NOVA Feedback] Skipped: ROM generation failed for ${jobType}`);
    return null;
  }

  // ── 5. Compute calibration ratios (actual / predicted per division) ──
  const calibration = computeCalibration(romPrediction, { divisions: divisionTotals });

  // ── 6. Validate through existing gates ──
  const estimateName = useEstimatesStore.getState().estimatesIndex
    .find(e => e.id === estimateId)?.name || "Estimate";

  const pseudoProposal = {
    projectSF: sf,
    buildingType: jobType,
    divisions: divisionTotals,
    name: estimateName,
    totalCost,
  };

  const validation = validateProposal(pseudoProposal, existingRecords);
  if (validation.overallStatus === "REJECTED") {
    console.warn(`[NOVA Feedback] Rejected by validation gates:`, validation);
    return null;
  }

  // ── 7. Create learning record ──
  const record = {
    source: "completed-estimate",
    estimateId,
    proposalName: estimateName,
    projectSF: sf,
    buildingType: jobType,
    workType: workType || "",
    laborType: laborType || "open_shop",
    zipCode: zipCode || "",
    proposalType: "gc", // User's own estimates = GC perspective
    normalizedToYear: new Date().getFullYear(),
    romPrediction: {
      divisions: Object.fromEntries(
        Object.entries(romPrediction.divisions)
          .filter(([, data]) => data?.total?.mid > 0)
          .map(([div, data]) => [div, { mid: data.total.mid }])
      ),
    },
    actuals: { divisions: divisionTotals },
    calibration,
    validationStatus: validation.overallStatus,
    timestamp: Date.now(),
  };

  // ── 8. Store ──
  await useScanStore.getState().addLearningRecord(record);

  console.log(
    `[NOVA Feedback] ✓ Learning record from "${estimateName}": ` +
    `${divCount} divisions, $${(totalCost / sf).toFixed(0)}/SF, ` +
    `type=${jobType}, validation=${validation.overallStatus}`
  );

  return record;
}
