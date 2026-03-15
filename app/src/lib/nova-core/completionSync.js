// ============================================================
// NOVA Core — Estimate Completion Sync
// src/lib/nova-core/completionSync.js
//
// When a NOVATerra estimate is marked Won/Complete, this module:
// 1. Writes a record to completed_estimates
// 2. Writes each line item to estimate_line_items
// 3. Calls evaluateEnvironmentalScore()
//
// Uses the NOVA Core Supabase client — never the existing client.
// Called from ProjectInfoPage and ProjectsPage Won handlers.
//
// NOVATerra uses short alphanumeric IDs (e.g. "vwf198ku5").
// NOVA Core uses UUIDs. We use source_estimate_id to bridge,
// and let the DB generate proper UUIDs for id columns.
// ============================================================

import { novaCoreClient } from './supabase';

// Dynamic import to handle .ts file through Vite
let _evaluateEnvironmentalScore = null;

async function getEvaluator() {
  if (!_evaluateEnvironmentalScore) {
    try {
      const mod = await import('./environmental');
      _evaluateEnvironmentalScore = mod.evaluateEnvironmentalScore;
    } catch (err) {
      console.warn('[completionSync] Could not load environmental module:', err.message);
    }
  }
  return _evaluateEnvironmentalScore;
}

/**
 * Sync a completed estimate to NOVA Core tables.
 *
 * @param {Object} params
 * @param {string} params.estimateId - The NOVATerra estimate ID (short alphanumeric)
 * @param {Object} params.estimateIndex - The estimate index entry (from estimatesIndex)
 * @param {Object} params.project - The project store state
 * @param {Array}  params.items - The items store line items array
 * @param {Object} params.outcomeMetadata - The outcome data from OutcomeFeedbackModal
 * @param {string} params.orgId - The org ID (from orgStore or estimateIndex)
 */
export async function syncCompletedEstimate({
  estimateId,
  estimateIndex,
  project,
  items,
  outcomeMetadata,
  orgId,
}) {
  console.log('[completionSync] syncCompletedEstimate called', { estimateId, orgId });

  if (!novaCoreClient) {
    console.warn('[completionSync] NOVA Core client not available — skipping');
    return;
  }

  if (!estimateId || !orgId) {
    console.warn('[completionSync] Missing estimateId or orgId — skipping');
    return;
  }

  console.log(`[completionSync] Syncing completed estimate ${estimateId} for org ${orgId}`);

  try {
    // ── Step 1: Upsert to completed_estimates via RPC ──
    // Uses SECURITY DEFINER RPC that sets org context internally,
    // bypassing PgBouncer connection pooling issues with set_config.

    const totalCost = estimateIndex?.grandTotal
      ?? items?.reduce((sum, it) => {
        const lineTotal =
          ((it.material || 0) + (it.labor || 0) + (it.equipment || 0) + (it.subcontractor || 0)) *
          (it.quantity || 1);
        return sum + lineTotal;
      }, 0)
      ?? 0;

    const estimateName = estimateIndex?.name || project?.name || 'Untitled';
    const estimateType = inferEstimateType(estimateIndex, project);

    console.log('[completionSync] Calling upsert_completed_estimate RPC', {
      orgId, estimateId, estimateName, estimateType, totalCost,
    });

    const { data: novaCoreEstimateId, error: ceErr } = await novaCoreClient
      .rpc('upsert_completed_estimate', {
        p_org_id: orgId,
        p_source_estimate_id: estimateId,
        p_estimate_name: estimateName,
        p_estimate_type: estimateType,
        p_total_cost: totalCost,
      });

    if (ceErr) {
      console.error('[completionSync] upsert_completed_estimate RPC failed:', ceErr.message);
      // Continue — don't block on this
    } else {
      console.log('[completionSync] completed_estimates written, UUID:', novaCoreEstimateId);
    }

    // ── Step 2: Write line items via RPC ──

    if (items && items.length > 0 && novaCoreEstimateId) {
      // CSI code resolution happens server-side in the RPC.
      // Pass raw NOVATerra code strings (e.g. "32.130") — the RPC
      // maps them to NOVA Core section format ("32 00 00") automatically.
      const lineItemsJson = items.map(it => ({
        code: it.code || null,
        description: it.description || '',
        quantity: it.quantity ?? 1,
        unit_cost:
          (it.material || 0) + (it.labor || 0) + (it.equipment || 0) + (it.subcontractor || 0),
        line_total:
          ((it.material || 0) + (it.labor || 0) + (it.equipment || 0) + (it.subcontractor || 0)) *
          (it.quantity || 1),
      }));

      console.log(`[completionSync] Calling insert_estimate_line_items RPC with ${lineItemsJson.length} items`);

      const { data: insertedCount, error: liErr } = await novaCoreClient
        .rpc('insert_estimate_line_items', {
          p_org_id: orgId,
          p_estimate_id: novaCoreEstimateId,
          p_items: lineItemsJson,
        });

      if (liErr) {
        console.error('[completionSync] insert_estimate_line_items RPC failed:', liErr.message);
      } else {
        console.log(`[completionSync] ${insertedCount} line items written`);
      }
    } else if (!novaCoreEstimateId) {
      console.warn('[completionSync] No NOVA Core estimate UUID — skipping line items');
    }

    // ── Step 3: Evaluate environmental score ──
    // Pass the NOVA Core UUID, not the NOVATerra short ID

    const evaluate = await getEvaluator();
    if (evaluate && novaCoreEstimateId) {
      try {
        await evaluate(novaCoreEstimateId, orgId);
        console.log('[completionSync] Environmental score evaluated');
      } catch (envErr) {
        console.error('[completionSync] Environmental evaluation failed:', envErr.message);
      }
    }

    console.log(`[completionSync] Complete for estimate ${estimateId} (UUID: ${novaCoreEstimateId})`);
  } catch (err) {
    console.error('[completionSync] syncCompletedEstimate error:', err.message, err);
  }
}

/**
 * Infer the estimate type from the estimate data.
 */
function inferEstimateType(estimateIndex, project) {
  const name = (estimateIndex?.name || project?.name || '').toLowerCase();
  if (name.includes('rom') || name.includes('rough order')) return 'rom';
  if (name.includes('schematic') || name.includes('sd')) return 'schematic';
  if (name.includes('dd') || name.includes('design dev')) return 'design_development';
  if (name.includes('cd') || name.includes('construction doc')) return 'construction_documents';
  return 'construction_documents'; // default for won estimates
}
