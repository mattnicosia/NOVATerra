// ============================================================
// NOVA Core — Admin Pipeline Endpoint
// GET /api/admin/nova-pipeline
//
// Returns pipeline_log rows: per-step metrics for today
// (records processed, flagged, passed).
// Uses NOVA_CORE_SERVICE_ROLE_KEY (server-side only).
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// The 12 pipeline steps
const PIPELINE_STEPS = [
  { step: '1', label: 'Ingest Raw Data' },
  { step: '2', label: 'Parse & Normalize' },
  { step: '3', label: 'Unit Resolution' },
  { step: '4', label: 'CSI Mapping' },
  { step: '5', label: 'Geo Tagging' },
  { step: '6', label: 'Seasonal Adjustment' },
  { step: '7', label: 'Outlier Detection' },
  { step: '8', label: 'Duplicate Check' },
  { step: '9', label: 'Weight Calculation' },
  { step: '10', label: 'Benchmark Rollup' },
  { step: '11', label: 'PDC Computation' },
  { step: '12', label: 'View Refresh' },
];

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
    // Today's date at midnight UTC
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    // Fetch today's pipeline_log entries
    const { data: logs, error: logErr } = await supabase
      .from('pipeline_log')
      .select('*')
      .gte('run_at', todayISO)
      .order('run_at', { ascending: false });

    // Aggregate per step (sum today's runs)
    const stepMap = {};
    if (!logErr && logs) {
      for (const row of logs) {
        if (!stepMap[row.step]) {
          stepMap[row.step] = { records_in: 0, records_flagged: 0, records_passed: 0, runs: 0, last_run: row.run_at };
        }
        stepMap[row.step].records_in += row.records_in;
        stepMap[row.step].records_flagged += row.records_flagged;
        stepMap[row.step].records_passed += row.records_passed;
        stepMap[row.step].runs += 1;
      }
    }

    // Build response with all 12 steps
    const steps = PIPELINE_STEPS.map(({ step, label }) => {
      const data = stepMap[step] || null;
      return {
        step,
        label,
        records_in: data ? data.records_in : 0,
        records_flagged: data ? data.records_flagged : 0,
        records_passed: data ? data.records_passed : 0,
        runs_today: data ? data.runs : 0,
        last_run: data ? data.last_run : null,
      };
    });

    // Also fetch last 7 days summary
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data: weekLogs, error: wkErr } = await supabase
      .from('pipeline_log')
      .select('step, records_in, records_flagged, records_passed, run_at')
      .gte('run_at', weekAgo.toISOString())
      .order('run_at', { ascending: false });

    const weekSummary = {};
    if (!wkErr && weekLogs) {
      for (const row of weekLogs) {
        if (!weekSummary[row.step]) {
          weekSummary[row.step] = { records_in: 0, records_flagged: 0, records_passed: 0 };
        }
        weekSummary[row.step].records_in += row.records_in;
        weekSummary[row.step].records_flagged += row.records_flagged;
        weekSummary[row.step].records_passed += row.records_passed;
      }
    }

    return res.status(200).json({
      steps,
      week_summary: weekSummary,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Admin nova-pipeline endpoint error:', err);
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
