// ============================================================
// NOVA Core — Environmental Score Evaluation
// src/lib/nova-core/environmental.ts
//
// Single exported function: evaluateEnvironmentalScore()
// Runs when an estimate is marked complete. Calls a single
// SECURITY DEFINER RPC that handles everything server-side:
//   - Fetches line items with carbon data
//   - Computes CO2e, benchmark, intensity, substitution rate
//   - Upserts environmental_scores
//   - Evaluates carbon tier
//   - Logs tree planting events
//   - Updates contribution_tracking
//
// Uses the NOVA Core Supabase client — never the existing client.
// ============================================================

import { novaCoreClient } from './supabase';

/**
 * Evaluate and persist the environmental score for a completed estimate.
 *
 * All logic runs inside a single SECURITY DEFINER RPC on the database,
 * which sets org context internally — bypassing PgBouncer connection
 * pooling issues with set_config.
 */
export async function evaluateEnvironmentalScore(
  estimateId: string,
  orgId: string
): Promise<void> {
  if (!novaCoreClient) {
    console.warn('[environmental] NOVA Core client not available — skipping');
    return;
  }

  console.log('[environmental] Calling evaluate_environmental_score RPC', {
    estimateId,
    orgId,
  });

  const { data, error } = await novaCoreClient.rpc('evaluate_environmental_score', {
    p_estimate_id: estimateId,
    p_org_id: orgId,
  });

  if (error) {
    console.error('[environmental] RPC failed:', error.message);
    return;
  }

  console.log('[environmental] Evaluation result:', data);
}
