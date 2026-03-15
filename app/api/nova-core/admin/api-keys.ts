// ============================================================
// NOVA Core — Admin API Keys API
// POST   /api/nova-core/admin/api-keys  — generate new key
// DELETE /api/nova-core/admin/api-keys?id=uuid  — revoke key
// Auth: nova_admin_token cookie
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const RATE_LIMITS: Record<string, { rpm: number; rpd: number }> = {
  free: { rpm: 60, rpd: 1000 },
  professional: { rpm: 300, rpd: 10000 },
  enterprise: { rpm: 1000, rpd: 100000 },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
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
    if (req.method === 'DELETE') {
      const keyId = req.query.id as string;
      if (!keyId || !UUID_RE.test(keyId)) {
        return res.status(400).json({ error: 'Missing or invalid key id' });
      }

      const { error: revokeErr } = await sb
        .from('api_keys')
        .update({ is_active: false, revoked_at: new Date().toISOString() })
        .eq('id', keyId);

      if (revokeErr) throw revokeErr;

      return res.status(200).json({ success: true });
    }

    // POST — generate new key
    let body: Record<string, unknown>;
    try {
      body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const orgId = body.org_id as string;
    if (!orgId || !UUID_RE.test(orgId)) {
      return res.status(400).json({ error: 'Missing or invalid org_id' });
    }

    // Verify org exists and get plan
    const { data: org, error: orgErr } = await sb
      .from('organizations')
      .select('id, plan')
      .eq('id', orgId)
      .single();

    if (orgErr || !org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Generate key
    const rawKey = 'nova_sk_' + crypto.randomBytes(24).toString('base64url');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 14);

    const limits = RATE_LIMITS[org.plan] || RATE_LIMITS.free;

    const { data: newKey, error: insertErr } = await sb
      .from('api_keys')
      .insert({
        org_id: orgId,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        rate_limit_rpm: limits.rpm,
        rate_limit_rpd: limits.rpd,
        is_active: true,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    // Return with raw key (shown ONCE only)
    return res.status(201).json({ ...newKey, raw_key: rawKey });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[nova-core/admin/api-keys]', message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
