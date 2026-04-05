/**
 * NovaLearning Store — Consolidated from correctionStore + firmMemory + evaluationLogger + correctionSync
 *
 * Single store for all NOVA learning state: corrections, global patterns,
 * firm memory, evaluation logging, and vector sync.
 */
import { create } from "zustand";
import { uid } from "@/utils/format";
import { storage } from "@/utils/storage";
import { idbKey } from "@/utils/idbKey";

const MAX_CORRECTIONS = 500;
const MAX_GLOBAL_PATTERNS = 200;
const MAX_FIRMS = 100;
const MAX_PATTERNS_PER_FIRM = 50;
const MAX_OBSERVATIONS = 10;
const EVAL_IDB_KEY = "nova-ai-evaluations";
const MAX_LOCAL_EVALS = 500;

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

export const useNovaLearningStore = create((set, get) => ({
  // ═══════════════════════════════════════════════════════════════
  // Corrections (from correctionStore)
  // ═══════════════════════════════════════════════════════════════
  corrections: [],
  globalPatterns: [],

  setCorrections: (list) => set({ corrections: list }),
  setGlobalPatterns: (list) => set({ globalPatterns: list }),

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
      _synced: false,
    };

    set(s => {
      const next = [...s.corrections, correction].slice(-MAX_CORRECTIONS);
      return { corrections: next };
    });

    get()._updateGlobalPattern(type, correction);

    // Debounced vector sync
    clearTimeout(useNovaLearningStore._syncTimer);
    useNovaLearningStore._syncTimer = setTimeout(async () => {
      try {
        await syncCorrectionsToVector();
      } catch { /* non-critical */ }
    }, 5000);

    return correction;
  },

  logMiss: (scheduleType, entry, sheetLabel) => {
    return get().logCorrection("schedule:miss", {
      context: `Missed ${scheduleType} entry on ${sheetLabel}`,
      original: null,
      corrected: entry,
      scheduleType,
      sheetLabel,
    });
  },

  logFalsePositive: (scheduleType, entry, sheetLabel) => {
    return get().logCorrection("schedule:false", {
      context: `False positive ${scheduleType} on ${sheetLabel}`,
      original: entry,
      corrected: null,
      scheduleType,
      sheetLabel,
    });
  },

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

  logRomAdjustment: (division, original, corrected) => {
    return get().logCorrection("rom:estimate", {
      context: `ROM adjustment for ${division}`,
      original,
      corrected,
      field: division,
    });
  },

  _updateGlobalPattern: (type, correction) => {
    set(s => {
      const patterns = [...s.globalPatterns];
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
          _synced: false,
        });
      }

      return { globalPatterns: patterns.slice(-MAX_GLOBAL_PATTERNS) };
    });
  },

  buildCorrectionContext: (scheduleType, maxChars = 2000) => {
    const patterns = get().globalPatterns
      .filter(p => {
        if (scheduleType && p.scheduleType && p.scheduleType !== scheduleType) return false;
        return p.frequency >= 2;
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

  // ═══════════════════════════════════════════════════════════════
  // Firm Memory (from firmMemory)
  // ═══════════════════════════════════════════════════════════════
  firms: {},

  setFirms: (v) => set({ firms: v }),

  registerFirm: (titleBlock, role = "architect") => {
    const name = titleBlock?.architect || titleBlock?.engineer || "";
    if (!name || name.length < 2) return null;

    const firmKey = normalizeFirmName(name);
    set(s => {
      const existing = s.firms[firmKey];
      if (existing) {
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

      const firms = { ...s.firms };
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

  logPattern: (firmKey, patternType, details) => {
    if (!firmKey) return;

    set(s => {
      const firm = s.firms[firmKey];
      if (!firm) return {};

      const patterns = [...firm.patterns];
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

  learnFromScan: (firmKey, scanResults) => {
    if (!firmKey || !scanResults) return;

    const { schedules = [], drawingNotes = [] } = scanResults;

    schedules.forEach(sched => {
      if (!sched.entries?.length) return;
      get().logPattern(firmKey, "schedule-location", {
        description: `${sched.type} schedule found on ${sched.sheetLabel}`,
        scheduleType: sched.type,
        sheetLabel: sched.sheetLabel,
        confidence: 0.6,
      });
    });

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

  lookupFirm: (firmName) => {
    if (!firmName) return null;
    const firmKey = normalizeFirmName(firmName);
    return get().firms[firmKey] || null;
  },

  getFirmStats: () => {
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

// ═══════════════════════════════════════════════════════════════
// Evaluation Logger (from evaluationLogger — standalone functions)
// ═══════════════════════════════════════════════════════════════

/**
 * Log an AI call for later accuracy evaluation.
 */
export async function logAICall({
  phase, model, inputSummary, aiResult, latencyMs,
  correctionContextUsed = false, vectorCorrectionsUsed = 0,
}) {
  const id = `eval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry = {
    id, phase, model,
    inputSummary: (inputSummary || '').slice(0, 500),
    aiResult: typeof aiResult === 'string' ? aiResult.slice(0, 2000) : aiResult,
    latencyMs: Math.round(latencyMs || 0),
    correctionContextUsed,
    vectorCorrectionsUsed,
    userOutcome: null,
    accuracyScore: null,
    createdAt: new Date().toISOString(),
    _synced: false,
  };

  try {
    const raw = await storage.get(idbKey(EVAL_IDB_KEY));
    const existing = raw?.value ? (typeof raw.value === 'string' ? JSON.parse(raw.value) : raw.value) : [];
    const updated = [...existing, entry].slice(-MAX_LOCAL_EVALS);
    await storage.set(idbKey(EVAL_IDB_KEY), JSON.stringify(updated));
  } catch { /* non-critical */ }

  _syncEvalToSupabase(entry).catch(() => {});
  return id;
}

/**
 * Record the user outcome for a previously logged AI call.
 */
export async function recordOutcome(evaluationId, userOutcome, accuracyScore) {
  try {
    const raw = await storage.get(idbKey(EVAL_IDB_KEY));
    const existing = raw?.value ? (typeof raw.value === 'string' ? JSON.parse(raw.value) : raw.value) : [];
    const updated = existing.map(e =>
      e.id === evaluationId ? { ...e, userOutcome, accuracyScore, _synced: false } : e
    );
    await storage.set(idbKey(EVAL_IDB_KEY), JSON.stringify(updated));

    const entry = updated.find(e => e.id === evaluationId);
    if (entry) _syncEvalToSupabase(entry).catch(() => {});
  } catch { /* non-critical */ }
}

/**
 * Get evaluation summary.
 */
export async function getEvaluationSummary(days = 30) {
  try {
    const { supabase } = await import("@/utils/supabase");
    if (!supabase) throw new Error("No supabase");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("No session");

    const { data, error } = await supabase.rpc('get_evaluation_summary', {
      p_user_id: session.user.id,
      p_days: days,
    });
    if (error) throw error;
    return data || {};
  } catch {
    return _getLocalEvalSummary(days);
  }
}

async function _syncEvalToSupabase(entry) {
  try {
    const { supabase } = await import("@/utils/supabase");
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await supabase.from('ai_evaluations').upsert({
      id: entry.id,
      user_id: session.user.id,
      phase: entry.phase,
      model: entry.model,
      input_summary: entry.inputSummary,
      ai_result: entry.aiResult,
      user_outcome: entry.userOutcome,
      accuracy_score: entry.accuracyScore,
      latency_ms: entry.latencyMs,
      correction_context_used: entry.correctionContextUsed,
      vector_corrections_used: entry.vectorCorrectionsUsed,
      created_at: entry.createdAt,
    }, { onConflict: 'id' });
  } catch { /* non-critical */ }
}

async function _getLocalEvalSummary(days) {
  try {
    const raw = await storage.get(idbKey(EVAL_IDB_KEY));
    const all = raw?.value ? (typeof raw.value === 'string' ? JSON.parse(raw.value) : raw.value) : [];
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const recent = all.filter(e => e.createdAt > cutoff);

    const byPhase = {};
    for (const e of recent) {
      if (!byPhase[e.phase]) byPhase[e.phase] = { count: 0, accuracySum: 0, accuracyCount: 0 };
      byPhase[e.phase].count++;
      if (e.accuracyScore != null) {
        byPhase[e.phase].accuracySum += e.accuracyScore;
        byPhase[e.phase].accuracyCount++;
      }
    }

    return {
      total_calls: recent.length,
      by_phase: Object.fromEntries(
        Object.entries(byPhase).map(([phase, stats]) => [phase, {
          count: stats.count,
          avg_accuracy: stats.accuracyCount > 0 ? Math.round(stats.accuracySum / stats.accuracyCount * 1000) / 1000 : null,
        }])
      ),
    };
  } catch { return {}; }
}

// ═══════════════════════════════════════════════════════════════
// Correction Sync (from correctionSync — standalone functions)
// ═══════════════════════════════════════════════════════════════

/**
 * Batch-sync unsynced corrections to pgvector embeddings table.
 */
export async function syncCorrectionsToVector() {
  const { corrections, setCorrections } = useNovaLearningStore.getState();
  const unsynced = corrections.filter(c => !c._synced);
  if (unsynced.length === 0) return;

  const texts = unsynced.map(c => {
    const parts = [
      `[${c.type}]`,
      c.scheduleType ? `Schedule: ${c.scheduleType}` : "",
      c.field ? `Field: ${c.field}` : "",
      c.context || "",
      `Original: ${typeof c.original === "string" ? c.original : JSON.stringify(c.original)}`,
      `Corrected: ${typeof c.corrected === "string" ? c.corrected : JSON.stringify(c.corrected)}`,
    ].filter(Boolean).join(" | ");
    return parts;
  });

  const metadata = unsynced.map(c => ({
    type: c.type,
    scheduleType: c.scheduleType || null,
    field: c.field || null,
    sheetLabel: c.sheetLabel || null,
    timestamp: c.timestamp,
  }));

  try {
    const { embedAndStore } = await import("@/utils/vectorSearch");
    await embedAndStore(texts, metadata, "correction");

    const syncedIds = new Set(unsynced.map(c => c.id));
    setCorrections(corrections.map(c => syncedIds.has(c.id) ? { ...c, _synced: true } : c));
    console.log(`[correctionSync] Synced ${unsynced.length} corrections to vector store`);
  } catch (err) {
    console.warn("[correctionSync] Sync failed (non-critical):", err.message);
  }
}

/**
 * Search pgvector for similar past corrections.
 */
export async function searchSimilarCorrections(scheduleType, contextText) {
  try {
    const { searchSimilar } = await import("@/utils/vectorSearch");
    const query = `${scheduleType} schedule parsing: ${contextText.slice(0, 200)}`;
    const { results } = await searchSimilar(query, {
      kinds: ["correction"],
      limit: 5,
      threshold: 0.4,
    });

    if (!results || results.length === 0) return "";

    const relevant = results.filter(r =>
      !r.metadata?.scheduleType || r.metadata.scheduleType === scheduleType
    );
    if (relevant.length === 0) return "";

    const lines = relevant.slice(0, 3).map(r => `- ${r.content}`);
    return [
      "PAST CORRECTIONS (apply these learned patterns):",
      ...lines,
      "",
    ].join("\n");
  } catch (err) {
    console.warn("[correctionSync] Search failed (non-critical):", err.message);
    return "";
  }
}
