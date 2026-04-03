/**
 * evaluationLogger — Tracks AI call results + user outcomes for accuracy metrics.
 *
 * IDB-first (offline-capable), async sync to Supabase ai_evaluations table.
 * Non-blocking — never breaks the scan pipeline if logging fails.
 */

import { storage } from "@/utils/storage";
import { idbKey } from "@/utils/idbKey";

const IDB_KEY = "nova-ai-evaluations";
const MAX_LOCAL = 500;

/**
 * Log an AI call for later accuracy evaluation.
 * Call this after each AI phase in scanRunner.
 *
 * @param {Object} params
 * @param {string} params.phase — 'ocr' | 'detect' | 'parse' | 'rom' | 'predict' | 'notes' | 'params'
 * @param {string} params.model — 'haiku' | 'sonnet'
 * @param {string} params.inputSummary — truncated description of input
 * @param {*} params.aiResult — what AI returned (will be JSON-serialized)
 * @param {number} params.latencyMs — time taken
 * @param {boolean} params.correctionContextUsed — was local correction context injected?
 * @param {number} params.vectorCorrectionsUsed — how many vector corrections were injected?
 * @returns {string} evaluationId — use this to record outcome later
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

  // Save to IDB
  try {
    const raw = await storage.get(idbKey(IDB_KEY));
    const existing = raw?.value ? (typeof raw.value === 'string' ? JSON.parse(raw.value) : raw.value) : [];
    const updated = [...existing, entry].slice(-MAX_LOCAL);
    await storage.set(idbKey(IDB_KEY), JSON.stringify(updated));
  } catch { /* non-critical */ }

  // Async sync to Supabase (non-blocking)
  syncToSupabase(entry).catch(() => {});

  return id;
}

/**
 * Record the user outcome for a previously logged AI call.
 * Called when user edits/accepts/rejects AI results.
 */
export async function recordOutcome(evaluationId, userOutcome, accuracyScore) {
  try {
    const raw = await storage.get(idbKey(IDB_KEY));
    const existing = raw?.value ? (typeof raw.value === 'string' ? JSON.parse(raw.value) : raw.value) : [];
    const updated = existing.map(e =>
      e.id === evaluationId ? { ...e, userOutcome, accuracyScore, _synced: false } : e
    );
    await storage.set(idbKey(IDB_KEY), JSON.stringify(updated));

    // Sync updated record
    const entry = updated.find(e => e.id === evaluationId);
    if (entry) syncToSupabase(entry).catch(() => {});
  } catch { /* non-critical */ }
}

/**
 * Get evaluation summary — tries Supabase RPC, falls back to local.
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
    // Fallback to local
    return getLocalSummary(days);
  }
}

/** Sync a single evaluation entry to Supabase */
async function syncToSupabase(entry) {
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

/** Local fallback summary from IDB */
async function getLocalSummary(days) {
  try {
    const raw = await storage.get(idbKey(IDB_KEY));
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
