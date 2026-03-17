// Vercel Serverless Function — Post a comment on a living proposal
// POST (public, token-validated) — owner or GC can comment
// No auth required — uses access_token for validation

import { cors } from "./lib/cors.js";
import { supabaseAdmin } from "./lib/supabaseAdmin.js";
import { checkRateLimit } from "./lib/rateLimiter.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    livingProposalId,
    accessToken,
    versionId,
    authorType,
    authorName,
    authorEmail,
    content,
    targetType,
    targetId,
  } = req.body || {};

  if (!livingProposalId || !accessToken || !authorName || !content) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Rate limit by IP
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const { allowed } = checkRateLimit(`lp_comment_${ip}`, { maxRequests: 20, windowMs: 60000 });
  if (!allowed) return res.status(429).json({ error: "Too many comments, please slow down" });

  // Validate access token
  const { data: proposal } = await supabaseAdmin
    .from("living_proposals")
    .select("id, status")
    .eq("id", livingProposalId)
    .eq("access_token", accessToken)
    .single();

  if (!proposal) {
    return res.status(403).json({ error: "Invalid access token" });
  }

  if (proposal.status === "revoked") {
    return res.status(410).json({ error: "This proposal has been revoked" });
  }

  // Insert comment
  const { data: comment, error } = await supabaseAdmin
    .from("living_proposal_comments")
    .insert({
      living_proposal_id: livingProposalId,
      version_id: versionId || null,
      author_type: authorType || "owner",
      author_name: authorName,
      author_email: authorEmail || null,
      content: content.slice(0, 5000),
      target_type: targetType || null,
      target_id: targetId || null,
    })
    .select()
    .single();

  if (error) {
    console.error("[living-proposal-comment] Insert error:", error);
    return res.status(500).json({ error: error.message });
  }

  // Update comment count
  const { count } = await supabaseAdmin
    .from("living_proposal_comments")
    .select("id", { count: "exact", head: true })
    .eq("living_proposal_id", livingProposalId);

  await supabaseAdmin
    .from("living_proposals")
    .update({ comment_count: count || 0 })
    .eq("id", livingProposalId)
    .catch(() => {});

  return res.status(200).json({ status: "ok", comment });
}
