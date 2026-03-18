/**
 * NOVA Firm Memory — Learn architect/engineer patterns across projects
 *
 * Sprint 3.3: Track firm-specific conventions so NOVA-Plans can auto-apply
 * learned patterns when the same firm is detected via title block.
 *
 * Examples of learned patterns:
 *   - "Smith & Associates always puts door schedule on A6.01"
 *   - "ABC Engineers uses 'TYP' to mean all floors"
 *   - "XYZ Architects omits window sill heights — always check elevations"
 *   - "Johnson Design puts finish schedule on interior sheets, not arch sheets"
 *
 * Storage: persisted globally in IDB (not per-estimate) — patterns transcend projects.
 */

import { create } from "zustand";
import { uid } from "@/utils/format";

const MAX_FIRMS = 100;
const MAX_PATTERNS_PER_FIRM = 50;
const MAX_OBSERVATIONS = 10; // per pattern

export const useFirmMemoryStore = create((set, get) => ({
  // Firm profiles: { [firmKey]: FirmProfile }
  firms: {},

  setFirms: (v) => set({ firms: v }),

  /**
   * Record or update a firm profile from title block detection.
   * @param {object} titleBlock - { architect, engineer, projectName, projectNumber, date }
   * @param {string} [role] - "architect" | "engineer" | "owner"
   */
  registerFirm: (titleBlock, role = "architect") => {
    const name = titleBlock?.architect || titleBlock?.engineer || "";
    if (!name || name.length < 2) return null;

    const firmKey = normalizeFirmName(name);
    set(s => {
      const existing = s.firms[firmKey];
      if (existing) {
        // Update last seen + project count
        return {
          firms: {
            ...s.firms,
            [firmKey]: {
              ...existing,
              lastSeen: Date.now(),
              projectCount: existing.projectCount + 1,
              names: [...new Set([...existing.names, name])].slice(0, 5),
            },
          },
        };
      }

      // New firm
      const firms = { ...s.firms };
      // Enforce max firms (evict oldest)
      const keys = Object.keys(firms);
      if (keys.length >= MAX_FIRMS) {
        const oldest = keys.sort((a, b) => (firms[a].lastSeen || 0) - (firms[b].lastSeen || 0))[0];
        delete firms[oldest];
      }

      firms[firmKey] = {
        id: uid(),
        firmKey,
        names: [name],
        role,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        projectCount: 1,
        patterns: [],
      };

      return { firms };
    });

    return firmKey;
  },

  /**
   * Log a learned pattern for a firm.
   * @param {string} firmKey - Normalized firm key
   * @param {string} patternType - "schedule-location" | "abbreviation" | "convention" | "sheet-org" | "omission"
   * @param {object} details - { description, sheetLabel?, scheduleType?, confidence? }
   */
  logPattern: (firmKey, patternType, details) => {
    if (!firmKey) return;

    set(s => {
      const firm = s.firms[firmKey];
      if (!firm) return {};

      const patterns = [...firm.patterns];

      // Find existing pattern with same type + description
      const matchKey = `${patternType}:${details.description || ""}`;
      const existing = patterns.find(p => p.matchKey === matchKey);

      if (existing) {
        existing.frequency++;
        existing.lastSeen = Date.now();
        existing.confidence = Math.min(0.99, existing.confidence + 0.05);
        existing.observations = [
          ...existing.observations.slice(-(MAX_OBSERVATIONS - 1)),
          {
            timestamp: Date.now(),
            sheetLabel: details.sheetLabel || null,
            context: details.context || null,
          },
        ];
      } else {
        if (patterns.length >= MAX_PATTERNS_PER_FIRM) {
          // Evict lowest frequency + oldest
          patterns.sort((a, b) => a.frequency - b.frequency || a.lastSeen - b.lastSeen);
          patterns.shift();
        }

        patterns.push({
          id: uid(),
          matchKey,
          type: patternType,
          description: details.description || "",
          scheduleType: details.scheduleType || null,
          sheetLabel: details.sheetLabel || null,
          frequency: 1,
          confidence: details.confidence || 0.5,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          observations: [
            {
              timestamp: Date.now(),
              sheetLabel: details.sheetLabel || null,
              context: details.context || null,
            },
          ],
        });
      }

      return {
        firms: {
          ...s.firms,
          [firmKey]: { ...firm, patterns, lastSeen: Date.now() },
        },
      };
    });
  },

  /**
   * Auto-learn patterns from scan results.
   * Call after each successful scan to accumulate firm knowledge.
   * @param {string} firmKey
   * @param {object} scanResults
   */
  learnFromScan: (firmKey, scanResults) => {
    if (!firmKey || !scanResults) return;

    const { schedules = [], drawingNotes = [] } = scanResults;

    // Learn schedule locations
    schedules.forEach(sched => {
      if (!sched.entries?.length) return;
      get().logPattern(firmKey, "schedule-location", {
        description: `${sched.type} schedule found on ${sched.sheetLabel}`,
        scheduleType: sched.type,
        sheetLabel: sched.sheetLabel,
        confidence: 0.6,
      });
    });

    // Learn note patterns — high-relevance notes indicate firm conventions
    drawingNotes.forEach(dn => {
      if (!dn.notes?.length) return;
      const highNotes = dn.notes.filter(n => n.estimatingRelevance === "high");
      if (highNotes.length > 3) {
        get().logPattern(firmKey, "convention", {
          description: `Heavy specification notes on ${dn.sheetLabel} (${highNotes.length} high-relevance)`,
          sheetLabel: dn.sheetLabel,
          confidence: 0.4,
        });
      }
    });
  },

  /**
   * Build prompt context for a known firm.
   * Injects learned patterns into NOVA-Plans system prompts.
   * @param {string} firmName - Raw firm name (will be normalized)
   * @param {number} [maxChars=1000]
   * @returns {string}
   */
  buildFirmContext: (firmName, maxChars = 1000) => {
    if (!firmName) return "";
    const firmKey = normalizeFirmName(firmName);
    const firm = get().firms[firmKey];
    if (!firm || firm.patterns.length === 0) return "";

    const lines = [
      `KNOWN FIRM: ${firm.names[0]} (seen in ${firm.projectCount} project${firm.projectCount !== 1 ? "s" : ""})`,
      "Learned patterns from previous projects with this firm:",
    ];
    let chars = lines.join("\n").length;

    // Sort by frequency × confidence (most reliable patterns first)
    const sorted = [...firm.patterns]
      .filter(p => p.frequency >= 2 || p.confidence >= 0.7)
      .sort((a, b) => b.frequency * b.confidence - a.frequency * a.confidence);

    for (const p of sorted) {
      const line = `- [${p.type}] ${p.description} (seen ${p.frequency}x, conf: ${(p.confidence * 100).toFixed(0)}%)`;
      if (chars + line.length + 1 > maxChars) break;
      lines.push(line);
      chars += line.length + 1;
    }

    return lines.length > 2 ? lines.join("\n") : "";
  },

  /**
   * Look up a firm by raw name.
   * @param {string} firmName
   * @returns {object|null} FirmProfile
   */
  lookupFirm: (firmName) => {
    if (!firmName) return null;
    const firmKey = normalizeFirmName(firmName);
    return get().firms[firmKey] || null;
  },

  /**
   * Get stats for display.
   */
  getStats: () => {
    const firms = get().firms;
    const firmList = Object.values(firms);
    return {
      totalFirms: firmList.length,
      totalPatterns: firmList.reduce((sum, f) => sum + f.patterns.length, 0),
      topFirms: firmList
        .sort((a, b) => b.projectCount - a.projectCount)
        .slice(0, 10)
        .map(f => ({
          name: f.names[0],
          projects: f.projectCount,
          patterns: f.patterns.length,
          lastSeen: f.lastSeen,
        })),
    };
  },
}));

// ── Helpers ──────────────────────────────────────────────────────
function normalizeFirmName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+(and|&|associates|assoc|inc|llc|llp|pllc|pc|pa|co|corp|group|studio|design)\s*/g, " ")
    .replace(/\s+/g, "-")
    .trim()
    .slice(0, 60);
}
