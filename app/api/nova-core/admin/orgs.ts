// ============================================================
// NOVA Core — Admin Orgs API
// GET  /api/nova-core/admin/orgs  — list all orgs with counts
// POST /api/nova-core/admin/orgs  — create new org
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
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
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

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    if (req.method === 'GET') {
      // Fetch all orgs
      const { data: orgs, error: orgErr } = await sb
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (orgErr) throw orgErr;

      // Get api_key counts per org (active only)
      const orgIds = (orgs || []).map((o: { id: string }) => o.id);
      let keyCounts: Record<string, number> = {};
      let proposalCounts: Record<string, number> = {};

      if (orgIds.length > 0) {
        const { data: keys } = await sb
          .from('api_keys')
          .select('org_id')
          .in('org_id', orgIds)
          .eq('is_active', true);

        for (const k of (keys || [])) {
          keyCounts[k.org_id] = (keyCounts[k.org_id] || 0) + 1;
        }

        // Proposal counts from parser_audit_log
        const { data: proposals } = await sb
          .from('parser_audit_log')
          .select('org_id')
          .in('org_id', orgIds);

        for (const p of (proposals || [])) {
          if (p.org_id) {
            proposalCounts[p.org_id] = (proposalCounts[p.org_id] || 0) + 1;
          }
        }
      }

      const enriched = (orgs || []).map((o: { id: string }) => ({
        ...o,
        api_key_count: keyCounts[o.id] || 0,
        proposal_count: proposalCounts[o.id] || 0,
      }));

      return res.status(200).json({ orgs: enriched });
    }

    // POST — create new org
    let body: Record<string, unknown>;
    try {
      body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const name = (body.name as string || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const plan = body.plan as string || 'free';
    if (!['free', 'professional', 'enterprise'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const contactEmail = (body.contact_email as string || '').trim() || null;

    const { data: newOrg, error: insertErr } = await sb
      .from('organizations')
      .insert({
        name,
        plan,
        contact_email: contactEmail,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return res.status(201).json(newOrg);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[nova-core/admin/orgs]', message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
