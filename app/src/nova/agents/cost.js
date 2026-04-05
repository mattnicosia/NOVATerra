/**
 * NOVA-Cost — Construction Cost Intelligence Agent
 *
 * This agent answers cost questions grounded in the user's OWN data:
 * - Historical proposal pricing
 * - Trade pricing index (aggregated from batch-parsed proposals)
 * - ROM calibration factors
 * - Cost database elements
 * - Learning records from past estimates
 *
 * It can answer: "What should drywall cost on this project?"
 * "How does my concrete compare to similar projects?"
 * "What's the typical $/SF for a dental office renovation?"
 */

import { useCorrectionStore } from "../learning/correctionStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useDatabaseStore } from "@/stores/databaseStore";

// ── CSI Division Labels ──
const CSI_LABELS = {
  "01": "General Requirements", "02": "Existing Conditions", "03": "Concrete",
  "04": "Masonry", "05": "Metals", "06": "Wood/Plastics", "07": "Thermal/Moisture",
  "08": "Openings", "09": "Finishes", "10": "Specialties", "11": "Equipment",
  "12": "Furnishings", "21": "Fire Suppression", "22": "Plumbing", "23": "HVAC",
  "26": "Electrical", "27": "Communications", "28": "Electronic Safety",
  "31": "Earthwork", "32": "Exterior Improvements", "33": "Utilities",
};

const BASE_PERSONA = `You are NOVA-Cost, the cost intelligence engine inside NOVATerra. You are a senior construction estimator with 25+ years of experience in commercial construction pricing across the NYC metro area and northeast US.

Your superpower: you have access to REAL pricing data from the user's own historical proposals, not textbook numbers. When you cite a price, you can trace it back to a specific project.

Key principles:
- ALWAYS ground your answers in the user's data when available. Say "Based on your 6 similar projects..." not "Industry average..."
- When the user's data is thin (< 3 data points for a trade), acknowledge it and supplement with industry knowledge
- Adjust for location (NYC is 1.3-1.45x national), labor type (union vs open shop vs prevailing), and project type
- Flag outliers: if a price seems way off compared to their history, say so
- Think in $/SF for divisions and $/unit for line items
- When comparing, always normalize to the same basis (same year, same location, same labor type)
- Be specific: "$22.50/SF for drywall" not "drywall costs can vary"

Output style:
- Lead with the answer, then the evidence
- Cite specific projects by name when referencing historical data
- Show ranges (low/mid/high) when you have enough data
- Flag confidence level: HIGH (8+ data points), MEDIUM (3-7), LOW (1-2), NONE (no data)`;

/**
 * Build the system prompt for NOVA-Cost with current data context
 * @param {object} context - { projectSF, buildingType, workType, laborType, zipCode, currentItems }
 * @returns {string}
 */
export function systemPrompt(context = {}) {
  const parts = [BASE_PERSONA];

  // Inject historical proposal summary
  const proposalContext = buildProposalContext(context);
  if (proposalContext) parts.push(proposalContext);

  // Inject calibration factors
  const calibContext = buildCalibrationContext(context);
  if (calibContext) parts.push(calibContext);

  // Inject cost database matches
  const dbContext = buildDatabaseContext(context);
  if (dbContext) parts.push(dbContext);

  // Inject correction history (user's pricing adjustments)
  const correctionCtx = useCorrectionStore.getState().buildCorrectionContext("pricing", 1500);
  if (correctionCtx) parts.push(correctionCtx);

  return parts.join("\n\n");
}

/**
 * Build summary of relevant historical proposals
 */
function buildProposalContext(context) {
  const proposals = useMasterDataStore.getState().masterData?.historicalProposals || [];
  if (!proposals.length) return "";

  // Filter to relevant proposals
  const relevant = proposals.filter(p => {
    if (!p.projectSF || p.projectSF <= 0) return false;
    if (!p.divisions || Object.keys(p.divisions).length === 0) return false;
    // Prefer same building type
    if (context.buildingType && p.buildingType && p.buildingType !== context.buildingType) {
      // Still include if same labor type
      if (context.laborType && p.laborType && p.laborType !== context.laborType) return false;
    }
    return true;
  }).slice(0, 20); // Cap at 20 most relevant

  if (!relevant.length) return "";

  const lines = [`HISTORICAL PROPOSAL DATA (${relevant.length} relevant projects from user's portfolio):`];

  for (const p of relevant) {
    const perSF = p.projectSF > 0 ? Math.round(p.totalCost / p.projectSF) : 0;
    const divSummary = Object.entries(p.divisions || {})
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([d, v]) => `${CSI_LABELS[d] || d}: $${Math.round(v).toLocaleString()}`)
      .join(", ");

    lines.push(`- ${p.projectName || "Unnamed"} | ${p.projectSF?.toLocaleString()} SF | $${perSF}/SF | ${p.workType || p.jobType || "?"} | ${p.laborType || "?"} | Top: ${divSummary}`);
  }

  return lines.join("\n");
}

/**
 * Build calibration factor context
 */
function buildCalibrationContext(context) {
  const scanStore = useDrawingPipelineStore.getState();
  if (!scanStore.getCalibrationFactors) return "";

  try {
    const factors = scanStore.getCalibrationFactors(
      context.buildingType || "commercial-office",
      context.workType || "",
      context.laborType || "open_shop",
    );

    if (!factors || Object.keys(factors).length === 0) return "";

    const lines = ["CALIBRATION FACTORS (how user's actual costs compare to ROM baseline):"];
    for (const [div, data] of Object.entries(factors)) {
      const f = typeof data === "number" ? data : data?.factor;
      const count = typeof data === "object" ? data?.count : 0;
      const conf = typeof data === "object" ? data?.confidence : "low";
      if (f && f !== 1) {
        const pct = Math.round((f - 1) * 100);
        lines.push(`- ${CSI_LABELS[div] || div}: ${pct > 0 ? "+" : ""}${pct}% vs baseline (${count} samples, ${conf} confidence)`);
      }
    }

    return lines.length > 1 ? lines.join("\n") : "";
  } catch {
    return "";
  }
}

/**
 * Build cost database context for matching items
 */
function buildDatabaseContext(context) {
  const elements = useDatabaseStore.getState().elements || [];
  if (!elements.length || !context.currentItems?.length) return "";

  // Find DB elements that match current estimate items
  const matches = [];
  for (const item of context.currentItems.slice(0, 10)) {
    const csiPrefix = (item.code || "").substring(0, 2);
    const dbMatch = elements.find(e =>
      e.code?.startsWith(csiPrefix) && e.unit === item.unit && (e.subcontractor > 0 || e.material > 0)
    );
    if (dbMatch) {
      const elPrice = dbMatch.subcontractor || (dbMatch.material + dbMatch.labor + dbMatch.equipment);
      matches.push(`- ${item.description}: DB has "${dbMatch.name}" at $${elPrice.toFixed(2)}/${dbMatch.unit}`);
    }
  }

  if (!matches.length) return "";
  return "COST DATABASE MATCHES (user's saved unit rates):\n" + matches.join("\n");
}

/**
 * Build a user message with estimate context
 */
export function buildUserMessage(question, estimateContext = {}) {
  const parts = [question];

  if (estimateContext.projectName) parts.push(`\nCurrent project: ${estimateContext.projectName}`);
  if (estimateContext.projectSF) parts.push(`Size: ${estimateContext.projectSF.toLocaleString()} SF`);
  if (estimateContext.buildingType) parts.push(`Type: ${estimateContext.buildingType}`);
  if (estimateContext.workType) parts.push(`Work: ${estimateContext.workType}`);
  if (estimateContext.laborType) parts.push(`Labor: ${estimateContext.laborType}`);
  if (estimateContext.zipCode) parts.push(`Location: ${estimateContext.zipCode}`);

  if (estimateContext.currentItems?.length) {
    const totalCost = estimateContext.currentItems.reduce((s, i) => {
      const unit = (i.material || 0) + (i.labor || 0) + (i.equipment || 0) + (i.subcontractor || 0);
      return s + unit * (i.quantity || 0);
    }, 0);
    parts.push(`Current estimate: ${estimateContext.currentItems.length} items, $${Math.round(totalCost).toLocaleString()} total`);
  }

  return parts.join("\n");
}

export const novaCost = {
  name: "NOVA-Cost",
  systemPrompt,
  buildUserMessage,
  buildProposalContext,
  buildCalibrationContext,
  buildDatabaseContext,
};
