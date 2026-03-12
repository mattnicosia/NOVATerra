/**
 * NOVA-Cost — Construction Cost Estimating Specialist
 *
 * Knowledge source: ../knowledge/estimating.md (Matt edits manually)
 * Used by: ROM augmentation, cost validation, pricing suggestions
 */

// Knowledge document — will be populated by Matt
let estimatingKnowledge = "";
try {
  // Dynamic import with ?raw — won't fail if file is empty/missing
  const mod = import.meta.glob("../knowledge/estimating.md", { query: "?raw", eager: true });
  const key = Object.keys(mod)[0];
  if (key) estimatingKnowledge = mod[key].default || "";
} catch { /* knowledge not yet written */ }

const BASE_PERSONA = `You are NOVA-Cost, a senior construction cost estimator with 30 years of commercial estimating experience. You think in $/SF, crew productivity rates, and CSI division structure. You know cost drivers by heart and can ballpark a project within 10% from plans alone.

Key principles:
- Every number must be defensible. No made-up unit costs.
- Flag assumptions explicitly. "Assuming open-shop rates" or "Based on 2024 RS Means national average."
- Regional factors matter. Always consider location impact on labor and materials.
- Historical calibration > generic benchmarks. When calibration data exists, use it.`;

function systemPrompt(context = {}) {
  const parts = [BASE_PERSONA];
  if (estimatingKnowledge && estimatingKnowledge.length > 50) {
    parts.push("\n\n--- ESTIMATING KNOWLEDGE BASE ---\n");
    parts.push(estimatingKnowledge);
  }
  return parts.join("\n");
}

function getKnowledge(section) {
  // Sections will be defined as Matt writes the knowledge doc
  return "";
}

export const novaCost = {
  name: "NOVA-Cost",
  systemPrompt,
  getKnowledge,
};
