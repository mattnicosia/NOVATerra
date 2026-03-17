// ============================================================
// NOVA Core — Approve Queue Line API
// POST /api/nova-core/approve-queue-line
//
// GC approves a pending bid_leveling_queue row.
// Accepts: { queue_id: UUID, gc_csi_code?: string, gc_notes?: string }
// Auth: nova_admin_token cookie.
// Uses NOVA_CORE_SERVICE_ROLE_KEY for all Supabase writes.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { approveQueuedLine } from '../src/lib/nova-core/bidRouter';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach(part => {
    const [key, ...rest] = part.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  });
  return cookies;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check
  const cookie = parseCookies((req.headers.cookie as string) || '');
  const ADMIN_SECRET = process.env.NOVA_ADMIN_SECRET;
  if (!ADMIN_SECRET || cookie.nova_admin_token !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let body: Record<string, unknown>;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const queueId = body.queue_id as string;
  if (!queueId || !UUID_RE.test(queueId)) {
    return res.status(400).json({ error: 'Missing or invalid queue_id (must be UUID)' });
  }

  const gcCsiCode = (body.gc_csi_code as string) || undefined;
  const gcNotes = (body.gc_notes as string) || undefined;

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Verify the queue row exists
    const { data: queueRow, error: fetchErr } = await sb
      .from('bid_leveling_queue')
      .select('*')
      .eq('id', queueId)
      .single();

    if (fetchErr || !queueRow) {
      return res.status(404).json({ error: 'Queue item not found' });
    }

    // Verify still pending
    if (queueRow.review_status !== 'pending') {
      return res.status(409).json({ error: `Item already ${queueRow.review_status}` });
    }

    // Approve the line
    const result = await approveQueuedLine(queueId, gcCsiCode, gcNotes);

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Return updated row
    const { data: updatedRow } = await sb
      .from('bid_leveling_queue')
      .select('*')
      .eq('id', queueId)
      .single();

    return res.status(200).json(updatedRow);
  } catch (err) {
    console.error('[approve-queue-line]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
