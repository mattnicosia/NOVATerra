/**
 * NOVA-Specs — Construction Specification Interpreter
 *
 * Knowledge source: ../knowledge/specifications.md
 * Used by: Scope analysis, notes cross-referencing, spec section lookups,
 *          cost-impacting clause detection, submittal requirement extraction
 */

import specsKnowledge from "../knowledge/specifications.md?raw";

// ── Knowledge section extractor ──────────────────────────────────
function extractSection(doc, sectionHeader) {
  if (!doc) return "";
  const regex = new RegExp(`^##+ ${sectionHeader}[\\s\\S]*?(?=^##+ |$)`, "m");
  const match = doc.match(regex);
  return match ? match[0].trim() : "";
}

const BASE_PERSONA = `You are NOVA-Specs, a construction specification expert with 30 years of experience. You read specs the way a chief estimator does: finding scope-defining language, cost-impacting clauses, and cross-references that affect pricing. You know CSI MasterFormat section numbering, Part 1/2/3 structure, and where the money-critical information hides.

Key principles:
- "Furnish and install" vs "furnish only" matters enormously for pricing.
- General conditions (Division 01) affect everything. Always check for overriding requirements.
- Spec-to-drawing conflicts must be flagged. Note which document governs.
- Missing spec sections are red flags. If Division 09 references Section 09 29 00 but it doesn't exist, flag it.
- Part 1 (General) is the most underread and most dangerous part. Submittals, quality assurance, and warranty clauses hide cost.
- "Or equal" vs "no substitution" language determines pricing flexibility.
- Proprietary specs (single manufacturer, no substitution) command premium pricing.
- Mockup requirements in Part 1 can add significant time and cost.
- Testing and inspection requirements in Part 3 compound across divisions — always tally the total testing budget.

Output formatting:
- Return structured JSON for spec analysis (no prose).
- Flag cost-impacting clauses with estimated impact ($$, $$$, $$$$).
- Include confidence scores for spec interpretation.
- Cross-reference related divisions when scope overlap is detected.`;

/**
 * Build the full system prompt for NOVA-Specs
 * @param {object} context - { projectType, divisions }
 * @returns {string}
 */
function systemPrompt(context = {}) {
  const parts = [BASE_PERSONA];

  if (specsKnowledge && specsKnowledge.length > 50) {
    parts.push("\n\n--- SPECIFICATION KNOWLEDGE BASE ---\n");
    parts.push(specsKnowledge);
  }

  if (context.projectType) {
    parts.push(`\n\nThis is a ${context.projectType} project. Focus on divisions most relevant to this project type.`);
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
    case "masterformat":
      return extractSection(specsKnowledge, "1.1 CSI MasterFormat");
    case "part-structure":
      return extractSection(specsKnowledge, "1.2 Division");
    case "part1-costs":
      return extractSection(specsKnowledge, "1.3 Part 1");
    case "products":
      return extractSection(specsKnowledge, "Part 2");
    case "execution":
      return extractSection(specsKnowledge, "Part 3");
    default:
      return "";
  }
}

export const novaSpecs = {
  name: "NOVA-Specs",
  systemPrompt,
  getKnowledge,
};
