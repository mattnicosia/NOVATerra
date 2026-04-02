/**
 * NOVA Correction Store — Self-learning from user edits
 *
 * When NOVA parses schedules and the user edits the parsed data,
 * we log the correction. Over time, these corrections are fed back
 * into NOVA-Plans prompts as "common corrections" context, improving
 * accuracy across future scans.
 *
 * Correction types:
 *   - schedule:parse    → User corrected a parsed schedule entry
 *   - schedule:miss     → NOVA missed a schedule entry entirely
 *   - schedule:false    → NOVA detected a false positive
 *   - notes:category    → User recategorized a note
 *   - notes:relevance   → User changed relevance rating
 *   - rom:estimate      → User significantly adjusted ROM value
 *   - titleblock:field  → User corrected a title block field
 *   - scope:reject      → User deselected an AI-generated scope item
 *   - scope:accept      → User accepted AI scope items (logs what was kept)
 *   - pricing:adjust    → User applied different pricing than AI suggested
 *   - pricing:source    → User chose DB match over AI pricing (or vice versa)
 *   - assembly:edit     → User edited an AI-generated assembly element
 *
 * Storage: persisted per-estimate in IDB alongside estimate data,
 * plus a global corrections summary in master data for cross-project learning.
 */

import { create } from "zustand";
import { uid } from "@/utils/format";

const MAX_CORRECTIONS = 500; // per estimate
const MAX_GLOBAL_PATTERNS = 200; // cross-project patterns

export const useCorrectionStore = create((set, get) => ({
  // Per-estimate corrections
  corrections: [], // [{ id, type, timestamp, context, original, corrected, scheduleType?, field? }]

  // Global correction patterns (cross-project, aggregated)
  globalPatterns: [], // [{ id, type, pattern, frequency, lastSeen, examples }]

  setCorrections: (list) => set({ corrections: list }),
  setGlobalPatterns: (list) => set({ globalPatterns: list }),

  /**
   * Log a user correction.
   * @param {string} type - e.g. "schedule:parse", "notes:category"
   * @param {object} details - { context, original, corrected, scheduleType?, field?, sheetLabel? }
   */
  logCorrection: (type, details) => {
    const correction = {
      id: uid(),
      type,
      timestamp: Date.now(),
      context: details.context || "",
      original: details.original,
      corrected: details.corrected,
      scheduleType: details.scheduleType || null,
      field: details.field || null,
      sheetLabel: details.sheetLabel || null,
      architect: details.architect || null,
    };

    set(s => {
      const next = [...s.corrections, correction].slice(-MAX_CORRECTIONS);
      return { corrections: next };
    });

    // Also update global patterns
    get()._updateGlobalPattern(type, correction);

    return correction;
  },

  /**
   * Log when NOVA missed a schedule entry entirely.
   */
  logMiss: (scheduleType, entry, sheetLabel) => {
    return get().logCorrection("schedule:miss", {
      context: `Missed ${scheduleType} entry on ${sheetLabel}`,
      original: null,
      corrected: entry,
      scheduleType,
      sheetLabel,
    });
  },

  /**
   * Log when NOVA detected a false positive.
   */
  logFalsePositive: (scheduleType, entry, sheetLabel) => {
    return get().logCorrection("schedule:false", {
      context: `False positive ${scheduleType} on ${sheetLabel}`,
      original: entry,
      corrected: null,
      scheduleType,
      sheetLabel,
    });
  },

  /**
   * Log when user corrects a parsed field value.
   */
  logFieldCorrection: (scheduleType, field, original, corrected, sheetLabel) => {
    return get().logCorrection("schedule:parse", {
      context: `${scheduleType} field "${field}" corrected`,
      original,
      corrected,
      scheduleType,
      field,
      sheetLabel,
    });
  },

  /**
   * Log when user adjusts ROM estimate significantly.
   */
  logRomAdjustment: (division, original, corrected) => {
    return get().logCorrection("rom:estimate", {
      context: `ROM adjustment for ${division}`,
      original,
      corrected,
      field: division,
    });
  },

  // ── Global pattern aggregation ─────────────────────────
  _updateGlobalPattern: (type, correction) => {
    set(s => {
      const patterns = [...s.globalPatterns];
      // Find existing pattern for this type + field combination
      const key = `${type}:${correction.field || "general"}:${correction.scheduleType || "any"}`;
      const existing = patterns.find(p => p.patternKey === key);

      if (existing) {
        existing.frequency++;
        existing.lastSeen = Date.now();
        existing.examples = [
          ...existing.examples.slice(-4),
          { original: correction.original, corrected: correction.corrected },
        ];
      } else {
        patterns.push({
          id: uid(),
          patternKey: key,
          type,
          field: correction.field,
          scheduleType: correction.scheduleType,
          frequency: 1,
          lastSeen: Date.now(),
          examples: [{ original: correction.original, corrected: correction.corrected }],
        });
      }

      return { globalPatterns: patterns.slice(-MAX_GLOBAL_PATTERNS) };
    });
  },

  // ── Build correction context for prompts ───────────────
  /**
   * Build a text block of common corrections to inject into NOVA prompts.
   * Filters by schedule type for relevance.
   *
   * @param {string} [scheduleType] - Filter to specific schedule type
   * @param {number} [maxChars=2000] - Max characters for the context block
   * @returns {string}
   */
  buildCorrectionContext: (scheduleType, maxChars = 2000) => {
    const patterns = get().globalPatterns
      .filter(p => {
        if (scheduleType && p.scheduleType && p.scheduleType !== scheduleType) return false;
        return p.frequency >= 2; // Only include patterns seen 2+ times
      })
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20);

    if (patterns.length === 0) return "";

    const lines = [
      "COMMON USER CORRECTIONS (learn from these patterns — they indicate recurring mistakes):",
    ];
    let charCount = lines[0].length;

    for (const p of patterns) {
      const examples = p.examples.slice(-2).map(e => {
        const orig = typeof e.original === "string" ? e.original : JSON.stringify(e.original);
        const corr = typeof e.corrected === "string" ? e.corrected : JSON.stringify(e.corrected);
        return `"${orig}" → "${corr}"`;
      });

      const line = `- [${p.type}] ${p.field || "general"} (seen ${p.frequency}x): ${examples.join(", ")}`;
      if (charCount + line.length + 1 > maxChars) break;
      lines.push(line);
      charCount += line.length + 1;
    }

    return lines.join("\n");
  },

  /**
   * Get correction stats for display.
   */
  getStats: () => {
    const corrections = get().corrections;
    const patterns = get().globalPatterns;
    return {
      totalCorrections: corrections.length,
      uniquePatterns: patterns.length,
      byType: corrections.reduce((acc, c) => {
        acc[c.type] = (acc[c.type] || 0) + 1;
        return acc;
      }, {}),
      topPatterns: patterns
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 5),
    };
  },
}));
