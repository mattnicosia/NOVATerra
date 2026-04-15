// ============================================================
// NOVA Core — Signup API
// POST /api/nova-core/auth/signup
//
// Public endpoint — NO auth required.
// Creates org + user + API key, sends welcome email.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const POSTMARK_TOKEN = process.env.POSTMARK_SERVER_TOKEN || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { org_name, email, password } = req.body || {};

  // ── Validate inputs ──
  if (!org_name || typeof org_name !== 'string' || !org_name.trim()) {
    return res.status(400).json({ error: 'Organization name is required' });
  }
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const trimmedOrg = org_name.trim();
  const trimmedEmail = email.trim().toLowerCase();

  try {
    // ── (1) Check org name uniqueness ──
    const { count: orgCount } = await sb
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .ilike('name', trimmedOrg);

    if (orgCount && orgCount > 0) {
      return res.status(409).json({ error: 'An organization with that name already exists' });
    }

    // ── (2) Create auth user ──
    const { data: authData, error: authError } = await sb.auth.admin.createUser({
      email: trimmedEmail,
      password,
      email_confirm: false,
    });

    if (authError) {
      if (authError.message?.includes('already') || authError.message?.includes('duplicate')) {
        return res.status(409).json({ error: 'An account with that email already exists' });
      }
      console.error('[signup] auth error:', authError.message);
      return res.status(500).json({ error: 'Failed to create account' });
    }

    const userId = authData.user.id;

    // ── (3) Create organization ──
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 21);

    const { data: orgData, error: orgError } = await sb
      .from('organizations')
      .insert({
        name: trimmedOrg,
        owner_id: userId,
        trial_ends_at: trialEnds.toISOString(),
        is_paying: false,
        is_demo: false,
        is_active: true,
        onboarded_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (orgError) {
      console.error('[signup] org insert error:', orgError.message);
      // Clean up: delete the auth user we just created
      await sb.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: 'Failed to create organization' });
    }

    const orgId = orgData.id;

    // ── (4) Create user_data record linking user to org ──
    await sb.from('user_data').insert({
      user_id: userId,
      key: 'org_membership',
      org_id: orgId,
      data: { role: 'owner', joined_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    });

    // ── (5) Generate API key ──
    const rawKey = 'nova_sk_' + crypto.randomBytes(24).toString('base64url');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 14);

    await sb.from('api_keys').insert({
      org_id: orgId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      plan: 'free',
      rate_limit_rpm: 300,
      rate_limit_rpd: 10000,
    });

    // ── (6) Send welcome email via Postmark ──
    if (POSTMARK_TOKEN) {
      const trialEndStr = trialEnds.toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      });

      try {
        await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': POSTMARK_TOKEN,
          },
          body: JSON.stringify({
            From: 'bids@novaterra.ai',
            To: trimmedEmail,
            Subject: 'Welcome to NOVA Core — your 21-day trial has started',
            TextBody: [
              `Welcome to NOVA Core!`,
              ``,
              `Your account is ready. Here are your details:`,
              ``,
              `Organization: ${trimmedOrg}`,
              `Your first API key: ${rawKey}`,
              `Trial ends: ${trialEndStr}`,
              ``,
              `Visit https://app-nova-42373ca7.vercel.app to get started.`,
              ``,
              `— The NOVATerra Team`,
            ].join('\n'),
          }),
        });
      } catch (emailErr) {
        // Non-fatal — account is still created
        console.error('[signup] email send error:', emailErr instanceof Error ? emailErr.message : emailErr);
      }
    }

    // ── (7) Return success (no raw key in response — sent via email) ──
    return res.status(200).json({
      success: true,
      orgId,
      email: trimmedEmail,
    });
  } catch (err) {
    console.error('[signup]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
