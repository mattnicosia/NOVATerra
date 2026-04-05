// Extraction Prompt Schemas — type-specific Sonnet prompts for structured data extraction

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
      "costPerSF": 1.04,
      "percentOfTotal": 0.29
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
      "quantity": null,
      "unit": "SF | LF | EA | LS | CY | SY | HR | DY | WK | MO | null",
      "unitRate": null,
      "material": null,
      "labor": null,
      "total": null,
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
      "quantity": null,
      "unit": "EA | BF | LF | SF | CY | TON | GAL | null",
      "unitPrice": 4.89,
      "extendedPrice": null,
      "csiDivision": "06",
      "leadTime": "string or null — e.g. 2-3 weeks"
    }
  ],
  "delivery": "string or null — delivery terms/costs",
  "totalCost": null,
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
