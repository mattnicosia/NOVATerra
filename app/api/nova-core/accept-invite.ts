// ============================================================
// NOVA Core — Accept Invite (public endpoint)
// GET /api/nova-core/accept-invite?token=xxx
// No auth required — token-based
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.query.token as string;
  if (!token) {
    return res.status(400).json({ error: 'Missing token parameter' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing NOVA Core credentials' });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    // Look up invite
    const { data: member, error: findErr } = await sb
      .from('org_members')
      .select('*')
      .eq('invite_token', token)
      .single();

    if (findErr || !member) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Already accepted?
    if (member.accepted_at) {
      return res.status(409).json({ error: 'Already accepted' });
    }

    // Check expiry (48 hours)
    const invitedAt = new Date(member.invited_at).getTime();
    const now = Date.now();
    const fortyEightHours = 48 * 60 * 60 * 1000;
    if (now - invitedAt > fortyEightHours) {
      return res.status(410).json({ error: 'Invitation expired' });
    }

    // Check if user exists in Supabase auth
    const { data: authData, error: authErr } = await sb.auth.admin.listUsers();
    const existingUser = authErr ? null : (authData?.users || []).find(
      (u: { email?: string }) => u.email?.toLowerCase() === member.email.toLowerCase()
    );

    const vercelUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_SITE_URL || 'https://app-nova-42373ca7.vercel.app';

    if (!existingUser) {
      // User needs to sign up first — redirect to signup with invite context
      const signupUrl = `${vercelUrl}/signup?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(member.email)}`;
      return res.redirect(302, signupUrl);
    }

    // User exists — activate membership
    const { error: updateErr } = await sb
      .from('org_members')
      .update({
        accepted_at: new Date().toISOString(),
        active: true,
        user_id: existingUser.id,
      })
      .eq('id', member.id);

    if (updateErr) throw updateErr;

    // Redirect to admin dashboard
    return res.redirect(302, `${vercelUrl}/admin`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[nova-core/accept-invite]', message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
