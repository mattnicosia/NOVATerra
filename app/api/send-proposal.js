// Vercel Serverless Function — Send proposal email via Resend
// Accepts PDF as base64 attachment + email fields. Client generates PDF client-side.

import { Resend } from "resend";
import { cors } from "./lib/cors.js";
import { verifyUser } from "./lib/supabaseAdmin.js";
import { checkRateLimit } from "./lib/rateLimiter.js";
import { sendThenBackground } from "./lib/background.js";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { allowed, retryAfter } = await checkRateLimit(`send_proposal_${user.id}`);
  if (!allowed) {
    return res.status(429).json({ error: "Rate limited — too many email sends", retryAfter });
  }

  const { to, cc, bcc, subject, body, pdfBase64, pdfFilename, fromName, replyTo } = req.body || {};

  // Validate required fields
  if (!to || !subject || !pdfBase64) {
    return res.status(400).json({ error: "Missing required fields: to, subject, pdfBase64" });
  }

  // Parse comma-separated email lists
  const parseEmails = str =>
    str
      ? str
          .split(",")
          .map(e => e.trim())
          .filter(Boolean)
      : [];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const toList = parseEmails(to);
  if (toList.length === 0 || !toList.every(e => emailRegex.test(e))) {
    return res.status(400).json({ error: "Invalid recipient email address" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  if (!apiKey) {
    return res.status(500).json({ error: "Email service not configured — set RESEND_API_KEY env var" });
  }

  const resend = new Resend(apiKey);
  const pdfBuffer = Buffer.from(pdfBase64, "base64");

  const emailPayload = {
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    to: toList,
    subject,
    text: body || "",
    attachments: [{ filename: pdfFilename || "Proposal.pdf", content: pdfBuffer }],
  };

  if (replyTo) emailPayload.reply_to = replyTo;
  const ccList = parseEmails(cc);
  if (ccList.length > 0) emailPayload.cc = ccList;
  const bccList = parseEmails(bcc);
  if (bccList.length > 0) emailPayload.bcc = bccList;

  // Respond immediately, send email in background via Vercel waitUntil.
  // User-visible latency drops from ~2-3s (Resend round-trip) to <100ms.
  // Failures are logged server-side; the client considers the request queued.
  sendThenBackground(
    res,
    202,
    { status: "queued", to: toList, subject },
    async () => {
      const { data, error } = await resend.emails.send(emailPayload);
      if (error) throw new Error(`Resend error: ${error.message || JSON.stringify(error)}`);
      console.log(`[send-proposal] OK id=${data?.id} to=${toList.join(",")}`);
    },
    "send-proposal",
  );
}
