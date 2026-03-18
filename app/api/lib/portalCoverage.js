/**
 * Server-side lightweight scope coverage calculation for portal.
 * Division-level matching — no client-side imports needed.
 */

const DIVISION_NAMES = {
  "01": "General Requirements",
  "02": "Existing Conditions",
  "03": "Concrete",
  "04": "Masonry",
  "05": "Metals",
  "06": "Wood & Plastics",
  "07": "Thermal & Moisture",
  "08": "Openings",
  "09": "Finishes",
  10: "Specialties",
  11: "Equipment",
  12: "Furnishings",
  13: "Special Construction",
  14: "Conveying Equipment",
  21: "Fire Suppression",
  22: "Plumbing",
  23: "HVAC",
  25: "Integrated Automation",
  26: "Electrical",
  27: "Communications",
  28: "Electronic Safety",
  31: "Earthwork",
  32: "Exterior Improvements",
  33: "Utilities",
};

function normalizeDiv(code) {
  if (!code) return null;
  const s = String(code).trim();
  const match = s.match(/^(\d{1,2})/);
  if (!match) return null;
  return match[1].padStart(2, "0");
}

/**
 * Compute portal coverage from scope items and parsed proposal.
 * @param {Array} scopeItems - estimate items from bid package scope_items
 * @param {Object} parsedData - AI-parsed proposal data
 * @returns {{ coverageScore, totalDivisions, coveredDivisions, missingDivisions[], exclusionCount, exclusionList[] }}
 */
export function computePortalCoverage(scopeItems, parsedData) {
  if (!scopeItems || !parsedData) {
    return {
      coverageScore: 0,
      totalDivisions: 0,
      coveredDivisions: 0,
      missingDivisions: [],
      exclusionCount: 0,
      exclusionList: [],
    };
  }

  // Get scope divisions
  const scopeDivs = new Set();
  for (const item of scopeItems) {
    const div = normalizeDiv(item.code || item.csiCode);
    if (div) scopeDivs.add(div);
  }

  // Get proposal divisions
  const proposalDivs = new Set();
  for (const li of parsedData.lineItems || []) {
    const div = normalizeDiv(li.csiCode || li.code);
    if (div) proposalDivs.add(div);
  }

  // Compute coverage
  const covered = [...scopeDivs].filter(d => proposalDivs.has(d));
  const missing = [...scopeDivs].filter(d => !proposalDivs.has(d));

  const coverageScore = scopeDivs.size > 0 ? Math.round((covered.length / scopeDivs.size) * 100) : 0;

  const missingDivisions = missing.map(d => ({
    division: d,
    divisionName: DIVISION_NAMES[d] || `Division ${d}`,
  }));

  const exclusions = parsedData.exclusions || [];

  return {
    coverageScore,
    totalDivisions: scopeDivs.size,
    coveredDivisions: covered.length,
    missingDivisions,
    exclusionCount: exclusions.length,
    exclusionList: exclusions.slice(0, 10),
  };
}
