// Vercel Serverless Function — AI Proposal Parsing via Claude
// POST { proposalId } — downloads PDF from Supabase Storage, sends to Claude, saves parsed data

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin, verifyUser } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";
import { PROPOSAL_PARSE_PROMPT, buildProposalMessages } from "./lib/parseProposal.js";
import { checkRateLimit } from "./lib/rateLimiter.js";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!supabaseAdmin) return res.status(500).json({ error: "Database not configured" });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: "AI service not configured" });

  const { proposalId, token } = req.body || {};
  if (!proposalId) return res.status(400).json({ error: "Missing proposalId" });

  try {
    // Fetch proposal record
    const { data: proposal, error: propErr } = await supabaseAdmin
      .from("bid_proposals")
      .select("id, invitation_id, package_id, storage_path")
      .eq("id", proposalId)
      .single();

    if (propErr || !proposal) {
      return res.status(404).json({ error: "Proposal not found" });
    }

    const { data: pkg, error: pkgErr } = await supabaseAdmin
      .from("bid_packages")
      .select("id, user_id")
      .eq("id", proposal.package_id)
      .single();

    if (pkgErr || !pkg) {
      return res.status(404).json({ error: "Proposal owner not found" });
    }

    let requesterUserId = null;
    const user = await verifyUser(req);
    if (user) {
      if (pkg.user_id !== user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      requesterUserId = user.id;
    } else if (token) {
      const { data: invitation, error: invErr } = await supabaseAdmin
        .from("bid_invitations")
        .select("id, user_id")
        .eq("token", token)
        .single();

      if (invErr || !invitation || invitation.id !== proposal.invitation_id) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      requesterUserId = invitation.user_id;
    } else {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { allowed, retryAfter } = checkRateLimit(`parse_proposal_${requesterUserId}`);
    if (!allowed) {
      return res.status(429).json({ error: "Rate limited — too many parse requests", retryAfter });
    }

    // Update status to parsing
    await supabaseAdmin.from("bid_proposals").update({ parse_status: "parsing" }).eq("id", proposalId);

    // Download PDF from Supabase Storage
    const { data: fileData, error: dlErr } = await supabaseAdmin.storage
      .from("proposals")
      .download(proposal.storage_path);

    if (dlErr || !fileData) {
      throw new Error(`Failed to download proposal: ${dlErr?.message || "file not found"}`);
    }

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const pdfBase64 = buffer.toString("base64");

    // Check size — skip AI parsing for very large files (>25MB)
    if (buffer.length > 25 * 1024 * 1024) {
      await supabaseAdmin
        .from("bid_proposals")
        .update({
          parse_status: "error",
          parse_error: "File too large for AI parsing (>25MB)",
        })
        .eq("id", proposalId);

      return res.status(200).json({ status: "skipped", reason: "File too large" });
    }

    // Call Claude API with PDF document
    const client = new Anthropic({ apiKey: anthropicKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: PROPOSAL_PARSE_PROMPT,
      messages: buildProposalMessages(pdfBase64),
    });

    // Extract JSON from response
    const text = response.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    let parsedData;
    try {
      // Try to extract JSON from the response (handle markdown code blocks)
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      parsedData = JSON.parse(jsonMatch[1].trim());
    } catch {
      // Fallback: try to find JSON object with balanced brackets
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        parsedData = JSON.parse(text.slice(start, end + 1));
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    // Update proposal with parsed data
    await supabaseAdmin
      .from("bid_proposals")
      .update({
        parsed_data: parsedData,
        parse_status: "parsed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposalId);

    // Update invitation status to parsed
    await supabaseAdmin.from("bid_invitations").update({ status: "parsed" }).eq("id", proposal.invitation_id);

    console.log(
      `[parse-proposal] OK proposalId=${proposalId} total=${parsedData.totalBid} items=${parsedData.lineItems?.length || 0}`,
    );
    return res.status(200).json({ status: "ok", parsedData });
  } catch (err) {
    console.error("[parse-proposal] Error:", err);

    // Save error to proposal
    await supabaseAdmin
      .from("bid_proposals")
      .update({
        parse_status: "error",
        parse_error: err.message || "Unknown parsing error",
      })
      .eq("id", proposalId)
      .catch(() => {});

    return res.status(500).json({ error: err.message || "Parsing failed" });
  }
}
