// ═══════════════════════════════════════════════════════════════════════════════
// scanVerifier.js — Self-verification for AI scan pipeline results
// Checks schedule parses and ROM outputs before they're shown to users.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Inline benchmark $/SF ranges (mirrored from romEngine BENCHMARKS) ───────
// These are simplified mid-range benchmarks for verification only.
// We don't import BENCHMARKS because it's not exported from romEngine.
const VERIFY_BENCHMARKS = {
  "commercial-office": {
    "01": { low: 20, high: 80 }, "02": { low: 1, high: 15 }, "03": { low: 5, high: 60 },
    "05": { low: 10, high: 80 }, "06": { low: 5, high: 80 }, "07": { low: 10, high: 80 },
    "08": { low: 3, high: 40 }, "09": { low: 10, high: 70 }, "22": { low: 5, high: 80 },
    "23": { low: 5, high: 50 }, "26": { low: 5, high: 80 },
    _expected: ["03", "09", "22", "23", "26"],
  },
  retail: {
    "01": { low: 10, high: 50 }, "09": { low: 15, high: 60 }, "22": { low: 3, high: 40 },
    "23": { low: 5, high: 60 }, "26": { low: 8, high: 80 },
    _expected: ["09", "22", "23", "26"],
  },
  healthcare: {
    "01": { low: 5, high: 80 }, "03": { low: 5, high: 50 }, "05": { low: 3, high: 120 },
    "06": { low: 10, high: 70 }, "09": { low: 15, high: 70 }, "22": { low: 10, high: 60 },
    "23": { low: 20, high: 80 }, "26": { low: 20, high: 60 },
    _expected: ["03", "09", "22", "23", "26"],
  },
  education: {
    "03": { low: 4, high: 30 }, "09": { low: 5, high: 30 }, "22": { low: 3, high: 20 },
    "23": { low: 5, high: 30 }, "26": { low: 4, high: 25 },
    _expected: ["03", "09", "22", "23", "26"],
  },
  industrial: {
    "03": { low: 8, high: 90 }, "05": { low: 10, high: 100 }, "07": { low: 5, high: 40 },
    "26": { low: 3, high: 40 }, "31": { low: 3, high: 40 },
    _expected: ["03", "05", "26"],
  },
  "residential-multi": {
    "06": { low: 15, high: 90 }, "09": { low: 25, high: 90 }, "22": { low: 10, high: 40 },
    "23": { low: 10, high: 30 }, "26": { low: 8, high: 40 },
    _expected: ["06", "09", "22", "26"],
  },
  "residential-single": {
    "03": { low: 1, high: 80 }, "06": { low: 3, high: 180 }, "07": { low: 5, high: 150 },
    "08": { low: 10, high: 110 }, "09": { low: 8, high: 160 }, "22": { low: 8, high: 50 },
    "23": { low: 3, high: 100 }, "26": { low: 4, high: 100 },
    _expected: ["06", "09", "22", "26"],
  },
  hospitality: {
    "03": { low: 5, high: 30 }, "09": { low: 8, high: 40 }, "22": { low: 4, high: 25 },
    "23": { low: 8, high: 35 }, "26": { low: 6, high: 30 },
    _expected: ["09", "22", "23", "26"],
  },
  restaurant: {
    "09": { low: 10, high: 60 }, "22": { low: 5, high: 50 }, "23": { low: 8, high: 60 },
    "26": { low: 8, high: 50 },
    _expected: ["09", "22", "23", "26"],
  },
  "mixed-use": {
    "03": { low: 5, high: 30 }, "09": { low: 5, high: 30 }, "22": { low: 3, high: 25 },
    "23": { low: 5, high: 30 }, "26": { low: 4, high: 25 },
    _expected: ["03", "09", "22", "26"],
  },
  government: {
    "03": { low: 5, high: 30 }, "09": { low: 5, high: 25 }, "22": { low: 3, high: 20 },
    "23": { low: 5, high: 25 }, "26": { low: 4, high: 20 },
    _expected: ["03", "09", "22", "23", "26"],
  },
};

// ─── Total $/SF sanity ranges by category ────────────────────────────────────
const TOTAL_PSF_RANGES = {
  commercial: { low: 100, high: 2000 },
  residential: { low: 80, high: 1500 },
};

/**
 * Normalize a division code to a 2-char string (e.g. 3 → "03", "26" → "26")
 */
function normDiv(code) {
  const s = String(code);
  return s.length === 1 ? "0" + s : s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// verifyScheduleParse — check parsed schedules against OCR metadata & patterns
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @param {Array} parsedSchedules — [{type, entries: [{mark, description, ...}], drawingId, sheetLabel}]
 * @param {Object} ocrMeta — { [drawingId]: { rowCount, confidence } }
 * @param {Array} correctionPatterns — from useCorrectionStore.getState().globalPatterns
 * @returns {{ pass: boolean, issues: Array, rerunItems: Array }}
 */
export function verifyScheduleParse(parsedSchedules, ocrMeta = {}, correctionPatterns = []) {
  const issues = [];
  const rerunItems = [];

  for (const sched of parsedSchedules) {
    const entries = sched.entries || [];
    const drawingId = sched.drawingId;
    const schedType = sched.type;

    // ── Check 1: Entry count vs OCR row count ──
    const meta = ocrMeta[drawingId];
    if (meta && meta.rowCount > 0) {
      const ratio = entries.length / meta.rowCount;
      if (ratio < 0.7) {
        const issue = {
          type: "underparsed",
          drawingId,
          schedType,
          reason: `Only ${entries.length}/${meta.rowCount} rows parsed (${Math.round(ratio * 100)}%)`,
          originalCount: entries.length,
        };
        issues.push(issue);
        rerunItems.push(issue);
      }
    }

    // ── Check 2: Empty critical fields ──
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const mark = (entry.mark ?? "").toString().trim();
      const desc = (entry.description ?? "").toString().trim();
      if (!mark && !desc) {
        issues.push({
          type: "empty-entry",
          drawingId,
          schedType,
          reason: `Entry ${i} has no mark and no description`,
          entryIndex: i,
        });
      }
    }

    // ── Check 3: Duplicate marks within same schedule type ──
    const markCounts = {};
    for (const entry of entries) {
      const mark = (entry.mark ?? "").toString().trim();
      if (!mark) continue;
      markCounts[mark] = (markCounts[mark] || 0) + 1;
    }
    for (const [mark, count] of Object.entries(markCounts)) {
      if (count > 1) {
        issues.push({
          type: "duplicate-mark",
          drawingId,
          schedType,
          reason: `Mark "${mark}" appears ${count} times in ${schedType} schedule`,
          mark,
          count,
        });
      }
    }
  }

  // ── Check 4: Known correction patterns ──
  const schedulePatterns = (correctionPatterns || []).filter(
    (p) => p.type?.startsWith("schedule:") && (p.frequency || 0) >= 3,
  );
  for (const pattern of schedulePatterns) {
    // pattern.type is like "schedule:door", pattern.field is the corrected field
    const targetType = pattern.type.replace("schedule:", "");
    const targetSchedules = parsedSchedules.filter((s) => s.type === targetType);
    for (const sched of targetSchedules) {
      for (const entry of sched.entries || []) {
        // If this pattern's field exists and the value matches the "before" correction pattern
        if (pattern.field && entry[pattern.field] && pattern.fromPattern) {
          try {
            const regex = new RegExp(pattern.fromPattern, "i");
            if (regex.test(String(entry[pattern.field]))) {
              issues.push({
                type: "known-correction",
                drawingId: sched.drawingId,
                schedType: sched.type,
                reason: `Field "${pattern.field}" matches known correction pattern (corrected ${pattern.frequency}x before)`,
                field: pattern.field,
                value: entry[pattern.field],
                patternId: pattern.id,
              });
            }
          } catch {
            // Invalid regex in pattern — skip
          }
        }
      }
    }
  }

  const pass = issues.length === 0 && rerunItems.length === 0;
  return { pass, issues, rerunItems };
}

// ═══════════════════════════════════════════════════════════════════════════════
// verifyROM — check ROM outputs against benchmarks and sanity ranges
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @param {Object} romResult — { divisions: { "03": { low, mid, high, perSF: {...} }, ... }, totals: { low, mid, high } }
 * @param {number} projectSF
 * @param {string} jobType — e.g. "commercial-office"
 * @param {Object} calibrationFactors — from useDrawingPipelineStore.getState().getCalibrationFactors()
 * @returns {{ pass: boolean, issues: Array, adjustments: Object }}
 */
export function verifyROM(romResult, projectSF, jobType, calibrationFactors = {}) {
  const issues = [];
  const adjustments = {};
  const divisions = romResult?.divisions || {};
  const totals = romResult?.totals || {};
  const benchmarks = VERIFY_BENCHMARKS[jobType] || {};
  const sf = parseFloat(projectSF) || 0;

  // ── Check 1: Division $/SF range ──
  for (const [divCode, div] of Object.entries(divisions)) {
    const code = normDiv(divCode);
    const perSFMid = div.perSF?.mid ?? (sf > 0 ? (div.mid || 0) / sf : 0);
    const bench = benchmarks[code];

    if (bench && perSFMid > 0) {
      const floor = bench.low * 0.5;
      const ceiling = bench.high * 2.0;

      if (perSFMid < floor || perSFMid > ceiling) {
        const clamped = Math.min(Math.max(perSFMid, floor), ceiling);
        issues.push({
          type: "division-outlier",
          divCode: code,
          reason: `Div ${code} $/SF = $${perSFMid.toFixed(2)} outside benchmark range [$${floor.toFixed(0)}–$${ceiling.toFixed(0)}]`,
          actual: perSFMid,
          benchLow: bench.low,
          benchHigh: bench.high,
        });
        adjustments[code] = { clampedMid: clamped, originalMid: perSFMid };
      }
    }
  }

  // ── Check 2: Total $/SF sanity ──
  if (sf > 0) {
    const totalMid = totals.mid || 0;
    const totalPSF = totalMid / sf;
    const isResidential = jobType?.startsWith("residential");
    const range = isResidential ? TOTAL_PSF_RANGES.residential : TOTAL_PSF_RANGES.commercial;

    if (totalPSF < range.low || totalPSF > range.high) {
      issues.push({
        type: "total-outlier",
        reason: `Total $/SF = $${totalPSF.toFixed(0)} outside ${isResidential ? "residential" : "commercial"} range [$${range.low}–$${range.high}]`,
        actual: totalPSF,
        rangeLow: range.low,
        rangeHigh: range.high,
      });
    }
  }

  // ── Check 3: Missing expected divisions ──
  if (sf > 1000 && benchmarks._expected) {
    for (const expectedDiv of benchmarks._expected) {
      const code = normDiv(expectedDiv);
      const div = divisions[code] || divisions[parseInt(code, 10)];
      if (!div) {
        issues.push({
          type: "missing-division",
          divCode: code,
          reason: `Division ${code} expected for ${jobType} but not present`,
        });
      }
    }
  }

  // ── Check 4: Zero-cost divisions ──
  for (const [divCode, div] of Object.entries(divisions)) {
    const code = normDiv(divCode);
    const bench = benchmarks[code];
    if (bench && (div.mid === 0 || div.mid == null)) {
      issues.push({
        type: "zero-cost",
        divCode: code,
        reason: `Division ${code} has $0 mid cost but benchmark expects $${bench.low}–$${bench.high}/SF`,
      });
    }
  }

  const pass = issues.length === 0;
  return { pass, issues, adjustments };
}
