// ============================================================
// NOVA Core — Admin Action Log Endpoint
// GET /api/admin/nova-log
//
// Returns append-only admin_action_log entries.
// Only resolve and escalate actions from Queue write here.
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
    const { data: entries, error } = await supabase
      .from('admin_action_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      entries: entries || [],
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Admin nova-log endpoint error:', err);
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
