/**
 * visionMetrics.js — Track Vision prediction accuracy and performance.
 *
 * Session-scoped metrics for monitoring NOVA's auto-takeoff performance.
 * Dev-only initially — accessible via console: getVisionMetrics()
 *
 * Tracks:
 *   - Session aggregate: total calls, predictions, accepts, rejects, cost
 *   - Per-takeoff: precision, recall, F1, latency, context layers used
 */

// ── Session-level metrics ──
const _session = {
  visionCalls: 0,
  totalPredictions: 0,
  accepted: 0,
  rejected: 0,
  userAdded: 0, // manual measurements (no prediction match)
  totalLatencyMs: 0,
  totalConfidence: 0,
  costEstimate: 0, // rough $ estimate for Vision API calls
  contextLevelsUsed: { legend: 0, firstClick: 0, crossSheet: 0, disciplineKB: 0 },
  startedAt: Date.now(),
};

// ── Per-takeoff metrics ──
const _perTakeoff = new Map(); // takeoffId → TakeoffMetrics

function ensureTakeoff(takeoffId) {
  if (!_perTakeoff.has(takeoffId)) {
    _perTakeoff.set(takeoffId, {
      takeoffId,
      strategy: "",
      visionCalls: 0,
      predictions: 0,
      accepted: 0,
      rejected: 0,
      userAdded: 0,
      totalLatencyMs: 0,
      totalConfidence: 0,
      contextLayers: [],
      startedAt: Date.now(),
    });
  }
  return _perTakeoff.get(takeoffId);
}

// ── Recording functions ──

/**
 * Record a Vision API call.
 * Call this after each callAnthropic for Vision predictions.
 */
export function recordVisionCall({ takeoffId, latencyMs, predictionCount, confidence, contextLayers, strategy }) {
  _session.visionCalls++;
  _session.totalPredictions += predictionCount || 0;
  _session.totalLatencyMs += latencyMs || 0;
  _session.totalConfidence += confidence || 0;
  // Rough cost: Sonnet ~$0.003/1K input tokens, ~$0.015/1K output. Vision image ~1500 tokens.
  // Estimate: ~$0.01 per call (conservative)
  _session.costEstimate += 0.01;

  if (contextLayers) {
    if (contextLayers.hasLegend) _session.contextLevelsUsed.legend++;
    if (contextLayers.hasFirstClick) _session.contextLevelsUsed.firstClick++;
    if (contextLayers.hasCrossSheet) _session.contextLevelsUsed.crossSheet++;
    _session.contextLevelsUsed.disciplineKB++;
  }

  if (takeoffId) {
    const t = ensureTakeoff(takeoffId);
    t.visionCalls++;
    t.predictions += predictionCount || 0;
    t.totalLatencyMs += latencyMs || 0;
    t.totalConfidence += confidence || 0;
    t.strategy = strategy || t.strategy;
    if (contextLayers) t.contextLayers.push(contextLayers);
  }
}

/**
 * Record a prediction accept.
 */
export function recordAccept(takeoffId) {
  _session.accepted++;
  if (takeoffId) {
    ensureTakeoff(takeoffId).accepted++;
  }
}

/**
 * Record a prediction reject.
 */
export function recordReject(takeoffId) {
  _session.rejected++;
  if (takeoffId) {
    ensureTakeoff(takeoffId).rejected++;
  }
}

/**
 * Record a manual measurement (user placed without prediction match).
 */
export function recordManualPlacement(takeoffId) {
  _session.userAdded++;
  if (takeoffId) {
    ensureTakeoff(takeoffId).userAdded++;
  }
}

// ── Query functions ──

/**
 * Get session-level metrics summary.
 */
export function getSessionMetrics() {
  const { visionCalls, totalPredictions, accepted, rejected, userAdded } = _session;
  const precision = (accepted + rejected) > 0 ? accepted / (accepted + rejected) : 0;
  const recall = (accepted + userAdded) > 0 ? accepted / (accepted + userAdded) : 0;
  const f1 = (precision + recall) > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
  const avgLatency = visionCalls > 0 ? Math.round(_session.totalLatencyMs / visionCalls) : 0;
  const avgConfidence = visionCalls > 0 ? _session.totalConfidence / visionCalls : 0;

  return {
    ..._session,
    precision: Math.round(precision * 100),
    recall: Math.round(recall * 100),
    f1: Math.round(f1 * 100),
    avgLatencyMs: avgLatency,
    avgConfidence: Math.round(avgConfidence * 100),
    sessionDurationMin: Math.round((Date.now() - _session.startedAt) / 60000),
  };
}

/**
 * Get per-takeoff metrics.
 */
export function getTakeoffMetrics(takeoffId) {
  const t = _perTakeoff.get(takeoffId);
  if (!t) return null;

  const precision = (t.accepted + t.rejected) > 0 ? t.accepted / (t.accepted + t.rejected) : 0;
  const recall = (t.accepted + t.userAdded) > 0 ? t.accepted / (t.accepted + t.userAdded) : 0;
  const f1 = (precision + recall) > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
  const avgLatency = t.visionCalls > 0 ? Math.round(t.totalLatencyMs / t.visionCalls) : 0;

  return {
    ...t,
    precision: Math.round(precision * 100),
    recall: Math.round(recall * 100),
    f1: Math.round(f1 * 100),
    avgLatencyMs: avgLatency,
  };
}

/**
 * Get all takeoff metrics (for console inspection).
 */
export function getAllTakeoffMetrics() {
  return [..._perTakeoff.keys()].map(id => getTakeoffMetrics(id));
}

/**
 * Full metrics dump (session + all takeoffs). Call from dev console:
 *   import('/src/utils/visionMetrics.js').then(m => console.table(m.getVisionMetrics()))
 */
export function getVisionMetrics() {
  return {
    session: getSessionMetrics(),
    takeoffs: getAllTakeoffMetrics(),
  };
}

// Expose on window for dev console access
if (typeof window !== "undefined") {
  window.__novaVisionMetrics = getVisionMetrics;
}
