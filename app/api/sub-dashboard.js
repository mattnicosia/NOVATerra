// Vercel Serverless Function — Sub Dashboard Data
// GET ?token=xxx → returns bid history for the email in the token

import { supabaseAdmin } from './lib/supabaseAdmin.js';
import { cors } from './lib/cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' });

  const { token } = req.query || {};
  if (!token) return res.status(400).json({ error: 'Missing token' });

  const secret = process.env.SUB_DASHBOARD_SECRET;
  if (!secret) return res.status(500).json({ error: 'Dashboard secret not configured' });

  try {
    // Verify token
    const parts = token.split('.');
    if (parts.length !== 2) return res.status(401).json({ error: 'Invalid token' });

    const [payloadB64, sigB64] = parts;

    // Verify HMAC
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payloadB64));

    if (!valid) return res.status(401).json({ error: 'Invalid token signature' });

    const payload = JSON.parse(atob(payloadB64));

    // Check expiry
    if (Date.now() > payload.exp) {
      return res.status(401).json({ error: 'Token expired' });
    }

    const email = payload.email;

    // Fetch all invitations for this email
    const { data: invitations, error: invErr } = await supabaseAdmin
      .from('bid_invitations')
      .select('*, bid_packages(id, name, due_date, status, scope_items)')
      .ilike('sub_email', email)
      .order('created_at', { ascending: false });

    if (invErr) throw invErr;

    // Build response
    const items = (invitations || []).map(inv => {
      const pkg = inv.bid_packages;
      return {
        id: inv.id,
        packageName: pkg?.name || 'Unknown Package',
        dueDate: pkg?.due_date,
        status: inv.status,
        sentAt: inv.sent_at,
        submittedAt: inv.submitted_at,
        awardedAt: inv.awarded_at,
        feedbackNotes: inv.feedback_notes,
        // Only expose portal token for active invitations (not after submission/award)
        portalToken: ['sent', 'opened', 'downloaded'].includes(inv.status) ? inv.token : undefined,
      };
    });

    // Compute stats
    const total = items.length;
    const submitted = items.filter(i => ['submitted', 'parsed', 'awarded', 'not_awarded'].includes(i.status)).length;
    const won = items.filter(i => i.status === 'awarded').length;
    const winRate = submitted > 0 ? Math.round((won / submitted) * 100) : 0;

    return res.status(200).json({
      email,
      invitations: items,
      stats: { total, submitted, won, winRate },
    });
  } catch (err) {
    console.error('[sub-dashboard] Error:', err);
    return res.status(500).json({ error: 'Failed to load dashboard' });
  }
}
