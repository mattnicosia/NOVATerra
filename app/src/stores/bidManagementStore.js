/**
 * BidManagement Store — Consolidated from bidPackagesStore + bidLevelingStore
 *
 * Single store for all bid-related state: bid packages, invitations,
 * proposals, scope gaps, sub response intents, leveling grid, and overrides.
 */
import { create } from "zustand";
import { uid } from "@/utils/format";

export const useBidManagementStore = create((set, get) => ({
  // ═══════════════════════════════════════════════════════════════
  // Bid Packages (from bidPackagesStore)
  // ═══════════════════════════════════════════════════════════════
  bidPackages: [],
  invitations: {},
  proposals: {},
  scopeGapResults: {},
  subResponseIntents: {},
  activeBidPackageId: null,
  bidPackagePresets: [],

  setBidPackages: v => set({ bidPackages: v }),
  setInvitations: v => set({ invitations: v }),
  setProposals: v => set({ proposals: v }),
  setScopeGapResults: v => set({ scopeGapResults: v }),
  setSubResponseIntents: v => set({ subResponseIntents: v }),
  setActiveBidPackageId: v => set({ activeBidPackageId: v }),
  setBidPackagePresets: v => set({ bidPackagePresets: v }),

  addPreset: preset =>
    set(s => ({
      bidPackagePresets: [...s.bidPackagePresets, { id: uid(), createdAt: new Date().toISOString(), ...preset }],
    })),

  removePreset: id => set(s => ({ bidPackagePresets: s.bidPackagePresets.filter(p => p.id !== id) })),

  addBidPackage: pkg =>
    set(s => ({
      bidPackages: [...s.bidPackages, { id: uid(), status: "draft", createdAt: new Date().toISOString(), ...pkg }],
    })),

  updateBidPackage: (id, updates) =>
    set(s => ({
      bidPackages: s.bidPackages.map(p => (p.id === id ? { ...p, ...updates } : p)),
    })),

  removeBidPackage: id =>
    set(s => {
      const pkgInvites = s.invitations[id] || [];
      const newInvitations = { ...s.invitations };
      delete newInvitations[id];
      const newProposals = { ...s.proposals };
      const newGapResults = { ...s.scopeGapResults };
      for (const inv of pkgInvites) {
        delete newProposals[inv.id];
        delete newGapResults[inv.id];
      }
      return {
        bidPackages: s.bidPackages.filter(p => p.id !== id),
        invitations: newInvitations,
        proposals: newProposals,
        scopeGapResults: newGapResults,
      };
    }),

  setPackageInvitations: (packageId, invites) =>
    set(s => ({
      invitations: { ...s.invitations, [packageId]: invites },
    })),

  addInvitation: (packageId, invite) =>
    set(s => ({
      invitations: {
        ...s.invitations,
        [packageId]: [...(s.invitations[packageId] || []), { id: uid(), status: "pending", ...invite }],
      },
    })),

  updateInvitationStatus: (packageId, inviteId, status, extra = {}) =>
    set(s => ({
      invitations: {
        ...s.invitations,
        [packageId]: (s.invitations[packageId] || []).map(inv =>
          inv.id === inviteId ? { ...inv, status, ...extra } : inv,
        ),
      },
    })),

  removeInvitation: (packageId, inviteId) =>
    set(s => ({
      invitations: {
        ...s.invitations,
        [packageId]: (s.invitations[packageId] || []).filter(inv => inv.id !== inviteId),
      },
    })),

  addProposal: (invitationId, proposal) =>
    set(s => ({
      proposals: { ...s.proposals, [invitationId]: { id: uid(), parseStatus: "pending", ...proposal } },
    })),

  setScopeGapResult: (invitationId, result) =>
    set(s => ({
      scopeGapResults: { ...s.scopeGapResults, [invitationId]: result },
    })),

  updateProposalParsedData: (invitationId, parsedData, parseStatus = "parsed") =>
    set(s => ({
      proposals: {
        ...s.proposals,
        [invitationId]: s.proposals[invitationId]
          ? { ...s.proposals[invitationId], parsedData, parseStatus }
          : s.proposals[invitationId],
      },
    })),

  setSubResponseIntent: (invId, intent, reason) =>
    set(s => ({
      subResponseIntents: {
        ...s.subResponseIntents,
        [invId]: { intent, reason: reason || null, respondedAt: new Date().toISOString() },
      },
    })),

  hydrateIntentsFromInvitations: () => {
    const { invitations } = get();
    const intents = {};
    for (const pkgInvites of Object.values(invitations)) {
      for (const inv of pkgInvites) {
        if (inv.intent) {
          intents[inv.id] = {
            intent: inv.intent,
            reason: inv.intent_reason || null,
            respondedAt: inv.intent_at || null,
          };
        }
      }
    }
    set({ subResponseIntents: intents });
  },

  getPackageResponseStats: packageId => {
    const invites = get().invitations[packageId] || [];
    const intents = get().subResponseIntents;
    let bidding = 0,
      reviewing = 0,
      pass = 0,
      noResponse = 0,
      submitted = 0;
    for (const inv of invites) {
      if (["submitted", "parsed", "awarded"].includes(inv.status)) {
        submitted++;
        continue;
      }
      const ri = intents[inv.id];
      if (ri?.intent === "bidding") bidding++;
      else if (ri?.intent === "reviewing") reviewing++;
      else if (ri?.intent === "pass") pass++;
      else noResponse++;
    }
    return { bidding, reviewing, pass, noResponse, submitted, total: invites.length };
  },

  getTotalExposureCaught: () => {
    const results = get().scopeGapResults;
    let total = 0;
    for (const r of Object.values(results)) {
      total += r?.totalExposure || 0;
    }
    return total;
  },

  getPackageById: id => get().bidPackages.find(p => p.id === id),
  getPackageInvitations: packageId => get().invitations[packageId] || [],
  getInvitationProposal: invitationId => get().proposals[invitationId] || null,

  getPackageStats: packageId => {
    const invites = get().invitations[packageId] || [];
    const total = invites.length;
    const sent = invites.filter(i => i.status !== "pending").length;
    const opened = invites.filter(i => ["opened", "downloaded", "submitted", "parsed"].includes(i.status)).length;
    const submitted = invites.filter(i => ["submitted", "parsed"].includes(i.status)).length;
    const parsed = invites.filter(i => i.status === "parsed").length;
    return { total, sent, opened, submitted, parsed };
  },

  generateLevelingData: (packageId, estimateItems) => {
    const invites = get().invitations[packageId] || [];
    const proposals = get().proposals;
    const linkedSubs = [];
    const bidCells = {};
    const bidTotals = {};
    const subBidSubs = {};

    const csiToItems = {};
    (estimateItems || []).forEach(item => {
      if (item.code) csiToItems[item.code] = item;
    });

    const getSubKey = code => {
      if (!code) return null;
      const parts = code.split(".");
      if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
      return `${parts[0]}.00`;
    };

    for (const inv of invites) {
      const proposal = proposals[inv.id];
      if (!proposal?.parsedData) continue;

      const pd = proposal.parsedData;
      const subId = uid();
      const subName = inv.subCompany || inv.subContact || "";
      const matchedSubKeys = new Set();

      if (Array.isArray(pd.lineItems)) {
        for (const li of pd.lineItems) {
          if (!li.csiCode) continue;
          const matchedItem = csiToItems[li.csiCode];
          if (matchedItem) {
            const cellKey = `${matchedItem.id}_${subId}`;
            bidCells[cellKey] = {
              status: "lumpsum",
              value: String(li.amount || 0),
            };
            const sk = getSubKey(matchedItem.code);
            if (sk) matchedSubKeys.add(sk);
          }
        }
      }

      for (const sk of matchedSubKeys) {
        if (!subBidSubs[sk]) subBidSubs[sk] = [];
        subBidSubs[sk].push({ id: subId, name: subName });
      }

      linkedSubs.push({
        id: subId,
        name: subName,
        subKeys: Array.from(matchedSubKeys),
        totalBid: pd.totalBid || 0,
        source: "portal",
      });

      if (pd.totalBid) {
        bidTotals[subId] = pd.totalBid;
      }
    }

    return { linkedSubs, bidCells, bidTotals, subBidSubs };
  },

  // ═══════════════════════════════════════════════════════════════
  // Bid Leveling (from bidLevelingStore)
  // ═══════════════════════════════════════════════════════════════
  subBidSubs: {},
  bidTotals: {},
  bidCells: {},
  bidSelections: {},
  linkedSubs: [],
  subKeyLabels: {},
  preferredSubs: {},
  cellMenu: null,
  carryModal: null,
  showBidPanel: false,
  dragItemId: null,
  dragOverSk: null,

  overrides: {},
  selections: {},
  editingCell: null,

  setSubBidSubs: v => set({ subBidSubs: v }),
  setBidTotals: v => set({ bidTotals: v }),
  setBidCells: v => set({ bidCells: v }),
  setBidSelections: v => set({ bidSelections: v }),
  setLinkedSubs: v => set({ linkedSubs: v }),
  setSubKeyLabels: v => set({ subKeyLabels: v }),
  setPreferredSubs: v => set({ preferredSubs: v }),
  setCellMenu: v => set({ cellMenu: v }),
  setCarryModal: v => set({ carryModal: v }),
  setShowBidPanel: v => set({ showBidPanel: v }),
  setDragItemId: v => set({ dragItemId: v }),
  setDragOverSk: v => set({ dragOverSk: v }),

  setOverride: (divKey, subIdx, amount) =>
    set(s => ({ overrides: { ...s.overrides, [`${divKey}-${subIdx}`]: amount } })),
  clearOverride: (divKey, subIdx) =>
    set(s => {
      const next = { ...s.overrides };
      delete next[`${divKey}-${subIdx}`];
      return { overrides: next };
    }),

  setDivisionSelection: (divKey, subIdx) => set(s => ({ selections: { ...s.selections, [divKey]: subIdx } })),
  clearDivisionSelection: divKey =>
    set(s => {
      const next = { ...s.selections };
      delete next[divKey];
      return { selections: next };
    }),
  toggleDivisionSelection: (divKey, subIdx) =>
    set(s => {
      const current = s.selections[divKey];
      return { selections: { ...s.selections, [divKey]: current === subIdx ? null : subIdx } };
    }),
  initSelectionsFromBest: divBest => set({ selections: { ...divBest } }),

  setEditingCell: cell => set({ editingCell: cell }),
  clearEditingCell: () => set({ editingCell: null }),

  addLinkedSub: () =>
    set(s => ({
      linkedSubs: [...s.linkedSubs, { id: uid(), name: "", subKeys: [], totalBid: 0, source: "" }],
    })),

  updateLinkedSub: (id, field, value) =>
    set(s => ({
      linkedSubs: s.linkedSubs.map(ls => (ls.id === id ? { ...ls, [field]: value } : ls)),
    })),

  removeLinkedSub: id =>
    set(s => ({
      linkedSubs: s.linkedSubs.filter(ls => ls.id !== id),
    })),

  setSkLabel: (sk, label) =>
    set(s => ({
      subKeyLabels: { ...s.subKeyLabels, [sk]: label },
    })),

  importParsedProposals: levelingData =>
    set(s => {
      const { linkedSubs: newSubs, bidCells: newCells, bidTotals: newTotals, subBidSubs: newSubBidSubs } = levelingData;

      const mergedSubBidSubs = { ...s.subBidSubs };
      if (newSubBidSubs) {
        for (const [sk, subs] of Object.entries(newSubBidSubs)) {
          mergedSubBidSubs[sk] = [...(mergedSubBidSubs[sk] || []), ...subs];
        }
      }

      return {
        linkedSubs: [...s.linkedSubs, ...newSubs],
        bidCells: { ...s.bidCells, ...newCells },
        bidTotals: { ...s.bidTotals, ...newTotals },
        subBidSubs: mergedSubBidSubs,
      };
    }),
}));
