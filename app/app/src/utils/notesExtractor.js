// Notes Extractor — Extracts specification-relevant notes from construction drawings
// Phase 1.5 of the NOVA Scan pipeline: runs after schedule detection, before parsing
//
// Construction drawings contain 80%+ of estimating intelligence OUTSIDE schedules:
// general notes, material specs, code requirements, legends, detail callouts, etc.
// This module uses Claude to identify, classify, and extract all of it.

import { callAnthropic, imageBlock } from './ai';
import { novaPlans } from '@/nova/agents/plans';

// ─── Note Categories ─────────────────────────────────────────────────
export const NOTE_CATEGORIES = [
  { id: 'general-notes',      label: 'General Notes',        color: '#4A90D9' },
  { id: 'structural-notes',   label: 'Structural Notes',     color: '#E07B39' },
  { id: 'material-specs',     label: 'Material Specs',       color: '#50B83C' },
  { id: 'code-requirements',  label: 'Code Requirements',    color: '#DE3618' },
  { id: 'installation-notes', label: 'Installation Notes',   color: '#9C6ADE' },
  { id: 'legend',             label: 'Legend / Abbreviations',color: '#47C1BF' },
  { id: 'detail-callouts',    label: 'Detail Callouts',      color: '#F49342' },
  { id: 'demolition-notes',   label: 'Demolition Notes',     color: '#BF0711' },
  { id: 'mep-notes',          label: 'MEP Notes',            color: '#007ACE' },
  { id: 'title-block',        label: 'Title Block Info',     color: '#637381' },
];

// ─── Notes Extraction Prompt ─────────────────────────────────────────
export function buildNotesPrompt(sheetLabel, ocrText = '') {
  const categoryList = NOTE_CATEGORIES.map(c => `  - "${c.id}": ${c.label}`).join('\n');

  return `You are analyzing a construction drawing sheet${sheetLabel ? ` labeled "${sheetLabel}"` : ''} for a commercial estimating application.

Your task is to extract ALL specification-relevant notes, requirements, and text annotations from this drawing that would be important for construction cost estimating. This includes text that is NOT part of schedule tables.

LOOK FOR:
1. **General Notes** — numbered note blocks (e.g., "GENERAL NOTES", "STRUCTURAL NOTES")
2. **Material Specifications** — specific products, manufacturers, standards (e.g., "All GWB shall be 5/8" Type X", "Insulation: R-19 per ASHRAE 90.1")
3. **Code Requirements** — building codes, fire ratings, accessibility (e.g., "1-hour fire-rated assembly required", "ADA compliant")
4. **Installation Notes** — construction methods, tolerances, sequencing
5. **Legends & Abbreviations** — symbol meanings, abbreviation definitions
6. **Detail Callouts** — references to details with spec info (e.g., "See Detail 3/A5.1 — Typical partition head")
7. **Demolition Notes** — existing conditions, demo scope
8. **MEP Notes** — mechanical, electrical, plumbing specifications
9. **Title Block Info** — project name, architect, code summary, occupancy type

Categories:
${categoryList}

For each note/text block you find, return:
- "category": one of the category IDs listed above
- "text": the EXACT text content (preserve original wording)
- "estimatingRelevance": "high" (directly affects costs/quantities), "medium" (provides useful context), or "low" (informational only)
- "keywords": array of 2-5 keywords relevant for cost estimation matching
- "csiDivisions": array of CSI division codes this note relates to (e.g., ["09"] for finishes, ["05","09"] for metal studs + drywall)

IMPORTANT:
- Extract EVERY relevant note — do NOT skip any specification text
- "high" relevance = text that specifies materials, products, methods, or requirements that directly affect cost (e.g., "All exterior walls R-19 insulation" = high)
- "medium" relevance = text that provides context useful for estimating (e.g., "Contractor to verify all dimensions" = medium)
- "low" relevance = purely informational (e.g., "Sheet 3 of 12" = low)
- Preserve exact text — do NOT paraphrase or summarize

Also provide a brief "sheetSummary" (1-2 sentences) describing what this drawing sheet contains and its primary purpose.

Return ONLY a JSON object: { "notes": [...], "sheetSummary": "..." }
If no notes found, return { "notes": [], "sheetSummary": "..." }

${ocrText ? `OCR-EXTRACTED TEXT FROM THIS DRAWING:
"""
${ocrText.slice(0, 8000)}
"""

Use this OCR text as a reliable source for note content. Cross-reference what you see in the image with this text for maximum accuracy. The OCR may contain text too small to read clearly in the image.` : ''}`;
}

// ─── Extract Notes from a Single Drawing ─────────────────────────────
/**
 * Send drawing image + OCR text to Claude for notes extraction.
 *
 * @param {{ imgBase64: string, ocrText: string, sheetLabel: string }} opts
 * @returns {{ notes: Array, sheetSummary: string }}
 */
export async function extractDrawingNotes({ imgBase64, ocrText, sheetLabel }) {
  if (!imgBase64) return { notes: [], sheetSummary: '' };

  try {
    const prompt = buildNotesPrompt(sheetLabel, ocrText);
    const { systemPrompt: notesSys } = novaPlans.augmentNotesPrompt();

    const result = await callAnthropic({
      max_tokens: 4000,
      system: notesSys,
      messages: [{
        role: 'user',
        content: [
          imageBlock(imgBase64),
          { type: 'text', text: prompt },
        ],
      }],
    });

    // Parse JSON response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Notes] No JSON found in response for', sheetLabel);
      return { notes: [], sheetSummary: '' };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const notes = Array.isArray(parsed.notes) ? parsed.notes : [];
    const sheetSummary = parsed.sheetSummary || '';

    // Validate and clean each note
    const validNotes = notes.filter(n =>
      n.category && n.text && n.estimatingRelevance
    ).map(n => ({
      category: n.category,
      text: String(n.text).trim(),
      estimatingRelevance: ['high', 'medium', 'low'].includes(n.estimatingRelevance)
        ? n.estimatingRelevance : 'medium',
      keywords: Array.isArray(n.keywords) ? n.keywords.slice(0, 5) : [],
      csiDivisions: Array.isArray(n.csiDivisions) ? n.csiDivisions : [],
    }));

    console.log(`[Notes] Extracted ${validNotes.length} notes from "${sheetLabel}" (${validNotes.filter(n => n.estimatingRelevance === 'high').length} high relevance)`);

    return { notes: validNotes, sheetSummary };
  } catch (err) {
    console.warn('[Notes] Extraction failed for', sheetLabel, err.message);
    return { notes: [], sheetSummary: '' };
  }
}

// ─── Build Notes Context for Downstream Prompts ──────────────────────
/**
 * Compile extracted notes from all drawings into a compact text block
 * for injection into Phase 2 (parse) and Phase 3 (ROM) prompts.
 *
 * Filters to high/medium relevance, sorted by relevance, truncated to maxChars.
 *
 * @param {Array<{ sheetLabel: string, notes: Array, sheetSummary: string }>} allDrawingNotes
 * @param {number} maxChars — Max characters for the context block (default 6000)
 * @returns {string}
 */
export function buildNotesContext(allDrawingNotes, maxChars = 6000) {
  if (!allDrawingNotes || allDrawingNotes.length === 0) return '';

  // Collect all high + medium relevance notes
  const relevantNotes = [];
  allDrawingNotes.forEach(({ sheetLabel, notes }) => {
    if (!notes) return;
    notes.forEach(n => {
      if (n.estimatingRelevance === 'low') return;
      relevantNotes.push({ ...n, sheetLabel });
    });
  });

  if (relevantNotes.length === 0) return '';

  // Sort: high relevance first, then medium
  relevantNotes.sort((a, b) => {
    if (a.estimatingRelevance === 'high' && b.estimatingRelevance !== 'high') return -1;
    if (a.estimatingRelevance !== 'high' && b.estimatingRelevance === 'high') return 1;
    return 0;
  });

  // Build grouped text block for better downstream prompt context
  const tradeGroups = groupNotesByTrade(allDrawingNotes);
  if (tradeGroups.length === 0) return '';

  const lines = ['DRAWING NOTES & SPECIFICATIONS (grouped by trade):'];
  let charCount = lines[0].length;

  for (const { group, notes: gNotes } of tradeGroups) {
    const header = `\n[${group}]`;
    if (charCount + header.length > maxChars) break;
    lines.push(header);
    charCount += header.length;

    for (const note of gNotes) {
      if (note.estimatingRelevance === 'low') continue;
      const csi = note.csiDivisions?.length ? ` [CSI: ${note.csiDivisions.join(',')}]` : '';
      const line = `- [${note.estimatingRelevance.toUpperCase()}]${csi} ${note.text}`;
      if (charCount + line.length + 1 > maxChars) break;
      lines.push(line);
      charCount += line.length + 1;
    }
  }

  return lines.join('\n');
}

// ─── CSI Trade Groups ─────────────────────────────────────────────────
// Maps CSI division codes to trade groups for hierarchical clustering.
const CSI_TRADE_GROUPS = {
  '01': 'General Requirements',
  '02': 'Existing Conditions',
  '03': 'Concrete',
  '04': 'Masonry',
  '05': 'Metals',
  '06': 'Wood / Plastics / Composites',
  '07': 'Thermal & Moisture Protection',
  '08': 'Openings',
  '09': 'Finishes',
  '10': 'Specialties',
  '11': 'Equipment',
  '12': 'Furnishings',
  '13': 'Special Construction',
  '14': 'Conveying Equipment',
  '21': 'Fire Suppression',
  '22': 'Plumbing',
  '23': 'HVAC',
  '25': 'Integrated Automation',
  '26': 'Electrical',
  '27': 'Communications',
  '28': 'Electronic Safety & Security',
  '31': 'Earthwork',
  '32': 'Exterior Improvements',
  '33': 'Utilities',
};

// Map note categories to fallback trade groups when CSI isn't available
const CATEGORY_TRADE_MAP = {
  'general-notes':      'General Requirements',
  'structural-notes':   'Structure',
  'material-specs':     'Materials & Finishes',
  'code-requirements':  'Code & Compliance',
  'installation-notes': 'Installation Methods',
  'legend':             'General Requirements',
  'detail-callouts':    'Detail References',
  'demolition-notes':   'Demolition',
  'mep-notes':          'MEP',
  'title-block':        'Project Info',
};

/**
 * Group flat notes list into trade/system clusters for hierarchical display.
 *
 * Grouping priority:
 * 1. CSI division → trade group (most reliable when available)
 * 2. Note category → trade group (fallback)
 *
 * Returns groups sorted: high-relevance groups first, then alphabetical.
 *
 * @param {Array<{ sheetLabel: string, notes: Array, sheetSummary: string }>} allDrawingNotes
 * @returns {Array<{ group: string, notes: Array, highCount: number, medCount: number }>}
 */
export function groupNotesByTrade(allDrawingNotes) {
  if (!allDrawingNotes || allDrawingNotes.length === 0) return [];

  // Flatten all notes with source sheet info
  const flat = [];
  allDrawingNotes.forEach(({ sheetLabel, notes }, di) => {
    if (!notes) return;
    notes.forEach((note, ni) => {
      flat.push({ ...note, sheetLabel: sheetLabel || `Sheet ${di + 1}`, _key: `${di}-${ni}` });
    });
  });

  if (flat.length === 0) return [];

  // Assign each note to a trade group
  const groups = {};
  for (const note of flat) {
    let group = null;

    // 1. Try CSI division mapping
    if (note.csiDivisions?.length > 0) {
      const primaryDiv = note.csiDivisions[0];
      group = CSI_TRADE_GROUPS[primaryDiv] || null;
    }

    // 2. Fallback to category mapping
    if (!group && note.category) {
      group = CATEGORY_TRADE_MAP[note.category] || 'Other';
    }

    if (!group) group = 'Other';

    if (!groups[group]) groups[group] = [];
    groups[group].push(note);
  }

  // Build sorted output
  const result = Object.entries(groups).map(([group, notes]) => {
    const highCount = notes.filter(n => n.estimatingRelevance === 'high').length;
    const medCount = notes.filter(n => n.estimatingRelevance === 'medium').length;

    // Sort notes within group: high → medium → low
    const relOrder = { high: 0, medium: 1, low: 2 };
    notes.sort((a, b) => (relOrder[a.estimatingRelevance] || 2) - (relOrder[b.estimatingRelevance] || 2));

    return { group, notes, highCount, medCount };
  });

  // Sort groups: most high-relevance notes first, then alphabetical
  result.sort((a, b) => {
    if (b.highCount !== a.highCount) return b.highCount - a.highCount;
    if (b.medCount !== a.medCount) return b.medCount - a.medCount;
    return a.group.localeCompare(b.group);
  });

  return result;
}

// ─── Build Embedding Text for pgvector ───────────────────────────────
/**
 * Format drawing notes for vector embedding storage.
 *
 * @param {{ sheetLabel: string, notes: Array, sheetSummary: string }} drawingNotes
 * @returns {string}
 */
export function buildNotesEmbeddingText(drawingNotes) {
  if (!drawingNotes?.notes?.length) return '';

  const parts = [];
  if (drawingNotes.sheetSummary) {
    parts.push(`Sheet: ${drawingNotes.sheetLabel || 'Unknown'} — ${drawingNotes.sheetSummary}`);
  }

  // Group by category for structured embedding
  const byCategory = {};
  drawingNotes.notes.forEach(n => {
    if (!byCategory[n.category]) byCategory[n.category] = [];
    byCategory[n.category].push(n.text);
  });

  Object.entries(byCategory).forEach(([cat, texts]) => {
    const catConfig = NOTE_CATEGORIES.find(c => c.id === cat);
    parts.push(`${catConfig?.label || cat}: ${texts.join('; ')}`);
  });

  return parts.join('\n');
}
