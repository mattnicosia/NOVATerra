import { Webhook } from "svix";
import { supabaseAdmin } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Inbound Email Webhook — Resend (replaced SendGrid Inbound Parse)
//
// Resend sends a lightweight JSON webhook with email metadata.
// We then fetch the full email content (body + attachments) via the Resend API.
// This is more reliable than SendGrid's multipart approach.
// ═══════════════════════════════════════════════════════════════════════════════

const RESEND_API = "https://api.resend.com";

// Extract email address from "Name <email>" format
function extractEmail(fromStr) {
  if (!fromStr) return { email: null, name: null };
  const match = fromStr.match(/<([^>]+)>/);
  const email = match ? match[1] : fromStr.trim();
  const name = match ? fromStr.replace(/<[^>]+>/, "").trim() : null;
  return { email: email.toLowerCase(), name: name || null };
}

// Fetch full email content from Resend Received Emails API
async function fetchEmail(emailId, apiKey) {
  const res = await fetch(`${RESEND_API}/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Resend API ${res.status}: ${errText}`);
  }
  return res.json();
}

// Fetch attachment list with download URLs
async function fetchAttachments(emailId, apiKey) {
  const res = await fetch(`${RESEND_API}/emails/receiving/${emailId}/attachments`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || data || [];
}

// Download a single attachment as a Buffer
async function downloadAttachment(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  // Verify webhook signature from Resend (svix)
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (webhookSecret) {
    try {
      const wh = new Webhook(webhookSecret);
      const svixId = req.headers["svix-id"];
      const svixTimestamp = req.headers["svix-timestamp"];
      const svixSignature = req.headers["svix-signature"];
      if (!svixId || !svixTimestamp || !svixSignature) {
        console.warn("[inbound] Missing svix headers — rejecting");
        return res.status(401).json({ error: "Missing webhook signature" });
      }
      wh.verify(JSON.stringify(req.body), {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
    } catch (verifyErr) {
      console.warn("[inbound] Webhook signature verification failed:", verifyErr.message);
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
  } else {
    console.warn("[inbound] WEBHOOK_SECRET not set — skipping signature verification");
  }

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    return res.status(500).json({ error: "RESEND_API_KEY not configured" });
  }

  try {
    const event = req.body;

    // Only process email.received events (ignore other Resend webhook types)
    if (!event || event.type !== "email.received") {
      console.log(`[inbound] Ignoring event type: ${event?.type || "unknown"}`);
      return res.status(200).json({ status: "ignored", type: event?.type });
    }

    const { email_id, from: webhookFrom, subject: webhookSubject } = event.data;
    console.log(`[inbound] Resend webhook: email_id=${email_id} from=${webhookFrom} subject="${webhookSubject}"`);

    // ── Fetch full email content from Resend API ──
    const email = await fetchEmail(email_id, RESEND_KEY);

    const { email: senderEmail, name: senderName } = extractEmail(email.from);
    const subject = email.subject || webhookSubject || "(no subject)";
    const text = email.text || "";
    const html = email.html || "";
    const toAddr = Array.isArray(email.to) ? email.to.join(", ") : email.to || "(unknown)";

    // Extract email thread headers for threading
    const headers = email.headers || {};
    const messageId = headers["message-id"] || headers["Message-ID"] || email.message_id || null;
    const inReplyTo = headers["in-reply-to"] || headers["In-Reply-To"] || null;
    const referencesHeader = headers["references"] || headers["References"] || null;
    const senderDomain = senderEmail ? senderEmail.split("@")[1] || "" : "";

    console.log(
      `[inbound] from=${senderEmail} to=${toAddr} subject="${subject}" attachments=${email.attachments?.length || 0} thread=${messageId ? "yes" : "no"}`,
    );

    // ── Look up the sender in user_email_mappings ──
    const { data: mapping } = await supabaseAdmin
      .from("user_email_mappings")
      .select("user_id")
      .eq("email", senderEmail)
      .single();

    if (!mapping) {
      console.log(`[inbound] Unknown sender: ${senderEmail} — dropping. Subject: "${subject}"`);
      return res.status(200).json({ status: "unknown_sender" });
    }

    const userId = mapping.user_id;
    const rfpId = crypto.randomUUID();

    // ── Download and upload attachments ──
    const attachmentMeta = [];
    if (email.attachments?.length > 0) {
      try {
        const attachments = await fetchAttachments(email_id, RESEND_KEY);

        for (const att of attachments) {
          if (!att.filename || !att.download_url) continue;
          try {
            const buffer = await downloadAttachment(att.download_url);
            const storagePath = `${userId}/${rfpId}/${att.filename}`;
            const { error: uploadErr } = await supabaseAdmin.storage
              .from("rfp-attachments")
              .upload(storagePath, buffer, {
                contentType: att.content_type || "application/octet-stream",
                upsert: false,
              });

            if (!uploadErr) {
              attachmentMeta.push({
                id: crypto.randomUUID(),
                filename: att.filename,
                contentType: att.content_type || "application/octet-stream",
                size: buffer.length,
                storagePath,
              });
            } else {
              console.error(`[inbound] Upload error for ${att.filename}:`, uploadErr.message);
            }
          } catch (dlErr) {
            console.error(`[inbound] Attachment download error for ${att.filename}:`, dlErr.message);
          }
        }
      } catch (attErr) {
        console.error(`[inbound] Attachments fetch error:`, attErr.message);
        // Non-critical — continue without attachments
      }
    }

    // ── Insert pending RFP row (queued for async processing) ──
    const { error: insertErr } = await supabaseAdmin.from("pending_rfps").insert({
      id: rfpId,
      user_id: userId,
      status: "queued",
      sender_email: senderEmail,
      sender_name: senderName,
      sender_domain: senderDomain,
      subject,
      raw_text: text.slice(0, 50000),
      attachments: attachmentMeta,
      message_id: messageId,
      in_reply_to: inReplyTo,
      references_header: referencesHeader,
      queue_priority: 0,
      retry_count: 0,
    });

    if (insertErr) {
      console.error("[inbound] Insert error:", insertErr.message);
      return res.status(500).json({ error: "Failed to store RFP" });
    }

    // Parsing, email matching, and draft estimate creation happen async
    // via /api/cron/process-rfps (queue processor)
    console.log(
      `[inbound] OK rfpId=${rfpId} status=queued attachments=${attachmentMeta.length}`,
    );
    return res.status(200).json({
      status: "queued",
      rfpId,
      attachments: attachmentMeta.length,
    });
  } catch (err) {
    console.error("[inbound] Webhook error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
