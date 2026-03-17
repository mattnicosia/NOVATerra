// Vercel Serverless Function — Toggle alternate selection on a living proposal
// POST (public, token-validated)

import { cors } from "./lib/cors.js";
import { supabaseAdmin } from "./lib/supabaseAdmin.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { livingProposalId, accessToken, versionId, alternateId, selected } = req.body || {};

  if (!livingProposalId || !accessToken || !versionId || !alternateId || selected == null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Validate access token
  const { data: proposal } = await supabaseAdmin
    .from("living_proposals")
    .select("id, status")
    .eq("id", livingProposalId)
    .eq("access_token", accessToken)
    .single();

  if (!proposal) return res.status(403).json({ error: "Invalid access token" });
  if (proposal.status === "revoked") return res.status(410).json({ error: "Proposal revoked" });

  // Upsert alternate selection
  const { data: existing } = await supabaseAdmin
    .from("living_proposal_alternates")
    .select("id")
    .eq("living_proposal_id", livingProposalId)
    .eq("version_id", versionId)
    .eq("alternate_id", alternateId)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("living_proposal_alternates")
      .update({ selected, selected_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabaseAdmin
      .from("living_proposal_alternates")
      .insert({
        living_proposal_id: livingProposalId,
        version_id: versionId,
        alternate_id: alternateId,
        selected,
      });
  }

  return res.status(200).json({ status: "ok", alternateId, selected });
}
