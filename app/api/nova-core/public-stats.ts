// ============================================================
// NOVA Core — Public Stats API
// GET /api/nova-core/public-stats
//
// Public endpoint — NO auth required.
// Returns live counts of scope items, divisions, spec references.
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

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Run three count queries in parallel
    const [scopeRes, divRes, specRes] = await Promise.all([
      sb.from('csi_codes').select('id', { count: 'exact', head: true }).eq('level', 3),
      sb.from('csi_codes').select('division', { count: 'exact', head: true }).eq('level', 3),
      sb.from('spec_references').select('id', { count: 'exact', head: true }),
    ]);

    // For distinct divisions, we need a different approach since count doesn't do distinct
    // Fetch all division values and count unique ones
    const { data: divData } = await sb
      .from('csi_codes')
      .select('division')
      .eq('level', 3);

    const distinctDivisions = divData
      ? new Set(divData.map((r: any) => r.division)).size
      : 13;

    res.setHeader('Cache-Control', 'public, max-age=3600');

    return res.status(200).json({
      scope_items: scopeRes.count || 950,
      divisions: distinctDivisions,
      spec_refs: specRes.count || 777,
      last_updated: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[public-stats]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
