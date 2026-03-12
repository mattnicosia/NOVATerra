/**
 * NOVA-Cost — Construction Cost Estimating Specialist
 *
 * Knowledge sources:
 *   ../knowledge/cost.md — CSI divisions, $/SF ranges, scope gaps, sub overlaps, ROM methodology
 *   ../knowledge/market.md — Regional cost indices, labor rates, regulatory factors
 *
 * Used by: ROM augmentation, cost validation, pricing suggestions, regional adjustments
 */

import costKnowledge from "../knowledge/cost.md?raw";
import marketKnowledge from "../knowledge/market.md?raw";

// ── Knowledge section extractor ──────────────────────────────────
function extractSection(doc, sectionHeader) {
  if (!doc) return "";
  const regex = new RegExp(`^##+ ${sectionHeader}[\\s\\S]*?(?=^##+ |$)`, "m");
  const match = doc.match(regex);
  return match ? match[0].trim() : "";
}

const BASE_PERSONA = `You are NOVA-Cost, a senior construction cost estimator with 30 years of commercial estimating experience. You think in $/SF, crew productivity rates, and CSI division structure. You know cost drivers by heart and can ballpark a project within 10% from plans alone.

Key principles:
- Every number must be defensible. No made-up unit costs.
- Flag assumptions explicitly. "Assuming open-shop rates" or "Based on 2024 RS Means national average."
- Regional factors matter. Always consider location impact on labor and materials.
- Historical calibration > generic benchmarks. When calibration data exists, use it.
- Scope gaps between divisions are where budgets blow up. Always check the gap zones.
- Division 01 (General Requirements) is the most commonly underestimated division.
- MEP trades (Div 21-28) together often represent 35-45% of total hard cost on commercial work.
- When in doubt, price the spec, not the drawing. Specs define quality; drawings define quantity.

Output formatting:
- Return structured JSON for cost breakdowns (no prose).
- Always include confidence levels for unit costs.
- Flag scope gaps and sub overlap risks explicitly.
- Include regional adjustment factors when location is known.`;

/**
 * Build the full system prompt for NOVA-Cost
 * @param {object} context - { projectType, location, sqft }
 * @returns {string}
 */
function systemPrompt(context = {}) {
  const parts = [BASE_PERSONA];

  if (costKnowledge && costKnowledge.length > 50) {
    parts.push("\n\n--- COST ESTIMATING KNOWLEDGE BASE ---\n");
    parts.push(costKnowledge);
  }

  if (marketKnowledge && marketKnowledge.length > 50) {
    parts.push("\n\n--- REGIONAL MARKET INTELLIGENCE ---\n");
    parts.push(marketKnowledge);
  }

  if (context.projectType) {
    parts.push(`\n\nThis is a ${context.projectType} project. Apply project-type-specific cost knowledge.`);
  }
  if (context.location) {
    parts.push(`\n\nProject location: ${context.location}. Apply regional cost factors.`);
  }
  if (context.sqft) {
    parts.push(`\n\nProject size: ${context.sqft} SF. Adjust unit costs for scale.`);
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
    case "csi-divisions":
      return extractSection(costKnowledge, "1.1 All 50 Divisions");
    case "project-types":
      return extractSection(costKnowledge, "1.2 Cost Dominance by Project Type");
    case "scope-gaps":
      return extractSection(costKnowledge, "1.3 Common Scope Gaps");
    case "sub-overlaps":
      return extractSection(costKnowledge, "1.4 Sub Overlap Matrix");
    case "regional-index":
      return extractSection(marketKnowledge, "1.2 Top 50 Metro Cost Index");
    case "trade-variation":
      return extractSection(marketKnowledge, "1.3 Trade-Level Index Variation");
    case "labor-rates":
      return extractSection(marketKnowledge, "Labor");
    case "material-trends":
      return extractSection(marketKnowledge, "Material");
    default:
      return "";
  }
}

export const novaCost = {
  name: "NOVA-Cost",
  systemPrompt,
  getKnowledge,
};
