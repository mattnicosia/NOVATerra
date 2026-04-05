# Proposal Extraction Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract structured pricing data ($/SF, material costs, unit rates) from GC proposals, subcontractor proposals, and vendor quotes via Datalab OCR + AI interpretation, feeding directly into NOVATerra's cost database and ROM benchmarks.

**Architecture:** PDF → Datalab API (markdown) → Document classifier (Haiku) → Type-specific extractor (Sonnet) → Normalizer → NOVATerra data shapes. The pipeline reuses the existing `callAnthropic()` AI util and outputs data compatible with `extracted-proposals.js` format + a new `extractedRates` shape for the cost database.

**Tech Stack:** Datalab `/api/v1/marker` API, Claude Haiku (classification), Claude Sonnet (extraction), existing Zustand stores, IndexedDB persistence.

---

## File Structure

| File | Responsibility |
|------|----------------|
| **Create:** `app/src/utils/proposalExtractor.js` | Core pipeline orchestrator — PDF upload → Datalab → classify → extract → normalize |
| **Create:** `app/src/utils/proposalClassifier.js` | Haiku-powered document type classification (GC proposal, sub proposal, vendor quote, other) |
| **Create:** `app/src/utils/proposalSchemas.js` | Extraction prompt templates + output schemas for each document type |
| **Create:** `app/src/utils/proposalNormalizer.js` | Convert raw AI extraction to NOVATerra data shapes (proposal format + rate format) |
| **Create:** `app/src/stores/extractionStore.js` | Zustand store for extraction queue, status, results, and history |
| **Create:** `app/src/components/widgets/ProposalUploader.jsx` | Drag-and-drop upload UI with extraction progress and results preview |
| **Create:** `app/src/test/integration/proposalExtraction.test.js` | Integration tests with fixture markdown (no API calls) |
| **Modify:** `app/src/constants/masterCostDb.js` | Accept extracted rates as a new source tier |
| **Modify:** `app/src/data/extracted-proposals.js` | Append newly extracted proposals (or migrate to IDB) |

---

## Document Types & What We Extract

### 1. GC Proposal (e.g., 200 Petit Ave — Kulka Group)
- **Total cost** and **$/SF**
- **CSI division breakdown** (division code → cost, % of total, $/SF)
- **Markup structure** (OH&P, contingency, insurance, GC/bond)
- **Project metadata** (SF, building type, labor type, work type)
- **Exclusions/clarifications** (text array)

### 2. Subcontractor Proposal (e.g., Goodwill — Swift Construction)
- **Trade** and **CSI division**
- **Line items** with descriptions, quantities, units
- **Unit rates** when available ($/SF, $/LF, $/EA)
- **Material vs labor split** when itemized
- **Alternates** with pricing
- **Total cost** per trade scope

### 3. Vendor/Material Quote
- **Material items** with unit prices
- **Quantities and units** (EA, LF, SF, CY, etc.)
- **Lead times** when stated
- **Validity period**
- **Delivery terms**

---

## Task 1: Extraction Store

**Files:**
- Create: `app/src/stores/extractionStore.js`

This store tracks the extraction queue, in-progress status, and results. Lightweight — results get pushed to estimatesStore/databaseStore after user review.

- [ ] **Step 1: Create the store**

```javascript
// app/src/stores/extractionStore.js
import { create } from "zustand";
import { uid } from "@/utils/format";

const useExtractionStore = create((set, get) => ({
  // Queue of files being processed
  queue: [],
  // Map of extractionId -> result
  results: {},
  // Currently active extraction for preview
  activeExtractionId: null,

  // ── Actions ──────────────────────────────────────────────
  enqueue: (file, fileName) => {
    const id = uid();
    const entry = {
      id,
      fileName,
      file,           // File object or null if URL-based
      status: "pending",  // pending | uploading | converting | classifying | extracting | normalizing | done | error
      progress: 0,
      documentType: null,  // gc-proposal | sub-proposal | vendor-quote | other
      markdown: null,
      rawExtraction: null,
      normalized: null,
      error: null,
      createdAt: new Date().toISOString(),
    };
    set(state => ({ queue: [...state.queue, entry] }));
    return id;
  },

  updateEntry: (id, updates) => {
    set(state => ({
      queue: state.queue.map(e => e.id === id ? { ...e, ...updates } : e),
    }));
  },

  setResult: (id, result) => {
    set(state => ({
      results: { ...state.results, [id]: result },
    }));
  },

  removeEntry: (id) => {
    set(state => ({
      queue: state.queue.filter(e => e.id !== id),
      results: Object.fromEntries(
        Object.entries(state.results).filter(([k]) => k !== id)
      ),
    }));
  },

  setActiveExtractionId: (id) => set({ activeExtractionId: id }),

  clearCompleted: () => {
    set(state => ({
      queue: state.queue.filter(e => e.status !== "done" && e.status !== "error"),
    }));
  },
}));

export default useExtractionStore;
```

- [ ] **Step 2: Verify store imports work**

Run: `cd app && npx vite build 2>&1 | head -20`
Expected: No import errors related to extractionStore.

- [ ] **Step 3: Commit**

```bash
git add app/src/stores/extractionStore.js
git commit -m "feat: add extractionStore for proposal extraction pipeline"
```

---

## Task 2: Document Classifier

**Files:**
- Create: `app/src/utils/proposalClassifier.js`

Uses Haiku (~$0.001/classification) to categorize the document from its first ~2000 chars of markdown. Returns one of: `gc-proposal`, `sub-proposal`, `vendor-quote`, `other`.

- [ ] **Step 1: Create the classifier**

```javascript
// app/src/utils/proposalClassifier.js
import { callAnthropic } from "@/utils/ai";

const CLASSIFICATION_PROMPT = `You are a construction document classifier. Given the first portion of a document converted to markdown, classify it as exactly ONE of:

- gc-proposal: A general contractor's proposal or budget estimate with multiple CSI divisions, total project cost, and typically includes markup (OH&P, contingency, insurance). Contains division-level breakdowns.
- sub-proposal: A subcontractor's proposal for a specific trade scope (drywall, electrical, plumbing, etc.). Contains line items for one trade, may include material/labor splits.
- vendor-quote: A material supplier quote with itemized products, unit prices, quantities. No labor included.
- other: Permit applications, expediting services, insurance certificates, bonds, contracts, or anything that is not a cost proposal.

Respond with ONLY a JSON object:
{
  "type": "gc-proposal" | "sub-proposal" | "vendor-quote" | "other",
  "confidence": 0.0-1.0,
  "reasoning": "one sentence why"
}`;

/**
 * Classify a document from its markdown content.
 * Uses first 2500 chars to minimize token cost.
 * @param {string} markdown - Full markdown from Datalab
 * @returns {Promise<{type: string, confidence: number, reasoning: string}>}
 */
export async function classifyDocument(markdown) {
  const snippet = markdown.slice(0, 2500);

  const response = await callAnthropic({
    model: "haiku",
    messages: [
      { role: "user", content: `${CLASSIFICATION_PROMPT}\n\n---\nDOCUMENT:\n${snippet}` },
    ],
    max_tokens: 200,
    temperature: 0,
  });

  try {
    const text = response?.content?.[0]?.text || response;
    const jsonMatch = typeof text === "string"
      ? text.match(/\{[\s\S]*\}/)
      : null;
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("[classifier] Parse error:", e);
  }

  return { type: "other", confidence: 0, reasoning: "Failed to classify" };
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/utils/proposalClassifier.js
git commit -m "feat: add Haiku-powered document classifier for proposal extraction"
```

---

## Task 3: Extraction Schemas & Prompts

**Files:**
- Create: `app/src/utils/proposalSchemas.js`

Type-specific Sonnet prompts that extract structured data. Each prompt returns JSON matching the target schema. This is the core intelligence layer.

- [ ] **Step 1: Create the schemas file**

```javascript
// app/src/utils/proposalSchemas.js

// ─── GC Proposal Extraction ──────────────────────────────────────
export const GC_PROPOSAL_PROMPT = `You are a construction estimating data extractor. Extract structured data from this GC (general contractor) proposal.

RULES:
- Extract ALL CSI division line items with their costs
- Division codes are 2-digit (01-48) or extended (01.3113)
- If a $/SF column exists, extract it. If projectSF is stated, calculate it: cost / SF
- Extract markup items separately (OH&P, contingency, insurance, bond, GC fee)
- Costs should be numbers (no $ signs, no commas)
- If you can determine projectSF from the data (e.g., from a Cost/SF column and totals), include it
- Extract exclusions and clarifications as text arrays

Return ONLY valid JSON matching this schema:
{
  "projectName": "string",
  "contractor": "string — company name",
  "client": "string — who it's addressed to",
  "date": "YYYY-MM-DD",
  "address": "string or null",
  "projectSF": number or null,
  "totalCost": number,
  "directCost": number or null,
  "laborType": "open_shop | prevailing_wage | union | unknown",
  "constructionType": "string or null — e.g. Type V wood-frame",
  "divisions": [
    {
      "code": "01.3113",
      "division": "01",
      "label": "Project Coordination & Permits",
      "cost": 20000,
      "costPerSF": 1.04 or null,
      "percentOfTotal": 0.29 or null
    }
  ],
  "markup": {
    "contingency": { "percent": 5, "cost": 284299 },
    "generalConditions": { "percent": null, "cost": 477622 },
    "fee": { "percent": null, "cost": 322395 },
    "insurance": { "percent": null, "cost": 236960 },
    "bond": null,
    "overheadAndProfit": null
  },
  "exclusions": ["string array of exclusion items"],
  "clarifications": ["string array of clarification items"],
  "alternates": [
    { "description": "string", "cost": number, "type": "add | deduct" }
  ]
}`;

// ─── Sub Proposal Extraction ──────────────────────────────────────
export const SUB_PROPOSAL_PROMPT = `You are a construction estimating data extractor. Extract structured data from this subcontractor proposal.

RULES:
- Identify the trade/scope (drywall, electrical, plumbing, etc.)
- Map to CSI division (2-digit code)
- Extract individual line items with quantities and units when available
- If material and labor are broken out separately, capture both
- Unit rates: if a line item has quantity + unit + price, calculate unit rate
- Alternates/add-ons should be listed separately
- Costs should be numbers (no $ signs, no commas)

Return ONLY valid JSON:
{
  "projectName": "string",
  "subcontractor": "string — company name",
  "client": "string — who it's addressed to (usually GC)",
  "date": "YYYY-MM-DD",
  "trade": "string — primary trade name",
  "csiDivision": "09",
  "totalCost": number,
  "drawingDate": "YYYY-MM-DD or null — drawing revision date referenced",
  "lineItems": [
    {
      "description": "Furnish and install drywall partitions @ 12ft high",
      "quantity": number or null,
      "unit": "SF | LF | EA | LS | CY | SY | HR | DY | WK | MO | null",
      "unitRate": number or null,
      "material": number or null,
      "labor": number or null,
      "total": number or null,
      "notes": "string or null — specs like 5/8 gypsum, metal framing"
    }
  ],
  "alternates": [
    { "description": "string", "cost": number, "type": "add | deduct" }
  ],
  "inclusions": ["string array"],
  "exclusions": ["string array"]
}`;

// ─── Vendor Quote Extraction ──────────────────────────────────────
export const VENDOR_QUOTE_PROMPT = `You are a construction material pricing extractor. Extract structured data from this vendor/supplier quote.

RULES:
- Extract each material item with unit price and quantity
- Include product specifications (size, grade, finish, model number)
- Capture delivery terms and lead times
- Costs should be numbers (no $ signs, no commas)

Return ONLY valid JSON:
{
  "vendor": "string — company name",
  "client": "string — who it's addressed to",
  "date": "YYYY-MM-DD",
  "quoteNumber": "string or null",
  "validUntil": "YYYY-MM-DD or null",
  "items": [
    {
      "description": "2x6 SPF #2 Stud 8ft",
      "specs": "string or null — size, grade, model, finish",
      "quantity": number or null,
      "unit": "EA | BF | LF | SF | CY | TON | GAL | null",
      "unitPrice": number,
      "extendedPrice": number or null,
      "csiDivision": "06 — best-guess CSI division",
      "leadTime": "string or null — e.g. 2-3 weeks"
    }
  ],
  "delivery": "string or null — delivery terms/costs",
  "totalCost": number or null,
  "notes": ["string array"]
}`;

/**
 * Get the appropriate extraction prompt for a document type.
 */
export function getExtractionPrompt(documentType) {
  switch (documentType) {
    case "gc-proposal": return GC_PROPOSAL_PROMPT;
    case "sub-proposal": return SUB_PROPOSAL_PROMPT;
    case "vendor-quote": return VENDOR_QUOTE_PROMPT;
    default: return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/utils/proposalSchemas.js
git commit -m "feat: add extraction prompt schemas for GC/sub/vendor documents"
```

---

## Task 4: Normalizer — Raw Extraction → NOVATerra Data Shapes

**Files:**
- Create: `app/src/utils/proposalNormalizer.js`

Converts raw AI extraction output into two NOVATerra-compatible formats:
1. **Proposal format** — matches `extracted-proposals.js` shape for ROM benchmarks
2. **Rate format** — individual unit rates for cost database enrichment

- [ ] **Step 1: Create the normalizer**

```javascript
// app/src/utils/proposalNormalizer.js

import { uid } from "@/utils/format";

// ─── Job type inference from document context ────────────────────
const JOB_TYPE_KEYWORDS = {
  "residential-single": ["single family", "house", "residence", "home", "sfr"],
  "residential-multi": ["multi-family", "apartment", "condo", "townhouse", "unit", "dwelling"],
  "commercial-office": ["office", "commercial", "workspace", "cowork"],
  retail: ["retail", "store", "shop", "tenant improvement", "build out", "buildout", "ti"],
  restaurant: ["restaurant", "kitchen", "dining", "food", "bar", "cafe"],
  industrial: ["warehouse", "industrial", "manufacturing", "distribution"],
  healthcare: ["medical", "hospital", "clinic", "dental", "healthcare"],
  hospitality: ["hotel", "motel", "hospitality", "lodge"],
  education: ["school", "education", "university", "classroom"],
  "mixed-use": ["mixed-use", "mixed use"],
};

function inferJobType(text) {
  const lower = (text || "").toLowerCase();
  for (const [type, keywords] of Object.entries(JOB_TYPE_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return type;
  }
  return "commercial-office"; // safe default
}

function inferLaborType(raw) {
  const labor = (raw.laborType || "").toLowerCase();
  if (labor.includes("prevailing") || labor.includes("union")) return "prevailing";
  if (labor.includes("open")) return "open_shop";
  return "open_shop";
}

// ─── GC Proposal → NOVATerra Proposal Shape ─────────────────────
export function normalizeGCProposal(raw, sourceFileName) {
  const divisions = {};
  for (const div of raw.divisions || []) {
    const divCode = (div.division || div.code?.slice(0, 2) || "00").padStart(2, "0");
    divisions[divCode] = (divisions[divCode] || 0) + (div.cost || 0);
  }

  // Extract $/SF data for rate enrichment
  const sfRates = [];
  if (raw.projectSF && raw.projectSF > 0) {
    for (const div of raw.divisions || []) {
      const divCode = (div.division || div.code?.slice(0, 2) || "00").padStart(2, "0");
      const costPerSF = div.costPerSF || (div.cost / raw.projectSF);
      sfRates.push({
        id: uid(),
        division: divCode,
        code: div.code || divCode,
        label: div.label,
        costPerSF: Math.round(costPerSF * 100) / 100,
        totalCost: div.cost,
        source: "gc-proposal",
        sourceFile: sourceFileName,
        projectSF: raw.projectSF,
        date: raw.date,
      });
    }
  }

  const proposal = {
    projectName: raw.projectName || sourceFileName,
    client: raw.contractor || raw.client || null,
    architect: null,
    totalCost: raw.totalCost || 0,
    projectSF: raw.projectSF || null,
    jobType: inferJobType(raw.projectName + " " + (raw.constructionType || "")),
    workType: "new-construction", // can be refined
    laborType: inferLaborType(raw),
    address: raw.address || null,
    date: raw.date || new Date().toISOString().slice(0, 10),
    divisions,
    source: "pdf",
    sourceFileName: sourceFileName || "unknown.pdf",
    extractionConfidence: "high",
    extractionNotes: `Auto-extracted via Datalab + Sonnet. ${(raw.divisions || []).length} division line items. ${raw.exclusions?.length || 0} exclusions.`,
  };

  const markup = {};
  if (raw.markup) {
    for (const [key, val] of Object.entries(raw.markup)) {
      if (val && typeof val === "object" && val.cost) {
        markup[key] = { percent: val.percent || null, cost: val.cost };
      }
    }
  }

  return { proposal, sfRates, markup, exclusions: raw.exclusions || [], clarifications: raw.clarifications || [], alternates: raw.alternates || [] };
}

// ─── Sub Proposal → Line Items + Unit Rates ─────────────────────
export function normalizeSubProposal(raw, sourceFileName) {
  const division = (raw.csiDivision || "00").padStart(2, "0");

  // Convert line items to estimate-compatible format
  const items = (raw.lineItems || []).map(li => ({
    id: uid(),
    code: `${division}.0000`,
    description: li.description,
    division,
    quantity: li.quantity || 1,
    unit: li.unit || "LS",
    material: li.material || 0,
    labor: li.labor || 0,
    equipment: 0,
    subcontractor: li.total || (li.material || 0) + (li.labor || 0),
    trade: raw.trade || "general",
    notes: li.notes || "",
    source: { category: "extraction", label: sourceFileName },
    novaProposed: true,
  }));

  // Extract unit rates for cost database
  const unitRates = (raw.lineItems || [])
    .filter(li => li.unitRate && li.unit)
    .map(li => ({
      id: uid(),
      description: li.description,
      division,
      trade: raw.trade || "general",
      unit: li.unit,
      unitRate: li.unitRate,
      material: li.material || null,
      labor: li.labor || null,
      source: "sub-proposal",
      sourceFile: sourceFileName,
      subcontractor: raw.subcontractor,
      date: raw.date,
    }));

  const proposal = {
    projectName: raw.projectName || sourceFileName,
    client: raw.subcontractor || null,
    architect: null,
    totalCost: raw.totalCost || 0,
    projectSF: null,
    jobType: inferJobType(raw.projectName || ""),
    workType: "renovation",
    laborType: "open_shop",
    address: null,
    date: raw.date || new Date().toISOString().slice(0, 10),
    divisions: { [division]: raw.totalCost || 0 },
    source: "pdf",
    sourceFileName: sourceFileName || "unknown.pdf",
    proposalType: "sub",
    extractionConfidence: "high",
    extractionNotes: `Sub proposal: ${raw.trade}. ${items.length} line items, ${unitRates.length} unit rates extracted.`,
  };

  return { proposal, items, unitRates, alternates: raw.alternates || [] };
}

// ─── Vendor Quote → Material Rates ──────────────────────────────
export function normalizeVendorQuote(raw, sourceFileName) {
  const materialRates = (raw.items || []).map(item => ({
    id: uid(),
    description: item.description,
    specs: item.specs || null,
    division: (item.csiDivision || "00").padStart(2, "0"),
    unit: item.unit || "EA",
    unitPrice: item.unitPrice || 0,
    quantity: item.quantity || null,
    extendedPrice: item.extendedPrice || null,
    vendor: raw.vendor,
    quoteNumber: raw.quoteNumber || null,
    validUntil: raw.validUntil || null,
    leadTime: item.leadTime || null,
    source: "vendor-quote",
    sourceFile: sourceFileName,
    date: raw.date || new Date().toISOString().slice(0, 10),
  }));

  return { materialRates, vendor: raw.vendor, totalCost: raw.totalCost };
}

/**
 * Normalize raw extraction based on document type.
 */
export function normalizeExtraction(documentType, rawExtraction, sourceFileName) {
  switch (documentType) {
    case "gc-proposal": return { type: "gc-proposal", ...normalizeGCProposal(rawExtraction, sourceFileName) };
    case "sub-proposal": return { type: "sub-proposal", ...normalizeSubProposal(rawExtraction, sourceFileName) };
    case "vendor-quote": return { type: "vendor-quote", ...normalizeVendorQuote(rawExtraction, sourceFileName) };
    default: return { type: "other", raw: rawExtraction };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/utils/proposalNormalizer.js
git commit -m "feat: add normalizer to convert raw extraction to NOVATerra data shapes"
```

---

## Task 5: Core Pipeline Orchestrator

**Files:**
- Create: `app/src/utils/proposalExtractor.js`

The main pipeline: file → Datalab → classify → extract → normalize. Coordinates everything and updates extractionStore along the way.

- [ ] **Step 1: Create the orchestrator**

```javascript
// app/src/utils/proposalExtractor.js

import useExtractionStore from "@/stores/extractionStore";
import { classifyDocument } from "@/utils/proposalClassifier";
import { getExtractionPrompt } from "@/utils/proposalSchemas";
import { normalizeExtraction } from "@/utils/proposalNormalizer";
import { callAnthropic } from "@/utils/ai";

const DATALAB_API_BASE = "https://www.datalab.to/api/v1";

/**
 * Upload a PDF to Datalab and get markdown back.
 * @param {File} file - PDF file object
 * @param {string} apiKey - Datalab API key
 * @returns {Promise<{markdown: string, images: object, metadata: object}>}
 */
async function convertWithDatalab(file, apiKey) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("output_format", "markdown");
  formData.append("paginate_output", "true");
  formData.append("force_ocr", "false");

  const submitResp = await fetch(`${DATALAB_API_BASE}/marker`, {
    method: "POST",
    headers: { "X-Api-Key": apiKey },
    body: formData,
  });

  if (!submitResp.ok) {
    const err = await submitResp.text();
    throw new Error(`Datalab upload failed (${submitResp.status}): ${err}`);
  }

  const submitData = await submitResp.json();

  // If synchronous response
  if (submitData.markdown) return submitData;

  // Async — poll for results
  const requestId = submitData.request_id;
  if (!requestId) throw new Error("No request_id returned from Datalab");

  const maxPolls = 120;
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, 5000));

    const pollResp = await fetch(`${DATALAB_API_BASE}/marker/${requestId}`, {
      headers: { "X-Api-Key": apiKey },
    });

    if (!pollResp.ok) continue;

    const pollData = await pollResp.json();
    if (pollData.status === "complete") return pollData;
    if (pollData.status === "error") throw new Error(`Datalab conversion failed: ${JSON.stringify(pollData)}`);
  }

  throw new Error("Datalab conversion timed out after 10 minutes");
}

/**
 * Run Sonnet extraction using the appropriate prompt for the document type.
 */
async function extractStructuredData(markdown, documentType) {
  const prompt = getExtractionPrompt(documentType);
  if (!prompt) return null;

  const response = await callAnthropic({
    model: "sonnet",
    messages: [
      { role: "user", content: `${prompt}\n\n---\nDOCUMENT:\n${markdown}` },
    ],
    max_tokens: 4096,
    temperature: 0,
  });

  try {
    const text = response?.content?.[0]?.text || response;
    const jsonMatch = typeof text === "string" ? text.match(/\{[\s\S]*\}/) : null;
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("[extractor] JSON parse error:", e);
  }

  return null;
}

/**
 * Run the full extraction pipeline for a single file.
 * @param {File} file - PDF file object
 * @param {string} datalabApiKey - Datalab API key
 * @returns {Promise<object>} Normalized extraction result
 */
export async function extractProposal(file, datalabApiKey) {
  const store = useExtractionStore.getState();
  const id = store.enqueue(file, file.name);
  const update = (u) => useExtractionStore.getState().updateEntry(id, u);

  try {
    // Phase 1: Convert PDF → Markdown via Datalab
    update({ status: "converting", progress: 10 });
    const datalabResult = await convertWithDatalab(file, datalabApiKey);
    const markdown = datalabResult.markdown;

    if (!markdown || markdown.trim().length < 50) {
      update({ status: "error", error: "Datalab returned empty or very short content" });
      return null;
    }

    update({ status: "classifying", progress: 30, markdown });

    // Phase 2: Classify document type via Haiku
    const classification = await classifyDocument(markdown);
    update({ documentType: classification.type, progress: 45 });

    if (classification.type === "other") {
      update({ status: "done", progress: 100, rawExtraction: { classification } });
      return { type: "other", classification, markdown };
    }

    // Phase 3: Extract structured data via Sonnet
    update({ status: "extracting", progress: 55 });
    const rawExtraction = await extractStructuredData(markdown, classification.type);

    if (!rawExtraction) {
      update({ status: "error", error: "Sonnet extraction returned no parseable JSON" });
      return null;
    }

    update({ status: "normalizing", progress: 80, rawExtraction });

    // Phase 4: Normalize to NOVATerra shapes
    const normalized = normalizeExtraction(classification.type, rawExtraction, file.name);

    update({ status: "done", progress: 100, normalized });
    useExtractionStore.getState().setResult(id, normalized);

    return normalized;

  } catch (err) {
    console.error("[extractProposal] Pipeline error:", err);
    update({ status: "error", error: err.message });
    return null;
  }
}

/**
 * Batch extract multiple files.
 */
export async function extractProposalBatch(files, datalabApiKey, concurrency = 2) {
  const results = [];
  const chunks = [];
  for (let i = 0; i < files.length; i += concurrency) {
    chunks.push(files.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(file => extractProposal(file, datalabApiKey))
    );
    results.push(...chunkResults);
  }

  return results.filter(Boolean);
}
```

- [ ] **Step 2: Verify build**

Run: `cd app && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/src/utils/proposalExtractor.js
git commit -m "feat: add proposal extraction pipeline orchestrator (Datalab + Haiku + Sonnet)"
```

---

## Task 6: Integration Tests

**Files:**
- Create: `app/src/test/integration/proposalExtraction.test.js`

Tests the normalizer and classifier logic using fixture markdown (no real API calls). The Datalab and AI calls are mocked.

- [ ] **Step 1: Create test fixtures and tests**

```javascript
// app/src/test/integration/proposalExtraction.test.js
import { describe, it, expect } from "vitest";
import { normalizeGCProposal, normalizeSubProposal, normalizeVendorQuote } from "@/utils/proposalNormalizer";

// ─── Fixture: Raw GC extraction (simulates Sonnet output) ──────
const GC_RAW = {
  projectName: "200 Petit Ave",
  contractor: "The Kulka Group",
  client: "AVGI",
  date: "2025-03-06",
  address: "200 Petit Ave, Bellmore, NY",
  projectSF: 19310,
  totalCost: 7007251,
  directCost: 5685976,
  laborType: "open_shop",
  constructionType: "Type V wood-frame",
  divisions: [
    { code: "01.3113", division: "01", label: "Project Coordination & Permits", cost: 20000, costPerSF: 1.04 },
    { code: "02.1000", division: "02", label: "Demolition", cost: 116598, costPerSF: 6.04 },
    { code: "03.1000", division: "03", label: "Concrete", cost: 141839, costPerSF: 7.35 },
    { code: "03.3370", division: "03", label: "Concrete Topping", cost: 63435, costPerSF: 3.29 },
    { code: "09.2300", division: "09", label: "Drywall & Carpentry", cost: 274821, costPerSF: 14.23 },
    { code: "26.0000", division: "26", label: "Electric", cost: 424010, costPerSF: 21.96 },
  ],
  markup: {
    contingency: { percent: 5, cost: 284299 },
    generalConditions: { percent: null, cost: 477622 },
    fee: { percent: null, cost: 322395 },
    insurance: { percent: null, cost: 236960 },
  },
  exclusions: ["No FF&E", "No winter conditions"],
  clarifications: ["Budget valid 30 days"],
};

// ─── Fixture: Raw sub extraction ────────────────────────────────
const SUB_RAW = {
  projectName: "Goodwill RFP Build Out",
  subcontractor: "Swift Construction LLC",
  client: "Tener Contracting",
  date: "2025-02-28",
  trade: "drywall",
  csiDivision: "09",
  totalCost: 26992,
  drawingDate: "2025-01-29",
  lineItems: [
    { description: "Furnish and install drywall partitions @ 12ft high", quantity: 1, unit: "LS", total: 20000, notes: "Metal Framing, 5/8 gypsum board, insulation" },
    { description: "Modify existing ceilings for new walls", quantity: 1, unit: "LS", total: 3000 },
    { description: "Furnish and install FR plywood blocking", quantity: 1, unit: "LS", total: 1500 },
    { description: "Install bathroom accessories", quantity: 1, unit: "LS", total: 1000 },
    { description: "Install HM frames doors and hardware", quantity: 4, unit: "EA", unitRate: 375, total: 1492 },
  ],
  alternates: [
    { description: "Open/close ceiling for plumbing", cost: 2410, type: "add" },
  ],
};

// ─── Fixture: Raw vendor quote ──────────────────────────────────
const VENDOR_RAW = {
  vendor: "ABC Supply",
  client: "Tener Contracting",
  date: "2025-03-01",
  quoteNumber: "Q-2025-0442",
  validUntil: "2025-03-31",
  items: [
    { description: "2x6 SPF #2 Stud 8ft", unit: "EA", unitPrice: 4.89, quantity: 2400, extendedPrice: 11736, csiDivision: "06" },
    { description: "5/8 Type X Gypsum Board 4x12", unit: "EA", unitPrice: 18.50, quantity: 300, extendedPrice: 5550, csiDivision: "09" },
  ],
  totalCost: 17286,
};

// ─── Tests ──────────────────────────────────────────────────────

describe("normalizeGCProposal", () => {
  it("produces valid proposal shape with division rollup", () => {
    const result = normalizeGCProposal(GC_RAW, "200-petit.pdf");
    expect(result.proposal.totalCost).toBe(7007251);
    expect(result.proposal.projectSF).toBe(19310);
    expect(result.proposal.divisions["01"]).toBe(20000);
    // Division 03 should be rolled up (141839 + 63435)
    expect(result.proposal.divisions["03"]).toBe(205274);
    expect(result.proposal.divisions["09"]).toBe(274821);
    expect(result.proposal.extractionConfidence).toBe("high");
    expect(result.proposal.source).toBe("pdf");
  });

  it("extracts $/SF rates when projectSF is available", () => {
    const result = normalizeGCProposal(GC_RAW, "200-petit.pdf");
    expect(result.sfRates.length).toBe(6);
    const elecRate = result.sfRates.find(r => r.division === "26");
    expect(elecRate.costPerSF).toBeCloseTo(21.96, 1);
  });

  it("preserves markup structure", () => {
    const result = normalizeGCProposal(GC_RAW, "200-petit.pdf");
    expect(result.markup.contingency.cost).toBe(284299);
    expect(result.markup.contingency.percent).toBe(5);
  });

  it("preserves exclusions and clarifications", () => {
    const result = normalizeGCProposal(GC_RAW, "200-petit.pdf");
    expect(result.exclusions).toHaveLength(2);
    expect(result.clarifications).toHaveLength(1);
  });
});

describe("normalizeSubProposal", () => {
  it("produces valid proposal shape with single division", () => {
    const result = normalizeSubProposal(SUB_RAW, "goodwill-swift.pdf");
    expect(result.proposal.totalCost).toBe(26992);
    expect(result.proposal.divisions["09"]).toBe(26992);
    expect(result.proposal.proposalType).toBe("sub");
  });

  it("converts line items to estimate-compatible format", () => {
    const result = normalizeSubProposal(SUB_RAW, "goodwill-swift.pdf");
    expect(result.items.length).toBe(5);
    const doorItem = result.items.find(i => i.description.includes("HM frames"));
    expect(doorItem.quantity).toBe(4);
    expect(doorItem.unit).toBe("EA");
    expect(doorItem.division).toBe("09");
    expect(doorItem.novaProposed).toBe(true);
  });

  it("extracts unit rates when available", () => {
    const result = normalizeSubProposal(SUB_RAW, "goodwill-swift.pdf");
    expect(result.unitRates.length).toBe(1);
    expect(result.unitRates[0].unitRate).toBe(375);
    expect(result.unitRates[0].unit).toBe("EA");
  });

  it("preserves alternates", () => {
    const result = normalizeSubProposal(SUB_RAW, "goodwill-swift.pdf");
    expect(result.alternates).toHaveLength(1);
    expect(result.alternates[0].cost).toBe(2410);
  });
});

describe("normalizeVendorQuote", () => {
  it("extracts material rates with proper shape", () => {
    const result = normalizeVendorQuote(VENDOR_RAW, "abc-supply-quote.pdf");
    expect(result.materialRates.length).toBe(2);
    const stud = result.materialRates.find(r => r.description.includes("2x6"));
    expect(stud.unitPrice).toBe(4.89);
    expect(stud.unit).toBe("EA");
    expect(stud.division).toBe("06");
    expect(stud.vendor).toBe("ABC Supply");
  });

  it("preserves quote metadata", () => {
    const result = normalizeVendorQuote(VENDOR_RAW, "abc-supply-quote.pdf");
    expect(result.vendor).toBe("ABC Supply");
    expect(result.totalCost).toBe(17286);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `cd app && npx vitest run src/test/integration/proposalExtraction.test.js`
Expected: All 9 tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/src/test/integration/proposalExtraction.test.js
git commit -m "test: add integration tests for proposal extraction normalizer"
```

---

## Task 7: Datalab API Key Storage

**Files:**
- Modify: `app/src/stores/uiStore.js` (or wherever appSettings lives)

The Datalab API key needs to persist across sessions. Store it in appSettings (already persisted to IDB via useAutoSave).

- [ ] **Step 1: Add datalabApiKey to appSettings default**

In `uiStore.js`, find the `appSettings` default object and add:

```javascript
datalabApiKey: "", // Datalab.to API key for proposal extraction
```

This requires reading the file first to find the exact location.

- [ ] **Step 2: Commit**

```bash
git add app/src/stores/uiStore.js
git commit -m "feat: add datalabApiKey to appSettings for proposal extraction"
```

---

## Task 8: Upload UI Widget

**Files:**
- Create: `app/src/components/widgets/ProposalUploader.jsx`

Drag-and-drop upload component that triggers the extraction pipeline and shows results. Lives in the Plan Room or as a standalone widget.

- [ ] **Step 1: Create the uploader component**

```jsx
// app/src/components/widgets/ProposalUploader.jsx
import React, { useCallback, useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { bt, inp } from "@/utils/styles";
import useExtractionStore from "@/stores/extractionStore";
import useUiStore from "@/stores/uiStore";
import { extractProposal, extractProposalBatch } from "@/utils/proposalExtractor";

const STATUS_LABELS = {
  pending: "Queued",
  uploading: "Uploading...",
  converting: "Converting PDF...",
  classifying: "Classifying...",
  extracting: "Extracting data...",
  normalizing: "Normalizing...",
  done: "Complete",
  error: "Error",
};

const TYPE_LABELS = {
  "gc-proposal": "GC Proposal",
  "sub-proposal": "Sub Proposal",
  "vendor-quote": "Vendor Quote",
  "other": "Other Document",
};

export default function ProposalUploader() {
  const C = useTheme();
  const T = C.T;
  const queue = useExtractionStore(s => s.queue);
  const results = useExtractionStore(s => s.results);
  const apiKey = useUiStore(s => s.appSettings?.datalabApiKey);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(async (files) => {
    if (!apiKey) {
      alert("Set your Datalab API key in Settings first.");
      return;
    }
    const pdfs = Array.from(files).filter(f =>
      f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    if (pdfs.length === 0) return;

    if (pdfs.length === 1) {
      await extractProposal(pdfs[0], apiKey);
    } else {
      await extractProposalBatch(pdfs, apiKey, 2);
    }
  }, [apiKey]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setDragOver(false), []);

  const onFileInput = useCallback((e) => {
    handleFiles(e.target.files);
    e.target.value = "";
  }, [handleFiles]);

  return (
    <div style={{ padding: 16 }}>
      {/* Drop Zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        style={{
          border: `2px dashed ${dragOver ? T.accent : T.border}`,
          borderRadius: 8,
          padding: 32,
          textAlign: "center",
          background: dragOver ? T.accent + "10" : T.bg2,
          cursor: "pointer",
          transition: "all 0.2s",
        }}
        onClick={() => document.getElementById("proposal-file-input")?.click()}
      >
        <div style={{ fontSize: 14, color: T.text2, marginBottom: 8 }}>
          Drop proposal PDFs here or click to browse
        </div>
        <div style={{ fontSize: 12, color: T.text3 }}>
          GC proposals, sub proposals, vendor quotes
        </div>
        <input
          id="proposal-file-input"
          type="file"
          accept=".pdf"
          multiple
          style={{ display: "none" }}
          onChange={onFileInput}
        />
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {queue.map(entry => (
            <div
              key={entry.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 12px",
                borderRadius: 6,
                background: T.bg2,
                marginBottom: 4,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.fileName}
                </div>
                <div style={{ fontSize: 11, color: entry.status === "error" ? T.danger : T.text3 }}>
                  {entry.status === "error" ? entry.error : STATUS_LABELS[entry.status]}
                  {entry.documentType && ` — ${TYPE_LABELS[entry.documentType] || entry.documentType}`}
                </div>
              </div>
              {/* Progress bar */}
              {entry.status !== "done" && entry.status !== "error" && (
                <div style={{ width: 60, height: 4, borderRadius: 2, background: T.border }}>
                  <div style={{
                    width: `${entry.progress}%`,
                    height: "100%",
                    borderRadius: 2,
                    background: T.accent,
                    transition: "width 0.3s",
                  }} />
                </div>
              )}
              {entry.status === "done" && (
                <span style={{ fontSize: 12, color: T.success }}>✓</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Results Preview */}
      {Object.entries(results).map(([id, result]) => (
        <div key={id} style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 8,
          background: T.bg,
          border: `1px solid ${T.border}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 8 }}>
            {TYPE_LABELS[result.type] || result.type}
            {result.proposal && ` — ${result.proposal.projectName}`}
          </div>

          {result.type === "gc-proposal" && result.proposal && (
            <div style={{ fontSize: 12, color: T.text2 }}>
              <div>Total: ${result.proposal.totalCost?.toLocaleString()}</div>
              {result.proposal.projectSF && <div>$/SF: ${(result.proposal.totalCost / result.proposal.projectSF).toFixed(2)}</div>}
              <div>Divisions: {Object.keys(result.proposal.divisions || {}).length}</div>
              {result.sfRates?.length > 0 && <div>SF Rates: {result.sfRates.length}</div>}
            </div>
          )}

          {result.type === "sub-proposal" && result.proposal && (
            <div style={{ fontSize: 12, color: T.text2 }}>
              <div>Total: ${result.proposal.totalCost?.toLocaleString()}</div>
              <div>Line Items: {result.items?.length || 0}</div>
              <div>Unit Rates: {result.unitRates?.length || 0}</div>
            </div>
          )}

          {result.type === "vendor-quote" && (
            <div style={{ fontSize: 12, color: T.text2 }}>
              <div>Vendor: {result.vendor}</div>
              <div>Materials: {result.materialRates?.length || 0}</div>
              <div>Total: ${result.totalCost?.toLocaleString()}</div>
            </div>
          )}
        </div>
      ))}

      {/* API Key Warning */}
      {!apiKey && (
        <div style={{
          marginTop: 12,
          padding: 8,
          borderRadius: 6,
          background: T.warning + "15",
          fontSize: 12,
          color: T.warning,
        }}>
          Set your Datalab API key in Settings → Integrations to enable extraction.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd app && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/widgets/ProposalUploader.jsx
git commit -m "feat: add ProposalUploader widget with drag-drop and results preview"
```

---

## Summary: What Each Document Type Yields

| Document Type | Output | Feeds Into |
|---------------|--------|------------|
| **GC Proposal** | `proposal` (divisions, $/SF, markup, exclusions) + `sfRates[]` | `extracted-proposals.js` → ROM benchmarks, $/SF rates → cost database |
| **Sub Proposal** | `proposal` (single division) + `items[]` (estimate-ready) + `unitRates[]` | `items` → import into active estimate, `unitRates` → cost database |
| **Vendor Quote** | `materialRates[]` (unit prices per item) | Cost database material pricing layer |

## Cost Estimate

| Step | Model | Cost/page |
|------|-------|-----------|
| Datalab conversion | Marker API | ~$0.01 |
| Classification | Haiku | ~$0.001 |
| Extraction | Sonnet | ~$0.02 |
| **Total** | | **~$0.03/page** |

---

## Not In This Plan (Future Tasks)

1. **Import to active estimate** — Button in results preview to push extracted items into the current estimate's items array
2. **Cost database enrichment** — Auto-merge extracted sfRates and unitRates into masterCostDb with source tracking
3. **ROM benchmark recalibration** — After importing N new proposals, recalculate BENCHMARKS in romEngine.js
4. **Blueprint/drawing extraction** — Different document class entirely, requires spatial reasoning (Chandra VLM territory)
5. **Bulk re-extraction** — Re-run pipeline on all 160 PDFs in `Proposals/GC PROPOSALS/` with improved prompts
