// ============================================================
// NOVA Core — Invite Member API
// POST /api/nova-core/admin/invite-member
// Auth: nova_admin_token cookie
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const POSTMARK_TOKEN = process.env.POSTMARK_SERVER_TOKEN || '';

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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
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
    let body: Record<string, unknown>;
    try {
      body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const email = (body.email as string || '').trim().toLowerCase();
    const role = body.role as string || '';
    const orgId = body.org_id as string || '';

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate role
    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or member' });
    }

    if (!orgId) {
      return res.status(400).json({ error: 'org_id is required' });
    }

    // Get org
    const { data: org, error: orgErr } = await sb
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (orgErr || !org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Check seat limit for paying orgs
    if (org.is_paying) {
      const { count, error: countErr } = await sb
        .from('org_members')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('active', true);

      if (countErr) throw countErr;

      if ((count || 0) >= (org.seat_count || 0)) {
        return res.status(402).json({
          error: 'Seat limit reached',
          message: 'Add more seats via billing to invite more members',
        });
      }
    }

    // Check not already a member
    const { count: existingCount, error: existErr } = await sb
      .from('org_members')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('email', email);

    if (existErr) throw existErr;

    if ((existingCount || 0) > 0) {
      return res.status(409).json({ error: 'This email is already a member of this organization' });
    }

    // Generate invite token
    const inviteToken = crypto.randomBytes(16).toString('hex');

    // Insert member record
    const { error: insertErr } = await sb
      .from('org_members')
      .insert({
        org_id: orgId,
        email,
        role,
        invite_token: inviteToken,
        invited_at: new Date().toISOString(),
        active: false,
      });

    if (insertErr) throw insertErr;

    // Send invite email via Postmark
    const vercelUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_SITE_URL || 'https://app-nova-42373ca7.vercel.app';

    if (POSTMARK_TOKEN) {
      try {
        await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': POSTMARK_TOKEN,
          },
          body: JSON.stringify({
            From: 'noreply@novaterra.build',
            To: email,
            Subject: `You've been invited to join ${org.name} on NOVA Core`,
            TextBody: `You've been invited to join ${org.name} on NOVA Core.\n\nAccept your invitation here:\n${vercelUrl}/accept-invite?token=${inviteToken}\n\nThis link expires in 48 hours.`,
          }),
        });
      } catch (emailErr) {
        console.error('[invite-member] Postmark send failed:', emailErr);
        // Don't fail the invite if email fails — the invite record is created
      }
    } else {
      console.warn('[invite-member] No POSTMARK_SERVER_TOKEN — skipping email send');
    }

    return res.status(200).json({ success: true, email });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[nova-core/admin/invite-member]', message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
