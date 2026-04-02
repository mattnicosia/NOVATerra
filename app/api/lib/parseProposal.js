// Shared proposal parsing prompt + JSON response schema
// Used by api/parse-proposal.js

export const PROPOSAL_PARSE_PROMPT = `You are a construction bid proposal parsing assistant. You extract structured data from contractor/subcontractor bid proposals and quotations.

EXTRACTION RULES:
- Only extract information that is explicitly stated in the document
- Do not infer or guess values
- For monetary amounts, extract the number only (no currency symbols)
- For CSI codes, use the 2-digit division code when identifiable (e.g., "03" for concrete, "09" for finishes)
- If a line item clearly maps to a CSI division, include the code; otherwise use null

OUTPUT FORMAT: Respond with ONLY a valid JSON object, no explanation.

JSON SCHEMA:
{
  "totalBid": number | null,
  "lineItems": [
    {
      "description": "string",
      "amount": number | null,
      "csiCode": "string (2-digit)" | null,
      "unit": "string" | null,
      "quantity": number | null,
      "unitPrice": number | null
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
  "insuranceIncluded": boolean | null,
  "scheduleDuration": "string" | null,
  "subcontractorName": "string" | null,
  "subcontractorContact": "string" | null,
  "subcontractorEmail": "string" | null,
  "subcontractorPhone": "string" | null,
  "confidence": number (0.0 - 1.0)
}

GUIDELINES:
- totalBid: the primary total/lump sum bid amount
- lineItems: individual line items with descriptions and amounts. Match to CSI divisions:
  01=General Requirements, 02=Existing Conditions, 03=Concrete, 04=Masonry, 05=Metals,
  06=Wood/Plastics, 07=Thermal/Moisture, 08=Openings, 09=Finishes, 10=Specialties,
  11=Equipment, 12=Furnishings, 13=Special Construction, 14=Conveying Equipment,
  21=Fire Suppression, 22=Plumbing, 23=HVAC, 26=Electrical, 27=Communications,
  28=Electronic Safety, 31=Earthwork, 32=Exterior Improvements, 33=Utilities
- inclusions: what IS included in the bid
- exclusions: what is NOT included (critical for bid leveling)
- alternates: optional add/deduct items
- qualifications: conditions, assumptions, or caveats
- confidence: your confidence in the parse quality (1.0 = crystal clear PDF, 0.5 = partial/unclear)`;

// ── Haiku Classification Prompt (fast, cheap — $0.01/page) ──
export const CLASSIFY_PROMPT = `You classify construction documents. Return ONLY a valid JSON object, no explanation.

JSON SCHEMA:
{
  "documentType": "gc_proposal" | "sub_proposal" | "vendor_quote" | "internal_report" | "schedule_of_values" | "drawing" | "other",
  "companyName": "string" | null,
  "totalBid": number | null,
  "projectName": "string" | null,
  "tradeCodes": ["09", "26"],
  "hasLineItems": boolean,
  "hasUnitPrices": boolean,
  "worthFullParse": boolean,
  "confidence": number
}

RULES:
- gc_proposal: Full project proposal from a general contractor with division-level SOV
- sub_proposal: Trade-specific proposal from a subcontractor (drywall, electrical, plumbing, etc.)
- vendor_quote: Material/equipment quote from a supplier with product pricing
- internal_report: Cost report, internal estimate summary, or budget document
- schedule_of_values: Standalone SOV or cost breakdown without proposal letter
- drawing: Construction drawings, floor plans, details — NOT worth parsing
- other: Anything else (photos, correspondence, spec sheets)
- worthFullParse: true if the document contains extractable cost data (line items, amounts, unit prices). False for drawings, photos, cover letters, correspondence.
- tradeCodes: 2-digit CSI division codes this document covers (e.g., ["09"] for drywall, ["22","23"] for MEP)`;

export function buildClassifyMessages(pdfBase64) {
  return [
    {
      role: "user",
      content: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
        },
        {
          type: "text",
          text: "Classify this construction document. Return ONLY the JSON object.",
        },
      ],
    },
  ];
}

// ── Enhanced Parse Prompt (adds context per document type) ──
const PARSE_EXTRAS = {
  gc_proposal: `\nADDITIONAL FOR GC PROPOSALS:
- Extract the Schedule of Values (SOV) as lineItems with CSI division codes
- Look for General Conditions, Fee, Insurance, and Overhead as separate line items
- totalBid should be the GRAND TOTAL including all markups
- If divisions are numbered (01, 02, 03...), use those as csiCode`,
  sub_proposal: `\nADDITIONAL FOR SUB PROPOSALS:
- Focus on unit prices ($/LF, $/SF, $/EA, $/CY) — these are the most valuable data
- Extract the subcontractor's trade scope precisely
- Look for labor vs material breakdowns if available
- If there's a per-SF price, include it as a lineItem with unit "SF"`,
  vendor_quote: `\nADDITIONAL FOR VENDOR QUOTES:
- Extract individual product items with unit prices and quantities
- Look for model numbers, specifications, and lead times
- totalBid may not exist — sum of line items is the total
- Include product descriptions with model numbers in the description field`,
  internal_report: `\nADDITIONAL FOR INTERNAL REPORTS:
- Extract division-level cost breakdowns
- Look for $/SF benchmarks and total project costs
- Capture any markup percentages (GC, fee, insurance, bond)`,
  schedule_of_values: `\nADDITIONAL FOR SCHEDULE OF VALUES:
- Every line should be a lineItem with CSI code and amount
- Capture scheduled values, previous payments, and balance to finish if present`,
};

export function buildEnhancedParsePrompt(docType) {
  return PROPOSAL_PARSE_PROMPT + (PARSE_EXTRAS[docType] || "");
}

export function buildEnhancedParseMessages(pdfBase64, docType) {
  return [
    {
      role: "user",
      content: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
        },
        {
          type: "text",
          text: `Parse this construction ${docType.replace("_", " ")} and extract all structured data per the schema. Return ONLY the JSON object.`,
        },
      ],
    },
  ];
}

export function buildProposalMessages(pdfBase64) {
  return [
    {
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: pdfBase64,
          },
        },
        {
          type: 'text',
          text: 'Parse this construction bid proposal and extract all structured data per the schema. Return ONLY the JSON object.',
        },
      ],
    },
  ];
}
