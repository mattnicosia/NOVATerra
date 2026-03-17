// ============================================================
// NOVA Core — Admin Bid Leveling API
// GET /api/admin/nova-bid-leveling
//
// Returns parse jobs (from parser_audit_log) with their queued
// line counts and status badges. Supports ?job_id= to fetch
// individual job's bid_leveling_queue rows.
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
  const { job_id } = req.query;

  try {
    if (job_id) {
      // ── Detail view: fetch all queue rows for a specific parse job ──
      const [rowResult, jobResult] = await Promise.all([
        sb.from('bid_leveling_queue').select('*').eq('parse_job_id', job_id).order('created_at', { ascending: true }).limit(500),
        sb.from('parser_audit_log').select('id, sub_company_name, total_bid_amount, auto_written, created_at').eq('id', job_id).single(),
      ]);

      if (rowResult.error) throw rowResult.error;

      // Group by review_status
      const grouped = { pending: [], approved: [], rejected: [], modified: [] };
      for (const row of (rowResult.data || [])) {
        const status = row.review_status || 'pending';
        if (grouped[status]) grouped[status].push(row);
      }

      return res.status(200).json({
        job_id,
        rows: rowResult.data || [],
        grouped,
        job: jobResult.data || {},
      });
    }

    // ── List view: all parse jobs, sorted by created_at DESC ──
    const { data: jobs, error: jobErr } = await sb
      .from('parser_audit_log')
      .select('id, source_email, sub_company_name, total_lines_parsed, high_confidence, mid_confidence, low_confidence, auto_written, total_bid_amount, is_lump_sum, error_message, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (jobErr) throw jobErr;

    // For each job, count pending lines
    const jobIds = (jobs || []).map(j => j.id);
    let pendingCounts = {};

    if (jobIds.length > 0) {
      const { data: pendingRows, error: pendErr } = await sb
        .from('bid_leveling_queue')
        .select('parse_job_id, review_status')
        .in('parse_job_id', jobIds)
        .eq('review_status', 'pending')
        .limit(500);

      if (!pendErr && pendingRows) {
        for (const r of pendingRows) {
          pendingCounts[r.parse_job_id] = (pendingCounts[r.parse_job_id] || 0) + 1;
        }
      }
    }

    const enrichedJobs = (jobs || []).map(j => ({
      ...j,
      pending_count: pendingCounts[j.id] || 0,
      review_needed: (pendingCounts[j.id] || 0) > 0,
      status_badge: j.error_message
        ? 'Error'
        : (pendingCounts[j.id] || 0) > 0
          ? 'Action needed'
          : 'Complete',
    }));

    return res.status(200).json({ jobs: enrichedJobs });
  } catch (err) {
    console.error('[nova-bid-leveling]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
