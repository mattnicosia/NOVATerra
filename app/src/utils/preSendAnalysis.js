/**
 * Pre-Send Scope Analysis Engine
 * Flags CSI divisions commonly excluded by subs for a given project type.
 * Deterministic — no AI calls. Uses construction estimating knowledge.
 */

// Common exclusion patterns by project type
// Each entry: { division, divisionName, warning, riskLevel }
const WARNINGS_BY_TYPE = {
  // Commercial / Office
  office: [
    { division: "07", divisionName: "Thermal & Moisture", warning: "Firestop and sealant scope commonly excluded by framing and drywall subs", riskLevel: "high" },
    { division: "09", divisionName: "Finishes", warning: "Paint touch-up after other trades commonly excluded by painting subs", riskLevel: "medium" },
    { division: "08", divisionName: "Openings", warning: "Door hardware installation often excluded by door suppliers — verify install is included", riskLevel: "high" },
    { division: "06", divisionName: "Wood & Plastics", warning: "Blocking for wall-mounted items (TV brackets, grab bars) commonly excluded", riskLevel: "medium" },
  ],
  retail: [
    { division: "07", divisionName: "Thermal & Moisture", warning: "Storefront sealant and waterproofing at grade commonly excluded", riskLevel: "high" },
    { division: "09", divisionName: "Finishes", warning: "Floor prep and leveling commonly excluded by flooring subs", riskLevel: "medium" },
    { division: "10", divisionName: "Specialties", warning: "Signage backing and blocking commonly excluded from framing scope", riskLevel: "medium" },
    { division: "08", divisionName: "Openings", warning: "Automatic door operators commonly excluded by storefront subs", riskLevel: "high" },
  ],
  restaurant: [
    { division: "11", divisionName: "Equipment", warning: "Kitchen equipment hookups (plumbing/electrical) commonly excluded by equipment suppliers", riskLevel: "high" },
    { division: "09", divisionName: "Finishes", warning: "FRP wall panels and commercial kitchen wall finishes commonly excluded by drywall subs", riskLevel: "medium" },
    { division: "07", divisionName: "Thermal & Moisture", warning: "Grease duct fire wrap commonly excluded by HVAC subs", riskLevel: "high" },
    { division: "22", divisionName: "Plumbing", warning: "Grease trap installation and connection commonly excluded", riskLevel: "high" },
  ],
  medical: [
    { division: "09", divisionName: "Finishes", warning: "Infection control barriers (ICRA) during renovation commonly excluded by all trades", riskLevel: "high" },
    { division: "08", divisionName: "Openings", warning: "Lead-lined doors and frames commonly excluded by door subs", riskLevel: "high" },
    { division: "07", divisionName: "Thermal & Moisture", warning: "Radiation shielding in walls commonly excluded from framing scope", riskLevel: "high" },
    { division: "28", divisionName: "Electronic Safety", warning: "Nurse call system rough-in commonly excluded by electrical subs", riskLevel: "medium" },
  ],
  multifamily: [
    { division: "07", divisionName: "Thermal & Moisture", warning: "Balcony waterproofing and flashing commonly excluded", riskLevel: "high" },
    { division: "08", divisionName: "Openings", warning: "Unit entry door hardware (deadbolts, peepholes) commonly excluded by door subs", riskLevel: "medium" },
    { division: "12", divisionName: "Furnishings", warning: "Appliance delivery and hookup commonly excluded by appliance suppliers", riskLevel: "medium" },
    { division: "06", divisionName: "Wood & Plastics", warning: "Closet shelving and accessories commonly excluded from millwork scope", riskLevel: "medium" },
  ],
  education: [
    { division: "10", divisionName: "Specialties", warning: "Markerboards, tackboards, and display cases commonly excluded from general trades", riskLevel: "medium" },
    { division: "11", divisionName: "Equipment", warning: "Lab casework plumbing hookups commonly excluded by plumbing subs", riskLevel: "high" },
    { division: "12", divisionName: "Furnishings", warning: "Furniture delivery and assembly commonly excluded", riskLevel: "medium" },
    { division: "07", divisionName: "Thermal & Moisture", warning: "Roof drain tie-ins commonly excluded by roofing subs", riskLevel: "medium" },
  ],
  industrial: [
    { division: "05", divisionName: "Metals", warning: "Equipment pad anchor bolts commonly excluded by structural steel subs", riskLevel: "medium" },
    { division: "03", divisionName: "Concrete", warning: "Equipment housekeeping pads commonly excluded from slab scope", riskLevel: "high" },
    { division: "13", divisionName: "Special Construction", warning: "Crane rail installation commonly excluded by steel erectors", riskLevel: "high" },
  ],
  hospitality: [
    { division: "12", divisionName: "Furnishings", warning: "FF&E delivery, placement, and hookup commonly excluded", riskLevel: "high" },
    { division: "09", divisionName: "Finishes", warning: "Specialty wall coverings (vinyl, fabric) installation commonly excluded", riskLevel: "medium" },
    { division: "08", divisionName: "Openings", warning: "Electronic lock programming and installation commonly excluded by door subs", riskLevel: "high" },
  ],
};

// Universal warnings that apply to all project types
const UNIVERSAL_WARNINGS = [
  { division: "01", divisionName: "General Requirements", warning: "Dumpster and debris removal commonly excluded by all trade subs", riskLevel: "medium" },
  { division: "02", divisionName: "Existing Conditions", warning: "Selective demolition commonly excluded — verify demo is in the right sub's scope", riskLevel: "high" },
];

/**
 * Analyze estimate items and return pre-send warnings for commonly excluded scope.
 * @param {Array} estimateItems - Items from the estimate
 * @param {string} projectType - Job type (e.g., "office", "medical", "multifamily")
 * @returns {Array<{ division, divisionName, warning, riskLevel }>}
 */
export function preSendScopeAnalysis(estimateItems, projectType) {
  if (!estimateItems?.length) return [];

  // Get divisions present in the estimate
  const presentDivisions = new Set();
  for (const item of estimateItems) {
    const code = item.code || "";
    const div = code.split(".")[0];
    if (div) presentDivisions.add(div.padStart(2, "0"));
  }

  if (presentDivisions.size === 0) return [];

  // Normalize project type for lookup
  const typeKey = (projectType || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/newconstruction|renovation|gutrenov|addition|fitout|tenantfitout|interio(r)?fitout|shellcore|adaptivereuse|historicrestoration|capitalimprovement/, "");

  // Find matching type warnings
  const typeWarnings = WARNINGS_BY_TYPE[typeKey] || WARNINGS_BY_TYPE.office || [];

  // Filter to warnings relevant to divisions in the estimate
  const relevant = [];

  for (const w of [...UNIVERSAL_WARNINGS, ...typeWarnings]) {
    if (presentDivisions.has(w.division)) {
      relevant.push(w);
    }
  }

  // Also check for division gaps — divisions that should typically be present but aren't
  // If estimate has Div 09 (Finishes) but no Div 07 (Thermal), flag it
  if (presentDivisions.has("09") && !presentDivisions.has("07")) {
    relevant.push({
      division: "07",
      divisionName: "Thermal & Moisture",
      warning: "Your estimate includes Finishes (Div 09) but no Thermal & Moisture (Div 07) — insulation, waterproofing, and sealants may be missing",
      riskLevel: "high",
    });
  }
  if (presentDivisions.has("09") && !presentDivisions.has("06")) {
    relevant.push({
      division: "06",
      divisionName: "Wood & Plastics",
      warning: "Your estimate includes Finishes (Div 09) but no Wood/Plastics (Div 06) — blocking, backing, and rough carpentry may be missing",
      riskLevel: "medium",
    });
  }

  return relevant;
}
