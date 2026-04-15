// ============================================================
// NOVA Core — Analytics Dashboard Data Endpoint
// GET /api/nova-core/analytics-data
//
// Returns all six sections of analytics data in a single response.
// Runs queries in parallel with Promise.all.
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
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [
      // Section 1: Revenue
      mrrTrend,
      activeSubscriptions,

      // Section 2: Trial funnel
      activeTrials,
      expiringSoon,
      convertedOrgs,
      totalNonDemoOrgs,

      // Section 3: Data quality
      realDataCount,

      // Section 4: API performance
      apiTotalCalls,
      apiSuccessCalls,
      apiAvgResponse,
      apiCacheHits,
      topCsiQueries,

      // Section 5: Parser stats
      parserTotalProposals,
      parserAutoWritten,
      parserTotalLines,
      parserConfidenceData,

      // Section 6: Outreach
      outreachTotal,
      outreachOpened,
      outreachConverted,
      outreachUnsubscribed,
    ] = await Promise.all([
      // ── Section 1: Revenue ──
      sb.from('stripe_subscriptions')
        .select('created_at, mrr_cents, status')
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .then(r => {
          const dayMap: Record<string, number> = {};
          for (const row of (r.data || [])) {
            const day = (row.created_at || '').slice(0, 10);
            if (!day) continue;
            dayMap[day] = (dayMap[day] || 0) + (row.mrr_cents || 0) / 100;
          }
          return Object.entries(dayMap)
            .map(([day, mrr]) => ({ day, mrr }))
            .sort((a, b) => a.day.localeCompare(b.day));
        }),

      sb.from('stripe_subscriptions')
        .select('id, mrr_cents', { count: 'exact', head: false })
        .eq('status', 'active')
        .then(r => ({
          count: r.data?.length ?? 0,
          totalMrr: (r.data || []).reduce((sum: number, row: any) => sum + (row.mrr_cents || 0), 0) / 100,
        })),

      // ── Section 2: Trial funnel ──
      sb.from('organizations')
        .select('id', { count: 'exact', head: true })
        .gt('trial_ends_at', new Date().toISOString())
        .eq('is_paying', false)
        .eq('is_demo', false)
        .then(r => r.count ?? 0),

      sb.from('organizations')
        .select('id', { count: 'exact', head: true })
        .gt('trial_ends_at', new Date().toISOString())
        .lt('trial_ends_at', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
        .eq('is_paying', false)
        .eq('is_demo', false)
        .then(r => r.count ?? 0),

      sb.from('organizations')
        .select('id', { count: 'exact', head: true })
        .eq('is_paying', true)
        .then(r => r.count ?? 0),

      sb.from('organizations')
        .select('id', { count: 'exact', head: true })
        .eq('is_demo', false)
        .then(r => r.count ?? 0),

      // ── Section 3: Data quality ──
      sb.from('unit_costs')
        .select('id', { count: 'exact', head: true })
        .neq('source_type', 'public_seed')
        .then(r => r.count ?? 0),

      // ── Section 4: API performance ──
      sb.from('api_usage_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo)
        .then(r => r.count ?? 0),

      sb.from('api_usage_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo)
        .eq('status_code', 200)
        .then(r => r.count ?? 0),

      sb.from('api_usage_log')
        .select('response_ms')
        .gte('created_at', thirtyDaysAgo)
        .then(r => {
          const vals = (r.data || []).map((d: any) => d.response_ms).filter((v: any) => v != null);
          if (vals.length === 0) return 0;
          return Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length);
        }),

      sb.from('api_usage_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo)
        .eq('cache_hit', true)
        .then(r => r.count ?? 0),

      sb.from('api_usage_log')
        .select('csi_code_queried')
        .gte('created_at', thirtyDaysAgo)
        .not('csi_code_queried', 'is', null)
        .then(r => {
          const counts: Record<string, number> = {};
          for (const row of (r.data || [])) {
            const code = row.csi_code_queried;
            if (code) counts[code] = (counts[code] || 0) + 1;
          }
          return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([csi_code, calls]) => ({ csi_code, calls }));
        }),

      // ── Section 5: Parser stats ──
      sb.from('parser_audit_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo)
        .then(r => r.count ?? 0),

      sb.from('parser_audit_log')
        .select('auto_written')
        .gte('created_at', thirtyDaysAgo)
        .then(r => (r.data || []).reduce((sum: number, row: any) => sum + (row.auto_written || 0), 0)),

      sb.from('parser_audit_log')
        .select('total_lines_parsed')
        .gte('created_at', thirtyDaysAgo)
        .then(r => (r.data || []).reduce((sum: number, row: any) => sum + (row.total_lines_parsed || 0), 0)),

      sb.from('parser_audit_log')
        .select('high_confidence, mid_confidence, low_confidence, total_lines_parsed')
        .gte('created_at', thirtyDaysAgo)
        .then(r => {
          let weightedSum = 0;
          let totalLines = 0;
          for (const row of (r.data || [])) {
            weightedSum += (row.high_confidence || 0) * 0.9
              + (row.mid_confidence || 0) * 0.7
              + (row.low_confidence || 0) * 0.4;
            totalLines += row.total_lines_parsed || 0;
          }
          return totalLines > 0 ? weightedSum / totalLines : 0;
        }),

      // ── Section 6: Outreach ──
      sb.from('sub_outreach_log')
        .select('id', { count: 'exact', head: true })
        .then(r => r.count ?? 0),

      sb.from('sub_outreach_log')
        .select('id', { count: 'exact', head: true })
        .not('opened_at', 'is', null)
        .then(r => r.count ?? 0),

      sb.from('sub_outreach_log')
        .select('id', { count: 'exact', head: true })
        .not('submitted_at', 'is', null)
        .then(r => r.count ?? 0),

      sb.from('sub_outreach_log')
        .select('id', { count: 'exact', head: true })
        .eq('unsubscribed', true)
        .then(r => r.count ?? 0),
    ]);

    return res.status(200).json({
      revenue: {
        mrr: activeSubscriptions.totalMrr,
        paying_orgs: activeSubscriptions.count,
        arpu: activeSubscriptions.count > 0
          ? Math.round(activeSubscriptions.totalMrr / activeSubscriptions.count * 100) / 100
          : 0,
        mrr_trend: mrrTrend,
      },
      trial_funnel: {
        active_trials: activeTrials,
        expiring_soon: expiringSoon,
        converted: convertedOrgs,
        total_non_demo: totalNonDemoOrgs,
        conversion_rate: totalNonDemoOrgs > 0
          ? (convertedOrgs / totalNonDemoOrgs * 100).toFixed(1)
          : '0.0',
      },
      data_quality: {
        total_scope_items: 950,
        with_real_data: realDataCount,
        seed_displacement: (realDataCount / 950 * 100).toFixed(1),
      },
      api_performance: {
        total_calls: apiTotalCalls,
        success_rate: apiTotalCalls > 0
          ? (apiSuccessCalls / apiTotalCalls * 100).toFixed(1)
          : '100.0',
        avg_response_ms: apiAvgResponse,
        cache_hit_rate: apiTotalCalls > 0
          ? (apiCacheHits / apiTotalCalls * 100).toFixed(1)
          : '0.0',
        top_csi_codes: topCsiQueries,
      },
      parser: {
        total_proposals: parserTotalProposals,
        auto_write_rate: parserTotalLines > 0
          ? (parserAutoWritten / parserTotalLines * 100).toFixed(1)
          : '0.0',
        avg_confidence: parserConfidenceData.toFixed(2),
      },
      outreach: {
        emails_sent: outreachTotal,
        open_rate: outreachTotal > 0
          ? (outreachOpened / outreachTotal * 100).toFixed(1)
          : '0.0',
        conversion_rate: outreachTotal > 0
          ? (outreachConverted / outreachTotal * 100).toFixed(1)
          : '0.0',
        unsubscribed: outreachUnsubscribed,
      },
    });
  } catch (err: any) {
    console.error('[analytics-data]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
