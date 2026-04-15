// ============================================================
// NOVA Core — Public Benchmark Search API
// GET /api/nova-core/public-benchmark?q=<search>
//
// Public endpoint — NO auth required.
// Returns up to 8 benchmark results with P10/P50/P90 pricing.
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

  const q = (req.query.q as string || '').trim();
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query parameter q is required (min 2 characters)' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data, error } = await sb.rpc('exec_sql', {
      query: `
        SELECT cc.section as csi_code, cc.title as csi_title,
          uom.code as unit, uc.unit_cost as p50,
          sr.spec_section, sr.spec_title
        FROM unit_costs uc
        JOIN csi_codes cc ON cc.id = uc.csi_code_id
        JOIN units_of_measure uom ON uom.id = uc.unit_id
        LEFT JOIN spec_references sr ON sr.csi_code_id = cc.id
        WHERE (cc.section ILIKE '%' || $1 || '%' OR cc.title ILIKE '%' || $1 || '%')
          AND uc.is_active = true AND uc.state = 'National'
        LIMIT 8
      `,
      params: [q],
    });

    // If rpc doesn't exist, fall back to manual query
    let rows = data;
    if (error) {
      // Fallback: use the query builder with ilike
      const { data: ccData, error: ccError } = await sb
        .from('unit_costs')
        .select(`
          unit_cost,
          csi_codes!inner(section, title),
          units_of_measure!inner(code)
        `)
        .eq('is_active', true)
        .eq('state', 'National')
        .or(`section.ilike.%${q}%,title.ilike.%${q}%`, { referencedTable: 'csi_codes' })
        .limit(8);

      if (ccError) {
        console.error('[public-benchmark] query error:', ccError.message);
        return res.status(500).json({ error: 'Search failed' });
      }

      // Fetch spec references for matched CSI codes
      const csiTitles = (ccData || []).map((r: any) => r.csi_codes?.section).filter(Boolean);
      let specMap: Record<string, { spec_section: string; spec_title: string }> = {};

      if (csiTitles.length > 0) {
        const { data: specData } = await sb
          .from('spec_references')
          .select('csi_code_id, spec_section, spec_title, csi_codes!inner(section)')
          .in('csi_codes.section', csiTitles)
          .limit(20);

        if (specData) {
          for (const s of specData as any[]) {
            const sec = s.csi_codes?.section;
            if (sec && !specMap[sec]) {
              specMap[sec] = { spec_section: s.spec_section, spec_title: s.spec_title };
            }
          }
        }
      }

      rows = (ccData || []).map((r: any) => {
        const section = r.csi_codes?.section || '';
        const spec = specMap[section] || {};
        return {
          csi_code: section,
          csi_title: r.csi_codes?.title || '',
          unit: r.units_of_measure?.code || '',
          p50: r.unit_cost,
          spec_section: spec.spec_section || null,
          spec_title: spec.spec_title || null,
        };
      });
    }

    // Compute P10/P90 approximations and add display_flag
    const results = (rows || []).map((r: any) => ({
      csi_code: r.csi_code,
      csi_title: r.csi_title,
      unit: r.unit,
      p10: Math.round(r.p50 * 0.75 * 100) / 100,
      p50: r.p50,
      p90: Math.round(r.p50 * 1.35 * 100) / 100,
      display_flag: 'indicative',
      spec_section: r.spec_section || null,
      spec_title: r.spec_title || null,
    }));

    return res.status(200).json({ results, total: results.length });
  } catch (err) {
    console.error('[public-benchmark]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
