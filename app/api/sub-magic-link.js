// Vercel Serverless Function — Sub Dashboard Magic Link
// POST { email } → sends email with signed JWT link

import { Resend } from "resend";
import { supabaseAdmin } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!supabaseAdmin) return res.status(500).json({ error: "Database not configured" });

  const { email } = req.body || {};
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email required" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const secret = process.env.SUB_DASHBOARD_SECRET;
  if (!secret) return res.status(500).json({ error: "Dashboard secret not configured" });
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  if (!apiKey) return res.status(500).json({ error: "Email service not configured" });

  try {
    // Check if email exists in any invitation
    const { data: invitations, error: invErr } = await supabaseAdmin
      .from("bid_invitations")
      .select("id")
      .ilike("sub_email", email)
      .limit(1);

    if (invErr) throw invErr;

    // Always respond with success to prevent email enumeration
    if (!invitations || invitations.length === 0) {
      return res.status(200).json({ status: "ok" });
    }

    // Generate a simple signed token (base64 encoded JSON with HMAC)
    const payload = {
      email: email.toLowerCase(),
      exp: Date.now() + 24 * 60 * 60 * 1000, // 24h
    };

    // Simple JWT-like token using base64 + HMAC
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]);
    const payloadB64 = btoa(JSON.stringify(payload));
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
    const token = `${payloadB64}.${sigB64}`;

    const dashboardUrl = `${appUrl}/sub-dashboard?token=${encodeURIComponent(token)}`;

    // Send magic link email
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: `NOVA Bids <${fromEmail}>`,
      to: [email],
      subject: "Your Bid Dashboard Link",
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0D0F14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:500px;margin:0 auto;padding:40px 24px;">
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;">
      <h1 style="color:#E5E5EA;font-size:18px;margin:0 0 12px;">Your Bid Dashboard</h1>
      <p style="color:#AEAEB2;font-size:14px;line-height:1.6;margin:0 0 20px;">
        Click below to view your bid history, proposal statuses, and feedback.
      </p>
      <a href="${dashboardUrl}" style="display:inline-block;background:linear-gradient(135deg,#7C5CFC,#BF5AF2);color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;text-align:center;width:100%;box-sizing:border-box;">
        Open Dashboard
      </a>
      <p style="color:#48484A;font-size:11px;margin:16px 0 0;text-align:center;">This link expires in 24 hours.</p>
    </div>
  </div>
</body></html>`,
    });

    console.log(`[sub-magic-link] Sent to ${email}`);
    return res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("[sub-magic-link] Error:", err);
    return res.status(500).json({ error: "Failed to send link" });
  }
}
