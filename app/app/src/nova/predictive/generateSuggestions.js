/**
 * NOVA Predictive Takeoff — Suggestion Generation Engine
 *
 * Converts scan results (schedules, notes, ROM, line items) into
 * structured takeoff suggestions for estimator review.
 *
 * Sprint 3.1: THE star feature — "NOVA suggests what to measure"
 *
 * Sources of suggestions (priority order):
 *  1. Schedule entries → direct measurement items (highest confidence)
 *  2. Line items from ROM → budget-backed items (medium confidence)
 *  3. Drawing notes → inferred scope items (varies)
 *  4. ROM divisions → gap-fill for divisions with cost but no items
 */

import { uid } from "@/utils/format";

// ── Schedule type → CSI division mapping ──────────────────────────
const SCHEDULE_DIVISION_MAP = {
  "wall-types": "09",
  door: "08",
  window: "08",
  finish: "09",
  "plumbing-fixture": "22",
  equipment: "11",
  "lighting-fixture": "26",
  "mechanical-equipment": "23",
  "finish-detail": "09",
};

// ── Schedule type → unit mapping ──────────────────────────────────
const SCHEDULE_UNIT_MAP = {
  "wall-types": "LF",
  door: "EA",
  window: "EA",
  finish: "SF",
  "plumbing-fixture": "EA",
  equipment: "EA",
  "lighting-fixture": "EA",
  "mechanical-equipment": "EA",
  "finish-detail": "SF",
};

// ── Division labels (CSI MasterFormat) ────────────────────────────
const DIVISION_LABELS = {
  "01": "General Requirements",
  "02": "Existing Conditions",
  "03": "Concrete",
  "04": "Masonry",
  "05": "Metals",
  "06": "Wood & Plastics",
  "07": "Thermal & Moisture",
  "08": "Openings",
  "09": "Finishes",
  10: "Specialties",
  11: "Equipment",
  14: "Conveying",
  21: "Fire Suppression",
  22: "Plumbing",
  23: "HVAC",
  26: "Electrical",
  27: "Communications",
  28: "Electronic Safety",
  31: "Earthwork",
  32: "Exterior Improvements",
  33: "Utilities",
};

/**
 * Generate takeoff suggestions from scan results.
 *
 * @param {object} scanResults - Full scan output from scanRunner
 * @returns {Array<object>} - Suggestion objects for PredictiveTakeoffPanel
 */
export function generateTakeoffSuggestions(scanResults) {
  if (!scanResults) return [];

  const suggestions = [];
  const { schedules = [], rom, lineItems = [], drawingNotes = [] } = scanResults;

  // Track which divisions already have items to avoid duplicates
  const coveredDivisions = new Set();

  // ── Source 1: Schedule entries (highest quality) ──────────────
  schedules.forEach(sched => {
    if (!sched.entries?.length) return;
    const division = SCHEDULE_DIVISION_MAP[sched.type] || "";
    const defaultUnit = SCHEDULE_UNIT_MAP[sched.type] || "EA";

    sched.entries.forEach(entry => {
      const desc = buildScheduleDescription(sched.type, entry);
      if (!desc) return;

      const qty = parseQuantity(entry);
      const code = buildCode(division, sched.type, entry);

      suggestions.push({
        id: uid(),
        description: desc,
        code,
        division: division ? `${division} — ${DIVISION_LABELS[division] || ""}` : "",
        unit: entry.unit || defaultUnit,
        quantity: qty,
        confidence: entry.confidence || scheduleConfidence(sched, entry),
        source: {
          type: "schedule",
          scheduleType: sched.type,
          entry: {
            mark: entry.mark || "",
            type: entry.type || entry.style || "",
            description: entry.description || "",
          },
          sheetLabel: sched.sheetLabel,
        },
        reasoning: buildScheduleReasoning(sched.type, entry, sched),
        estimatedCost: estimateCostFromRom(rom, division, qty, defaultUnit),
      });

      if (division) coveredDivisions.add(division);
    });
  });

  // ── Source 2: Line items from scan (schedule-derived items with costs) ──
  lineItems.forEach(li => {
    // Skip if we already have a suggestion with matching code + description
    const isDuplicate = suggestions.some(s => s.code === li.code && s.description === li.description);
    if (isDuplicate) return;

    const div = li.code?.split(".")[0] || "";

    suggestions.push({
      id: uid(),
      description: li.description || "Unnamed item",
      code: li.code || "",
      division: div ? `${div} — ${DIVISION_LABELS[div] || ""}` : "",
      unit: li.unit || "LS",
      quantity: li.quantity || 1,
      confidence: li.confidence || "medium",
      source: {
        type: "line-item",
        scheduleType: li.scheduleType || null,
        entry: li.scheduleRef || null,
      },
      reasoning: `Generated from parsed schedule data. ${li.scheduleRef ? `Source: ${li.scheduleRef}` : ""}`,
      estimatedCost: {
        material: li.material || li.m || 0,
        labor: li.labor || li.l || 0,
        equipment: li.equipment || li.e || 0,
        sub: li.subcontractor || li.s || 0,
      },
    });

    if (div) coveredDivisions.add(div);
  });

  // ── Source 3: Drawing notes (inferred items) ────────────────────
  const notesSuggestions = generateFromNotes(drawingNotes, coveredDivisions, rom);
  suggestions.push(...notesSuggestions);
  notesSuggestions.forEach(s => {
    const div = s.code?.split(".")[0];
    if (div) coveredDivisions.add(div);
  });

  // ── Source 4: ROM gap-fill (divisions with cost but no items) ──
  if (rom?.divisions) {
    const gapSuggestions = generateRomGapFill(rom, coveredDivisions);
    suggestions.push(...gapSuggestions);
  }

  // Sort: high confidence first, then medium, then low
  const confOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => (confOrder[a.confidence] || 2) - (confOrder[b.confidence] || 2));

  return suggestions;
}

// ── Schedule → description builder ────────────────────────────────
function buildScheduleDescription(schedType, entry) {
  const mark = entry.mark || "";
  const desc = entry.description || "";
  const type = entry.type || entry.style || "";
  const material = entry.material || "";

  switch (schedType) {
    case "door":
      return [mark ? `Door ${mark}` : "Door", type, material, desc].filter(Boolean).join(" — ").slice(0, 120);

    case "window":
      return [mark ? `Window ${mark}` : "Window", type, entry.size || "", material]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 120);

    case "wall-types":
      return [mark ? `Wall Type ${mark}` : "Wall Type", desc || type, entry.thickness ? `${entry.thickness} thick` : ""]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 120);

    case "finish":
      return [
        entry.room || entry.location || "",
        "Finish",
        desc,
        entry.floor ? `Floor: ${entry.floor}` : "",
        entry.walls ? `Walls: ${entry.walls}` : "",
        entry.ceiling ? `Ceil: ${entry.ceiling}` : "",
      ]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 120);

    case "plumbing-fixture":
      return [mark ? `Plumb ${mark}` : "Plumbing Fixture", desc || type, entry.manufacturer || ""]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 120);

    case "equipment":
      return [mark ? `Equip ${mark}` : "Equipment", desc || type].filter(Boolean).join(" — ").slice(0, 120);

    case "lighting-fixture":
      return [mark ? `Light ${mark}` : "Lighting Fixture", desc || type, entry.lamp || entry.wattage || ""]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 120);

    case "mechanical-equipment":
      return [mark ? `Mech ${mark}` : "Mechanical Equipment", desc || type, entry.capacity || ""]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 120);

    case "finish-detail":
      return [mark ? `Finish Detail ${mark}` : "Finish Detail", desc || type].filter(Boolean).join(" — ").slice(0, 120);

    default:
      return desc || type || `${schedType} item`;
  }
}

// ── Quantity parser ───────────────────────────────────────────────
function parseQuantity(entry) {
  if (entry.quantity && !isNaN(Number(entry.quantity))) return Number(entry.quantity);
  if (entry.count && !isNaN(Number(entry.count))) return Number(entry.count);
  // Default: 1 for schedule items (at minimum one of this type exists)
  return 1;
}

// ── Code builder ──────────────────────────────────────────────────
function buildCode(division, schedType, entry) {
  if (entry.code) return entry.code;
  if (!division) return "";

  const subCode =
    {
      door: "100",
      window: "500",
      "wall-types": "200",
      finish: "300",
      "plumbing-fixture": "100",
      equipment: "100",
      "lighting-fixture": "500",
      "mechanical-equipment": "300",
      "finish-detail": "900",
    }[schedType] || "000";

  return `${division}.${subCode}`;
}

// ── Confidence scorer ─────────────────────────────────────────────
function scheduleConfidence(sched, entry) {
  // High: has mark + description + quantity
  if (entry.mark && entry.description && parseQuantity(entry) > 0) return "high";
  // Medium: has at least description
  if (entry.description || entry.mark) return "medium";
  return "low";
}

// ── Reasoning builder ─────────────────────────────────────────────
function buildScheduleReasoning(schedType, entry, sched) {
  const parts = [];
  parts.push(`Detected in ${schedType} schedule`);
  if (sched.sheetLabel) parts.push(`on sheet ${sched.sheetLabel}`);
  if (entry.mark) parts.push(`mark "${entry.mark}"`);
  if (entry.notes) parts.push(`— notes: "${entry.notes.slice(0, 80)}"`);
  return parts.join(" ");
}

// ── Cost estimation from ROM data ─────────────────────────────────
function estimateCostFromRom(rom, division, quantity, _unit) {
  if (!rom?.divisions?.[division]) return null;

  const divData = rom.divisions[division];
  const midTotal = divData.total?.mid || 0;
  if (midTotal === 0) return null;

  // Rough split: 40% material, 35% labor, 10% equipment, 15% sub
  return {
    material: Math.round((midTotal * 0.4) / Math.max(quantity, 1)),
    labor: Math.round((midTotal * 0.35) / Math.max(quantity, 1)),
    equipment: Math.round((midTotal * 0.1) / Math.max(quantity, 1)),
    sub: Math.round((midTotal * 0.15) / Math.max(quantity, 1)),
  };
}

// ── Notes → suggestions ──────────────────────────────────────────
function generateFromNotes(drawingNotes, coveredDivisions, rom) {
  const suggestions = [];
  if (!drawingNotes?.length) return suggestions;

  // Only high-relevance notes with CSI divisions
  const allNotes = [];
  drawingNotes.forEach(dn => {
    if (!dn.notes?.length) return;
    dn.notes.forEach(note => {
      if (note.estimatingRelevance !== "high") return;
      if (!note.csiDivisions?.length) return;
      allNotes.push({ ...note, sheetLabel: dn.sheetLabel });
    });
  });

  // Group by CSI division
  const divNotes = {};
  allNotes.forEach(note => {
    note.csiDivisions.forEach(div => {
      const d = String(div).padStart(2, "0");
      if (!divNotes[d]) divNotes[d] = [];
      divNotes[d].push(note);
    });
  });

  // Generate one suggestion per division that has high-relevance notes
  Object.entries(divNotes).forEach(([div, notes]) => {
    // Skip if already covered by schedule-derived items
    if (coveredDivisions.has(div) && notes.length < 3) return;

    // Take the most specific note as the description
    const primary = notes[0];
    const desc = primary.text?.slice(0, 100) || `${DIVISION_LABELS[div] || "Div " + div} scope item`;

    suggestions.push({
      id: uid(),
      description: `${DIVISION_LABELS[div] || "Division " + div}: ${desc}`,
      code: `${div}.000`,
      division: `${div} — ${DIVISION_LABELS[div] || ""}`,
      unit: "LS",
      quantity: 1,
      confidence: notes.length >= 3 ? "medium" : "low",
      source: {
        type: "notes",
        note: primary.text?.slice(0, 200),
        sheetLabel: primary.sheetLabel,
      },
      reasoning: `${notes.length} high-relevance drawing note${notes.length !== 1 ? "s" : ""} reference this division. Primary: "${primary.text?.slice(0, 80)}"`,
      estimatedCost: estimateCostFromRom(rom, div, 1, "LS"),
    });
  });

  return suggestions;
}

// ── ROM gap-fill ─────────────────────────────────────────────────
function generateRomGapFill(rom, coveredDivisions) {
  const suggestions = [];

  Object.entries(rom.divisions).forEach(([div, data]) => {
    if (coveredDivisions.has(div)) return;
    if (!data.total?.mid || data.total.mid <= 0) return;

    // Only suggest for divisions with meaningful cost (>1% of total)
    const totalMid = rom.totals?.mid || 1;
    const pctOfTotal = data.total.mid / totalMid;
    if (pctOfTotal < 0.01) return;

    suggestions.push({
      id: uid(),
      description: `${data.label || DIVISION_LABELS[div] || "Division " + div} — ROM allowance`,
      code: `${div}.000`,
      division: `${div} — ${data.label || DIVISION_LABELS[div] || ""}`,
      unit: "LS",
      quantity: 1,
      confidence: "low",
      source: {
        type: "inference",
        scheduleType: null,
      },
      reasoning: `ROM estimates $${Math.round(data.total.mid).toLocaleString()} for this division (${(pctOfTotal * 100).toFixed(1)}% of total) but no schedule data was detected. Consider adding a lump sum allowance or measuring from drawings.`,
      estimatedCost: {
        material: Math.round(data.total.mid * 0.4),
        labor: Math.round(data.total.mid * 0.35),
        equipment: Math.round(data.total.mid * 0.1),
        sub: Math.round(data.total.mid * 0.15),
      },
    });
  });

  return suggestions;
}
