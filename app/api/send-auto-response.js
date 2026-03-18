// Vercel Serverless Function — Send approved auto-response email via Resend
// POST { invitationId, subject, htmlBody }
// Auth: Bearer JWT (verifyUser)

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

  const { invitationId, subject, htmlBody } = req.body || {};
  if (!invitationId || !subject || !htmlBody) {
    return res.status(400).json({ error: "Missing required fields (invitationId, subject, htmlBody)" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  if (!apiKey) {
    return res.status(500).json({ error: "Email service not configured" });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Database not configured" });
  }

  try {
    // Look up invitation to get recipient email
    const { data: inv, error: invErr } = await supabaseAdmin
      .from("bid_invitations")
      .select("sub_email, sub_company")
      .eq("id", invitationId)
      .eq("user_id", user.id)
      .single();

    if (invErr || !inv) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    if (!inv.sub_email) {
      return res.status(400).json({ error: "No email address on this invitation" });
    }

    const resend = new Resend(apiKey);
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: `NOVA Bids <${fromEmail}>`,
      to: [inv.sub_email],
      subject,
      html: htmlBody,
    });

    if (emailError) {
      console.error("[send-auto-response] Resend error:", emailError);
      return res.status(502).json({ error: emailError.message || "Failed to send email" });
    }

    console.log(`[send-auto-response] OK emailId=${emailData.id} to=${inv.sub_email} subj="${subject}"`);
    return res.status(200).json({ status: "ok", emailId: emailData.id });
  } catch (err) {
    console.error("[send-auto-response] Error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
