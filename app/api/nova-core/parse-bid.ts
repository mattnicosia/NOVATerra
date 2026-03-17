// ============================================================
// NOVA Core — Parse Bid Webhook Endpoint
// POST /api/nova-core/parse-bid
//
// Receives inbound emails from Postmark containing sub proposal
// PDFs. Extracts the PDF attachment, checks for duplicates,
// creates a parser_audit_log entry, then kicks off async parsing.
// Returns 200 immediately — processing happens in background.
//
// Uses NOVA_CORE_SERVICE_ROLE_KEY (server-side only).
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { parseProposalAsync } from '../src/lib/nova-core/parser';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. Verify Postmark webhook secret ──
  const webhookSecret = process.env.POSTMARK_WEBHOOK_SECRET;
  const signature = req.headers['x-postmark-signature'] as string | undefined;

  if (!webhookSecret || signature !== webhookSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing NOVA Core credentials' });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ── 2. Parse the Postmark JSON payload ──
  let body: Record<string, unknown>;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const fromEmail = (body.From as string) || (body.FromFull as any)?.Email || '';
  const subject = (body.Subject as string) || '';
  const attachments = (body.Attachments as any[]) || [];
  const toEmail = (body.To as string) || (body.OriginalRecipient as string) || '';

  // ── 3. Find the first PDF attachment ──
  const pdfAttachment = attachments.find(
    (a: any) => a.ContentType === 'application/pdf' || a.Name?.toLowerCase().endsWith('.pdf')
  );

  // ── 4. Extract org_id from recipient address ──
  // Format: bids+{org_id}@novaterra.ai or just bids@novaterra.ai
  let orgId: string | null = null;
  const orgMatch = toEmail.match(/bids\+([a-f0-9-]+)@/i);
  if (orgMatch) {
    orgId = orgMatch[1];
  }

  // Fall back to default org lookup by recipient domain if no org_id in address
  if (!orgId) {
    const { data: defaultOrg } = await sb
      .from('organizations')
      .select('id')
      .limit(1)
      .single();
    orgId = defaultOrg?.id || null;
  }

  if (!orgId) {
    return res.status(400).json({ error: 'Could not determine organization' });
  }

  if (!pdfAttachment) {
    // Log the attempt but no PDF to parse
    await sb.from('parser_audit_log').insert({
      org_id: orgId,
      input_hash: createHash('sha256').update(JSON.stringify(body).slice(0, 10000)).digest('hex'),
      source_email: fromEmail,
      total_lines_parsed: 0,
      error_message: 'No PDF attachment found',
    });
    return res.status(200).json({ status: 'no_pdf', message: 'No PDF attachment found' });
  }

  const pdfBase64: string = pdfAttachment.Content || '';

  // ── 5. Check for duplicate — SHA-256 of PDF content ──
  const inputHash = createHash('sha256').update(pdfBase64).digest('hex');

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: existingJob } = await sb
    .from('parser_audit_log')
    .select('id')
    .eq('input_hash', inputHash)
    .gte('created_at', fortyEightHoursAgo)
    .limit(1);

  if (existingJob && existingJob.length > 0) {
    return res.status(200).json({ status: 'duplicate', message: 'Duplicate PDF detected within 48 hours' });
  }

  // ── 6. Create parser_audit_log entry (enqueue the parse job) ──
  const { data: parseJob, error: insertErr } = await sb
    .from('parser_audit_log')
    .insert({
      org_id: orgId,
      input_hash: inputHash,
      source_email: fromEmail,
      total_lines_parsed: 0,
      high_confidence: 0,
      mid_confidence: 0,
      low_confidence: 0,
      auto_written: 0,
    })
    .select('id')
    .single();

  if (insertErr || !parseJob) {
    console.error('[parse-bid] Failed to create audit log:', insertErr?.message);
    return res.status(500).json({ error: 'Failed to enqueue parse job' });
  }

  // ── 7. Kick off async processing (do not await) ──
  parseProposalAsync(pdfBase64, fromEmail, orgId, parseJob.id, subject).catch((err) => {
    console.error(`[parse-bid] Async parse failed for job ${parseJob.id}:`, err.message || err);
  });

  // ── 8. Return 200 immediately ──
  return res.status(200).json({
    status: 'accepted',
    parse_job_id: parseJob.id,
    message: 'Proposal received and queued for processing',
  });
}
