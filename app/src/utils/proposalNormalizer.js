// Proposal Normalizer — converts raw AI extraction to NOVATerra data shapes
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
  return "commercial-office";
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
    workType: "new-construction",
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
