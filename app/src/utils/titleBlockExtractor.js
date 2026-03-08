// Title Block Extractor — Reads structured project info from drawing title blocks
// Phase 1.7 of the NOVA Scan pipeline: runs after notes extraction, before schedule parsing
//
// Construction drawing title blocks contain: project name, client (owner), architect,
// engineer, address, project number, building type hints, and work type hints.
// This module sends the drawing to Claude to extract these fields as structured JSON.

import { callAnthropic, imageBlock } from "./ai";
import { BUILDING_TYPES } from "@/constants/constructionTypes";

// ─── Title Block Extraction Prompt ─────────────────────────────────────
function buildTitleBlockPrompt(sheetLabel, ocrText = "") {
  return `You are analyzing a construction drawing sheet${sheetLabel ? ` labeled "${sheetLabel}"` : ""} for a commercial estimating application.

Your task is to read the TITLE BLOCK of this drawing (typically located in the bottom-right corner or right edge) and extract project identification information.

LOOK FOR:
1. **Project Name** — the name of the project or building (e.g., "Oak Grove Medical Center", "Riverside Apartments Phase 2")
2. **Client / Owner** — the entity the project is for (e.g., "ABC Development LLC", "City of Portland")
3. **Architect** — the architecture firm name (e.g., "Smith & Associates Architects")
4. **Engineer** — the engineering firm name (structural, MEP, or civil)
5. **Address** — the project site address (street address)
6. **City** — the city name
7. **State** — the state (2-letter abbreviation preferred)
8. **Zip Code** — 5-digit zip code
9. **Project Number** — the architect's or engineer's project/job number (NOT the sheet number)
10. **Building Type Hint** — if stated or clearly implied (e.g., "Medical Office Building", "Multi-Family Residential")
11. **Work Type Hint** — if stated (e.g., "Renovation", "Tenant Improvement", "New Construction", "Addition")

IMPORTANT:
- Read ONLY what is explicitly written — do NOT guess or infer
- Return empty string "" for any field you cannot find
- The project number is usually a coded identifier like "2024-015" or "P-0823", NOT the sheet number (like "A1.01")
- The architect name is often the firm that prepared the drawings
- Look for the stamp/seal area for firm names

Return ONLY a JSON object:
{
  "projectName": "",
  "client": "",
  "architect": "",
  "engineer": "",
  "address": "",
  "city": "",
  "state": "",
  "zipCode": "",
  "projectNumber": "",
  "buildingTypeHint": "",
  "workTypeHint": ""
}

${ocrText ? `OCR-EXTRACTED TEXT FROM THIS DRAWING:
"""
${ocrText.slice(0, 6000)}
"""

Use this OCR text to help identify title block content. Cross-reference with the image for accuracy.` : ""}`;
}

// ─── Extract Title Block Fields from a Single Drawing ─────────────────
/**
 * Send drawing image + OCR text to Claude for title block extraction.
 *
 * @param {{ imgBase64: string, ocrText: string, sheetLabel: string }} opts
 * @returns {{ projectName, client, architect, engineer, address, city, state, zipCode, projectNumber, buildingTypeHint, workTypeHint }}
 */
export async function extractTitleBlockFields({ imgBase64, ocrText, sheetLabel }) {
  if (!imgBase64) return null;

  try {
    const prompt = buildTitleBlockPrompt(sheetLabel, ocrText);

    const result = await callAnthropic({
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [imageBlock(imgBase64), { type: "text", text: prompt }],
        },
      ],
    });

    // Parse JSON response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[TitleBlock] No JSON found in response for", sheetLabel);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate — ensure it's an object with expected fields
    if (typeof parsed !== "object" || parsed === null) return null;

    return {
      projectName: (parsed.projectName || "").trim(),
      client: (parsed.client || "").trim(),
      architect: (parsed.architect || "").trim(),
      engineer: (parsed.engineer || "").trim(),
      address: (parsed.address || "").trim(),
      city: (parsed.city || "").trim(),
      state: (parsed.state || "").trim(),
      zipCode: (parsed.zipCode || "").trim(),
      projectNumber: (parsed.projectNumber || "").trim(),
      buildingTypeHint: (parsed.buildingTypeHint || "").trim(),
      workTypeHint: (parsed.workTypeHint || "").trim(),
    };
  } catch (err) {
    console.warn("[TitleBlock] Extraction failed for", sheetLabel, err.message);
    return null;
  }
}

// ─── Building Type Key Mapper ─────────────────────────────────────────
// Maps AI-detected building type strings to BUILDING_TYPES keys
const BUILDING_TYPE_ALIASES = {
  // residential-single
  residential: "residential-single",
  "single-family": "residential-single",
  "single family": "residential-single",
  house: "residential-single",
  home: "residential-single",
  dwelling: "residential-single",

  // residential-multi
  "multi-family": "residential-multi",
  "multi family": "residential-multi",
  multifamily: "residential-multi",
  apartment: "residential-multi",
  apartments: "residential-multi",
  condo: "residential-multi",
  condominium: "residential-multi",
  townhouse: "residential-multi",
  townhome: "residential-multi",

  // commercial-office
  commercial: "commercial-office",
  office: "commercial-office",
  "office building": "commercial-office",
  "commercial office": "commercial-office",

  // retail
  retail: "retail",
  store: "retail",
  shopping: "retail",
  "shopping center": "retail",
  mall: "retail",

  // industrial
  industrial: "industrial",
  warehouse: "industrial",
  manufacturing: "industrial",
  factory: "industrial",
  distribution: "industrial",
  "distribution center": "industrial",

  // healthcare
  healthcare: "healthcare",
  medical: "healthcare",
  hospital: "healthcare",
  clinic: "healthcare",
  "medical office": "healthcare",
  "medical center": "healthcare",
  "outpatient": "healthcare",

  // education
  education: "education",
  school: "education",
  university: "education",
  college: "education",
  "high school": "education",
  "elementary school": "education",
  "middle school": "education",
  campus: "education",
  academic: "education",

  // hospitality
  hospitality: "hospitality",
  hotel: "hospitality",
  motel: "hospitality",
  resort: "hospitality",
  "boutique hotel": "hospitality",

  // mixed-use
  "mixed-use": "mixed-use",
  "mixed use": "mixed-use",

  // government
  government: "government",
  municipal: "government",
  "civic center": "government",
  courthouse: "government",
  "fire station": "government",
  "police station": "government",
  "city hall": "government",
  library: "government",

  // religious
  religious: "religious",
  church: "religious",
  temple: "religious",
  mosque: "religious",
  synagogue: "religious",
  chapel: "religious",
  "house of worship": "religious",

  // restaurant
  restaurant: "restaurant",
  "food service": "restaurant",
  cafe: "restaurant",
  cafeteria: "restaurant",
  kitchen: "restaurant",
  dining: "restaurant",

  // parking
  parking: "parking",
  garage: "parking",
  "parking garage": "parking",
  "parking structure": "parking",
  "parking deck": "parking",
};

/**
 * Map an AI-detected building type string to a BUILDING_TYPES key.
 * Returns null if no match found.
 */
export function mapBuildingTypeKey(aiDetectedType) {
  if (!aiDetectedType) return null;

  const lower = aiDetectedType.toLowerCase().trim();

  // Direct alias match
  if (BUILDING_TYPE_ALIASES[lower]) return BUILDING_TYPE_ALIASES[lower];

  // Check if it's already a valid key
  if (BUILDING_TYPES.some(bt => bt.key === lower)) return lower;

  // Fuzzy: check if any alias is contained in the input
  for (const [alias, key] of Object.entries(BUILDING_TYPE_ALIASES)) {
    if (lower.includes(alias)) return key;
  }

  // Fuzzy: check if input is contained in any BUILDING_TYPES label
  for (const bt of BUILDING_TYPES) {
    if (bt.label.toLowerCase().includes(lower) || lower.includes(bt.label.toLowerCase())) {
      return bt.key;
    }
  }

  return null;
}

// ─── Work Type Inference ──────────────────────────────────────────────
/**
 * Infer work type from drawing notes results.
 * Uses presence of demolition notes, keyword signals, etc.
 *
 * @param {Array} notesResults — validNotesResults from Phase 1.5
 * @returns {string} WORK_TYPES key
 */
export function inferWorkType(notesResults) {
  if (!notesResults || notesResults.length === 0) return "new-construction";

  // Flatten all notes
  const allNotes = notesResults.flatMap(r => r.notes || []);

  // Count demolition notes
  const demoNotes = allNotes.filter(n => n.category === "demolition-notes");

  // Collect all note text for keyword search
  const allText = allNotes
    .map(n => (n.text || "").toLowerCase())
    .join(" ");

  // Check for specific work type signals
  if (/tenant\s*(fit[- ]?out|improvement)|(\bti\b.*improvement)/i.test(allText)) {
    return "tenant-fit-out";
  }

  if (/adaptive\s*reuse/i.test(allText)) {
    return "adaptive-reuse";
  }

  if (/historic(al)?\s*(restoration|preservation)/i.test(allText)) {
    return "historic-restoration";
  }

  if (/\baddition\b/i.test(allText) && !/in\s+addition/i.test(allText)) {
    return "addition";
  }

  // Demolition signals
  if (demoNotes.length > 3) return "gut-renovation";
  if (demoNotes.length > 0) return "renovation";

  // General renovation signals (even without explicit demo notes)
  if (/\brenovation\b|\bremodel\b|\brefurbish/i.test(allText)) {
    return "renovation";
  }

  return "new-construction";
}
