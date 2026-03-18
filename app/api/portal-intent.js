// Vercel Serverless Function — Sub declares intent (Bidding / Reviewing / Pass)
// POST { token, intent: "bidding"|"reviewing"|"pass", reason?: string }

import { supabaseAdmin } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!supabaseAdmin) return res.status(500).json({ error: "Database not configured" });

  const { token, intent, reason } = req.body || {};

  if (!token || !intent) {
    return res.status(400).json({ error: "Missing token or intent" });
  }

  const validIntents = ["bidding", "reviewing", "pass"];
  if (!validIntents.includes(intent)) {
    return res.status(400).json({ error: "Invalid intent. Must be: bidding, reviewing, or pass" });
  }

  try {
    // Verify token
    const { data: inv, error: invErr } = await supabaseAdmin
      .from("bid_invitations")
      .select("id, package_id, status")
      .eq("token", token)
      .single();

    if (invErr || !inv) {
      return res.status(404).json({ error: "Invalid token" });
    }

    // Don't allow intent changes on already-submitted or awarded invitations
    if (["submitted", "parsed", "awarded", "not_awarded"].includes(inv.status)) {
      return res.status(400).json({ error: "Cannot change intent after submission or award" });
    }

    // Update intent columns
    const updates = {
      intent,
      intent_reason: reason || null,
      intent_at: new Date().toISOString(),
    };

    const { error: updateErr } = await supabaseAdmin.from("bid_invitations").update(updates).eq("id", inv.id);

    if (updateErr) {
      console.error("Intent update error:", updateErr);
      return res.status(500).json({ error: "Failed to update intent" });
    }

    return res.status(200).json({ status: "ok", intent });
  } catch (err) {
    console.error("portal-intent error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
