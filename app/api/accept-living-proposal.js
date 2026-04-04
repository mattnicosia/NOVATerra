import { supabaseAdmin } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { token, acceptedName, acceptedTitle } = req.body || {};
  if (!token || !acceptedName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("living_proposals")
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by: req.headers["x-forwarded-for"] || "unknown",
        accepted_name: acceptedName,
        accepted_title: acceptedTitle || null,
      })
      .eq("token", token)
      .eq("is_active", true)
      .is("accepted_at", null)
      .select()
      .single();

    if (error || !data) {
      return res.status(400).json({ error: "Proposal already accepted or not found" });
    }

    return res.status(200).json({ accepted: true, acceptedAt: data.accepted_at });
  } catch (err) {
    console.error("[accept-living-proposal]", err);
    return res.status(500).json({ error: "Failed to accept proposal" });
  }
}
