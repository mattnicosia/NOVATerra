import { supabaseAdmin, verifyUser } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";

/**
 * Link an RFP to an estimate (called after import creates the estimate).
 * Also links all related emails (same parent_rfp_id) to the same estimate.
 */
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { rfpId, estimateId } = req.body || {};
    if (!rfpId || !estimateId) {
      return res.status(400).json({ error: "rfpId and estimateId required" });
    }

    // Link the primary RFP to the estimate
    await supabaseAdmin
      .from("pending_rfps")
      .update({ linked_estimate_id: estimateId })
      .eq("id", rfpId)
      .eq("user_id", user.id);

    // Also link any child emails (addenda/related) that reference this RFP as parent
    await supabaseAdmin
      .from("pending_rfps")
      .update({ linked_estimate_id: estimateId })
      .eq("parent_rfp_id", rfpId)
      .eq("user_id", user.id);

    return res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Link RFP error:", err.message);
    return res.status(500).json({ error: "Failed to link RFP" });
  }
}
