# Proposal Extraction Pipeline v2 — Revised Architecture

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Datalab OCR extraction into the existing `ingestion_runs` → Admin Unit Rates → Cost Database pipeline, with org-level API key, user-facing extraction in CORE, and three-tier approval (extracted → user-approved → admin-promoted-to-CORE).

**Architecture:** The extraction pipeline we built (Task 1-8) feeds into the **existing** `ingestion_runs` Supabase table. The existing `AdminUnitRatesPage` already handles approval queues + dedup + push-to-database. We just need to: (1) create a Vercel serverless endpoint that proxies Datalab + AI extraction so the API key stays server-side, (2) move ProposalUploader into CORE, (3) write extraction results to `ingestion_runs`, (4) add "Extraction" tab to CORE nav.

**Key Insight:** The `batch-parse.js` API already does classify → parse → write to `ingestion_runs`. The new pipeline adds a Datalab OCR front-end to that same flow. `AdminUnitRatesPage` already reads from `ingestion_runs`, does dedup against `databaseStore.elements`, lets you approve/reject/edit, and pushes to the cost database.

---

## Current Flow (Dropbox batch import)

```
Dropbox PDF → /api/batch-parse (classify) → ingestion_runs
           → /api/batch-parse (parse)    → ingestion_runs.parsed_data
           → AdminUnitRatesPage          → approve/reject → pushApprovedToDatabase()
```

## New Flow (User upload via CORE)

```
User drops PDF in CORE → /api/extract-proposal
  ├─ Datalab OCR (server-side, org API key)
  ├─ Haiku classify (server-side)
  ├─ Sonnet extract (server-side)
  └─ Write to ingestion_runs (same table)
           → AdminUnitRatesPage (same approval queue)
           → approve/reject → pushApprovedToDatabase()
```

## Three-Tier Approval

| Tier | Who | Where | Action |
|------|-----|-------|--------|
| **Extracted** | System | `ingestion_runs` (status: "parsed") | Auto — pipeline writes here |
| **User-Approved** | Individual user | Their cost DB (`source: "extraction"`) | Future: user clicks "Add to My DB" in CORE results |
| **CORE (master)** | Admin (Matt) | `AdminUnitRatesPage` → `pushApprovedToDatabase()` | Admin reviews, edits, approves → enters master cost DB |

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| **Create:** `app/api/extract-proposal.js` | Vercel serverless endpoint | Proxies Datalab + AI extraction, writes to `ingestion_runs` |
| **Modify:** `app/src/utils/proposalExtractor.js` | Refactor to call `/api/extract-proposal` | Remove client-side Datalab calls, use server endpoint instead |
| **Modify:** `app/src/components/core/CoreNav.jsx` | Add "Extraction" tab | New tab in CORE navigation |
| **Create:** `app/src/components/core/CoreExtraction.jsx` | CORE extraction tab | ProposalUploader + results table + "Add to My DB" action |
| **Modify:** `app/src/pages/CorePage.jsx` | Render CoreExtraction tab | Wire new tab into tab content |
| **Modify:** `app/src/stores/extractionStore.js` | Add persistence | Persist extraction history to IDB |
| **Modify:** `app/src/pages/admin/AdminUnitRatesPage.jsx` | Handle new source | Show extraction source alongside batch-parse source |
| **Remove from:** `app/src/pages/PlanRoomPage.jsx` | Remove ProposalUploader | It now lives in CORE, not per-estimate |
| **Remove from:** `app/src/pages/admin/AdminAIConfigPage.jsx` | Remove Datalab API key field | Key is now server-side env var |
| **Modify:** `app/src/stores/uiStore.js` | Remove `datalabApiKey` from appSettings | Key is org/server level |

---

## Task 1: Server-Side Extraction Endpoint

**Files:**
- Create: `app/api/extract-proposal.js`

This Vercel serverless function handles the full pipeline server-side. The Datalab API key lives in `process.env.DATALAB_API_KEY` (Vercel env var), never sent to the client.

- [ ] **Step 1: Create the endpoint**

```javascript
// app/api/extract-proposal.js
// POST { pdfBase64, filename, folderType } → { status, classification, parsedData, runId }
// Server-side: Datalab OCR + Haiku classify + Sonnet extract + write to ingestion_runs

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const anthropicKey = process.env.ANTHROPIC_API_KEY;
const datalabKey = process.env.DATALAB_API_KEY;
const DATALAB_API_BASE = "https://www.datalab.to/api/v1";

// ── Haiku classification prompt ──
const CLASSIFY_PROMPT = `You are a construction document classifier. Classify this document as exactly ONE of:
- gc_proposal: General contractor proposal with CSI division breakdown
- sub_proposal: Subcontractor proposal for a specific trade
- vendor_quote: Material supplier quote with unit prices
- other: Permits, expediting, insurance, contracts, etc.

Return ONLY JSON:
{
  "documentType": "gc_proposal | sub_proposal | vendor_quote | other",
  "worthFullParse": true/false,
  "companyName": "string",
  "projectName": "string",
  "totalBid": number or null,
  "trade": "string or null",
  "laborType": "open_shop | prevailing_wage | union | unknown",
  "projectZip": "string or null"
}`;

// ── Sonnet extraction prompts (by document type) ──
const EXTRACT_PROMPTS = {
  gc_proposal: `Extract ALL data from this GC proposal. Return JSON:
{
  "projectName": "string",
  "companyName": "string",
  "totalBid": number,
  "projectSF": number or null,
  "laborType": "open_shop | prevailing_wage | union",
  "constructionType": "string or null",
  "lineItems": [
    { "description": "string", "csiCode": "01", "quantity": null, "unit": "SF|LF|EA|LS", "unitPrice": null, "amount": number, "notes": "string" }
  ],
  "markup": { "contingency": number, "generalConditions": number, "fee": number, "insurance": number },
  "exclusions": ["string"],
  "clarifications": ["string"]
}`,

  sub_proposal: `Extract ALL data from this subcontractor proposal. Return JSON:
{
  "subcontractorName": "string",
  "projectName": "string",
  "totalBid": number,
  "trade": "string",
  "csiDivision": "09",
  "drawingDate": "YYYY-MM-DD or null",
  "lineItems": [
    { "description": "string", "csiCode": "09", "quantity": number or null, "unit": "SF|LF|EA|LS", "unitPrice": number or null, "amount": number or null, "notes": "string" }
  ],
  "alternates": [{ "description": "string", "amount": number, "type": "add|deduct" }],
  "exclusions": ["string"]
}`,

  vendor_quote: `Extract ALL data from this vendor quote. Return JSON:
{
  "vendorName": "string",
  "quoteNumber": "string or null",
  "validUntil": "YYYY-MM-DD or null",
  "totalBid": number or null,
  "lineItems": [
    { "description": "string", "csiCode": "06", "quantity": number, "unit": "EA|LF|SF|BF|CY|TON|GAL", "unitPrice": number, "amount": number or null, "specs": "string or null", "leadTime": "string or null" }
  ]
}`
};

function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return {};
}

async function convertWithDatalab(pdfBase64, filename) {
  // Convert base64 to buffer for upload
  const buffer = Buffer.from(pdfBase64, "base64");
  const blob = new Blob([buffer], { type: "application/pdf" });

  const formData = new FormData();
  formData.append("file", blob, filename);
  formData.append("output_format", "markdown");
  formData.append("paginate_output", "true");

  const submitResp = await fetch(`${DATALAB_API_BASE}/marker`, {
    method: "POST",
    headers: { "X-Api-Key": datalabKey },
    body: formData,
  });

  if (!submitResp.ok) {
    throw new Error(`Datalab error ${submitResp.status}: ${await submitResp.text()}`);
  }

  const submitData = await submitResp.json();
  if (submitData.markdown) return submitData;

  // Async polling
  const requestId = submitData.request_id;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const pollResp = await fetch(`${DATALAB_API_BASE}/marker/${requestId}`, {
      headers: { "X-Api-Key": datalabKey },
    });
    if (!pollResp.ok) continue;
    const data = await pollResp.json();
    if (data.status === "complete") return data;
    if (data.status === "error") throw new Error("Datalab conversion failed");
  }
  throw new Error("Datalab timeout");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  // Verify auth
  const auth = req.headers.authorization?.replace("Bearer ", "");
  if (!auth) return res.status(401).json({ error: "No auth token" });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(auth);
  if (authErr || !user) return res.status(401).json({ error: "Invalid token" });

  const { pdfBase64, filename, folderType } = req.body;
  if (!pdfBase64) return res.status(400).json({ error: "Missing pdfBase64" });

  try {
    // Phase 1: Datalab OCR
    const datalabResult = await convertWithDatalab(pdfBase64, filename || "upload.pdf");
    const markdown = datalabResult.markdown || "";

    if (markdown.trim().length < 50) {
      return res.status(200).json({ status: "empty", error: "Document too short or empty" });
    }

    // Phase 2: Haiku classify
    const client = new Anthropic({ apiKey: anthropicKey });
    const classifyResp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: CLASSIFY_PROMPT,
      messages: [{ role: "user", content: `DOCUMENT:\n${markdown.slice(0, 3000)}` }],
    });
    const classifyText = classifyResp.content.filter(b => b.type === "text").map(b => b.text).join("");
    const classification = extractJSON(classifyText);

    // Create ingestion_runs record
    const { data: run, error: insertErr } = await supabaseAdmin
      .from("ingestion_runs")
      .insert({
        filename: filename || "upload.pdf",
        folder_type: folderType || classification.documentType || "gc",
        parse_status: classification.worthFullParse !== false ? "classified" : "skipped",
        classification,
        proposal_type: classification.documentType,
        company_name: classification.companyName,
        total_bid: classification.totalBid,
        source: "extraction_pipeline",  // Distinguish from batch-parse
        uploaded_by: user.id,
        markdown_content: markdown,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

    if (classification.worthFullParse === false || classification.documentType === "other") {
      return res.status(200).json({
        status: "skipped",
        classification,
        runId: run.id,
        reason: "Document classified as non-parseable",
      });
    }

    // Phase 3: Sonnet full extraction
    const extractPrompt = EXTRACT_PROMPTS[classification.documentType] || EXTRACT_PROMPTS.sub_proposal;
    const extractResp = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: extractPrompt,
      messages: [{ role: "user", content: `DOCUMENT:\n${markdown}` }],
    });
    const extractText = extractResp.content.filter(b => b.type === "text").map(b => b.text).join("");
    const parsedData = extractJSON(extractText);

    // Update ingestion_runs with parsed data
    await supabaseAdmin
      .from("ingestion_runs")
      .update({
        parsed_data: parsedData,
        parse_status: "parsed",
        total_bid: parsedData.totalBid || parsedData.totalBid || classification.totalBid,
        company_name: parsedData.companyName || parsedData.subcontractorName || parsedData.vendorName || classification.companyName,
        line_item_count: parsedData.lineItems?.length || 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    return res.status(200).json({
      status: "parsed",
      classification,
      parsedData,
      runId: run.id,
      lineItemCount: parsedData.lineItems?.length || 0,
    });
  } catch (err) {
    console.error("[extract-proposal]", err);
    return res.status(500).json({ error: err.message });
  }
}
```

- [ ] **Step 2: Add DATALAB_API_KEY to Vercel env vars**

Run: `cd app && npx vercel env add DATALAB_API_KEY`
Value: `3hpQLbXatubrDAUGr5tLWUbPvyHWOfZmGc5kuv4S8HE`

- [ ] **Step 3: Verify endpoint exists alongside batch-parse.js**

Run: `ls app/api/extract-proposal.js`

- [ ] **Step 4: Commit**

```bash
git add app/api/extract-proposal.js
git commit -m "feat: add server-side extraction endpoint (Datalab + Haiku + Sonnet → ingestion_runs)"
```

---

## Task 2: Add `ingestion_runs` Columns for Extraction Source

**Files:**
- Supabase migration (via MCP or SQL)

The existing `ingestion_runs` table was designed for Dropbox batch imports. We need a few new columns to support user uploads:

- [ ] **Step 1: Run migration**

```sql
-- Add columns for extraction pipeline source tracking
ALTER TABLE ingestion_runs
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'batch_parse',
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS markdown_content TEXT;

-- Index for filtering by source
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_source ON ingestion_runs(source);

-- Index for user's own uploads
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_uploaded_by ON ingestion_runs(uploaded_by);
```

- [ ] **Step 2: Commit**

```bash
git commit -m "migration: add source, uploaded_by, markdown_content to ingestion_runs"
```

---

## Task 3: Refactor Client-Side Extractor to Use Server Endpoint

**Files:**
- Modify: `app/src/utils/proposalExtractor.js`

Replace the client-side Datalab + AI calls with a single fetch to `/api/extract-proposal`. This removes the Datalab API key from the client entirely.

- [ ] **Step 1: Rewrite proposalExtractor.js**

```javascript
// Proposal Extraction Pipeline — client orchestrator
// Sends PDF to /api/extract-proposal (server handles Datalab + AI + ingestion_runs)

import useExtractionStore from "@/stores/extractionStore";
import { useAuthStore } from "@/stores/authStore";

/**
 * Read a File as base64 string (without the data:... prefix).
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1]; // strip data:application/pdf;base64,
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Run the full extraction pipeline for a single file.
 * Sends to server endpoint which handles Datalab + AI + DB write.
 */
export async function extractProposal(file) {
  const store = useExtractionStore.getState();
  const id = store.enqueue(file, file.name);
  const update = (u) => useExtractionStore.getState().updateEntry(id, u);

  try {
    // Convert file to base64
    update({ status: "uploading", progress: 10 });
    const pdfBase64 = await fileToBase64(file);

    // Get auth token
    const session = useAuthStore.getState().session;
    if (!session?.access_token) {
      update({ status: "error", error: "Not authenticated" });
      return null;
    }

    // Send to server
    update({ status: "converting", progress: 25 });
    const resp = await fetch("/api/extract-proposal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        pdfBase64,
        filename: file.name,
        folderType: "gc", // default, server will reclassify
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
      update({ status: "error", error: err.error || "Server error" });
      return null;
    }

    const result = await resp.json();

    if (result.status === "skipped") {
      update({
        status: "done",
        progress: 100,
        documentType: "other",
        rawExtraction: result.classification,
      });
      return result;
    }

    if (result.status === "parsed") {
      update({
        status: "done",
        progress: 100,
        documentType: result.classification?.documentType,
        rawExtraction: result.parsedData,
        normalized: result, // full server response
      });
      useExtractionStore.getState().setResult(id, result);
      return result;
    }

    update({ status: "error", error: result.error || "Unknown status" });
    return null;
  } catch (err) {
    console.error("[extractProposal] Error:", err);
    update({ status: "error", error: err.message });
    return null;
  }
}

/**
 * Batch extract multiple files with controlled concurrency.
 */
export async function extractProposalBatch(files, concurrency = 2) {
  const results = [];
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(f => extractProposal(f)));
    results.push(...chunkResults);
  }
  return results.filter(Boolean);
}
```

Note: `extractProposal` no longer takes an `apiKey` parameter — the key is server-side.

- [ ] **Step 2: Commit**

```bash
git add app/src/utils/proposalExtractor.js
git commit -m "refactor: move extraction to server endpoint, remove client-side API key"
```

---

## Task 4: CORE Extraction Tab

**Files:**
- Create: `app/src/components/core/CoreExtraction.jsx`
- Modify: `app/src/components/core/CoreNav.jsx` — add tab
- Modify: `app/src/pages/CorePage.jsx` — render tab

- [ ] **Step 1: Create CoreExtraction component**

```jsx
// app/src/components/core/CoreExtraction.jsx
// Extraction tab in CORE — upload proposals, see results, link to Admin approval

import { useCallback, useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { card } from "@/utils/styles";
import useExtractionStore from "@/stores/extractionStore";
import { extractProposal, extractProposalBatch } from "@/utils/proposalExtractor";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

const STATUS_LABELS = {
  pending: "Queued",
  uploading: "Uploading...",
  converting: "Processing...",
  classifying: "Classifying...",
  extracting: "Extracting...",
  normalizing: "Normalizing...",
  done: "Complete",
  error: "Error",
};

const TYPE_LABELS = {
  gc_proposal: "GC Proposal",
  sub_proposal: "Sub Proposal",
  vendor_quote: "Vendor Quote",
  other: "Other",
};

export default function CoreExtraction() {
  const C = useTheme();
  const T = C.T;
  const queue = useExtractionStore(s => s.queue);
  const results = useExtractionStore(s => s.results);
  const clearCompleted = useExtractionStore(s => s.clearCompleted);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(async (files) => {
    const pdfs = Array.from(files).filter(f =>
      f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    if (pdfs.length === 0) return;
    if (pdfs.length === 1) {
      await extractProposal(pdfs[0]);
    } else {
      await extractProposalBatch(pdfs, 2);
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const completedCount = queue.filter(e => e.status === "done").length;
  const errorCount = queue.filter(e => e.status === "error").length;
  const activeCount = queue.filter(e => e.status !== "done" && e.status !== "error").length;

  const resultEntries = useMemo(() => Object.entries(results), [results]);

  return (
    <div>
      {/* Upload Zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => document.getElementById("core-extract-input")?.click()}
        style={{
          ...card(C),
          padding: 40,
          textAlign: "center",
          border: `2px dashed ${dragOver ? C.accent : C.border}`,
          background: dragOver ? `${C.accent}06` : C.bg1,
          cursor: "pointer",
          transition: "all 0.2s",
          marginBottom: 20,
        }}
      >
        <Ic d={I.upload} size={28} color={C.accent} />
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginTop: 12 }}>
          Drop proposal PDFs to extract pricing data
        </div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>
          GC proposals, sub proposals, vendor quotes — extracted via Datalab OCR + NOVA AI
        </div>
        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>
          ~$0.03/page · Results feed into Admin Unit Rates for approval
        </div>
        <input
          id="core-extract-input"
          type="file"
          accept=".pdf"
          multiple
          style={{ display: "none" }}
          onChange={e => { handleFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {/* Queue Status */}
      {queue.length > 0 && (
        <div style={{ ...card(C), padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
              Extraction Queue
              {activeCount > 0 && <span style={{ color: C.accent, marginLeft: 8 }}>{activeCount} processing</span>}
            </div>
            {completedCount > 0 && (
              <button onClick={clearCompleted} style={{
                background: "transparent", border: `1px solid ${C.border}`,
                color: C.textDim, fontSize: 10, padding: "3px 10px",
                borderRadius: 4, cursor: "pointer",
              }}>
                Clear completed
              </button>
            )}
          </div>

          {queue.map(entry => (
            <div key={entry.id} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "8px 0", borderBottom: `1px solid ${C.border}08`,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.fileName}
                </div>
                <div style={{ fontSize: 10, color: entry.status === "error" ? (C.red || "#ef4444") : C.textDim }}>
                  {entry.status === "error" ? entry.error : STATUS_LABELS[entry.status]}
                  {entry.documentType && ` — ${TYPE_LABELS[entry.documentType] || entry.documentType}`}
                </div>
              </div>
              {entry.status !== "done" && entry.status !== "error" && (
                <div style={{ width: 60, height: 4, borderRadius: 2, background: C.bg2 }}>
                  <div style={{ width: `${entry.progress}%`, height: "100%", borderRadius: 2, background: C.accent, transition: "width 0.3s" }} />
                </div>
              )}
              {entry.status === "done" && <Ic d={I.check} size={14} color={C.green || C.accent} />}
              {entry.status === "error" && <Ic d={I.alert || I.x} size={14} color={C.red || "#ef4444"} />}
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {resultEntries.length > 0 && (
        <div style={{ ...card(C), padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 12 }}>
            Extracted Data — {resultEntries.length} document{resultEntries.length !== 1 ? "s" : ""}
          </div>

          {resultEntries.map(([id, result]) => (
            <div key={id} style={{
              padding: 12, borderRadius: 8, background: C.bg1,
              border: `1px solid ${C.border}`, marginBottom: 8,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                    {result.parsedData?.projectName || result.classification?.projectName || "Unknown Project"}
                  </div>
                  <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
                    {TYPE_LABELS[result.classification?.documentType] || "Document"}
                    {result.parsedData?.companyName || result.parsedData?.subcontractorName || result.parsedData?.vendorName
                      ? ` — ${result.parsedData.companyName || result.parsedData.subcontractorName || result.parsedData.vendorName}`
                      : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {result.parsedData?.totalBid && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>
                      ${Number(result.parsedData.totalBid).toLocaleString()}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: C.textMuted }}>
                    {result.lineItemCount || result.parsedData?.lineItems?.length || 0} line items
                  </div>
                </div>
              </div>

              {/* Line items preview (first 5) */}
              {result.parsedData?.lineItems?.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 10, color: C.textDim }}>
                  {result.parsedData.lineItems.slice(0, 5).map((li, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>
                        {li.description}
                      </span>
                      <span style={{ flexShrink: 0, color: C.text, fontWeight: 500 }}>
                        {li.unitPrice ? `$${li.unitPrice}/${li.unit || "EA"}` : li.amount ? `$${Number(li.amount).toLocaleString()}` : ""}
                      </span>
                    </div>
                  ))}
                  {result.parsedData.lineItems.length > 5 && (
                    <div style={{ color: C.textMuted, fontStyle: "italic", marginTop: 2 }}>
                      +{result.parsedData.lineItems.length - 5} more items
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: 8, fontSize: 9, color: C.textMuted }}>
                Saved to ingestion queue — review in Admin → Unit Rates
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {queue.length === 0 && resultEntries.length === 0 && (
        <div style={{ ...card(C), padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: C.textDim }}>
            No extractions yet. Drop a proposal PDF above to start.
          </div>
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 8 }}>
            Extracted unit rates appear in Admin → Unit Rates for approval before entering the cost database.
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add "Extraction" tab to CoreNav**

In `app/src/components/core/CoreNav.jsx`, add to the TABS array:

```javascript
{ key: "extraction", label: "Extraction", icon: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12" },
```

- [ ] **Step 3: Wire tab into CorePage**

In `app/src/pages/CorePage.jsx`, add import and tab content:

```javascript
import CoreExtraction from "@/components/core/CoreExtraction";

// In tabContent object:
extraction: (
  <TabErrorBoundary key="extraction">
    <CoreExtraction />
  </TabErrorBoundary>
),
```

- [ ] **Step 4: Commit**

```bash
git add app/src/components/core/CoreExtraction.jsx app/src/components/core/CoreNav.jsx app/src/pages/CorePage.jsx
git commit -m "feat: add Extraction tab to CORE with upload + results preview"
```

---

## Task 5: Clean Up — Remove PlanRoom Integration + Client API Key

**Files:**
- Modify: `app/src/pages/PlanRoomPage.jsx` — remove ProposalUploader
- Modify: `app/src/pages/admin/AdminAIConfigPage.jsx` — remove Datalab key field
- Modify: `app/src/stores/uiStore.js` — remove `datalabApiKey` from appSettings
- Modify: `app/src/components/widgets/ProposalUploader.jsx` — remove `apiKey` prop usage
- Delete: `app/src/components/widgets/ProposalUploader.jsx` — no longer needed (CoreExtraction replaces it)

- [ ] **Step 1: Remove ProposalUploader from PlanRoomPage**

Revert the import and the card section added in the previous commit.

- [ ] **Step 2: Remove Datalab API key field from AdminAIConfigPage**

Revert the input field added previously.

- [ ] **Step 3: Remove `datalabApiKey` from uiStore appSettings**

- [ ] **Step 4: Delete ProposalUploader.jsx** (replaced by CoreExtraction)

- [ ] **Step 5: Update ProposalUploader import references if any exist**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "cleanup: remove client-side Datalab key + PlanRoom uploader (moved to CORE)"
```

---

## Task 6: Update ProposalUploader Widget for Non-API-Key Usage

**Files:**
- Modify: `app/src/utils/proposalExtractor.js`

The `extractProposal` function signature changed (no more `apiKey` param). Make sure `extractProposalBatch` also doesn't pass it.

Already handled in Task 3. This task is a verification step.

- [ ] **Step 1: Verify no references to `datalabApiKey` remain in client code**

Run: `grep -r "datalabApiKey" app/src/`
Expected: No results.

Run: `grep -r "DATALAB_API" app/src/`
Expected: No results (key is only in `app/api/` server code).

- [ ] **Step 2: Build check**

Run: `cd app && npx vite build`

- [ ] **Step 3: Commit** (if any fixes needed)

---

## Task 7: Enhance AdminUnitRatesPage for Extraction Source

**Files:**
- Modify: `app/src/pages/admin/AdminUnitRatesPage.jsx`

The page already reads from `ingestion_runs`. Items from the extraction pipeline will have `source: "extraction_pipeline"`. Add a visual indicator so you can distinguish batch-parsed items from user-uploaded extractions.

- [ ] **Step 1: Add source badge to item rows**

After `item.company` display, add:

```jsx
{item.source === "extraction_pipeline" && (
  <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: `${C.accent}15`, color: C.accent, fontWeight: 600, marginLeft: 4 }}>
    EXTRACTED
  </span>
)}
```

- [ ] **Step 2: Add source filter option**

Add a source filter dropdown alongside the existing status/CSI filters:

```jsx
const [sourceFilter, setSourceFilter] = useState("all");
// In filter logic:
if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
```

- [ ] **Step 3: Load the source field from ingestion_runs**

Update the Supabase query to include `source`:

```javascript
.select("id, filename, company_name, folder_type, parsed_data, classification, source, uploaded_by")
```

- [ ] **Step 4: Commit**

```bash
git add app/src/pages/admin/AdminUnitRatesPage.jsx
git commit -m "feat: show extraction source badge + filter in Admin Unit Rates"
```

---

## Summary: What Changes

| Before | After |
|--------|-------|
| Datalab API key in user's `appSettings` | `DATALAB_API_KEY` in Vercel env vars (server-side) |
| Client-side Datalab + AI calls | Server endpoint `/api/extract-proposal` handles everything |
| ProposalUploader in PlanRoom (per-estimate) | CoreExtraction tab in CORE (global) |
| Extraction results in ephemeral store | Results written to `ingestion_runs` (Supabase) |
| No approval pipeline | Feeds into existing `AdminUnitRatesPage` approval queue |
| No dedup | Existing `findDbMatches()` handles exact + fuzzy dedup |

## Data Flow Diagram

```
┌─────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  User drops  │────▶│  /api/extract-proposal │────▶│  ingestion_runs  │
│  PDF in CORE │     │  (Vercel serverless)   │     │  (Supabase)      │
└─────────────┘     │                        │     │  source:          │
                    │  1. Datalab OCR         │     │  extraction_      │
                    │  2. Haiku classify      │     │  pipeline         │
                    │  3. Sonnet extract      │     └────────┬─────────┘
                    └──────────────────────────┘              │
                                                             ▼
                    ┌──────────────────────────────────────────┐
                    │  Admin → Unit Rates (existing page)      │
                    │  - See all extracted rates                │
                    │  - Dedup against cost DB                  │
                    │  - Approve / Reject / Edit                │
                    │  - "Push to Database" → master cost DB    │
                    └──────────────────────────────────────────┘
```

## Cost Per Document

| Step | Where | Cost |
|------|-------|------|
| Datalab OCR | Server | ~$0.01/page |
| Haiku classify | Server | ~$0.001 |
| Sonnet extract | Server | ~$0.02/page |
| **Total** | | **~$0.03/page** |
| Storage | Supabase `ingestion_runs` | Included in plan |

## Not In This Plan (Future)

1. **User-tier approval** — User sees extracted rates in CORE and can "Add to My DB" before admin promotes to CORE. Currently all approvals go through admin.
2. **ROM benchmark auto-recalibration** — After N new GC proposals are approved, auto-recalculate BENCHMARKS in romEngine.js.
3. **Extraction history persistence** — Store extraction results in IDB so they survive page navigation.
4. **Rate normalization** — Apply location factors to extracted rates (already exists in `normalizePerSF`).
5. **Batch re-extraction** — Re-run all 160 GC PDFs through the new Datalab pipeline for higher quality extraction.
