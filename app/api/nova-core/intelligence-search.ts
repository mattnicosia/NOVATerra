// ============================================================
// NOVA Core — Intelligence Benchmark Search Endpoint
// GET /api/nova-core/intelligence-search?q=[term]
//
// Searches unit_costs joined with csi_codes for the benchmark
// explorer in the intelligence dashboard.
// Auth: nova_admin_token cookie
// Uses NOVA_CORE_SERVICE_ROLE_KEY (server-side only).
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach(part => {
    const [key, ...rest] = part.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  });
  return cookies;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cookie = parseCookies(req.headers.cookie || '');
  const ADMIN_SECRET = process.env.NOVA_ADMIN_SECRET;
  if (!ADMIN_SECRET || cookie.nova_admin_token !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing NOVA Core credentials' });
  }

  const q = (req.query.q as string || '').trim();
  if (!q) {
    return res.status(200).json([]);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    // Fetch active unit costs with CSI code info
    const { data: costs, error: costErr } = await sb
      .from('unit_costs')
      .select(`
        id,
        unit_cost,
        p10,
        p90,
        display_flag,
        sample_count,
        state,
        source_type,
        updated_at,
        csi_code_id,
        unit_id,
        csi_codes!inner ( section, title ),
        units_of_measure!inner ( code )
      `)
      .eq('is_active', true)
      .or(`section.ilike.%${q}%,title.ilike.%${q}%`, { referencedTable: 'csi_codes' })
      .limit(20);

    if (costErr) throw costErr;

    // Fetch spec references for matched CSI code IDs
    const csiIds = [...new Set((costs || []).map((c: any) => c.csi_code_id))];
    let specMap: Record<string, { spec_section: string; spec_title: string }> = {};

    if (csiIds.length > 0) {
      const { data: specs } = await sb
        .from('spec_references')
        .select('csi_code_id, spec_section, spec_title')
        .in('csi_code_id', csiIds);

      for (const s of (specs || [])) {
        if (!specMap[s.csi_code_id]) {
          specMap[s.csi_code_id] = { spec_section: s.spec_section, spec_title: s.spec_title };
        }
      }
    }

    const results = (costs || []).map((row: any) => ({
      csi_code: row.csi_codes?.section,
      title: row.csi_codes?.title,
      unit: row.units_of_measure?.code,
      p50: row.unit_cost,
      p10: row.p10,
      p90: row.p90,
      display_flag: row.display_flag,
      sample_count: row.sample_count,
      state: row.state,
      source_type: row.source_type,
      updated_at: row.updated_at,
      spec_section: specMap[row.csi_code_id]?.spec_section || null,
      spec_title: specMap[row.csi_code_id]?.spec_title || null,
    }));

    return res.status(200).json(results);
  } catch (err: any) {
    console.error('[intelligence-search]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
