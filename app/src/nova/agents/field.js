/**
 * NOVA-Field — Construction Means & Methods Specialist
 *
 * Knowledge source: ../knowledge/field.md
 * Used by: Schedule validation, sequencing logic, duration estimation,
 *          crew sizing, productivity analysis, weather impact assessment
 */

import fieldKnowledge from "../knowledge/field.md?raw";

// ── Knowledge section extractor ──────────────────────────────────
function extractSection(doc, sectionHeader) {
  if (!doc) return "";
  const regex = new RegExp(`^##+ ${sectionHeader}[\\s\\S]*?(?=^##+ |$)`, "m");
  const match = doc.match(regex);
  return match ? match[0].trim() : "";
}

const BASE_PERSONA = `You are NOVA-Field, a construction means & methods expert with 30 years of field experience on commercial projects. You know HOW buildings get built — the sequencing, the crew composition, the productivity rates, the weather impacts, the equipment logistics. You think like a superintendent and price like an estimator.

Key principles:
- The drawings show WHAT. You know HOW.
- Construction sequencing follows a master dependency chain: Site Work → Foundations → Structure → Envelope → Rough-ins → Finishes → Commissioning → Punch List.
- Each phase gates the next — no phase fully completes until its predecessor is ≥80% complete.
- Crew productivity is the #1 variable in labor cost. Union vs open-shop, weather, learning curve, site access.
- Equipment selection drives both cost and schedule. Wrong crane = wrong everything.
- Weather sensitivity varies by trade. Concrete and earthwork are the most weather-exposed.
- Safety requirements are non-negotiable and have real cost: OSHA compliance, fall protection, confined space.
- Temporary facilities (power, water, hoisting, protection) are always underestimated.

Output formatting:
- Return structured JSON for sequencing and duration estimates.
- Flag critical path items explicitly.
- Include weather sensitivity flags per activity.
- Provide crew composition with productivity rates.`;

/**
 * Build the full system prompt for NOVA-Field
 * @param {object} context - { projectType, structureType, location }
 * @returns {string}
 */
function systemPrompt(context = {}) {
  const parts = [BASE_PERSONA];

  if (fieldKnowledge && fieldKnowledge.length > 50) {
    parts.push("\n\n--- MEANS & METHODS KNOWLEDGE BASE ---\n");
    parts.push(fieldKnowledge);
  }

  if (context.projectType) {
    parts.push(`\n\nThis is a ${context.projectType} project. Apply relevant construction methods.`);
  }
  if (context.structureType) {
    parts.push(`\n\nStructural system: ${context.structureType}. Apply system-specific sequencing.`);
  }
  if (context.location) {
    parts.push(`\n\nProject location: ${context.location}. Consider climate and labor market.`);
  }

  return parts.join("\n");
}

/**
 * Get a specific knowledge section
 * @param {string} section
 * @param {object} context
 * @returns {string}
 */
function getKnowledge(section, context = {}) {
  switch (section) {
    case "sequencing":
      return extractSection(fieldKnowledge, "1.1 Standard Commercial Building Sequence");
    case "site-work":
      return extractSection(fieldKnowledge, "Phase 1: Site Work");
    case "foundations":
      return extractSection(fieldKnowledge, "Phase 2: Foundations");
    case "structure":
      return extractSection(fieldKnowledge, "Phase 3: Structure");
    case "envelope":
      return extractSection(fieldKnowledge, "Phase 4");
    case "rough-ins":
      return extractSection(fieldKnowledge, "Phase 5");
    case "finishes":
      return extractSection(fieldKnowledge, "Phase 6");
    case "equipment":
      return extractSection(fieldKnowledge, "Equipment");
    case "crew-productivity":
      return extractSection(fieldKnowledge, "Crew");
    case "weather":
      return extractSection(fieldKnowledge, "Weather");
    default:
      return "";
  }
}

export const novaField = {
  name: "NOVA-Field",
  systemPrompt,
  getKnowledge,
};
