// Vercel Serverless Function — Send team/estimator invite email via Resend
// Sends branded HTML email with org info and signup link with invite token

import { Resend } from "resend";
import { supabaseAdmin, verifyUser } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { invitationId } = req.body || {};
  if (!invitationId) {
    return res.status(400).json({ error: "Missing invitationId" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

  if (!apiKey) {
    return res.status(500).json({ error: "Email service not configured" });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Database not configured" });
  }

  try {
    // Fetch invitation + verify the inviter belongs to the org
    const { data: inv, error: invErr } = await supabaseAdmin
      .from("org_invitations")
      .select("*, organizations(name)")
      .eq("id", invitationId)
      .single();

    if (invErr || !inv) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    // Verify the requesting user is the one who invited (or is in the same org)
    const { data: membership } = await supabaseAdmin
      .from("org_members")
      .select("role")
      .eq("org_id", inv.org_id)
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (!membership || !["owner", "manager"].includes(membership.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const orgName = inv.organizations?.name || "your team";
    const inviterName = user.user_metadata?.full_name || user.email?.split("@")[0] || "A team member";
    const signupUrl = `${appUrl}?invite=${inv.token}`;

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
          <div style="color:#FFFFFF;font-weight:600;font-size:16px;">NOVATerra</div>
          <div style="color:#8E8E93;font-size:12px;">Team Invitation</div>
        </div>
      </div>

      <h1 style="color:#FFFFFF;font-size:22px;font-weight:600;margin:0 0 8px;">You're invited to join ${escapeHtml(orgName)}</h1>
      <p style="color:#CCCCCC;font-size:15px;margin:0 0 24px;">${escapeHtml(inviterName)} has invited you to join their estimating team on NOVATerra.</p>

      <div style="background:rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin-bottom:20px;">
        <div style="color:#7C5CFC;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Organization</div>
        <div style="color:#FFFFFF;font-size:18px;font-weight:600;margin-bottom:16px;">${escapeHtml(orgName)}</div>

        <div style="color:#7C5CFC;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Role</div>
        <div style="color:#FFFFFF;font-size:15px;margin-bottom:16px;">${escapeHtml(inv.role.charAt(0).toUpperCase() + inv.role.slice(1))}</div>

        <div style="color:#7C5CFC;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Invited By</div>
        <div style="color:#FFFFFF;font-size:15px;">${escapeHtml(inviterName)}</div>
      </div>

      <a href="${signupUrl}" style="display:inline-block;background:linear-gradient(135deg,#7C5CFC,#BF5AF2);color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;text-align:center;width:100%;box-sizing:border-box;">
        Join Team
      </a>

      <p style="color:#666;font-size:12px;margin:16px 0 0;text-align:center;">Click the button above to create your account and join the team. This invitation expires in 7 days.</p>
    </div>
  </div>
</body>
</html>`;

    const resend = new Resend(apiKey);
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: `NOVATerra <${fromEmail}>`,
      to: [inv.email],
      subject: `You're invited to join ${orgName} on NOVATerra`,
      html,
    });

    if (emailError) {
      console.error("[send-team-invite] Resend error:", emailError);
      return res.status(502).json({ error: emailError.message || "Failed to send email" });
    }

    // Update invitation status
    await supabaseAdmin
      .from("org_invitations")
      .update({
        status: "sent",
        resend_email_id: emailData.id,
        sent_at: new Date().toISOString(),
      })
      .eq("id", invitationId);

    console.log(`[send-team-invite] OK emailId=${emailData.id} to=${inv.email}`);
    return res.status(200).json({ status: "ok", emailId: emailData.id });
  } catch (err) {
    console.error("[send-team-invite] Error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
