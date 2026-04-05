// Vercel Serverless Function — Proposal Extraction Pipeline
// POST { pdfBase64, filename, folderType }
// Pipeline: Datalab OCR -> Haiku classification -> Sonnet extraction -> ingestion_runs write

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin, verifyUser } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";

export const config = {
  api: { bodyParser: { sizeLimit: "50mb" } },
  maxDuration: 300,
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

// ── Datalab OCR: submit PDF and poll for markdown result ──
async function datalabOCR(pdfBase64, filename) {
  const datalabKey = process.env.DATALAB_API_KEY;
  if (!datalabKey) throw new Error("DATALAB_API_KEY not configured");

  // Convert base64 to Buffer and build multipart form
  const pdfBuffer = Buffer.from(pdfBase64, "base64");
  const formData = new FormData();
  formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), filename || "proposal.pdf");
  formData.append("output_format", "markdown");

  // Submit to Datalab
  const submitRes = await fetch("https://www.datalab.to/api/v1/marker", {
    method: "POST",
    headers: { "X-Api-Key": datalabKey },
    body: formData,
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    throw new Error(`Datalab submit failed (${submitRes.status}): ${errText}`);
  }

  const { request_check_url } = await submitRes.json();
  if (!request_check_url) throw new Error("Datalab did not return a request_check_url");

  // Poll for completion (max 60 attempts = 5 min)
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const pollRes = await fetch(request_check_url, {
      headers: { "X-Api-Key": datalabKey },
    });

    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    if (pollData.status === "complete") {
      return pollData.markdown || pollData.output || "";
    }
    if (pollData.status === "error" || pollData.status === "failed") {
      throw new Error(`Datalab OCR failed: ${pollData.error || "unknown error"}`);
    }
    // else still processing — continue polling
  }

  throw new Error("Datalab OCR timed out after 5 minutes");
}

// ── Classification prompt (Haiku) ──
const CLASSIFY_SYSTEM = `You are a construction document classifier. Given the OCR text of a PDF, classify it as one of:
- gc_proposal: A general contractor's bid/proposal (includes full project scope, multiple trades)
- sub_proposal: A subcontractor's bid/proposal (single trade or specialty, submitted to a GC)
- vendor_quote: A material supplier quote or vendor pricing (no labor, just materials/equipment)
- other: Not a construction bid document (cover letters, insurance certs, contracts, etc.)

Respond with ONLY a valid JSON object:
{
  "documentType": "gc_proposal" | "sub_proposal" | "vendor_quote" | "other",
  "confidence": number (0-1),
  "companyName": "string" | null,
  "projectName": "string" | null,
  "totalBid": number | null,
  "tradeDivisions": ["string"],
  "reasoning": "string (1 sentence)"
}`;

// ── Extraction prompts (Sonnet) — doc-type-specific ──
function buildExtractionPrompt(docType) {
  const baseRules = `EXTRACTION RULES:
- Only extract information explicitly stated in the document
- Do not infer or guess values
- For monetary amounts, extract the number only (no currency symbols)
- For CSI codes, use the 2-digit division code (e.g., "03" for concrete, "09" for finishes)
- If a line item clearly maps to a CSI division, include the code; otherwise use null
- Extract EVERY line item, even if it lacks a price
- For notes, include any relevant qualifications, conditions, or scope clarifications`;

  const typeGuidance = {
    gc_proposal: `This is a GENERAL CONTRACTOR proposal. It typically contains:
- Multiple trade divisions with subtotals
- General conditions, overhead & profit as separate line items
- Project-wide inclusions/exclusions
- Bond and insurance references
Group line items by trade division when possible.`,
    sub_proposal: `This is a SUBCONTRACTOR proposal. It typically contains:
- A single trade or specialty scope
- Labor + material breakdown (sometimes combined)
- Alternates or options
- Scope-specific exclusions
Focus on granular line items within the specialty.`,
    vendor_quote: `This is a VENDOR/MATERIAL QUOTE. It typically contains:
- Material descriptions with quantities and unit prices
- Delivery terms and lead times
- Minimum order quantities
- Price validity periods
Focus on individual material line items with precise quantities and pricing.`,
    other: `This document may not be a standard bid. Extract whatever structured data is available.`,
  };

  return `You are a construction proposal data extraction specialist. You parse OCR text from construction bid documents into structured JSON.

${typeGuidance[docType] || typeGuidance.other}

${baseRules}

OUTPUT FORMAT: Respond with ONLY a valid JSON object, no explanation.

JSON SCHEMA:
{
  "subcontractorName": "string" | null,
  "projectName": "string" | null,
  "totalBid": number | null,
  "lineItems": [
    {
      "description": "string",
      "csiCode": "string (2-digit)" | null,
      "quantity": number | null,
      "unit": "string" | null,
      "unitPrice": number | null,
      "amount": number | null,
      "notes": "string" | null
    }
  ],
  "inclusions": ["string"],
  "exclusions": ["string"],
  "alternates": [
    {
      "description": "string",
      "amount": number | null,
      "type": "add" | "deduct" | null
    }
  ],
  "qualifications": ["string"],
  "paymentTerms": "string" | null,
  "validityPeriod": "string" | null,
  "bondIncluded": boolean | null,
  "proposalDate": "string" | null
}`;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!supabaseAdmin) return res.status(500).json({ error: "Database not configured" });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: "AI service not configured" });

  const { pdfBase64, filename, folderType } = req.body || {};
  if (!pdfBase64) return res.status(400).json({ error: "Missing pdfBase64" });

  const effectiveFilename = filename || "proposal.pdf";
  const effectiveFolderType = folderType || "gc";

  let runId = null;

  try {
    // ── Step 1: Create ingestion_runs record ──
    const { data: run, error: insertErr } = await supabaseAdmin
      .from("ingestion_runs")
      .insert({
        filename: effectiveFilename,
        folder_type: effectiveFolderType,
        parse_status: "ocr_processing",
        source: "extraction_pipeline",
        uploaded_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);
    runId = run.id;

    // ── Step 2: Datalab OCR ──
    console.log(`[extract-proposal] OCR start: ${effectiveFilename} (run=${runId})`);
    const markdownText = await datalabOCR(pdfBase64, effectiveFilename);

    if (!markdownText || markdownText.trim().length < 50) {
      await supabaseAdmin
        .from("ingestion_runs")
        .update({ parse_status: "error", parse_error: "OCR returned insufficient text", updated_at: new Date().toISOString() })
        .eq("id", runId);
      return res.status(200).json({ status: "ocr_failed", error: "OCR returned insufficient text", runId });
    }

    // Update status
    await supabaseAdmin
      .from("ingestion_runs")
      .update({ parse_status: "classifying", updated_at: new Date().toISOString() })
      .eq("id", runId);

    // ── Step 3: Haiku classification ──
    const client = new Anthropic({ apiKey: anthropicKey });

    const classifyRes = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: CLASSIFY_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Classify this construction document:\n\n${markdownText.slice(0, 8000)}`,
        },
      ],
    });

    const classifyText = classifyRes.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const classification = extractJSON(classifyText);

    // Update with classification
    await supabaseAdmin
      .from("ingestion_runs")
      .update({
        classification,
        proposal_type: classification.documentType,
        company_name: classification.companyName,
        total_bid: classification.totalBid,
        parse_status: "extracting",
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);

    // ── Step 4: Sonnet extraction ──
    const docType = classification.documentType || effectiveFolderType;

    const extractRes = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: buildExtractionPrompt(docType),
      messages: [
        {
          role: "user",
          content: `Extract all structured data from this ${docType} document:\n\n${markdownText}`,
        },
      ],
    });

    const extractText = extractRes.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsedData = extractJSON(extractText);

    // ── Step 5: Write final results to ingestion_runs ──
    const lineItemCount = parsedData.lineItems?.length || 0;

    await supabaseAdmin
      .from("ingestion_runs")
      .update({
        parsed_data: parsedData,
        parse_status: "parsed",
        total_bid: parsedData.totalBid || classification.totalBid || null,
        company_name: parsedData.subcontractorName || classification.companyName || null,
        line_item_count: lineItemCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);

    console.log(
      `[extract-proposal] OK file=${effectiveFilename} type=${docType} total=${parsedData.totalBid} items=${lineItemCount} (run=${runId})`,
    );

    return res.status(200).json({
      status: "parsed",
      classification,
      parsedData,
      runId,
      lineItemCount,
    });
  } catch (err) {
    console.error("[extract-proposal]", err);

    // Save error to run record if we have one
    if (runId) {
      await supabaseAdmin
        .from("ingestion_runs")
        .update({ parse_status: "error", parse_error: err.message, updated_at: new Date().toISOString() })
        .eq("id", runId)
        .catch(() => {});
    }

    return res.status(500).json({ error: err.message });
  }
}
