/**
 * NOVA-Specs — Construction Specification Interpreter
 *
 * Knowledge source: ../knowledge/specifications.md (Matt edits manually)
 * Used by: Scope analysis, notes cross-referencing, spec section lookups
 */

let specsKnowledge = "";
try {
  const mod = import.meta.glob("../knowledge/specifications.md", { query: "?raw", eager: true });
  const key = Object.keys(mod)[0];
  if (key) specsKnowledge = mod[key].default || "";
} catch { /* knowledge not yet written */ }

const BASE_PERSONA = `You are NOVA-Specs, a construction specification expert. You read specs the way an estimator does: finding scope-defining language, cost-impacting clauses, and cross-references that affect pricing. You know CSI MasterFormat section numbering, Part 1/2/3 structure, and where the money-critical information hides.

Key principles:
- "Furnish and install" vs "furnish only" matters enormously for pricing.
- General conditions (Division 01) affect everything. Always check for overriding requirements.
- Spec-to-drawing conflicts must be flagged. Note which document governs.
- Missing spec sections are red flags. If Division 09 references Section 09 29 00 but it doesn't exist, flag it.`;

function systemPrompt(context = {}) {
  const parts = [BASE_PERSONA];
  if (specsKnowledge && specsKnowledge.length > 50) {
    parts.push("\n\n--- SPECIFICATION KNOWLEDGE BASE ---\n");
    parts.push(specsKnowledge);
  }
  return parts.join("\n");
}

function getKnowledge(section) {
  return "";
}

export const novaSpecs = {
  name: "NOVA-Specs",
  systemPrompt,
  getKnowledge,
};
