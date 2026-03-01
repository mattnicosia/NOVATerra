// Vercel Serverless Function — Confirm portal upload + trigger AI parsing
// POST { token, proposalId } — called after client uploads file to signed URL

import { supabaseAdmin } from './lib/supabaseAdmin.js';
import { cors } from './lib/cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' });

  const { token, proposalId } = req.body || {};

  if (!token || !proposalId) {
    return res.status(400).json({ error: 'Missing token or proposalId' });
  }

  try {
    // Verify token + proposal ownership
    const { data: inv, error: invErr } = await supabaseAdmin
      .from('bid_invitations')
      .select('id, package_id, user_id, sub_company, sub_contact, sub_email, sub_trade')
      .eq('token', token)
      .single();

    if (invErr || !inv) {
      return res.status(404).json({ error: 'Invalid token' });
    }

    const { data: proposal, error: propErr } = await supabaseAdmin
      .from('bid_proposals')
      .select('*')
      .eq('id', proposalId)
      .eq('invitation_id', inv.id)
      .single();

    if (propErr || !proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Update invitation status to submitted
    await supabaseAdmin
      .from('bid_invitations')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      })
      .eq('id', inv.id);

    // Upsert sub into sub_pool
    const { error: poolErr } = await supabaseAdmin
      .from('sub_pool')
      .upsert({
        email: inv.sub_email,
        company: inv.sub_company,
        contact: inv.sub_contact,
        trade: inv.sub_trade,
        last_activity: new Date().toISOString(),
      }, {
        onConflict: 'email,trade',
      });

    if (poolErr) {
      console.warn('[portal-confirm] Sub pool upsert failed:', poolErr.message);
    }

    // Increment proposal count for existing sub_pool entry
    await supabaseAdmin.rpc('increment_sub_pool_count', {
      p_email: inv.sub_email,
      p_trade: inv.sub_trade,
    }).catch(() => {
      // RPC may not exist yet — not critical
    });

    // Trigger AI parsing asynchronously via the parse-proposal endpoint
    const appUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    // Fire-and-forget — don't block the sub's confirmation
    fetch(`${appUrl}/api/parse-proposal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposalId: proposal.id }),
    }).catch(err => {
      console.warn('[portal-confirm] Parse trigger failed:', err.message);
    });

    console.log(`[portal-confirm] Proposal ${proposalId} confirmed, parsing triggered`);
    return res.status(200).json({ status: 'ok', proposalId });
  } catch (err) {
    console.error('[portal-confirm] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
