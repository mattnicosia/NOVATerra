// ============================================================
// NOVA Core — Org Members API
// GET /api/nova-core/admin/org-members?org_id=xxx
// Auth: nova_admin_token cookie
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
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '');
    res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'DELETE') {
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

  const orgId = req.query.org_id as string;
  if (!orgId) {
    return res.status(400).json({ error: 'org_id is required' });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    if (req.method === 'DELETE') {
      const memberId = req.query.member_id as string;
      if (!memberId) {
        return res.status(400).json({ error: 'member_id is required' });
      }

      const { error: updateErr } = await sb
        .from('org_members')
        .update({ active: false })
        .eq('id', memberId)
        .eq('org_id', orgId);

      if (updateErr) throw updateErr;

      return res.status(200).json({ success: true });
    }

    const { data: members, error: membersErr } = await sb
      .from('org_members')
      .select('id, email, role, active, invited_at, accepted_at, display_name')
      .eq('org_id', orgId)
      .order('invited_at', { ascending: false });

    if (membersErr) throw membersErr;

    return res.status(200).json({ members: members || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[nova-core/admin/org-members]', message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
