// ============================================================
// NOVA Core — Portal Lookup API
// GET /api/nova-core/portal-lookup?gc=<orgId>
//
// Public endpoint — NO auth required.
// Returns org name for valid org IDs. Never exposes internal data.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const gc = (req.query.gc as string || '').trim();
  if (!gc) {
    return res.status(400).json({ error: 'Missing gc parameter' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data, error } = await sb
      .from('organizations')
      .select('id, name')
      .eq('id', gc)
      .is('is_active', true)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    return res.status(200).json({
      orgId: data.id,
      orgName: data.name,
    });
  } catch (err) {
    console.error('[portal-lookup]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
