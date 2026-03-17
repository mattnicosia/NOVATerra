// Vercel Serverless Function — Publish a Living Proposal Version
// POST: captures snapshot, creates immutable version, computes diff

import { cors } from "./lib/cors.js";
import { verifyUser } from "./lib/supabaseAdmin.js";
import { supabaseAdmin } from "./lib/supabaseAdmin.js";
import { computeProposalDiff } from "./lib/proposalDiff.js";

export const config = {
  api: { bodyParser: { sizeLimit: "5mb" } },
};

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { livingProposalId, snapshotData, grandTotal, directCost, divisionTotals, changeSummary } = req.body || {};

  if (!livingProposalId || !snapshotData || grandTotal == null) {
    return res.status(400).json({ error: "Missing required fields: livingProposalId, snapshotData, grandTotal" });
  }

  // Verify ownership
  const { data: proposal, error: fetchErr } = await supabaseAdmin
    .from("living_proposals")
    .select("*")
    .eq("id", livingProposalId)
    .single();

  if (fetchErr || !proposal) {
    return res.status(404).json({ error: "Living proposal not found" });
  }

  if (proposal.user_id !== user.id) {
    return res.status(403).json({ error: "Not authorized to publish this proposal" });
  }

  // Check expiration
  if (proposal.valid_until && new Date(proposal.valid_until) < new Date()) {
    return res.status(400).json({ error: "This proposal has expired. Update the validity period before publishing." });
  }

  // Get previous version for diff
  const nextVersion = proposal.version_count + 1;
  let changeDiff = null;

  if (nextVersion > 1) {
    const { data: prevVersion } = await supabaseAdmin
      .from("living_proposal_versions")
      .select("snapshot_data, grand_total")
      .eq("living_proposal_id", livingProposalId)
      .eq("version_number", nextVersion - 1)
      .single();

    if (prevVersion) {
      changeDiff = computeProposalDiff(
        { ...prevVersion.snapshot_data, grandTotal: prevVersion.grand_total },
        { ...snapshotData, grandTotal },
      );
    }
  }

  // Create version
  const { data: version, error: versionErr } = await supabaseAdmin
    .from("living_proposal_versions")
    .insert({
      living_proposal_id: livingProposalId,
      version_number: nextVersion,
      published_by: user.id,
      snapshot_data: snapshotData,
      grand_total: grandTotal,
      direct_cost: directCost || null,
      division_totals: divisionTotals || null,
      change_summary: changeSummary || (changeDiff?.summary) || null,
      change_diff: changeDiff || null,
    })
    .select()
    .single();

  if (versionErr) {
    // Handle unique constraint violation (concurrent publish race)
    if (versionErr.code === "23505") {
      return res.status(409).json({ error: "Version already published. Refresh and try again." });
    }
    console.error("[living-proposal-publish] Version insert error:", versionErr);
    return res.status(500).json({ error: versionErr.message });
  }

  // Update proposal counters + status
  const { error: updateErr } = await supabaseAdmin
    .from("living_proposals")
    .update({
      version_count: nextVersion,
      status: "published",
      updated_at: new Date().toISOString(),
    })
    .eq("id", livingProposalId);

  if (updateErr) {
    console.error("[living-proposal-publish] Proposal update error:", updateErr);
  }

  return res.status(200).json({
    status: "ok",
    version: {
      id: version.id,
      version_number: nextVersion,
      change_summary: version.change_summary,
    },
    url: `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:5173'}/p/${proposal.slug}`,
  });
}
