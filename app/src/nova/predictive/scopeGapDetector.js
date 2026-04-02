/**
 * NOVA Scope Gap Detector
 *
 * Compares current estimate items against expected scope for the building type.
 * Returns missing divisions with estimated cost impact and suggested items.
 *
 * Used by: NOVA chat ("What am I missing?"), estimate completion indicator,
 * proactive notifications.
 */

import { generateBaselineROM } from "@/utils/romEngine";

const DIVISION_LABELS = {
  "01": "General Requirements", "02": "Existing Conditions", "03": "Concrete",
  "04": "Masonry", "05": "Metals", "06": "Wood/Plastics", "07": "Thermal & Moisture",
  "08": "Openings", "09": "Finishes", "10": "Specialties", "11": "Equipment",
  "12": "Furnishings", "13": "Special Construction", "14": "Conveying Equipment",
  "21": "Fire Suppression", "22": "Plumbing", "23": "HVAC", "26": "Electrical",
  "27": "Communications", "28": "Electronic Safety", "31": "Earthwork",
  "32": "Exterior Improvements", "33": "Utilities",
};

// Divisions that are ALWAYS expected regardless of building type
const UNIVERSAL_DIVISIONS = ["01", "09", "22", "23", "26"];

// Divisions that are typically subcontracted (flag differently)
const SUB_DIVISIONS = new Set(["21", "22", "23", "26", "27", "28"]);

/**
 * Detect missing scope in an estimate.
 *
 * @param {object} params
 * @param {Array} params.items - Current estimate items [{division, code, description, material, labor, equipment, subcontractor, quantity}]
 * @param {string} params.buildingType - Building type (e.g., "commercial-office")
 * @param {string} params.workType - Work type (e.g., "Renovation")
 * @param {number} params.projectSF - Project square footage
 * @param {string} params.laborType - Labor type (e.g., "open_shop")
 * @param {object} params.calibration - Calibration factors from scanStore
 * @returns {object} { gaps[], coverage, totalMissingCost, completionPct }
 */
export function detectScopeGaps({ items = [], buildingType, workType, projectSF, laborType, calibration }) {
  if (!buildingType || !projectSF || projectSF <= 0) {
    return { gaps: [], coverage: {}, totalMissingCost: 0, completionPct: 0 };
  }

  // Generate baseline ROM to know expected divisions and costs
  const rom = generateBaselineROM(projectSF, buildingType, workType || "", calibration || {});
  if (!rom?.divisions) {
    return { gaps: [], coverage: {}, totalMissingCost: 0, completionPct: 0 };
  }

  // Group current items by division — sum total cost per division
  const currentByDiv = {};
  for (const item of items) {
    const div = (item.division || item.code?.substring(0, 2) || "").padStart(2, "0");
    if (!div || div === "00") continue;
    const unitCost = ((item.material || 0) + (item.labor || 0) + (item.equipment || 0) + (item.subcontractor || 0));
    const totalCost = unitCost * (item.quantity || 0);
    currentByDiv[div] = (currentByDiv[div] || 0) + totalCost;
  }

  const gaps = [];
  let totalExpected = 0;
  let totalCovered = 0;
  let totalMissingCost = 0;
  const coverage = {};

  // Check each expected division from ROM
  for (const [div, data] of Object.entries(rom.divisions)) {
    const expectedMid = data.total?.mid || 0;
    if (expectedMid <= 0) continue;

    totalExpected += expectedMid;
    const actual = currentByDiv[div] || 0;

    if (actual > 0) {
      // Has scope — track coverage ratio
      const ratio = actual / expectedMid;
      totalCovered += Math.min(actual, expectedMid);
      coverage[div] = {
        label: DIVISION_LABELS[div] || `Division ${div}`,
        expected: Math.round(expectedMid),
        actual: Math.round(actual),
        ratio: Math.round(ratio * 100),
        status: ratio >= 0.5 ? "covered" : "thin",
      };
    } else {
      // Missing entirely
      const isSub = SUB_DIVISIONS.has(div);
      const isUniversal = UNIVERSAL_DIVISIONS.includes(div);
      totalMissingCost += expectedMid;

      gaps.push({
        division: div,
        label: DIVISION_LABELS[div] || `Division ${div}`,
        expectedCost: Math.round(expectedMid),
        expectedPerSF: data.perSF?.mid || 0,
        severity: isUniversal ? "critical" : expectedMid > (projectSF * 5) ? "high" : "medium",
        isSubTrade: isSub,
        suggestion: isSub
          ? `Get sub proposal for ${DIVISION_LABELS[div] || div}. ROM estimates $${Math.round(expectedMid).toLocaleString()}.`
          : `Add ${DIVISION_LABELS[div] || div} scope. ROM estimates $${Math.round(expectedMid).toLocaleString()} ($${(data.perSF?.mid || 0).toFixed(2)}/SF).`,
      });

      coverage[div] = {
        label: DIVISION_LABELS[div] || `Division ${div}`,
        expected: Math.round(expectedMid),
        actual: 0,
        ratio: 0,
        status: "missing",
      };
    }
  }

  // Sort gaps: critical first, then by expected cost descending
  gaps.sort((a, b) => {
    const sevOrder = { critical: 0, high: 1, medium: 2 };
    if (sevOrder[a.severity] !== sevOrder[b.severity]) return sevOrder[a.severity] - sevOrder[b.severity];
    return b.expectedCost - a.expectedCost;
  });

  const completionPct = totalExpected > 0 ? Math.round((totalCovered / totalExpected) * 100) : 0;

  return {
    gaps,
    coverage,
    totalExpected: Math.round(totalExpected),
    totalCovered: Math.round(totalCovered),
    totalMissingCost: Math.round(totalMissingCost),
    completionPct,
    divisionCount: Object.keys(rom.divisions).length,
    coveredCount: Object.values(coverage).filter(c => c.status === "covered").length,
    missingCount: gaps.length,
  };
}

/**
 * Build a natural language summary of scope gaps for NOVA chat.
 */
export function buildScopeGapSummary(gapResult) {
  if (!gapResult || gapResult.gaps.length === 0) {
    return `Your estimate covers all expected divisions (${gapResult?.completionPct || 0}% cost coverage). No missing scope detected.`;
  }

  const lines = [];
  lines.push(`**Scope Coverage: ${gapResult.completionPct}%** ($${gapResult.totalCovered.toLocaleString()} of $${gapResult.totalExpected.toLocaleString()} expected)`);
  lines.push(`**${gapResult.missingCount} missing divisions** — estimated $${gapResult.totalMissingCost.toLocaleString()} not yet in your estimate:\n`);

  for (const gap of gapResult.gaps) {
    const icon = gap.severity === "critical" ? "🔴" : gap.severity === "high" ? "🟡" : "⚪";
    const subTag = gap.isSubTrade ? " *(typically subcontracted)*" : "";
    lines.push(`${icon} **${gap.label}** — $${gap.expectedCost.toLocaleString()} ($${gap.expectedPerSF.toFixed(2)}/SF)${subTag}`);
  }

  return lines.join("\n");
}
