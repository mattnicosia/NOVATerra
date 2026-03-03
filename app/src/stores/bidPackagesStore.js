import { create } from 'zustand';
import { uid } from '@/utils/format';

export const useBidPackagesStore = create((set, get) => ({
  // ── State ──
  bidPackages: [],
  invitations: {},       // keyed by packageId → invitation[]
  proposals: {},         // keyed by invitationId → proposal
  scopeGapResults: {},   // keyed by invitationId → gap report cache
  activeBidPackageId: null,

  // ── Setters (for persistence hydration) ──
  setBidPackages: (v) => set({ bidPackages: v }),
  setInvitations: (v) => set({ invitations: v }),
  setProposals: (v) => set({ proposals: v }),
  setScopeGapResults: (v) => set({ scopeGapResults: v }),
  setActiveBidPackageId: (v) => set({ activeBidPackageId: v }),

  // ── Bid Package CRUD ──
  addBidPackage: (pkg) => set(s => ({
    bidPackages: [...s.bidPackages, { id: uid(), status: 'draft', createdAt: new Date().toISOString(), ...pkg }],
  })),

  updateBidPackage: (id, updates) => set(s => ({
    bidPackages: s.bidPackages.map(p => p.id === id ? { ...p, ...updates } : p),
  })),

  removeBidPackage: (id) => set(s => {
    // Clean up invitations, proposals, and scopeGapResults for this package
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

  // ── Invitations ──
  setPackageInvitations: (packageId, invites) => set(s => ({
    invitations: { ...s.invitations, [packageId]: invites },
  })),

  addInvitation: (packageId, invite) => set(s => ({
    invitations: {
      ...s.invitations,
      [packageId]: [...(s.invitations[packageId] || []), { id: uid(), status: 'pending', ...invite }],
    },
  })),

  updateInvitationStatus: (packageId, inviteId, status, extra = {}) => set(s => ({
    invitations: {
      ...s.invitations,
      [packageId]: (s.invitations[packageId] || []).map(inv =>
        inv.id === inviteId ? { ...inv, status, ...extra } : inv
      ),
    },
  })),

  removeInvitation: (packageId, inviteId) => set(s => ({
    invitations: {
      ...s.invitations,
      [packageId]: (s.invitations[packageId] || []).filter(inv => inv.id !== inviteId),
    },
  })),

  // ── Proposals ──
  addProposal: (invitationId, proposal) => set(s => ({
    proposals: { ...s.proposals, [invitationId]: { id: uid(), parseStatus: 'pending', ...proposal } },
  })),

  setScopeGapResult: (invitationId, result) => set(s => ({
    scopeGapResults: { ...s.scopeGapResults, [invitationId]: result },
  })),

  updateProposalParsedData: (invitationId, parsedData, parseStatus = 'parsed') => set(s => ({
    proposals: {
      ...s.proposals,
      [invitationId]: s.proposals[invitationId]
        ? { ...s.proposals[invitationId], parsedData, parseStatus }
        : s.proposals[invitationId],
    },
  })),

  // ── Helpers ──
  getPackageById: (id) => get().bidPackages.find(p => p.id === id),

  getPackageInvitations: (packageId) => get().invitations[packageId] || [],

  getInvitationProposal: (invitationId) => get().proposals[invitationId] || null,

  getPackageStats: (packageId) => {
    const invites = get().invitations[packageId] || [];
    const total = invites.length;
    const sent = invites.filter(i => i.status !== 'pending').length;
    const opened = invites.filter(i => ['opened', 'downloaded', 'submitted', 'parsed'].includes(i.status)).length;
    const submitted = invites.filter(i => ['submitted', 'parsed'].includes(i.status)).length;
    const parsed = invites.filter(i => i.status === 'parsed').length;
    return { total, sent, opened, submitted, parsed };
  },

  // ── Generate leveling data from parsed proposals ──
  generateLevelingData: (packageId) => {
    const invites = get().invitations[packageId] || [];
    const proposals = get().proposals;
    const linkedSubs = [];
    const bidCells = {};
    const bidTotals = {};

    for (const inv of invites) {
      const proposal = proposals[inv.id];
      if (!proposal?.parsedData) continue;

      const pd = proposal.parsedData;
      const subId = uid();

      // Create linkedSub entry
      linkedSubs.push({
        id: subId,
        name: inv.subCompany || inv.subContact || '',
        subKeys: [],
        totalBid: pd.totalBid || 0,
        source: 'portal',
      });

      // Map line items to bidCells by CSI code
      if (Array.isArray(pd.lineItems)) {
        for (const item of pd.lineItems) {
          if (item.csiCode) {
            const cellKey = `${item.csiCode}::${subId}`;
            bidCells[cellKey] = {
              amount: item.amount || 0,
              note: item.description || '',
            };
            if (!linkedSubs[linkedSubs.length - 1].subKeys.includes(item.csiCode)) {
              linkedSubs[linkedSubs.length - 1].subKeys.push(item.csiCode);
            }
          }
        }
      }

      // Set total bid
      if (pd.totalBid) {
        bidTotals[subId] = pd.totalBid;
      }
    }

    return { linkedSubs, bidCells, bidTotals };
  },
}));
