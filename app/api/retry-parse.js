import { supabaseAdmin, verifyUser } from './lib/supabaseAdmin.js';
import { parseRfpEmail } from './lib/parseEmail.js';
import { cors } from './lib/cors.js';

/**
 * POST /api/retry-parse
 * Re-parse a pending_rfps row that has status="error".
 * Body: { rfpId: string }
 */
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { rfpId } = req.body || {};
  if (!rfpId) return res.status(400).json({ error: "rfpId is required" });

  try {
    // Fetch the RFP row
    const { data: rfp, error: fetchErr } = await supabaseAdmin
      .from("pending_rfps")
      .select("*")
      .eq("id", rfpId)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !rfp) {
      return res.status(404).json({ error: "RFP not found" });
    }

    if (rfp.status !== "error" && rfp.status !== "pending") {
      return res.status(400).json({ error: `Cannot retry: status is "${rfp.status}"` });
    }

    console.log(`[retry-parse] Re-parsing rfpId=${rfpId} subject="${rfp.subject}" sender=${rfp.sender_email}`);

    // Set status back to pending while re-parsing
    await supabaseAdmin
      .from("pending_rfps")
      .update({ status: "pending", parse_error: null })
      .eq("id", rfpId);

    // Re-run the AI parser
    const parsedData = await parseRfpEmail({
      subject: rfp.subject || "",
      senderEmail: rfp.sender_email || "",
      senderName: rfp.sender_name || "",
      text: rfp.raw_text || "",
      html: "",
    });

    const hasError = parsedData.error;
    if (hasError) {
      console.error(`[retry-parse] Parse failed for rfpId=${rfpId}:`, parsedData.error);
    } else {
      console.log(`[retry-parse] Parse succeeded for rfpId=${rfpId}: project="${parsedData.projectName}"`);
    }

    // Update the row
    await supabaseAdmin
      .from("pending_rfps")
      .update({
        parsed_data: hasError ? null : parsedData,
        parse_error: hasError ? parsedData.error : null,
        status: hasError ? "error" : "parsed",
      })
      .eq("id", rfpId);

    return res.status(200).json({
      success: !hasError,
      status: hasError ? "error" : "parsed",
      error: hasError ? parsedData.error : null,
      projectName: hasError ? null : parsedData.projectName,
    });
  } catch (err) {
    console.error("[retry-parse] Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
