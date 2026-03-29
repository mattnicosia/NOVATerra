// Proposal Validation Engine — 5 gates that every data point passes through
// Each gate produces a status: PASS, WARN, REJECT
// The overall proposal status determines how it enters CORE:
//   ACCEPTED → full calibration ($/SF + markups)
//   MARKUP_ONLY → markup calibration only (no SF, no $/SF)
//   FLAGGED → accepted with warnings (admin review recommended)
//   REJECTED → excluded from calibration entirely
//
// Every gate result is stored on the proposal for admin visibility.

import { resolveLocationFactors } from "@/constants/locationFactors";

// ── Benchmark ranges by building type (reasonable $/SF bounds) ──
const REASONABLE_BOUNDS = {
  "commercial-office":   { min: 80, max: 800 },
  "retail":              { min: 60, max: 600 },
  "healthcare":          { min: 150, max: 1200 },
  "education":           { min: 100, max: 800 },
  "industrial":          { min: 40, max: 400 },
  "residential-multi":   { min: 100, max: 600 },
  "hospitality":         { min: 120, max: 900 },
  "residential-single":  { min: 80, max: 800 },
  "mixed-use":           { min: 80, max: 700 },
  "government":          { min: 100, max: 800 },
  "religious":           { min: 80, max: 500 },
  "restaurant":          { min: 80, max: 900 },
  "parking":             { min: 30, max: 200 },
  "default":             { min: 20, max: 2000 },
};

/**
 * Run all 5 validation gates on a proposal.
 * Returns detailed results per gate + overall status.
 *
 * @param {object} proposal - The proposal object from masterDataStore
 * @param {array} existingProposals - All other proposals (for outlier + duplicate detection)
 * @returns {object} { overallStatus, gates: { gate1, gate2, gate3, gate4, gate5 }, usableFor }
 */
export function validateProposal(proposal, existingProposals = []) {
  const gates = {
    gate1: runGate1_RequiredFields(proposal),
    gate2: runGate2_SanityBounds(proposal),
    gate3: runGate3_OutlierDetection(proposal, existingProposals),
    gate4: runGate4_DuplicateDetection(proposal, existingProposals),
    gate5: runGate5_NormalizationValidation(proposal),
  };

  // Determine overall status
  const statuses = Object.values(gates).map(g => g.status);

  let overallStatus;
  let usableFor;

  if (statuses.includes("REJECT")) {
    // Check if it's rejected ONLY because of missing SF
    const rejectedGates = Object.entries(gates).filter(([, g]) => g.status === "REJECT");
    const onlySFMissing = rejectedGates.length === 1 &&
      rejectedGates[0][0] === "gate1" &&
      gates.gate1.details?.missingSF === true &&
      gates.gate1.details?.hasDivisions === true;

    if (onlySFMissing) {
      overallStatus = "MARKUP_ONLY";
      usableFor = ["markup_calibration"];
    } else {
      overallStatus = "REJECTED";
      usableFor = [];
    }
  } else if (statuses.includes("WARN")) {
    overallStatus = "FLAGGED";
    usableFor = ["sf_calibration", "markup_calibration"];
  } else {
    overallStatus = "ACCEPTED";
    usableFor = ["sf_calibration", "markup_calibration"];
  }

  return {
    overallStatus,
    usableFor,
    gates,
    timestamp: new Date().toISOString(),
  };
}

// ════════════════════════════════════════════════════════════════
// GATE 1: REQUIRED FIELDS
// ════════════════════════════════════════════════════════════════
function runGate1_RequiredFields(proposal) {
  const issues = [];
  const details = {};

  const sf = proposal.projectSF || 0;
  const totalCost = proposal.totalCost || 0;
  const divEntries = Object.entries(proposal.divisions || {}).filter(([, v]) => {
    const val = typeof v === "object" ? (v.mid || v.total || 0) : (parseFloat(v) || 0);
    return val > 0;
  });

  details.hasSF = sf > 0;
  details.missingSF = sf <= 0;
  details.hasTotalCost = totalCost > 0;
  details.hasDivisions = divEntries.length > 0;
  details.divisionCount = divEntries.length;
  details.hasProjectName = !!(proposal.projectName || proposal.name);
  details.hasBuildingType = !!(proposal.jobType || proposal.buildingType);

  if (!details.hasProjectName) issues.push("Missing project name");
  if (!details.hasTotalCost) issues.push("Missing total cost");
  if (!details.hasDivisions) issues.push("No division breakdown");
  if (!details.hasSF) issues.push("Missing square footage — markup calibration only");
  if (!details.hasBuildingType) issues.push("Missing building type — will default to commercial-office");

  // Reject if no cost AND no divisions
  if (!details.hasTotalCost && !details.hasDivisions) {
    return { status: "REJECT", label: "Required Fields", issues, details, reason: "No cost data at all" };
  }

  // Reject if missing SF (but flag as MARKUP_ONLY candidate)
  if (!details.hasSF) {
    return { status: "REJECT", label: "Required Fields", issues, details, reason: "No SF — markup calibration only" };
  }

  // Warn if missing building type
  if (!details.hasBuildingType) {
    return { status: "WARN", label: "Required Fields", issues, details, reason: "Missing building type" };
  }

  if (issues.length === 0) {
    return { status: "PASS", label: "Required Fields", issues: [], details, reason: "All required fields present" };
  }

  return { status: "WARN", label: "Required Fields", issues, details, reason: issues.join("; ") };
}

// ════════════════════════════════════════════════════════════════
// GATE 2: SANITY BOUNDS
// ════════════════════════════════════════════════════════════════
function runGate2_SanityBounds(proposal) {
  const issues = [];
  const details = {};
  const sf = proposal.projectSF || 0;
  const totalCost = proposal.totalCost || 0;

  if (sf <= 0) {
    return { status: "PASS", label: "Sanity Bounds", issues: ["Skipped — no SF"], details: { skipped: true }, reason: "No SF to validate" };
  }

  const perSF = totalCost / sf;
  details.perSF = Math.round(perSF * 100) / 100;

  // SF bounds
  if (sf < 100) {
    issues.push(`SF = ${sf} — unusually small (< 100 SF)`);
    details.sfFlag = "too_small";
  } else if (sf > 500000) {
    issues.push(`SF = ${sf.toLocaleString()} — unusually large (> 500,000 SF)`);
    details.sfFlag = "too_large";
  }

  // $/SF bounds
  const buildingType = proposal.jobType || proposal.buildingType || "default";
  const bounds = REASONABLE_BOUNDS[buildingType] || REASONABLE_BOUNDS["default"];
  details.boundsMin = bounds.min;
  details.boundsMax = bounds.max;

  if (perSF < bounds.min * 0.5) {
    issues.push(`$/SF = $${perSF.toFixed(2)} — far below minimum ($${bounds.min}/SF) for ${buildingType}`);
    details.perSFFlag = "far_below";
  } else if (perSF < bounds.min) {
    issues.push(`$/SF = $${perSF.toFixed(2)} — below typical minimum ($${bounds.min}/SF) for ${buildingType}`);
    details.perSFFlag = "below";
  } else if (perSF > bounds.max) {
    issues.push(`$/SF = $${perSF.toFixed(2)} — above typical maximum ($${bounds.max}/SF) for ${buildingType}`);
    details.perSFFlag = "above";
  } else if (perSF > bounds.max * 1.5) {
    issues.push(`$/SF = $${perSF.toFixed(2)} — far above maximum ($${bounds.max}/SF) for ${buildingType}`);
    details.perSFFlag = "far_above";
  }

  // Division sum vs total cost
  const divSum = Object.values(proposal.divisions || {}).reduce((sum, v) => {
    const val = typeof v === "object" ? (v.mid || v.total || 0) : (parseFloat(v) || 0);
    return sum + val;
  }, 0);
  details.divisionSum = Math.round(divSum);
  details.totalCost = Math.round(totalCost);

  if (divSum > 0 && totalCost > 0) {
    const diff = Math.abs(divSum - totalCost) / totalCost;
    details.divSumDiffPct = Math.round(diff * 1000) / 10;
    if (diff > 0.30) {
      issues.push(`Division sum ($${divSum.toLocaleString()}) differs from total ($${totalCost.toLocaleString()}) by ${(diff * 100).toFixed(1)}% — possible data error`);
      details.divSumFlag = "large_discrepancy";
    } else if (diff > 0.15) {
      issues.push(`Division sum differs from total by ${(diff * 100).toFixed(1)}% — markups may be included in divisions`);
      details.divSumFlag = "moderate_discrepancy";
    }
  }

  // Single division dominance
  if (divSum > 0) {
    const maxDiv = Math.max(...Object.values(proposal.divisions || {}).map(v => {
      return typeof v === "object" ? (v.mid || v.total || 0) : (parseFloat(v) || 0);
    }));
    const dominance = maxDiv / divSum;
    details.maxDivPct = Math.round(dominance * 100);
    if (dominance > 0.60) {
      issues.push(`Single division is ${(dominance * 100).toFixed(0)}% of total — possible scope concentration or data error`);
      details.dominanceFlag = "high";
    }
  }

  if (issues.some(i => i.includes("far below") || i.includes("far above") || i.includes("large_discrepancy"))) {
    return { status: "REJECT", label: "Sanity Bounds", issues, details, reason: "Values outside reasonable bounds" };
  }

  if (issues.length > 0) {
    return { status: "WARN", label: "Sanity Bounds", issues, details, reason: issues.join("; ") };
  }

  return { status: "PASS", label: "Sanity Bounds", issues: [], details, reason: `$/SF = $${perSF.toFixed(2)} within bounds ($${bounds.min}-$${bounds.max})` };
}

// ════════════════════════════════════════════════════════════════
// GATE 3: OUTLIER DETECTION
// ════════════════════════════════════════════════════════════════
function runGate3_OutlierDetection(proposal, existingProposals) {
  const issues = [];
  const details = {};
  const sf = proposal.projectSF || 0;
  const totalCost = proposal.totalCost || 0;

  if (sf <= 0 || totalCost <= 0) {
    return { status: "PASS", label: "Outlier Detection", issues: ["Skipped — no SF or cost"], details: { skipped: true }, reason: "Insufficient data for outlier check" };
  }

  const perSF = totalCost / sf;
  const buildingType = proposal.jobType || proposal.buildingType || "";

  // Find similar proposals (same building type)
  const similar = existingProposals.filter(p => {
    if (p.id === proposal.id) return false;
    const pType = p.jobType || p.buildingType || "";
    return pType === buildingType && (p.projectSF || 0) > 0 && (p.totalCost || 0) > 0;
  });

  details.similarCount = similar.length;

  if (similar.length < 3) {
    return { status: "PASS", label: "Outlier Detection", issues: ["Insufficient data — fewer than 3 similar proposals"], details, reason: "Not enough data for outlier comparison" };
  }

  // Compute mean and std deviation
  const perSFs = similar.map(p => p.totalCost / p.projectSF);
  const mean = perSFs.reduce((s, v) => s + v, 0) / perSFs.length;
  const variance = perSFs.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / perSFs.length;
  const stdDev = Math.sqrt(variance);

  details.mean = Math.round(mean * 100) / 100;
  details.stdDev = Math.round(stdDev * 100) / 100;
  details.zScore = stdDev > 0 ? Math.round(((perSF - mean) / stdDev) * 100) / 100 : 0;

  if (Math.abs(details.zScore) > 3) {
    issues.push(`$/SF = $${perSF.toFixed(2)} is ${Math.abs(details.zScore).toFixed(1)} standard deviations from mean ($${mean.toFixed(2)}) — extreme outlier`);
    return { status: "REJECT", label: "Outlier Detection", issues, details, reason: "Extreme outlier (>3σ)" };
  }

  if (Math.abs(details.zScore) > 2) {
    issues.push(`$/SF = $${perSF.toFixed(2)} is ${Math.abs(details.zScore).toFixed(1)} standard deviations from mean ($${mean.toFixed(2)}) — outlier`);
    return { status: "WARN", label: "Outlier Detection", issues, details, reason: "Moderate outlier (>2σ)" };
  }

  return { status: "PASS", label: "Outlier Detection", issues: [], details, reason: `Within normal range (z=${details.zScore})` };
}

// ════════════════════════════════════════════════════════════════
// GATE 4: DUPLICATE DETECTION
// ════════════════════════════════════════════════════════════════
function runGate4_DuplicateDetection(proposal, existingProposals) {
  const issues = [];
  const details = {};
  const name = (proposal.projectName || proposal.name || "").toLowerCase().trim();

  if (!name) {
    return { status: "PASS", label: "Duplicate Detection", issues: [], details, reason: "No name to check" };
  }

  // Find proposals with similar names
  const duplicates = existingProposals.filter(p => {
    if (p.id === proposal.id) return false;
    const pName = (p.projectName || p.name || "").toLowerCase().trim();
    return pName === name ||
      (pName.length > 10 && name.length > 10 && (pName.includes(name) || name.includes(pName)));
  });

  details.duplicateCount = duplicates.length;

  if (duplicates.length === 0) {
    return { status: "PASS", label: "Duplicate Detection", issues: [], details, reason: "No duplicates found" };
  }

  // Check if it's a revision (same project, different cost)
  const exactNameMatch = duplicates.filter(p => (p.projectName || p.name || "").toLowerCase().trim() === name);
  details.exactMatches = exactNameMatch.length;

  if (exactNameMatch.length > 0) {
    const costs = exactNameMatch.map(p => p.totalCost || 0);
    const proposalCost = proposal.totalCost || 0;
    const similarCost = costs.some(c => Math.abs(c - proposalCost) / Math.max(c, proposalCost, 1) < 0.05);

    if (similarCost) {
      issues.push(`Exact duplicate: "${name}" with similar cost — possible re-import`);
      details.duplicateType = "exact";
      return { status: "WARN", label: "Duplicate Detection", issues, details, reason: "Possible duplicate import" };
    } else {
      issues.push(`Revision detected: "${name}" exists with different cost — keeping both (revision history)`);
      details.duplicateType = "revision";
      return { status: "PASS", label: "Duplicate Detection", issues, details, reason: "Different revision — both kept" };
    }
  }

  issues.push(`Similar name match found: ${duplicates.length} proposal(s)`);
  return { status: "WARN", label: "Duplicate Detection", issues, details, reason: "Similar project name exists" };
}

// ════════════════════════════════════════════════════════════════
// GATE 5: NORMALIZATION VALIDATION
// ════════════════════════════════════════════════════════════════
function runGate5_NormalizationValidation(proposal) {
  const issues = [];
  const details = {};
  const zip = proposal.zipCode || proposal.location || "";

  if (!zip) {
    issues.push("No ZIP code — cannot normalize to location. Using national average (1.0×).");
    details.hasZip = false;
    details.locationResolved = false;
    return { status: "WARN", label: "Normalization", issues, details, reason: "No ZIP — national average assumed" };
  }

  const factors = resolveLocationFactors(zip);
  details.hasZip = true;
  details.locationResolved = factors.source !== "none";
  details.locationLabel = factors.label;
  details.locationSource = factors.source;
  details.factors = { mat: factors.mat, lab: factors.lab, equip: factors.equip };

  if (factors.source === "none") {
    issues.push(`ZIP "${zip}" did not resolve to any known metro area or state — using national average`);
    return { status: "WARN", label: "Normalization", issues, details, reason: "ZIP not recognized" };
  }

  // Check if normalized $/SF falls in reasonable range
  const sf = proposal.projectSF || 0;
  const totalCost = proposal.totalCost || 0;
  if (sf > 0 && totalCost > 0) {
    const rawPerSF = totalCost / sf;
    const laborFactor = { "prevailing": 1.35, "prevailing-wage": 1.35, "union": 1.45 }[(proposal.laborType || "").toLowerCase()] || 1.0;
    const combinedFactor = (factors.lab * 0.70 + factors.mat * 0.20 + factors.equip * 0.10) * laborFactor;
    const normalizedPerSF = rawPerSF / combinedFactor;

    details.rawPerSF = Math.round(rawPerSF * 100) / 100;
    details.normalizedPerSF = Math.round(normalizedPerSF * 100) / 100;
    details.combinedFactor = Math.round(combinedFactor * 1000) / 1000;
    details.formula = `$${details.rawPerSF}/SF ÷ ${details.combinedFactor}× = $${details.normalizedPerSF}/SF baseline`;

    if (normalizedPerSF < 20 || normalizedPerSF > 1500) {
      issues.push(`Normalized $/SF = $${normalizedPerSF.toFixed(2)} — outside reasonable bounds after normalization`);
      return { status: "WARN", label: "Normalization", issues, details, reason: "Normalized value outside bounds" };
    }
  }

  return { status: "PASS", label: "Normalization", issues: [], details, reason: `Resolved to ${factors.label} (${factors.source})` };
}

/**
 * Get a color for a gate status
 */
export function getStatusColor(status) {
  switch (status) {
    case "PASS": return "#00D4AA";
    case "WARN": return "#FFB020";
    case "REJECT": return "#FF4757";
    case "ACCEPTED": return "#00D4AA";
    case "FLAGGED": return "#FFB020";
    case "REJECTED": return "#FF4757";
    case "MARKUP_ONLY": return "#4DA6FF";
    default: return "#666";
  }
}

/**
 * Get a label for overall status
 */
export function getStatusLabel(status) {
  switch (status) {
    case "ACCEPTED": return "Full Calibration";
    case "FLAGGED": return "Accepted with Warnings";
    case "REJECTED": return "Excluded from Calibration";
    case "MARKUP_ONLY": return "Markup Calibration Only";
    default: return status;
  }
}
