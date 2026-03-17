// Vercel Serverless Function — Public Living Proposal Viewer
// GET ?slug=xxx — returns latest published version + branding (no auth required)
// GET ?slug=xxx&version=N — returns specific version
// Records a view on each access

import { cors } from "./lib/cors.js";
import { supabaseAdmin } from "./lib/supabaseAdmin.js";
import crypto from "crypto";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { slug, version: versionNum } = req.query;

  if (!slug) {
    return res.status(400).json({ error: "Missing slug parameter" });
  }

  // Fetch the living proposal
  const { data: proposal, error: fetchErr } = await supabaseAdmin
    .from("living_proposals")
    .select("*")
    .eq("slug", slug)
    .single();

  if (fetchErr || !proposal) {
    return res.status(404).json({ error: "Proposal not found" });
  }

  // Check if revoked
  if (proposal.status === "revoked") {
    return res.status(410).json({
      error: "revoked",
      message: "This proposal has been revoked by the sender.",
      gc_company_name: proposal.gc_company_name,
      gc_email: proposal.gc_email,
    });
  }

  // Check expiration
  const isExpired = proposal.valid_until && new Date(proposal.valid_until) < new Date();
  if (isExpired && proposal.status !== "expired") {
    // Auto-expire
    await supabaseAdmin
      .from("living_proposals")
      .update({ status: "expired", expired_at: new Date().toISOString() })
      .eq("id", proposal.id);
    proposal.status = "expired";
    proposal.expired_at = new Date().toISOString();
  }

  // Fetch requested version (or latest)
  let versionQuery = supabaseAdmin
    .from("living_proposal_versions")
    .select("*")
    .eq("living_proposal_id", proposal.id);

  if (versionNum) {
    versionQuery = versionQuery.eq("version_number", parseInt(versionNum, 10));
  } else {
    versionQuery = versionQuery.order("version_number", { ascending: false }).limit(1);
  }

  const { data: versions, error: versionErr } = await versionQuery;

  if (versionErr || !versions || versions.length === 0) {
    // Proposal exists but no versions published yet
    return res.status(200).json({
      status: proposal.status,
      proposal: sanitizeProposal(proposal),
      version: null,
      totalVersions: proposal.version_count,
    });
  }

  const currentVersion = versions[0];

  // Fetch all version numbers for version selector
  const { data: allVersions } = await supabaseAdmin
    .from("living_proposal_versions")
    .select("version_number, published_at, change_summary, grand_total")
    .eq("living_proposal_id", proposal.id)
    .order("version_number", { ascending: false });

  // Fetch owner's alternate selections for this version
  const { data: alternateSelections } = await supabaseAdmin
    .from("living_proposal_alternates")
    .select("alternate_id, selected")
    .eq("living_proposal_id", proposal.id)
    .eq("version_id", currentVersion.id);

  // Fetch comments for this version
  const { data: comments } = await supabaseAdmin
    .from("living_proposal_comments")
    .select("id, author_type, author_name, content, target_type, target_id, created_at")
    .eq("living_proposal_id", proposal.id)
    .order("created_at", { ascending: true });

  // Record view (async, don't wait)
  recordView(proposal.id, currentVersion.id, req).catch(() => {});

  return res.status(200).json({
    status: proposal.status,
    proposal: sanitizeProposal(proposal),
    version: {
      id: currentVersion.id,
      version_number: currentVersion.version_number,
      published_at: currentVersion.published_at,
      snapshot_data: currentVersion.snapshot_data,
      grand_total: currentVersion.grand_total,
      direct_cost: currentVersion.direct_cost,
      division_totals: currentVersion.division_totals,
      change_summary: currentVersion.change_summary,
      change_diff: currentVersion.change_diff,
    },
    allVersions: allVersions || [],
    alternateSelections: alternateSelections || [],
    comments: comments || [],
    totalVersions: proposal.version_count,
  });
}

/** Strip internal fields before sending to public */
function sanitizeProposal(p) {
  return {
    id: p.id,
    slug: p.slug,
    access_token: p.access_token,
    status: p.status,
    gc_company_name: p.gc_company_name,
    gc_logo_url: p.gc_logo_url,
    gc_accent_color: p.gc_accent_color,
    gc_phone: p.gc_phone,
    gc_email: p.gc_email,
    project_name: p.project_name,
    project_address: p.project_address,
    owner_name: p.owner_name,
    owner_contact_name: p.owner_contact_name,
    valid_until: p.valid_until,
    expired_at: p.expired_at,
    version_count: p.version_count,
  };
}

async function recordView(proposalId, versionId, req) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
  const ua = req.headers["user-agent"] || "";
  const fingerprint = crypto.createHash("sha256").update(ip + ua).digest("hex").slice(0, 16);
  const ipHash = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);

  await supabaseAdmin.from("living_proposal_views").insert({
    living_proposal_id: proposalId,
    version_id: versionId,
    viewer_fingerprint: fingerprint,
    ip_hash: ipHash,
    user_agent: ua.slice(0, 500),
    referrer: (req.headers.referer || "").slice(0, 500),
  });

  // Update denormalized counters (fetch-then-increment since supabase-js has no .raw())
  const { data: current } = await supabaseAdmin
    .from("living_proposals")
    .select("view_count")
    .eq("id", proposalId)
    .single();
  if (current) {
    await supabaseAdmin
      .from("living_proposals")
      .update({ view_count: (current.view_count || 0) + 1, last_viewed_at: new Date().toISOString() })
      .eq("id", proposalId)
      .catch(() => {});
  }
}
