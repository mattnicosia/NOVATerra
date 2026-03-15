// ============================================================
// NOVA Core — Admin Carbon Intelligence Endpoint
// GET /api/admin/nova-carbon
//
// Returns: carbon data coverage by trade, org tier distribution,
// recent tree planting log, top carbon-performing orgs.
// Uses NOVA_CORE_SERVICE_ROLE_KEY (server-side only).
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cookie = parseCookies(req.headers.cookie || '');
  const ADMIN_SECRET = process.env.NOVA_ADMIN_SECRET;
  if (!ADMIN_SECRET || cookie.nova_admin_token !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const [coverageResult, tiersResult, treeLogResult, topOrgsResult] = await Promise.all([
      // (1) Carbon data coverage by trade
      supabase
        .from('carbon_data')
        .select('trade_id, csi_code_id, active_co2e_source')
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        }),

      // (2) Org carbon tier distribution from contribution_tracking
      supabase
        .from('contribution_tracking')
        .select('current_tier')
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        }),

      // (3) Last 20 tree planting log entries
      supabase
        .from('tree_planting_log')
        .select('org_id, event_type, trees_awarded, grove_name, carbon_tier, created_at')
        .order('created_at', { ascending: false })
        .limit(20)
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        }),

      // (4) Top 10 orgs by carbon performance — last 30 days
      supabase
        .from('environmental_scores')
        .select('org_id, carbon_saved_co2e, carbon_tier, substitution_rate, carbon_intensity_vs_benchmark, created_at')
        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
        .order('carbon_saved_co2e', { ascending: false })
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        }),
    ]);

    // Fetch trade names for coverage breakdown
    const tradeIds = [...new Set(coverageResult.map(r => r.trade_id))];
    const { data: trades } = tradeIds.length > 0
      ? await supabase.from('trades').select('id, name').in('id', tradeIds)
      : { data: [] };
    const tradeMap = new Map((trades || []).map(t => [t.id, t.name]));

    // Build coverage table: group by trade, count CSI codes per source
    const coverageByTrade = {};
    for (const row of coverageResult) {
      const tradeName = tradeMap.get(row.trade_id) || row.trade_id;
      if (!coverageByTrade[tradeName]) {
        coverageByTrade[tradeName] = {
          trade_name: tradeName,
          total_csi_codes: new Set(),
          ice_generic: 0,
          ice_generic_ec3: 0,
          epd_specific: 0,
          estimated: 0,
        };
      }
      coverageByTrade[tradeName].total_csi_codes.add(row.csi_code_id);
      const src = row.active_co2e_source || 'ice_generic';
      if (src in coverageByTrade[tradeName]) {
        coverageByTrade[tradeName][src]++;
      }
    }

    const coverage = Object.values(coverageByTrade).map(t => ({
      ...t,
      total_csi_codes: t.total_csi_codes.size,
    })).sort((a, b) => b.total_csi_codes - a.total_csi_codes);

    // Build tier distribution
    const tierCounts = {};
    for (const row of tiersResult) {
      const tier = row.current_tier || 'unknown';
      tierCounts[tier] = (tierCounts[tier] || 0) + 1;
    }

    // Build top orgs — aggregate by org_id, take top 10
    const orgAgg = {};
    for (const row of topOrgsResult) {
      if (!orgAgg[row.org_id]) {
        orgAgg[row.org_id] = {
          org_id: row.org_id,
          total_co2e_saved: 0,
          score_count: 0,
          best_tier: row.carbon_tier,
          avg_substitution_rate: 0,
        };
      }
      orgAgg[row.org_id].total_co2e_saved += Number(row.carbon_saved_co2e) || 0;
      orgAgg[row.org_id].score_count++;
      orgAgg[row.org_id].avg_substitution_rate += Number(row.substitution_rate) || 0;
    }

    const topOrgs = Object.values(orgAgg)
      .map(o => ({
        ...o,
        avg_substitution_rate: o.score_count > 0
          ? Math.round((o.avg_substitution_rate / o.score_count) * 1000) / 1000
          : 0,
        total_co2e_saved: Math.round(o.total_co2e_saved * 100) / 100,
      }))
      .sort((a, b) => b.total_co2e_saved - a.total_co2e_saved)
      .slice(0, 10);

    // Resolve org names for tree log + top orgs
    const allOrgIds = [
      ...new Set([
        ...treeLogResult.map(r => r.org_id),
        ...topOrgs.map(r => r.org_id),
      ]),
    ];
    const { data: orgs } = allOrgIds.length > 0
      ? await supabase.from('organizations').select('id, name').in('id', allOrgIds)
      : { data: [] };
    const orgMap = new Map((orgs || []).map(o => [o.id, o.name]));

    const treeLog = treeLogResult.map(r => ({
      ...r,
      org_name: orgMap.get(r.org_id) || r.org_id?.slice(0, 8) || '—',
    }));

    const topOrgsNamed = topOrgs.map(o => ({
      ...o,
      org_name: orgMap.get(o.org_id) || o.org_id?.slice(0, 8) || '—',
    }));

    return res.status(200).json({
      coverage,
      tier_distribution: tierCounts,
      tree_log: treeLog,
      top_orgs: topOrgsNamed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[admin/nova-carbon] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function parseCookies(cookieHeader) {
  const cookies = {};
  cookieHeader.split(';').forEach(part => {
    const [key, ...rest] = part.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  });
  return cookies;
}
