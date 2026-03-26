// Subdivision AI Engine — LLM-powered subdivision cost allocation
// Generates percentage-based breakdowns within CSI divisions using Claude.
// Outputs %s, not $s — dollar amounts derived from BENCHMARKS x percentage.

import { callAnthropic, SCAN_MODEL } from "@/utils/ai";
import { CSI } from "@/constants/csi";
import { SEED_ELEMENTS } from "@/constants/seedAssemblies";

// ─── CONSTANTS ───────────────────────────────────────────────────

const SUBDIVISION_SYSTEM_PROMPT = `You are a construction cost estimating expert specializing in CSI MasterFormat subdivision cost allocation.
Your task: distribute a division's total cost across its CSI subdivisions as percentage allocations.
Rules:
- Output ONLY valid JSON array — no markdown, no explanation
- Each item: { "code": "XX.XXX", "label": "Short Name", "pctOfDiv": 0.XX }
- pctOfDiv values MUST sum to exactly 1.00
- Only include subdivisions that carry meaningful cost (>=3%)
- Use realistic construction industry cost distributions`;

const MAX_TOKENS = 1500;
const TEMPERATURE = 0.3;

// ─── INTERNAL: Parse & Validate LLM Response ────────────────────

/**
 * Parse LLM text response into a validated subdivision array.
 * Handles markdown code blocks, validates structure, and normalizes
 * percentages to sum exactly to 1.0.
 *
 * @param {string} text — Raw LLM response text
 * @returns {Array|null} — Parsed subdivision array or null on failure
 */
export function parseSubdivisionResponse(text) {
  if (!text || typeof text !== "string") return null;

  try {
    // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
    let cleaned = text.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    // Attempt JSON parse
    const parsed = JSON.parse(cleaned);

    // Must be an array
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    // Validate each item has required fields
    const valid = parsed.filter(item => {
      if (!item || typeof item !== "object") return false;
      if (typeof item.code !== "string" || !item.code.trim()) return false;
      if (typeof item.label !== "string" || !item.label.trim()) return false;
      if (typeof item.pctOfDiv !== "number" || item.pctOfDiv <= 0) return false;
      return true;
    });

    if (valid.length === 0) return null;

    // Normalize pctOfDiv values to sum to exactly 1.0
    const rawSum = valid.reduce((sum, item) => sum + item.pctOfDiv, 0);
    if (rawSum <= 0) return null;

    const normalized = valid.map(item => ({
      code: item.code.trim(),
      label: item.label.trim(),
      pctOfDiv: Math.round((item.pctOfDiv / rawSum) * 10000) / 10000, // 4 decimal places
    }));

    // Fix any floating-point drift — adjust the largest item so sum is exactly 1.0
    const normalizedSum = normalized.reduce((sum, item) => sum + item.pctOfDiv, 0);
    const drift = 1.0 - normalizedSum;
    if (Math.abs(drift) > 0.0001) {
      // Find the largest allocation and absorb the drift
      const largestIdx = normalized.reduce(
        (maxIdx, item, idx) => (item.pctOfDiv > normalized[maxIdx].pctOfDiv ? idx : maxIdx),
        0,
      );
      normalized[largestIdx].pctOfDiv = Math.round((normalized[largestIdx].pctOfDiv + drift) * 10000) / 10000;
    }

    return normalized;
  } catch (err) {
    console.warn("[SubdivisionAI] Failed to parse LLM response:", err.message);
    return null;
  }
}

// ─── SINGLE DIVISION: Generate Subdivision Breakdown ────────────

/**
 * Generate subdivision percentage allocations for a single CSI division.
 * Calls the LLM with division context, valid subdivision codes, and seed
 * assembly items for grounding. Returns percentage-based allocations — NOT
 * dollar amounts.
 *
 * @param {Object} params
 * @param {string} params.buildingType — e.g. "Office", "Healthcare", "Residential"
 * @param {string} params.divisionCode — CSI division code, e.g. "03"
 * @param {string} params.divisionLabel — Division name, e.g. "Concrete"
 * @param {number} params.divisionPerSF — Division $/SF benchmark value
 * @param {number} params.projectSF — Total project square footage
 * @param {Array}  params.existingSeedItems — Seed elements in this division (for grounding)
 * @param {AbortSignal} [params.signal] — Optional abort signal for cancellation
 * @returns {Array|null} — Array of { code, label, pctOfDiv, source, generatedAt } or null on error
 */
export async function generateSubdivisionBreakdown({
  buildingType,
  divisionCode,
  divisionLabel,
  divisionPerSF,
  projectSF,
  existingSeedItems,
  signal,
}) {
  try {
    // Look up valid CSI subdivision codes for this division
    const csiDiv = CSI[divisionCode];
    if (!csiDiv || !csiDiv.subs) {
      console.warn(`[SubdivisionAI] No CSI subdivision data for division ${divisionCode}`);
      return null;
    }

    const validSubs = Object.entries(csiDiv.subs).map(([code, label]) => `${code}: ${label}`);

    // Filter seed elements to this division for grounding context
    const seedItems = (
      existingSeedItems || SEED_ELEMENTS.filter(el => el.code && el.code.startsWith(divisionCode + "."))
    ).slice(0, 20); // Cap at 20 to keep prompt compact

    const seedContext =
      seedItems.length > 0
        ? `\nSeed assembly items in this division (for reference):\n${seedItems
            .map(s => `  - ${s.code} ${s.name} (${s.unit})`)
            .join("\n")}`
        : "";

    // Build the user message
    const divTotal = divisionPerSF * projectSF;
    const userMessage = `Building type: ${buildingType}
Division: ${divisionCode} — ${divisionLabel}
Division $/SF: $${divisionPerSF.toFixed(2)}/SF (total: $${divTotal.toLocaleString()})
Project size: ${projectSF.toLocaleString()} SF

Valid CSI subdivision codes for this division:
${validSubs.map(s => `  - ${s}`).join("\n")}
${seedContext}

Distribute the division cost across its subdivisions as percentage allocations. Return ONLY a JSON array.`;

    // Call LLM
    const response = await callAnthropic({
      model: SCAN_MODEL, // Haiku — math-heavy allocation, no judgment needed
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: userMessage }],
      system: SUBDIVISION_SYSTEM_PROMPT,
      temperature: TEMPERATURE,
      signal,
    });

    // Parse the response (callAnthropic returns string for text responses)
    const parsed = parseSubdivisionResponse(typeof response === "string" ? response : "");
    if (!parsed) {
      console.warn(`[SubdivisionAI] Failed to parse response for Div ${divisionCode}`);
      return null;
    }

    // Stamp each item with metadata
    const generatedAt = new Date().toISOString();
    const result = parsed.map(item => ({
      ...item,
      source: "llm",
      generatedAt,
    }));

    console.log(`[SubdivisionAI] Generated ${result.length} subdivisions for Div ${divisionCode}`);
    return result;
  } catch (err) {
    if (err.name === "AbortError") throw err; // Propagate cancellation
    console.error(`[SubdivisionAI] Error generating subdivisions for Div ${divisionCode}:`, err.message);
    return null;
  }
}

// ─── BATCH: Generate All Subdivisions ───────────────────────────

/**
 * Batch-generate subdivision breakdowns for ALL divisions in a ROM result.
 * Processes divisions sequentially to avoid rate limits. Partial results are
 * returned if individual divisions fail.
 *
 * @param {Object} params
 * @param {Object} params.romResult — ROM result object with `divisions` map
 * @param {string} params.buildingType — Building type label
 * @param {Array}  [params.seedElements] — Full seed elements array (defaults to SEED_ELEMENTS)
 * @param {AbortSignal} [params.signal] — Optional abort signal
 * @param {Function} [params.onProgress] — Progress callback: (divCode, divIndex, totalDivisions) => void
 * @returns {Object} — Map of { [divCode]: subdivisionArray }
 */
export async function generateAllSubdivisions({ romResult, buildingType, seedElements, signal, onProgress }) {
  if (!romResult?.divisions) {
    console.warn("[SubdivisionAI] No divisions in ROM result");
    return {};
  }

  const allSeeds = seedElements || SEED_ELEMENTS;
  const divEntries = Object.entries(romResult.divisions);
  const totalDivisions = divEntries.length;
  const results = {};

  console.log(`[SubdivisionAI] Starting batch generation for ${totalDivisions} divisions (${buildingType})`);

  for (let i = 0; i < divEntries.length; i++) {
    // Check for cancellation between divisions
    if (signal?.aborted) {
      console.log("[SubdivisionAI] Aborted — returning partial results");
      break;
    }

    const [divCode, divData] = divEntries[i];

    // Skip divisions with no cost data
    // perSF is an object { low, mid, high } from ROM engine
    const midPerSF = typeof divData?.perSF === "object" ? divData.perSF.mid : divData?.perSF || 0;
    if (!divData || midPerSF <= 0) {
      console.log(`[SubdivisionAI] Skipping Div ${divCode} — no cost data`);
      if (onProgress) onProgress(divCode, i, totalDivisions);
      continue;
    }

    // Filter seed elements for this division
    const divSeedItems = allSeeds.filter(el => el.code && el.code.startsWith(divCode + "."));

    try {
      const subdivisions = await generateSubdivisionBreakdown({
        buildingType,
        divisionCode: divCode,
        divisionLabel: divData.label || CSI[divCode]?.name || `Division ${divCode}`,
        divisionPerSF: midPerSF,
        projectSF: romResult.projectSF || romResult.totalSF || 0,
        existingSeedItems: divSeedItems,
        signal,
      });

      if (subdivisions) {
        results[divCode] = subdivisions;
      }
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("[SubdivisionAI] Aborted during division generation");
        break;
      }
      // Log warning and continue — partial results are acceptable
      console.warn(`[SubdivisionAI] Division ${divCode} failed, continuing:`, err.message);
    }

    // Report progress after each division completes
    if (onProgress) onProgress(divCode, i, totalDivisions);
  }

  const generatedCount = Object.keys(results).length;
  const totalSubs = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
  console.log(
    `[SubdivisionAI] Batch complete: ${generatedCount}/${totalDivisions} divisions, ${totalSubs} total subdivisions`,
  );

  return results;
}
