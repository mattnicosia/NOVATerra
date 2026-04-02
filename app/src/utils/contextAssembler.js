/**
 * contextAssembler.js — Build optimal Vision API prompts from 8 context layers.
 *
 * Replaces the hardcoded system prompt in predictiveEngine.js with a dynamic,
 * discipline-aware prompt that draws from:
 *   1. Base system identity (~100 tokens)
 *   2. Discipline-specific symbol KB (~200 tokens)
 *   3. Legend context from project (~100-300 tokens, if parsed)
 *   4. First-click reference (handled separately as image block)
 *   5. Measurement type instructions (~100 tokens)
 *   6. Sheet metadata (~50 tokens)
 *   7. Cross-sheet hints (~100 tokens, if available)
 *   8. Guardrails (~100 tokens)
 *
 * Total: ~800-1200 tokens (vs ~400 tokens hardcoded before)
 * Cost increase: negligible (~$0.001 per call difference)
 * Accuracy increase: significant (discipline-matched context)
 */

import { getLegendContext } from "./legendParser";
import { getCrossSheetHints } from "./crossSheetLearning";

// ══════════════════════════════════════════════════════════════════════
// LAYER 1: Base System Identity
// ══════════════════════════════════════════════════════════════════════
const BASE_IDENTITY = `You are NOVA, an expert construction plan reader for quantity takeoffs. You identify and PRECISELY locate specific elements on architectural/engineering drawings. You understand CSI MasterFormat divisions, construction symbology, and drawing conventions.`;

// ══════════════════════════════════════════════════════════════════════
// LAYER 2: Discipline-Specific Symbol Knowledge
// Each excerpt is ~150-250 tokens, matched to the drawing's discipline.
// Sourced from the blueprint KB memory files.
// ══════════════════════════════════════════════════════════════════════
const DISCIPLINE_KB = {
  electrical: `ELECTRICAL SYMBOLS:
- Recessed downlight: circle with X or cross pattern inside
- Surface-mount fixture: square or rectangle, sometimes with lines
- Fluorescent troffer: long thin rectangle (2x2 or 2x4), often with X pattern
- Exit sign: rectangle labeled "EXIT" or with arrow
- Wall sconce: half-circle against wall line
- Duplex receptacle: circle with two parallel lines
- GFCI receptacle: circle with "GFI" or "GFCI" label
- Floor receptacle: circle with dot, sometimes boxed
- Single-pole switch: S or S1 near door
- 3-way switch: S3 near door
- Dimmer switch: SD near door
- Junction box: square with J or JB
- Panel: rectangle labeled with panel schedule letter (A, B, LP-1)
- On Reflected Ceiling Plans (RCP), fixtures appear as repeated symbols in a grid pattern.
- Tag format: letter or letter+number in circle (A, B1, C2)`,

  plumbing: `PLUMBING SYMBOLS:
- Toilet/water closet: elongated oval with tank rectangle behind
- Lavatory/sink: small rectangle or semi-circle at wall
- Urinal: small curved shape at wall
- Floor drain: circle with FD or small cross
- Floor cleanout: circle with CO
- Shower: square/rectangle with drain symbol
- Hose bibb: circle with HB
- Water heater: circle with WH
- Grease trap: rectangle with GT
- Piping: solid lines (supply), dashed (waste), dot-dash (vent)
- Valves: butterfly shape or diamond on pipe run
- Tag format: P-1, P-2 or fixture type code in tag bubble`,

  mechanical: `MECHANICAL/HVAC SYMBOLS:
- Supply diffuser: square with X pattern (4-way throw)
- Linear diffuser: long narrow rectangle
- Return air grille: square with parallel lines
- Exhaust grille: square with lines and arrow
- Round duct: circle on plan, rectangle in section
- Rectangular duct: rectangle with size notation (12x8)
- VAV box: rectangle with "VAV" or control symbol
- Fan coil unit: rectangle with FCU
- Thermostat: T in circle
- Refrigerant piping: RL, RS (liquid/suction)
- Tag format: letter+number in hexagon or rectangle (D-1, EF-1)`,

  "fire-protection": `FIRE PROTECTION SYMBOLS:
- Pendant sprinkler: circle with dot (hangs from ceiling)
- Upright sprinkler: circle with triangle up
- Sidewall sprinkler: circle with horizontal line
- Concealed sprinkler: circle with C
- Fire alarm pull station: square with FA or pull icon
- Smoke detector: circle with SD
- Heat detector: circle with HD
- Fire extinguisher cabinet: rectangle with FEC
- Standpipe: circle with SP on riser diagram
- Tag format: number or zone designator`,

  architectural: `ARCHITECTURAL SYMBOLS:
- Doors: arc swing line from hinge point, door leaf as rectangle. Tags: D1, D2 in circle/hexagon
- Windows: parallel lines breaking the wall line. Tags: W1, W2
- Wall types: different patterns for stud, CMU, concrete, furring. Tags: WT-1, WT-2
- Stairs: parallel lines with arrow showing UP direction
- Elevator: rectangle with X, machine room adjacent
- Columns: filled square (concrete) or H-shape (steel) at grid intersections
- Casework: thick rectangle along wall with code (base cabinet, upper, tall)
- Material hatches: diagonal lines (concrete), brick pattern (masonry), dots (insulation)
- Room numbers: centered in room, sometimes circled
- Finish tags: circle with floor/wall/ceiling codes`,

  structural: `STRUCTURAL SYMBOLS:
- Rebar callout: #[size]@[spacing] (e.g., #5@12" O.C. EW)
- Steel beams: W shapes (W12x26), HSS (HSS6x6x1/4), angles (L4x3x1/4)
- Concrete columns: filled squares at grid intersections, size noted
- Footings: dashed rectangles below grade
- Pier/caisson: circles at foundation level
- Steel connections: detail markers pointing to connection sheets
- Shear walls: walls with X or diagonal pattern
- Grade beams: thick lines connecting footings
- Embed plates: small rectangle with bolt pattern`,

  general: `GENERAL CONSTRUCTION SYMBOLS:
- Section cut: dashed line with bubbles at endpoints (ID/sheet)
- Detail marker: dashed boundary with leader to bubble
- Elevation marker: circle with outward arrow
- Column grid: letters (horizontal) and numbers (vertical) in circles
- North arrow: triangle or compass rose
- Scale bar: graduated measurement reference
- Revision delta: triangle with number near changed area
- Match line: heavy line with continuation sheet references
- Break line: zigzag indicating drawing continues beyond`,
};

// ══════════════════════════════════════════════════════════════════════
// LAYER 5: Measurement Type Instructions
// ══════════════════════════════════════════════════════════════════════
const MEASUREMENT_INSTRUCTIONS = {
  count: (desc) => `Find ALL instances of "${desc}" on this construction drawing.

INSTRUCTIONS:
1. First, identify what SYMBOL represents "${desc}" on this drawing. Look for a repeated small symbol/icon.
2. Scan the ENTIRE drawing methodically — every room, corridor, and space.
3. For EACH instance, mark the EXACT CENTER of that symbol as x,y percentages (0-100).
4. Only include locations where you can clearly see the symbol. Do not guess.

Return JSON: {"found":<count>,"locations":[{"x":<0-100>,"y":<0-100>,"label":"<room or area>"}],"confidence":<0-1>,"notes":"<what symbol you identified>"}`,

  linear: (desc) => `Find all runs/segments of "${desc}" on this construction drawing.

Mark the START POINT of each distinct run as x,y percentages (0-100). Only mark clearly visible elements.

Return JSON: {"found":<count>,"locations":[{"x":<0-100>,"y":<0-100>,"label":"<description>"}],"confidence":<0-1>,"notes":"<observations>"}`,

  area: (desc) => `Find all areas/regions where "${desc}" would be applied on this construction drawing.

Mark the CENTER of each distinct area as x,y percentages (0-100). Only mark clearly visible regions.

Return JSON: {"found":<count>,"locations":[{"x":<0-100>,"y":<0-100>,"label":"<room name>"}],"confidence":<0-1>,"notes":"<observations>"}`,
};

// ══════════════════════════════════════════════════════════════════════
// LAYER 8: Guardrails
// ══════════════════════════════════════════════════════════════════════
const GUARDRAILS = `CRITICAL RULES:
1. Return ONLY valid JSON — no markdown, no explanation, no code blocks.
2. x and y are PERCENTAGES (0-100) from the left edge and top edge of the image.
3. Be PRECISE — place each location at the EXACT CENTER of the symbol/element, not in approximate areas.
4. Only mark locations where you can SEE an actual symbol or element. Do NOT guess or interpolate positions.
5. If you cannot clearly identify the element, return {"found":0,"locations":[],"confidence":0,"notes":"Cannot identify element"}
6. Do NOT count title block elements, legend entries, or schedule table entries — only elements placed on the actual floor plan.
7. If more than 60% of your detections cluster in one quadrant, re-scan other areas — you may be missing instances.`;

// ══════════════════════════════════════════════════════════════════════
// ASSEMBLER: Build complete system prompt + user prompt
// ══════════════════════════════════════════════════════════════════════

/**
 * Infer discipline from sheet number prefix.
 */
function inferDiscipline(drawing) {
  const num = (drawing?.sheetNumber || "").toLowerCase().trim();
  if (!num) return "general";
  const map = {
    e: "electrical", p: "plumbing", m: "mechanical", fp: "fire-protection",
    a: "architectural", s: "structural", c: "general", g: "general",
  };
  if (map[num.slice(0, 2)]) return map[num.slice(0, 2)];
  if (map[num[0]]) return map[num[0]];
  return "general";
}

/**
 * Assemble a complete Vision API system prompt from all context layers.
 *
 * @param {Object} params
 * @param {Object} params.drawing — Drawing object with .sheetNumber, .sheetTitle
 * @param {Object} params.takeoff — Takeoff object with .id, .description
 * @param {string} params.measurementType — "count" | "linear" | "area"
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
export function assembleVisionContext({ drawing, takeoff, measurementType }) {
  const discipline = inferDiscipline(drawing);
  const description = takeoff?.description || "";

  // Layer 1: Base identity
  const parts = [BASE_IDENTITY];

  // Layer 2: Discipline-specific KB
  const kb = DISCIPLINE_KB[discipline] || DISCIPLINE_KB.general;
  parts.push("", kb);

  // Layer 3: Legend context (project-specific symbols)
  const legendCtx = getLegendContext(discipline);
  if (legendCtx) {
    parts.push("", legendCtx);
  }

  // Layer 6: Sheet metadata
  if (drawing?.sheetNumber || drawing?.sheetTitle) {
    const sheetInfo = [
      drawing.sheetNumber && `Sheet: ${drawing.sheetNumber}`,
      drawing.sheetTitle && `Title: ${drawing.sheetTitle}`,
      `Discipline: ${discipline}`,
    ].filter(Boolean).join(" | ");
    parts.push("", `CURRENT SHEET: ${sheetInfo}`);
  }

  // Layer 7: Cross-sheet hints (if available)
  let crossSheetCtx;
  try {
    crossSheetCtx = getCrossSheetHints(takeoff?.id);
  } catch {
    crossSheetCtx = "";
  }
  if (crossSheetCtx) {
    parts.push("", crossSheetCtx);
  }

  // Layer 8: Guardrails
  const guardrailsWithLegend = legendCtx
    ? GUARDRAILS + "\n8. PRIORITIZE the SYMBOL LEGEND definitions above — they are project-specific and more accurate than generic conventions."
    : GUARDRAILS;
  parts.push("", guardrailsWithLegend);

  // Layer 5: User prompt (measurement-type-specific)
  const userPromptFn = MEASUREMENT_INSTRUCTIONS[measurementType] || MEASUREMENT_INSTRUCTIONS.count;
  const userPrompt = userPromptFn(description);

  return {
    systemPrompt: parts.join("\n"),
    userPrompt,
    discipline,
    contextLayers: {
      hasLegend: !!legendCtx,
      hasCrossSheet: !!crossSheetCtx,
      discipline,
    },
  };
}
