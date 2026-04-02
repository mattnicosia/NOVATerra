/**
 * legendParser.js — Auto-detect and parse symbol legends from construction drawings.
 *
 * Called once per legend sheet (~$0.02 via Haiku, <3 seconds).
 * Results are cached forever in legendStore — every subsequent
 * prediction call gets symbol definitions as context.
 *
 * This is the single biggest accuracy unlock for auto-takeoffs.
 * Instead of "find recessed troffers" with no visual reference,
 * NOVA knows "recessed troffers look like rectangles with X patterns,
 * tagged as type A on this project."
 */

import { callAnthropic, imageBlock, SCAN_MODEL } from "@/utils/ai";
import { useLegendStore } from "@/stores/legendStore";
import { useEstimatesStore } from "@/stores/estimatesStore";

// ── Discipline detection from sheet number prefix ──
const DISCIPLINE_MAP = {
  e: "electrical",
  p: "plumbing",
  m: "mechanical",
  fp: "fire-protection",
  a: "architectural",
  s: "structural",
  c: "civil",
  l: "landscape",
  g: "general",
  t: "telecommunications",
};

function inferDiscipline(sheetNumber) {
  if (!sheetNumber) return "general";
  const s = sheetNumber.toLowerCase().trim();
  // Try two-char prefix first (fp, etc.)
  if (DISCIPLINE_MAP[s.slice(0, 2)]) return DISCIPLINE_MAP[s.slice(0, 2)];
  // Single-char prefix
  if (DISCIPLINE_MAP[s[0]]) return DISCIPLINE_MAP[s[0]];
  return "general";
}

// ── System prompt for legend parsing ──
const LEGEND_SYSTEM_PROMPT = `You are NOVA, an expert construction plan reader specializing in symbol legend extraction.

Your task: Parse the SYMBOL LEGEND from this construction drawing sheet and extract every symbol definition.

Construction legend conventions:
- Electrical legends show lighting fixtures, receptacles, switches, panels, junction boxes
- Plumbing legends show fixtures (toilets, sinks, urinals), piping types, valve symbols
- Mechanical legends show diffusers, registers, ductwork types, equipment symbols
- Fire protection legends show sprinkler heads, pull stations, extinguisher cabinets
- Architectural legends show door types, wall types, material hatches, window types

For each symbol you find, extract:
1. "code" — The tag/letter/number label (e.g., "A", "D1", "WP")
2. "description" — What the symbol represents (e.g., "2x4 Recessed Fluorescent Troffer")
3. "category" — One of: lighting, receptacle, switch, panel, junction, plumbing, hvac, fire, door, window, wall, equipment, general
4. "symbolDescription" — Brief visual description of the symbol graphic (e.g., "rectangle with X pattern", "circle with dot", "triangle pointing down")

CRITICAL RULES:
1. Return ONLY valid JSON — no markdown, no backticks, no explanation
2. Extract EVERY symbol, not just the first few
3. If you see a table/schedule (door schedule, fixture schedule), extract those entries too
4. If no legend is found on this sheet, return {"symbols":[],"confidence":0,"notes":"No legend found"}
5. Be precise with descriptions — they will be used to identify elements on other sheets`;

const LEGEND_USER_PROMPT = `Parse the symbol legend from this construction drawing.

Return JSON:
{
  "symbols": [
    {
      "code": "<tag>",
      "description": "<what it is>",
      "category": "<category>",
      "symbolDescription": "<what the symbol looks like>"
    }
  ],
  "confidence": <0-1>,
  "notes": "<any observations about the legend>"
}`;

/**
 * Parse a legend from a single drawing.
 *
 * @param {Object} drawing — Drawing object with .data (base64 JPEG), .sheetNumber, .id
 * @returns {Object|null} — Parsed legend entry, or null if no legend found
 */
export async function parseLegendFromDrawing(drawing) {
  if (!drawing?.data) {
    console.warn("[legendParser] No image data for drawing", drawing?.id);
    return null;
  }

  const estimateId = useEstimatesStore.getState().activeEstimateId;
  if (!estimateId) return null;

  // Check if already parsed
  if (useLegendStore.getState().hasLegendForDrawing(estimateId, drawing.id)) {
    console.log(`[legendParser] Already parsed legend for drawing ${drawing.id}, skipping`);
    return useLegendStore.getState().getLegendsForEstimate(estimateId)
      .find(l => l.drawingId === drawing.id);
  }

  try {
    const base64 = drawing.data.includes(",")
      ? drawing.data.split(",")[1]
      : drawing.data;

    const response = await callAnthropic({
      model: SCAN_MODEL, // Haiku — fast and cheap (~$0.01)
      max_tokens: 2000,
      system: LEGEND_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            imageBlock(base64),
            { type: "text", text: LEGEND_USER_PROMPT },
          ],
        },
      ],
    });

    // Extract JSON from response
    const text = response?.content?.[0]?.text || "";
    let parsed;
    try {
      // Try direct parse first
      parsed = JSON.parse(text);
    } catch {
      // Try extracting JSON from markdown code block
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        console.warn("[legendParser] Failed to parse response:", text.slice(0, 200));
        return null;
      }
    }

    const symbols = parsed.symbols || [];
    if (symbols.length === 0) {
      console.log(`[legendParser] No symbols found on sheet ${drawing.sheetNumber || drawing.id}`);
      return null;
    }

    // Validate and clean symbols
    const cleanedSymbols = symbols
      .filter(s => s.description) // Must have a description at minimum
      .map(s => ({
        code: String(s.code || "").trim(),
        description: String(s.description || "").trim(),
        category: String(s.category || "general").toLowerCase().trim(),
        symbolDescription: String(s.symbolDescription || "").trim(),
      }));

    if (cleanedSymbols.length === 0) return null;

    const legendEntry = {
      drawingId: drawing.id,
      discipline: inferDiscipline(drawing.sheetNumber),
      sheetNumber: drawing.sheetNumber || "",
      symbols: cleanedSymbols,
      parsedAt: Date.now(),
      confidence: parsed.confidence || 0.7,
      notes: parsed.notes || "",
    };

    // Store in legendStore (persisted to IDB)
    useLegendStore.getState().addLegend(estimateId, legendEntry);

    console.log(
      `[legendParser] ✓ Parsed ${cleanedSymbols.length} symbols from ` +
      `${drawing.sheetNumber || drawing.id} (${legendEntry.discipline}) — ` +
      `confidence: ${legendEntry.confidence}`
    );

    return legendEntry;
  } catch (err) {
    console.warn("[legendParser] Parse failed:", err.message);
    return null;
  }
}

/**
 * Scan all drawings in the current estimate for legend sheets and parse them.
 * Call this after drawings are uploaded or when entering takeoff mode.
 *
 * @param {Array} drawings — Array of drawing objects
 * @returns {number} — Number of legends parsed
 */
export async function scanForLegends(drawings) {
  if (!drawings?.length) return 0;

  const estimateId = useEstimatesStore.getState().activeEstimateId;
  if (!estimateId) return 0;

  const legendSheets = drawings.filter(d =>
    useLegendStore.getState().isLegendSheet(d) &&
    !useLegendStore.getState().hasLegendForDrawing(estimateId, d.id)
  );

  if (legendSheets.length === 0) {
    console.log("[legendParser] No un-parsed legend sheets found");
    return 0;
  }

  console.log(`[legendParser] Found ${legendSheets.length} legend sheet(s) to parse`);

  let parsed = 0;
  for (const sheet of legendSheets) {
    const result = await parseLegendFromDrawing(sheet);
    if (result) parsed++;
  }

  if (parsed > 0) {
    console.log(`[legendParser] ✓ Parsed ${parsed} legend(s) — symbols cached for predictions`);
  }

  return parsed;
}

/**
 * Get legend context string for a Vision prediction call.
 * Returns empty string if no legends available.
 *
 * @param {string} discipline — "electrical", "plumbing", etc. (optional, for filtering)
 * @returns {string} — Context string to inject into Vision prompt
 */
export function getLegendContext(discipline) {
  const estimateId = useEstimatesStore.getState().activeEstimateId;
  if (!estimateId) return "";
  return useLegendStore.getState().buildLegendContext(estimateId, discipline);
}
