// Vercel Serverless Function — Send bid invite email via Resend
// Sends HTML email with project info, scope, due date, and portal link CTA

import { Resend } from 'resend';
import { supabaseAdmin, verifyUser } from './lib/supabaseAdmin.js';
import { cors } from './lib/cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { invitationId, packageId } = req.body || {};
  if (!invitationId || !packageId) {
    return res.status(400).json({ error: 'Missing invitationId or packageId' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';

  if (!apiKey) {
    return res.status(500).json({ error: 'Email service not configured' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    // Fetch invitation + package data
    const { data: inv, error: invErr } = await supabaseAdmin
      .from('bid_invitations')
      .select('*, bid_packages(*)')
      .eq('id', invitationId)
      .eq('user_id', user.id)
      .single();

    if (invErr || !inv) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    const pkg = inv.bid_packages;
    const portalUrl = `${appUrl}/portal/${inv.token}`;
    const dueStr = pkg.due_date
      ? new Date(pkg.due_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : 'No due date specified';

    // Get GC company name from user metadata or fallback
    const gcCompany = user.user_metadata?.company || user.email;

    // Build scope list HTML
    const scopeItems = Array.isArray(pkg.scope_items) ? pkg.scope_items : [];
    const scopeHtml = scopeItems.length > 0
      ? `<ul style="margin:0;padding-left:20px;color:#CCCCCC;">${scopeItems.map(s =>
          `<li style="margin-bottom:4px;">${escapeHtml(typeof s === 'string' ? s : s.description || s.name || '')}</li>`
        ).join('')}</ul>`
      : '<p style="color:#999;">See attached scope details</p>';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0D0F14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <div style="background:linear-gradient(135deg,rgba(124,92,252,0.15),rgba(191,90,242,0.08));border:1px solid rgba(124,92,252,0.25);border-radius:16px;padding:32px;margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
        <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#7C5CFC,#BF5AF2);display:flex;align-items:center;justify-content:center;">
          <span style="color:white;font-weight:bold;font-size:16px;">N</span>
        </div>
        <div>
          <div style="color:#FFFFFF;font-weight:600;font-size:16px;">NOVA Estimating</div>
          <div style="color:#8E8E93;font-size:12px;">Bid Invitation</div>
        </div>
      </div>

      <h1 style="color:#FFFFFF;font-size:22px;font-weight:600;margin:0 0 8px;">You're invited to bid</h1>
      <p style="color:#CCCCCC;font-size:15px;margin:0 0 24px;">${escapeHtml(gcCompany)} has invited you to submit a proposal for:</p>

      <div style="background:rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin-bottom:20px;">
        <div style="color:#7C5CFC;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Project</div>
        <div style="color:#FFFFFF;font-size:18px;font-weight:600;margin-bottom:16px;">${escapeHtml(pkg.name)}</div>

        <div style="color:#7C5CFC;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Due Date</div>
        <div style="color:#FFFFFF;font-size:15px;margin-bottom:16px;">${dueStr}</div>

        <div style="color:#7C5CFC;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Scope</div>
        ${scopeHtml}
      </div>

      ${pkg.cover_message ? `<div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:16px;margin-bottom:20px;border-left:3px solid #7C5CFC;"><p style="color:#CCCCCC;font-size:14px;margin:0;line-height:1.6;">${escapeHtml(pkg.cover_message)}</p></div>` : ''}

      <a href="${portalUrl}" style="display:inline-block;background:linear-gradient(135deg,#7C5CFC,#BF5AF2);color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;text-align:center;width:100%;box-sizing:border-box;">
        View Details & Submit Proposal
      </a>

      <p style="color:#666;font-size:12px;margin:16px 0 0;text-align:center;">No account required — click the button above to view drawings and upload your proposal.</p>
    </div>
  </div>
</body>
</html>`;

    const resend = new Resend(apiKey);
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: `NOVA Bids <${fromEmail}>`,
      to: [inv.sub_email],
      subject: `Bid Invitation: ${pkg.name}`,
      html,
    });

    if (emailError) {
      console.error('[send-bid-invite] Resend error:', emailError);
      return res.status(502).json({ error: emailError.message || 'Failed to send email' });
    }

    // Update invitation status
    await supabaseAdmin
      .from('bid_invitations')
      .update({
        status: 'sent',
        resend_email_id: emailData.id,
        sent_at: new Date().toISOString(),
      })
      .eq('id', invitationId);

    console.log(`[send-bid-invite] OK emailId=${emailData.id} to=${inv.sub_email}`);
    return res.status(200).json({ status: 'ok', emailId: emailData.id });
  } catch (err) {
    console.error('[send-bid-invite] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
