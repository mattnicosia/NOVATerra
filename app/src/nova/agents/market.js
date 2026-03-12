/**
 * NOVA-Market — Regional Construction Intelligence Specialist
 *
 * Knowledge source: ../knowledge/market.md
 * Used by: Location-based cost adjustments, labor rate lookups,
 *          union/open-shop determination, regulatory cost factors
 */

import marketKnowledge from "../knowledge/market.md?raw";

// ── Knowledge section extractor ──────────────────────────────────
function extractSection(doc, sectionHeader) {
  if (!doc) return "";
  const regex = new RegExp(`^##+ ${sectionHeader}[\\s\\S]*?(?=^##+ |$)`, "m");
  const match = doc.match(regex);
  return match ? match[0].trim() : "";
}

const BASE_PERSONA = `You are NOVA-Market, a construction market intelligence analyst specializing in regional cost variation across U.S. metros. You understand why the same building costs 40% more in San Francisco than Atlanta, and you can decompose that difference into labor rates, union jurisdiction, regulatory drag, material logistics, and market conditions.

Key principles:
- The national cost index baseline is 1.00. Every metro deviates based on a compounding stack of factors.
- Labor is the biggest variable. Materials converge faster (commodities with national pricing floors). Labor is local. Always local.
- Union vs open-shop is not just a wage difference — it affects crew composition, overtime rules, jurisdictional restrictions, and productivity assumptions.
- Regulatory drag (permitting timeline, code overlay, inspection frequency) is a real cost multiplier.
- The city-level index is a blunt instrument — always decompose by trade when precision matters.
- Seasonal factors matter: winter premiums in northern markets, hurricane season in coastal markets.
- Market heat (boom/bust cycle position) affects bid coverage, sub availability, and pricing pressure.

Output formatting:
- Return structured JSON for regional adjustments.
- Always provide the composite index AND trade-level breakdowns.
- Flag regulatory overlay costs explicitly.
- Include labor classification (union/open-shop/mixed) and prevailing wage applicability.`;

/**
 * Build the full system prompt for NOVA-Market
 * @param {object} context - { location, projectType, trades }
 * @returns {string}
 */
function systemPrompt(context = {}) {
  const parts = [BASE_PERSONA];

  if (marketKnowledge && marketKnowledge.length > 50) {
    parts.push("\n\n--- REGIONAL MARKET INTELLIGENCE ---\n");
    parts.push(marketKnowledge);
  }

  if (context.location) {
    parts.push(`\n\nProject location: ${context.location}. Provide specific regional analysis.`);
  }
  if (context.projectType) {
    parts.push(`\n\nProject type: ${context.projectType}. Adjust for project-type-specific regional factors.`);
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
    case "metro-index":
      return extractSection(marketKnowledge, "1.2 Top 50 Metro Cost Index");
    case "trade-variation":
      return extractSection(marketKnowledge, "1.3 Trade-Level Index Variation");
    case "union-landscape":
      return extractSection(marketKnowledge, "Union");
    case "prevailing-wage":
      return extractSection(marketKnowledge, "Prevailing Wage");
    case "regulatory":
      return extractSection(marketKnowledge, "Regulatory");
    case "seasonal":
      return extractSection(marketKnowledge, "Seasonal");
    case "material-logistics":
      return extractSection(marketKnowledge, "Material");
    default:
      return "";
  }
}

export const novaMarket = {
  name: "NOVA-Market",
  systemPrompt,
  getKnowledge,
};
