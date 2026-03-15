// ============================================================
// NOVA Core — Admin Health Endpoint (Full)
// GET /api/admin/nova-health
//
// Returns row counts for ALL 28 NOVA Core tables + nightly
// recompute log (last run, duration, records, errors).
// Uses NOVA_CORE_SERVICE_ROLE_KEY (server-side only).
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// All 28 NOVA Core tables grouped by category
const TABLE_GROUPS = {
  'Group 1 — Backbone': [
    'csi_codes', 'trades', 'units_of_measure', 'building_types',
    'project_types', 'delivery_methods', 'cost_categories', 'seasonal_adjustments',
  ],
  'Group 2 — Cost Intelligence': [
    'labor_rates', 'material_costs', 'equipment_costs',
    'unit_costs', 'assemblies', 'sf_benchmarks',
  ],
  'Group 3 — Market Data': [
    'projects', 'proposals', 'proposal_line_items', 'pdc_lines',
    'awarded_contracts', 'completed_estimates', 'estimate_line_items', 'change_orders',
  ],
  'Group 4 — Intelligence': [
    'location_factors', 'pdc_benchmarks', 'contribution_tracking', 'environmental_scores',
  ],
  'Views & Indexes': [
    'market_tension_index',
  ],
  'Admin': [
    'recompute_log', 'pipeline_log', 'admin_action_log',
  ],
};

// Expected minimum row counts for health status
const EXPECTED_ROWS = {
  csi_codes: 50, trades: 10, units_of_measure: 5, building_types: 5,
  project_types: 3, delivery_methods: 3, cost_categories: 3, seasonal_adjustments: 0,
};

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
    // Fetch row counts for all tables in parallel
    const groups = [];

    for (const [groupName, tables] of Object.entries(TABLE_GROUPS)) {
      const tableResults = await Promise.all(
        tables.map(async (table) => {
          const { count, error } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });

          const rowCount = error ? -1 : (count ?? 0);
          const expected = EXPECTED_ROWS[table];

          let status = 'healthy';
          if (rowCount < 0) status = 'error';
          else if (expected !== undefined && rowCount === 0 && expected > 0) status = 'warning';
          else if (rowCount === 0) status = 'empty';

          return {
            name: table,
            row_count: rowCount,
            status,
            error: error ? error.message : null,
          };
        })
      );

      groups.push({ group: groupName, tables: tableResults });
    }

    // Fetch nightly recompute log — last run
    const { data: lastRecompute, error: rcErr } = await supabase
      .from('recompute_log')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nightlyRecompute = lastRecompute
      ? {
          last_run: lastRecompute.timestamp,
          duration_ms: lastRecompute.duration_ms,
          records_processed: lastRecompute.records_processed,
          errors: lastRecompute.errors,
          step_results: lastRecompute.step_results,
          status: lastRecompute.errors ? 'error' : 'healthy',
        }
      : {
          last_run: null,
          duration_ms: 0,
          records_processed: 0,
          errors: null,
          step_results: null,
          status: 'never_run',
        };

    if (rcErr) {
      nightlyRecompute.status = 'unavailable';
      nightlyRecompute.error = rcErr.message;
    }

    return res.status(200).json({
      groups,
      nightly_recompute: nightlyRecompute,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Admin nova-health endpoint error:', err);
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
