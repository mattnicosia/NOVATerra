// ============================================================
// NOVA Core — Impact API Route
// GET /api/nova-core/impact
//
// PUBLIC endpoint — no auth required. Powers novaterra.ai/impact.
// Returns aggregate tree planting, CO2e avoidance, named groves,
// and carbon pioneer orgs across the entire platform.
// Uses NOVA_CORE_SERVICE_ROLE_KEY to bypass RLS.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = (
    process.env.NOVA_CORE_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).replace(/\\n/g, '').replace(/\n/g, '').trim();

  const serviceKey = (
    process.env.NOVA_CORE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).replace(/\\n/g, '').replace(/\n/g, '').trim();

  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Cache for 5 minutes
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const client = getServiceClient();
  if (!client) {
    return res.status(500).json({ error: 'Service unavailable' });
  }

  try {
    // Run all queries in parallel
    const [treesResult, co2eResult, grovesResult, pioneersResult] = await Promise.all([
      // Total trees from tree_planting_log
      client
        .from('tree_planting_log')
        .select('trees_awarded')
        .then(({ data, error }) => {
          if (error) throw error;
          const total = (data || []).reduce((sum: number, r: { trees_awarded: number }) => sum + (r.trees_awarded || 0), 0);
          return total;
        }),

      // Total CO2e avoided from environmental_scores
      client
        .from('environmental_scores')
        .select('carbon_saved_co2e')
        .then(({ data, error }) => {
          if (error) throw error;
          const total = (data || []).reduce((sum: number, r: { carbon_saved_co2e: number }) => sum + (Number(r.carbon_saved_co2e) || 0), 0);
          return total;
        }),

      // Named groves from contribution_tracking joined with organizations
      client
        .from('contribution_tracking')
        .select('grove_name, trees_planted, org_id')
        .not('grove_name', 'is', null)
        .then(async ({ data, error }) => {
          if (error) throw error;
          if (!data || data.length === 0) return [];

          // Fetch org names for grove entries
          const orgIds = [...new Set(data.map((r: { org_id: string }) => r.org_id))];
          const { data: orgs } = await client
            .from('organizations')
            .select('id, name')
            .in('id', orgIds);

          const orgMap = new Map((orgs || []).map((o: { id: string; name: string }) => [o.id, o.name]));

          return data.map((r: { org_id: string; grove_name: string; trees_planted: number }) => ({
            org_name: orgMap.get(r.org_id) || 'Unknown',
            grove_name: r.grove_name,
            trees: r.trees_planted || 0,
          }));
        }),

      // Carbon pioneer orgs: contribution_tracking where current_tier is 'carbon_leader' or 'carbon_champion'
      client
        .from('contribution_tracking')
        .select('org_id, current_tier')
        .in('current_tier', ['carbon_leader', 'carbon_champion'])
        .then(async ({ data, error }) => {
          if (error) throw error;
          if (!data || data.length === 0) return [];

          const orgIds = data.map((r: { org_id: string }) => r.org_id);
          const { data: orgs } = await client
            .from('organizations')
            .select('id, name')
            .in('id', orgIds);

          const orgMap = new Map((orgs || []).map((o: { id: string; name: string }) => [o.id, o.name]));

          return data.map((r: { org_id: string }) => ({
            org_name: orgMap.get(r.org_id) || 'Unknown',
          }));
        }),
    ]);

    return res.status(200).json({
      total_trees: treesResult,
      total_co2e_avoided: co2eResult,
      groves: grovesResult,
      carbon_pioneer_orgs: pioneersResult,
      last_updated: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[impact] Query failed:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
