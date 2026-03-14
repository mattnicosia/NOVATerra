// ============================================================
// NOVA Core — Admin Health Endpoint
// GET /api/admin/health
//
// Returns row counts for all 8 backbone tables.
// Uses NOVA_CORE_SERVICE_ROLE_KEY (server-side only).
// Client receives plain JSON — never the key.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const BACKBONE_TABLES = [
  'csi_codes',
  'trades',
  'units_of_measure',
  'building_types',
  'project_types',
  'delivery_methods',
  'cost_categories',
  'seasonal_adjustments',
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify admin cookie
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
    const tables = [];

    for (const table of BACKBONE_TABLES) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      const rowCount = error ? -1 : (count ?? 0);
      let status = 'healthy';
      if (rowCount === 0) status = 'warning';
      if (rowCount < 0) status = 'error';

      tables.push({
        name: table,
        row_count: rowCount,
        status,
      });
    }

    return res.status(200).json({
      tables,
      timestamp: new Date().toISOString(),
      nightly_recompute: 'placeholder — not yet implemented',
    });
  } catch (err) {
    console.error('Admin health endpoint error:', err);
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
