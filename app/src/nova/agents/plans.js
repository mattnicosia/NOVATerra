/**
 * NOVA-Plans — Construction Drawing Reading Specialist
 *
 * This agent reads and interprets construction drawings:
 * - Schedule detection and parsing
 * - Notes extraction and grouping
 * - Title block interpretation
 * - Mark counting on floor plans
 * - Drawing type classification
 *
 * Knowledge source: ../knowledge/drawings.md (Matt edits manually)
 * Abbreviations: ../knowledge/abbreviations.md
 */

// Import knowledge documents as raw strings (Vite ?raw)
import drawingsKnowledge from "../knowledge/drawings.md?raw";
import abbreviationsKnowledge from "../knowledge/abbreviations.md?raw";
import { useCorrectionStore } from "../learning/correctionStore";
import { useFirmMemoryStore } from "../learning/firmMemory";

// ── Knowledge sections ──────────────────────────────────────────
// The knowledge documents are long. We extract relevant sections
// per task rather than injecting the entire document every time.

function extractSection(doc, sectionHeader) {
  if (!doc) return "";
  // Find section by ## header
  const regex = new RegExp(`^## ${sectionHeader}[\\s\\S]*?(?=^## |$)`, "m");
  const match = doc.match(regex);
  return match ? match[0].trim() : "";
}

// ── System Prompts ──────────────────────────────────────────────

const BASE_PERSONA = `You are NOVA-Plans, an expert construction drawing analyst with 30 years of experience reading commercial construction drawing sets. You have read tens of thousands of drawing sets across every project type — office, healthcare, retail, industrial, education, hospitality, and mixed-use.

You think like a chief estimator: when you look at a drawing, you immediately identify what information is relevant for cost estimation. You know every abbreviation, every schedule format, every architect's convention.

Key principles:
- ACCURACY over speed. A misread dimension or wrong material costs real money.
- When uncertain, say so. Flag low-confidence readings rather than guessing.
- Construction drawings are the SOURCE OF TRUTH. When notes conflict with schedules, note the discrepancy.
- OCR text is a helpful cross-reference but images are primary. OCR can misread characters.
- Always normalize inconsistent formatting (e.g., "3'-0\\"" and "3'0\\"" and "36\\"" all mean the same thing).
- Fire ratings are critical safety data — never guess. Mark as uncertain if unclear.
- "U.N.O." means the default applies everywhere unless specifically overridden on a drawing.
- When parsing schedules, extract ALL rows even if some cells are empty. Empty cells ≠ missing rows.
- For quantities, look at the floor plans to count marks, not just the schedule. Schedule lists types; plans show locations.

Output formatting:
- Return structured JSON when parsing schedules (no prose).
- Use consistent field names across schedule types.
- Normalize units (feet-inches to decimal feet when needed for calculations).
- Include a confidence score (0-1) for each parsed field.`;

/**
 * Build the full system prompt for NOVA-Plans
 * @param {object} context - { projectType, firmName, sheetType }
 * @returns {string}
 */
function systemPrompt(context = {}) {
  const parts = [BASE_PERSONA];

  // Add relevant knowledge sections based on context
  if (drawingsKnowledge && drawingsKnowledge.length > 50) {
    parts.push("\n\n--- CONSTRUCTION DRAWING KNOWLEDGE BASE ---\n");
    parts.push(drawingsKnowledge);
  }

  if (abbreviationsKnowledge && abbreviationsKnowledge.length > 50) {
    parts.push("\n\n--- ABBREVIATION DICTIONARY ---\n");
    // For abbreviations, always include the full dictionary (it's a reference)
    parts.push(abbreviationsKnowledge);
  }

  if (context.projectType) {
    parts.push(`\n\nThis is a ${context.projectType} project. Apply project-type-specific knowledge.`);
  }

  if (context.firmName) {
    parts.push(`\n\nThe architect/engineer is: ${context.firmName}. Apply any firm-specific patterns you know.`);

    // Inject learned firm patterns from memory
    try {
      const firmContext = useFirmMemoryStore.getState().buildFirmContext(context.firmName, 1000);
      if (firmContext) parts.push(`\n\n--- FIRM MEMORY ---\n${firmContext}`);
    } catch {
      /* firm memory may not be hydrated yet */
    }
  }

  return parts.join("\n");
}

/**
 * Get a specific knowledge section
 * @param {string} section - "sheets", "schedules", "notes", "marks", "abbreviations", "ocr-misreads"
 * @param {object} context
 * @returns {string}
 */
function getKnowledge(section, _context = {}) {
  switch (section) {
    case "sheets":
      return extractSection(drawingsKnowledge, "Sheet Identification");
    case "schedules":
      return extractSection(drawingsKnowledge, "Schedule Table Formats");
    case "notes":
      return extractSection(drawingsKnowledge, "Drawing Notes Conventions");
    case "marks":
      return extractSection(drawingsKnowledge, "Mark and Symbol Systems");
    case "dimensions":
      return extractSection(drawingsKnowledge, "Dimension and Measurement");
    case "ocr-misreads":
      return extractSection(drawingsKnowledge, "Common OCR Misreads");
    case "abbreviations":
      return abbreviationsKnowledge || "";
    default:
      return "";
  }
}

/**
 * Build augmented detection prompt with knowledge context
 * @param {string} drawingLabel
 * @param {string} ocrText
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
function augmentDetectionPrompt(_drawingLabel, _ocrText) {
  // For detection, we need sheet identification + schedule format knowledge
  const knowledge = [getKnowledge("sheets"), getKnowledge("schedules")].filter(Boolean).join("\n\n");

  const sys = knowledge ? `${BASE_PERSONA}\n\n--- DRAWING KNOWLEDGE ---\n${knowledge}` : BASE_PERSONA;

  return { systemPrompt: sys };
}

/**
 * Build augmented parse prompt with knowledge context
 * @param {string} scheduleType - e.g., "door", "window", "wall-types"
 * @param {string} ocrText
 * @returns {{ systemPrompt: string }}
 */
function augmentParsePrompt(scheduleType, ocrText, firmName) {
  const knowledge = [getKnowledge("schedules"), getKnowledge("abbreviations"), getKnowledge("ocr-misreads")]
    .filter(Boolean)
    .join("\n\n");

  // Inject correction memory (self-learning from user edits)
  let correctionContext = "";
  try {
    correctionContext = useCorrectionStore.getState().buildCorrectionContext(scheduleType, 1500);
  } catch {
    /* correction store may not be hydrated yet */
  }

  // Inject firm memory (cross-project learned patterns)
  let firmContext = "";
  try {
    if (firmName) {
      firmContext = useFirmMemoryStore.getState().buildFirmContext(firmName, 800);
    }
  } catch {
    /* firm memory may not be hydrated yet */
  }

  const parts = [BASE_PERSONA];
  if (knowledge) parts.push(`\n\n--- DRAWING KNOWLEDGE ---\n${knowledge}`);
  if (correctionContext) parts.push(`\n\n--- LEARNED CORRECTIONS ---\n${correctionContext}`);
  if (firmContext) parts.push(`\n\n--- FIRM MEMORY ---\n${firmContext}`);

  return { systemPrompt: parts.join("") };
}

/**
 * Build augmented notes prompt with knowledge context
 * @returns {{ systemPrompt: string }}
 */
function augmentNotesPrompt() {
  const knowledge = [getKnowledge("notes"), getKnowledge("abbreviations")].filter(Boolean).join("\n\n");

  const sys = knowledge ? `${BASE_PERSONA}\n\n--- DRAWING KNOWLEDGE ---\n${knowledge}` : BASE_PERSONA;

  return { systemPrompt: sys };
}

export const novaPlans = {
  name: "NOVA-Plans",
  systemPrompt,
  getKnowledge,
  augmentDetectionPrompt,
  augmentParsePrompt,
  augmentNotesPrompt,
};
