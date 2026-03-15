// ============================================================
// NOVA Core — Admin Intelligence Endpoint
// GET /api/admin/nova-intelligence
//
// Returns ROM coverage, fallback rates, top CSI codes,
// and display flag distribution for the admin panel.
// Uses NOVA_CORE_SERVICE_ROLE_KEY (server-side only).
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function parseCookies(cookieHeader) {
  const cookies = {};
  cookieHeader.split(';').forEach(part => {
    const [key, ...rest] = part.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  });
  return cookies;
}

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
    return res.status(500).json({ error: 'Missing NOVA Core credentials' });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    // ── 1. Coverage map: per metro, CSI code counts by display_flag ──
    // Query market_intelligence_view for local data coverage
    const { data: mivRows, error: mivErr } = await sb
      .from('market_intelligence_view')
      .select('metro_area, display_flag')
      .limit(500);

    if (mivErr) throw mivErr;

    // Aggregate coverage per metro
    const coverageMap = {};
    (mivRows || []).forEach(row => {
      const metro = row.metro_area || 'unknown';
      if (!coverageMap[metro]) {
        coverageMap[metro] = { metro_area: metro, total: 0, none: 0, indicative: 0, insufficient_data: 0 };
      }
      coverageMap[metro].total += 1;
      const flag = row.display_flag || 'none';
      if (flag in coverageMap[metro]) {
        coverageMap[metro][flag] += 1;
      }
    });

    // Sort by total descending
    const coverage = Object.values(coverageMap).sort((a, b) => b.total - a.total);

    // ── 2. National fallback rate ──
    const { data: fallbackRows, error: fbErr } = await sb
      .from('rom_query_log')
      .select('display_flag, is_national')
      .limit(500);

    if (fbErr) throw fbErr;

    const totalQueries = (fallbackRows || []).length;
    const nationalQueries = (fallbackRows || []).filter(r => r.is_national).length;
    const fallbackRate = totalQueries > 0
      ? Math.round((nationalQueries / totalQueries) * 1000) / 10
      : 0;

    // ── 3. Top 10 most-queried CSI codes (last 30 days) ──
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: topCsiRows, error: topErr } = await sb
      .from('rom_query_log')
      .select('csi_code_id')
      .gte('queried_at', thirtyDaysAgo)
      .limit(500);

    if (topErr) throw topErr;

    const csiCounts = {};
    (topCsiRows || []).forEach(r => {
      csiCounts[r.csi_code_id] = (csiCounts[r.csi_code_id] || 0) + 1;
    });
    const topCsiCodes = Object.entries(csiCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([code, count]) => ({ csi_code_id: code, query_count: count }));

    // ── 4. Display flag distribution (last 7 days) ──
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: flagRows, error: flagErr } = await sb
      .from('rom_query_log')
      .select('display_flag')
      .gte('queried_at', sevenDaysAgo)
      .limit(500);

    if (flagErr) throw flagErr;

    const flagCounts = {};
    let flagTotal = 0;
    (flagRows || []).forEach(r => {
      const f = r.display_flag || 'none';
      flagCounts[f] = (flagCounts[f] || 0) + 1;
      flagTotal += 1;
    });
    const flagDistribution = Object.entries(flagCounts)
      .map(([flag, count]) => ({
        display_flag: flag,
        count,
        pct: flagTotal > 0 ? Math.round((count / flagTotal) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return res.status(200).json({
      coverage,
      fallback: {
        total_queries: totalQueries,
        national_queries: nationalQueries,
        fallback_rate_pct: fallbackRate,
      },
      top_csi_codes: topCsiCodes,
      flag_distribution: flagDistribution,
      flag_total: flagTotal,
    });
  } catch (err) {
    console.error('[nova-intelligence]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
