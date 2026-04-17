// Vercel Serverless Function — Batch Proposal Classification + Parsing
// POST { action: "classify", fileId, pdfBase64 } → Haiku classification
// POST { action: "parse", fileId, pdfBase64, docType, folderType } → Sonnet full parse
// POST { action: "status" } → ingestion_runs counts by status

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin, verifyUser } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";
import {
  CLASSIFY_PROMPT,
  buildClassifyMessages,
  buildEnhancedParsePrompt,
  buildEnhancedParseMessages,
} from "./lib/parseProposal.js";

export const config = {
  api: { bodyParser: { sizeLimit: "50mb" } },
  maxDuration: 120,
};

function extractJSON(text) {
  try {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    return JSON.parse(jsonMatch[1].trim());
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Failed to parse AI response as JSON");
  }
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!supabaseAdmin) return res.status(500).json({ error: "Database not configured" });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: "AI service not configured" });

  const { action } = req.body || {};

  // ── STATUS: return ingestion_runs counts ──
  if (action === "status") {
    const { data, error } = await supabaseAdmin
      .from("ingestion_runs")
      .select("parse_status, id")
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const counts = {};
    for (const row of data || []) {
      counts[row.parse_status] = (counts[row.parse_status] || 0) + 1;
    }
    return res.status(200).json({ counts, total: data?.length || 0 });
  }

  // ── CLASSIFY: Haiku classification ──
  if (action === "classify") {
    const { fileId, pdfBase64, filename, filePath, fileSize, folderType } = req.body;
    if (!fileId || !pdfBase64) return res.status(400).json({ error: "Missing fileId or pdfBase64" });

    try {
      // Check if already processed
      const { data: existing } = await supabaseAdmin
        .from("ingestion_runs")
        .select("id, parse_status")
        .eq("dropbox_file_id", fileId)
        .single();

      if (existing && !["pending", "error", "classifying", "parsing"].includes(existing.parse_status)) {
        return res.status(200).json({ status: "already_processed", existing });
      }

      // Upsert the ingestion run
      const { data: run, error: upsertErr } = await supabaseAdmin
        .from("ingestion_runs")
        .upsert({
          dropbox_file_id: fileId,
          dropbox_path: filePath || "",
          filename: filename || "unknown.pdf",
          file_size: fileSize || 0,
          folder_type: folderType || "gc",
          parse_status: "classifying",
          updated_at: new Date().toISOString(),
        }, { onConflict: "dropbox_file_id" })
        .select()
        .single();

      if (upsertErr) throw new Error(`DB upsert failed: ${upsertErr.message}`);

      // Haiku classification
      const client = new Anthropic({ apiKey: anthropicKey });
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",  // Using Sonnet for both — Haiku model TBD
        max_tokens: 1000,
        system: CLASSIFY_PROMPT,
        messages: buildClassifyMessages(pdfBase64),
      });

      const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
      const classification = extractJSON(text);

      // Update with classification
      await supabaseAdmin
        .from("ingestion_runs")
        .update({
          classification,
          parse_status: classification.worthFullParse ? "classified" : "skipped",
          proposal_type: classification.documentType,
          company_name: classification.companyName,
          total_bid: classification.totalBid,
          updated_at: new Date().toISOString(),
        })
        .eq("id", run.id);

      return res.status(200).json({ status: "classified", classification, runId: run.id });
    } catch (err) {
      console.error("[batch-parse:classify]", err);
      // Save error
      await supabaseAdmin
        .from("ingestion_runs")
        .update({ parse_status: "error", parse_error: err.message, updated_at: new Date().toISOString() })
        .eq("dropbox_file_id", fileId)
        .catch(() => {});
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PARSE: Sonnet full extraction ──
  if (action === "parse") {
    const { fileId, pdfBase64, docType, folderType } = req.body;
    if (!fileId || !pdfBase64) return res.status(400).json({ error: "Missing fileId or pdfBase64" });

    try {
      // Update status
      await supabaseAdmin
        .from("ingestion_runs")
        .update({ parse_status: "parsing", updated_at: new Date().toISOString() })
        .eq("dropbox_file_id", fileId);

      const effectiveDocType = docType || folderType || "sub_proposal";

      // Sonnet full parse with enhanced prompt
      const client = new Anthropic({ apiKey: anthropicKey });
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system: buildEnhancedParsePrompt(effectiveDocType),
        messages: buildEnhancedParseMessages(pdfBase64, effectiveDocType),
      });

      const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
      const parsedData = extractJSON(text);

      // Update with parsed data
      await supabaseAdmin
        .from("ingestion_runs")
        .update({
          parsed_data: parsedData,
          parse_status: "parsed",
          total_bid: parsedData.totalBid || null,
          company_name: parsedData.subcontractorName || null,
          line_item_count: parsedData.lineItems?.length || 0,
          updated_at: new Date().toISOString(),
        })
        .eq("dropbox_file_id", fileId);

      console.log(
        `[batch-parse:parse] OK fileId=${fileId} total=${parsedData.totalBid} items=${parsedData.lineItems?.length || 0}`,
      );
      return res.status(200).json({ status: "parsed", parsedData });
    } catch (err) {
      console.error("[batch-parse:parse]", err);
      await supabaseAdmin
        .from("ingestion_runs")
        .update({ parse_status: "error", parse_error: err.message, updated_at: new Date().toISOString() })
        .eq("dropbox_file_id", fileId)
        .catch(() => {});
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: "Unknown action. Use: classify, parse, or status" });
}
