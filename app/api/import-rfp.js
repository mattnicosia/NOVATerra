import { supabaseAdmin, verifyUser } from './lib/supabaseAdmin.js';
import { cors } from './lib/cors.js';

// Capitalize each word in a name (e.g. "john smith" → "John Smith")
function titleCase(s) {
  if (!s || typeof s !== "string") return s || "";
  return s.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// Apply title case to contact name fields
function normalizeContact(contact) {
  if (!contact) return contact;
  return {
    ...contact,
    contact: contact.contact ? titleCase(contact.contact) : contact.contact,
  };
}

// Build a complete estimate data object from parsed RFP data
// Matches the shape in estimatesStore.js createEstimate() lines 33-70
function buildEstimateFromRfp(parsedData) {
  const pd = parsedData || {};
  const br = pd.bidRequirements || {};

  return {
    project: {
      name: pd.projectName || "Imported RFP",
      client: pd.client?.company || "",
      architect: pd.architect?.company || "",
      engineer: pd.engineer?.company || "",
      estimator: "",
      address: pd.address || "",
      date: new Date().toISOString().split("T")[0],
      bidDue: pd.bidDue || "",
      bidDueTime: pd.bidDueTime || "",
      walkthroughDate: pd.walkthroughDate || "",
      rfiDueDate: pd.rfiDueDate || "",
      otherDueDate: "",
      otherDueLabel: "",
      description: pd.description || "",
      projectSF: pd.projectSF ? String(pd.projectSF) : "",
      jobType: pd.jobType || "",
      bidType: pd.bidType || "",
      bidDelivery: pd.bidDelivery || "",
      planLinks: pd.planLinks || [],
      bidRequirements: {
        schedule: br.schedule || false,
        marketing: br.marketing || false,
        financials: br.financials || false,
        bonds: br.bonds || false,
        insurance: br.insurance || false,
        references: br.references || false,
        safetyPlan: br.safetyPlan || false,
        other: br.other || "",
      },
      status: "Bidding",
      referredByType: "",
      referredByName: "",
      laborType: "open_shop",
    },
    codeSystem: "csi-commercial",
    items: [],
    markup: { overhead: 10, profit: 10, contingency: 5, generalConditions: 0, insurance: 2, tax: 0, bond: 0 },
    markupOrder: [
      { key: "overhead", label: "Overhead", compound: false },
      { key: "profit", label: "Profit", compound: false },
      { key: "contingency", label: "Contingency", compound: false },
      { key: "generalConditions", label: "General Conditions", compound: false },
      { key: "insurance", label: "Insurance", compound: false },
    ],
    customMarkups: [],
    changeOrders: [],
    drawings: [],
    takeoffs: [],
    drawingScales: {},
    drawingDpi: {},
    tkCalibrations: {},
    subBidSubs: {},
    bidTotals: {},
    bidCells: {},
    bidSelections: {},
    linkedSubs: [],
    subKeyLabels: {},
    exclusions: [],
    clarifications: [],
    specs: [],
    specPdf: null,
    alternates: [],
    documents: [],
  };
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { rfpId } = req.body || {};
    if (!rfpId) return res.status(400).json({ error: "rfpId required" });

    // Fetch the RFP
    const { data: rfp, error: fetchErr } = await supabaseAdmin
      .from("pending_rfps")
      .select("*")
      .eq("id", rfpId)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !rfp) {
      return res.status(404).json({ error: "RFP not found" });
    }

    // Build estimate data from parsed data
    const estimateData = buildEstimateFromRfp(rfp.parsed_data);

    // Build attachment download info
    const attachments = (rfp.attachments || []).map(att => ({
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
      downloadPath: att.storagePath,
    }));

    // Mark RFP as imported
    await supabaseAdmin
      .from("pending_rfps")
      .update({ status: "imported" })
      .eq("id", rfpId);

    // Also return extracted contacts for auto-adding to master data (with title-cased names)
    const contacts = {
      client: normalizeContact(rfp.parsed_data?.client) || null,
      architect: normalizeContact(rfp.parsed_data?.architect) || null,
      engineer: normalizeContact(rfp.parsed_data?.engineer) || null,
    };

    return res.status(200).json({
      estimateData,
      attachments,
      contacts,
      scopeNotes: rfp.parsed_data?.scopeNotes || [],
      planLinks: rfp.parsed_data?.planLinks || [],
    });
  } catch (err) {
    console.error("Import RFP error:", err.message);
    return res.status(500).json({ error: "Failed to import RFP" });
  }
}
