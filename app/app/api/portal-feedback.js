// Vercel Serverless Function — Retrieve post-loss feedback for a sub
// GET ?token=xxx — returns structured feedback after award decision

import { supabaseAdmin } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!supabaseAdmin) return res.status(500).json({ error: "Database not configured" });

  const { token } = req.query || {};

  if (!token) {
    return res.status(400).json({ error: "Missing token" });
  }

  try {
    // Verify token and get feedback
    const { data: inv, error: invErr } = await supabaseAdmin
      .from("bid_invitations")
      .select("id, status, post_loss_feedback, sub_company, feedback_notes")
      .eq("token", token)
      .single();

    if (invErr || !inv) {
      return res.status(404).json({ error: "Invalid token" });
    }

    // Only return feedback for awarded or not_awarded invitations
    if (!["awarded", "not_awarded"].includes(inv.status)) {
      return res.status(400).json({ error: "Award decision not yet made" });
    }

    return res.status(200).json({
      status: inv.status,
      feedback: inv.post_loss_feedback || null,
      feedbackNotes: inv.feedback_notes || null,
    });
  } catch (err) {
    console.error("portal-feedback error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
