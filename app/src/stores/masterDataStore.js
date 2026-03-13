import { create } from "zustand";
import { uid } from "@/utils/format";
import { fuzzyMatchTrade } from "@/constants/tradeGroupings";

// ── One-time schema migration: trade (string) → trades (string[]) + prequal fields ──
export function migrateSubcontractorSchema(masterData) {
  if (!masterData?.subcontractors) return masterData;
  let changed = false;
  const migrated = masterData.subcontractors.map(sub => {
    if (Array.isArray(sub.trades)) return sub; // already migrated
    changed = true;
    const trades = fuzzyMatchTrade(sub.trade || "");
    return {
      ...sub,
      trades,
      _legacyTrade: sub.trade || "",
      markets: sub.markets || [],
      insuranceExpiry: sub.insuranceExpiry || "",
      bondingCapacity: sub.bondingCapacity || "",
      emr: sub.emr || "",
      certifications: sub.certifications || [],
      yearsInBusiness: sub.yearsInBusiness || "",
      licenseNo: sub.licenseNo || "",
      website: sub.website || "",
      address: sub.address || "",
    };
  });
  if (!changed) return masterData;
  return { ...masterData, subcontractors: migrated };
}

export const useMasterDataStore = create((set, get) => ({
  // ── PDF Upload Queue (persisted separately in bldg-upload-queue) ──
  pdfUploadQueue: [],

  addToUploadQueue: items =>
    set(s => ({
      pdfUploadQueue: [...s.pdfUploadQueue, ...items],
    })),

  updateQueueItem: (id, updates) =>
    set(s => ({
      pdfUploadQueue: s.pdfUploadQueue.map(q => (q.id === id ? { ...q, ...updates } : q)),
    })),

  removeQueueItem: id =>
    set(s => ({
      pdfUploadQueue: s.pdfUploadQueue.filter(q => q.id !== id),
    })),

  clearSavedFromQueue: () =>
    set(s => ({
      pdfUploadQueue: s.pdfUploadQueue.filter(q => q.status !== "saved"),
    })),

  clearFailedFromQueue: () =>
    set(s => ({
      pdfUploadQueue: s.pdfUploadQueue.filter(q => q.status !== "failed"),
    })),

  masterData: {
    clients: [],
    architects: [],
    engineers: [],
    estimators: [],
    subcontractors: [],
    historicalProposals: [],
    companyProfiles: [],
    jobTypes: [
      // Work Types
      "New Construction",
      "Renovation",
      "Gut Renovation",
      "Tenant Fit-Out",
      "Interior Fit-Out",
      "Addition",
      "Adaptive Reuse",
      "Historic Restoration",
      "Shell & Core",
      "Capital Improvement",
      "Demolition",
      // Building Types
      "Commercial",
      "Retail",
      "Industrial / Warehouse",
      "Healthcare / Medical",
      "Education",
      "Hospitality",
      "Multi-Family Residential",
      "Residential",
      "Mixed-Use",
      "Government / Municipal",
      "Religious / House of Worship",
      "Restaurant / Food Service",
      "Parking Structure",
    ],
    bidDeliveryTypes: ["Email", "Sealed & Delivered", "Both", "Online Portal"],
    bidTypes: ["Hard Bid", "Negotiated", "Design-Build", "CM at Risk", "GMP"],
    companyInfo: {
      name: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      phone: "",
      email: "",
      website: "",
      licenseNo: "",
      logo: null,
      brandColors: [],
      palettes: [],
      boilerplateExclusions: [],
      boilerplateNotes: [],
    },
  },

  setMasterData: v => set({ masterData: v }),

  toggleSubPreferred: subId =>
    set(s => ({
      masterData: {
        ...s.masterData,
        subcontractors: (s.masterData.subcontractors || []).map(sub =>
          sub.id === subId ? { ...sub, preferred: !sub.preferred } : sub,
        ),
      },
    })),

  addMasterItem: (category, item) =>
    set(s => ({
      masterData: {
        ...s.masterData,
        [category]: [...(s.masterData[category] || []), { id: uid(), ...item }],
      },
    })),

  updateMasterItem: (category, id, field, value) =>
    set(s => ({
      masterData: {
        ...s.masterData,
        [category]: s.masterData[category].map(it => (it.id === id ? { ...it, [field]: value } : it)),
      },
    })),

  removeMasterItem: (category, id) =>
    set(s => ({
      masterData: {
        ...s.masterData,
        [category]: s.masterData[category].filter(it => it.id !== id),
      },
    })),

  // Bulk add subcontractors (single state update for N items)
  addBulkSubs: subs =>
    set(s => ({
      masterData: {
        ...s.masterData,
        subcontractors: [
          ...(s.masterData.subcontractors || []),
          ...subs.map(sub => ({ id: uid(), ...sub })),
        ],
      },
    })),

  addJobType: name =>
    set(s => ({
      masterData: {
        ...s.masterData,
        jobTypes: [...s.masterData.jobTypes, name],
      },
    })),

  updateCompanyInfo: (field, value) =>
    set(s => ({
      masterData: {
        ...s.masterData,
        companyInfo: { ...s.masterData.companyInfo, [field]: value },
      },
    })),

  // Company Profiles — multiple branding profiles for different clients/offices
  addCompanyProfile: profile =>
    set(s => ({
      masterData: {
        ...s.masterData,
        companyProfiles: [...(s.masterData.companyProfiles || []), { id: uid(), ...profile }],
      },
    })),

  updateCompanyProfile: (id, field, value) =>
    set(s => ({
      masterData: {
        ...s.masterData,
        companyProfiles: (s.masterData.companyProfiles || []).map(p => (p.id === id ? { ...p, [field]: value } : p)),
      },
    })),

  removeCompanyProfile: id =>
    set(s => ({
      masterData: {
        ...s.masterData,
        companyProfiles: (s.masterData.companyProfiles || []).filter(p => p.id !== id),
      },
    })),

  // ── Historical Proposals — for ROM calibration ──
  addHistoricalProposal: proposal =>
    set(s => ({
      masterData: {
        ...s.masterData,
        historicalProposals: [
          ...(s.masterData.historicalProposals || []),
          { id: uid(), importedAt: Date.now(), ...proposal },
        ],
      },
    })),

  updateHistoricalProposal: (id, updates) =>
    set(s => ({
      masterData: {
        ...s.masterData,
        historicalProposals: (s.masterData.historicalProposals || []).map(p =>
          p.id === id ? { ...p, ...updates } : p,
        ),
      },
    })),

  removeHistoricalProposal: id =>
    set(s => ({
      masterData: {
        ...s.masterData,
        historicalProposals: (s.masterData.historicalProposals || []).filter(p => p.id !== id),
      },
    })),

  updateProposalOutcome: (id, outcome, metadata) =>
    set(s => ({
      masterData: {
        ...s.masterData,
        historicalProposals: (s.masterData.historicalProposals || []).map(p =>
          p.id === id ? { ...p, outcome, outcomeMetadata: { ...(p.outcomeMetadata || {}), ...metadata } } : p,
        ),
      },
    })),

  // Filter contacts by company profile
  getContactsForCompany: (category, companyId) => {
    const items = get().masterData[category] || [];
    if (companyId === "__all__") return items;
    // Primary ("") → only contacts with falsy companyProfileId ("", undefined, null)
    if (!companyId) return items.filter(c => !c.companyProfileId);
    // Specific profile → exact match OR global contacts (no profile assigned)
    return items.filter(c => c.companyProfileId === companyId || !c.companyProfileId);
  },

  // Filter proposals by company profile (same pattern as getContactsForCompany)
  getProposalsForCompany: companyId => {
    const proposals = get().masterData.historicalProposals || [];
    if (companyId === "__all__") return proposals;
    if (!companyId) return proposals.filter(p => !p.companyProfileId);
    return proposals.filter(p => p.companyProfileId === companyId);
  },

  // Resolve company info for a given profileId (falls back to default companyInfo)
  getCompanyInfo: profileId => {
    const s = get();
    if (!profileId) return s.masterData.companyInfo;
    const profile = (s.masterData.companyProfiles || []).find(p => p.id === profileId);
    return profile || s.masterData.companyInfo;
  },
}));
