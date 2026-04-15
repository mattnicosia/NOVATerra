// ============================================================
// Living Proposal Store
// Manages creation, publishing, and analytics for living proposals
// ============================================================

import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { buildProposalSnapshot } from "@/utils/proposalSnapshot";

const API_BASE = "";

async function authFetch(url, options = {}) {
  // Always get a fresh token from Supabase (handles auto-refresh)
  let token = null;
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token;
  }
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  return res;
}

export const useLivingProposalStore = create((set, get) => ({
  // State
  proposals: [],       // Living proposals for current user
  loading: false,
  publishing: false,
  creating: false,
  error: null,
  analytics: null,     // Analytics for selected proposal

  // ── Create a new living proposal ─────────────────────────
  create: async ({
    estimateId,
    projectName,
    projectAddress,
    gcCompanyName,
    gcLogoUrl,
    gcAccentColor,
    gcPhone,
    gcEmail,
    ownerName,
    ownerEmail,
    ownerContactName,
    validDays,
    orgId,
  }) => {
    set({ creating: true, error: null });
    try {
      const res = await authFetch(`${API_BASE}/api/living-proposal-create`, {
        method: "POST",
        body: JSON.stringify({
          estimateId,
          projectName,
          projectAddress,
          gcCompanyName,
          gcLogoUrl,
          gcAccentColor,
          gcPhone,
          gcEmail,
          ownerName,
          ownerEmail,
          ownerContactName,
          validDays,
          orgId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create");

      set(s => ({
        creating: false,
        proposals: [...s.proposals, data.proposal],
      }));

      return data;
    } catch (err) {
      set({ creating: false, error: err.message });
      throw err;
    }
  },

  // ── Publish a new version ────────────────────────────────
  publish: async (livingProposalId, changeSummary) => {
    set({ publishing: true, error: null });
    try {
      const { snapshotData, grandTotal, directCost, divisionTotals } = buildProposalSnapshot();

      const res = await authFetch(`${API_BASE}/api/living-proposal-publish`, {
        method: "POST",
        body: JSON.stringify({
          livingProposalId,
          snapshotData,
          grandTotal,
          directCost,
          divisionTotals,
          changeSummary,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to publish");

      // Update local state
      set(s => ({
        publishing: false,
        proposals: s.proposals.map(p =>
          p.id === livingProposalId
            ? { ...p, version_count: (p.version_count || 0) + 1, status: "published" }
            : p,
        ),
      }));

      return data;
    } catch (err) {
      set({ publishing: false, error: err.message });
      throw err;
    }
  },

  // ── Fetch analytics ──────────────────────────────────────
  fetchAnalytics: async (livingProposalId) => {
    try {
      const res = await authFetch(`${API_BASE}/api/living-proposal-analytics?id=${livingProposalId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      set({ analytics: data });
      return data;
    } catch (err) {
      console.error("[livingProposalStore] Analytics fetch error:", err);
      return null;
    }
  },

  // ── Get proposal for current estimate ────────────────────
  getForEstimate: (estimateId) => {
    return get().proposals.find(p => p.estimate_id === estimateId);
  },

  // ── Clear error ──────────────────────────────────────────
  clearError: () => set({ error: null }),
}));
