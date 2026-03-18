// Supabase Edge Function: Inbound Email Webhook for SendGrid Inbound Parse
// Replaces Vercel serverless function to bypass 4.5MB body size limit
// Supabase Edge Functions support up to 150MB request bodies
// Now with PDF document reading for dramatically better AI extraction

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Convert ArrayBuffer to base64 string (chunked to avoid stack overflow on large files)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function extractEmail(fromStr: string): { email: string | null; name: string | null } {
  if (!fromStr) return { email: null, name: null };
  const match = fromStr.match(/<([^>]+)>/);
  const email = match ? match[1] : fromStr.trim();
  const name = match ? fromStr.replace(/<[^>]+>/, "").trim() : null;
  return { email: email.toLowerCase(), name: name || null };
}

async function parseRfpEmail({
  subject,
  senderEmail,
  senderName,
  text,
  html,
  pdfDocuments,
}: {
  subject: string;
  senderEmail: string | null;
  senderName: string | null;
  text: string;
  html: string;
  pdfDocuments?: { filename: string; base64: string }[];
}) {
  const emailBody =
    text ||
    (html ? html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "");

  const hasPdfs = pdfDocuments && pdfDocuments.length > 0;

  if ((!emailBody || emailBody.length < 20) && !hasPdfs) {
    return { error: "Email body too short to parse and no PDF attachments", confidence: 0 };
  }

  const systemPrompt = `You are a construction bid parsing assistant for a general contractor's estimating software. You will receive an email (and possibly attached PDF documents) containing an RFP (Request for Proposal), bid invitation, or construction project information. Extract ALL structured project information.

IMPORTANT: PDF DOCUMENTS CONTAIN THE MOST VALUABLE INFORMATION.
- The email body is often just a short forwarding message ("Here are the plans for X").
- The attached PDF documents contain the actual bid details: project scope, due dates, requirements, square footage, addresses, architect/engineer info, etc.
- ALWAYS prioritize information from PDF documents over the email body.
- Read every page of the PDFs carefully for project details.

EXTRACTION RULES:
- Extract only information that is explicitly stated. Do not infer or guess.
- For fields where information is not available, use null.
- Dates should be in YYYY-MM-DD format. Times in HH:MM (24-hour).
- If the email chain contains multiple messages, prioritize the most recent/original RFP details.
- Look for: project name, client/owner, architect, engineer, address, bid due date and time, walkthrough date, RFI deadline, job type, bid type, bid delivery method, project square footage, scope description, and any special bid requirements.
- Also extract contact information for any parties mentioned (company, person name, email, phone).
- For architect: Look carefully in email signatures, letterheads, CC lists, plan references, drawing title blocks, cover sheets, and any "Architect:", "A/E:", "Design Team:", or "Prepared by:" fields.
- For client/owner: Look for "Owner:", "Client:", "For:", project owner references, and the party issuing the bid invitation.
- For engineer: Look for "Engineer:", "Structural:", "MEP:", "Civil:" fields, or engineering firm names on cover sheets.
- For address: Look for project site address, location, or "Project Location:" fields on cover sheets and in bid documents.
- For square footage: Look for "SF", "sq ft", "square feet", "GSF", "NSF", or area calculations in the documents.
- All person names (first and last) should use Title Case capitalization.
- All company names should use their proper capitalization.
- For jobType use one of: "New Construction", "Renovation", "Gut Renovation", "Tenant Fit-Out", "Interior Fit-Out", "Addition", "Adaptive Reuse", "Historic Restoration", "Shell & Core", "Capital Improvement", "Demolition", "Commercial", "Retail", "Industrial / Warehouse", "Healthcare / Medical", "Education", "Hospitality", "Multi-Family Residential", "Residential", "Mixed-Use", "Government / Municipal", "Religious / House of Worship", "Restaurant / Food Service", "Parking Structure" — pick the best match.
- For bidType use one of: "Hard Bid", "Negotiated", "Design-Build", "CM at Risk", "GMP" — or null if unclear.
- For bidDelivery use one of: "Email", "Sealed & Delivered", "Both", "Online Portal" — or null if unclear.
- For description: Provide a thorough but concise project description based on ALL available information (email + PDFs). Include building type, scope of work, key features, and any notable requirements.
- For scopeNotes: Extract specific scope items, trade requirements, or work descriptions mentioned in the documents.

Respond with ONLY a valid JSON object (no markdown fences, no explanation):

{
  "projectName": string | null,
  "client": { "company": string|null, "contact": string|null, "email": string|null, "phone": string|null } | null,
  "architect": { "company": string|null, "contact": string|null, "email": string|null, "phone": string|null } | null,
  "engineer": { "company": string|null, "contact": string|null, "email": string|null, "phone": string|null } | null,
  "address": string | null,
  "bidDue": "YYYY-MM-DD" | null,
  "bidDueTime": "HH:MM" | null,
  "walkthroughDate": "YYYY-MM-DD" | null,
  "rfiDueDate": "YYYY-MM-DD" | null,
  "jobType": string | null,
  "bidType": string | null,
  "bidDelivery": string | null,
  "description": string | null,
  "projectSF": number | null,
  "bidRequirements": {
    "schedule": boolean,
    "marketing": boolean,
    "financials": boolean,
    "bonds": boolean,
    "insurance": boolean,
    "references": boolean,
    "safetyPlan": boolean,
    "other": string | null
  },
  "scopeNotes": [string],
  "additionalDates": [{ "label": string, "date": "YYYY-MM-DD" }],
  "confidence": number
}`;

  // Build multimodal content blocks
  const contentBlocks: any[] = [];

  // Add email text first
  contentBlocks.push({
    type: "text",
    text: `Email Subject: ${subject || "(no subject)"}
From: ${senderName || "Unknown"} <${senderEmail || "unknown"}>

--- Email Body ---
${emailBody.slice(0, 20000)}
---`,
  });

  // Add PDF documents as native document content blocks
  if (hasPdfs) {
    for (const pdf of pdfDocuments!) {
      contentBlocks.push({
        type: "text",
        text: `\n--- Attached Document: ${pdf.filename} ---`,
      });
      contentBlocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: pdf.base64,
        },
      });
    }
    contentBlocks.push({
      type: "text",
      text: "\n--- End of Attachments ---\n\nPlease extract all project information from the email and attached PDF documents above.",
    });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return { error: "ANTHROPIC_API_KEY not configured", confidence: 0 };
    }

    console.log(`[parse] Sending to AI: ${contentBlocks.length} content blocks, ${hasPdfs ? pdfDocuments!.length + ' PDFs' : 'no PDFs'}`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: contentBlocks }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Anthropic API error:", response.status, errBody);
      return { error: `API error: ${response.status}`, confidence: 0 };
    }

    const data = await response.json();
    const responseText = data.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("")
      .trim();

    console.log(`[parse] AI response length: ${responseText.length} chars`);
    return JSON.parse(responseText);
  } catch (err: any) {
    console.error("AI parse error:", err.message);
    return { error: err.message, confidence: 0 };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate webhook secret
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");

  if (!token || token !== webhookSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    console.log(`[inbound] POST received at ${new Date().toISOString()}`);

    // Parse multipart form data (native in Deno — no body size limit issues)
    const formData = await req.formData();

    const fromField = formData.get("from") as string || "";
    const { email: senderEmail, name: senderName } = extractEmail(fromField);
    const subject = (formData.get("subject") as string) || "(no subject)";
    const text = (formData.get("text") as string) || "";
    const html = (formData.get("html") as string) || "";
    const toAddr = (formData.get("to") as string) || "(unknown)";

    console.log(`[inbound] from=${senderEmail} to=${toAddr} subject="${subject}"`);

    // Look up sender in user_email_mappings
    const { data: mapping } = await supabase
      .from("user_email_mappings")
      .select("user_id")
      .eq("email", senderEmail!)
      .single();

    if (!mapping) {
      console.log(`[inbound] Unknown sender: ${senderEmail} — dropping. Subject: "${subject}"`);
      return new Response(JSON.stringify({ status: "unknown_sender" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = mapping.user_id;
    const rfpId = crypto.randomUUID();

    // Extract and upload file attachments + collect PDFs for AI parsing
    const attachmentMeta: any[] = [];
    const pdfDocuments: { filename: string; base64: string }[] = [];
    let totalPdfBytes = 0;
    const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25MB cap for PDFs sent to AI

    for (const [key, value] of formData.entries()) {
      if (value instanceof File && value.size > 0) {
        const file = value;
        const filename = file.name || `attachment-${attachmentMeta.length + 1}`;
        const storagePath = `${userId}/${rfpId}/${filename}`;

        const buffer = await file.arrayBuffer();
        const { error: uploadErr } = await supabase.storage
          .from("rfp-attachments")
          .upload(storagePath, buffer, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });

        if (!uploadErr) {
          attachmentMeta.push({
            id: crypto.randomUUID(),
            filename,
            contentType: file.type || "application/octet-stream",
            size: file.size,
            storagePath,
          });

          // Collect PDF content for AI parsing (cap at 25MB total)
          const isPdf = file.type === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
          if (isPdf && totalPdfBytes + buffer.byteLength < MAX_PDF_BYTES) {
            const base64 = arrayBufferToBase64(buffer);
            pdfDocuments.push({ filename, base64 });
            totalPdfBytes += buffer.byteLength;
            console.log(`[inbound] PDF collected for AI: ${filename} (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB)`);
          } else if (isPdf) {
            console.log(`[inbound] PDF skipped (size cap): ${filename} (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB)`);
          }
        } else {
          console.error(`Upload error for ${filename}:`, uploadErr.message);
        }
      }
    }

    console.log(`[inbound] files=${attachmentMeta.length} pdfsForAI=${pdfDocuments.length} totalPdfMB=${(totalPdfBytes / 1024 / 1024).toFixed(1)}`);

    // Insert pending RFP row
    const { error: insertErr } = await supabase
      .from("pending_rfps")
      .insert({
        id: rfpId,
        user_id: userId,
        status: "pending",
        sender_email: senderEmail,
        sender_name: senderName,
        subject,
        raw_text: text.slice(0, 50000),
        attachments: attachmentMeta,
      });

    if (insertErr) {
      console.error("Insert error:", insertErr.message);
      return new Response(JSON.stringify({ error: "Failed to store RFP" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse with AI — now including PDF document content
    const parsedData = await parseRfpEmail({
      subject,
      senderEmail,
      senderName,
      text,
      html,
      pdfDocuments,
    });

    const hasError = parsedData.error;
    if (hasError) {
      console.error("Parse error detail:", parsedData.error);
    }

    await supabase
      .from("pending_rfps")
      .update({
        parsed_data: hasError ? null : parsedData,
        parse_error: hasError ? parsedData.error : null,
        status: hasError ? "error" : "parsed",
      })
      .eq("id", rfpId);

    console.log(`[inbound] OK rfpId=${rfpId} parsed=${!hasError} attachments=${attachmentMeta.length} pdfsRead=${pdfDocuments.length}`);

    return new Response(
      JSON.stringify({
        status: "ok",
        rfpId,
        parsed: !hasError,
        parseError: hasError ? parsedData.error : null,
        attachments: attachmentMeta.length,
        pdfsRead: pdfDocuments.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("[inbound] Webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
