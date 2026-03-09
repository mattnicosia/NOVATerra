// Scope Outline Generator — Creates bid-package-ready scope items from scan results
// Phase 3.5 of the NOVA Scan pipeline: runs after ROM generation
//
// Combines schedule-derived line items (high confidence, from actual drawings) with
// AI-generated gap-fill items for divisions that have ROM cost ranges but no schedule data.
// This gives the user a complete scope outline immediately after scan so they can
// create bid packages without manually building out the estimate.

import { callAnthropic } from "./ai";

// ─── Division Labels (fallback for ROM divisions without labels) ──────
const DIVISION_LABELS = {
  "01": "General Requirements",
  "02": "Existing Conditions/Demo",
  "03": "Concrete",
  "04": "Masonry",
  "05": "Metals",
  "06": "Wood & Plastics",
  "07": "Thermal & Moisture Protection",
  "08": "Openings",
  "09": "Finishes",
  10: "Specialties",
  14: "Conveying Equipment",
  21: "Fire Suppression",
  22: "Plumbing",
  23: "HVAC",
  26: "Electrical",
  27: "Communications",
  28: "Electronic Safety & Security",
  31: "Earthwork",
  32: "Exterior Improvements",
  33: "Utilities",
};

/**
 * Generate a complete scope outline from scan results.
 *
 * - Schedule line items go in directly (high confidence)
 * - For divisions in ROM that don't have schedule items, AI generates representative scope items
 * - ROM cost ranges act as guardrails for AI pricing
 *
 * @param {{ scheduleLineItems, rom, project, notesContext }} params
 * @returns {{ items: Array, scheduleItemCount: number, aiItemCount: number }}
 */
export async function generateScopeOutline({ scheduleLineItems = [], rom, project = {}, notesContext = "" }) {
  // 1. Convert schedule line items to scope items (high confidence)
  const scheduleItems = scheduleLineItems
    .filter(li => li.code && li.description)
    .map(li => {
      const divCode = (li.code || "").split(".")[0].padStart(2, "0");
      const divLabel = DIVISION_LABELS[divCode] || "";
      return {
        code: li.code,
        description: li.description,
        division: divLabel ? `${divCode} - ${divLabel}` : divCode,
        unit: li.unit || "EA",
        quantity: li.qty || li.quantity || 1,
        material: li.m || li.material || 0,
        labor: li.l || li.labor || 0,
        equipment: li.e || li.equipment || 0,
        subcontractor: 0,
        source: "nova-schedule",
        confidence: 0.9,
      };
    });

  // 2. Find which divisions are already covered by schedule items
  const coveredDivisions = new Set();
  for (const item of scheduleItems) {
    const dc = (item.code || "").split(".")[0].padStart(2, "0");
    coveredDivisions.add(dc);
  }

  // 3. Identify gap divisions — ROM divisions with cost data but no schedule items
  const gapDivisions = [];
  if (rom?.divisions) {
    for (const [divCode, divData] of Object.entries(rom.divisions)) {
      const dc = String(divCode).padStart(2, "0");
      if (coveredDivisions.has(dc)) continue;
      // Skip divisions with zero total budget
      if (divData.total && (divData.total.mid > 0 || divData.total.high > 0)) {
        gapDivisions.push({
          code: dc,
          label: divData.label || DIVISION_LABELS[dc] || `Division ${dc}`,
          perSF: divData.perSF || {},
          total: divData.total || {},
        });
      }
    }
  }

  // 4. If no gaps to fill, return schedule items only
  if (gapDivisions.length === 0) {
    return {
      items: scheduleItems,
      scheduleItemCount: scheduleItems.length,
      aiItemCount: 0,
    };
  }

  // 5. Generate AI scope items for gap divisions
  let aiItems = [];
  try {
    aiItems = await generateGapItems(gapDivisions, project, notesContext, rom);
  } catch (err) {
    console.warn("[ScopeOutline] AI gap-fill failed:", err.message);
    // Non-critical — still return schedule items
  }

  // 6. Merge: schedule items first, then AI gap-fill items (sorted by division code)
  const allItems = [...scheduleItems, ...aiItems].sort((a, b) => {
    const codeA = (a.code || "").split(".")[0].padStart(2, "0");
    const codeB = (b.code || "").split(".")[0].padStart(2, "0");
    return codeA.localeCompare(codeB) || (a.code || "").localeCompare(b.code || "");
  });

  return {
    items: allItems,
    scheduleItemCount: scheduleItems.length,
    aiItemCount: aiItems.length,
  };
}

// ─── AI Gap-Fill Generation ───────────────────────────────────────────
async function generateGapItems(gapDivisions, project, notesContext, rom) {
  const sf = parseFloat(project.projectSF) || rom?.projectSF || 0;
  const buildingType = project.buildingType || rom?.buildingType || "commercial-office";
  const workType = project.workType || rom?.workType || "new-construction";
  const floorCount = project.floorCount || "";
  const roomCounts = project.roomCounts || {};

  // Build per-division budget guidance
  const divisionGuidance = gapDivisions
    .map(d => {
      const totalRange =
        d.total.low && d.total.high
          ? `$${Math.round(d.total.low).toLocaleString()}–$${Math.round(d.total.high).toLocaleString()} total`
          : "";
      const perSFRange = d.perSF.low != null && d.perSF.high != null ? `$${d.perSF.low}–$${d.perSF.high}/SF` : "";
      const budget = [perSFRange, totalRange].filter(Boolean).join(", ");
      return `- Division ${d.code} (${d.label}): ${budget || "estimate needed"}`;
    })
    .join("\n");

  // Build project context
  const projectLines = [
    buildingType && `Building type: ${buildingType}`,
    workType && `Work type: ${workType}`,
    sf && `Project size: ${Math.round(sf).toLocaleString()} SF`,
    floorCount && `Floors: ${floorCount}`,
    Object.keys(roomCounts).length > 0 &&
      `Room counts: ${Object.entries(roomCounts)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const system = `You are a construction cost estimator generating scope outline items. For each CSI division listed, generate 2–5 representative line items that would be typical for this project type.

Return ONLY a valid JSON array (no markdown fences, no explanation). Each object:
{ "code": "03.30.10", "description": "Cast-in-Place Concrete Foundation Walls", "division": "03 - Concrete", "unit": "CY", "quantity": 1, "material": 150, "labor": 85, "equipment": 25, "subcontractor": 0 }

Rules:
- Use CSI MasterFormat codes in "XX.XXX" format (2-digit division + 3-digit subdivision)
- Include the division name in "division" field as "XX - Name" format
- Be specific in descriptions — real-world scope items an estimator would recognize
- Quantities should reflect the project size (${sf ? Math.round(sf).toLocaleString() + " SF" : "unknown SF"})
- Pricing per unit should reflect current US market rates
- For typically subcontracted work (electrical, plumbing, HVAC, fire protection, elevators), put all cost in "subcontractor" field and set material/labor/equipment to 0
- The sum of all items in each division should roughly match the budget guidance provided
- Generate 2–5 items per division based on complexity
- Return ONLY the JSON array, nothing else`;

  const userMsg = `Generate scope outline items for these divisions:

${divisionGuidance}

Project context:
${projectLines}

${notesContext ? `Drawing notes context:\n${notesContext.slice(0, 2000)}` : ""}

Generate 2–5 line items per division. Keep total costs aligned with the budget guidance per division.`;

  const text = await callAnthropic({
    max_tokens: 4000,
    messages: [{ role: "user", content: userMsg }],
    system,
    temperature: 0.3,
  });

  // Parse JSON response
  const clean = text.replace(/```json\n?|```/g, "").trim();
  let parsed;

  // Try array parse first
  const arrStart = clean.indexOf("[");
  if (arrStart !== -1) {
    const arrEnd = clean.lastIndexOf("]");
    if (arrEnd > arrStart) {
      try {
        parsed = JSON.parse(clean.slice(arrStart, arrEnd + 1));
      } catch {
        // fallback
      }
    }
  }

  if (!parsed) {
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.warn("[ScopeOutline] Failed to parse AI response");
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  // Validate and normalize each item
  return parsed
    .filter(item => item && item.code && item.description)
    .map(item => ({
      code: item.code || "",
      description: item.description || "",
      division: item.division || "",
      unit: item.unit || "EA",
      quantity: item.quantity || 1,
      material: item.material || 0,
      labor: item.labor || 0,
      equipment: item.equipment || 0,
      subcontractor: item.subcontractor || 0,
      source: "nova-ai",
      confidence: 0.6,
    }));
}
