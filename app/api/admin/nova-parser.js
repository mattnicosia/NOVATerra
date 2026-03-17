// ============================================================
// NOVA Core — Admin Parser Intelligence API
// GET /api/admin/nova-parser
//
// Returns parser stats: volume, confidence distribution,
// top sub companies, recent errors.
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
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // ── 1. Parse volume — last 30 days ──
    const { data: recentJobs, error: jobErr } = await sb
      .from('parser_audit_log')
      .select('id, total_lines_parsed, high_confidence, mid_confidence, low_confidence, auto_written, total_bid_amount, error_message, created_at')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(500);

    if (jobErr) throw jobErr;

    const jobs = recentJobs || [];
    const totalJobs = jobs.length;
    const totalLines = jobs.reduce((s, j) => s + (j.total_lines_parsed || 0), 0);
    const totalAutoWritten = jobs.reduce((s, j) => s + (j.auto_written || 0), 0);
    const reviewRate = totalLines > 0
      ? Math.round(((totalLines - totalAutoWritten) / totalLines) * 1000) / 10
      : 0;
    const avgConfidence = totalLines > 0
      ? jobs.reduce((s, j) => {
          const high = j.high_confidence || 0;
          const mid = j.mid_confidence || 0;
          const low = j.low_confidence || 0;
          // Approximate average: high=0.90, mid=0.70, low=0.40
          return s + high * 0.90 + mid * 0.70 + low * 0.40;
        }, 0) / totalLines
      : 0;

    // ── 2. Confidence distribution — from bid_leveling_queue ──
    const { data: confRows, error: confErr } = await sb
      .from('bid_leveling_queue')
      .select('csi_confidence')
      .gte('created_at', thirtyDaysAgo)
      .limit(500);

    if (confErr) throw confErr;

    const buckets = {
      '0.90-1.00': 0,
      '0.80-0.89': 0,
      '0.70-0.79': 0,
      '0.60-0.69': 0,
      '0.50-0.59': 0,
      'below 0.50': 0,
    };

    for (const row of (confRows || [])) {
      const c = row.csi_confidence || 0;
      if (c >= 0.90) buckets['0.90-1.00']++;
      else if (c >= 0.80) buckets['0.80-0.89']++;
      else if (c >= 0.70) buckets['0.70-0.79']++;
      else if (c >= 0.60) buckets['0.60-0.69']++;
      else if (c >= 0.50) buckets['0.50-0.59']++;
      else buckets['below 0.50']++;
    }

    // ── 3. Top 10 sub companies by parse volume ──
    const companyMap = {};
    for (const j of jobs) {
      const name = j.sub_company_name || j.source_email || 'Unknown';
      if (!companyMap[name]) {
        companyMap[name] = { company: name, job_count: 0, total_lines: 0, total_bid: 0, confidence_sum: 0 };
      }
      companyMap[name].job_count++;
      companyMap[name].total_lines += j.total_lines_parsed || 0;
      companyMap[name].total_bid += Number(j.total_bid_amount || 0);
      const high = j.high_confidence || 0;
      const mid = j.mid_confidence || 0;
      const low = j.low_confidence || 0;
      companyMap[name].confidence_sum += high * 0.90 + mid * 0.70 + low * 0.40;
    }

    const topCompanies = Object.values(companyMap)
      .map(c => ({
        ...c,
        avg_confidence: c.total_lines > 0
          ? Math.round((c.confidence_sum / c.total_lines) * 100) / 100
          : 0,
      }))
      .sort((a, b) => b.job_count - a.job_count)
      .slice(0, 10);

    // ── 4. Recent errors — last 10 ──
    const { data: errorRows, error: errErr } = await sb
      .from('parser_audit_log')
      .select('source_email, error_message, created_at')
      .not('error_message', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (errErr) throw errErr;

    return res.status(200).json({
      volume: {
        total_jobs: totalJobs,
        total_lines: totalLines,
        auto_written: totalAutoWritten,
        review_rate_pct: reviewRate,
        avg_confidence: Math.round(avgConfidence * 100) / 100,
      },
      confidence_distribution: buckets,
      top_companies: topCompanies,
      recent_errors: errorRows || [],
    });
  } catch (err) {
    console.error('[nova-parser]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
