// ============================================================
// NOVA Core — Admin Org Detail API
// PATCH /api/nova-core/admin/orgs/[id]  — update org plan
// Auth: nova_admin_token cookie
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const RATE_LIMITS: Record<string, { rpm: number; rpd: number }> = {
  free: { rpm: 60, rpd: 1000 },
  professional: { rpm: 300, rpd: 10000 },
  enterprise: { rpm: 1000, rpd: 100000 },
};

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach(part => {
    const [key, ...rest] = part.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  });
  return cookies;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '');
    res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return res.status(200).end();
  }

  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cookie = parseCookies((req.headers.cookie as string) || '');
  const ADMIN_SECRET = process.env.NOVA_ADMIN_SECRET;
  if (!ADMIN_SECRET || cookie.nova_admin_token !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing NOVA Core credentials' });
  }

  const orgId = req.query.id as string;
  if (!orgId) {
    return res.status(400).json({ error: 'Missing org id' });
  }

  let body: Record<string, unknown>;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const plan = body.plan as string;
  if (!plan || !['free', 'professional', 'enterprise'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan' });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    // Update org plan
    const { data: updatedOrg, error: updateErr } = await sb
      .from('organizations')
      .update({ plan })
      .eq('id', orgId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Update rate limits on all active api_keys for this org
    const limits = RATE_LIMITS[plan];
    const { error: keyErr } = await sb
      .from('api_keys')
      .update({
        rate_limit_rpm: limits.rpm,
        rate_limit_rpd: limits.rpd,
      })
      .eq('org_id', orgId)
      .eq('is_active', true);

    if (keyErr) {
      console.error('[nova-core/admin/orgs/[id]] key update error:', keyErr.message);
    }

    return res.status(200).json(updatedOrg);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[nova-core/admin/orgs/[id]]', message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
