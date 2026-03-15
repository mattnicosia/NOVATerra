// ============================================================
// NOVA Core — Intelligence Dashboard Data Endpoint
// GET /api/nova-core/intelligence-data
//
// Returns all six sections of intelligence dashboard data
// in a single response. Runs queries in parallel.
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

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    // Run all section queries in parallel
    const [
      totalScopeItems,
      itemsWithData,
      divisionsCovered,
      specRefCount,
      velocityData,
      divisionCoverage,
      carbonMaterials,
      carbonAvgIntensity,
      carbonSpecRefs,
      topApiQueries,
    ] = await Promise.all([
      // Section 1: Market Overview
      sb.rpc('exec_sql', { query: "SELECT COUNT(*) as count FROM csi_codes WHERE level = 3" })
        .then(r => r.data?.[0]?.count ?? 0)
        .catch(() => sb.from('csi_codes').select('id', { count: 'exact', head: true }).eq('level', 3).then(r => r.count ?? 0)),

      sb.from('unit_costs').select('csi_code_id', { count: 'exact', head: false }).eq('is_active', true)
        .then(r => {
          const ids = new Set((r.data || []).map((d: any) => d.csi_code_id));
          return ids.size;
        }),

      sb.from('csi_codes').select('division').eq('level', 3)
        .then(r => {
          const divs = new Set((r.data || []).map((d: any) => d.division));
          return divs.size;
        }),

      sb.from('spec_references').select('id', { count: 'exact', head: true })
        .then(r => r.count ?? 0),

      // Section 3: Data Velocity
      sb.from('unit_costs').select('created_at, source_type, source_weight')
        .order('created_at', { ascending: true })
        .then(r => {
          const dayMap: Record<string, { seed_weights: number[]; real_weights: number[] }> = {};
          for (const row of (r.data || [])) {
            const day = (row.created_at || '').slice(0, 10);
            if (!day) continue;
            if (!dayMap[day]) dayMap[day] = { seed_weights: [], real_weights: [] };
            if (row.source_type === 'public_seed') {
              dayMap[day].seed_weights.push(row.source_weight ?? 0.4);
            } else {
              dayMap[day].real_weights.push(row.source_weight ?? 0);
            }
          }
          return Object.entries(dayMap).map(([day, v]) => ({
            day,
            seed_weight: v.seed_weights.length > 0
              ? v.seed_weights.reduce((a: number, b: number) => a + b, 0) / v.seed_weights.length
              : 0,
            real_weight: v.real_weights.length > 0
              ? v.real_weights.reduce((a: number, b: number) => a + b, 0) / v.real_weights.length
              : 0,
          })).sort((a, b) => a.day.localeCompare(b.day));
        }),

      // Section 4: Coverage by Division
      (async () => {
        const [csiRes, specRes] = await Promise.all([
          sb.from('csi_codes').select('id, division, title, level'),
          sb.from('spec_references').select('csi_code_id'),
        ]);

        const codes = csiRes.data || [];
        const specRefs = specRes.data || [];

        // Division names from level=1
        const divNames: Record<string, string> = {};
        for (const c of codes) {
          if (c.level === 1) divNames[c.division] = c.title;
        }

        // Scope items per division (level=3)
        const divItems: Record<string, number> = {};
        const divItemIds: Record<string, Set<string>> = {};
        for (const c of codes) {
          if (c.level === 3) {
            divItems[c.division] = (divItems[c.division] || 0) + 1;
            if (!divItemIds[c.division]) divItemIds[c.division] = new Set();
            divItemIds[c.division].add(c.id);
          }
        }

        // Spec refs per division
        const specRefsByDiv: Record<string, number> = {};
        const csiToDivision: Record<string, string> = {};
        for (const c of codes) {
          if (c.level === 3) csiToDivision[c.id] = c.division;
        }
        for (const sr of specRefs) {
          const div = csiToDivision[sr.csi_code_id];
          if (div) specRefsByDiv[div] = (specRefsByDiv[div] || 0) + 1;
        }

        return Object.entries(divItems)
          .map(([div, itemCount]) => ({
            division: div,
            name: divNames[div] || `Division ${div}`,
            scope_items: itemCount,
            spec_refs: specRefsByDiv[div] || 0,
            coverage_pct: itemCount > 0
              ? Math.round((specRefsByDiv[div] || 0) / itemCount * 100)
              : 0,
          }))
          .sort((a, b) => b.scope_items - a.scope_items);
      })(),

      // Section 5: Carbon Summary
      sb.from('carbon_data').select('id', { count: 'exact', head: true })
        .then(r => r.count ?? 0),

      sb.from('carbon_data').select('total_co2e')
        .then(r => {
          const vals = (r.data || []).map((d: any) => d.total_co2e).filter((v: any) => v != null);
          if (vals.length === 0) return 0;
          return vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
        }),

      // Spec refs with carbon: scope items that have both spec_reference AND carbon_data
      (async () => {
        const [specRes, carbonRes] = await Promise.all([
          sb.from('spec_references').select('csi_code_id'),
          sb.from('carbon_data').select('csi_code_id'),
        ]);
        const specIds = new Set((specRes.data || []).map((d: any) => d.csi_code_id));
        const carbonIds = new Set((carbonRes.data || []).map((d: any) => d.csi_code_id));
        let count = 0;
        for (const id of carbonIds) {
          if (specIds.has(id)) count++;
        }
        return count;
      })(),

      // Section 6: Top API Queries
      (async () => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await sb.from('api_usage_log')
          .select('csi_code_queried')
          .gte('created_at', thirtyDaysAgo);

        if (error || !data || data.length === 0) return [];

        const counts: Record<string, number> = {};
        for (const row of data) {
          const code = row.csi_code_queried;
          if (code) counts[code] = (counts[code] || 0) + 1;
        }

        return Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([code, count]) => ({ csi_code: code, query_count: count }));
      })(),
    ]);

    return res.status(200).json({
      market_overview: {
        total_scope_items: Number(totalScopeItems),
        items_with_data: itemsWithData,
        divisions_covered: divisionsCovered,
        spec_references: Number(specRefCount),
      },
      velocity: velocityData,
      division_coverage: divisionCoverage,
      carbon: {
        materials_tracked: Number(carbonMaterials),
        avg_intensity: Math.round(Number(carbonAvgIntensity) * 100) / 100,
        spec_refs_with_carbon: carbonSpecRefs,
      },
      top_api_queries: topApiQueries,
    });
  } catch (err: any) {
    console.error('[intelligence-data]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
