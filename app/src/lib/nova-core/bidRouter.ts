// ============================================================
// NOVA Core — Bid Router
// Confidence routing, proposal creation from parsed data,
// and queue approval functions.
//
// Uses NOVA_CORE_SERVICE_ROLE_KEY for all Supabase writes.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// ── Types ──

export type ConfidenceRoute = 'auto_write' | 'review' | 'manual';

interface ParsedLineItem {
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  total_cost: number;
  csi_code: string | null;
  csi_confidence: number;
  notes: string | null;
}

// ── 1. routeByConfidence ──

/**
 * Determines the routing action for a parsed line item.
 * Lump sum lines always return 'review' regardless of confidence.
 */
export function routeByConfidence(
  confidence: number,
  threshold: number,
  isLumpSum = false,
): ConfidenceRoute {
  if (isLumpSum) return 'review';

  if (confidence >= threshold) return 'auto_write';
  if (confidence >= 0.60) return 'review';
  return 'manual';
}

// ── 2. createProposalFromParse ──

/**
 * Creates a proposals record from a completed parse job.
 * Sets source_type = 'sub_proposal', is_current_revision = true, revision_number = 1.
 * Links all bid_leveling_queue rows for this parse job to the new proposal_id.
 * Returns the new proposal UUID.
 */
export async function createProposalFromParse(
  parseJobId: string,
  orgId: string,
  meta?: {
    sub_company_name?: string;
    total_bid_amount?: number | null;
    project_name?: string | null;
    bid_date?: string | null;
  },
): Promise<string> {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Create proposal record
  const { data: proposal, error: propErr } = await sb
    .from('proposals')
    .insert({
      org_id: orgId,
      parser_job_id: parseJobId,
      source_type: 'sub_proposal',
      is_current_revision: true,
      revision_number: 1,
      is_active: true,
      sub_company_name: meta?.sub_company_name || null,
      base_bid_value: meta?.total_bid_amount || null,
      project_name: meta?.project_name || null,
      submitted_at: meta?.bid_date || new Date().toISOString(),
    })
    .select('id')
    .single();

  if (propErr || !proposal) {
    throw new Error(`Failed to create proposal: ${propErr?.message || 'no data returned'}`);
  }

  // Link all bid_leveling_queue rows for this parse job to the new proposal
  const { error: linkErr } = await sb
    .from('bid_leveling_queue')
    .update({ proposal_id: proposal.id })
    .eq('parse_job_id', parseJobId)
    .eq('org_id', orgId);

  if (linkErr) {
    console.error(`[bidRouter] Failed to link queue rows to proposal: ${linkErr.message}`);
  }

  return proposal.id;
}

// ── 3. approveQueuedLine ──

/**
 * GC approves a pending bid_leveling_queue row.
 * Updates review_status to 'approved', sets gc_csi_code if provided.
 * Writes to proposal_line_items and calls normalize-data-point Edge Function.
 */
export async function approveQueuedLine(
  queueId: string,
  gcCsiCode?: string,
  gcNotes?: string,
): Promise<{ success: boolean; error?: string }> {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Fetch the queued line
  const { data: queueRow, error: fetchErr } = await sb
    .from('bid_leveling_queue')
    .select('*')
    .eq('id', queueId)
    .single();

  if (fetchErr || !queueRow) {
    return { success: false, error: 'Queue item not found' };
  }

  if (queueRow.review_status !== 'pending') {
    return { success: false, error: `Item already ${queueRow.review_status}` };
  }

  // Update queue row
  const finalCsiCode = gcCsiCode || queueRow.suggested_csi_code;

  const { error: updErr } = await sb
    .from('bid_leveling_queue')
    .update({
      review_status: 'approved',
      gc_csi_code: gcCsiCode || null,
      gc_notes: gcNotes || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', queueId);

  if (updErr) {
    return { success: false, error: `Failed to update queue row: ${updErr.message}` };
  }

  // Write to proposal_line_items
  const { error: writeErr } = await sb.from('proposal_line_items').insert({
    org_id: queueRow.org_id,
    csi_code_id: finalCsiCode,
    description: queueRow.raw_description,
    quantity: queueRow.quantity,
    unit: queueRow.unit,
    unit_cost: queueRow.unit_cost,
    total_cost: queueRow.total_cost,
    source_type: 'sub_proposal',
    is_active: true,
    is_current_revision: true,
  });

  if (writeErr) {
    return { success: false, error: `Failed to write line item: ${writeErr.message}` };
  }

  // Increment auto_written on parser_audit_log
  if (queueRow.parse_job_id) {
    const { data: auditRow } = await sb
      .from('parser_audit_log')
      .select('auto_written')
      .eq('id', queueRow.parse_job_id)
      .single();

    if (auditRow) {
      await sb
        .from('parser_audit_log')
        .update({ auto_written: (auditRow.auto_written || 0) + 1 })
        .eq('id', queueRow.parse_job_id);
    }
  }

  // Call normalize-data-point Edge Function
  try {
    const normalizeUrl = `${SUPABASE_URL}/functions/v1/normalize-data-point`;
    await fetch(normalizeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        org_id: queueRow.org_id,
        csi_code_id: finalCsiCode,
        unit_cost: queueRow.unit_cost,
        total_cost: queueRow.total_cost,
        quantity: queueRow.quantity,
        unit: queueRow.unit,
        source_type: 'sub_proposal',
      }),
    });
  } catch (normErr) {
    console.error(`[bidRouter] normalize-data-point call failed:`, normErr);
  }

  return { success: true };
}
