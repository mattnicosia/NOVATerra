import Busboy from 'busboy';
import { Readable } from 'stream';
import { supabaseAdmin } from './lib/supabaseAdmin.js';
import { parseRfpEmail } from './lib/parseEmail.js';
import { cors } from './lib/cors.js';

// Allow large inbound emails (RFPs with PDF attachments can be 20MB+)
// bodyParser with high sizeLimit raises Vercel's default 4.5MB request limit
export const config = { api: { bodyParser: { sizeLimit: '50mb' } } };

// Helper: parse multipart form data from SendGrid Inbound Parse
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    const files = [];

    const busboy = Busboy({ headers: req.headers });

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (name, stream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => {
        const buf = Buffer.concat(chunks);
        files.push({
          fieldName: name,
          filename,
          mimeType,
          buffer: buf,
          size: buf.length,
        });
      });
    });

    busboy.on("finish", () => resolve({ fields, files }));
    busboy.on("error", reject);

    // When bodyParser is enabled, req.body is a Buffer (already read).
    // Create a Readable stream from it so busboy can parse the multipart data.
    if (req.body && (Buffer.isBuffer(req.body) || typeof req.body === 'string')) {
      const stream = Readable.from(Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body));
      stream.pipe(busboy);
    } else {
      // Fallback: stream directly (if bodyParser didn't consume the body)
      req.pipe(busboy);
    }
  });
}

// Extract email address from "Name <email>" format
function extractEmail(fromStr) {
  if (!fromStr) return { email: null, name: null };
  const match = fromStr.match(/<([^>]+)>/);
  const email = match ? match[1] : fromStr.trim();
  const name = match ? fromStr.replace(/<[^>]+>/, "").trim() : null;
  return { email: email.toLowerCase(), name: name || null };
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate webhook secret
  const token = req.query.token;
  if (!token || token !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  try {
    console.log(`[inbound] POST received at ${new Date().toISOString()}`);

    // Parse the multipart form data from SendGrid
    const { fields, files } = await parseMultipart(req);

    const { email: senderEmail, name: senderName } = extractEmail(fields.from);
    const subject = fields.subject || "(no subject)";
    const text = fields.text || "";
    const html = fields.html || "";
    const toAddr = fields.to || "(unknown)";

    console.log(`[inbound] from=${senderEmail} to=${toAddr} subject="${subject}" files=${files.length}`);

    // Look up the sender in user_email_mappings
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

    // Upload attachments to Supabase Storage
    const attachmentMeta = [];
    for (const file of files) {
      if (!file.filename) continue;
      const storagePath = `${userId}/${rfpId}/${file.filename}`;
      const { error: uploadErr } = await supabaseAdmin.storage
        .from("rfp-attachments")
        .upload(storagePath, file.buffer, {
          contentType: file.mimeType,
          upsert: false,
        });

      if (!uploadErr) {
        attachmentMeta.push({
          id: crypto.randomUUID(),
          filename: file.filename,
          contentType: file.mimeType,
          size: file.size,
          storagePath,
        });
      } else {
        console.error(`Upload error for ${file.filename}:`, uploadErr.message);
      }
    }

    // Insert pending RFP row
    const { error: insertErr } = await supabaseAdmin
      .from("pending_rfps")
      .insert({
        id: rfpId,
        user_id: userId,
        status: "pending",
        sender_email: senderEmail,
        sender_name: senderName,
        subject,
        raw_text: text.slice(0, 50000), // Limit stored text
        attachments: attachmentMeta,
      });

    if (insertErr) {
      console.error("Insert error:", insertErr.message);
      return res.status(500).json({ error: "Failed to store RFP" });
    }

    // Parse with AI
    const parsedData = await parseRfpEmail({
      subject,
      senderEmail,
      senderName,
      text,
      html,
    });

    // Update the row with parsed data
    const hasError = parsedData.error;
    if (hasError) {
      console.error("Parse error detail:", parsedData.error);
    }
    await supabaseAdmin
      .from("pending_rfps")
      .update({
        parsed_data: hasError ? null : parsedData,
        parse_error: hasError ? parsedData.error : null,
        status: hasError ? "error" : "parsed",
      })
      .eq("id", rfpId);

    console.log(`[inbound] OK rfpId=${rfpId} parsed=${!hasError} attachments=${attachmentMeta.length}`);
    return res.status(200).json({
      status: "ok",
      rfpId,
      parsed: !hasError,
      parseError: hasError ? parsedData.error : null,
      attachments: attachmentMeta.length,
    });
  } catch (err) {
    console.error("[inbound] Webhook error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
