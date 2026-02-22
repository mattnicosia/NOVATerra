import { callAnthropic } from '@/utils/ai';

/** NOVA target fields available for CSV column mapping */
export const NOVA_FIELDS = [
  { key: "code",           label: "Code (CSI)",        type: "string" },
  { key: "description",    label: "Description",       type: "string" },
  { key: "division",       label: "Division",          type: "string" },
  { key: "quantity",       label: "Quantity",           type: "number" },
  { key: "unit",           label: "Unit",               type: "string" },
  { key: "material",       label: "Material ($)",       type: "number" },
  { key: "labor",          label: "Labor ($)",          type: "number" },
  { key: "equipment",      label: "Equipment ($)",      type: "number" },
  { key: "subcontractor",  label: "Subcontractor ($)",  type: "number" },
  { key: "trade",          label: "Trade",              type: "string" },
  { key: "notes",          label: "Notes",              type: "string" },
];

const FIELD_KEYS = new Set(NOVA_FIELDS.map(f => f.key));

// ─── AI-Powered Column Mapping ──────────────────────────────────────

const SYSTEM_PROMPT = `You are a construction estimating data mapper. Given CSV column headers and sample data from an estimating software export (likely ProEst), map each column to the appropriate NOVA estimating field.

Available NOVA fields:
- code: CSI division code (e.g., "03.100.010", "03 30 00")
- description: Item description text
- division: Division name or number
- quantity: Numeric quantity
- unit: Unit of measure (SF, LF, EA, CY, etc.)
- material: Material cost PER UNIT ($)
- labor: Labor cost PER UNIT ($)
- equipment: Equipment cost PER UNIT ($)
- subcontractor: Subcontractor cost PER UNIT ($)
- trade: Trade name / craft
- notes: Additional notes or remarks

IMPORTANT:
- Prefer per-unit cost columns over total cost columns. NOVA stores per-unit rates.
- If a column looks like a combined "total cost" or "unit price" that merges material+labor+equipment, map it to "material" (the user can adjust).
- Map row numbers, internal IDs, or irrelevant columns to null (skip).
- If you see columns like "Ext Material" or "Total Material", those are extended/total (qty × rate) — skip those if a per-unit column exists for the same cost type.

Return ONLY valid JSON: an object where keys are the exact CSV column header strings and values are either a NOVA field key string or null.`;

/**
 * Use AI to suggest column mappings from CSV headers to NOVA fields.
 * @param {string} apiKey
 * @param {string[]} headers
 * @param {string[][]} sampleRows - first 3-5 data rows for context
 * @returns {Promise<Record<string, string|null>>}
 */
export async function suggestColumnMappings(apiKey, headers, sampleRows) {
  const table = [headers, ...sampleRows.slice(0, 5)]
    .map(r => r.join(" | "))
    .join("\n");

  const userMsg = `CSV headers and sample data:\n\n${table}\n\nMap each column header to a NOVA field key or null. Return JSON only.`;

  try {
    const raw = await callAnthropic({
      apiKey,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
      max_tokens: 1000,
      temperature: 0,
    });

    // Strip markdown fences if present
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const parsed = JSON.parse(cleaned);

    // Validate: only allow known field keys or null
    const result = {};
    for (const h of headers) {
      const val = parsed[h];
      result[h] = (val && FIELD_KEYS.has(val)) ? val : null;
    }
    return result;
  } catch (err) {
    console.warn("[csvColumnMapper] AI mapping failed, falling back to heuristic:", err);
    return heuristicMapping(headers);
  }
}

// ─── Heuristic Fallback ─────────────────────────────────────────────

const PATTERNS = {
  code:          /\b(code|csi|item\s*#|item\s*num|wbs|cost\s*code)\b/i,
  description:   /\b(desc|description|name|scope|item\s*desc|line\s*item)\b/i,
  quantity:      /\b(qty|quantity|count|amount)\b/i,
  unit:          /\b(unit|uom|u\/m|measure)\b/i,
  material:      /\b(mat|material|mat\s*cost|unit\s*mat)\b/i,
  labor:         /\b(lab|labor|labour|unit\s*lab)\b/i,
  equipment:     /\b(equip|equipment|unit\s*equip)\b/i,
  subcontractor: /\b(sub|subcontract|subcontractor|unit\s*sub)\b/i,
  division:      /\b(div|division|section|category|phase)\b/i,
  trade:         /\b(trade|craft|discipline)\b/i,
  notes:         /\b(note|notes|remark|comment)\b/i,
};

/**
 * Regex-based fallback mapping when no API key is available.
 * @param {string[]} headers
 * @returns {Record<string, string|null>}
 */
export function heuristicMapping(headers) {
  const used = new Set();
  const map = {};
  headers.forEach(h => {
    for (const [field, regex] of Object.entries(PATTERNS)) {
      if (!used.has(field) && regex.test(h)) {
        map[h] = field;
        used.add(field);
        return;
      }
    }
    map[h] = null;
  });
  return map;
}

// ─── Apply Mappings ─────────────────────────────────────────────────

/**
 * Parse a string that may contain currency formatting into a number.
 * "$1,234.56" → 1234.56, "(500)" → -500, "€1.234,56" → 1234.56, "" → 0
 * Handles: $, €, £, ¥, ₹, ¢, non-breaking spaces, en/em dashes, percent signs,
 * and European number formats (period as thousands separator, comma as decimal).
 */
function parseNumber(str) {
  if (str == null) return 0;
  // If already a number (e.g., from XLSX parser), just return it
  if (typeof str === "number") return isNaN(str) ? 0 : str;
  if (typeof str !== "string") return 0;

  // Strip currency symbols, non-breaking spaces, percent signs
  let cleaned = str.replace(/[$€£¥₹¢%\u00A0]/g, "").trim();
  // Normalize en-dash and em-dash to minus
  cleaned = cleaned.replace(/[–—]/g, "-");
  // Handle accounting negative: (500) → -500
  cleaned = cleaned.replace(/\((.+)\)/, "-$1");
  // Strip regular whitespace and commas used as thousands separators
  // Detect European format: "1.234,56" (period=thousands, comma=decimal)
  // If there's a comma after a period, it's European format
  if (/\.\d{3},/.test(cleaned)) {
    // European: strip periods (thousands), replace comma with period (decimal)
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // Standard: strip commas (thousands)
    cleaned = cleaned.replace(/,/g, "");
  }
  cleaned = cleaned.replace(/\s/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

/** Strings that indicate a summary/total row to skip */
const SKIP_PATTERNS = /^\s*(total|subtotal|grand\s*total|sub-total|sum|──|—-)\b/i;

/**
 * Transform CSV rows into item presets using confirmed column mappings.
 * @param {Record<string, string|null>} mappings - header → NOVA field key or null
 * @param {string[]} headers - CSV headers (defines column index)
 * @param {string[][]} rows - all CSV data rows
 * @param {{ divideTotals: boolean }} options
 * @returns {{ items: Object[], skipped: number }}
 */
export function applyMappings(mappings, headers, rows, options = {}) {
  const { divideTotals = false } = options;
  const numberFields = new Set(["quantity", "material", "labor", "equipment", "subcontractor"]);

  // Build index map: NOVA field → column index
  const fieldToIdx = {};
  headers.forEach((h, i) => {
    const field = mappings[h];
    if (field) fieldToIdx[field] = i;
  });

  const items = [];
  let skipped = 0;

  for (const row of rows) {
    // Get description to decide if we should skip
    const descIdx = fieldToIdx["description"];
    const desc = descIdx !== undefined ? (row[descIdx] || "").trim() : "";

    if (!desc || SKIP_PATTERNS.test(desc)) {
      skipped++;
      continue;
    }

    const preset = {};
    for (const [field, idx] of Object.entries(fieldToIdx)) {
      const raw = (row[idx] || "").trim();
      if (numberFields.has(field)) {
        preset[field] = Math.max(0, parseNumber(raw));
      } else {
        preset[field] = raw;
      }
    }

    // If divideTotals is on and we have quantity, divide cost fields by qty
    if (divideTotals && preset.quantity && preset.quantity > 0) {
      for (const costField of ["material", "labor", "equipment", "subcontractor"]) {
        if (preset[costField]) {
          preset[costField] = Math.round((preset[costField] / preset.quantity) * 100) / 100;
        }
      }
    }

    // Ensure quantity defaults to 1 if not mapped or zero
    if (!preset.quantity) preset.quantity = 1;

    // Map "description" to "name" which is what addElement expects
    if (preset.description) {
      preset.name = preset.description;
      delete preset.description;
    }

    items.push(preset);
  }

  return { items, skipped };
}
