// ROM Engine — Rough Order of Magnitude cost estimation
// Generates division-level $/SF ranges and schedule-derived line items

import { SEED_ELEMENTS } from '@/constants/seedAssemblies';
import { callAnthropic, buildProjectContext } from '@/utils/ai';

// ─── Division Benchmarks ($/SF by job type) ───────────────────────────
// Low = budget/value, Mid = typical, High = premium/complex
const BENCHMARKS = {
  "commercial-office": {
    "01": { label: "General Requirements", low: 3, mid: 6, high: 10 },
    "02": { label: "Existing Conditions/Demo", low: 1, mid: 3, high: 8 },
    "03": { label: "Concrete", low: 8, mid: 14, high: 22 },
    "04": { label: "Masonry", low: 2, mid: 5, high: 10 },
    "05": { label: "Metals", low: 6, mid: 12, high: 20 },
    "06": { label: "Wood & Plastics", low: 3, mid: 8, high: 15 },
    "07": { label: "Thermal & Moisture", low: 4, mid: 8, high: 14 },
    "08": { label: "Openings", low: 5, mid: 10, high: 18 },
    "09": { label: "Finishes", low: 8, mid: 15, high: 25 },
    "10": { label: "Specialties", low: 1, mid: 3, high: 6 },
    "14": { label: "Conveying", low: 0, mid: 4, high: 12 },
    "21": { label: "Fire Suppression", low: 2, mid: 4, high: 7 },
    "22": { label: "Plumbing", low: 4, mid: 8, high: 15 },
    "23": { label: "HVAC", low: 8, mid: 15, high: 25 },
    "26": { label: "Electrical", low: 6, mid: 12, high: 20 },
    "27": { label: "Communications", low: 1, mid: 3, high: 6 },
    "28": { label: "Electronic Safety", low: 1, mid: 3, high: 5 },
    "31": { label: "Earthwork", low: 2, mid: 5, high: 10 },
    "32": { label: "Exterior Improvements", low: 1, mid: 4, high: 8 },
    "33": { label: "Utilities", low: 1, mid: 3, high: 6 },
  },
  "retail": {
    "01": { label: "General Requirements", low: 2, mid: 5, high: 8 },
    "02": { label: "Existing Conditions/Demo", low: 0, mid: 2, high: 6 },
    "03": { label: "Concrete", low: 5, mid: 10, high: 18 },
    "05": { label: "Metals", low: 4, mid: 8, high: 15 },
    "06": { label: "Wood & Plastics", low: 2, mid: 5, high: 10 },
    "07": { label: "Thermal & Moisture", low: 3, mid: 6, high: 12 },
    "08": { label: "Openings", low: 6, mid: 12, high: 22 },
    "09": { label: "Finishes", low: 6, mid: 12, high: 22 },
    "22": { label: "Plumbing", low: 2, mid: 5, high: 10 },
    "23": { label: "HVAC", low: 6, mid: 12, high: 20 },
    "26": { label: "Electrical", low: 5, mid: 10, high: 18 },
  },
  "healthcare": {
    "01": { label: "General Requirements", low: 5, mid: 10, high: 18 },
    "03": { label: "Concrete", low: 10, mid: 18, high: 30 },
    "05": { label: "Metals", low: 8, mid: 15, high: 25 },
    "07": { label: "Thermal & Moisture", low: 5, mid: 10, high: 18 },
    "08": { label: "Openings", low: 8, mid: 14, high: 22 },
    "09": { label: "Finishes", low: 12, mid: 22, high: 35 },
    "22": { label: "Plumbing", low: 8, mid: 15, high: 25 },
    "23": { label: "HVAC", low: 15, mid: 25, high: 40 },
    "26": { label: "Electrical", low: 10, mid: 18, high: 30 },
    "28": { label: "Electronic Safety", low: 3, mid: 6, high: 10 },
  },
  "education": {
    "01": { label: "General Requirements", low: 3, mid: 6, high: 10 },
    "03": { label: "Concrete", low: 6, mid: 12, high: 20 },
    "04": { label: "Masonry", low: 3, mid: 8, high: 14 },
    "05": { label: "Metals", low: 5, mid: 10, high: 18 },
    "07": { label: "Thermal & Moisture", low: 3, mid: 7, high: 12 },
    "08": { label: "Openings", low: 5, mid: 10, high: 16 },
    "09": { label: "Finishes", low: 8, mid: 14, high: 22 },
    "22": { label: "Plumbing", low: 4, mid: 8, high: 14 },
    "23": { label: "HVAC", low: 8, mid: 14, high: 22 },
    "26": { label: "Electrical", low: 6, mid: 12, high: 18 },
  },
  "industrial": {
    "01": { label: "General Requirements", low: 2, mid: 4, high: 8 },
    "03": { label: "Concrete", low: 8, mid: 15, high: 25 },
    "05": { label: "Metals", low: 10, mid: 18, high: 30 },
    "07": { label: "Thermal & Moisture", low: 3, mid: 6, high: 12 },
    "08": { label: "Openings", low: 3, mid: 6, high: 12 },
    "09": { label: "Finishes", low: 2, mid: 5, high: 10 },
    "22": { label: "Plumbing", low: 2, mid: 5, high: 10 },
    "23": { label: "HVAC", low: 4, mid: 8, high: 15 },
    "26": { label: "Electrical", low: 5, mid: 10, high: 18 },
    "31": { label: "Earthwork", low: 3, mid: 8, high: 15 },
  },
  "residential-multi": {
    "01": { label: "General Requirements", low: 2, mid: 5, high: 8 },
    "03": { label: "Concrete", low: 6, mid: 12, high: 20 },
    "05": { label: "Metals", low: 3, mid: 6, high: 12 },
    "06": { label: "Wood & Plastics", low: 8, mid: 15, high: 25 },
    "07": { label: "Thermal & Moisture", low: 3, mid: 7, high: 12 },
    "08": { label: "Openings", low: 5, mid: 10, high: 16 },
    "09": { label: "Finishes", low: 8, mid: 14, high: 22 },
    "22": { label: "Plumbing", low: 5, mid: 10, high: 18 },
    "23": { label: "HVAC", low: 5, mid: 10, high: 18 },
    "26": { label: "Electrical", low: 5, mid: 10, high: 16 },
  },
};

// Default fallback for unknown job types
const DEFAULT_BENCHMARKS = BENCHMARKS["commercial-office"];

// ─── Baseline ROM Generation ──────────────────────────────────────────
export function generateBaselineROM(projectSF, jobType, calibrationFactors = {}) {
  const sf = parseFloat(projectSF) || 0;
  const benchmarks = BENCHMARKS[jobType] || DEFAULT_BENCHMARKS;

  const divisions = {};
  let totalLow = 0, totalMid = 0, totalHigh = 0;

  Object.entries(benchmarks).forEach(([div, range]) => {
    // Apply calibration factor if available
    const factor = calibrationFactors[div] || 1;
    const low = range.low * factor;
    const mid = range.mid * factor;
    const high = range.high * factor;

    divisions[div] = {
      label: range.label,
      perSF: { low: Math.round(low * 100) / 100, mid: Math.round(mid * 100) / 100, high: Math.round(high * 100) / 100 },
      total: sf > 0 ? { low: Math.round(sf * low), mid: Math.round(sf * mid), high: Math.round(sf * high) } : { low: 0, mid: 0, high: 0 },
    };

    totalLow += sf * low;
    totalMid += sf * mid;
    totalHigh += sf * high;
  });

  return {
    projectSF: sf,
    sfMissing: sf === 0,
    jobType: jobType || "commercial-office",
    divisions,
    totals: {
      low: Math.round(totalLow),
      mid: Math.round(totalMid),
      high: Math.round(totalHigh),
    },
    calibrated: Object.keys(calibrationFactors).length > 0,
    calibrationCount: Object.keys(calibrationFactors).length,
  };
}

// ─── AI SF Estimation ─────────────────────────────────────────────────
// When project SF is unknown, ask AI to estimate it from drawings + schedules
export async function estimateProjectSF({ drawings, schedules, projectContext, apiKey }) {
  if (!apiKey) return null;
  try {
    const drawingSummary = drawings.map(d =>
      `${d.sheetNumber || d.label || "Sheet"}: ${d.sheetTitle || "Untitled"}`
    ).join("\n");

    const scheduleSummary = schedules.map(s =>
      `${s.type}: ${s.entries?.length || 0} entries (from ${s.sheetLabel || "sheet"})`
    ).join("\n");

    const result = await callAnthropic({
      apiKey,
      max_tokens: 500,
      system: "You are a senior construction estimator. Based on drawing sheets and schedule data, estimate the approximate building square footage.",
      messages: [{ role: "user", content: `I need to estimate the total building square footage for a project. I don't have it entered yet.

Drawing sheets:
${drawingSummary || "(no drawings)"}

Detected schedules:
${scheduleSummary || "(none)"}

${projectContext || ""}

Based on the drawing types, number of sheets, and schedule complexity, estimate the approximate total building gross square footage.

Return ONLY a JSON object: {"estimatedSF": <number>, "confidence": "high"|"medium"|"low", "reasoning": "<brief explanation>"}` }],
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.warn("[estimateProjectSF] Failed:", err.message);
    return null;
  }
}

// ─── Schedule → Line Items ────────────────────────────────────────────
// Match parsed schedule entries to seed elements for itemized costs

// Helper: check if a finish value is effectively "none"
function isNone(val) {
  if (!val) return true;
  const v = val.toLowerCase().trim();
  return v === "none" || v === "n/a" || v === "-" || v === "--" || v === "—" || v === "";
}

export function generateScheduleLineItems(schedules) {
  const lineItems = [];

  schedules.forEach(schedule => {
    const { type, entries, sheetId } = schedule;
    if (!entries || entries.length === 0) return;

    switch (type) {
      case "wall-types":
        entries.forEach(entry => {
          if (!entry.typeLabel) return;
          // Match material to seed elements
          const material = (entry.material || "").toLowerCase();
          if (material.includes("metal stud") || material.includes("steel stud")) {
            const seedMatch = findSeedByKeywords(["metal stud", "wall"], entry.studs);
            lineItems.push({
              code: "05.400",
              description: `Wall Type ${entry.typeLabel}: ${entry.material || "Metal Stud"} ${entry.studs || ""} @ ${entry.height || ""}' — ${entry.insulation || ""}`.trim(),
              unit: "SF",
              seedId: seedMatch?.id,
              m: seedMatch?.material || 0, l: seedMatch?.labor || 0, e: seedMatch?.equipment || 0,
              qty: 0, // to be determined from takeoffs
              source: { type, sheetId, entry: entry.typeLabel },
              confidence: seedMatch ? "high" : "low",
            });
          }
          if (entry.drywall && entry.drywall.toLowerCase() !== "none") {
            lineItems.push({
              code: "09.250",
              description: `Drywall — ${entry.typeLabel}: ${entry.drywall}`,
              unit: "SF",
              m: 0, l: 0, e: 0,
              qty: 0,
              source: { type, sheetId, entry: entry.typeLabel },
              confidence: "medium",
            });
          }
          if (entry.insulation && entry.insulation.toLowerCase() !== "none") {
            lineItems.push({
              code: "07.210",
              description: `Insulation — ${entry.typeLabel}: ${entry.insulation}`,
              unit: "SF",
              m: 0, l: 0, e: 0,
              qty: 0,
              source: { type, sheetId, entry: entry.typeLabel },
              confidence: "medium",
            });
          }
        });
        break;

      case "door":
        entries.forEach(entry => {
          if (!entry.mark && !entry.type) return;
          const seedMatch = findSeedByKeywords(["door", entry.material, entry.type]);
          lineItems.push({
            code: "08.110",
            description: `Door ${entry.mark || ""}: ${entry.width || ""}x${entry.height || ""} ${entry.material || ""} ${entry.type || ""}${entry.fire_rating && entry.fire_rating !== "None" ? ` (${entry.fire_rating} rated)` : ""}`.trim(),
            unit: "EA",
            seedId: seedMatch?.id,
            m: seedMatch?.material || 0, l: seedMatch?.labor || 0, e: seedMatch?.equipment || 0,
            qty: 1,
            source: { type, sheetId, entry: entry.mark },
            confidence: seedMatch ? "high" : "medium",
          });
          // Frame line item
          if (entry.frame) {
            lineItems.push({
              code: "08.110",
              description: `Door Frame ${entry.mark || ""}: ${entry.frame} frame`,
              unit: "EA",
              m: 0, l: 0, e: 0,
              qty: 1,
              source: { type, sheetId, entry: entry.mark },
              confidence: "low",
            });
          }
          // Hardware
          if (entry.hardware) {
            lineItems.push({
              code: "08.710",
              description: `Hardware ${entry.mark || ""}: ${entry.hardware}`,
              unit: "EA",
              m: 0, l: 0, e: 0,
              qty: 1,
              source: { type, sheetId, entry: entry.mark },
              confidence: "low",
            });
          }
        });
        break;

      case "window":
        entries.forEach(entry => {
          if (!entry.mark && !entry.type) return;
          const seedMatch = findSeedByKeywords(["window", entry.frame, entry.type]);
          lineItems.push({
            code: "08.510",
            description: `Window ${entry.mark || ""}: ${entry.width || ""}x${entry.height || ""} ${entry.frame || ""} ${entry.type || ""} ${entry.glazing || ""}`.trim(),
            unit: "EA",
            seedId: seedMatch?.id,
            m: seedMatch?.material || 0, l: seedMatch?.labor || 0, e: seedMatch?.equipment || 0,
            qty: 1,
            source: { type, sheetId, entry: entry.mark },
            confidence: seedMatch ? "high" : "medium",
          });
        });
        break;

      case "finish":
        entries.forEach(entry => {
          if (!entry.room) return;

          // ── Floor finish ──
          if (entry.floor && !isNone(entry.floor)) {
            const floorLower = entry.floor.toLowerCase();
            let floorCode = "09.600"; // generic flooring
            if (floorLower.includes("carpet")) floorCode = "09.680";
            else if (floorLower.includes("vct") || floorLower.includes("vinyl")) floorCode = "09.650";
            else if (floorLower.includes("ceramic") || floorLower.includes("porcelain") || floorLower.includes("tile")) floorCode = "09.310";
            else if (floorLower.includes("terrazzo")) floorCode = "09.340";
            else if (floorLower.includes("epoxy") || floorLower.includes("resinous")) floorCode = "09.670";
            else if (floorLower.includes("wood") || floorLower.includes("hardwood")) floorCode = "09.640";
            else if (floorLower.includes("rubber")) floorCode = "09.650";
            else if (floorLower.includes("polish") || floorLower.includes("seal")) floorCode = "03.350";
            lineItems.push({
              code: floorCode,
              description: `Flooring — ${entry.room}: ${entry.floor}`,
              unit: "SF",
              m: 0, l: 0, e: 0, qty: 0,
              source: { type, sheetId, entry: entry.room },
              confidence: "medium",
            });
          }

          // ── Base finish ──
          if (entry.base && !isNone(entry.base)) {
            const baseLower = entry.base.toLowerCase();
            let baseCode = "09.650"; // generic base
            if (baseLower.includes("rubber")) baseCode = "09.650";
            else if (baseLower.includes("ceramic") || baseLower.includes("tile")) baseCode = "09.310";
            else if (baseLower.includes("wood")) baseCode = "06.220";
            lineItems.push({
              code: baseCode,
              description: `Base — ${entry.room}: ${entry.base}`,
              unit: "LF",
              m: 0, l: 0, e: 0, qty: 0,
              source: { type, sheetId, entry: entry.room },
              confidence: "medium",
            });
          }

          // ── Wall finishes — check all wall fields ──
          const wallFields = ["north_wall", "south_wall", "east_wall", "west_wall"];
          const wallFinishes = new Set(); // dedupe identical finishes per room
          wallFields.forEach(wf => {
            const val = entry[wf];
            if (val && !isNone(val) && !wallFinishes.has(val)) {
              wallFinishes.add(val);
              const wallLower = val.toLowerCase();
              let wallCode = "09.910"; // default: painting
              let wallUnit = "SF";
              if (wallLower.includes("paint") || wallLower.includes("gwb") || wallLower.includes("gypsum") || wallLower.includes("drywall") || wallLower.includes("level")) {
                wallCode = "09.910"; // painting
              } else if (wallLower.includes("ceramic") || wallLower.includes("porcelain") || wallLower.includes("tile")) {
                wallCode = "09.310"; // ceramic tile
              } else if (wallLower.includes("frp") || wallLower.includes("fiber")) {
                wallCode = "09.770"; // FRP panels
              } else if (wallLower.includes("vinyl") || wallLower.includes("wallcovering") || wallLower.includes("wall covering")) {
                wallCode = "09.720"; // wall coverings
              } else if (wallLower.includes("cmu") || wallLower.includes("block") || wallLower.includes("masonry")) {
                wallCode = "04.200"; // masonry
              } else if (wallLower.includes("panel") || wallLower.includes("acoustic")) {
                wallCode = "09.510"; // acoustical treatment
              } else if (wallLower.includes("epoxy")) {
                wallCode = "09.670"; // epoxy coating
              }
              lineItems.push({
                code: wallCode,
                description: `Wall Finish — ${entry.room}: ${val}`,
                unit: wallUnit,
                m: 0, l: 0, e: 0, qty: 0,
                source: { type, sheetId, entry: entry.room },
                confidence: "medium",
              });
            }
          });

          // ── Ceiling finish ──
          if (entry.ceiling && !isNone(entry.ceiling) && entry.ceiling.toLowerCase() !== "exposed") {
            const ceilLower = entry.ceiling.toLowerCase();
            let ceilCode = "09.510"; // default: acoustical ceiling
            if (ceilLower.includes("act") || ceilLower.includes("acoustic") || ceilLower.includes("armstrong") || ceilLower.includes("2x")) {
              ceilCode = "09.510"; // ACT
            } else if (ceilLower.includes("gwb") || ceilLower.includes("gypsum") || ceilLower.includes("drywall") || ceilLower.includes("paint")) {
              ceilCode = "09.250"; // GWB ceiling
            } else if (ceilLower.includes("metal") || ceilLower.includes("linear")) {
              ceilCode = "09.540"; // specialty ceiling
            } else if (ceilLower.includes("wood") || ceilLower.includes("plank")) {
              ceilCode = "09.540"; // specialty ceiling
            }
            lineItems.push({
              code: ceilCode,
              description: `Ceiling — ${entry.room}: ${entry.ceiling}`,
              unit: "SF",
              m: 0, l: 0, e: 0, qty: 0,
              source: { type, sheetId, entry: entry.room },
              confidence: "medium",
            });
          }
        });
        break;

      case "plumbing-fixture":
        entries.forEach(entry => {
          if (!entry.mark && !entry.fixture_type) return;
          const seedMatch = findSeedByKeywords(["plumbing", entry.fixture_type]);
          lineItems.push({
            code: "22.400",
            description: `${entry.fixture_type || "Plumbing Fixture"} ${entry.mark || ""}${entry.manufacturer ? ` (${entry.manufacturer})` : ""}${entry.model ? ` ${entry.model}` : ""}`.trim(),
            unit: "EA",
            seedId: seedMatch?.id,
            m: seedMatch?.material || 0, l: seedMatch?.labor || 0, e: seedMatch?.equipment || 0,
            qty: 1,
            source: { type, sheetId, entry: entry.mark },
            confidence: seedMatch ? "high" : "medium",
          });
        });
        break;

      case "equipment":
        entries.forEach(entry => {
          if (!entry.mark && !entry.description) return;
          lineItems.push({
            code: "11.400",
            description: `Equipment ${entry.mark || ""}: ${entry.description || ""}${entry.size ? ` (${entry.size})` : ""}`.trim(),
            unit: "EA",
            m: 0, l: 0, e: 0, qty: 1,
            source: { type, sheetId, entry: entry.mark },
            confidence: "low",
          });
        });
        break;

      case "lighting-fixture":
        entries.forEach(entry => {
          if (!entry.mark && !entry.description) return;
          lineItems.push({
            code: "26.510",
            description: `Lighting ${entry.mark || ""}: ${entry.description || ""}${entry.lamp_type ? ` (${entry.lamp_type})` : ""}${entry.wattage ? ` ${entry.wattage}W` : ""}`.trim(),
            unit: "EA",
            m: 0, l: 0, e: 0, qty: 0,
            source: { type, sheetId, entry: entry.mark },
            confidence: "medium",
          });
        });
        break;

      case "mechanical-equipment":
        entries.forEach(entry => {
          if (!entry.mark && !entry.description) return;
          lineItems.push({
            code: "23.300",
            description: `Mech Equip ${entry.mark || ""}: ${entry.description || ""}${entry.capacity_tons_cfm ? ` (${entry.capacity_tons_cfm})` : ""}${entry.voltage ? `, ${entry.voltage}` : ""}`.trim(),
            unit: "EA",
            m: 0, l: 0, e: 0, qty: 1,
            source: { type, sheetId, entry: entry.mark },
            confidence: "low",
          });
        });
        break;

      case "finish-detail":
        entries.forEach(entry => {
          if (!entry.material_type) return;
          lineItems.push({
            code: "09.900",
            description: `${entry.material_type}: ${entry.manufacturer || ""} ${entry.product || ""} — ${entry.color || ""} ${entry.application_area ? `(${entry.application_area})` : ""}`.trim(),
            unit: "SF",
            m: 0, l: 0, e: 0, qty: 0,
            source: { type, sheetId, entry: entry.material_type },
            confidence: "low",
          });
        });
        break;
    }
  });

  return lineItems;
}

// ─── Seed Element Matching ────────────────────────────────────────────
function findSeedByKeywords(keywords, sizeHint) {
  const terms = keywords.filter(Boolean).map(k => k.toLowerCase());
  let best = null;
  let bestScore = 0;

  SEED_ELEMENTS.forEach(seed => {
    const name = seed.name.toLowerCase();
    let score = 0;
    terms.forEach(term => {
      if (name.includes(term)) score += 2;
      // Partial word match
      const words = term.split(/\s+/);
      words.forEach(w => { if (w.length > 2 && name.includes(w)) score += 1; });
    });
    // Size hint bonus
    if (sizeHint && name.includes(sizeHint.toLowerCase())) score += 3;
    if (score > bestScore) { bestScore = score; best = seed; }
  });

  return bestScore >= 2 ? best : null;
}

// ─── AI-Augmented ROM ─────────────────────────────────────────────────
// Single AI call to refine ROM based on parsed schedules + project context
export async function augmentROMWithAI({ baseline, scheduleItems, projectContext, apiKey }) {
  if (!apiKey) return baseline;

  const scheduleSummary = scheduleItems.map(li =>
    `${li.code} ${li.description} (${li.unit}${li.qty ? `, qty: ${li.qty}` : ""})`
  ).join("\n");

  const divisionSummary = Object.entries(baseline.divisions).map(([div, data]) =>
    `Div ${div} ${data.label}: $${data.perSF.low}-$${data.perSF.high}/SF (mid: $${data.perSF.mid})`
  ).join("\n");

  try {
    const result = await callAnthropic({
      apiKey,
      max_tokens: 3000,
      system: `You are a senior construction cost estimator. You're reviewing a ROM (Rough Order of Magnitude) estimate for a ${baseline.projectSF} SF ${baseline.jobType} project. Adjust the baseline $/SF ranges based on the detected schedule details. Be practical — schedules reveal actual scope complexity.`,
      messages: [{ role: "user", content: `Here is the baseline ROM by division:
${divisionSummary}

Detected schedule line items:
${scheduleSummary || "(no schedule items detected)"}

${projectContext ? `Project context:\n${projectContext}` : ""}

Based on the detected schedules, refine the ROM estimates. If schedules reveal above-average complexity (many door types, high-end finishes, extensive mechanical equipment), increase the relevant divisions. If schedules show basic/standard selections, keep baseline or reduce slightly.

Return ONLY a JSON object with:
{
  "adjustments": {
    "<div_code>": { "mid": <adjusted_$/SF>, "reason": "<brief reason>" }
  },
  "notes": "<overall assessment in 1-2 sentences>"
}

Only include divisions that need adjustment. Use the 2-digit division code (e.g., "08", "09", "23").` }],
    });

    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { ...baseline, aiNotes: "AI response did not contain valid JSON" };
      const parsed = JSON.parse(jsonMatch[0]);

      // Apply adjustments to baseline
      const adjusted = JSON.parse(JSON.stringify(baseline)); // deep clone
      if (parsed.adjustments) {
        Object.entries(parsed.adjustments).forEach(([div, adj]) => {
          if (adjusted.divisions[div] && adj.mid) {
            const oldMid = adjusted.divisions[div].perSF.mid;
            const ratio = adj.mid / oldMid;
            adjusted.divisions[div].perSF.low = Math.round(adjusted.divisions[div].perSF.low * ratio * 100) / 100;
            adjusted.divisions[div].perSF.mid = Math.round(adj.mid * 100) / 100;
            adjusted.divisions[div].perSF.high = Math.round(adjusted.divisions[div].perSF.high * ratio * 100) / 100;
            // Recalculate totals
            const sf = adjusted.projectSF;
            adjusted.divisions[div].total = {
              low: Math.round(sf * adjusted.divisions[div].perSF.low),
              mid: Math.round(sf * adjusted.divisions[div].perSF.mid),
              high: Math.round(sf * adjusted.divisions[div].perSF.high),
            };
            adjusted.divisions[div].aiReason = adj.reason;
          }
        });

        // Recalculate totals
        let totalLow = 0, totalMid = 0, totalHigh = 0;
        Object.values(adjusted.divisions).forEach(d => {
          totalLow += d.total.low;
          totalMid += d.total.mid;
          totalHigh += d.total.high;
        });
        adjusted.totals = { low: totalLow, mid: totalMid, high: totalHigh };
      }

      adjusted.aiAugmented = true;
      adjusted.aiNotes = parsed.notes || "";
      return adjusted;
    } catch {
      return { ...baseline, aiNotes: "Failed to parse AI adjustments" };
    }
  } catch (err) {
    console.warn("[romEngine] AI augmentation failed:", err.message);
    return { ...baseline, aiNotes: `AI error: ${err.message}` };
  }
}

// ─── Calibration ──────────────────────────────────────────────────────
// Compare ROM prediction vs actual estimate to derive calibration factors
export function computeCalibration(romPrediction, actuals) {
  if (!romPrediction?.divisions || !actuals?.divisions) return {};

  const calibration = {};
  Object.keys(romPrediction.divisions).forEach(div => {
    const predicted = romPrediction.divisions[div]?.total?.mid || 0;
    const actual = actuals.divisions[div] || 0;
    if (predicted > 0 && actual > 0) {
      calibration[div] = Math.round((actual / predicted) * 100) / 100;
    }
  });
  return calibration;
}
