import { supabaseAdmin, verifyUser } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";

/**
 * Fetch all emails linked to an estimate (for the Communications timeline).
 * Returns emails ordered by received_at descending.
 */
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const estimateId = req.query.estimateId;
    if (!estimateId) {
      return res.status(400).json({ error: "estimateId required" });
    }

    // Fetch all RFPs linked to this estimate
    const { data: emails, error } = await supabaseAdmin
      .from("pending_rfps")
      .select(
        "id, subject, sender_email, sender_name, received_at, status, type, classification, " +
        "addendum_number, match_confidence, attachments, parsed_data, raw_text",
      )
      .eq("user_id", user.id)
      .eq("linked_estimate_id", estimateId)
      .order("received_at", { ascending: true });

    if (error) {
      console.error("Fetch estimate emails error:", error.message);
      return res.status(500).json({ error: "Failed to fetch emails" });
    }

    // Also fetch any emails linked via parent_estimate_id (legacy addendum field)
    const { data: legacyEmails } = await supabaseAdmin
      .from("pending_rfps")
      .select(
        "id, subject, sender_email, sender_name, received_at, status, type, classification, " +
        "addendum_number, match_confidence, attachments, parsed_data, raw_text",
      )
      .eq("user_id", user.id)
      .eq("parent_estimate_id", estimateId)
      .is("linked_estimate_id", null)
      .order("received_at", { ascending: true });

    // Merge and deduplicate
    const allEmails = [...(emails || [])];
    const existingIds = new Set(allEmails.map(e => e.id));
    for (const le of legacyEmails || []) {
      if (!existingIds.has(le.id)) allEmails.push(le);
    }

    // Sort by received_at
    allEmails.sort((a, b) => new Date(a.received_at) - new Date(b.received_at));

    return res.status(200).json({ emails: allEmails });
  } catch (err) {
    console.error("Estimate emails error:", err.message);
    return res.status(500).json({ error: "Failed to fetch emails" });
  }
}
