// Vercel Serverless Function — Portal coverage polling endpoint
// GET ?token=X&proposalId=Y — returns coverage score after parsing completes

import { supabaseAdmin } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";
import { computePortalCoverage } from "./lib/portalCoverage.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!supabaseAdmin) return res.status(500).json({ error: "Database not configured" });

  const { token, proposalId } = req.query || {};

  if (!token || !proposalId) {
    return res.status(400).json({ error: "Missing token or proposalId" });
  }

  try {
    // Verify token
    const { data: inv, error: invErr } = await supabaseAdmin
      .from("bid_invitations")
      .select("id, package_id")
      .eq("token", token)
      .single();

    if (invErr || !inv) {
      return res.status(404).json({ error: "Invalid token" });
    }

    // Fetch proposal
    const { data: proposal, error: propErr } = await supabaseAdmin
      .from("bid_proposals")
      .select("id, parsed_data, parse_status, coverage_result")
      .eq("id", proposalId)
      .eq("invitation_id", inv.id)
      .single();

    if (propErr || !proposal) {
      return res.status(404).json({ error: "Proposal not found" });
    }

    // If already cached, return it
    if (proposal.coverage_result) {
      return res.status(200).json({ status: "ready", ...proposal.coverage_result });
    }

    // If not yet parsed, return pending
    if (proposal.parse_status !== "success") {
      return res.status(200).json({ status: "pending", parseStatus: proposal.parse_status || "processing" });
    }

    // Parsed but no cached result — compute now
    const { data: pkg, error: pkgErr } = await supabaseAdmin
      .from("bid_packages")
      .select("scope_items")
      .eq("id", inv.package_id)
      .single();

    if (pkgErr || !pkg) {
      return res.status(200).json({ status: "error", error: "Package not found" });
    }

    const scopeItems = Array.isArray(pkg.scope_items) ? pkg.scope_items : [];
    const parsedData = proposal.parsed_data || {};

    // Skip coverage if parsedData only has structuredInput (no AI parse yet)
    if (!parsedData.lineItems && !parsedData.totalBid) {
      return res.status(200).json({ status: "pending", parseStatus: "processing" });
    }

    const coverage = computePortalCoverage(scopeItems, parsedData);

    // Cache for future requests
    supabaseAdmin
      .from("bid_proposals")
      .update({ coverage_result: coverage })
      .eq("id", proposalId)
      .then(({ error }) => {
        if (error) console.warn("[portal-coverage] Cache save failed:", error);
      });

    return res.status(200).json({ status: "ready", ...coverage });
  } catch (err) {
    console.error("[portal-coverage] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
