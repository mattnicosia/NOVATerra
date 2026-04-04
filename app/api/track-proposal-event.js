import { supabaseAdmin } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { proposalId, sessionId, eventType, sectionId, durationMs, scrollDepth, metadata } = req.body || {};

  if (!proposalId || !sessionId || !eventType) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await supabaseAdmin
      .from("proposal_analytics")
      .insert({
        proposal_id: proposalId,
        session_id: sessionId,
        event_type: eventType,
        section_id: sectionId || null,
        duration_ms: durationMs || null,
        scroll_depth: scrollDepth || null,
        metadata: metadata || {},
      });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[track-proposal-event]", err);
    return res.status(200).json({ ok: true }); // Never fail on analytics
  }
}
